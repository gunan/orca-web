from pathlib import Path
import hashlib,re
import sys,subprocess,json
source=Path(sys.argv[1]).resolve();out=Path(sys.argv[2]).resolve();out.mkdir(parents=True,exist_ok=True)
manifest=json.loads((Path(__file__).resolve().parents[1]/'native-source-manifest.json').read_text())
if subprocess.check_output(['git','-C',str(source),'rev-parse','HEAD'],text=True).strip()!=manifest['commit']:raise SystemExit('Pinned native source commit does not match')
if subprocess.run(['git','-C',str(source),'diff','--quiet','HEAD','--','src','deps_src']).returncode:raise SystemExit('Native source cache contains modified tracked source files')
for name,digest in manifest['files'].items():
 if hashlib.sha256((source/name).read_bytes()).hexdigest()!=digest:raise SystemExit('Native source hash mismatch: '+name)
root=source/'src/libslic3r'
def masked(text):
 # Preserve offsets while hiding C++ comments, character/string literals and raw strings.
 result=list(text);i=0
 while i<len(text):
  start=i
  if text.startswith('//',i):
   end=text.find('\n',i+2);i=len(text) if end<0 else end
  elif text.startswith('/*',i):
   end=text.find('*/',i+2)
   if end<0:raise ValueError('Unterminated C++ comment')
   i=end+2
  elif text.startswith('R"',i):
   opening=text.find('(',i+2)
   if opening<0 or opening-i>18:raise ValueError('Invalid raw C++ string')
   terminator=')'+text[i+2:opening]+'"';end=text.find(terminator,opening+1)
   if end<0:raise ValueError('Unterminated raw C++ string')
   i=end+len(terminator)
  elif text[i] in ['"',"'"]:
   quote=text[i];i+=1
   while i<len(text):
    if text[i]=='\\':i+=2
    elif text[i]==quote:i+=1;break
    else:i+=1
  else:i+=1;continue
  result[start:i]=' '* (i-start)
 return ''.join(result)
def function(text,signature):
 if text.count(signature)!=1:raise ValueError('Native function signature is missing or ambiguous: '+signature)
 start=text.index(signature);mask=masked(text);opening=mask.index('{',start);i=opening+1;level=1
 while level and i<len(mask):
  if mask[i]=='{':level+=1
  elif mask[i]=='}':level-=1
  i+=1
 if level:raise ValueError('Unbalanced native C++ function: '+signature)
 return text[start:i]
processor=(root/'GCode/GCodeProcessor.cpp').read_text();original=processor
post=function(processor,'void GCodeProcessor::run_post_process()')
processor=processor.replace(post,'void GCodeProcessor::run_post_process() { throw std::runtime_error("G-code rewriting is disabled in the read-only preview worker"); }')
processor=processor.replace('#include "libslic3r/Print.hpp"','#include "native-processor-helpers.hpp"\n#include "libslic3r/BoundingBox.hpp"\n#include "libslic3r/TriangleSelector.hpp"\n#include <unordered_set>')
processor=processor.replace('Print::get_hrc_by_nozzle_type','native_nozzle_hrc')
# Availability instrumentation only: preserve each native parse and assignment.
for signature,old,new in [
 ('void GCodeProcessor::process_M900(', "    line.has_value('K', pa_value);", "    if (line.has_value('K', pa_value)) native_record_pressure_line(m_line_id);"),
 ('void GCodeProcessor::process_M572(', "    line.has_value('S', pa_value);", "    if (line.has_value('S', pa_value)) native_record_pressure_line(m_line_id);"),
 ('void GCodeProcessor::process_SET_PRESSURE_ADVANCE(', '        m_pressure_advance = std::max(0.0f, pa_value);', '        m_pressure_advance = std::max(0.0f, pa_value);\n        native_record_pressure_line(m_line_id);')]:
 before=function(processor,signature)
 assert old in before
 processor=processor.replace(before,before.replace(old,new))
