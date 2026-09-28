// SPDX-License-Identifier: AGPL-3.0-only
// Independent test entry point: native primitives and original Arrange/ModelArrange
// functions. No production arrangement adapter, request parser, or helper is used.
#include "libslic3r/Model.hpp"
#include "libslic3r/ModelArrange.hpp"
#include <nlohmann/json.hpp>
#include <iostream>
using namespace Slic3r;using namespace Slic3r::arrangement;using json=nlohmann::json;
json mat(const Transform3d&t){json r=json::array();for(int i=0;i<16;++i)r.push_back(t.data()[i]);return r;}
json geometry(const indexed_triangle_set&mesh){json r={{"vertices",json::array()},{"triangles",json::array()}};for(auto&v:mesh.vertices)r["vertices"].push_back({v.x(),v.y(),v.z()});for(auto&f:mesh.indices)r["triangles"].push_back({f.x(),f.y(),f.z()});return r;}
int main(){json output=json::array();for(const std::string name:{"fixed-selection","spacing-7.5","spacing-30","normal-support","tree-support","sequential-short","sequential-tall","gui-y-alignment","rotation-enabled","excluded-center","wrapping-concave","skirt-explicit-width"}){
 auto config=DynamicPrintConfig::full_print_config();json settings=json::object();
 const auto set=[&](const char* key,const std::string& value){config.set_deserialize_strict(key,value);settings[key]=value;};
 set("printable_area","0x0,250x0,250x210,0x210");set("printable_height","220");set("nozzle_diameter","0.4");set("nozzle_height","2.5");set("extruder_clearance_radius","65");set("extruder_clearance_height_to_rod","36");set("extruder_clearance_height_to_lid","140");set("enable_prime_tower","0");set("enable_support","0");set("skirt_loops","0");set("filament_type","PLA");set("support_filament","0");set("support_interface_filament","0");
 if(name=="normal-support"){set("enable_support","1");set("support_type","normal(auto)");}
 if(name=="tree-support"){set("enable_support","1");set("support_type","tree(auto)");}
 if(name=="skirt-explicit-width"){set("skirt_loops","3");set("skirt_distance","6");set("skirt_type","combined");set("skirt_height","1");set("initial_layer_line_width","0.48");}
 ArrangeParams params;params.clearance_radius=65;params.clearance_height_to_rod=36;params.clearance_height_to_lid=140;params.nozzle_height=2.5;params.printable_height=220;params.allow_rotations=name=="rotation-enabled";params.align_to_y_axis=name=="gui-y-alignment";params.allow_multi_materials_on_same_plate=true;params.align_center=config.opt<ConfigOptionPoint>("best_object_pos")->value;
 params.min_obj_distance=scaled(name=="spacing-7.5"?7.5:name=="spacing-30"?30.:0.);params.is_seq_print=name=="sequential-short"||name=="sequential-tall";if(params.is_seq_print){params.bed_shrink_x=BED_SHRINK_SEQ_PRINT;params.bed_shrink_y=BED_SHRINK_SEQ_PRINT;}
 Model model;ArrangePolygons selected,unselected;json objects=json::array();
 for(int i=0;i<3;++i){auto*o=model.add_object();o->name=std::string(1,'A'+i);const auto mesh=its_make_cube(i==1?29:20,20,name=="sequential-short"?1.2:20.);auto*v=o->add_volume(TriangleMesh(mesh));auto*inst=o->add_instance();inst->set_offset(Vec3d(i==2?110:50+i*25,i==2?90:50,0));if(name=="gui-y-alignment"||name=="rotation-enabled")inst->set_rotation(Vec3d(0,0,(i==0?35:i==1?-20:80)*M_PI/180.));o->config.set_key_value("extruder",new ConfigOptionInt(1));auto ap=get_instance_arrange_poly(inst,config);ap.itemid=i;bool chosen=name!="fixed-selection"||i<2;json part=geometry(mesh);part["type"]="normal_part";part["matrix"]=mat(Transform3d::Identity());part["settings"]={{"extruder","1"}};objects.push_back({{"id",o->name},{"selected",chosen},{"matrix",mat(inst->get_matrix())},{"settings",{{"extruder","1"}}},{"parts",{part}}});(chosen?selected:unselected).push_back(std::move(ap));}
 if(name=="excluded-center"||name=="wrapping-concave"){
  Points pts=name=="excluded-center"?Points{{scaled(95.),scaled(75.)},{scaled(150.),scaled(75.)},{scaled(150.),scaled(135.)},{scaled(95.),scaled(135.)}}:Points{{scaled(95.),scaled(75.)},{scaled(150.),scaled(75.)},{scaled(150.),scaled(95.)},{scaled(115.),scaled(95.)},{scaled(115.),scaled(135.)},{scaled(95.),scaled(135.)}};
  std::string serialized;for(auto&p:pts){if(!serialized.empty())serialized+=",";serialized+=std::to_string(unscaled<double>(p.x()))+"x"+std::to_string(unscaled<double>(p.y()));}
  set(name=="excluded-center"?"bed_exclude_area":"wrapping_exclude_area",serialized);if(name=="wrapping-concave")set("enable_wrapping_detection","1");
  for(int i=0;i<36;++i){ArrangePolygon ap;ap.poly.contour=Polygon(pts);ap.bed_idx=i;ap.is_virt_object=true;ap.height=1;ap.name=name=="excluded-center"?"ExcludedRegion0":"WrappingRegion";unselected.push_back(ap);if(i==0){ap.inflation=scaled(1.);params.excluded_regions.push_back(ap);}}
 }
 const json options={{"spacing",unscaled<double>(params.min_obj_distance)},{"rotation",params.allow_rotations},{"multipleMaterials",true},{"alignY",params.align_to_y_axis},{"sequential",params.is_seq_print}};
 update_arrange_params(params,&config,selected);update_selected_items_inflation(selected,&config,params);update_unselected_items_inflation(unselected,&config,params);update_selected_items_axis_align(selected,&config,params);auto bed=get_shrink_bedpts(&config,params);params.progressind=[](unsigned,std::string){};arrange(selected,unselected,bed,params);json expected=json::array();for(auto&ap:selected){ap.apply();auto*o=*std::find_if(model.objects.begin(),model.objects.end(),[&](auto*o){return o->name==ap.name;});expected.push_back({{"id",ap.name},{"bedIndex",ap.bed_idx},{"rotation",ap.rotation},{"translation",{unscaled<double>(ap.translation.x()),unscaled<double>(ap.translation.y())}},{"height",ap.height},{"inflation",unscaled<double>(ap.inflation)},{"matrix",mat(o->instances.front()->get_matrix())}});}
 output.push_back({{"name",name},{"settings",settings},{"options",options},{"objects",objects},{"expected",expected},{"parameters",{{"minimumDistance",unscaled<double>(params.min_obj_distance)},{"bedShrink",{params.bed_shrink_x,params.bed_shrink_y}}}}});
 }std::cout<<output.dump(2)<<'\n';}
