// SPDX-License-Identifier: AGPL-3.0-only
#include "native-import-inspection.hpp"
#include "input-validation.hpp"
#include "libslic3r/Model.hpp"
#include <set>
using namespace Slic3r;
using json = nlohmann::json;
namespace {
using arrangement_input::require;
std::string identity(const json& value) {
    require(value.is_string(), "Invalid import model identity");
    const auto text = value.get<std::string>();
    require(!text.empty() && text.size() <= 256 && text.find('\0') == std::string::npos, "Invalid import model identity");
    return text;
}
Transform3d frame(const json& values) {
    arrangement_input::matrix(values);
    Transform3d result;
    for (int i = 0; i < 16; ++i) result.matrix().data()[i] = values.at(i).get<double>();
    require(result.linear().cwiseAbs().maxCoeff() <= 10000 && result.translation().cwiseAbs().maxCoeff() <= 1e7, "Import transform exceeds bounds");
    return result;
}
uint64_t integer(const json& value) {
    require(value.is_string(), "Native cut identity must be a decimal string");
    const auto text = value.get<std::string>();
    require(!text.empty() && text.size() <= 20 && text.find_first_not_of("0123456789") == std::string::npos, "Invalid native cut identity");
    size_t read = 0; const auto result = std::stoull(text, &read);
    require(read == text.size(), "Invalid native cut identity"); return result;
}
}
json native_import_inspection(const json& request) {
    require(request.is_object() && request.value("format", std::string()) == "orca-import-inspection-request" && request.value("version", 0) == 1 && request.value("sourceRevision", std::string()) == "8500fcdccaa10b5099ac20d252af3a7c560046f1" && request.value("operation", std::string()) == "inspect-import", "Invalid import inspection identity");
    const auto& objects = request.at("objects");
    require(objects.is_array() && !objects.empty() && objects.size() <= 256, "Import inspection requires 1–256 models");
    Model model; size_t vertices = 0, triangles = 0, instances = 0; std::set<std::string> ids; json before = json::array();
    for (const auto& original : objects) {
        auto* object = model.add_object(); object->name = identity(original.at("id"));
        require(ids.insert(object->name).second, "Duplicate import model identity");
        const auto& parts = original.at("parts");
        require(parts.is_array() && !parts.empty() && parts.size() <= 4096, "Invalid import part count");
        for (const auto& part : parts) {
            const auto type = part.at("type").get<std::string>();
            require(type == "normal_part" || type == "negative_part" || type == "modifier_part" || type == "support_blocker" || type == "support_enforcer", "Invalid imported volume role");
            const auto& points = part.at("vertices"); const auto& faces = part.at("triangles");
            require(points.is_array() && !points.empty() && faces.is_array() && !faces.empty() && (vertices += points.size()) <= 500000 && (triangles += faces.size()) <= 500000, "Import inspection exceeds 500000 vertices/triangles");
            indexed_triangle_set mesh;
            for (const auto& point : points) {
                require(point.is_array() && point.size() == 3, "Invalid imported vertex");
                mesh.vertices.emplace_back(float(arrangement_input::number(point[0], -1e7, 1e7)), float(arrangement_input::number(point[1], -1e7, 1e7)), float(arrangement_input::number(point[2], -1e7, 1e7)));
            }
            for (const auto& face : faces) {
                require(face.is_array() && face.size() == 3, "Invalid imported face");
                for (const auto& i : face) require(i.is_number_integer() && i.get<int64_t>() >= 0 && uint64_t(i.get<int64_t>()) < mesh.vertices.size(), "Invalid imported triangle index");
                mesh.indices.emplace_back(face[0].get<int>(), face[1].get<int>(), face[2].get<int>());
            }
            auto* volume = object->add_volume(TriangleMesh(std::move(mesh)));
            volume->set_type(ModelVolume::type_from_string(type));
            volume->set_transformation(Geometry::Transformation(frame(part.at("matrix"))));
        }
        const auto& inputInstances = original.at("instances");
        require(inputInstances.is_array() && !inputInstances.empty() && (instances += inputInstances.size()) <= 10000, "Invalid import instance count");
        for (const auto& value : inputInstances) object->add_instance()->set_transformation(Geometry::Transformation(frame(value)));
        if (original.contains("cutId") && !original.at("cutId").is_null()) {
            const auto& cut = original.at("cutId");
            object->cut_id = CutObjectBase(ObjectID(integer(cut.at("id"))), integer(cut.at("checkSum")), integer(cut.at("connectorsCount")));
        }
        const double volume = object->get_object_stl_stats().volume;
        require(std::isfinite(volume), "Native imported model has a nonfinite volume");
        before.push_back({{"id", object->name}, {"volume", volume}});
    }
    const int removed = model.removed_objects_with_zero_volume();
    json retained = json::array(); for (const auto* object : model.objects) retained.push_back(object->name);
    return {{"format", "orca-native-import-inspection"}, {"version", 1}, {"sourceRevision", "8500fcdccaa10b5099ac20d252af3a7c560046f1"}, {"objects", before}, {"retainedIds", retained}, {"removedCount", removed}, {"unitSuggestion", model.looks_like_saved_in_meters() ? "meters" : model.looks_like_imperial_units() ? "inches" : "none"}};
}
