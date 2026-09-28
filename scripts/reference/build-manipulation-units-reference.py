from pathlib import Path
import sys,subprocess,json,hashlib,re
source=Path(sys.argv[1]).resolve();root=Path(__file__).resolve().parents[2];commit='8500fcdccaa10b5099ac20d252af3a7c560046f1';name='src/slic3r/GUI/Gizmos/GizmoObjectManipulation.cpp';path=source/name
assert subprocess.check_output(['git','-C',str(source),'rev-parse','HEAD'],text=True).strip()==commit
subprocess.run(['git','-C',str(source),'diff','--exit-code',commit,'--',name],check=True);native=path.read_text()
def method(signature):
 start=native.index(signature);i=native.index('{',start)+1;depth=1
 while depth:depth+=(native[i]=='{')-(native[i]=='}');i+=1
 return native[start:i]
methods=[method('void GizmoObjectManipulation::update_buffered_value()'),method('void GizmoObjectManipulation::on_change(')]
constants='\n'.join(re.findall(r'^const double GizmoObjectManipulation::(?:in_to_mm|mm_to_in) = .*?;',native,re.M));assert len(constants.splitlines())==2
cpp='''// Original OrcaSlicer 2.4.2 methods; only GUI selection/edit dispatch is replaced by an output recorder.
#include <nlohmann/json.hpp>
#include <array>
#include <string>
#include <iostream>
using json=nlohmann::json;
struct Vec {std::array<double,3> values;Vec operator*(double factor)const{auto result=*this;for(auto&v:result.values)v*=factor;return result;}};
struct GizmoObjectManipulation {
 static const double in_to_mm,mm_to_in;bool m_imperial_units;
 Vec m_new_position,m_new_rotation,m_new_absolute_rotation,m_new_scale,m_new_size;
 Vec m_buffered_position,m_buffered_rotation,m_buffered_absolute_rotation,m_buffered_scale,m_buffered_size;
 struct Cache{bool valid;bool is_valid()const{return valid;}}m_cache;
 json edits=json::array();
 void change_position_value(int axis,double value){edits.push_back({{"key","position"},{"axis",axis},{"value",value}});}
 void change_rotation_value(int axis,double value){edits.push_back({{"key","rotation"},{"axis",axis},{"value",value}});}
 void change_absolute_rotation_value(int axis,double value){edits.push_back({{"key","absolute_rotation"},{"axis",axis},{"value",value}});}
 void change_scale_value(int axis,double value){edits.push_back({{"key","scale"},{"axis",axis},{"value",value}});}
 void change_size_value(int axis,double value){edits.push_back({{"key","size"},{"axis",axis},{"value",value}});}
 void update_buffered_value();void on_change(const std::string&,int,double);
};
'''+constants+'\n'+'\n'.join(methods)+'''
int main(){json input;std::cin>>input;GizmoObjectManipulation tool;tool.m_imperial_units=input.at("imperial");tool.m_cache.valid=input.value("valid",true);
 tool.m_new_position.values=input.at("position");tool.m_new_rotation.values=input.at("rotation");tool.m_new_absolute_rotation.values=input.at("absolute_rotation");tool.m_new_scale.values=input.at("scale");tool.m_new_size.values=input.at("size");tool.update_buffered_value();
 for(auto&e:input.at("edits"))tool.on_change(e.at("key"),e.at("axis"),e.at("value"));
 std::cout<<json{{"position",tool.m_buffered_position.values},{"rotation",tool.m_buffered_rotation.values},{"absolute_rotation",tool.m_buffered_absolute_rotation.values},{"scale",tool.m_buffered_scale.values},{"size",tool.m_buffered_size.values},{"edits",tool.edits}}.dump();}
'''
file=root/'tests/fixtures/native-manipulation-units-reference.cpp';file.write_text(cpp)
build=Path(sys.argv[2]).resolve();build.mkdir(parents=True,exist_ok=True);binary=build/'native-manipulation-units-reference';subprocess.run(['clang++','-std=c++17','-O2','-I'+str(source/'deps_src'),str(file),'-o',str(binary)],check=True)
cases=[]
for imperial in [False,True]:
 for i,values in enumerate([[0.,25.4,-50.8],[1.,123.456789,-.0001],[2540.,1e-6,-2.54e5],[.005,99.995,1.005]]):
  for valid in [False,True]:
   item={'imperial':imperial,'valid':valid,'position':values,'rotation':[15.,-90.,.001],'absolute_rotation':[360.,-.1,12.345],'scale':[1.,.01,1000.],'size':[abs(v) for v in values],'edits':[{'key':key,'axis':axis,'value':v} for key in ['position','rotation','absolute_rotation','scale','size','unknown'] for axis,v in enumerate(values)]}
   cases.append({'name':f'{"imperial" if imperial else "metric"}-{i}-{"valid" if valid else "invalid-cache"}','input':item,'expected':json.loads(subprocess.check_output([str(binary)],input=json.dumps(item),text=True))})
hash=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
out={'commit':commit,'source':name,'sourceSha256':hash(path),'generatorSha256':hash(Path(__file__)),'referenceSha256':hash(file),'binarySha256':hash(binary),'cases':cases};(root/'tests/fixtures/native-manipulation-units-reference.json').write_text(json.dumps(out,indent=2)+'\n');print(f'Compiled original update_buffered_value and on_change; {len(cases)} cases.')
