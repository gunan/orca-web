from pathlib import Path
import hashlib,json,subprocess,sys,re
source=Path(sys.argv[1]);stage=Path(__file__).resolve().parents[1]
commit='8500fcdccaa10b5099ac20d252af3a7c560046f1'
if subprocess.check_output(['git','-C',str(source),'rev-parse','HEAD'],text=True).strip()!=commit:raise SystemExit('Wrong native source')
paths=['src/libvgcode/src/OptionTemplate.cpp','src/libvgcode/src/Utils.cpp','src/libvgcode/src/Shaders.hpp','src/libvgcode/include/Types.hpp','src/libvgcode/src/ViewerImpl.cpp']
subprocess.run(['git','-C',str(source),'diff','--exit-code',commit,'--',*paths],check=True)
texts={p:(source/p).read_text()for p in paths};text=texts[paths[0]]
if 'm_option_template.init(16);' not in texts[paths[4]]:raise SystemExit('Native option resolution changed')
start=text.index('void OptionTemplate::init(');end=text.index('    m_size_in_bytes_gpu +=',start)
function=text[start:end]+'result=top_vertices;result.insert(result.end(),bottom_vertices.begin(),bottom_vertices.end());\n}'
cpp='''// Original native option diamond generation with GPU upload replaced by JSON.
#include <algorithm>
#include <cmath>
#include <iostream>
#include <nlohmann/json.hpp>
#include "src/libvgcode/src/Utils.hpp"
namespace libvgcode{struct OptionTemplate{unsigned int m_top_vao_id=0;uint8_t m_resolution=0,m_vertices_count=0;std::vector<float>result;void init(uint8_t);};
'''+function+'''\n}\nint main(){libvgcode::OptionTemplate t;t.init(16);std::cout<<nlohmann::json(t.result).dump()<<"\\n";}'''
(stage/'tests/fixtures/native-preview-options-reference.cpp').write_text(cpp)
binary=stage/'options-reference';subprocess.run(['clang++','-std=c++17',str(stage/'tests/fixtures/native-preview-options-reference.cpp'),str(source/paths[1]),'-I'+str(source),'-I'+str(source/'deps_src'),'-o',str(binary)],check=True)
geometry=json.loads(subprocess.check_output([str(binary)],text=True));positions=[];normals=[]
for i in range(0,len(geometry),6):positions+=geometry[i:i+3];normals+=geometry[i+3:i+6]
shader=texts[paths[2]];start=shader.index('static const char* Options_Vertex_Shader =');end=shader.index('static const char* Options_Fragment_Shader',start);chunk=shader[start:end]
# The platform-dependent native scale is a uniform; all geometry/light math stays original.
chunk=re.sub(r'#ifdef __APPLE__.*?#endif','"uniform float scaling_factor;\\n"\n',chunk,flags=re.S)
# re.sub's replacement interprets escapes, so reconstruct that line explicitly.
chunk=chunk.replace('"uniform float scaling_factor;\n"','"uniform float scaling_factor;\\n"')
vertex=''.join(json.loads(row)for row in re.findall(r'^"(?:[^"\\]|\\.)*"',chunk,re.M))
reference_vertex=vertex
vertex=vertex.replace('#version 150\n','precision highp float;\nprecision highp int;\n').replace('uniform mat4 view_matrix;','uniform mat4 viewMatrix;').replace('uniform mat4 projection_matrix;','uniform mat4 projectionMatrix;')
for row in ['uniform samplerBuffer position_tex;','uniform samplerBuffer height_width_angle_tex;','uniform samplerBuffer color_tex;','uniform usamplerBuffer segment_index_tex;']:vertex=vertex.replace(row+'\n','')
vertex=vertex.replace('in vec3 in_normal;','in vec3 in_normal;\nin vec3 native_position;\nin vec4 native_hwa;\nin vec3 native_color;')
vertex=vertex.replace('void main() {','vec3 web_world(vec3 p) { return vec3(p.x,p.z,-p.y); }\nvoid main() {').replace('  int id = int(texelFetch(segment_index_tex, gl_InstanceID).r);\n','').replace('texelFetch(height_width_angle_tex, id)','native_hwa').replace('texelFetch(position_tex, id).xyz','native_position').replace('view_matrix * vec4(scale_matrix * in_position + offset, 1.0)','viewMatrix * vec4(web_world(scale_matrix * in_position + offset), 1.0)').replace('view_matrix * vec4(in_normal, 0.0)','viewMatrix * vec4(web_world(in_normal), 0.0)').replace('decode_color(texelFetch(color_tex, id).r)','native_color').replace('projection_matrix','projectionMatrix')
fragment='precision highp float;\nin vec3 color;\nout vec4 fragment_color;\nvoid main(){fragment_color=vec4(color,1.0);}'
manifest={'commit':commit,'sources':{p:hashlib.sha256(text.encode()).hexdigest()for p,text in texts.items()},'resolution':16,'triangleCount':32,'geometry':geometry,'originalVertexShader':reference_vertex}
(stage/'tests/fixtures/native-preview-options-reference.json').write_text(json.dumps(manifest,indent=2)+'\n')
(stage/'src/preview-options-data.js').write_text('// Generated from OrcaSlicer '+commit+' OptionTemplate.cpp / Shaders.hpp.\n// Original Prusa Research contributors; AGPLv3 or later. Run scripts/generate-native-preview-options.py.\nexport const nativeOptionPositions=Object.freeze('+json.dumps(positions,separators=(',',':'))+');\nexport const nativeOptionNormals=Object.freeze('+json.dumps(normals,separators=(',',':'))+');\nexport const nativeOptionsVertexShader='+json.dumps(vertex)+';\nexport const nativeOptionsFragmentShader='+json.dumps(fragment)+';\n')
print(len(positions)//3,'native option vertices generated')
