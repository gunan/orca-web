# SPDX-License-Identifier: AGPL-3.0-only
# Compile unchanged pinned Selection::synchronize_unselected_instances against
# a minimal in-memory GUI ownership shim. No production JS is used by the oracle.
from pathlib import Path
import argparse,hashlib,json,re,subprocess
p=argparse.ArgumentParser();p.add_argument('--source',type=Path,required=True);p.add_argument('--eigen',type=Path,required=True);p.add_argument('--output',type=Path,required=True);a=p.parse_args();a.output.mkdir(exist_ok=True,parents=True)
s=(a.source/'src/slic3r/GUI/Selection.cpp').read_text();start=s.index('void Selection::synchronize_unselected_instances(');end=s.index('\nvoid Selection::synchronize_unselected_volumes()',start);method=s[start:end].strip()
provenance={'commit':'8500fcdccaa10b5099ac20d252af3a7c560046f1','file':'src/slic3r/GUI/Selection.cpp','methodSha256':hashlib.sha256(method.encode()).hexdigest()};expected=Path(__file__).resolve().parents[1]/'tests/fixtures/native-instance-reference.json'
if expected.exists():assert json.loads(expected.read_text())['methodSha256']==provenance['methodSha256'],'Pinned Selection method changed'
(a.output/'source.json').write_text(json.dumps(provenance,indent=2)+'\n')
shim=r'''
#include <Eigen/Geometry>
#include <nlohmann/json.hpp>
#include <vector>
#include <set>
#include <iostream>
#include <fstream>
using Transform3d=Eigen::Affine3d;using json=nlohmann::json;
namespace Geometry {struct Transformation{Transform3d m=Transform3d::Identity();Transformation(){}Transformation(Transform3d value):m(value){}const Transform3d&get_matrix()const{return m;}void reset_rotation(){throw std::runtime_error("RESET not used by exposed web editor");}};}
bool is_left_handed(const Transform3d&m){return m.linear().determinant()<0;}
struct GLVolume{int obj=0,inst=0;Geometry::Transformation t;int object_idx()const{return obj;}int instance_idx()const{return inst;}const Geometry::Transformation&get_instance_transformation()const{return t;}void set_instance_transformation(const Transform3d&m){t.m=m;}};
struct ModelInstance{bool auto_drop=true;};struct ModelObject{std::vector<ModelInstance*>instances;};struct Model{std::vector<ModelObject*>objects;};
constexpr int ptSLA=1;struct Preset{int tech=0;int printer_technology(){return tech;}};struct Printers{Preset p;Preset&get_edited_preset(){return p;}};struct Bundle{Printers printers;};struct App{Bundle b;Bundle*preset_bundle=&b;};static App app;App&wxGetApp(){return app;}
struct CacheEntry{Geometry::Transformation t;const Geometry::Transformation&get_instance_transform()const{return t;}};struct Cache{std::vector<CacheEntry>volumes_data;};
struct Selection{enum class SyncRotationType{NONE,GENERAL,RESET};std::set<unsigned int>m_list;std::vector<GLVolume*>*m_volumes;Model*m_model;Cache m_cache;void synchronize_unselected_instances(SyncRotationType);};
Transform3d matrix(const json&v){Transform3d m;for(int i=0;i<16;i++)m.matrix().data()[i]=v.at(i).get<double>();return m;}json values(const Transform3d&m){json out=json::array();for(int i=0;i<16;i++)out.push_back(m.matrix().data()[i]);return out;}
'''
main=r'''
int main(int argc,char**argv){try{json input;std::ifstream(argv[1])>>input;json output=json::array();for(const auto&row:input){std::vector<GLVolume>volumes;std::vector<ModelInstance>instances;volumes.reserve(row.at("peers").size()+1);instances.reserve(row.at("peers").size()+1);volumes.push_back({0,0,Geometry::Transformation(matrix(row.at("current")))});instances.push_back({true});Selection selection;selection.m_list.insert(0);selection.m_cache.volumes_data.push_back({Geometry::Transformation(matrix(row.at("old")))});for(const auto&peer:row.at("peers")){volumes.push_back({0,int(volumes.size()),Geometry::Transformation(matrix(peer.at("matrix")))});instances.push_back({peer.value("autoDrop",true)});selection.m_cache.volumes_data.push_back({Geometry::Transformation(matrix(peer.at("matrix")))});}std::vector<GLVolume*>ptrs;ModelObject object;for(size_t i=0;i<volumes.size();i++){ptrs.push_back(&volumes[i]);object.instances.push_back(&instances[i]);}Model model;model.objects.push_back(&object);selection.m_model=&model;selection.m_volumes=&ptrs;app.b.printers.p.tech=row.value("sla",false)?ptSLA:0;selection.synchronize_unselected_instances(row.value("rotation","general")=="none"?Selection::SyncRotationType::NONE:Selection::SyncRotationType::GENERAL);json result=json::array();for(size_t i=1;i<volumes.size();i++)result.push_back(values(volumes[i].t.m));output.push_back(result);}std::ofstream(argv[2])<<output.dump(2);}catch(const std::exception&e){std::cerr<<e.what();return 1;}}
'''
file=a.output/'reference.cpp';file.write_text(shim+'\n'+method+'\n'+main)
subprocess.run(['clang++','-std=c++17','-O2','-DNDEBUG','-I'+str(a.eigen),'-I'+str(a.source/'deps_src'),str(file),'-o',str(a.output/'instance-reference')],check=True)
