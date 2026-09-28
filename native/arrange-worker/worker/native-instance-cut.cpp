// SPDX-License-Identifier: AGPL-3.0-only
#include "native-instance-cut.hpp"
#include "input-validation.hpp"
#include "libslic3r/Model.hpp"
#include <set>
using namespace Slic3r;
using namespace Slic3r::Geometry;
using json=nlohmann::json;
// Exact pinned CutUtils.cpp body, extracted after commit/source hash validation.
#include "native-instance-cut-reset.inc"
namespace {
using arrangement_input::require;
Transform3d frame(const json& values){arrangement_input::matrix(values);Transform3d m;for(int i=0;i<16;++i)m.matrix().data()[i]=values.at(i).get<double>();require(m.linear().cwiseAbs().maxCoeff()<=10000&&m.translation().cwiseAbs().maxCoeff()<=1e6,"Cut instance transform exceeds bounds");return m;}
json matrix(const Transform3d& m){json out=json::array();for(int i=0;i<16;++i){require(std::isfinite(m.matrix().data()[i]),"Native Cut produced a nonfinite frame");out.push_back(m.matrix().data()[i]);}return out;}
std::string id(const json& value){require(value.is_string(),"Invalid Cut identity");const auto text=value.get<std::string>();require(!text.empty()&&text.size()<=256&&text.find('\0')==std::string::npos,"Invalid Cut identity");return text;}
bool flag(const json& value,const char* key){require(value.contains(key)&&value.at(key).is_boolean(),"Missing or invalid Cut flag");return value.at(key).get<bool>();}
}
json native_instance_cut(const json& request){
 require(request.is_object()&&request.value("format",std::string())=="orca-instance-cut-request"&&request.value("version",0)==1&&request.value("sourceRevision",std::string())=="8500fcdccaa10b5099ac20d252af3a7c560046f1"&&request.value("operation",std::string())=="instance-cut-frames","Invalid Cut request identity");
 const auto& input=request.at("instances");require(input.is_array()&&!input.empty()&&input.size()<=256,"Cut requires 1–256 instances");const auto selected=id(request.at("selectedInstanceId"));std::set<std::string> identities;size_t selectedIndex=0;bool found=false;
 for(size_t index=0;index<input.size();++index){const auto name=id(input[index].at("id"));require(identities.insert(name).second,"Duplicate Cut instance identity");frame(input[index].at("matrix"));flag(input[index],"autoDrop");flag(input[index],"printable");if(name==selected){selectedIndex=index;found=true;}}
 require(found,"Selected Cut instance is missing");const auto cut=frame(request.at("cutRotation"));require(cut.translation().norm()<1e-12&&(cut.linear().transpose()*cut.linear()-Matrix3d::Identity()).cwiseAbs().maxCoeff()<1e-9&&std::abs(cut.linear().determinant()-1)<1e-9,"Cut rotation must be a proper rigid rotation without translation");
 const auto& results=request.at("results");require(results.is_array()&&!results.empty()&&results.size()<=130,"Invalid Cut result count");size_t triangles=0,vertices=0;std::set<std::string> resultIds;json output=json::array();
 for(const auto& result:results){const auto name=id(result.at("id")),side=result.at("side").get<std::string>();require(resultIds.insert(name).second&&(side=="upper"||side=="lower"||side=="dowel"),"Invalid Cut result identity/side");const bool place=flag(result,"placeOnCut"),flip=flag(result,"flip");require(side!="dowel"||(!place&&!flip),"Dowels do not accept cut-face placement or flip");
  Model model;auto* object=model.add_object();const auto& parts=result.at("parts");require(parts.is_array()&&!parts.empty()&&parts.size()<=4096,"Invalid Cut result parts");bool normal=false;
  for(const auto& part:parts){const auto type=part.value("type",std::string("normal_part"));require(type=="normal_part"||type=="negative_part"||type=="modifier_part"||type=="support_enforcer"||type=="support_blocker","Invalid Cut volume role");normal|=type=="normal_part";const auto& points=part.at("vertices"),faces=part.at("triangles");require(points.is_array()&&faces.is_array()&&!points.empty()&&!faces.empty()&&(vertices+=points.size())<=500000&&(triangles+=faces.size())<=500000,"Cut result exceeds 500000 vertices/triangles");require(triangles*input.size()<=2000000,"Cut result exceeds two million expanded triangles");indexed_triangle_set mesh;
   for(const auto& point:points){require(point.is_array()&&point.size()==3,"Invalid Cut vertex");mesh.vertices.emplace_back(float(arrangement_input::number(point[0],-1e6,1e6)),float(arrangement_input::number(point[1],-1e6,1e6)),float(arrangement_input::number(point[2],-1e6,1e6)));}
   for(const auto& face:faces){require(face.is_array()&&face.size()==3,"Invalid Cut triangle");for(const auto& i:face)require(i.is_number_integer()&&i.get<int64_t>()>=0&&uint64_t(i.get<int64_t>())<mesh.vertices.size(),"Invalid Cut triangle index");mesh.indices.emplace_back(face[0].get<int>(),face[1].get<int>(),face[2].get<int>());}
   auto* volume=object->add_volume(TriangleMesh(std::move(mesh)));volume->set_type(ModelVolume::type_from_string(type));
  }
  require(normal,"Cut result needs a normal part");for(const auto& original:input){auto* instance=object->add_instance();instance->set_transformation(Transformation(frame(original.at("matrix"))));instance->auto_drop=original.at("autoDrop").get<bool>();instance->printable=original.at("printable").get<bool>();}
  reset_instance_transformation(object,selectedIndex,side=="dowel"?Transform3d::Identity():cut,place,side=="lower"?place||flip:flip);
  const double before=object->min_z();require(std::isfinite(before)&&std::abs(before)<=1e6,"Native Cut minimum height exceeds bounds");object->ensure_on_bed(false);
  json instances=json::array();for(size_t index=0;index<input.size();++index){const auto* instance=object->instances[index];require(instance->get_offset().cwiseAbs().maxCoeff()<=1e6,"Grounded Cut instance exceeds coordinate bounds");instances.push_back({{"id",input[index].at("id")},{"matrix",matrix(instance->get_matrix())},{"autoDrop",instance->auto_drop},{"printable",instance->printable}});}
  output.push_back({{"id",name},{"side",side},{"instances",instances},{"minimumZBeforeGrounding",before},{"minimumZAfterGrounding",object->min_z()}});
 }
 return{{"format","orca-native-instance-cut"},{"version",1},{"sourceRevision","8500fcdccaa10b5099ac20d252af3a7c560046f1"},{"selectedInstanceId",selected},{"results",output}};
}
