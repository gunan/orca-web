from pathlib import Path
import sys,hashlib,subprocess,json
root=Path(__file__).resolve().parents[2];source=Path(sys.argv[1]);build=Path(sys.argv[2]);eigen=Path(sys.argv[3]);commit='8500fcdccaa10b5099ac20d252af3a7c560046f1';paths=['src/libslic3r/Model.cpp','src/libslic3r/Model.hpp','src/libslic3r/libslic3r.h','src/slic3r/GUI/Plater.cpp','src/libslic3r/Format/bbs_3mf.cpp']
assert subprocess.check_output(['git','-C',str(source),'rev-parse','HEAD'],text=True).strip()==commit
subprocess.run(['git','-C',str(source),'diff','--exit-code',commit,'--',*paths],check=True)
native=(source/paths[0]).read_text()
def body(signature):
 start=native.index(signature);i=native.index('{',start)+1;depth=1
 while depth:depth+=(native[i]=='{')-(native[i]=='}');i+=1
 return native[start:i]
cases=[]
def case(name,groups,center=[125,105]):cases.append({'name':name,'center':center,'groups':groups})
def group(offsets,flags=None,minimum=[-5,-5,-5],maximum=[5,5,5]):return {'min':minimum,'max':maximum,'offsets':offsets,'autoDrop':flags or [True]*len(offsets)}
case('single floating model',[group([[40,30,10]])])
case('two linked offsets',[group([[40,30,10],[100,30,14]])])
case('second instance stays floating',[group([[40,30,10],[100,30,14]],[True,False])])
case('first instance disabled native double ensure',[group([[40,30,10],[100,30,14]],[False,True])])
case('both instances disabled',[group([[40,30,10],[100,30,14]],[False,False])])
case('independent objects ground independently',[group([[25,40,-7]]),group([[140,80,17]],minimum=[-10,-2,-3],maximum=[10,2,3])])
case('plate-grid global positions',[group([[10,10,0]],minimum=[0,0,0],maximum=[20,20,20]),group([[310,-242,0]],minimum=[0,0,0],maximum=[20,20,20])])
case('sub-epsilon centering retained',[group([[125.00005,105.00005,5]])])
case('epsilon exceeded in one axis moves both',[group([[125.0002,105.00005,5]])])
case('fractional centers retain double precision',[group([[123.456789,45.678901,8.123456]])],[100.123456,80.654321])
cpp='''// Extracted original Model placement methods. Bounds adapters represent axis-aligned
// normal volumes; this reference does not exercise native archive parsing or rotation.
#include <Eigen/Geometry>
#include <nlohmann/json.hpp>
#include <iostream>
#include <vector>
#include <cmath>
using Vec2d=Eigen::Vector2d;using Vec3d=Eigen::Vector3d;using json=nlohmann::json;
constexpr double EPSILON=1e-4,SINKING_Z_THRESHOLD=-0.001,SINKING_MIN_Z_THRESHOLD=0.001;
Vec2d to_2d(Vec3d v){return v.head<2>();}
struct BoundingBoxf3{Eigen::AlignedBox3d box;void merge(BoundingBoxf3 other){box.extend(other.box);}Vec3d center(){return box.center();}};
struct ModelInstance{Vec3d offset;bool auto_drop;Vec3d get_offset(){return offset;}void set_offset(Vec3d v){offset=v;}};
struct ModelObject{std::vector<ModelInstance*> instances;Vec3d low,high;
 BoundingBoxf3 instance_bounding_box(size_t n,bool){BoundingBoxf3 b;b.box.extend(low+instances[n]->offset);b.box.extend(high+instances[n]->offset);return b;}
 void invalidate_bounding_box(){}int parts_count(){return 1;}
 double min_z(){return low.z()+instances.front()->offset.z();}double max_z(){return high.z()+instances.front()->offset.z();}
 void translate_instance(size_t i,Vec3d v){instances[i]->offset+=v;}void ensure_on_bed(bool);
};
struct Model{std::vector<ModelObject*> objects;bool center_instances_around_point(const Vec2d&);};
'''+body('void ModelObject::ensure_on_bed(bool allow_negative_z)')+'\n'+body('bool Model::center_instances_around_point(const Vec2d &point)')+'''
Vec3d vec(json a){return Vec3d(a[0],a[1],a[2]);}
int main(){json cases;std::cin>>cases;for(auto& c:cases){Model model;for(auto g:c["groups"]){auto* o=new ModelObject;o->low=vec(g["min"]);o->high=vec(g["max"]);for(size_t i=0;i<g["offsets"].size();i++)o->instances.push_back(new ModelInstance{vec(g["offsets"][i]),g["autoDrop"][i]});model.objects.push_back(o);}
 for(auto* o:model.objects)o->ensure_on_bed(false);model.center_instances_around_point(Vec2d(c["center"][0],c["center"][1]));for(auto* o:model.objects)o->ensure_on_bed(false);
 c["placedOffsets"]=json::array();for(auto* o:model.objects){json offsets=json::array();for(auto* i:o->instances){auto p=i->offset;offsets.push_back({p.x(),p.y(),p.z()});delete i;}c["placedOffsets"].push_back(offsets);delete o;}}
 std::cout<<cases.dump();}
'''
p=root/'tests/fixtures/native-geometry-import-reference.cpp';p.write_text(cpp);build.mkdir(parents=True,exist_ok=True);binary=build/'native-geometry-import-reference';subprocess.run(['clang++','-std=c++17','-O2','-I'+str(source/'deps_src'),'-I'+str(eigen),str(p),'-o',str(binary)],check=True);sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest();data={'commit':commit,'scope':'Original ensure_on_bed(false) and center_instances_around_point, invoked in native geometry-only order. Minimal axis-aligned normal-volume bounds adapters; no archive/UI/rotation acceptance.','sourceSha256':{name:sha(source/name) for name in paths},'generatorSha256':sha(Path(__file__)),'referenceSha256':sha(p),'binarySha256':sha(binary),'cases':json.loads(subprocess.check_output([str(binary)],input=json.dumps(cases).encode()))};(root/'tests/fixtures/native-geometry-import-reference.json').write_text(json.dumps(data,indent=2)+'\n');print('Compiled original native placement methods:10 first-instance/auto-drop/centering cases.')
