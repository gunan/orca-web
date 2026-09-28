// SPDX-License-Identifier: AGPL-3.0-only
#pragma once
#include "native-tower-plate.hpp"
#include "input-validation.hpp"
namespace native_tower_input {
using namespace Slic3r;
using json=nlohmann::json;
using arrangement_input::require;
inline std::string text(const json& value){require(value.is_string(),"Invalid tower identity");const auto result=value.get<std::string>();require(!result.empty()&&result.size()<=256&&result.find('\0')==std::string::npos,"Invalid tower identity bounds");return result;}
inline Pointfs points(const json& values,bool empty=false){require(values.is_array()&&values.size()<=1024&&(empty||values.size()>=3),"Invalid tower plate points");Pointfs result;for(const auto& p:values){require(p.is_array()&&p.size()==2,"Invalid tower plate point");result.emplace_back(arrangement_input::number(p[0],-1e6,1e6),arrangement_input::number(p[1],-1e6,1e6));}return result;}
const std::set<std::string> assignmentKeys={"extruder","enable_support","raft_layers","support_filament","support_interface_filament","outer_wall_filament_id","inner_wall_filament_id","sparse_infill_filament_id","internal_solid_filament_id","top_surface_filament_id","bottom_surface_filament_id"};
template<class Config>void assignments(Config& config,const json& values){
 require(values.is_object()&&values.size()<=assignmentKeys.size(),"Invalid tower assignment settings");ConfigSubstitutionContext substitutions(ForwardCompatibilitySubstitutionRule::Disable);
 for(const auto& kv:values.items()){require(assignmentKeys.count(kv.key())&&kv.value().is_string(),"Invalid tower assignment option");const auto value=kv.value().get<std::string>();require(!value.empty()&&value.size()<=10&&value.find_first_not_of("0123456789")==std::string::npos,"Invalid tower assignment value");const auto n=std::stoul(value);require(n<=2147483647&&(kv.key()!="enable_support"||n<=1),"Tower assignment exceeds bounds");config.set_deserialize(kv.key(),value,substitutions);}
}
inline void painting(ModelVolume& volume,const json& colors,size_t faces,int filament_count,size_t& budget){
 require(colors.is_object()&&colors.size()<=faces,"Invalid native tower color map");std::map<int,std::string> ordered;
 for(const auto& item:colors.items()){
  const auto& key=item.key();require(!key.empty()&&key.size()<=7&&key.find_first_not_of("0123456789")==std::string::npos&&std::stoul(key)<faces&&item.value().is_string(),"Invalid native tower paint index");
  const auto code=item.value().get<std::string>();require(!code.empty()&&code.size()<=131072&&code.find_first_not_of("0123456789ABCDEF")==std::string::npos,"Invalid native tower paint encoding");
  int cursor=int(code.size())-1;auto nibble=[&](){require(cursor>=0,"Truncated native tower paint tree");char c=code[cursor--];return c<='9'?c-'0':c-'A'+10;};
  std::function<void(int)> visit=[&](int depth){require(depth<=24&&++budget<=2000000,"Native tower painting exceeds bounds");int value=nibble(),split=value&3,side=value>>2;if(!split){int state=side==3?nibble()+3:side;require(state<=std::min(16,filament_count),"Native tower paint exceeds palette");}else{require(side<=2&&(split!=3||side==0),"Invalid native tower paint split");for(int i=0;i<=split;i++)visit(depth+1);}};visit(0);require(cursor==-1,"Trailing native tower paint data");
  require(ordered.emplace(std::stoi(key),code).second,"Duplicate native tower paint facet");
 }
 for(const auto& item:ordered)volume.mmu_segmentation_facets.set_triangle_from_string(item.first,item.second);
 // Same invalidation as the native 3MF loader after deserializing facet data.
 volume.mmu_segmentation_facets.touch();
}
inline void plate(NativeTowerPlate& plate,const json& input){
 require(input.is_object(),"Native tower plate is required");plate.m_shape=points(input.at("shape"));require(Polygon::new_scale(plate.m_shape).area()>0,"Native tower plate winding or area is invalid");plate.m_height=arrangement_input::number(input.at("height"),.001,1e6);
 const auto& origin=input.at("origin");require(origin.is_array()&&origin.size()==3,"Invalid native tower plate origin");for(int i=0;i<3;i++)plate.m_origin[i]=arrangement_input::number(origin[i],-1e6,1e6);require(plate.m_origin.z()==0,"Native plate origin must be on the workspace plane");
 for(const auto& p:plate.m_shape)plate.m_bounding_box.merge({p.x(),p.y(),0.});require(plate.m_bounding_box.size().x()>0&&plate.m_bounding_box.size().y()>0,"Native tower plate area is empty");
 const auto excluded=points(input.value("excluded",json::array()),true);
 for(size_t i=0;i+3<excluded.size();i+=4){BoundingBoxf3 box;for(size_t j=i;j<i+4;j++)box.merge({excluded[j].x(),excluded[j].y(),0.});box.max.z()=int(plate.m_bounding_box.size().y());box.min.z()=double(-.03f);plate.m_exclude_bounding_box.push_back(box);}
 const auto areas=input.value("extruderAreas",json::array()),heights=input.value("extruderHeights",json::array());require(areas.is_array()&&areas.size()<=256&&heights.is_array()&&heights.size()<=256&&heights.size()>=areas.size(),"Invalid native extruder plate areas");
 for(const auto& a:areas)plate.m_extruder_areas.push_back(points(a));for(const auto& h:heights)plate.m_extruder_heights.push_back(h.is_null()?std::numeric_limits<double>::quiet_NaN():arrangement_input::number(h,0,1e6));
}
}
