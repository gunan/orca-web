#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-only
"""Compile independent original PartPlate methods with a fixture-owned Model.
No production tower adapter, generated tower methods, or request validator links.
"""
from pathlib import Path
import argparse,json,hashlib,subprocess,shlex
p=argparse.ArgumentParser();p.add_argument('--source',type=Path,required=True);p.add_argument('--build',type=Path,required=True);p.add_argument('--output',type=Path,required=True);a=p.parse_args()
root=Path(__file__).resolve().parents[2];source=a.source.resolve();base=a.build.resolve();out=a.output.resolve();out.mkdir(parents=True,exist_ok=True)
sha=lambda b:hashlib.sha256(b).hexdigest()
spec=json.loads((root/'native/arrange-worker/prime-tower-source-hashes.json').read_text());production=json.loads((base/'build-manifest.json').read_text())
assert production['binarySha256']==sha((base/'orca-arrange-worker').read_bytes())
assert production['sourceManifest']['commit']==spec['sourceCommit']==subprocess.check_output(['git','-C',str(source),'rev-parse','HEAD'],text=True).strip()
for path,digest in spec['sources'].items():assert sha((source/path).read_bytes())==digest,path
text=(source/'src/slic3r/GUI/PartPlate.cpp').read_text()
def extract(signature):
 start=text.index(signature);brace=text.index('{',start);end=brace+1;depth=1
 while depth:depth+=(text[end]=='{')-(text[end]=='}');end+=1
 return text[start:end].replace('PartPlate::','ReferencePlate::',1)
