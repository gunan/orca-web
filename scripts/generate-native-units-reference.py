from pathlib import Path
import sys,subprocess,json,hashlib
source=Path(sys.argv[1]).resolve();root=Path(__file__).resolve().parents[1];commit='8500fcdccaa10b5099ac20d252af3a7c560046f1';paths=['src/slic3r/GUI/GCodeViewer.cpp','src/libslic3r/Utils.hpp','src/slic3r/GUI/Preferences.cpp','src/slic3r/GUI/Gizmos/GizmoObjectManipulation.cpp','src/libslic3r/AppConfig.cpp'];assert subprocess.check_output(['git','-C',str(source),'rev-parse','HEAD'],text=True).strip()==commit;subprocess.run(['git','-C',str(source),'diff','--exit-code',commit,'--',*paths],check=True)
gui,utils=(source/paths[0]).read_text(),(source/paths[1]).read_text()
def fn(text,sig):
 start=text.index(sig);i=text.index('{',start)+1;depth=1
 while depth:depth+=(text[i]=='{')-(text[i]=='}');i+=1
 return text[start:i]
# Role conversion and formatter execute unchanged source bodies. Narrow facade
# supplies one role; output statements are copied from the active Feature row.
cpp='''// Original OrcaSlicer 2.4.2 formatting functions and active Feature-row statements.
#include <nlohmann/json.hpp>
#include <iostream>
#include <string>
#include <map>
#include <cmath>
#include <cstdio>
using json=nlohmann::json;namespace GizmoObjectManipulation { constexpr double in_to_mm=25.4,oz_to_g=28.34952; }
using ExtrusionRole=int;struct Statistics {std::map<int,std::pair<double,double>>used_filaments_per_role;};
'''+fn(utils,'inline std::string short_time(')+'\n'+fn(utils,'inline std::string get_time_dhms(')+'\n'+fn(gui,'static std::string format_compact_weight(')+'''
struct TestViewer{Statistics m_print_statistics;json calculate(const json&input,bool imperial_units){m_print_statistics.used_filaments_per_role[1]={input.at("filamentMeters"),input.at("filamentGrams")};
'''+fn(gui,'    auto used_filament_per_role')+';\n'+fn(gui,'    auto format_distance')+''';
 char buffer[64];float time=input.at("seconds"),total=input.at("totalSeconds"),percent=total>0.f?time/total:0.f;json output;
 output["time"]=(time>0.0f)?short_time(get_time_dhms(time)):"";
 if(percent==0)::sprintf(buffer,"0");else percent>0.001?::sprintf(buffer,"%.1f",percent*100):::sprintf(buffer,"<0.1");output["percent"]=buffer;
 auto[model_used_filament_m,model_used_filament_g]=used_filament_per_role(1);
 ::sprintf(buffer,imperial_units?"%.2fin":"%.2fm",model_used_filament_m);output["length"]=buffer;
 output["weight"]=format_compact_weight(model_used_filament_g,imperial_units);
 output["distance"]=format_distance(input.at("distanceMm").get<float>());
 ::sprintf(buffer,imperial_units?"%.2f in":"%.2f m",input.at("filamentMm").get<double>()/(imperial_units?GizmoObjectManipulation::in_to_mm:1000.));output["summaryLength"]=buffer;
 output["summaryWeight"]=format_compact_weight(input.at("filamentGrams"),imperial_units);
 return output;}};
int main(){json input;std::cin>>input;TestViewer viewer;if(input.contains("fixed")){char buffer[512];::snprintf(buffer,sizeof(buffer),"%.*f",input.at("digits").get<int>(),input.at("fixed").get<double>());std::cout<<json(buffer).dump();}else std::cout<<json{{"metric",viewer.calculate(input,false)},{"imperial",viewer.calculate(input,true)}}.dump();}
'''
# Keep the ternary's separated namespace operator valid C++ tokens.
cpp=cpp.replace('):::sprintf',') : ::sprintf')
file=root/'tests/fixtures/native-units-reference.cpp';file.write_text(cpp);binary=root/'native-units-reference';subprocess.run(['clang++','-std=c++17','-O2','-I'+str(source/'deps_src'),' -DNDEBUG'.strip(),str(file),'-o',str(binary)],check=True)
cases=json.loads((root/'tests/fixtures/native-units-input.json').read_text());result={'commit':commit,'sourceSha256':{p:hashlib.sha256((source/p).read_bytes()).hexdigest()for p in paths},'referenceSha256':hashlib.sha256(file.read_bytes()).hexdigest(),'cases':[dict(case,expected=json.loads(subprocess.check_output([str(binary)],input=json.dumps(case['input']),text=True)))for case in cases]}
import math
values=[0.,-0.,2.5,3.5,-2.5,-3.5,2.625,-2.625,.005,math.nextafter(.005,0),math.nextafter(.005,1),-.005,1.005,.015,99.995,1e21,1e38,5e-324,-5e-324]
result['fixedCases']=[{'value':value,'digits':digits,'expected':json.loads(subprocess.check_output([str(binary)],input=json.dumps({'fixed':value,'digits':digits}),text=True))}for value in values for digits in [0,2,3,6]]
(root/'tests/fixtures/native-units-reference.json').write_text(json.dumps(result,indent=2)+'\n')
