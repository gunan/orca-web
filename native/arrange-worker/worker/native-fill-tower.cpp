// SPDX-License-Identifier: AGPL-3.0-only
// GLCanvas3D::get_wipe_tower_info and GUI::WipeTower::get_arrange_polygon,
// pinned OrcaSlicer 2.4.2. Fill's obstacle intentionally ignores tower rotation.
#include "native-fill-tower.hpp"
#include "native-prime-tower.hpp"
#include "input-validation.hpp"
#include "libslic3r/GCode/WipeTower.hpp"
using namespace Slic3r;
using json=nlohmann::json;

std::optional<arrangement::ArrangePolygon> native_fill_tower(
    const json& request,const DynamicPrintConfig& config,int index,
    const Vec2d& plate_size,const Vec2d& origin) {
    using arrangement_input::require;
    const json preview=native_prime_tower(request);
    const auto& request_origin=request.at("plate").at("origin");
    for(int axis=0;axis<2;axis++)require(std::abs(request_origin[axis].get<double>()-origin[axis])<1e-7,"Fill tower plate origin differs from selected plate");
    if(!preview.at("visible").get<bool>())return {};
    const auto& size=preview.at("size");
    // Native GLVolume::bounding_box returns its untransformed shell model box,
    // not the colored bands, rotation, plate origin or world-space bounds.
    const auto shell=make_cube(size[0].get<float>(),size[1].get<float>(),size[2].get<float>());
    const BoundingBoxf3 box=shell.bounding_box();
    BoundingBoxf footprint(to_2d(box.min),to_2d(box.max));
    float brim=config.opt_float("prime_tower_brim_width");
    require(std::isfinite(brim)&&std::abs(brim)<=1e6,"Invalid native Fill tower brim width");
    if(brim<0)brim=WipeTower::get_auto_brim_by_height(float(box.max.z()));
    footprint.offset(brim);
    footprint.offset(brim); // Two original source offsets, not one.
    // std::clamp has an invalid range when an oversized native tower cannot fit.
    // Reject that undefined native case instead of manufacturing a placement.
    require((footprint.size().array()<=plate_size.array()).all(),"Prime tower with its native Fill brim exceeds the plate");
    const auto* xs=config.option<ConfigOptionFloats>("wipe_tower_x");
    const auto* ys=config.option<ConfigOptionFloats>("wipe_tower_y");
    require(xs&&ys&&!xs->values.empty()&&!ys->values.empty(),"Native Fill tower placement is missing");
    Vec2d position(xs->get_at(index),ys->get_at(index));
    require(position.allFinite()&&position.cwiseAbs().maxCoeff()<=1e6,"Invalid native Fill tower position");
    position.x()=std::clamp(position.x(),0.,plate_size.x()-footprint.size().x());
    position.y()=std::clamp(position.y(),0.,plate_size.y()-footprint.size().y());
    arrangement::ArrangePolygon result;
    result.poly.contour=Polygon({scaled(footprint.min),{scaled(footprint.max.x()),scaled(footprint.min.y())},scaled(footprint.max),{scaled(footprint.min.x()),scaled(footprint.max.y())}});
    result.translation=scaled(position);
    result.rotation=0.;result.name="WipeTower";
    result.is_virt_object=true;result.is_wipe_tower=true;
    ++result.priority;result.bed_idx=0;result.setter=nullptr;
    return result;
}
json fill_tower_diagnostic(const arrangement::ArrangePolygon& tower) {
    json polygon=json::array();
    for(const auto& point:tower.poly.contour.points)polygon.push_back({point.x(),point.y()});
    return {{"polygon",polygon},{"translation",{tower.translation.x(),tower.translation.y()}},
        {"rotation",tower.rotation},{"bedIndex",tower.bed_idx},{"priority",tower.priority},
        {"isVirtual",tower.is_virt_object},{"isWipeTower",tower.is_wipe_tower}};
}