(out/'native-GCodeProcessor.cpp').write_text(processor)
helpers=[]
hrc=function((root/'Print.cpp').read_text(),'int Print::get_hrc_by_nozzle_type(').replace('int Print::get_hrc_by_nozzle_type','int native_nozzle_hrc');helpers.append(hrc)
acc=function((root/'GCodeWriter.cpp').read_text(),'bool GCodeWriter::supports_separate_travel_acceleration(');helpers.append(acc)
(out/'native-processor-helpers.hpp').write_text('#pragma once\n#include "libslic3r/PrintConfig.hpp"\nnamespace Slic3r { int native_nozzle_hrc(const NozzleType& type); void native_record_pressure_line(unsigned int); unsigned int native_pressure_known_from_line(); }\n')
(out/'native-processor-helpers.cpp').write_text('#include "native-processor-helpers.hpp"\n#include "libslic3r/GCodeWriter.hpp"\n#include "libslic3r/Utils.hpp"\n#include <nlohmann/json.hpp>\n#include <boost/filesystem.hpp>\n#include <boost/nowide/fstream.hpp>\n#include <boost/log/trivial.hpp>\nnamespace Slic3r { namespace fs=boost::filesystem;using json=nlohmann::json;\n'+'\n'.join(helpers)+'\nstatic unsigned int pressure_known_line=0;\nvoid native_record_pressure_line(unsigned int line){if(!pressure_known_line)pressure_known_line=line;}\nunsigned int native_pressure_known_from_line(){return pressure_known_line;}\n}\n')
print('GCodeProcessor.cpp SHA256',hashlib.sha256(original.encode()).hexdigest())
thumb=(root/'GCode/Thumbnails.cpp').read_text()
thumbnail_helpers=[function(thumb,'std::pair<GCodeThumbnailDefinitionsList, ThumbnailErrors> make_and_check_thumbnail_list(const std::string&'),function(thumb,'std::string get_error_string(')]
(out/'native-thumbnail-config.cpp').write_text('#include "libslic3r/GCode/Thumbnails.hpp"\n#include "libslic3r/format.hpp"\n#include <boost/algorithm/string/case_conv.hpp>\n#include <sstream>\nnamespace Slic3r::GCodeThumbnails { using namespace std::literals;\n'+'\n'.join(thumbnail_helpers)+'\n}\n')
wrap=(root.parents[1]/'src/slic3r/GUI/LibVGCode/LibVGCodeWrapper.cpp').read_text()
signatures=['Vec3 convert(const Slic3r::Vec3f& v)','Color convert(const Slic3r::ColorRGBA& c)','Color convert(const std::string& color_str)','EGCodeExtrusionRole convert(Slic3r::ExtrusionRole role)','EMoveType convert(Slic3r::EMoveType type)']
conversion=[function(wrap,signature)for signature in signatures]
converter=function(wrap,'GCodeInputData convert(const Slic3r::GCodeProcessorResult& result,').replace('GCodeInputData convert(', 'GCodeInputData convert_processor_result(').replace('const std::vector<std::string>& str_color_print_colors, const Viewer& viewer)','const std::vector<std::string>& str_color_print_colors)')
(out/'native-viewer-helpers.hpp').write_text('#pragma once\n#include "libslic3r/GCode/GCodeProcessor.hpp"\n#include "libvgcode/include/GCodeInputData.hpp"\nnamespace libvgcode { GCodeInputData convert_processor_result(const Slic3r::GCodeProcessorResult&,const std::vector<std::string>&,const std::vector<std::string>&); EGCodeExtrusionRole convert(Slic3r::ExtrusionRole role); }\n')
(out/'native-viewer-helpers.cpp').write_text('#include "native-viewer-helpers.hpp"\n#include "libslic3r/Color.hpp"\n#include "libvgcode/include/PathVertex.hpp"\n#include <algorithm>\nnamespace libvgcode {\n'+'\n'.join(conversion+[converter])+'\n}\n')
viewer=(root.parents[1]/'src/libvgcode/src/ViewerImpl.cpp').read_text()
rounding=viewer[viewer.index('template<class T, class O = T>'):viewer.index('static Mat4x4 inverse(')]
extract=function(viewer,'static void extract_pos_and_or_hwa(')
update=function(viewer,'void ViewerImpl::update_color_ranges()')
# Native reset omits the PA member; do not invent a pre-command value.
# Keep the original determined-value predicate and arithmetic unchanged.
update=update.replace('if (v.pressure_advance >= 0.0f)', 'if (m_pressure_known_from_line && v.gcode_id >= m_pressure_known_from_line && v.pressure_advance >= 0.0f)')
(out/'native-range-geometry-helpers.hpp').write_text('#pragma once\n#include "libvgcode/include/PathVertex.hpp"\n#include "libvgcode/src/Layers.hpp"\n#include <nlohmann/json.hpp>\nnamespace libvgcode { nlohmann::json native_preview_ranges(const std::vector<PathVertex>&,const Layers&,ETimeMode,bool); nlohmann::json native_preview_scalar_ranges(const std::vector<PathVertex>&,const Layers&,bool,bool,unsigned int); std::vector<std::array<float,6>> native_preview_geometry(const std::vector<PathVertex>&); }\n')
header='''#include "native-range-geometry-helpers.hpp"
#include "libvgcode/include/ColorRange.hpp"
#include "libvgcode/src/Bitset.hpp"
#include "libvgcode/src/Utils.hpp"
#include "libvgcode/src/Settings.hpp"
#include <cmath>
#include <limits>
#include <optional>
#include <cassert>
namespace libvgcode { using Vec4=std::array<float,4>;
'''
facade='''
// Headless facade gives the unchanged native friend method access to ColorRange.
// The GUI/OpenGL ViewerImpl is not linked into this executable.
class ViewerImpl { public:
 const std::vector<PathVertex>& m_vertices; const Layers& m_layers;
 unsigned int m_pressure_known_from_line=0;
 Settings m_settings; std::optional<Settings> m_settings_used_for_ranges;
 ColorRange m_width_range,m_height_range,m_speed_range,m_actual_speed_range,m_fan_speed_range,m_temperature_range,m_pressure_advance_range,m_acceleration_range,m_jerk_range,m_volumetric_rate_range,m_actual_volumetric_rate_range;
 std::array<ColorRange,2> m_layer_time_range{ColorRange(EColorRangeType::Linear),ColorRange(EColorRangeType::Logarithmic)};
 ViewerImpl(const std::vector<PathVertex>&v,const Layers&l,ETimeMode mode,bool custom,bool travels=false,bool wipes=false,unsigned int known=0):m_vertices(v),m_layers(l),m_pressure_known_from_line(known){m_settings.time_mode=mode;m_settings.extrusion_roles_visibility[size_t(EGCodeExtrusionRole::Custom)]=custom;m_settings.options_visibility[size_t(EOptionType::Travels)]=travels;m_settings.options_visibility[size_t(EOptionType::Wipes)]=wipes;update_color_ranges();}
 void update_color_ranges();
 nlohmann::json range_json(const ColorRange&range){if(!range.m_count)return {{"min",nullptr},{"max",nullptr},{"count",0},{"values",nlohmann::json::array()},{"palette",range.get_palette()}};return {{"min",range.get_range()[0]},{"max",range.get_range()[1]},{"count",range.m_count},{"values",range.get_values()},{"palette",range.get_palette()}};}
 nlohmann::json scalar_result(){return {{"speed",range_json(m_speed_range)},{"actualSpeed",range_json(m_actual_speed_range)},{"fanSpeed",range_json(m_fan_speed_range)},{"temperature",range_json(m_temperature_range)},{"pressureAdvance",range_json(m_pressure_advance_range)},{"acceleration",range_json(m_acceleration_range)},{"jerk",range_json(m_jerk_range)}};}
 nlohmann::json result(){nlohmann::json ret={{"height",range_json(m_height_range)},{"width",range_json(m_width_range)},{"flow",range_json(m_volumetric_rate_range)},{"actualFlow",range_json(m_actual_volumetric_rate_range)},{"layerTime",range_json(m_layer_time_range[0])},{"layerTimeLog",range_json(m_layer_time_range[1])}};for(size_t i=0;i<2;i++){auto& range=ret[i?"layerTimeLog":"layerTime"];range["layerColors"]=nlohmann::json::array();for(float time:m_layers.get_times(m_settings.time_mode))range["layerColors"].push_back(m_layer_time_range[i].get_color_at(time));}return ret;}
};
'''
footer='''
nlohmann::json native_preview_ranges(const std::vector<PathVertex>&vertices,const Layers&layers,ETimeMode mode,bool custom){return ViewerImpl(vertices,layers,mode,custom).result();}
nlohmann::json native_preview_scalar_ranges(const std::vector<PathVertex>&vertices,const Layers&layers,bool travels,bool wipes,unsigned int known){return ViewerImpl(vertices,layers,ETimeMode::Normal,true,travels,wipes,known).scalar_result();}
std::vector<std::array<float,6>> native_preview_geometry(const std::vector<PathVertex>&vertices){
 BitSet<> valid(vertices.size());valid.setAll();std::vector<Vec4> positions,hwa;extract_pos_and_or_hwa(vertices,DEFAULT_TRAVELS_RADIUS_MM,DEFAULT_WIPES_RADIUS_MM,valid,&positions,&hwa,true);
 std::vector<std::array<float,6>> out;out.reserve(vertices.size());for(size_t i=0;i<vertices.size();i++)out.push_back({positions[i][2],hwa[i][0],hwa[i][1],hwa[i][2],hwa[i][3],valid[i]?1.f:0.f});return out;
}
}
'''
(out/'native-range-geometry-helpers.cpp').write_text(header+rounding+extract+facade+update+footer)

