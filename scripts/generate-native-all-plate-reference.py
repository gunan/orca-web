from pathlib import Path
import subprocess,sys,json,hashlib
source=Path(sys.argv[1]).resolve();root=Path(__file__).resolve().parents[1];commit='8500fcdccaa10b5099ac20d252af3a7c560046f1';paths=['src/slic3r/GUI/GCodeViewer.cpp','src/libslic3r/Utils.hpp'];assert subprocess.check_output(['git','-C',str(source),'rev-parse','HEAD'],text=True).strip()==commit;subprocess.run(['git','-C',str(source),'diff','--exit-code',commit,'--',*paths],check=True)
gui,utils=[(source/p).read_text()for p in paths]
def fn(text,sig):
 start=text.index(sig);i=text.index('{',start)+1;depth=1
 while depth:depth+=(text[i]=='{')-(text[i]=='}');i+=1
 return text[start:i]
section=fn(gui,'void GCodeViewer::render_all_plates_stats(')
variables=section[section.index('    std::map<int, double> model_volume'):section.index('    auto max_width')]
volume=fn(section,'    auto get_used_filament_from_volume')+';'
loop=section[section.index('        PartPlateList& plate_list'):section.index('\n        char buff[64];')]
cpp='''// Original all-plate accumulation/conversion blocks, Orca2.4.2 AGPL.
#include <nlohmann/json.hpp>
#include <iostream>
#include <vector>
#include <map>
#include <cmath>
#include <cstdio>
using json=nlohmann::json;constexpr double PI=3.141592653589793238;template<class T>T sqr(T x){return x*x;}
namespace GizmoObjectManipulation{constexpr double in_to_mm=25.4;}
'''+fn(utils,'inline std::string short_time(')+'\n'+fn(utils,'inline std::string get_time_dhms(')+'''
struct PrintEstimatedStatistics{struct Mode{float time=0;};Mode modes[2];std::map<size_t,double>model_volumes_per_extruder,support_volumes_per_extruder,wipe_tower_volumes_per_extruder,flush_per_filament;};
struct PrintBase{};struct Print:PrintBase{struct Stats{double total_cost=0;}stats;const Stats&print_statistics()const{return stats;}};struct Result{PrintEstimatedStatistics print_statistics;};
struct Plate{Result result;Print print;std::vector<int>extruders;Result*get_slice_result(){return &result;}const auto&get_extruders(bool)const{return extruders;}void get_print(PrintBase**p,void*,void*){*p=&print;}};
struct PartPlateList{std::vector<Plate*>plates;const auto&get_nonempty_plate_list()const{return plates;}};struct Plater{PartPlateList list;std::vector<int>colors;PartPlateList&get_partplate_list(){return list;}const auto&get_extruders_colors()const{return colors;}};
struct App{Plater p;Plater*plater(){return &p;}};App application;App&wxGetApp(){return application;}
struct Viewer{struct NativeViewer{size_t mode=0;size_t get_time_mode()const{return mode;}}m_viewer;std::vector<float>diameters,densities;json calculate(bool imperial_units){auto&filament_diameters=diameters;auto&filament_densities=densities;
'''+variables+volume+loop+'''
json result={{"seconds",total_time_all_plates},{"cost",total_cost_all_plates},{"timeLabel",short_time(get_time_dhms(total_time_all_plates))},{"mask",displayed_columns},{"rows",json::array()}};size_t i=0;
for(const auto&entry:model_volume_of_extruders_all_plates){json row={{"tool",entry.first},{"amounts",json::object()}};float column_sum_m=0,column_sum_g=0;
'''+''.join('if(displayed_columns & ColumnData::'+key+'){row["amounts"]["'+name+'"]={'+prefix+'_m_all_plates[i],'+prefix+'_g_all_plates[i]};column_sum_m+='+prefix+'_m_all_plates[i];column_sum_g+='+prefix+'_g_all_plates[i];}\n'for key,name,prefix in [('Model','model','model_used_filaments'),('Support','support','support_used_filaments'),('Flushed','flushed','flushed_filaments'),('WipeTower','tower','wipe_tower_used_filaments')])+'''
row["total"]={column_sum_m,column_sum_g};result["rows"].push_back(row);i++;}return result;}};
int main(){json input;std::cin>>input;Viewer viewer;viewer.diameters=input["plates"][0]["data"]["filamentDiameters"].get<std::vector<float>>();viewer.densities=input["plates"][0]["data"]["filamentDensities"].get<std::vector<float>>();application.p.colors.resize(input["plates"][0]["data"]["toolsColors"].size());std::vector<Plate>plates(input["plates"].size());for(size_t i=0;i<plates.size();i++){auto&plate=plates[i];const auto&source=input["plates"][i],data=source["data"];const auto&stats=data["materialStatistics"];plate.extruders=source["extruders"].get<std::vector<int>>();plate.print.stats.total_cost=data["editorStatistics"]["cost"];auto&target=plate.result.print_statistics;target.model_volumes_per_extruder=stats["modelVolumes"].get<std::map<size_t,double>>();target.support_volumes_per_extruder=stats["supportVolumes"].get<std::map<size_t,double>>();target.wipe_tower_volumes_per_extruder=stats["towerVolumes"].get<std::map<size_t,double>>();target.flush_per_filament=stats["flushedVolumes"].get<std::map<size_t,double>>();for(const auto&mode:data["modes"])target.modes[mode["name"]=="normal"?0:1].time=mode["processorSeconds"];application.p.list.plates.push_back(&plate);}
json result;for(int mode=0;mode<2;mode++){viewer.m_viewer.mode=mode;result[mode?"stealth":"normal"]={{"metric",viewer.calculate(false)},{"imperial",viewer.calculate(true)}};}result["timeCases"]=json::array();for(float seconds:{0.f,.0000001f,.0000005f,.9999999f,59.9f,60.f,3599.f,3630.f,86399.f,86400.f,999999.f,9999999.f})result["timeCases"].push_back({seconds,short_time(get_time_dhms(seconds))});std::cout<<result.dump();}
'''
file=root/'tests/fixtures/native-all-plate-reference.cpp';file.write_text(cpp);binary=root/'all-plate-reference';subprocess.run(['clang++','-std=c++17','-O2',str(file),'-I'+str(source/'deps_src'),'-o',str(binary)],check=True)
result={'commit':commit,'sourceSha256':{p:hashlib.sha256((source/p).read_bytes()).hexdigest()for p in paths},'referenceSha256':hashlib.sha256(file.read_bytes()).hexdigest(),'cases':[]}
for case in json.loads((root/'tests/fixtures/native-all-plate-input.json').read_text()):result['cases'].append({**case,'expected':json.loads(subprocess.check_output([str(binary)],input=json.dumps(case['input']),text=True))})
(root/'tests/fixtures/native-all-plate-reference.json').write_text(json.dumps(result,indent=2)+'\n');print('Captured original all-plate volume, float total and native time functions')
