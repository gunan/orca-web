// SPDX-License-Identifier: AGPL-3.0-only
// OrcaSlicer 2.4.2 FillBedJob.cpp at 8500fcdccaa10b5099ac20d252af3a7c560046f1.
// GUI ownership/progress is replaced by bounded JSON and the parent process
// cancellation deadline. Packing, float-grid order, setters and finalization
// retain the source behavior, including the all-instance setter.
#include "native-fill-bed.hpp"
#include "native-fill-tower.hpp"
#include "native-plate.hpp"
#include "input-validation.hpp"
#include "libslic3r/BuildVolume.hpp"
#include "libslic3r/ClipperUtils.hpp"
#include <numeric>
using namespace Slic3r;
using json=nlohmann::json;
extern void add_exclusions(arrangement::ArrangePolygons&,const DynamicPrintConfig&,int,float);
namespace {
using namespace arrangement;
constexpr size_t max_candidates=4096,max_instances=256,max_grid_visits=2000000;
void require(bool ok,const char*message){if(!ok)throw std::runtime_error(message);}
Transform3d tr(const json&values){Transform3d t=Transform3d::Identity();if(!values.is_null())for(int i=0;i<16;i++)t.matrix().data()[i]=values.at(i).get<double>();return t;}
json mat(const Transform3d&t){json v=json::array();for(int i=0;i<16;i++)v.push_back(t.matrix().data()[i]);return v;}
template<class Config>void assign(Config&config,const json&values){ConfigSubstitutionContext substitutions(ForwardCompatibilitySubstitutionRule::Disable);for(const auto&kv:values.items()){std::string value;if(kv.value().is_array()){const auto*option=config.option(kv.key());if(option&&option->type()==coStrings)value=ConfigOptionStrings(kv.value().get<std::vector<std::string>>()).serialize();else for(const auto&v:kv.value()){if(!value.empty())value+=",";value+=v.get<std::string>();}}else value=kv.value().get<std::string>();config.set_deserialize(kv.key(),value,substitutions);}}
std::vector<BoundingBoxf> excluded_boxes(const DynamicPrintConfig&config,const Vec2d&origin){std::vector<BoundingBoxf>boxes;const auto*points=config.option<ConfigOptionPoints>("bed_exclude_area");if(points)for(size_t i=0;i+3<points->values.size();i+=4){BoundingBoxf box;for(size_t j=i;j<i+4;j++)box.merge(points->values[j]+origin);boxes.push_back(box);}return boxes;}
// Plater::get_empty_cells: strict <, X-major iteration, float addition,
// expanded BuildVolume bounds, bbox exclusion overlap (not polygon packing).
std::vector<Vec2f> grid(const Vec2f step,const BoundingBoxf&bbox,const std::vector<BoundingBoxf>&exclusions){
 require(step.allFinite()&&step.minCoeff()>0,"Native Fill grid needs a positive finite footprint");
 std::vector<Vec2f>cells;size_t visits=0;const float first_x=step.x()/2+bbox.min.x(),first_y=step.y()/2+bbox.min.y();
 require(first_x+step.x()>first_x&&first_y+step.y()>first_y,"Native Fill grid exceeds float coordinate resolution");
 for(float x=first_x;x<bbox.max.x()-step.x()/2;x+=step.x()){
  require(x+step.x()>x,"Native Fill X grid no longer advances");
  for(float y=first_y;y<bbox.max.y()-step.y()/2;y+=step.y()){
   require(++visits<=max_grid_visits&&y+step.y()>y,"Native Fill grid exceeds bounded visit limit");
   BoundingBoxf cell(Vec2d(x-step.x()/2,y-step.y()/2),Vec2d(x+step.x()/2,y+step.y()/2));bool blocked=false;
   for(const auto&box:exclusions)if(box.overlap(cell)){blocked=true;break;}
   if(!blocked){require(cells.size()<max_candidates,"Native Fill grid exceeds 4096 cells; enlarge the object or use a smaller plate");cells.emplace_back(x,y);}
  }
 }return cells;
}
}
json native_fill_bed(const json&request){
 using namespace arrangement;
 require(request.value("operation",std::string())=="fill-bed","Expected native Fill request");
 require(request.value("mode",std::string("instances"))=="instances","Native Fill supports the Clone dialog's instance workflow");
 // Reuse the arrangement mesh/settings validator, retaining non-printable
 // instances as fixed objects here rather than routing them outside the bed.
 json checked=request;checked["format"]="orca-arrangement-request";size_t total_instances=0;std::set<std::string>instance_ids;
 for(auto&object:checked.at("objects")){
  const auto&instances=object.at("instances");require(instances.is_array()&&!instances.empty()&&(total_instances+=instances.size())<=max_instances,"Native Fill requires at most 256 input instances");
  for(const auto&i:instances){arrangement_input::matrix(i.at("matrix"));require(i.at("id").is_string()&&!i.at("id").get_ref<const std::string&>().empty()&&i.at("id").get_ref<const std::string&>().size()<=256&&instance_ids.insert(i.at("id").get<std::string>()).second,"Invalid native instance identity");if(i.contains("printable"))require(i["printable"].is_boolean(),"Invalid native instance printable state");}
  object["matrix"]=instances.front()["matrix"];object["printable"]=true;
 }arrangement_input::request(checked);
 require(request.value("format",std::string())=="orca-fill-bed-request","Invalid Fill request format");
 const auto&plate=request.at("plate");for(const auto*key:{"index","count","columns"})require(plate.at(key).is_number_integer(),"Invalid native Fill plate index");const int plate_index=plate.at("index").get<int>(),plate_count=plate.at("count").get<int>(),cols=plate.at("columns").get<int>();
 require(plate_count>=1&&plate_count<=36&&plate_index>=0&&plate_index<plate_count&&cols==int(std::ceil(std::sqrt(double(plate_count)))) ,"Invalid native Fill plate layout");
 const auto&origin_j=plate.at("origin");require(origin_j.is_array()&&origin_j.size()==2,"Invalid Fill plate origin");Vec2d origin;for(int axis=0;axis<2;axis++)origin[axis]=arrangement_input::number(origin_j[axis],-1e6,1e6);
 require(request.contains("isBbl")&&request["isBbl"].is_boolean(),"Native vendor context is required for Fill");const bool is_bbl=request.at("isBbl").get<bool>();
 auto config=DynamicPrintConfig::full_print_config();assign(config,request.value("settings",json::object()));
 const auto bed=get_bed_shape(config);require(bed.size()>=3&&Polygon(bed).area()>0,"Native Fill requires a positive bed area");const auto local_box=Polygon(bed).bounding_box();
 const double width=unscaled<double>(local_box.size().x()),depth=unscaled<double>(local_box.size().y());
 require(width>0&&depth>0&&width<=100000&&depth<=100000,"Native Fill bed dimensions exceed bounds");
 const Vec2d expected_origin(1.2*width*(plate_index%cols),-1.2*depth*(plate_index/cols));require((origin-expected_origin).cwiseAbs().maxCoeff()<1e-7,"Fill plate origin does not match native plate layout");
 const auto*extruder_areas=config.option<ConfigOptionPointsGroups>("extruder_printable_area");require(!extruder_areas||extruder_areas->values.empty(),"Fill for per-extruder printable regions is not implemented yet");
 const BoundingBox plate_box(Point(local_box.min.x()+scaled(origin.x()),local_box.min.y()+scaled(origin.y())),Point(local_box.max.x()+scaled(origin.x()),local_box.max.y()+scaled(origin.y())));
 Model model;int selected_object=-1,selected_instance=-1;std::vector<std::vector<std::string>>ids;size_t expanded_triangles=0,world_visits=0;
 for(const auto&o:request.at("objects")){
  auto*obj=model.add_object();obj->name=o.at("id").get<std::string>();assign(obj->config,o.value("settings",json::object()));ids.emplace_back();
  for(const auto&p:o.at("parts")){indexed_triangle_set mesh;for(const auto&v:p.at("vertices"))mesh.vertices.emplace_back(v[0].get<float>(),v[1].get<float>(),v[2].get<float>());for(const auto&f:p.at("triangles"))mesh.indices.emplace_back(f[0].get<int>(),f[1].get<int>(),f[2].get<int>());auto*volume=obj->add_volume(TriangleMesh(std::move(mesh)));volume->set_type(ModelVolume::type_from_string(p.value("type",std::string("normal_part"))));volume->set_transformation(tr(p.value("matrix",json()))*volume->get_matrix());assign(volume->config,p.value("settings",json::object()));const auto colors=p.value("color",json::object());for(const auto&color:colors.items())volume->mmu_segmentation_facets.set_triangle_from_string(std::stoi(color.key()),color.value().get<std::string>());}
  for(const auto&i:o.at("instances")){auto*instance=obj->add_instance();instance->set_transformation(Geometry::Transformation(tr(i.at("matrix"))));instance->printable=i.value("printable",true);ids.back().push_back(i.at("id").get<std::string>());if(o.at("id")==request.at("selectedObjectId")&&i.at("id")==request.at("selectedInstanceId")){selected_object=int(model.objects.size()-1);selected_instance=int(obj->instances.size()-1);}}
 }require(selected_object>=0&&selected_instance>=0,"Select one native model instance to Fill");
 for(const auto&o:request.at("objects")){size_t faces=0;for(const auto&p:o.at("parts"))faces+=p.at("triangles").size();expanded_triangles+=faces*o.at("instances").size();require(expanded_triangles<=2000000,"Native Fill input exceeds two million expanded triangles");for(const auto&i:o.at("instances"))for(const auto&p:o.at("parts")){const Transform3d world=tr(i.at("matrix"))*tr(p.value("matrix",json()));for(const auto&v:p.at("vertices")){require(++world_visits<=8000000,"Native Fill transform validation exceeds eight million vertices");const Vec3d point=world*Vec3d(v[0].get<double>(),v[1].get<double>(),v[2].get<double>());require(point.allFinite()&&point.cwiseAbs().maxCoeff()<=1e6,"Native Fill world coordinates exceed bounds");}}}
 auto*selected_model=model.objects[selected_object];require(selected_model->instances[selected_instance]->printable,"Select a printable model instance to Fill");
 NativeArrangePrint print;print.m_config.apply(config,true);std::vector<NativeArrangeObject>print_objects;for(auto*obj:model.objects){NativeArrangeObject item;item.object_config.apply(config,true);item.object_config.apply(obj->config.get(),true);item.object_height=obj->instance_convex_hull_bounding_box(obj->instances.front()).size().z();print_objects.push_back(std::move(item));}for(auto&obj:print_objects)print.m_objects.push_back(&obj);
 const auto options=request.value("options",json::object());ArrangeParams params;params.min_obj_distance=scaled(options.value("spacing",0.));params.allow_rotations=options.value("rotation",false);params.allow_multi_materials_on_same_plate=options.value("multipleMaterials",true);params.align_to_y_axis=options.value("alignY",false);params.avoid_extrusion_cali_region=options.value("avoidCalibration",false);params.is_seq_print=options.value("sequential",false);params.object_skirt_offset=std::get<0>(print.object_skirt_offset());params.clearance_radius=config.opt_float("extruder_clearance_radius")+2*params.object_skirt_offset;params.clearance_height_to_rod=config.opt_float("extruder_clearance_height_to_rod");params.clearance_height_to_lid=config.opt_float("extruder_clearance_height_to_lid");params.printable_height=config.opt_float("printable_height");params.nozzle_height=config.opt_float("nozzle_height");params.align_center=config.opt<ConfigOptionPoint>("best_object_pos")->value;params.progressind=[](unsigned,std::string){};if(params.is_seq_print){params.bed_shrink_x=BED_SHRINK_SEQ_PRINT;params.bed_shrink_y=BED_SHRINK_SEQ_PRINT;}
 ArrangePolygons selected,unselected,locked;
 std::set<int>extruders;
 for(size_t oi=0;oi<model.objects.size();oi++)for(size_t ii=0;ii<model.objects[oi]->instances.size();ii++){
  auto*instance=model.objects[oi]->instances[ii];auto ap=get_instance_arrange_poly(instance,config);require(ap.poly.area()>0&&std::isfinite(ap.height)&&ap.height<=params.printable_height,"Fill object footprint or height is invalid");if(plate_box.contains(ap.transformed_poly().contour.bounding_box()))extruders.insert(ap.extrude_ids.begin(),ap.extrude_ids.end());ap.name=model.objects[oi]->name;
  if(int(oi)==selected_object&&instance->printable){++ap.priority;ap.itemid=selected.size();selected.emplace_back(ap);}
  else if(plate_box.contains(ap.transformed_poly().contour.bounding_box())){ap.bed_idx=0;ap.itemid=unselected.size();ap.row=plate_index/cols;ap.col=plate_index%cols;ap.translation.x()-=1.2*width*(plate_index%cols);ap.translation.y()+=1.2*depth*(plate_index/cols);unselected.emplace_back(ap);}
  else{ap.bed_idx=36;ap.itemid=locked.size();locked.emplace_back(ap);}
 }
 require(!selected.empty(),"Select a printable native object to Fill");
 // Source FillBedJob inserts the native viewport obstacle after exclusions.
 // Legacy direct-worker callers must supply full project context when needed.
 require(request.contains("towerPreview")||!(config.opt_bool("enable_prime_tower")&&!params.is_seq_print&&(extruders.size()>1||config.opt_enum<TimelapseType>("timelapse_type")==tlSmooth||config.opt_bool("enable_wrapping_detection"))),"Fill with a visible prime tower requires the native viewport tower footprint context");
 add_exclusions(params.excluded_regions,config,1,1);add_exclusions(unselected,config,36,0);
 json tower_diagnostic=nullptr;
 if(request.contains("towerPreview")){
  auto tower=native_fill_tower(request.at("towerPreview"),config,plate_index,Vec2d(width,depth),origin);
  if(tower){tower_diagnostic=fill_tower_diagnostic(*tower);unselected.push_back(std::move(*tower));}
 }
 const double sc=scaled<double>(1.)*scaled(1.);const auto polys=offset_ex(selected.front().poly,params.min_obj_distance/2);const auto poly=polys.empty()?selected.front().poly:polys.front();const double poly_area=poly.area()/sc;
 require(poly_area>0&&std::isfinite(poly_area),"Fill source footprint is degenerate");
 const double unselected_area=std::accumulate(unselected.begin(),unselected.end(),0.,[plate_index](double sum,const auto&ap){return sum+(ap.bed_idx==plate_index)*ap.poly.area();})/sc;
 const double candidate_value=(Polygon(bed).area()/sc-(unselected_area+selected.size()*poly_area))/poly_area;
 require(std::isfinite(candidate_value)&&candidate_value<=double(max_candidates-selected.size())&&candidate_value>=-double(max_candidates),"Fill exceeds the 4096 candidate limit; enlarge the object or use a smaller plate");
 const int needed=int(candidate_value);const size_t original_count=selected_model->instances.size(),selected_original_count=selected.size();auto*template_instance=selected_model->instances[selected_instance];const auto template_ap=get_instance_arrange_poly(template_instance,config);double offset_base=.05*std::max(width,depth),offset=offset_base;
 for(int i=0;i<needed;i++,offset+=offset_base){auto ap=template_ap;ap.poly=selected.front().poly;ap.bed_idx=36;ap.itemid=-1;ap.setter=[selected_model,offset](const ArrangePolygon&p){auto*last=selected_model->instances.back();selected_model->add_instance(last->get_offset()+Vec3d(offset,offset,0),last->get_scaling_factor(),last->get_rotation(),last->get_mirror());for(auto*instance:selected_model->instances)instance->apply_arrange_result(p.translation.cast<double>(),p.rotation);};selected.push_back(std::move(ap));}
 update_arrange_params(params,&config,selected);auto shrunk=get_shrink_bedpts(&config,params);
 if(is_bbl&&params.avoid_extrusion_cali_region&&config.opt_bool("scan_first_layer"))for(int bed_index=0;bed_index<36;bed_index++){ArrangePolygon ap;ap.poly.contour=Polygon({{scaled(18.),0},{scaled(240.),0},{scaled(240.),scaled(15.)},{scaled(18.),scaled(15.)}});ap.is_virt_object=true;ap.is_extrusion_cali_object=true;ap.bed_idx=bed_index;ap.height=1;unselected.push_back(ap);}
 update_selected_items_inflation(selected,&config,params);update_unselected_items_inflation(unselected,&config,params);bool stop=false;params.stopcondition=[&stop]{return stop;};params.on_packed=[&stop](const ArrangePolygon&ap){stop=ap.bed_idx>0&&ap.priority==0;};params.do_final_align=!is_bbl;
 const bool uses_grid=selected.size()>100;
 if(uses_grid){Vec2f step=unscaled<float>(get_extents(selected.front().poly).size())+Vec2f(selected.front().brim_width,selected.front().brim_width);const double epsilon=BuildVolume::SceneEpsilon;BoundingBoxf box(Vec2d(unscaled<double>(local_box.min.x()),unscaled<double>(local_box.min.y()))+origin-Vec2d(epsilon,epsilon),Vec2d(unscaled<double>(local_box.max.x()),unscaled<double>(local_box.max.y()))+origin+Vec2d(epsilon,epsilon));const auto cells=grid(step,box,excluded_boxes(config,origin));const size_t count=std::min(selected.size(),cells.size());for(size_t i=0;i<selected.size();i++){if(i<count){selected[i].translation=scaled<coord_t>(cells[i]);selected[i].bed_idx=0;}else selected[i].bed_idx=-1;}}
 else arrange(selected,unselected,shrunk,params);
 const int added=std::accumulate(selected.begin(),selected.end(),0,[](int count,const auto&ap){return count+int(ap.priority==0&&ap.bed_idx==0);});
 require(total_instances+added<=max_instances,"Fill would exceed the 256-instance native arrangement limit; enlarge the object or use a smaller plate");
 size_t selected_triangles=0;for(const auto*volume:selected_model->volumes)selected_triangles+=volume->mesh().its.indices.size();require(expanded_triangles+size_t(added)*selected_triangles<=2000000,"Native Fill output exceeds two million expanded triangles");
 json placements=json::array();for(const auto&ap:selected)placements.push_back({{"priority",ap.priority},{"bedIndex",ap.bed_idx},{"translation",{unscaled<double>(ap.translation.x()),unscaled<double>(ap.translation.y())}},{"rotation",ap.rotation},{"order",ap.itemid}});
 if(added>0)for(auto&ap:selected){if(ap.bed_idx!=0)continue;ap.bed_idx=plate_index;if(!uses_grid){ap.translation.x()+=1.2*width*(plate_index%cols);ap.translation.y()-=1.2*depth*(plate_index/cols);}ap.apply();}
 json frames=json::array();for(size_t i=0;i<selected_model->instances.size();i++)frames.push_back({{"id",i<original_count?json(ids[selected_object][i]):json(nullptr)},{"sourceInstanceId",i<original_count?ids[selected_object][i]:ids[selected_object].back()},{"index",i},{"matrix",mat(selected_model->instances[i]->get_matrix())},{"printable",selected_model->instances[i]->printable}});
 return{{"format","orca-native-fill-bed"},{"version",1},{"sourceRevision","8500fcdccaa10b5099ac20d252af3a7c560046f1"},{"selectedObjectId",request.at("selectedObjectId")},{"selectedInstanceId",request.at("selectedInstanceId")},{"instances",frames},{"added",added},{"requiresArrange",added>0},{"diagnostics",{{"candidateCount",selected.size()},{"requestedCandidates",needed},{"path",uses_grid?"native-float-grid":"native-packing"},{"footprintArea",poly_area},{"fixedArea",unselected_area+selected_original_count*poly_area},{"placements",placements},{"lockedCount",locked.size()},{"tower",tower_diagnostic}}}};
}
