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

bundle=(root/'PresetBundle.cpp').read_text()
parts=['#include "libslic3r/PresetBundle.hpp"\n#include <boost/algorithm/clamp.hpp>\nnamespace Slic3r {']
for signature in ['static std::vector<std::string> s_project_options','const std::set<std::string> ignore_settings_list']:
 parts.append(function(bundle,signature)+';')
parts.append(bundle[bundle.index('const char *PresetBundle::ORCA_DEFAULT_BUNDLE'):bundle.index('DynamicPrintConfig PresetBundle::construct_full_config(')])
for signature in ['PresetBundle::PresetBundle()','DynamicPrintConfig PresetBundle::full_config(', 'DynamicPrintConfig PresetBundle::full_fff_config(', 'DynamicPrintConfig PresetBundle::full_sla_config(']:
 parts.append(function(bundle,signature))
parts.append('}\n')
(out/'native-preset.cpp').write_text('\n\n'.join(parts))
thumb=(root/'GCode/Thumbnails.cpp').read_text()
helpers=[function(thumb,signature)for signature in ['std::pair<GCodeThumbnailDefinitionsList, ThumbnailErrors> make_and_check_thumbnail_list(const std::string&','std::string get_error_string(','std::pair<GCodeThumbnailDefinitionsList, ThumbnailErrors> make_and_check_thumbnail_list(const ConfigBase&']]
(out/'native-thumbnail-config.cpp').write_text('#include "libslic3r/GCode/Thumbnails.hpp"\n#include "libslic3r/format.hpp"\n#include <boost/algorithm/string/case_conv.hpp>\n#include <sstream>\nnamespace Slic3r::GCodeThumbnails { using namespace std::literals;\n'+'\n'.join(helpers)+'\n}\n')

# Boolean compatibility uses the unchanged native parser; only predicate logging
# is redirected into structured diagnostics. All branching and return values are
# extracted verbatim from the pinned Preset.cpp source verified above.
preset=(root/'Preset.cpp').read_text()
signatures=[
 'bool is_compatible_with_print(const PresetWithVendorProfile &preset,',
 'bool is_compatible_with_parent_printer(const PresetWithVendorProfile& preset,',
 'bool is_compatible_with_printer(const PresetWithVendorProfile &preset, const PresetWithVendorProfile &active_printer, const DynamicPrintConfig *extra_config)',
 'bool is_compatible_with_printer(const PresetWithVendorProfile &preset, const PresetWithVendorProfile &active_printer)']
parts=[function(preset,s) for s in signatures]
parts=[p.replace('is_compatible_with_', 'worker_is_compatible_with_') for p in parts]
# C++ escape sequences must remain literal in the extraction match.
old=r'printf("Preset::worker_is_compatible_with_print - parsing error of compatible_prints_condition %s:\n%s\n", active_print.preset.name.c_str(), err.what());'
if sum(p.count(old) for p in parts)!=1:raise ValueError('Print compatibility diagnostic source changed')
parts=[p.replace(old,'diagnostics.push_back(std::string(err.what()).substr(0, 4096));') for p in parts]
old='BOOST_LOG_TRIVIAL(warning) << __FUNCTION__ << boost::format(": parsing error of compatible_printers_condition %1%: %2%")%active_printer.preset.name %err.what();'
if sum(p.count(old) for p in parts)!=1:raise ValueError('Printer compatibility diagnostic source changed')
parts=[p.replace(old,'diagnostics.push_back(std::string(err.what()).substr(0, 4096));') for p in parts]
(out/'native-compatibility-predicates.hpp').write_text('#include "libslic3r/PlaceholderParser.hpp"\nnamespace WorkerCompatibility { using namespace Slic3r; static std::vector<std::string> diagnostics;\n'+'\n'.join(parts)+'\n}\n')
flow=(root/'Flow.cpp').read_text()
flow_parts=[function(flow,s) for s in ['float Flow::auto_extrusion_width(', 'static inline FlowRole opt_key_to_flow_role(', 'static inline void throw_on_missing_variable(', 'double Flow::extrusion_width(const std::string& opt_key, const ConfigOptionFloatOrPercent*', 'double Flow::extrusion_width(const std::string& opt_key, const ConfigOptionResolver &']]
(out/'native-compatibility-flow.cpp').write_text('#include "libslic3r/Flow.hpp"\n#include "libslic3r/I18N.hpp"\n#include <boost/format.hpp>\n#define L(s) Slic3r::I18N::translate(s)\nnamespace Slic3r {\n'+'\n'.join(flow_parts)+'\n}\n')
