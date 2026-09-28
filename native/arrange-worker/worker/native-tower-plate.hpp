// SPDX-License-Identifier: AGPL-3.0-only
#pragma once
#include "libslic3r/Model.hpp"
#include "libslic3r/BuildVolume.hpp"
#include "libslic3r/ClipperUtils.hpp"
#include <set>
namespace Slic3r {
// The desktop's application/configuration providers are replaced with explicit,
// request-owned state; original PartPlate arithmetic is generated unchanged.
struct NativeTowerPlater {
 const BuildVolume* volume;
 const BuildVolume& build_volume()const{return *volume;}
};
struct NativeTowerPlate {
 Model* m_model;
 DynamicPrintConfig m_config,m_project_config;
 NativeTowerPlater* m_plater;
 int m_plate_index=0;
 std::set<std::pair<int,int>> obj_to_instance_set,instance_outside_set;
 Pointfs m_shape;
 std::vector<Pointfs> m_extruder_areas;
 std::vector<double> m_extruder_heights;
 std::vector<BoundingBoxf3> m_exclude_bounding_box;
 BoundingBoxf3 m_bounding_box;
 Vec3d m_origin=Vec3d::Zero();
 double m_height=0;
 const Pointfs& get_shape()const{return m_shape;}
 BoundingBoxf3 get_plate_box(){return get_build_volume();}
 BoundingBoxf3 get_build_volume(bool use_share=false);
 bool contain_instance_totally(int object,int instance)const;
 bool check_outside(int object,int instance,BoundingBoxf3* bounds=nullptr);
 bool check_objects_empty_and_gcode3mf(std::vector<int>&)const{return m_model->objects.empty();}
 std::vector<int> get_extruders(bool custom_gcode)const;
 int printable_instance_size();
};
}
