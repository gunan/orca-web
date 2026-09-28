// Mechanically adapt the pinned native shader's buffer inputs to WebGL instance
// attributes, retaining native cap/view/normal/lighting arithmetic verbatim.
import {readFile,writeFile}from'node:fs/promises';
import {createHash}from'node:crypto';
const sourcePath=process.argv[2],outputPath=process.argv[3];if(!sourcePath||!outputPath)throw new Error('Expected pinned Shaders.hpp and output JS paths');
const source=await readFile(sourcePath,'utf8');
if(createHash('sha256').update(source).digest('hex')!=='b477608ae44b93b1423bf8807976bec3c0cd30308737519449c7fff197d22068')throw new Error('Source shader does not match pinned OrcaSlicer2.4.2');
const section=source.split('static const char* Segments_Vertex_Shader =')[1]?.split('static const char* Segments_Fragment_Shader =')[0];if(!section)throw new Error('Native segment shader was not found');
let shader=[...section.matchAll(/"(?:[^"\\]|\\.)*"/g)].map(m=>JSON.parse(m[0])).join('');
function replace(from,to){if(!shader.includes(from))throw new Error('Native shader structure changed: '+from);shader=shader.replace(from,to);}
replace('#version 150\n','precision highp float;\nprecision highp int;\n');
// Desktop GLSL implicitly converts this integer; GLSL ES requires a float.
replace('height_width_angle.z == 0','height_width_angle.z == 0.0');
replace('uniform mat4 view_matrix;','uniform mat4 viewMatrix;');replace('uniform mat4 projection_matrix;','uniform mat4 projectionMatrix;');
replace('uniform samplerBuffer position_tex;\nuniform samplerBuffer height_width_angle_tex;\nuniform samplerBuffer color_tex;\nuniform usamplerBuffer segment_index_tex;\nin int vertex_id;', 'in float native_vertex_id;\nin vec3 native_start;\nin vec3 native_end;\nin vec4 native_hwa_start;\nin vec4 native_hwa_end;\nin vec3 native_color_start;\nin vec3 native_color_end;');
replace('void main() {\n  int id_a = int(texelFetch(segment_index_tex, gl_InstanceID).r);\n  int id_b = id_a + 1;\n  vec3 pos_a = texelFetch(position_tex, id_a).xyz;\n  vec3 pos_b = texelFetch(position_tex, id_b).xyz;', 'vec3 web_world(vec3 p) { return vec3(p.x, p.z, -p.y); }\nvoid main() {\n  int vertex_id = int(native_vertex_id);\n  vec3 pos_a = native_start;\n  vec3 pos_b = native_end;');
replace('  int id = vertex_id < 4 ? id_a : id_b;\n','');
replace('  vec4 hwa = texelFetch(height_width_angle_tex, id);','  vec4 hwa = vertex_id < 4 ? native_hwa_start : native_hwa_end;');
replace('  int closer_id = (dot(camera_position - pos_a, camera_position - pos_a) < dot(camera_position - pos_b, camera_position - pos_b)) ? id_a : id_b;\n  vec3 closer_pos = (closer_id == id_a) ? pos_a : pos_b;','  bool closer_a = dot(camera_position - pos_a, camera_position - pos_a) < dot(camera_position - pos_b, camera_position - pos_b);\n  vec3 closer_pos = closer_a ? pos_a : pos_b;');
replace('  vec3 closer_height_width_angle = texelFetch(height_width_angle_tex, closer_id).xyz;','  vec3 closer_height_width_angle = closer_a ? native_hwa_start.xyz : native_hwa_end.xyz;');
replace('view_matrix * vec4(pos, 1.0)','viewMatrix * vec4(web_world(pos), 1.0)');
replace('view_matrix * vec4(normalize(pos - endpoint_pos), 0.0)','viewMatrix * vec4(web_world(normalize(pos - endpoint_pos)), 0.0)');
replace('  vec3 color_base = decode_color(texelFetch(color_tex, id).r);','  vec3 color_base = vertex_id < 4 ? native_color_start : native_color_end;');
replace('projection_matrix * vec4(eye_position, 1.0)','projectionMatrix * vec4(eye_position, 1.0)');
const hash=createHash('sha256').update(source).digest('hex');
await writeFile(outputPath,`// Derived mechanically from OrcaSlicer8500fcd libvgcode Shaders.hpp.\n// Original Prusa Research contributors; AGPLv3 or later. Source SHA256 ${hash}.\nexport const nativePreviewVolumeVertexShader = ${JSON.stringify(shader)};\nexport const nativePreviewVolumeFragmentShader = 'precision highp float;\\nin vec3 color;\\nout vec4 fragment_color;\\nvoid main(){fragment_color=vec4(color,1.0);}';\n`);
