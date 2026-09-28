#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-only
"""Independent pinned CutUtils KeepAsParts geometry + reset, no production adapter.
Build only in --output. The arrangement build/dependency/source inputs are read-only.
"""
from pathlib import Path
import argparse,subprocess,shlex,json,hashlib,re
p=argparse.ArgumentParser();p.add_argument('--source',type=Path,required=True);p.add_argument('--build',type=Path,required=True);p.add_argument('--output',type=Path,required=True);p.add_argument('--sanitize',action='store_true');a=p.parse_args();source=a.source.resolve();base=a.build.resolve();out=a.output.resolve();out.mkdir(parents=True,exist_ok=True)
manifest=json.loads((Path(__file__).with_name('cut-parts-source-hashes.json')).read_text())
production=json.loads((base/'build-manifest.json').read_text())
if hashlib.sha256((base/'orca-arrange-worker').read_bytes()).hexdigest()!=production['binarySha256']:raise SystemExit('Paired production helper hash mismatch')
if production['sourceManifest']['commit']!=manifest['sourceCommit']:raise SystemExit('Production source revision mismatch')
if subprocess.check_output(['git','-C',str(source),'rev-parse','HEAD'],text=True).strip()!=manifest['sourceCommit']:raise SystemExit('Pinned source checkout mismatch')

for name,expected in manifest['sources'].items():
 if hashlib.sha256((source/name).read_bytes()).hexdigest()!=expected:raise SystemExit('Pinned source mismatch: '+name)
text=(source/'src/libslic3r/CutUtils.cpp').read_text()
def method(signature):
 start=text.index(signature);cursor=text.index('(',start)+1;depth=1
 while depth:depth+=(text[cursor]=='(')-(text[cursor]==')');cursor+=1
 brace=text.index('{',cursor);level=1;end=brace+1
 while level:level+=(text[end]=='{')-(text[end]=='}');end+=1
 return text[start:end]
