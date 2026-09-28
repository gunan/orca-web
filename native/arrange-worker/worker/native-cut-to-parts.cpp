// SPDX-License-Identifier: AGPL-3.0-only
#include "native-cut-to-parts.hpp"
#include "input-validation.hpp"
#include "libslic3r/Model.hpp"
#include "libslic3r/CutUtils.hpp"
#include "libslic3r/TriangleMeshSlicer.hpp"
#include <set>
using namespace Slic3r;using namespace Slic3r::Geometry;using json=nlohmann::json;
// Unchanged pinned CutUtils arithmetic, independently checked by the reference harness.
#include "native-cut-to-parts.inc"
#include "native-instance-cut-reset.inc"
namespace {
using arrangement_input::require;
Transform3d frame(const json& values){require(!values.is_null(),"Cut requires a matrix");arrangement_input::matrix(values);Transform3d m;for(int i=0;i<16;++i)m.matrix().data()[i]=values.at(i).get<double>();require(m.linear().cwiseAbs().maxCoeff()<=10000&&m.translation().cwiseAbs().maxCoeff()<=1e6,"Cut transform exceeds bounds");return m;}
json matrix(const Transform3d&m){json out=json::array();for(int i=0;i<16;++i){require(std::isfinite(m.matrix().data()[i])&&std::abs(m.matrix().data()[i])<=1e6,"Native Cut produced an out-of-bounds frame");out.push_back(m.matrix().data()[i]);}return out;}
std::string text(const json&v,size_t max=256){require(v.is_string(),"Invalid Cut text");const auto value=v.get<std::string>();require(!value.empty()&&value.size()<=max&&value.find('\0')==std::string::npos,"Invalid Cut text bounds");return value;}
}
json native_cut_to_parts(const json& request){
 require(request.is_object()&&request.value("format",std::string())=="orca-cut-to-parts-request"&&request.value("version",0)==1&&request.value("sourceRevision",std::string())=="8500fcdccaa10b5099ac20d252af3a7c560046f1"&&request.value("operation",std::string())=="cut-to-parts","Invalid Cut to parts request identity");
 const auto& input=request.at("instances");require(input.is_array()&&!input.empty()&&input.size()<=256,"Cut requires 1–256 instances");const auto selected=text(request.at("selectedInstanceId"));std::set<std::string> ids;size_t selectedIndex=0;bool found=false;
 Model model;auto*object=model.add_object();
 for(size_t index=0;index<input.size();++index){const auto&item=input[index];const auto id=text(item.at("id"));require(ids.insert(id).second,"Duplicate Cut instance identity");require(item.at("autoDrop").is_boolean()&&item.at("printable").is_boolean(),"Invalid Cut instance flag");auto*instance=object->add_instance();instance->set_transformation(Transformation(frame(item.at("matrix"))));instance->auto_drop=item.at("autoDrop");instance->printable=item.at("printable");if(id==selected){selectedIndex=index;found=true;}}
 require(found,"Selected Cut instance is missing");const auto cut=frame(request.at("cutMatrix"));require((cut.linear().transpose()*cut.linear()-Matrix3d::Identity()).cwiseAbs().maxCoeff()<1e-9&&std::abs(cut.linear().determinant()-1)<1e-9,"Cut matrix must be a proper rigid rotation");
 const auto&parts=request.at("sourceParts");require(parts.is_array()&&!parts.empty()&&parts.size()<=4096,"Invalid Cut part count");size_t vertices=0,triangles=0;bool normal=false;std::set<std::string> partIds;
 for(const auto&part:parts){const auto id=text(part.at("id")),name=text(part.at("name"),1024),type=text(part.at("type"));require(partIds.insert(id).second,"Duplicate Cut part identity");require(type=="normal_part"||type=="negative_part"||type=="modifier_part"||type=="support_enforcer"||type=="support_blocker","Invalid Cut part role");normal|=type=="normal_part";const auto&points=part.at("vertices"),faces=part.at("triangles");require(points.is_array()&&faces.is_array()&&!points.empty()&&!faces.empty()&&(vertices+=points.size())<=500000&&(triangles+=faces.size())<=500000&&triangles*input.size()<=2000000,"Cut input exceeds geometry limits");indexed_triangle_set mesh;
  for(const auto&p:points){require(p.is_array()&&p.size()==3,"Invalid Cut vertex");mesh.vertices.emplace_back(float(arrangement_input::number(p[0],-1e6,1e6)),float(arrangement_input::number(p[1],-1e6,1e6)),float(arrangement_input::number(p[2],-1e6,1e6)));}
  for(const auto&f:faces){require(f.is_array()&&f.size()==3,"Invalid Cut triangle");for(const auto&i:f)require(i.is_number_integer()&&i.get<int64_t>()>=0&&uint64_t(i.get<int64_t>())<mesh.vertices.size(),"Invalid Cut triangle index");mesh.indices.emplace_back(f[0].get<int>(),f[1].get<int>(),f[2].get<int>());}
  auto*volume=object->add_volume(TriangleMesh(std::move(mesh)));volume->name=name;volume->set_type(ModelVolume::type_from_string(type));volume->set_transformation(Transformation(frame(part.at("matrix"))*volume->get_matrix()));
 }
 require(normal,"Cut requires a normal part");
 const auto instance=object->instances.at(selectedIndex)->get_transformation().get_matrix_no_offset();const Transform3d inverse=Transformation(cut).get_rotation_matrix().inverse()*translation_transform(-Transformation(cut).get_offset());ModelObject*upper=nullptr;object->clone_for_cut(&upper);model.objects.push_back(upper);
 const auto flags=ModelObjectCutAttribute::KeepUpper|ModelObjectCutAttribute::KeepLower|ModelObjectCutAttribute::KeepAsParts;std::vector<size_t> sourceIndices;
 for(size_t i=0;i<object->volumes.size();++i){auto*volume=object->volumes[i];volume->reset_extra_facets();const auto previous=upper->volumes.size();if(volume->is_model_part())process_solid_part_cut(volume,instance,cut,flags,upper,nullptr);else process_modifier_cut(volume,instance,inverse,flags,upper,nullptr);for(size_t j=previous;j<upper->volumes.size();++j)sourceIndices.push_back(i);require(upper->volumes.size()*input.size()<=10000,"Cut result exceeds 10000 expanded parts");}
 require(std::any_of(upper->volumes.begin(),upper->volumes.end(),[](auto*v){return v->is_model_part();}),"Cut produced no normal part");
 reset_instance_transformation(upper,selectedIndex,cut);const double before=upper->min_z();upper->ensure_on_bed(false);const double after=upper->min_z();require(std::isfinite(before)&&std::isfinite(after)&&std::abs(before)<=1e6&&std::abs(after)<=1e6,"Cut result height exceeds bounds");
 json outputParts=json::array(),outputInstances=json::array();vertices=triangles=0;
 for(size_t index=0;index<upper->volumes.size();++index){const auto*v=upper->volumes[index];const auto&mesh=v->mesh().its;require((vertices+=mesh.vertices.size())<=1000000&&(triangles+=mesh.indices.size())<=1000000&&triangles*input.size()<=2000000,"Cut result exceeds geometry limits");json points=json::array(),faces=json::array();for(const auto&p:mesh.vertices){require(p.allFinite()&&p.cwiseAbs().maxCoeff()<=1e6,"Cut result vertex exceeds bounds");points.push_back({p.x(),p.y(),p.z()});}for(const auto&f:mesh.indices)faces.push_back({f[0],f[1],f[2]});outputParts.push_back({{"sourceId",parts[sourceIndices[index]].at("id")},{"name",v->name},{"type",ModelVolume::type_to_string(v->type())},{"fromUpper",v->is_from_upper()},{"vertices",points},{"triangles",faces},{"matrix",matrix(v->get_matrix())}});}
 for(size_t i=0;i<input.size();++i){const auto*v=upper->instances[i];outputInstances.push_back({{"id",input[i].at("id")},{"matrix",matrix(v->get_matrix())},{"autoDrop",v->auto_drop},{"printable",v->printable}});}
 return{{"format","orca-native-cut-to-parts"},{"version",1},{"sourceRevision","8500fcdccaa10b5099ac20d252af3a7c560046f1"},{"selectedInstanceId",selected},{"parts",outputParts},{"instances",outputInstances},{"minimumZBeforeGrounding",before},{"minimumZAfterGrounding",after}};
}
