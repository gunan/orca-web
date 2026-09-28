// SPDX-License-Identifier: AGPL-3.0-only
#include "native-prime-tower.hpp"
#include "native-plate.hpp"
#include "native-tower-input.hpp"
#include "input-validation.hpp"
#include "libslic3r/Model.hpp"
#include <set>
using namespace Slic3r;
using json=nlohmann::json;
namespace {
using arrangement_input::require;
Transform3d frame(const json& value) {
    arrangement_input::matrix(value);
    Transform3d result=Transform3d::Identity();
    if(!value.is_null())for(int i=0;i<16;++i)result.matrix().data()[i]=value.at(i).get<double>();
    return result;
}
int count(const json& value,int max) {
    require(value.is_number_integer(),"Prime tower count must be integral");
    return int(arrangement_input::number(value,0,max));
}
const std::set<std::string> keys={"enable_prime_tower","print_sequence","timelapse_type","enable_wrapping_detection","layer_height","prime_tower_width","prime_volume","prime_tower_infill_gap","wipe_tower_wall_type","wipe_tower_rib_width","wipe_tower_extra_rib_length","filament_change_length","filament_diameter","nozzle_diameter"};
void config_values(DynamicPrintConfig& config,const json& values) {
    arrangement_input::config(values);
    ConfigSubstitutionContext substitutions(ForwardCompatibilitySubstitutionRule::Disable);
    for(const auto& kv:values.items()) {
        require(keys.count(kv.key()),"Unsupported prime tower setting");
        std::string serialized;
        if(kv.value().is_array())for(const auto& value:kv.value()) {
            if(!serialized.empty())serialized+=",";
            serialized+=value.get<std::string>();
        } else serialized=kv.value().get<std::string>();
        config.set_deserialize(kv.key(),serialized,substitutions);
    }
    for(const auto* key:{"layer_height","prime_tower_width","prime_volume","prime_tower_infill_gap","wipe_tower_rib_width","wipe_tower_extra_rib_length"}) {
        const double value=config.option(key)->getFloat();
        require(std::isfinite(value)&&value>=(std::string(key)=="wipe_tower_extra_rib_length"?-1e6:0)&&value<=1e6,"Prime tower setting exceeds numeric bounds");
    }
    require(config.opt_float("layer_height")>0&&config.opt_float("prime_tower_width")>0,"Prime tower layer height and width must be positive");
    for(const auto* key:{"filament_change_length","filament_diameter","nozzle_diameter"}) {
        const auto* values=config.option<ConfigOptionFloats>(key);
        require(values&&!values->values.empty()&&values->values.size()<=256,"Invalid prime tower vector");
        for(double value:values->values)require(std::isfinite(value)&&value>=0&&value<=1e6,"Prime tower vector exceeds numeric bounds");
    }
}
}