# Preserve the original editor PrintStatistics formula while replacing only its
# owning GUI/Print struct with a narrow standalone output struct. Native Extruder
# and PrintConfig types/methods remain original compiled implementations.
gcode=(root/'GCode.cpp').read_text()
editor=function(gcode,'static void update_print_estimated_stats(').replace('PrintStatistics& print_statistics','NativeEditorStatistics& print_statistics')
(out/'native-editor-statistics.hpp').write_text('#pragma once\n#include "libslic3r/GCode/GCodeProcessor.hpp"\n#include "libslic3r/Extruder.hpp"\n#include "libslic3r/Utils.hpp"\nnamespace Slic3r { struct NativeEditorStatistics { std::string estimated_normal_print_time,estimated_silent_print_time;double total_extruded_volume=0,total_used_filament=0,total_weight=0,total_cost=0;std::map<size_t,double>filament_stats;};\n'+editor+'\n}\n')

viewer=(source/'src/slic3r/GUI/GCodeViewer.cpp').read_text();slider=(source/'src/slic3r/GUI/IMSlider.hpp').read_text()
with (out/'native-editor-statistics.hpp').open('a') as stream:stream.write('namespace Slic3r {\n'+function(viewer,'static int find_close_layer_idx(')+'\n'+function(slider,'constexpr double epsilon()').replace('epsilon()', 'native_preview_epsilon()')+'\n}\n')
