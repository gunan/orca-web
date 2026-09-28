from pathlib import Path
import sys,hashlib,subprocess,json
root=Path(__file__).resolve().parents[2];source=Path(sys.argv[1]);build=Path(sys.argv[2]);commit='8500fcdccaa10b5099ac20d252af3a7c560046f1';paths=['src/slic3r/GUI/Plater.cpp','src/libslic3r/AppConfig.hpp'];assert subprocess.check_output(['git','-C',str(source),'rev-parse','HEAD'],text=True).strip()==commit;subprocess.run(['git','-C',str(source),'diff','--exit-code',commit,'--',*paths],check=True);native=(source/paths[0]).read_text()
def body(signature):
 start=native.index(signature);i=native.index('{',start)+1;depth=1
 while depth:depth+=(native[i]=='{')-(native[i]=='}');i+=1
 return native[start:i]
start=native.index('    bool not_empty_plate',native.index('bool Plater::open_3mf_file'));end=native.index('\n\n',native.index('    LoadType load_type',start));preamble=native[start:end]
defines='\n'.join(line for line in (source/paths[1]).read_text().splitlines() if line.startswith('#define') and 'PROJECT_LOAD_BEHAVIOUR' in line)
cpp='''// Native2.4.2 original load decision and Add preamble; minimal dialog/config adapters.
#include <string>
#include <map>
#include <vector>
#include <iostream>
#include <nlohmann/json.hpp>
using json=nlohmann::json;
'''+defines+'\n'+body('enum class LoadType : unsigned char')+''';
constexpr int wxID_OK=1;int dialogs=0,choice=2,accepted=1;
struct ProjectDropDialog{ProjectDropDialog(std::string){dialogs++;}int ShowModal(){return accepted;}int get_action(){return choice;}};
struct Config{std::map<std::string,std::string> values;std::string get(std::string key){return values[key];}void set(std::string key,std::string value){values[key]=value;}};
struct MainFrame{enum{tp3DEditor};void select_tab(int){}};
struct App{Config c;MainFrame frame;Config* app_config=&c;MainFrame* mainframe=&frame;};App app;App& wxGetApp(){return app;}
struct Model{std::vector<int> objects;};Model m;Model& model(){return m;}
'''+body('LoadType determine_load_type(std::string filename, std::string override_setting)')+'\nLoadType add(std::string filename){\n'+preamble+'\nreturn load_type;\n}\n'+'''
int main(){json out=json::array();for(std::string setting:{OPTION_PROJECT_LOAD_BEHAVIOUR_LOAD_ALL,OPTION_PROJECT_LOAD_BEHAVIOUR_ASK_WHEN_RELEVANT,OPTION_PROJECT_LOAD_BEHAVIOUR_ALWAYS_ASK,OPTION_PROJECT_LOAD_BEHAVIOUR_LOAD_GEOMETRY})for(std::string entry:{"open","add"})for(bool hasObjects:{false,true}){dialogs=0;app.c.values[SETTING_PROJECT_LOAD_BEHAVIOUR]=setting;m.objects.resize(hasObjects?1:0);auto result=entry=="add"?add("reference.3mf"):determine_load_type("reference.3mf","");out.push_back({{"behaviour",setting},{"entry",entry},{"hasObjects",hasObjects},{"action",dialogs?"ask":result==LoadType::OpenProject?"project":"geometry"}});}std::cout<<out.dump();}
'''
p=root/'tests/fixtures/native-project-load-reference.cpp';p.write_text(cpp);build.mkdir(parents=True,exist_ok=True);binary=build/'native-project-load-reference';subprocess.run(['clang++','-std=c++17','-O2','-I'+str(source/'deps_src'),str(p),'-o',str(binary)],check=True);sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest();data={'commit':commit,'sourceSha256':{name:sha(source/name) for name in paths},'generatorSha256':sha(Path(__file__)),'referenceSha256':sha(p),'binarySha256':sha(binary),'cases':json.loads(subprocess.check_output([str(binary)]))};(root/'tests/fixtures/native-project-load-reference.json').write_text(json.dumps(data,indent=2)+'\n');print('Compiled original native project-load decisions:16 preference/entry/model-state cases.')
