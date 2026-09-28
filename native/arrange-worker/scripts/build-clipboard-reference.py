# SPDX-License-Identifier: AGPL-3.0-only
from pathlib import Path
import hashlib,json,subprocess,shlex,argparse
parser=argparse.ArgumentParser(description='Compile independent unchanged Orca2.4.2 GUI clipboard methods against the native helper dependencies.')
parser.add_argument('--source',type=Path,required=True);parser.add_argument('--build',type=Path,required=True);parser.add_argument('--output',type=Path,required=True);args=parser.parse_args()
upstream=args.source.resolve();base=args.build.resolve();stage=args.output.resolve();stage.mkdir(parents=True,exist_ok=True)
expected=json.loads((Path(__file__).resolve().parents[1]/'clipboard-source-hashes.json').read_text())

def function(file,begin):
 text=(upstream/file).read_text();start=text.index(begin);opening=text.index('{',start);depth=1;end=opening+1
 while depth:
  if text[end]=='{':depth+=1
  elif text[end]=='}':depth-=1
  end+=1
 return text[start:end]
excerpts=[function('src/slic3r/GUI/GLCanvas3D.cpp',s) for s in ['double GLCanvas3D::get_size_proportional_to_max_bed_size','std::vector<Vec2f> GLCanvas3D::get_empty_cells','Vec2f GLCanvas3D::get_nearest_empty_cell']]+[function('src/slic3r/GUI/Selection.cpp','void Selection::paste_objects_from_clipboard'),function('src/slic3r/GUI/PartPlate.cpp','bool PartPlate::intersects'),function('src/slic3r/GUI/Selection.cpp','void Selection::paste_volumes_from_clipboard')]
header=r'''// Diagnostic oracle: original native methods below are extracted unchanged.
#include <libslic3r/Model.hpp>
#include <libslic3r/BuildVolume.hpp>
#include <nlohmann/json.hpp>
#include <fstream>
#include <iostream>
using namespace Slic3r;using json=nlohmann::json;
struct PartPlate {BoundingBoxf raw;double height=250;BoundingBoxf3 m_bounding_box;BoundingBoxf3 get_build_volume(){const double e=BuildVolume::SceneEpsilon;return BoundingBoxf3(Vec3d(raw.min.x()-e,raw.min.y()-e,-e),Vec3d(raw.max.x()+e,raw.max.y()+e,height+e));}bool intersects(const BoundingBoxf3&bb)const;};
class GLCanvas3D;
struct PartPlateList{PartPlate plate;PartPlate*get_curr_plate(){return &plate;}};
struct Plater{PartPlateList list;GLCanvas3D*canvas;PartPlateList&get_partplate_list(){return list;}GLCanvas3D*canvas3D(){return canvas;}};
struct ObjectList{ModelVolumePtrs pasted;void paste_objects_into_list(const std::vector<size_t>&);void paste_volumes_into_list(int,const ModelVolumePtrs&volumes){pasted=volumes;}};
struct App{Plater p;ObjectList l;Plater*plater(){return&p;}ObjectList*obj_list(){return&l;}};App app;App&wxGetApp(){return app;}
struct Volume{BoundingBoxf box;const BoundingBoxf&bounding_volume2d()const{return box;}};struct Bed{Volume volume;const Volume&build_volume()const{return volume;}};
class GLCanvas3D {public:Model*m_model;Bed m_bed;double get_size_proportional_to_max_bed_size(double)const;std::vector<Vec2f>get_empty_cells(Vec2f,Vec2f);Vec2f get_nearest_empty_cell(Vec2f,Vec2f);};
void ObjectList::paste_objects_into_list(const std::vector<size_t>& ids){for(size_t id:ids){auto*object=app.p.canvas->m_model->objects.at(id);if(object->min_z()>=SINKING_Z_THRESHOLD)object->ensure_on_bed();}}
class Selection{public:Model*m_model;int destination=0;int get_object_idx(){return destination;}int get_instance_idx(){return 0;}struct Clipboard{Model model;ModelObject*get_object(size_t i){return model.objects.at(i);}const ModelObjectPtrs&get_objects()const{return model.objects;}}m_clipboard;void paste_objects_from_clipboard();void paste_volumes_from_clipboard();};
'''
footer=r'''
Transform3d tr(const json&j){Transform3d t=Transform3d::Identity();if(!j.is_null())for(int i=0;i<16;i++)t.matrix().data()[i]=j[i].get<double>();return t;}
json matrix(const Transform3d&t){json j=json::array();for(int i=0;i<16;i++)j.push_back(t.matrix().data()[i]);return j;}
void load(Model&model,const json&objects){for(const auto&o:objects){auto*m=model.add_object();m->name=o.at("id").get<std::string>();m->input_file=o.value("inputFile",std::string());for(const auto&p:o.at("parts")){indexed_triangle_set mesh;for(const auto&v:p.at("vertices"))mesh.vertices.emplace_back(v[0].get<float>(),v[1].get<float>(),v[2].get<float>());for(const auto&f:p.at("triangles"))mesh.indices.emplace_back(f[0].get<int>(),f[1].get<int>(),f[2].get<int>());auto*v=m->add_volume(TriangleMesh(std::move(mesh)));v->set_type(ModelVolume::type_from_string(p.value("type",std::string("normal_part"))));v->set_transformation(tr(p.value("matrix",json()))*v->get_matrix());}auto*i=m->add_instance();i->set_transformation(Geometry::Transformation(tr(o.value("matrix",json()))));}}
int main(int argc,char**argv){try{if(argc!=3)throw std::runtime_error("input/output required");json in;std::ifstream(argv[1])>>in;auto&plate=app.p.list.plate;const auto&b=in.at("bedBounds");plate.raw=BoundingBoxf(Vec2d(b[0].get<double>(),b[1].get<double>()),Vec2d(b[2].get<double>(),b[3].get<double>()));plate.height=in.value("bedHeight",250.);plate.m_bounding_box=BoundingBoxf3(Vec3d(plate.raw.min.x(),plate.raw.min.y(),0),Vec3d(plate.raw.max.x(),plate.raw.max.y(),0));Model model;load(model,in.at("objects"));GLCanvas3D canvas;canvas.m_model=&model;canvas.m_bed.volume.box=plate.raw;app.p.canvas=&canvas;json out;if(!in.contains("clipboardObjects")){const auto&s=in.at("startPoint"),&step=in.at("step");auto point=canvas.get_nearest_empty_cell(Vec2f(s[0].get<float>(),s[1].get<float>()),Vec2f(step[0].get<float>(),step[1].get<float>()));out["point"]={point.x(),point.y()};}else{Selection selection;selection.m_model=&model;load(selection.m_clipboard.model,in.at("clipboardObjects"));if(in.contains("pasteParts")){for(size_t i=0;i<model.objects.size();i++)if(model.objects[i]->name==in.at("pasteParts").at("destinationId").get<std::string>())selection.destination=i;out["parts"]=json::array();for(int copy=0;copy<in.value("copies",1);copy++){selection.paste_volumes_from_clipboard();for(size_t i=0;i<app.l.pasted.size();i++){auto*source=selection.m_clipboard.model.objects.front();const auto component=tr(in.at("clipboardObjects")[0].at("parts")[i].value("matrix",json())),uncenter=component.inverse()*source->volumes[i]->get_matrix();out["parts"].push_back(matrix(model.objects[selection.destination]->instances.front()->get_matrix()*app.l.pasted[i]->get_matrix()*uncenter.inverse()));}}}else{out["clones"]=json::array();for(int i=0;i<in.at("copies").get<int>();i++){size_t before=model.objects.size();selection.paste_objects_from_clipboard();for(size_t j=before;j<model.objects.size();j++)out["clones"].push_back({{"sourceId",model.objects[j]->name},{"matrix",matrix(model.objects[j]->instances.front()->get_matrix())}});}}}std::ofstream(argv[2])<<out.dump();}catch(const std::exception&e){std::cerr<<e.what()<<"\n";return 1;}}
'''
assert [{'declaration':x.splitlines()[0],'sha256':hashlib.sha256(x.encode()).hexdigest()}for x in excerpts]==expected['excerpts'],'Pinned native clipboard source changed'
file=stage/'independent-reference.cpp';file.write_text(header+'\n\n'.join(excerpts)+footer);(stage/'reference-source-hashes.json').write_text(json.dumps({'commit':'8500fcdccaa10b5099ac20d252af3a7c560046f1','excerpts':[{'declaration':x.splitlines()[0],'sha256':hashlib.sha256(x.encode()).hexdigest()}for x in excerpts]},indent=2)+'\n')
commands=subprocess.check_output(['ninja','-C',str(base),'-t','commands'],text=True).splitlines();args=shlex.split(next(x for x in commands if x.endswith('/worker/main.cpp')));args[args.index('-c')+1]=str(file);obj=stage/'independent-reference.o'
for flag in ['-o','-MT']:args[args.index(flag)+1]=str(obj)
args[args.index('-MF')+1]=str(obj)+'.d';subprocess.run(args,cwd=stage,check=True)
line=next(x for x in commands if ' -o orca-arrange-worker 'in x);args=shlex.split(line.removeprefix(': && ').removesuffix(' && :'));args=[str(obj)if a=='CMakeFiles/orca-arrange-worker.dir/worker/main.cpp.o'else str(base/a)if a.endswith('.o')and not a.startswith('/')else a for a in args if not a.endswith('/worker/nearest-empty-cell.cpp.o')];args[args.index('-o')+1]=str(stage/'independent-reference');subprocess.run(args,cwd=stage,check=True)