json native_prime_tower(const json& request) {
    require(request.is_object()&&request.value("format",std::string())=="orca-prime-tower-request"&&request.value("version",0)==1&&request.value("sourceRevision",std::string())=="8500fcdccaa10b5099ac20d252af3a7c560046f1"&&request.value("operation",std::string())=="prime-tower-preview","Invalid prime tower request identity");
    auto config=DynamicPrintConfig::full_print_config();config_values(config,request.at("settings"));
    const int filamentCount=count(request.at("filamentCount"),256);require(filamentCount>0,"Prime tower needs a filament palette");
    const auto plateId=native_tower_input::text(request.at("plateId"));
    // Association is supplied by the trusted project adapter. Native geometry
    // computes outside state before any visibility, tool or size decision.
    Model model;NativeTowerPlate membership;membership.m_model=&model;membership.m_config=config;
    native_tower_input::assignments(membership.m_config,request.value("assignments",json::object()));
    membership.m_project_config.set_key_value("filament_colour",new ConfigOptionStrings(std::vector<std::string>(filamentCount,"#808080")));
    native_tower_input::plate(membership,request.at("plate"));
    BuildVolume buildVolume(membership.m_shape,membership.m_height,membership.m_extruder_areas,membership.m_extruder_heights);NativeTowerPlater plater{&buildVolume};membership.m_plater=&plater;
    std::vector<bool> contained;size_t vertices=0,triangles=0,instances=0,parts=0,paintBudget=0;std::set<std::string> ids;
    const auto& objects=request.at("objects");require(objects.is_array()&&objects.size()<=256,"Prime tower supports at most 256 native object families");
    for(const auto& source:objects) {
        const auto name=source.at("id").get<std::string>();require(!name.empty()&&name.size()<=256&&name.find('\0')==std::string::npos&&ids.insert(name).second,"Invalid prime tower object identity");

        auto* object=model.add_object();object->name=name;native_tower_input::assignments(object->config,source.value("settings",json::object()));bool normal=false;
        const auto& volumes=source.at("parts");require(volumes.is_array()&&!volumes.empty()&&(parts+=volumes.size())<=4096,"Prime tower part count exceeds bounds");
        for(const auto& part:volumes) {
            const auto type=part.value("type",std::string("normal_part"));require(type=="normal_part"||type=="negative_part"||type=="modifier_part"||type=="support_enforcer"||type=="support_blocker","Invalid prime tower part role");normal|=type=="normal_part";
            const auto& points=part.at("vertices"),faces=part.at("triangles");require(points.is_array()&&faces.is_array()&&!points.empty()&&!faces.empty()&&(vertices+=points.size())<=500000&&(triangles+=faces.size())<=500000,"Prime tower geometry exceeds bounds");indexed_triangle_set mesh;
            for(const auto& point:points) {require(point.is_array()&&point.size()==3,"Invalid prime tower vertex");mesh.vertices.emplace_back(float(arrangement_input::number(point[0],-1e6,1e6)),float(arrangement_input::number(point[1],-1e6,1e6)),float(arrangement_input::number(point[2],-1e6,1e6)));}
            for(const auto& face:faces) {require(face.is_array()&&face.size()==3,"Invalid prime tower triangle");for(const auto& index:face)require(index.is_number_integer()&&index.get<int64_t>()>=0&&uint64_t(index.get<int64_t>())<mesh.vertices.size(),"Invalid prime tower triangle index");mesh.indices.emplace_back(face[0].get<int>(),face[1].get<int>(),face[2].get<int>());}
            auto* volume=object->add_volume(TriangleMesh(std::move(mesh)));volume->set_type(ModelVolume::type_from_string(type));volume->set_transformation(frame(part.value("matrix",json()))*volume->get_matrix());
            native_tower_input::assignments(volume->config,part.value("settings",json::object()));
            native_tower_input::painting(*volume,part.value("color",json::object()),faces.size(),filamentCount,paintBudget);

        }
        require(normal,"Prime tower object needs a normal part");const auto& placements=source.at("instances");require(placements.is_array()&&!placements.empty()&&(instances+=placements.size())<=10000,"Prime tower instance count exceeds bounds");
        const auto ranges=source.value("ranges",json::array());require(ranges.is_array()&&ranges.size()<=1024,"Too many native tower height ranges");
        for(size_t i=0;i<ranges.size();i++)native_tower_input::assignments(object->layer_config_ranges[{double(i),double(i+1)}],ranges[i]);
        for(size_t i=0;i<placements.size();i++){const auto& placement=placements[i];require(placement.at("printable").is_boolean(),"Invalid native tower printable flag");auto* instance=object->add_instance();instance->set_transformation(Geometry::Transformation(frame(placement.at("matrix"))));instance->printable=placement.at("printable");if(native_tower_input::text(placement.at("plateId"))==plateId)membership.obj_to_instance_set.insert({int(model.objects.size()-1),int(i)});}

    }
    for(const auto& pair:membership.obj_to_instance_set)if(membership.check_outside(pair.first,pair.second))membership.instance_outside_set.insert(pair);
    for(size_t i=0;i<model.objects.size();i++)contained.push_back(membership.contain_instance_totally(int(i),0));
    const auto events=request.value("events",json::array());require(events.is_array()&&events.size()<=10000,"Too many native tower tool events");for(const auto& event:events){require(event.value("type",std::string())=="ToolChange","Unexpected native tower event");CustomGCode::Item item{};item.type=CustomGCode::ToolChange;item.extruder=count(event.at("extruder"),256);model.plates_custom_gcodes[0].gcodes.push_back(item);}
    const auto extruders=membership.get_extruders(true);for(int extruder:extruders)require(extruder>=1&&extruder<=filamentCount,"Native tower tool assignment exceeds the palette");
    const bool needed=config.opt_enum<TimelapseType>("timelapse_type")==tlSmooth||config.opt_bool("enable_wrapping_detection"),sequential=config.opt_enum<PrintSequence>("print_sequence")==PrintSequence::ByObject;
    const int printableCount=membership.printable_instance_size();
    json output={{"format","orca-native-prime-tower"},{"version",1},{"sourceRevision","8500fcdccaa10b5099ac20d252af3a7c560046f1"},{"plateId",plateId},{"visible",false},{"extruders",extruders},{"size",nullptr},{"alpha",double(.66f)},{"containedFirstInstances",contained},{"printableInstanceCount",printableCount}};
    const auto& placement=request.at("placement");require(placement.is_array()&&placement.size()==3,"Invalid tower placement");
    const float x=float(arrangement_input::number(placement[0],-1e6,1e6)),y=float(arrangement_input::number(placement[1],-1e6,1e6)),angle=float(arrangement_input::number(placement[2],-1e6,1e6));
    output["position"]={double(float(x+membership.m_origin.x()))-membership.m_origin.x(),double(float(y+membership.m_origin.y()))-membership.m_origin.y()};output["rotation"]=(M_PI/180.)*angle;
    if(!config.opt_bool("enable_prime_tower")||(!needed&&filamentCount<=1)||(sequential&&printableCount!=1)||(!needed&&extruders.size()<2)||membership.obj_to_instance_set.empty()||extruders.empty())return output;
    NativeArrangePrint print;print.m_config.apply(config,true);
    NativeArrangePlate plate{&model,&print,0,0};plate.containment=std::move(contained);plate.explicit_extruders=extruders;plate.use_explicit_extruders=true;
    // GLCanvas3D first narrows w/v to float, then calls the exact native estimator.
    const float width=float(config.opt_float("prime_tower_width")),volume=float(config.opt_float("prime_volume"));
    const Vec3d size=plate.estimate_wipe_tower_size(config,width,volume,int(print.config().nozzle_diameter.size()),0,false,config.opt_bool("enable_wrapping_detection"));
    require(size.allFinite()&&(size.array()>=0).all()&&size.maxCoeff()<=1e6,"Native prime tower dimensions exceed bounds");
    // load_wipe_tower_preview receives float dimensions, suppresses tiny depth,
    // and uses 0.1 mm for a zero-height shell. It does not add the brim geometry.
    const float depth=float(size.y());if(depth<.01f)return output;
    output["visible"]=true;output["estimatedSize"]={size.x(),size.y(),size.z()};
    output["size"]={double(float(size.x())),double(depth),double(float(size.z())==0.f?.1f:float(size.z()))};
    if(request.contains("dragContext")) {
        // Selection::translate uses the original shared build-volume bounds,
        // unrotated shell box and float brim width before scaled containment.
        const auto bounds=membership.get_build_volume(true);
        const float brim=float(arrangement_input::number(request.at("dragContext").at("brimWidth"),0,1000));
        output["dragContext"]={{"version",1},{"space","native-world"},{"origin",{membership.m_origin.x(),membership.m_origin.y()}},
          {"plateBounds",{{bounds.min.x(),bounds.min.y()},{bounds.max.x(),bounds.max.y()}}},{"margin",double(brim)+.5},{"scalingFactor",SCALING_FACTOR}};
    }
    return output;
}
