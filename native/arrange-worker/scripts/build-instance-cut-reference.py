# SPDX-License-Identifier: AGPL-3.0-only
# Original pinned Cut reset with real Model::ensure_on_bed. No production JSON
# dispatcher or JavaScript matrix code is used to produce the reference.
from pathlib import Path
import argparse,subprocess,shlex,re,json,hashlib
p=argparse.ArgumentParser();p.add_argument('--source',type=Path,required=True);p.add_argument('--build',type=Path,required=True);p.add_argument('--output',type=Path,required=True);a=p.parse_args();root=Path(__file__).resolve().parents[1];stage=a.output.resolve();stage.mkdir(parents=True,exist_ok=True);base=a.build.resolve();source=a.source.resolve()
text=(source/'src/libslic3r/CutUtils.cpp').read_text();start=text.index('static void reset_instance_transformation(');end=text.index('\n\nCut::Cut(',start);method=text[start:end].strip()
provenance={'sourceCommit':'8500fcdccaa10b5099ac20d252af3a7c560046f1','sourceFile':'src/libslic3r/CutUtils.cpp','methodSha256':hashlib.sha256(method.encode()).hexdigest()}
expected=json.loads((root/'source-manifest.json').read_text())['sources']['src/libslic3r/CutUtils.cpp'];assert hashlib.sha256(text.encode()).hexdigest()==expected,'Pinned CutUtils changed'
main=r'''
#include "libslic3r/Model.hpp"
#include <nlohmann/json.hpp>
#include <fstream>
#include <iostream>
using namespace Slic3r;using namespace Slic3r::Geometry;using json=nlohmann::json;
METHOD
Transform3d frame(const json&values){Transform3d m;for(int i=0;i<16;i++)m.matrix().data()[i]=values.at(i).get<double>();return m;}
json values(const Transform3d&m){json r=json::array();for(int i=0;i<16;i++)r.push_back(m.matrix().data()[i]);return r;}
int main(int argc,char**argv){try{json input;std::ifstream(argv[1])>>input;json out=json::array();for(const auto&test:input){json results=json::array();size_t selected=0;for(size_t i=0;i<test.at("instances").size();i++)if(test.at("instances")[i].at("id")==test.at("selectedInstanceId"))selected=i;for(const auto&result:test.at("results")){Model model;ModelObject*object=model.add_object();for(const auto&part:result.at("parts")){indexed_triangle_set mesh;for(const auto&p:part.at("vertices"))mesh.vertices.emplace_back(p[0].get<float>(),p[1].get<float>(),p[2].get<float>());for(const auto&f:part.at("triangles"))mesh.indices.emplace_back(f[0].get<int>(),f[1].get<int>(),f[2].get<int>());auto*volume=object->add_volume(TriangleMesh(std::move(mesh)));volume->set_type(ModelVolume::type_from_string(part.at("type").get<std::string>()));}for(const auto&item:test.at("instances")){auto*instance=object->add_instance();instance->set_transformation(Transformation(frame(item.at("matrix"))));instance->auto_drop=item.at("autoDrop").get<bool>();instance->printable=item.at("printable").get<bool>();}const bool place=result.at("placeOnCut"),flip=result.at("flip");reset_instance_transformation(object,selected,result.at("side")=="dowel"?Transform3d::Identity():frame(test.at("cutRotation")),place,result.at("side")=="lower"?place||flip:flip);const double before=object->min_z();object->ensure_on_bed(false);json instances=json::array();for(const auto*i:object->instances)instances.push_back(values(i->get_matrix()));results.push_back({{"id",result.at("id")},{"instances",instances},{"minimumZBeforeGrounding",before},{"minimumZAfterGrounding",object->min_z()}});}out.push_back(results);}std::ofstream(argv[2])<<out.dump(2);}catch(const std::exception&e){std::cerr<<e.what();return 1;}}
'''.replace('METHOD',method)
file=stage/'reference.cpp';file.write_text(main);(stage/'source.json').write_text(json.dumps(provenance,indent=2)+'\n')
commands=subprocess.check_output(['ninja','-C',str(base),'-t','commands'],text=True).splitlines();args=shlex.split(next(x for x in commands if x.endswith('/worker/main.cpp')));obj=stage/'reference.o';args[args.index('-c')+1]=str(file)
for flag in ['-o','-MT']:args[args.index(flag)+1]=str(obj)
args[args.index('-MF')+1]=str(obj)+'.d';subprocess.run(args,cwd=stage,check=True)
line=next(x for x in commands if ' -o orca-arrange-worker 'in x);args=shlex.split(line.removeprefix(': && ').removesuffix(' && :'));args=[str(obj)if a=='CMakeFiles/orca-arrange-worker.dir/worker/main.cpp.o'else str(base/a)if a.endswith('.o')and not a.startswith('/')else a for a in args if not any(a.endswith('/worker/'+name+'.cpp.o')for name in ['native-instance-cut','native-fill-bed','nearest-empty-cell'])];args[args.index('-o')+1]=str(stage/'instance-cut-reference');subprocess.run(args,cwd=stage,check=True)
