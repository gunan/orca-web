#!/usr/bin/env python3
"""Compile unchanged pinned GUI methods against small data-only adapters.
No wx event loop, installed Orca launch, printer access, or production helper.
"""
import argparse,hashlib,json,pathlib,re,subprocess
p=argparse.ArgumentParser();p.add_argument('--source',required=True);p.add_argument('--output',required=True);a=p.parse_args();src=pathlib.Path(a.source);out=pathlib.Path(a.output);out.mkdir(parents=True,exist_ok=True)
paths=['src/slic3r/GUI/GUI_ObjectList.cpp','src/slic3r/GUI/GUI_Factories.cpp','src/slic3r/GUI/ObjectDataViewModel.cpp','src/libslic3r/Preset.cpp']
expected={'src/slic3r/GUI/GUI_ObjectList.cpp': '026e51a48aa0d6c51d9f8818da699f622b9e438ac9c239be0e2d619de582389d', 'src/slic3r/GUI/GUI_Factories.cpp': '5b8546e5084dec0652f86ff8dd00a2a6932d6d9a0d7a2b58d586ddc4d565f6e2', 'src/slic3r/GUI/ObjectDataViewModel.cpp': '0a5f59c6e14c7fc115769788f5293ed0eb470d26066f508b196ffe148142f310', 'src/libslic3r/Preset.cpp': 'af50e30fcb9c17d3eb3f9fc579cb710fe616f4a863a02a4e74bc36cd3b395ee2'}
for file,sha in expected.items():
 if hashlib.sha256((src/file).read_bytes()).hexdigest()!=sha:raise SystemExit('Pinned source mismatch: '+file)
def method(path,start):
 text=(src/path).read_text();i=text.index(start);brace=text.index('{',i);level=1;j=brace+1
 while level:
  level+=(text[j]=='{')-(text[j]=='}');j+=1
 return text[i:j]
methods=[method(paths[0],'static bool can_add_volumes_to_object('),method(paths[1],'static bool is_improper_category('),method(paths[2],'void ObjectDataViewModelNode::SetIdx(')]
header='''#include <nlohmann/json.hpp>
#include <vector>
#include <string>
#include <cstdio>
#include <iostream>
using nlohmann::json;
struct ModelVolume { bool connector,model;bool is_cut_connector() const{return connector;}bool is_model_part() const{return model;} };
struct ModelObject { bool cut;std::vector<ModelVolume*> volumes;bool is_cut()const{return cut;} };
#define _(x) x
#define _devL(x) x
struct wxString {static std::string Format(const char* f,int a,int b=0){char result[128];snprintf(result,sizeof(result),f,a,b);return result;}};
constexpr int itInstance=16;
struct ObjectDataViewModelNode {int m_idx=0,m_type=itInstance,m_plate_idx=-1;std::string m_name;void SetIdx(const int& idx);};
'''
main='''
int main(){json result={{"volumes",json::array()},{"categories",json::array()},{"labels",json::array()}};
for(bool cut:{false,true})for(int count=0;count<=4;count++)for(int mask=0;mask<(1<<(count*2));mask++){
 ModelObject object;object.cut=cut;std::vector<ModelVolume> parts;json input=json::array();
 for(int i=0;i<count;i++){bool connector=(mask>>(2*i))&1,model=(mask>>(2*i+1))&1;parts.push_back({connector,model});input.push_back({{"connector",connector},{"model",model}});}
 for(auto& v:parts)object.volumes.push_back(&v);
 result["volumes"].push_back({{"cut",cut},{"parts",input},{"expected",can_add_volumes_to_object(&object)}});
}
for(std::string category:{"","Extruders","Wipe options","Support material","Support","Quality","Shell","Speed"})for(int filaments:{1,2})for(bool object:{false,true})result["categories"].push_back({{"category",category},{"filaments",filaments},{"object",object},{"excluded",is_improper_category(category,filaments,object)}});
for(int plate:{-1,0,1,2})for(int index:{0,1,4}){ObjectDataViewModelNode node;node.m_plate_idx=plate;node.SetIdx(index);result["labels"].push_back({{"plate",plate},{"index",index},{"expected",node.m_name}});}
std::cout<<result.dump(2)<<"\\n";}
'''
(out/'reference.cpp').write_text(header+'\n'.join(methods)+main)
subprocess.run(['clang++','-std=c++17','-O1','-I'+str(src/'deps_src'),str(out/'reference.cpp'),'-o',str(out/'reference')],check=True)
result=json.loads(subprocess.check_output([str(out/'reference')],text=True));result['provenance']={'version':'2.4.2','commit':'8500fcdccaa10b5099ac20d252af3a7c560046f1','methodHashes':[hashlib.sha256(m.encode()).hexdigest() for m in methods],'sourceFiles':[{'path':path,'sha256':hashlib.sha256((src/path).read_bytes()).hexdigest()} for path in paths],'adapter':'ModelVolume connector/model flags, ModelObject cut flag; wxString::Format uses C snprintf. Bodies unchanged.'}
(out/'native-object-tree-reference.json').write_text(json.dumps(result,indent=2)+'\n');print('Reference cases:',sum(len(result[k]) for k in ['volumes','categories','labels']))

preset=src/'src/libslic3r/Preset.cpp';body=preset.read_text().split('static std::vector<std::string> s_Preset_print_options{',1)[1].split('};',1)[0];body=re.sub(r'//[^\n]*|/\*.*?\*/','',body,flags=re.S);keys=re.findall(r'"([a-zA-Z0-9_]+)"',body)
(out/'native-tree-reset-keys.json').write_text(json.dumps({'provenance':{'version':'2.4.2','commit':'8500fcdccaa10b5099ac20d252af3a7c560046f1','path':'src/libslic3r/Preset.cpp','sha256':hashlib.sha256(preset.read_bytes()).hexdigest()},'keys':keys},indent=2)+'\n')
