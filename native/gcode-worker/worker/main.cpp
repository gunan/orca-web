#include "native-editor-statistics.hpp"
#include "native-viewer-helpers.hpp"
#include "native-range-geometry-helpers.hpp"
#include "native-processor-helpers.hpp"
#include "libslic3r/Utils.hpp"
#include "libvgcode/include/PathVertex.hpp"
#include "libvgcode/src/Layers.hpp"
#include "libvgcode/src/ExtrusionRoles.hpp"
#include <nlohmann/json.hpp>
#include <boost/log/core.hpp>
#include <filesystem>
#include <fstream>
#include <iostream>
#include <chrono>
#include <cmath>
#if defined(__unix__) || defined(__APPLE__)
#include <sys/resource.h>
#endif
using json=nlohmann::json;
namespace fs=std::filesystem;
static constexpr size_t MaxInputBytes=25000000,MaxMoves=250000,MaxVertices=500000;
static const char* Commit="8500fcdccaa10b5099ac20d252af3a7c560046f1";
static json version(){return {{"name","OrcaSlicer native G-code processor"},{"version","2.4.2"},{"sourceCommit",Commit},{"schemaVersion",1},{"editorContextVersion",1}};}
int main(int argc,char**argv){
 if(argc==2&&std::string(argv[1])=="--version"){std::cout<<version().dump()<<'\n';return 0;}
 if(argc<3||argc>5){std::cerr<<"usage: orca-gcode-worker input.gcode output.json [resources-directory] [editor-context.json]\n";return 2;}
 try{
  boost::log::core::get()->set_logging_enabled(false);
  if(!fs::is_regular_file(argv[1]))throw std::runtime_error("G-code input must be a regular file");
  if(fs::file_size(argv[1])>MaxInputBytes)throw std::runtime_error("G-code input exceeds 25 MB preview limit");
  if(fs::exists(argv[2])&&fs::equivalent(argv[1],argv[2]))throw std::runtime_error("Preview output cannot replace the G-code input");
  if(argc>=4 && std::string(argv[3]).size())Slic3r::set_resources_dir(argv[3]);
  json context; if(argc==5){if(!fs::is_regular_file(argv[4])||fs::file_size(argv[4])>2*1024*1024)throw std::runtime_error("Native editor context exceeds input limit");std::ifstream in(argv[4]);in>>context;if(!context.is_object())throw std::runtime_error("Invalid native editor context object");}
#if defined(__unix__) || defined(__APPLE__)
  const rlimit cpu{60,60},output_limit{128*1024*1024,128*1024*1024};setrlimit(RLIMIT_CPU,&cpu);setrlimit(RLIMIT_FSIZE,&output_limit);
#endif
  // Static storage zero-initializes native fields omitted by its reset(), notably
  // pressure advance. Unknown PA is still exported as null until an explicit command.
  static Slic3r::GCodeProcessor processor;
  processor.init_filament_maps_and_nozzle_type_when_import_only_gcode();
  const auto began=std::chrono::steady_clock::now();
  processor.process_file(argv[1],[&](){if(processor.get_result().moves.size()>MaxMoves)throw std::runtime_error("Native preview move limit exceeded");if(std::chrono::steady_clock::now()-began>std::chrono::seconds(45))throw std::runtime_error("Native G-code processing timed out");});
  const auto& result=processor.get_result();
  if(result.moves.size()>MaxMoves)throw std::runtime_error("Native preview move limit exceeded");
  // GUI_Preview.cpp / Plater::get_colors_for_color_print, standalone viewer
  // branch. Editor project colors require a distinct, explicit caller snapshot.
  std::vector<std::string> tool_colors=result.extruder_colors;
  auto custom_events=result.custom_gcode_per_print_z;
  Slic3r::GCodeConfig editor_filaments;Slic3r::PrintConfig editor_config;
  if(!context.is_null()){
   if(!context.is_object()||!context.at("version").is_number_integer()||context.value("version",0)!=1||context.value("source","")!="native-editor-job"||context.size()<7||context.size()>8)throw std::runtime_error("Invalid native editor context identity");
   const std::vector<std::string> context_keys={"version","source","filamentColors","filamentDiameters","filamentDensities","filamentCosts","timeCost","customEvents"};for(auto it=context.begin();it!=context.end();++it)if(std::find(context_keys.begin(),context_keys.end(),it.key())==context_keys.end())throw std::runtime_error("Unsupported native editor context field");
   tool_colors=context.at("filamentColors").get<std::vector<std::string>>();if(tool_colors.empty()||tool_colors.size()>256)throw std::runtime_error("Invalid native editor filament count");
   for(const auto& color:tool_colors){if(color.size()!=7||color[0]!='#'||color.find_first_not_of("0123456789abcdefABCDEF",1)!=std::string::npos)throw std::runtime_error("Invalid native editor filament color");}
   auto numbers=[&](const char*key,double low,double high){auto values=context.at(key).get<std::vector<double>>();if(values.size()!=tool_colors.size())throw std::runtime_error("Native editor filament property count mismatch");for(double value:values)if(!std::isfinite(value)||value<low||value>high)throw std::runtime_error("Invalid native editor filament property");return values;};
   editor_filaments.filament_diameter.values=numbers("filamentDiameters",.001,1000);
   editor_filaments.filament_density.values=numbers("filamentDensities",0,10000);
   editor_filaments.filament_cost.values=numbers("filamentCosts",0,1e8);
   const double time_cost=context.at("timeCost").get<double>();if(!std::isfinite(time_cost)||time_cost<0||time_cost>1e8)throw std::runtime_error("Invalid native editor time cost");editor_config.time_cost.value=time_cost;
   custom_events.clear();if(context.contains("customEvents")){const auto&events=context.at("customEvents");if(!events.is_array()||events.size()>10000)throw std::runtime_error("Invalid native editor event count");for(const auto&item:events){if(!item.is_object()||!item.at("type").is_number_integer()||!item.at("extruder").is_number_integer())throw std::runtime_error("Invalid native editor event integer");const int type=item.at("type").get<int>(),extruder=item.at("extruder").get<int>();const double z=item.at("z").get<double>();const std::string color=item.at("color").get<std::string>();if(item.size()!=4||!std::isfinite(z)||z<=0||z>10000||type<0||type>5||extruder< -1||extruder>256||((type==0||type==2)&&(extruder<1||extruder>int(tool_colors.size())))||color.size()>64)throw std::runtime_error("Invalid native editor event");custom_events.push_back({z,Slic3r::CustomGCode::Type(type),extruder,color,""});}}
   for(const auto&vertex:result.moves)if(vertex.type==Slic3r::EMoveType::Extrude&&vertex.extruder_id>=tool_colors.size())throw std::runtime_error("G-code filament exceeds immutable editor snapshot");
  }
  std::vector<std::string> color_print_colors;
  if(!custom_events.empty()){
   color_print_colors=tool_colors;
   for(const auto& item:custom_events)
    if(item.type==Slic3r::CustomGCode::ColorChange)color_print_colors.emplace_back(item.color);
   color_print_colors.emplace_back("#808080");
  }
  if(color_print_colors.size()>256)throw std::runtime_error("Native preview color palette exceeds 256-color limit");
  auto view=libvgcode::convert_processor_result(result,tool_colors,color_print_colors);
  if(view.vertices.size()>MaxVertices)throw std::runtime_error("Native preview vertex limit exceeded");
  libvgcode::Layers layers;libvgcode::ExtrusionRoles roles;
  std::array<float,2> total{0,0},travels{0,0};
  for(size_t i=0;i<view.vertices.size();i++){
   const auto& v=view.vertices[i];layers.update(v,uint32_t(i));
   for(size_t mode=0;mode<2;mode++){total[mode]+=v.times[mode];if(v.type==libvgcode::EMoveType::Travel)travels[mode]+=v.times[mode];}
   if(v.type==libvgcode::EMoveType::Extrude)roles.add(v.role,v.times);
  }
  json out={{"engine",version()},{"entryPoint","GCodeProcessor::process_file"},{"processorMoveCount",result.moves.size()},{"vertexCount",view.vertices.size()},{"spiralVase",view.spiral_vase_mode},{"toolsColors",view.tools_colors},{"colorPrintColors",view.color_print_colors},{"filamentDiameters",result.filament_diameters},{"filamentDensities",result.filament_densities},{"filamentCosts",result.filament_costs},{"modes",json::array()},{"roles",json::array()},{"layers",json::array()},{"vertices",json::array()}};
  const auto& statistics=result.print_statistics;
  out["colorPaletteSource"]=context.is_null()?"native-standalone-import":"native-editor-job";
  if(!context.is_null()){
   std::vector<Slic3r::Extruder> extruders;for(size_t id=0;id<tool_colors.size();id++)extruders.emplace_back(id,&editor_filaments,false);
   Slic3r::NativeEditorStatistics summary;Slic3r::update_print_estimated_stats(processor,extruders,summary,editor_config);
   out["editorStatisticsVersion"]=1;out["editorStatistics"]={{"source","native-editor-formula"},{"filamentMm",summary.total_used_filament},{"filamentGrams",summary.total_weight},{"filamentMm3",summary.total_extruded_volume},{"cost",summary.total_cost},{"timeCost",editor_config.time_cost.value}};
  }
  out["materialStatisticsVersion"]=1;
  out["materialStatistics"]={{"modelVolumes",statistics.model_volumes_per_extruder},{"supportVolumes",statistics.support_volumes_per_extruder},{"towerVolumes",statistics.wipe_tower_volumes_per_extruder},{"flushedVolumes",statistics.flush_per_filament},{"totalVolumes",statistics.total_volumes_per_extruder},{"filamentChanges",statistics.total_filament_changes},{"toolChanges",statistics.total_extruder_changes}};
  for(size_t i=0;i<(processor.is_stealth_time_estimator_enabled()?2:1);i++){
   const auto mode=Slic3r::PrintEstimatedStatistics::ETimeMode(i);
   out["modes"].push_back({{"name",i?"stealth":"normal"},{"totalSeconds",total[i]},{"travelSeconds",travels[i]},{"processorSeconds",processor.get_time(mode)},{"summaryTimeLabel",Slic3r::short_time(Slic3r::get_time_dhms(processor.get_time(mode)))},{"prepareSeconds",processor.get_prepare_time(mode)},{"firstLayerSeconds",processor.get_first_layer_time(mode)}});
  }
  if(custom_events.size()>10000)throw std::runtime_error("Native preview event count exceeds limit");
  out["customEventOverviewVersion"]=1;out["customEventOverview"]=json::array();std::vector<double>layer_zs;for(size_t i=0;i<layers.count();i++)layer_zs.push_back(layers.get_layer_z(i));
  for(auto event:custom_events){const int layer=Slic3r::find_close_layer_idx(layer_zs,event.print_z,Slic3r::native_preview_epsilon());json item={{"type",int(event.type)},{"extruder",event.extruder},{"z",event.print_z},{"layer",layer+1},{"seconds",json::array()},{"labels",json::array()}};for(size_t mode=0;mode<out["modes"].size();mode++){float seconds=0;for(int index=0;index<layer;index++)seconds+=layers.get_layer_time(libvgcode::ETimeMode(mode),index);item["seconds"].push_back(seconds);item["labels"].push_back(Slic3r::short_time(Slic3r::get_time_dhms(seconds)));}out["customEventOverview"].push_back(item);}
  for(auto role:roles.get_roles()){
   json item={{"role",int(role)},{"seconds",{roles.get_time(role,libvgcode::ETimeMode::Normal),roles.get_time(role,libvgcode::ETimeMode::Stealth)}},{"filamentMeters",0},{"filamentGrams",0}};
   for(const auto& [original,amount]:result.print_statistics.used_filaments_per_role)if(libvgcode::convert(original)==role){item["filamentMeters"]=amount.first;item["filamentGrams"]=amount.second;}
   out["roles"].push_back(item);
  }
  for(size_t i=0;i<layers.count();i++)out["layers"].push_back({{"id",i},{"z",layers.get_layer_z(i)},{"seconds",{layers.get_layer_time(libvgcode::ETimeMode::Normal,i),layers.get_layer_time(libvgcode::ETimeMode::Stealth,i)}}});
  out["ranges"]=json::object();for(const auto& mode:out["modes"]){const std::string name=mode["name"];const auto kind=name=="normal"?libvgcode::ETimeMode::Normal:libvgcode::ETimeMode::Stealth;out["ranges"][name]={{"customVisible",libvgcode::native_preview_ranges(view.vertices,layers,kind,true)},{"customHidden",libvgcode::native_preview_ranges(view.vertices,layers,kind,false)}};}
  out["scalarRangesVersion"]=1;out["scalarRanges"]=json::object();
  for(int travels=0;travels<2;++travels)for(int wipes=0;wipes<2;++wipes){const std::string key=std::string("travel")+(travels?"Visible":"Hidden")+"Wipe"+(wipes?"Visible":"Hidden");out["scalarRanges"][key]=libvgcode::native_preview_scalar_ranges(view.vertices,layers,travels,wipes,Slic3r::native_pressure_known_from_line());}
  const auto geometry=libvgcode::native_preview_geometry(view.vertices);
  out["columns"]={"x","y","z","height","width","feedrate","actualFeedrate","mm3PerMm","fanSpeed","temperature","role","type","sourceLine","layerId","tool","colorId","timeNormal","timeStealth","pressureAdvance","acceleration","jerk","renderZ","renderHeight","renderWidth","turnAngle","renderBias","validLine"};
  for(size_t index=0;index<view.vertices.size();index++){const auto& v=view.vertices[index];const auto& g=geometry[index];json pa=nullptr;if(Slic3r::native_pressure_known_from_line()&&v.gcode_id>=Slic3r::native_pressure_known_from_line())pa=v.pressure_advance;out["vertices"].push_back({v.position[0],v.position[1],v.position[2],v.height,v.width,v.feedrate,v.actual_feedrate,v.mm3_per_mm,v.fan_speed,v.temperature,int(v.role),int(v.type),v.gcode_id,v.layer_id,v.extruder_id,v.color_id,v.times[0],v.times[1],pa,v.acceleration,v.jerk,g[0],g[1],g[2],g[3],g[4],int(g[5])});}
  out["nativeWarnings"]=json::array();for(const auto& w:result.warnings)out["nativeWarnings"].push_back({{"level",w.level},{"message",w.msg},{"code",w.error_code},{"parameters",w.params}});
  std::ofstream output(argv[2],std::ios::binary|std::ios::trunc);if(!output)throw std::runtime_error("Could not create preview output");output<<out.dump()<<'\n';output.flush();if(!output)throw std::runtime_error("Could not write preview output");
  return 0;
 }catch(const std::exception&e){std::cerr<<e.what()<<'\n';return 1;}
}
