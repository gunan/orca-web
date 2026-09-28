from pathlib import Path
import subprocess,sys,json,hashlib,tempfile
source=Path(sys.argv[1]);root=Path(__file__).resolve().parents[1];commit='8500fcdccaa10b5099ac20d252af3a7c560046f1';paths=['src/libslic3r/Preset.cpp','src/libslic3r/PresetBundle.cpp','src/slic3r/GUI/GCodeViewer.cpp']
assert subprocess.check_output(['git','-C',str(source),'rev-parse','HEAD'],text=True).strip()==commit
subprocess.run(['git','-C',str(source),'diff','--exit-code',commit,'--',*paths],check=True)
def fn(text,sig):
 start=text.index(sig);i=text.index('{',start)+1;depth=1
 while depth:depth+=(text[i]=='{')-(text[i]=='}');i+=1
 return text[start:i]
preset=(source/paths[0]).read_text();bundle=(source/paths[1]).read_text()
cpp='''// Pinned original OrcaSlicer2.4.2 model/asset lookup; AGPL-3.0-or-later.
#include <nlohmann/json.hpp>
#include <filesystem>
#include <iostream>
#include <string>
#include <vector>
#include <map>
#include <algorithm>
namespace boost{namespace filesystem{using path=std::filesystem::path;static bool exists(const path&p){return std::filesystem::exists(p);}}}
namespace Slic3r{
std::string data,resources;static std::string data_dir(){return data;}static std::string resources_dir(){return resources;}
struct ConfigOptionString{std::string value;};struct Config{ConfigOptionString model;template<class T>const ConfigOptionString*opt(const std::string&)const{return &model;}};
struct VendorProfile{struct PrinterModel{std::string id,name,hotend_model;};std::string id;std::vector<PrinterModel>models;};struct Preset{VendorProfile*vendor;Config config;};
struct PresetBundle{std::map<std::string,VendorProfile>vendors;std::string get_hotend_model_for_printer_model(std::string model_name);};
namespace PresetUtils{
'''+fn(preset,'const VendorProfile::PrinterModel* system_printer_model(const Preset &preset)')+'\n'+fn(preset,'std::string system_printer_hotend_model(const Preset& preset)')+'\n}\n'+fn(bundle,'std::string PresetBundle::get_hotend_model_for_printer_model(std::string model_name)')+'''
}
int main(){using namespace Slic3r;using json=nlohmann::json;json input;std::cin>>input;const std::string root=input["root"];data=root+"/data";resources=root+"/resources";PresetBundle b;for(const auto&m:input["models"]){const std::string vendor=m["vendor"];auto&v=b.vendors[vendor];v.id=vendor;v.models.push_back({m["id"],m["name"],m["hotendModel"]});}std::string result;if(input["system"]==true){Preset p{&b.vendors[input["vendor"].get<std::string>()],{{input["printerModel"].get<std::string>()}}};result=PresetUtils::system_printer_hotend_model(p);}else{std::string name=input["printerModel"];result=b.get_hotend_model_for_printer_model(name.empty()?"MyKlipper 0.4 nozzle":name);}std::cout<<json({{"path",std::filesystem::relative(result,root).generic_string()},{"exists",std::filesystem::exists(result)}}).dump();}
'''
file=root/'tests/fixtures/hotend-selection-reference.cpp';file.write_text(cpp);binary=root/'hotend-selection-reference';subprocess.run(['clang++','-std=c++17','-O2',str(file),'-I'+str(source/'deps_src'),'-o',str(binary)],check=True)
models=[{'id':'ID-A','name':'Friendly','vendor':'A','hotendModel':'a.stl'},{'id':'ID-Z','name':'Friendly','vendor':'Z','hotendModel':'z.stl'}]
cases=[{'name':'system binds own vendor and model ID','system':True,'vendor':'A','printerModel':'ID-A','files':['resources/profiles/A/a.stl']},{'name':'custom duplicate display name uses last vendor','system':False,'printerModel':'Friendly','files':['resources/profiles/Z/z.stl']},{'name':'user vendor asset has native precedence','system':True,'vendor':'A','printerModel':'ID-A','files':['data/vendor/A/a.stl','resources/profiles/A/a.stl']},{'name':'missing vendor file falls back to bundled default','system':False,'printerModel':'Friendly','files':[]},{'name':'unknown custom model','system':False,'printerModel':'Unknown','files':[]},{'name':'empty custom model invokes native Orca default model','system':False,'printerModel':'','models':[{'id':'default-id','name':'MyKlipper 0.4 nozzle','vendor':'A','hotendModel':'default.stl'}],'files':['resources/profiles/A/default.stl']},{'name':'empty system model stays native default','system':True,'vendor':'A','printerModel':'','files':[]},{'name':'same-vendor duplicate display names use first model','system':False,'printerModel':'Friendly','models':[models[0],{**models[0],'id':'ID-A2','hotendModel':'second.stl'}],'files':['resources/profiles/A/a.stl','resources/profiles/A/second.stl']},{'name':'system ID is not model display name','system':True,'vendor':'A','printerModel':'Friendly','files':[]},{'name':'missing default returns native path but no geometry','system':False,'printerModel':'Unknown','files':[],'default':False}]
with tempfile.TemporaryDirectory(prefix='orca-hotend-reference-')as tmp:
 for i,c in enumerate(cases):
  directory=Path(tmp)/str(i);c.setdefault('models',models)
  for relative in c['files']+([]if c.get('default')is False else['resources/profiles/hotend.stl']):
   p=directory/relative;p.parent.mkdir(parents=True,exist_ok=True);p.write_text('native existence fixture')
  directory.mkdir(exist_ok=True);c['expected']=json.loads(subprocess.check_output([str(binary)],input=json.dumps({'root':str(directory),**c}),text=True))
result={'commit':commit,'sourceSha256':{p:hashlib.sha256((source/p).read_bytes()).hexdigest()for p in paths},'referenceSha256':hashlib.sha256(file.read_bytes()).hexdigest(),'cases':cases}
(root/'tests/fixtures/hotend-selection-reference.json').write_text(json.dumps(result,indent=2)+'\n');print(len(cases),'original hotend selection cases')
