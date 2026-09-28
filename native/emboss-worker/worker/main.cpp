// Native OrcaSlicer 2.4.2 geometry glue; surface orchestration adapted from EmbossJob.cpp.
// Distributed under the GNU Affero General Public License v3; see ../LICENSE.txt.
#include <fstream>
#include <iostream>
#include <iterator>
#include <nlohmann/json.hpp>
#include <imgui/imstb_truetype.h>
#include <libslic3r/Emboss.hpp>
#include <libslic3r/CutSurface.hpp>
#include <libslic3r/TriangleMesh.hpp>
#include "per-glyph.hpp"
#include "svg-shape.hpp"
#include <boost/nowide/convert.hpp>
#include <sys/resource.h>
#include <tbb/global_control.h>
#include <atomic>
#include <thread>
#include <chrono>
#ifdef __APPLE__
#include <mach/mach.h>
#include <unistd.h>
#endif
// Match libslic3r.cpp's default kernel scale; no printer scaling is involved.
double SCALING_FACTOR=SCALING_FACTOR_INTERNAL;
using namespace Slic3r;
using json=nlohmann::json;
Transform3d matrix(const json&values){if(!values.is_array()||values.size()!=16)throw std::runtime_error("Expected affine 16-element matrix");Transform3d tr;for(int i=0;i<16;++i){double v=values[i].get<double>();if(!std::isfinite(v)||std::abs(v)>1e6)throw std::runtime_error("Invalid transform value");tr.matrix().data()[i]=v;}if(tr.matrix().row(3)!=Eigen::RowVector4d(0,0,0,1)||std::abs(tr.linear().determinant())<1e-12)throw std::runtime_error("Singular/nonaffine transform");return tr;}
indexed_triangle_set mesh(const json&j){indexed_triangle_set m;const auto&v=j.at("vertices");const auto&t=j.at("triangles");if(!v.is_array()||!t.is_array()||v.empty()||t.empty()||v.size()>200000||t.size()>200000)throw std::runtime_error("Mesh exceeds worker limits");for(const auto&p:v){if(p.size()!=3)throw std::runtime_error("Expected XYZ vertex");Vec3f q;for(int i=0;i<3;++i){double n=p[i].get<double>();if(!std::isfinite(n)||std::abs(n)>100000)throw std::runtime_error("Invalid mesh coordinate");q[i]=float(n);}m.vertices.push_back(q);}for(const auto&f:t){if(f.size()!=3)throw std::runtime_error("Expected indexed triangle");Vec3i32 q;for(int i=0;i<3;++i){if(!f[i].is_number_integer())throw std::runtime_error("Invalid mesh index");auto n=f[i].get<int64_t>();if(n<0||n>=m.vertices.size())throw std::runtime_error("Out of range mesh index");q[i]=int(n);}if(q[0]==q[1]||q[0]==q[2]||q[1]==q[2])throw std::runtime_error("Degenerate mesh index");m.indices.push_back(q);}return m;}
std::string font_name(const stbtt_fontinfo&info,int name_id){
 int length=0;const char*value=stbtt_GetFontNameString(&info,&length,STBTT_PLATFORM_ID_MICROSOFT,STBTT_MS_EID_UNICODE_BMP,STBTT_MS_LANG_ENGLISH,name_id);
 if(!value)value=stbtt_GetFontNameString(&info,&length,STBTT_PLATFORM_ID_UNICODE,STBTT_UNICODE_EID_UNICODE_2_0_FULL,0,name_id);
 if(!value||length<0||length>4096)return{};std::wstring decoded;for(int i=0;i+1<length;i+=2){uint32_t code=(uint8_t(value[i])<<8)|uint8_t(value[i+1]);if(code>=0xd800&&code<=0xdbff&&i+3<length){uint32_t tail=(uint8_t(value[i+2])<<8)|uint8_t(value[i+3]);if(tail>=0xdc00&&tail<=0xdfff){code=0x10000+((code-0xd800)<<10)+(tail-0xdc00);i+=2;}}decoded.push_back(wchar_t(code));}return boost::nowide::narrow(decoded);
}
using Source=EmbossSource;
// Source-backed GUI EmbossJob.cpp create_projection_for_cut / cut_surface_to_its.
Emboss::OrthoProject cut_projection(Transform3d tr,double scale,const std::pair<float,float>&range){double min_z=range.first-1.,max_z=range.second+1.;Vec3d direction=tr.linear()*Vec3d(0,0,max_z-min_z);tr.translate(Vec3d(0,0,min_z));tr.scale(scale);return {tr,direction};}
indexed_triangle_set surface_mesh(const ExPolygons&shapes,double scale,const Transform3d&tr,const std::vector<Source>&sources,float depth,bool outside){
 const BoundingBox bb=get_extents(shapes);size_t biggest=0,biggest_count=0;std::vector<size_t> map(sources.size(),std::numeric_limits<size_t>::max());std::vector<indexed_triangle_set> itss;
 for(size_t i=0;i<sources.size();++i){const auto&s=sources[i];auto projection=cut_projection(s.tr.inverse()*tr,scale,{0,1});auto part=its_cut_AoI(s.geometry,bb,projection);if(part.indices.empty())continue;if(biggest_count<part.vertices.size()){biggest_count=part.vertices.size();biggest=i;}map[i]=itss.size();itss.push_back(std::move(part));}
 if(itss.empty())throw std::runtime_error("Native surface engine found no intersecting source mesh");
 Transform3d tr_inv=sources[biggest].tr.inverse(),projection_tr=tr_inv*tr;BoundingBoxf3 mesh_bb=bounding_box(itss[map[biggest]]);
 for(size_t i=0;i<sources.size();++i){if(i==biggest||map[i]==std::numeric_limits<size_t>::max())continue;its_transform(itss[map[i]],sources[i].tr*tr_inv,true);mesh_bb.merge(bounding_box(itss[map[i]]));}
 Transform3d emboss_tr=projection_tr.inverse();auto bounds=mesh_bb.transformed(emboss_tr);std::pair<float,float> range{bounds.min.z(),bounds.max.z()};auto projection=cut_projection(projection_tr,scale,range);float ratio=(-range.first+1.f)/(range.second-range.first+2.f);
 ExPolygons reflected;const ExPolygons*shape_ptr=&shapes;bool reflection=has_reflection(tr);if(reflection){reflected=shapes;for(auto&s:reflected){s.contour.reverse();for(auto&h:s.holes)h.reverse();}shape_ptr=&reflected;}
 SurfaceCut cut=cut_surface(*shape_ptr,itss,projection,ratio);if(reflection){for(auto&c:cut.contours)std::reverse(c.begin(),c.end());for(auto&t:cut.indices)std::swap(t[0],t[1]);}if(cut.empty())throw std::runtime_error("Native surface engine found no valid facing patch");
 float front=outside?depth:.015f,back=-(outside?.015f:depth);its_transform(cut,emboss_tr.pretranslate(Vec3d(0,0,front)));return cut2model(cut,Emboss::OrthoProject3d(Vec3d(0,0,back-front)));
}
json mesh_output(const indexed_triangle_set &result,const EmbossShape &shape){ if(result.vertices.size()>1000000||result.indices.size()>1000000)throw std::runtime_error("Generated mesh exceeds worker output limits");json output={{"nativeVersion","2.4.2"},{"commit","8500fcdccaa10b5099ac20d252af3a7c560046f1"},{"scale",shape.scale},{"healed",shape.final_shape.is_healed},{"vertices",json::array()},{"triangles",json::array()}};for(const auto&p:result.vertices)output["vertices"].push_back({p.x(),p.y(),p.z()});for(const auto&t:result.indices)output["triangles"].push_back({t.x(),t.y(),t.z()});size_t zero_area=0;for(const auto &face:result.indices){const Vec3d a=result.vertices[face[0]].cast<double>(),b=result.vertices[face[1]].cast<double>(),c=result.vertices[face[2]].cast<double>();if((b-a).cross(c-a).squaredNorm()==0.)++zero_area;}if(zero_area)output["warnings"]={"Native geometry contains "+std::to_string(zero_area)+" zero-area triangles. The original native mesh is retained; inspect slicing before use."};return output;
}
void generate_svg(const json &request){
 const auto source=request.at("svg").get<std::string>();double depth=request.at("depth").get<double>();if(!std::isfinite(depth)||depth<.01||depth>10000)throw std::runtime_error("SVG depth exceeds worker limits");
 auto shape=native_svg_shape(source,request.value("toleranceScale",1.),request.value("shapeScale",SCALING_FACTOR));const auto polygons=union_with_delta(shape,Emboss::UNION_DELTA,Emboss::UNION_MAX_ITERATIN);if(polygons.empty())throw std::runtime_error("Native SVG produced no filled outlines");
 const bool outside=request.value("outside",true),surface=request.value("useSurface",false);indexed_triangle_set result;
 if(surface){std::vector<Source> models;const auto &source=request.at("sources");if(!source.is_array()||source.empty()||source.size()>32)throw std::runtime_error("Expected 1-32 source meshes for SVG surface");size_t vertices=0,triangles=0;for(const auto&s:source){auto geometry=mesh(s);vertices+=geometry.vertices.size();triangles+=geometry.indices.size();if(vertices>200000||triangles>200000)throw std::runtime_error("Combined source geometry exceeds worker limits");models.push_back({std::move(geometry),matrix(s.at("transform"))});}result=surface_mesh(polygons,shape.scale,matrix(request.at("transform")),models,float(depth),outside);}
 else{const float offset=outside?-.015f:.015f-float(depth);Transform3d tr=Eigen::Translation<double,3>(0.,0.,double(offset))*Eigen::Scaling(shape.scale);Emboss::ProjectTransform projection(std::make_unique<Emboss::ProjectZ>(depth/shape.scale),tr);result=Emboss::polygons2model(polygons,projection);}
 std::cout<<mesh_output(result,shape).dump()<<'\n';
}
class ResourceMonitor {
 std::atomic<bool> stopped{false};std::thread monitor;
 public: ResourceMonitor(){
#ifdef __APPLE__
 monitor=std::thread([this]{while(!stopped.load()){mach_task_basic_info_data_t info;mach_msg_type_number_t count=MACH_TASK_BASIC_INFO_COUNT;auto status=task_info(mach_task_self(),MACH_TASK_BASIC_INFO,reinterpret_cast<task_info_t>(&info),&count);if(status!=KERN_SUCCESS||info.resident_size>2ULL*1024*1024*1024){const char error[]="Native text worker memory limit exceeded or monitor unavailable\n";write(STDERR_FILENO,error,sizeof(error)-1);_exit(70);}std::this_thread::sleep_for(std::chrono::milliseconds(10));}});
#else
 struct rlimit memory_limit={2ULL*1024*1024*1024,2ULL*1024*1024*1024};if(setrlimit(RLIMIT_AS,&memory_limit)!=0)throw std::runtime_error("Cannot set native worker memory limit");
#endif
 }~ResourceMonitor(){stopped=true;if(monitor.joinable())monitor.join();}
};
int main(int argc,char**argv){try{
 if(argc==2&&std::string(argv[1])=="--version"){std::cout<<"OrcaWeb native emboss worker 2.4.2 8500fcdccaa10b5099ac20d252af3a7c560046f1\n";return 0;}
 if(argc==2&&std::string(argv[1])=="--capabilities"){std::cout<<json({{"nativeVersion","2.4.2"},{"commit","8500fcdccaa10b5099ac20d252af3a7c560046f1"},{"planar",true},{"surface",true},{"perGlyph",true},{"svg",true}}).dump()<<'\n';return 0;}
 struct rlimit cpu_limit={60,60};if(setrlimit(RLIMIT_CPU,&cpu_limit)!=0)throw std::runtime_error("Cannot set native worker CPU limit");
 ResourceMonitor resource_monitor;
 tbb::global_control parallel_limit(tbb::global_control::max_allowed_parallelism,2);
 if(argc!=2)throw std::runtime_error("Usage: emboss-prototype <font-file>; JSON request on stdin");
 std::string input;char buffer[65536];while(std::cin.read(buffer,sizeof buffer)||std::cin.gcount()){input.append(buffer,size_t(std::cin.gcount()));if(input.size()>32*1024*1024)throw std::runtime_error("Worker input exceeds 32 MiB");}json request=input.empty()?json::object():json::parse(input);
 if(std::string(argv[1])=="--svg"){generate_svg(request);return 0;}
 std::ifstream fontInput(argv[1],std::ios::binary|std::ios::ate);if(!fontInput)throw std::runtime_error("Cannot read font");auto size=fontInput.tellg();if(size<=0||size>32*1024*1024)throw std::runtime_error("Font exceeds size limits");fontInput.seekg(0);auto bytes=std::make_unique<std::vector<unsigned char>>(std::istreambuf_iterator<char>(fontInput),std::istreambuf_iterator<char>());auto file=Emboss::create_font_file(std::move(bytes));if(!file)throw std::runtime_error("Native font parser rejected font");
 if(request.value("operation",std::string{})=="font-info"){json fonts=json::array();for(size_t i=0;i<file->infos.size();++i){stbtt_fontinfo info;int offset=stbtt_GetFontOffsetForIndex(file->data->data(),int(i));if(offset<0||!stbtt_InitFont(&info,file->data->data(),offset))throw std::runtime_error("Native collection font is invalid");const auto&metrics=file->infos[i];fonts.push_back({{"index",i},{"family",font_name(info,1)},{"style",font_name(info,2)},{"fullName",font_name(info,4)},{"postscriptName",font_name(info,6)},{"ascent",metrics.ascent},{"descent",metrics.descent},{"lineGap",metrics.linegap},{"unitsPerEm",metrics.unit_per_em}});}std::cout<<json({{"nativeVersion","2.4.2"},{"commit","8500fcdccaa10b5099ac20d252af3a7c560046f1"},{"collections",fonts}}).dump()<<'\n';return 0;}
 Emboss::FontFileWithCache font(std::move(file));std::string text=request.value("text","A & B");double height=request.value("lineHeight",13.);double depth=request.value("depth",1.);if(text.empty()||text.size()>4096||text.find('\0')!=std::string::npos||!std::isfinite(height)||height<.1||height>1000||!std::isfinite(depth)||depth<.01||depth>10000)throw std::runtime_error("Text, height or depth exceeds worker limits");
 FontProp property(height);
 auto option=[&](const char*key,double bound){double value=request.at(key).get<double>();if(!std::isfinite(value)||std::abs(value)>bound)throw std::runtime_error(std::string("Out of range font property: ")+key);return value;};
 for(const char*key:{"charGap","lineGap"})if(request.contains(key)){double v=option(key,20000);if(v!=std::trunc(v))throw std::runtime_error("Font gap must be an integer");(std::string(key)=="charGap"?property.char_gap:property.line_gap)=int(v);}
 if(request.contains("boldness"))property.boldness=float(option("boldness",500000));if(request.contains("skew"))property.skew=float(option("skew",100));
 if(request.contains("collection")){double value=option("collection",1000);if(value<0||value!=std::trunc(value)||value>=font.font_file->infos.size())throw std::runtime_error("Font collection index is unavailable");property.collection_number=unsigned(value);}
 std::string horizontal=request.value("horizontal","center"),vertical=request.value("vertical","middle");if(horizontal=="left")property.align.first=FontProp::HorizontalAlign::left;else if(horizontal=="right")property.align.first=FontProp::HorizontalAlign::right;else if(horizontal!="center")throw std::runtime_error("Invalid horizontal alignment");if(vertical=="top")property.align.second=FontProp::VerticalAlign::top;else if(vertical=="bottom")property.align.second=FontProp::VerticalAlign::bottom;else if(vertical!="middle")throw std::runtime_error("Invalid vertical alignment");
 EmbossShape shape;shape.shapes_with_ids=Emboss::text2vshapes(font,boost::nowide::widen(text),property);shape.scale=Emboss::get_text_shape_scale(property,*font.font_file);const auto polygons=union_with_delta(shape,Emboss::UNION_DELTA,Emboss::UNION_MAX_ITERATIN);if(polygons.empty())throw std::runtime_error("Native font produced no text outlines");
 indexed_triangle_set result;bool outside=request.value("outside",true),surface=request.value("useSurface",false),per_glyph=request.value("perGlyph",false);
 std::vector<Source> models;Transform3d transform=Transform3d::Identity();
 if(surface||per_glyph){const auto&source=request.at("sources");if(!source.is_array()||source.empty()||source.size()>32)throw std::runtime_error("Expected 1-32 source meshes for surface/per-glyph layout");size_t vertices=0,triangles=0;for(const auto&s:source){auto geometry=mesh(s);vertices+=geometry.vertices.size();triangles+=geometry.indices.size();if(vertices>200000||triangles>200000)throw std::runtime_error("Combined source geometry exceeds worker limits");models.push_back({std::move(geometry),matrix(s.at("transform"))});}transform=matrix(request.at("transform"));}
 if(per_glyph){GlyphSurface cut;if(surface)cut=[&](const ExPolygons&polygons,const Transform3d&tr){return surface_mesh(polygons,shape.scale,tr,models,float(depth),outside);};result=native_per_glyph(shape,*font.font_file,property,transform,models,float(depth),outside,cut);}
 else if(surface)result=surface_mesh(polygons,shape.scale,transform,models,float(depth),outside);
 else{const float offset=outside?-.015f:.015f-float(depth);Transform3d tr=Eigen::Translation<double,3>(0.,0.,double(offset))*Eigen::Scaling(shape.scale);Emboss::ProjectTransform projection(std::make_unique<Emboss::ProjectZ>(depth/shape.scale),tr);result=Emboss::polygons2model(polygons,projection);}

 std::cout<<mesh_output(result,shape).dump()<<'\n';
 }catch(const std::exception&e){std::cerr<<e.what()<<'\n';return 1;}}
