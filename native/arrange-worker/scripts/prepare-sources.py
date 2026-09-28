from pathlib import Path
import hashlib,json,subprocess,sys
source=Path(sys.argv[1]).resolve();output=Path(sys.argv[2]).resolve()
spec=json.loads((Path(__file__).resolve().parents[1]/'source-manifest.json').read_text())
if subprocess.check_output(['git','-C',str(source),'rev-parse','HEAD'],text=True).strip()!=spec['commit']:
 raise RuntimeError('Expected the pinned OrcaSlicer2.4.2 checkout')
if subprocess.run(['git','-C',str(source),'diff','--quiet','HEAD','--','src','deps_src']).returncode:
 raise RuntimeError('Pinned Orca source has local modifications')
for name,expected in spec['sources'].items():
 if hashlib.sha256((source/name).read_bytes()).hexdigest()!=expected:raise RuntimeError('Native source hash mismatch: '+name)
def function(text,signature):
 start=text.index(signature);i=text.index('{',start)+1;level=1
 # Selected functions have no brace-like characters in strings or comments.
 while level:
  if text[i]=='{':level+=1
  elif text[i]=='}':level-=1
  i+=1
 return text[start:i]
model=(source/'src/libslic3r/Model.cpp').read_text()
body=function(model,'Model Model::read_from_step(')
model=model.replace(body+'\n\n','',1)
if hashlib.sha256(model.encode()).hexdigest()!=spec['generatedModelSha256']:raise RuntimeError('Unexpected Model.cpp extraction')
def save(name,value):
 path=output/name
 if not path.exists() or path.read_text()!=value:path.write_text(value)
save('native-Model.cpp',model)
thumb=(source/'src/libslic3r/GCode/Thumbnails.cpp').read_text()
helpers=[function(thumb,'std::pair<GCodeThumbnailDefinitionsList, ThumbnailErrors> make_and_check_thumbnail_list(const std::string&'),function(thumb,'std::string get_error_string(')]
result='#include "libslic3r/GCode/Thumbnails.hpp"\n#include "libslic3r/format.hpp"\n#include <boost/algorithm/string/case_conv.hpp>\n#include <sstream>\nnamespace Slic3r::GCodeThumbnails { using namespace std::literals;\n'+'\n'.join(helpers)+'\n}\n'
if hashlib.sha256(result.encode()).hexdigest()!=spec['generatedThumbnailSha256']:raise RuntimeError('Unexpected thumbnail config helper extraction')
save('native-thumbnail-config.cpp',result)

print_source=(source/'src/libslic3r/Print.cpp').read_text()
functions=[function(print_source,name) for name in ['bool Print::is_filaments_compatible(', 'int Print::get_compatible_filament_type(', 'FilamentTempType Print::get_filament_temp_type(']]
result=('#include "libslic3r/Print.hpp"\n#include "libslic3r/MaterialType.hpp"\nnamespace Slic3r {\n'+'\n'.join(functions)+'\n}\n')
if hashlib.sha256(result.encode()).hexdigest()!=spec['generatedPrintArrangeSha256']:raise RuntimeError('Unexpected native print helper extraction')
save('native-print-arrange.cpp',result)

# Preserve native arithmetic bodies; only the GUI class qualifier is adapted.
print_functions=[function(print_source,name).replace('Print::','NativeArrangePrint::',1) for name in ['double Print::skirt_first_layer_height(', 'Flow Print::skirt_flow(', 'std::tuple<float, float> Print::object_skirt_offset(']]
plate_source=(source/'src/slic3r/GUI/PartPlate.cpp').read_text()
plate_functions=[function(plate_source,name).replace('PartPlate::','NativeArrangePlate::',1) for name in ['Vec3d PartPlate::estimate_wipe_tower_size(', 'arrangement::ArrangePolygon PartPlate::estimate_wipe_tower_polygon(']]
wipe_source=(source/'src/libslic3r/GCode/WipeTower.cpp').read_text()
a=wipe_source.index('const std::map<float, float> WipeTower::min_depth_per_height');b=wipe_source.index(';',a)+1
wipe_functions=[wipe_source[a:b]]+[function(wipe_source,name)for name in ['float WipeTower::get_limit_depth_by_height(', 'float WipeTower::get_auto_brim_by_height(']]
result=('#include "native-plate.hpp"\n#include <boost/log/trivial.hpp>\n#include <boost/format.hpp>\nnamespace Slic3r {\n'+'\n'.join(print_functions+plate_functions+wipe_functions)+'\n}\n')
if hashlib.sha256(result.encode()).hexdigest()!=spec['generatedPlateSha256']:raise RuntimeError('Unexpected native plate helper extraction')
save('native-plate.cpp',result)

# Exact Cut instance reset; geometry has already been processed by the editor.
cut_source=(source/'src/libslic3r/CutUtils.cpp').read_text()
reset=function(cut_source,'static void reset_instance_transformation(')
save('native-instance-cut-reset.inc',reset+'\n')

# Geometry sources and the original GLU tessellator used by cut_mesh.
cut_spec=json.loads((Path(__file__).resolve().parents[1]/'cut-parts-source-hashes.json').read_text())
for name,expected in cut_spec['sources'].items():
 if hashlib.sha256((source/name).read_bytes()).hexdigest()!=expected:raise RuntimeError('Native Cut source hash mismatch: '+name)
def cut_function(signature):
 start=cut_source.index(signature);cursor=cut_source.index('(',start)+1;depth=1
 while depth:depth+=(cut_source[cursor]=='(')-(cut_source[cursor]==')');cursor+=1
 brace=cut_source.index('{',cursor);level=1;end=brace+1
 while level:level+=(cut_source[end]=='{')-(cut_source[end]=='}');end+=1
 return cut_source[start:end]
save('native-cut-to-parts.inc','\n\n'.join(cut_function(sig) for sig in ['static void add_cut_volume(','static void process_volume_cut(','static void process_modifier_cut(','static void process_solid_part_cut('])+'\n')

# Original GUI containment, assignment collection and sequential-print gating.
tower_spec=json.loads((Path(__file__).resolve().parents[1]/'prime-tower-source-hashes.json').read_text())
for name,expected in tower_spec['sources'].items():
 if hashlib.sha256((source/name).read_bytes()).hexdigest()!=expected:raise RuntimeError('Native prime tower source hash mismatch: '+name)
tower_functions=[function(plate_source,signature).replace('PartPlate::','NativeTowerPlate::',1) for signature in ['BoundingBoxf3 PartPlate::get_build_volume(', 'bool PartPlate::contain_instance_totally(int ', 'bool PartPlate::check_outside(', 'int PartPlate::printable_instance_size(', 'std::vector<int> PartPlate::get_extruders(bool ']]
tower_text='\n\n'.join(tower_functions)
assert tower_text.count('wxGetApp().preset_bundle->prints.get_edited_preset().config')==1
assert tower_text.count('wxGetApp().preset_bundle->project_config')==1
tower_text=tower_text.replace('wxGetApp().preset_bundle->prints.get_edited_preset().config','m_config').replace('wxGetApp().preset_bundle->project_config','m_project_config')
save('native-tower-plate.inc',tower_text+'\n')

# Viewport footprint and original Fill obstacle behavior.
fill_tower_spec=json.loads((Path(__file__).resolve().parents[1]/'fill-tower-source-hashes.json').read_text())
for name,expected in fill_tower_spec['sources'].items():
 if hashlib.sha256((source/name).read_bytes()).hexdigest()!=expected:raise RuntimeError('Native Fill tower source hash mismatch: '+name)