methods='\n\n'.join(extract(s)for s in ['BoundingBoxf3 PartPlate::get_build_volume(', 'bool PartPlate::contain_instance_totally(int ', 'bool PartPlate::check_outside(', 'int PartPlate::printable_instance_size(', 'std::vector<int> PartPlate::get_extruders(bool ', 'Vec3d PartPlate::estimate_wipe_tower_size('])
methods=methods.replace('wxGetApp().preset_bundle->prints.get_edited_preset().config','m_config').replace('wxGetApp().preset_bundle->project_config','m_project_config')
# WipeTower helpers are linked from the source-pinned general native-plate object;
# the estimator under comparison is independently extracted above.
main=r'''
#include "libslic3r/Model.hpp"
#include "libslic3r/ModelArrange.hpp"
#include "libslic3r/BuildVolume.hpp"
#include "libslic3r/ClipperUtils.hpp"
#include "libslic3r/GCode/WipeTower.hpp"
#include <nlohmann/json.hpp>
#include <fstream>
#include <iostream>
using namespace Slic3r;using json=nlohmann::json;
struct ReferencePrint{PrintConfig value;const PrintConfig&config()const{return value;}};
struct ReferencePlater{const BuildVolume*volume;const BuildVolume&build_volume()const{return *volume;}};
struct ReferencePlate{
 Model*m_model;ReferencePrint*m_print;ReferencePlater*m_plater;DynamicPrintConfig m_config,m_project_config;
 std::set<std::pair<int,int>>obj_to_instance_set,instance_outside_set;int m_plate_index=0;
 Pointfs m_shape;std::vector<Pointfs>m_extruder_areas;std::vector<double>m_extruder_heights;std::vector<BoundingBoxf3>m_exclude_bounding_box;BoundingBoxf3 m_bounding_box;Vec3d m_origin;double m_height;
 const Pointfs&get_shape()const{return m_shape;}BoundingBoxf3 get_plate_box(){return get_build_volume();}
 BoundingBoxf3 get_build_volume(bool use_share=false);bool contain_instance_totally(int,int)const;
 bool check_outside(int,int,BoundingBoxf3*bounding_box=nullptr);int printable_instance_size();
 bool check_objects_empty_and_gcode3mf(std::vector<int>&)const{return m_model->objects.empty();}
 std::vector<int>get_extruders(bool)const;
 Vec3d estimate_wipe_tower_size(const DynamicPrintConfig&,double,double,int,int,bool,bool)const;
};
METHODS
Transform3d frame(const json&v){Transform3d t;for(int i=0;i<16;i++)t.matrix().data()[i]=v[i].get<double>();return t;}
template<class T>void config(T&c,const json&v){ConfigSubstitutionContext substitutions(ForwardCompatibilitySubstitutionRule::Disable);for(const auto&kv:v.items()){std::string s;if(kv.value().is_array()){for(const auto&x:kv.value()){if(!s.empty())s+=",";s+=x.get<std::string>();}}else s=kv.value().get<std::string>();c.set_deserialize(kv.key(),s,substitutions);}}
Pointfs points(const json&v){Pointfs p;for(const auto&x:v)p.emplace_back(x[0].get<double>(),x[1].get<double>());return p;}
json evaluate(const json&r){
 Model model;ReferencePrint print;ReferencePlate plate;plate.m_model=&model;plate.m_print=&print;
 plate.m_config=DynamicPrintConfig::full_print_config();config(plate.m_config,r.at("settings"));config(plate.m_config,r.at("assignments"));print.value.apply(plate.m_config,true);
 int colors=r.at("filamentCount");plate.m_project_config.set_key_value("filament_colour",new ConfigOptionStrings(std::vector<std::string>(colors,"#808080")));
 const auto&bed=r.at("plate");plate.m_shape=points(bed.at("shape"));plate.m_height=bed.at("height");plate.m_origin=Vec3d(bed["origin"][0],bed["origin"][1],bed["origin"][2]);
 for(const auto&p:plate.m_shape)plate.m_bounding_box.merge(Vec3d(p.x(),p.y(),0));
 auto exclusions=points(bed.at("excluded"));for(size_t i=0;i+3<exclusions.size();i+=4){BoundingBoxf3 b;for(int j=0;j<4;j++)b.merge(Vec3d(exclusions[i+j].x(),exclusions[i+j].y(),0));b.max.z()=int(plate.m_bounding_box.size().y());b.min.z()=double(-.03f);plate.m_exclude_bounding_box.push_back(b);}
 for(const auto&a:bed.at("extruderAreas"))plate.m_extruder_areas.push_back(points(a));for(const auto&h:bed.at("extruderHeights"))plate.m_extruder_heights.push_back(h.is_null()?std::numeric_limits<double>::quiet_NaN():h.get<double>());
 BuildVolume volume(plate.m_shape,plate.m_height,plate.m_extruder_areas,plate.m_extruder_heights);ReferencePlater plater{&volume};plate.m_plater=&plater;
 for(const auto&o:r.at("objects")){auto*object=model.add_object();config(object->config,o.at("settings"));for(const auto&p:o.at("parts")){indexed_triangle_set mesh;for(const auto&v:p.at("vertices"))mesh.vertices.emplace_back(v[0].get<float>(),v[1].get<float>(),v[2].get<float>());for(const auto&t:p.at("triangles"))mesh.indices.emplace_back(t[0].get<int>(),t[1].get<int>(),t[2].get<int>());auto*part=object->add_volume(TriangleMesh(std::move(mesh)));part->set_type(ModelVolume::type_from_string(p.at("type")));part->set_transformation(Geometry::Transformation(frame(p.at("matrix"))*part->get_matrix()));config(part->config,p.at("settings"));for(const auto&kv:p.at("color").items())part->mmu_segmentation_facets.set_triangle_from_string(std::stoi(kv.key()),kv.value().get<std::string>());part->mmu_segmentation_facets.touch();}
  int k=0;for(const auto&v:o.at("ranges")){config(object->layer_config_ranges[{double(k),double(k+1)}],v);++k;}
  for(const auto&i:o.at("instances")){auto*instance=object->add_instance();instance->set_transformation(Geometry::Transformation(frame(i.at("matrix"))));instance->printable=i.at("printable");if(i.at("plateId")==r.at("plateId"))plate.obj_to_instance_set.emplace(model.objects.size()-1,object->instances.size()-1);}
 }
 for(const auto&pair:plate.obj_to_instance_set)if(plate.check_outside(pair.first,pair.second))plate.instance_outside_set.insert(pair);
 for(const auto&e:r.at("events")){CustomGCode::Item item{};item.type=CustomGCode::ToolChange;item.extruder=e.at("extruder");model.plates_custom_gcodes[0].gcodes.push_back(item);}
 json contained=json::array();for(size_t i=0;i<model.objects.size();i++)contained.push_back(plate.contain_instance_totally(i,0));
 const auto tools=plate.get_extruders(true);const int printable=plate.printable_instance_size();
 const auto&cfg=plate.m_config;const float x=r["placement"][0].get<float>(),y=r["placement"][1].get<float>(),angle=r["placement"][2].get<float>();
 json result={{"visible",false},{"extruders",tools},{"containedFirstInstances",contained},{"printableInstanceCount",printable},{"size",nullptr},{"position",{double(float(x+plate.m_origin.x()))-plate.m_origin.x(),double(float(y+plate.m_origin.y()))-plate.m_origin.y()}},{"rotation",(M_PI/180.)*angle},{"alpha",double(.66f)}};
 // GLCanvas3D.cpp2845-2910 visibility, then 3DScene.cpp832-886 float shell.
 const bool needed=cfg.opt_enum<TimelapseType>("timelapse_type")==tlSmooth||cfg.opt_bool("enable_wrapping_detection");
 if(!cfg.opt_bool("enable_prime_tower")||(!needed&&colors<=1))return result;
 if(cfg.opt_enum<PrintSequence>("print_sequence")==PrintSequence::ByObject&&printable!=1)return result;
 if((!needed&&tools.size()<2)||plate.obj_to_instance_set.empty()||tools.empty())return result;
 const Vec3d size=plate.estimate_wipe_tower_size(cfg,float(cfg.opt_float("prime_tower_width")),float(cfg.opt_float("prime_volume")),print.config().nozzle_diameter.size(),0,false,cfg.opt_bool("enable_wrapping_detection"));
 float w=size.x(),d=size.y(),h=size.z();if(d<.01f)return result;if(h==0.f)h=.1f;
 json bands=json::array();for(size_t i=0;i<tools.size();i++){TriangleMesh cube=make_cube(w,d/tools.size(),h);cube.translate({0.f,d*i/tools.size(),0.});json coords=json::array();for(const auto&face:cube.its.indices)for(int k=0;k<3;k++){const auto&p=cube.its.vertices[face[k]];coords.push_back(p.x());coords.push_back(p.y());coords.push_back(p.z());}bands.push_back({{"extruder",tools[i]},{"positions",coords}});}result["bands"]=bands;
 result["visible"]=true;result["estimatedSize"]={size.x(),size.y(),size.z()};result["size"]={double(w),double(d),double(h)};return result;
}
int main(int argc,char**argv){try{json inputs;std::ifstream(argv[1])>>inputs;json outputs=json::array();for(const auto&c:inputs)outputs.push_back({{"name",c.at("name")},{"result",evaluate(c.at("request"))}});std::ofstream(argv[2])<<outputs.dump(2);return 0;}catch(const std::exception&e){std::cerr<<e.what();return 1;}}
'''.replace('METHODS',methods)
file=out/'reference.cpp';file.write_text(main)
commands=subprocess.check_output(['ninja','-C',str(base),'-t','commands'],text=True).splitlines();template=shlex.split(next(x for x in commands if x.endswith('/worker/main.cpp')))
obj=out/'reference.o';args=template.copy();args[args.index('-c')+1]=str(file)
for flag in ['-o','-MT']:args[args.index(flag)+1]=str(obj)
args[args.index('-MF')+1]=str(obj)+'.d';subprocess.run(args,cwd=out,check=True)
line=next(x for x in commands if ' -o orca-arrange-worker 'in x);args=shlex.split(line.removeprefix(': && ').removesuffix(' && :'))
# Keep only general pinned kernel objects; no production operation entry points.
exclude=['main','native-prime-tower','native-tower-plate','native-instance-cut','native-cut-to-parts','native-fill-bed','nearest-empty-cell']
args=[str(base/v)if v.endswith('.o')and not v.startswith('/')else v for v in args if not any(v.endswith('/worker/'+n+'.cpp.o')for n in exclude)]
args[args.index('-o')+1]=str(out/'prime-tower-reference');args.insert(1,str(obj));subprocess.run(args,cwd=out,check=True)
(out/'source.json').write_text(json.dumps({**spec,'referenceMethodsSha256':sha(methods.encode()),'referenceSourceSha256':sha(main.encode()),'referenceGeneratorSha256':sha(Path(__file__).read_bytes()),'referenceBinarySha256':sha((out/'prime-tower-reference').read_bytes()),'kernelBinarySha256':production['binarySha256']},indent=2)+'\n')
print('Built independent original PartPlate containment, assignments and tower estimator')