methods='\n\n'.join(method(sig)for sig in ['static void add_cut_volume(','static void process_volume_cut(','static void process_modifier_cut(','static void process_solid_part_cut(','static void reset_instance_transformation('])
main=r'''
#include "libslic3r/Model.hpp"
#include "libslic3r/CutUtils.hpp"
#include "libslic3r/TriangleMeshSlicer.hpp"
#include <nlohmann/json.hpp>
#include <fstream>
#include <iostream>
using namespace Slic3r;using namespace Slic3r::Geometry;using json=nlohmann::json;
METHODS
Transform3d frame(const json&v){Transform3d m;for(int i=0;i<16;i++)m.matrix().data()[i]=v.at(i).get<double>();return m;}
json values(const Transform3d&m){json v=json::array();for(int i=0;i<16;i++)v.push_back(m.matrix().data()[i]);return v;}
int main(int argc,char**argv){try{json cases;std::ifstream(argv[1])>>cases;json result=json::array();for(const auto&c:cases){Model model;auto*object=model.add_object();object->name=c.at("name");for(const auto&p:c.at("parts")){indexed_triangle_set mesh;for(const auto&v:p.at("vertices"))mesh.vertices.emplace_back(v[0].get<float>(),v[1].get<float>(),v[2].get<float>());for(const auto&f:p.at("triangles"))mesh.indices.emplace_back(f[0].get<int>(),f[1].get<int>(),f[2].get<int>());auto*vol=object->add_volume(TriangleMesh(std::move(mesh)));vol->name=p.at("name");vol->set_type(ModelVolume::type_from_string(p.at("type")));vol->set_transformation(Transformation(frame(p.at("matrix"))*vol->get_matrix()));}for(const auto&i:c.at("instances")){auto*inst=object->add_instance();inst->set_transformation(Transformation(frame(i.at("matrix"))));inst->auto_drop=i.at("autoDrop");inst->printable=i.at("printable");}const size_t selected=c.at("selected");const Transform3d cut=frame(c.at("cutMatrix")),instance=object->instances.at(selected)->get_transformation().get_matrix_no_offset(),inverse=Transformation(cut).get_rotation_matrix().inverse()*translation_transform(-Transformation(cut).get_offset());ModelObject*upper=nullptr;object->clone_for_cut(&upper);const auto flags=ModelObjectCutAttribute::KeepUpper|ModelObjectCutAttribute::KeepLower|ModelObjectCutAttribute::KeepAsParts;for(auto*vol:object->volumes){vol->reset_extra_facets();if(vol->is_model_part())process_solid_part_cut(vol,instance,cut,flags,upper,nullptr);else process_modifier_cut(vol,instance,inverse,flags,upper,nullptr);}reset_instance_transformation(upper,selected,cut);const double before=upper->min_z();upper->ensure_on_bed(false);json parts=json::array(),instances=json::array();for(const auto*v:upper->volumes){TriangleMesh mesh(v->mesh());mesh.transform(v->get_matrix());json vertices=json::array(),triangles=json::array();for(const auto&p:mesh.its.vertices)vertices.push_back({p.x(),p.y(),p.z()});for(const auto&f:mesh.its.indices)triangles.push_back({f[0],f[1],f[2]});json raw=json::array();for(const auto&p:v->mesh().its.vertices)raw.push_back({p.x(),p.y(),p.z()});parts.push_back({{"rawVertices",raw},{"matrix",values(v->get_matrix())},{"name",v->name},{"type",ModelVolume::type_to_string(v->type())},{"fromUpper",v->is_from_upper()},{"vertices",vertices},{"triangles",triangles}});}for(const auto*i:upper->instances)instances.push_back(values(i->get_matrix()));result.push_back({{"name",upper->name},{"parts",parts},{"instances",instances},{"minimumZBeforeGrounding",before},{"minimumZAfterGrounding",upper->min_z()}});model.objects.push_back(upper);}std::ofstream(argv[2])<<result.dump(2);}catch(const std::exception&e){std::cerr<<e.what();return 1;}}
'''.replace('METHODS',methods)
file=out/'reference.cpp';file.write_text(main)
commands=subprocess.check_output(['ninja','-C',str(base),'-t','commands'],text=True).splitlines();template=shlex.split(next(x for x in commands if x.endswith('/worker/main.cpp')))
objects=[];diagnostics=['-fsanitize=address','-g'] if a.sanitize else []
def compile_cpp(file):
 obj=out/(file.stem+'.o');args=template.copy();args[1:1]=diagnostics;args[args.index('-c')+1]=str(file)
 for flag in ['-o','-MT']:args[args.index(flag)+1]=str(obj)
 args[args.index('-MF')+1]=str(obj)+'.d';args.insert(1,'-I'+str(source/'deps_src/glu-libtess/include'));subprocess.run(args,cwd=out,check=True);objects.append(str(obj))
for file in [file,source/'src/libslic3r/TriangleMeshSlicer.cpp',source/'src/libslic3r/Tesselate.cpp']:compile_cpp(file)
for name in ['dict','geom','memalloc','mesh','normal','priorityq','render','sweep','tess','tessmono']:
 file=source/'deps_src/glu-libtess/src'/(name+'.c');obj=out/('glu-'+name+'.o');subprocess.run(['clang',*diagnostics,'-O1','-DNDEBUG','-I'+str(source/'deps_src/glu-libtess/include'),'-c',str(file),'-o',str(obj)],check=True);objects.append(str(obj))
line=next(x for x in commands if ' -o orca-arrange-worker 'in x);args=shlex.split(line.removeprefix(': && ').removesuffix(' && :'));args=[str(base/value)if value.endswith('.o')and not value.startswith('/')else value for value in args if not any(value.endswith('/worker/'+name+'.cpp.o')for name in ['main','native-instance-cut','native-cut-to-parts','native-fill-bed','nearest-empty-cell']) and not value.endswith(('/TriangleMeshSlicer.cpp.o','/Tesselate.cpp.o')) and not ('glu-libtess/' in value and value.endswith('.o'))];args[args.index('-o')+1]=str(out/'cut-parts-reference');args[1:1]=objects+diagnostics;subprocess.run(args,cwd=out,check=True)
(out/'source.json').write_text(json.dumps({**manifest,'extractedMethodsSha256':hashlib.sha256(methods.encode()).hexdigest(),'referenceGeneratorSha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),'productionBinarySha256':production['binarySha256'],'referenceBinarySha256':hashlib.sha256((out/'cut-parts-reference').read_bytes()).hexdigest()},indent=2)+'\n');print('Built unchanged CutUtils KeepAsParts + native cut_mesh reference')
