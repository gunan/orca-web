// SPDX-License-Identifier: AGPL-3.0-only
#pragma once
#include "libslic3r/ModelArrange.hpp"
#include "libslic3r/Flow.hpp"
#include "libslic3r/GCode/WipeTower.hpp"
namespace Slic3r {
struct NativeArrangeObject {
 PrintObjectConfig object_config;
 double object_height;
 const PrintObjectConfig& config()const{return object_config;}
 coord_t height()const{return scaled(object_height);}
};
struct NativeArrangePrint {
 PrintConfig m_config;
 std::vector<NativeArrangeObject*> m_objects;
 const PrintConfig& config()const{return m_config;}
 bool is_all_objects_are_short()const{return std::all_of(m_objects.begin(),m_objects.end(),[&](const NativeArrangeObject* obj){return obj->height()<scale_(config().nozzle_height.value);});}
 double skirt_first_layer_height()const;
 Flow skirt_flow()const;
 std::tuple<float,float> object_skirt_offset(double margin_height=0)const;
};
struct NativeArrangePlate {
 const Model* m_model;
 const NativeArrangePrint* m_print;
 int m_width,m_depth;
 std::vector<bool> containment;
 std::vector<int> explicit_extruders;
 bool use_explicit_extruders=false;
 bool contain_instance_totally(int object,int)const{return containment.empty()||containment.at(object);}
 std::vector<int> get_extruders(bool)const {if(use_explicit_extruders)return explicit_extruders;std::set<int> values;for(const auto* object:m_model->objects)for(const auto* volume:object->volumes)if(volume->is_model_part()){const auto ids=volume->get_extruders();values.insert(ids.begin(),ids.end());}return{values.begin(),values.end()};}
 Vec3d estimate_wipe_tower_size(const DynamicPrintConfig&,double,double,int,int,bool,bool)const;
 arrangement::ArrangePolygon estimate_wipe_tower_polygon(const DynamicPrintConfig&,int,Vec3d&,Vec3d&,int,int,bool)const;
};
}
