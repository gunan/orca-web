// SPDX-License-Identifier: AGPL-3.0-only
// Two original pinned PartPlate function bodies follow unchanged apart from the
// ReferencePlate class qualifier. The headless fixture owns its Model/PrintConfig.
// It does not call the production worker parser, facade, or NativeArrangePlate.
#include "libslic3r/Model.hpp"
#include "libslic3r/ModelArrange.hpp"
#include "libslic3r/GCode/WipeTower.hpp"
#include <boost/log/trivial.hpp>
#include <boost/format.hpp>
#include <nlohmann/json.hpp>
#include <iostream>
namespace Slic3r {
struct ReferencePrint {PrintConfig value;const PrintConfig&config()const{return value;}};
struct ReferencePlate {
 const Model*m_model;const ReferencePrint*m_print;int m_width,m_depth;
 bool contain_instance_totally(int,int)const{return true;}
 std::vector<int>get_extruders(bool)const{return {1,2};}
 Vec3d estimate_wipe_tower_size(const DynamicPrintConfig&,double,double,int,int,bool,bool)const;
 arrangement::ArrangePolygon estimate_wipe_tower_polygon(const DynamicPrintConfig&,int,Vec3d&,Vec3d&,int,int,bool)const;
};
Vec3d ReferencePlate::estimate_wipe_tower_size(const DynamicPrintConfig & config, const double w, const double wipe_volume, int extruder_count, int plate_extruder_size, bool use_global_objects, bool enable_wrapping_detection) const
{
    Vec3d wipe_tower_size;
    double layer_height = 0.08f; // hard code layer height
    double max_height = 0.f;
    wipe_tower_size.setZero();

    const ConfigOption* layer_height_opt = config.option("layer_height");
    if (layer_height_opt)
        layer_height = layer_height_opt->getFloat();

    // empty plate
    if (plate_extruder_size == 0)
    {
        std::vector<int> plate_extruders = get_extruders(true);
        plate_extruder_size = plate_extruders.size();
    }
    if (plate_extruder_size == 0)
        return wipe_tower_size;

    for (int obj_idx = 0; obj_idx < m_model->objects.size(); obj_idx++) {
        if (!use_global_objects && !contain_instance_totally(obj_idx, 0))
            continue;

		BoundingBoxf3 bbox = m_model->objects[obj_idx]->bounding_box_exact();
        max_height = std::max(bbox.size().z(), max_height);
    }
    wipe_tower_size(2) = max_height;
    //const DynamicPrintConfig &dconfig = wxGetApp().preset_bundle->prints.get_edited_preset().config;
    auto timelapse_type    = config.option<ConfigOptionEnum<TimelapseType>>("timelapse_type");
    bool need_wipe_tower = (timelapse_type ? (timelapse_type->value == TimelapseType::tlSmooth) : false) | enable_wrapping_detection;
    double extra_spacing     = config.option("prime_tower_infill_gap")->getFloat() / 100.;
    const ConfigOptionEnum<WipeTowerWallType>* use_rib_wall_opt = config.option<ConfigOptionEnum<WipeTowerWallType>>("wipe_tower_wall_type");
    bool use_rib_wall = use_rib_wall_opt ? use_rib_wall_opt->value == WipeTowerWallType::wtwRib: false;
    double rib_width = config.option("wipe_tower_rib_width")->getFloat();
    double depth;
    double filament_change_volume=0.;
    {
        std::vector<double>             filament_change_lengths;
        auto                filament_change_lengths_opt = m_print->config().option<ConfigOptionFloats>("filament_change_length");
        if (filament_change_lengths_opt) filament_change_lengths = filament_change_lengths_opt->values;
        double length = filament_change_lengths.empty() ? 0 : *std::max_element(filament_change_lengths.begin(), filament_change_lengths.end());
        double diameter = 1.75;
        std::vector<double> diameters;
        auto                filament_diameter_opt = m_print->config().option<ConfigOptionFloats>("filament_diameter");
        if (filament_diameter_opt) diameters = filament_diameter_opt->values;
        diameter = diameters.empty() ? diameter : *std::max_element(diameters.begin(), diameters.end());
        filament_change_volume = length * PI * diameter * diameter / 4.;
    }
    double volume = wipe_volume * (extruder_count == 2 ? plate_extruder_size : (plate_extruder_size - 1));
    if (extruder_count == 2) volume += filament_change_volume * (int) (plate_extruder_size / 2);
    if (use_rib_wall) {
        depth = std::sqrt(volume / layer_height * extra_spacing);
        if (need_wipe_tower || plate_extruder_size > 1) {
            float min_wipe_tower_depth = WipeTower::get_limit_depth_by_height(max_height);
            double volume_depth         = depth;
            depth = std::max((double) min_wipe_tower_depth, depth);
            rib_width = std::min(rib_width, depth / 2);
            depth = rib_width / std::sqrt(2) + std::max(depth + m_print->config().wipe_tower_extra_rib_length.value, volume_depth);
            wipe_tower_size(0) = wipe_tower_size(1) = depth;
        }
    }
    else {
        depth  =  volume/ (layer_height * w) *extra_spacing;
        if (need_wipe_tower || depth > EPSILON) {
            float min_wipe_tower_depth = WipeTower::get_limit_depth_by_height(max_height);
            depth = std::max((double)min_wipe_tower_depth, depth);
        }
        wipe_tower_size(0) = w;
        wipe_tower_size(1) = depth;
    }

    return wipe_tower_size;
}
arrangement::ArrangePolygon ReferencePlate::estimate_wipe_tower_polygon(const DynamicPrintConfig& config, int plate_index, Vec3d& wt_pos, Vec3d& wt_size, int extruder_count, int plate_extruder_size, bool use_global_objects) const
{
	float x = dynamic_cast<const ConfigOptionFloats*>(config.option("wipe_tower_x"))->get_at(plate_index);
	float y = dynamic_cast<const ConfigOptionFloats*>(config.option("wipe_tower_y"))->get_at(plate_index);
	float w = dynamic_cast<const ConfigOptionFloat*>(config.option("prime_tower_width"))->value;
	//float a = dynamic_cast<const ConfigOptionFloat*>(config.option("wipe_tower_rotation_angle"))->value;
	float v = dynamic_cast<const ConfigOptionFloat*>(config.option("prime_volume"))->value;
    float tower_brim_width = dynamic_cast<const ConfigOptionFloat*>(config.option("prime_tower_brim_width"))->value;
    const ConfigOptionBool * wrapping_opt = dynamic_cast<const ConfigOptionBool *>(config.option("enable_wrapping_detection"));
	bool enable_wrapping = (wrapping_opt != nullptr) && wrapping_opt->value;
	wt_size = estimate_wipe_tower_size(config, w, v, extruder_count, plate_extruder_size, use_global_objects, enable_wrapping);
	int plate_width=m_width, plate_depth=m_depth;
	float depth = wt_size(1);
	float margin = WIPE_TOWER_MARGIN + tower_brim_width, wp_brim_width = 0.f;
	const ConfigOption* wipe_tower_brim_width_opt = config.option("prime_tower_brim_width");
	if (wipe_tower_brim_width_opt) {
		wp_brim_width = wipe_tower_brim_width_opt->getFloat();
        if (wp_brim_width < 0) wp_brim_width = WipeTower::get_auto_brim_by_height((float) wt_size.z());
		BOOST_LOG_TRIVIAL(info) << __FUNCTION__ << boost::format("arrange wipe_tower: wp_brim_width %1%") % wp_brim_width;
	}

	x = std::clamp(x, margin, (float)plate_width - w - margin - wp_brim_width);
    y = std::clamp(y, margin, (float)plate_depth - depth - margin - wp_brim_width);
    wt_pos(0) = x;
    wt_pos(1) = y;
    wt_pos(2) = 0.f;

	arrangement::ArrangePolygon wipe_tower_ap;
	Polygon ap({
		{scaled(x - wp_brim_width), scaled(y - wp_brim_width)},
		{scaled(x + w + wp_brim_width), scaled(y - wp_brim_width)},
		{scaled(x + w + wp_brim_width), scaled(y + depth + wp_brim_width)},
		{scaled(x - wp_brim_width), scaled(y + depth + wp_brim_width)}
		});
	wipe_tower_ap.bed_idx = plate_index;
	wipe_tower_ap.setter = NULL; // do not move wipe tower

	wipe_tower_ap.poly.contour = std::move(ap);
	wipe_tower_ap.translation = { scaled(0.f), scaled(0.f) };
	//wipe_tower_ap.rotation = a;
	wipe_tower_ap.name = "WipeTower";
	wipe_tower_ap.is_virt_object = true;
	wipe_tower_ap.is_wipe_tower = true;

	return wipe_tower_ap;
}
}
using namespace Slic3r;using namespace Slic3r::arrangement;using json=nlohmann::json;
json matrix(const Transform3d&t){json r=json::array();for(int i=0;i<16;++i)r.push_back(t.data()[i]);return r;}
int main(){json all=json::array();for(const std::string name:{"estimated-rib-tower","estimated-rectangle-tower","estimated-tower-rotation-ignored","estimated-tower-auto-brim-and-clamp"}){
 auto config=DynamicPrintConfig::full_print_config();json settings=json::object();auto set=[&](const char*k,std::string v){config.set_deserialize_strict(k,v);settings[k]=v;};
 set("printable_area","0x0,250x0,250x210,0x210");set("printable_height","220");set("nozzle_diameter","0.4");set("nozzle_height","2.5");set("extruder_clearance_radius","65");set("extruder_clearance_height_to_rod","36");set("extruder_clearance_height_to_lid","140");set("enable_support","0");set("skirt_loops","0");set("filament_type","PLA;PLA");set("support_filament","0");set("support_interface_filament","0");set("enable_prime_tower","1");set("prime_tower_width","25");set("prime_volume","45");set("prime_tower_brim_width",name=="estimated-tower-auto-brim-and-clamp"?"-1":"3");set("prime_tower_infill_gap","150%");set("layer_height","0.16");set("wipe_tower_x",name=="estimated-tower-auto-brim-and-clamp"?"-20":"105");set("wipe_tower_y",name=="estimated-tower-auto-brim-and-clamp"?"220":"85");set("wipe_tower_rotation_angle",name=="estimated-tower-rotation-ignored"?"45":"0");set("wipe_tower_wall_type",name=="estimated-rectangle-tower"?"rectangle":"rib");
 Model model;ArrangePolygons selected,fixed;json objects=json::array();for(int i=0;i<3;++i){auto*o=model.add_object();o->name=std::string(1,'A'+i);auto mesh=its_make_cube(20,20,name=="estimated-tower-auto-brim-and-clamp"?150.:20.);o->add_volume(TriangleMesh(mesh));o->config.set_key_value("extruder",new ConfigOptionInt(i==1?2:1));auto*inst=o->add_instance();inst->set_offset(Vec3d(i==2?110:50+i*25,i==2?80:50+i*5,0));auto ap=get_instance_arrange_poly(inst,config);ap.itemid=i;selected.push_back(ap);json p={{"vertices",json::array()},{"triangles",json::array()},{"type","normal_part"},{"settings",{{"extruder",i==1?"2":"1"}}}};for(auto&v:mesh.vertices)p["vertices"].push_back({v.x(),v.y(),v.z()});for(auto&t:mesh.indices)p["triangles"].push_back({t.x(),t.y(),t.z()});objects.push_back({{"id",o->name},{"selected",true},{"matrix",matrix(inst->get_matrix())},{"settings",p["settings"]},{"parts",{p}}});}
 ReferencePrint print;print.value.apply(config,true);ReferencePlate plate{&model,&print,250,210};Vec3d pos,size;const auto tower=plate.estimate_wipe_tower_polygon(config,0,pos,size,1,2,true);json contour=json::array();for(auto&p:tower.poly.contour.points)contour.push_back({unscaled<double>(p.x()),unscaled<double>(p.y())});for(int bed=0;bed<36;++bed){auto t=tower;t.bed_idx=bed;fixed.push_back(t);}
 ArrangeParams params;params.clearance_radius=65;params.clearance_height_to_rod=36;params.clearance_height_to_lid=140;params.nozzle_height=2.5;params.printable_height=220;params.allow_rotations=false;params.align_to_y_axis=false;params.align_center=config.opt<ConfigOptionPoint>("best_object_pos")->value;params.progressind=[](unsigned,std::string){};
 update_arrange_params(params,&config,selected);update_selected_items_inflation(selected,&config,params);update_unselected_items_inflation(fixed,&config,params);update_selected_items_axis_align(selected,&config,params);arrange(selected,fixed,get_shrink_bedpts(&config,params),params);json expected=json::array();for(auto&ap:selected){ap.apply();auto*o=*std::find_if(model.objects.begin(),model.objects.end(),[&](auto*o){return o->name==ap.name;});expected.push_back({{"id",ap.name},{"bedIndex",ap.bed_idx},{"height",ap.height},{"inflation",unscaled<double>(ap.inflation)},{"rotation",ap.rotation},{"translation",{unscaled<double>(ap.translation.x()),unscaled<double>(ap.translation.y())}},{"matrix",matrix(o->instances.front()->get_matrix())}});}
 all.push_back({{"name",name},{"settings",settings},{"options",{{"spacing",0},{"rotation",false},{"alignY",false},{"multipleMaterials",true}}},{"objects",objects},{"expected",expected},{"primeTower",{{"position",{pos.x(),pos.y()}},{"size",{size.x(),size.y(),size.z()}}}},{"sourceEstimatedContour",contour},{"parameters",{{"minimumDistance",unscaled<double>(params.min_obj_distance)},{"bedShrink",{params.bed_shrink_x,params.bed_shrink_y}}}}});
 }std::cout<<all.dump(2)<<'\n';}
