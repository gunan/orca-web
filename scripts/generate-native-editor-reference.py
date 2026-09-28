"""Compile independent unmodified Orca editor formulas with narrow input adapters."""
from pathlib import Path
import subprocess,sys,json,hashlib
source=Path(sys.argv[1]).resolve();root=Path(__file__).resolve().parents[1];commit='8500fcdccaa10b5099ac20d252af3a7c560046f1'
paths=['src/libslic3r/GCode.cpp','src/libslic3r/Utils.hpp','src/slic3r/GUI/GCodeViewer.cpp','src/slic3r/GUI/IMSlider.hpp']
assert subprocess.check_output(['git','-C',str(source),'rev-parse','HEAD'],text=True).strip()==commit
subprocess.run(['git','-C',str(source),'diff','--exit-code',commit,'--',*paths],check=True)
gcode,utils,gui,slider=[(source/p).read_text() for p in paths]
def fn(text,sig):
 start=text.index(sig);i=text.index('{',start)+1;depth=1
 while depth:depth+=(text[i]=='{')-(text[i]=='}');i+=1
 return text[start:i]
smart=gui[gui.index('    int current_count = m_viewer.get_used_extruders_count();'):gui.index('\n\n    // BBS: data for rendering',gui.index('    int current_count = m_viewer.get_used_extruders_count();'))]
cpp='''// Pinned original OrcaSlicer 2.4.2 editor algorithms, AGPL-3.0-or-later.
#include <nlohmann/json.hpp>
#include <iostream>
#include <vector>
#include <map>
#include <cmath>
#include <algorithm>
#include <string>
#include <cstdio>
using json=nlohmann::json;
constexpr double PI=3.141592653589793238;template<class T>T sqr(T x){return x*x;}
'''+fn(utils,'inline std::string short_time(')+'\n'+fn(utils,'inline std::string get_time_dhms(')+'\n'+fn(gui,'static int find_close_layer_idx(')+'\n'+fn(slider,'constexpr double epsilon()')+'''
struct PrintEstimatedStatistics{enum class ETimeMode{Normal,Stealth};struct Mode{float time;};std::vector<Mode>modes;std::map<size_t,double>total_volumes_per_extruder,model_volumes_per_extruder;};
struct GCodeProcessorResult{PrintEstimatedStatistics print_statistics;};
struct GCodeProcessor{GCodeProcessorResult result;const auto&get_result()const{return result;}bool is_stealth_time_estimator_enabled()const{return result.print_statistics.modes.size()>1;}};
struct Extruder{size_t index;double diameter,density,cost;size_t id()const{return index;}double filament_diameter()const{return diameter;}double filament_density()const{return density;}double filament_cost()const{return cost;}};
struct PrintConfig{struct Float{double value;double getFloat()const{return value;}}time_cost;};
struct PrintStatistics{std::string estimated_normal_print_time,estimated_silent_print_time;double total_extruded_volume,total_used_filament,total_weight,total_cost;std::map<size_t,double>filament_stats;};
'''+fn(gcode,'    static void update_print_estimated_stats(')+'''
namespace libvgcode{enum class EViewType{FeatureType,ColorPrint,Width};}
struct Preview{struct Viewer{int count=0;int get_used_extruders_count()const{return count;}}m_viewer;int m_last_extruder_count_default_applied=0,m_view_type_sel=0;libvgcode::EViewType view=libvgcode::EViewType::Width;std::vector<libvgcode::EViewType>view_type_items{libvgcode::EViewType::FeatureType,libvgcode::EViewType::ColorPrint,libvgcode::EViewType::Width};void set_view_type(libvgcode::EViewType value){view=value;}void load(){
'''+smart+'''
}};
int main(){json in;std::cin>>in;json out;GCodeProcessor processor;const auto&data=in["data"],context=in["context"];
 for(const auto&mode:data["modes"])processor.result.print_statistics.modes.push_back({mode["processorSeconds"].get<float>()});processor.result.print_statistics.total_volumes_per_extruder=data["materialStatistics"]["totalVolumes"].get<std::map<size_t,double>>();processor.result.print_statistics.model_volumes_per_extruder=data["materialStatistics"]["modelVolumes"].get<std::map<size_t,double>>();std::vector<Extruder>extruders;for(size_t i=0;i<context["filamentDiameters"].size();i++)extruders.push_back({i,context["filamentDiameters"][i],context["filamentDensities"][i],context["filamentCosts"][i]});PrintStatistics stats;PrintConfig config{{context["timeCost"]}};update_print_estimated_stats(processor,extruders,stats,config);out["summary"]={{"source","native-editor-formula"},{"filamentMm",stats.total_used_filament},{"filamentGrams",stats.total_weight},{"filamentMm3",stats.total_extruded_volume},{"cost",stats.total_cost},{"timeCost",config.time_cost.value}};
 std::vector<double>zs;for(const auto&layer:data["layers"])zs.push_back(layer["z"]);out["events"]=json::array();for(const auto&event:context["customEvents"]){double z=event["z"];int layer=find_close_layer_idx(zs,z,epsilon());json item={{"type",event["type"]},{"extruder",event["extruder"]},{"z",z},{"layer",layer+1},{"seconds",json::array()},{"labels",json::array()}};for(size_t mode=0;mode<data["modes"].size();mode++){float seconds=0;for(int i=0;i<layer;i++)seconds+=data["layers"][i]["seconds"][mode].get<float>();item["seconds"].push_back(seconds);item["labels"].push_back(short_time(get_time_dhms(seconds)));}out["events"].push_back(item);}
 out["smart"]=json::array();Preview preview;for(int count:{0,1,2,3,2,1,1}){preview.m_viewer.count=count;preview.load();out["smart"].push_back({count,preview.m_last_extruder_count_default_applied,int(preview.view)});preview.view=libvgcode::EViewType::Width;}
 out["times"]=json::array();for(float seconds:{0.f,.3f,1.f,59.9f,60.f,3599.f,3629.f,3630.f,86399.f,86400.f,90061.f})out["times"].push_back({seconds,short_time(get_time_dhms(seconds))});out["summaryTimeLabels"]=json::array();for(const auto&mode:processor.result.print_statistics.modes)out["summaryTimeLabels"].push_back(short_time(get_time_dhms(mode.time)));std::cout<<out.dump();}
'''
file=root/'tests/fixtures/native-editor-reference.cpp';file.write_text(cpp);binary=root/'editor-reference';subprocess.run(['clang++','-std=c++17','-O2',str(file),'-I'+str(source/'deps_src'),'-o',str(binary)],check=True)
result={'commit':commit,'sourceSha256':{p:hashlib.sha256((source/p).read_bytes()).hexdigest()for p in paths},'referenceSha256':hashlib.sha256(file.read_bytes()).hexdigest(),'cases':[]}
for name in sys.argv[2:]:
 probe=json.loads(Path(name).read_text());result['cases'].append({**probe,'expected':json.loads(subprocess.check_output([str(binary)],input=json.dumps(probe),text=True))})
(root/'tests/fixtures/native-editor-reference.json').write_text(json.dumps(result,indent=2)+'\n');print('Captured original editor summaries, event lookup/times and smart defaults')
