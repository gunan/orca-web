
#include "libslic3r/Model.hpp"
#include "libslic3r/ModelArrange.hpp"
#include "libslic3r/BuildVolume.hpp"
#include "libslic3r/ClipperUtils.hpp"
#include "libslic3r/GCode/WipeTower.hpp"
#include <nlohmann/json.hpp>
#include <fstream>
#include <iostream>
using namespace Slic3r;using json=nlohmann::json;
struct ReferencePrint{PrintConfig value;const PrintConfig&config()const{return value;}};
struct ReferencePlater{const BuildVolume*volume;const BuildVolume&build_volume()const{return *volume;}};
struct ReferencePlate{
 Model*m_model;ReferencePrint*m_print;ReferencePlater*m_plater;DynamicPrintConfig m_config,m_project_config;
 std::set<std::pair<int,int>>obj_to_instance_set,instance_outside_set;int m_plate_index=0;
 Pointfs m_shape;std::vector<Pointfs>m_extruder_areas;std::vector<double>m_extruder_heights;std::vector<BoundingBoxf3>m_exclude_bounding_box;BoundingBoxf3 m_bounding_box;Vec3d m_origin;double m_height;
 const Pointfs&get_shape()const{return m_shape;}BoundingBoxf3 get_plate_box(){return get_build_volume();}
 BoundingBoxf3 get_build_volume(bool use_share=false);bool contain_instance_totally(int,int)const;
 bool check_outside(int,int,BoundingBoxf3*bounding_box=nullptr);int printable_instance_size();
 bool check_objects_empty_and_gcode3mf(std::vector<int>&)const{return m_model->objects.empty();}
 std::vector<int>get_extruders(bool)const;
 Vec3d estimate_wipe_tower_size(const DynamicPrintConfig&,double,double,int,int,bool,bool)const;
};
BoundingBoxf3 ReferencePlate::get_build_volume(bool use_share)
{
    auto  eps=Slic3r::BuildVolume::SceneEpsilon;
	Vec3d up_point;
	Vec3d low_point;
	if (use_share && !m_extruder_areas.empty()) {
		Polygon bed_poly = get_shared_poly(m_extruder_areas);
		BoundingBox bbox = bed_poly.bounding_box();

		up_point = Vec3d(unscale_(bbox.max.x()) + eps,  unscale_(bbox.max.y()) + eps, m_origin.z() + m_height + eps);
		low_point = Vec3d(unscale_(bbox.min.x()) - eps, unscale_(bbox.min.y()) - eps, m_origin.z() - eps);
	}
	else {
		// Orca: support non-rectangular bed
		up_point  = m_bounding_box.max + Vec3d(eps, eps, m_origin.z() + m_height + eps);
		low_point = m_bounding_box.min + Vec3d(-eps, -eps, m_origin.z() - eps);
	}
    BoundingBoxf3 plate_box(low_point, up_point);
    return plate_box;
}

bool ReferencePlate::contain_instance_totally(int obj_id, int instance_id) const
{
	bool result = false;
	std::set<std::pair<int, int>>::iterator it;

	it = obj_to_instance_set.find(std::pair(obj_id, instance_id));
	if (it != obj_to_instance_set.end()) {
		it = instance_outside_set.find(std::pair(obj_id, instance_id));
		if (it == instance_outside_set.end())
			result = true;
	}

	return result;
}

bool ReferencePlate::check_outside(int obj_id, int instance_id, BoundingBoxf3* bounding_box)
{
	bool outside = true;

	ModelObject* object = m_model->objects[obj_id];
	ModelInstance* instance = object->instances[instance_id];

	BoundingBoxf3 instance_box = bounding_box? *bounding_box: object->instance_convex_hull_bounding_box(instance_id);
	Polygon hull = instance->convex_hull_2d();
	BoundingBoxf3 plate_box = get_plate_box();
	if (instance_box.max.z() > plate_box.min.z())
		plate_box.min.z() += instance_box.min.z(); // not considering outsize if sinking

	if (instance_box.min.z() < SINKING_Z_THRESHOLD) {
		// Orca: For sinking object, we use a more expensive algorithm so part below build plate won't be considered
		if (plate_box.intersects(instance_box)) {
			// TODO: FIXME: this does not take exclusion area into account
            const BuildVolume build_volume(get_shape(), m_plater->build_volume().printable_height(), m_extruder_areas, m_extruder_heights);
			const auto state = instance->calc_print_volume_state(build_volume);
			outside = state == ModelInstancePVS_Partly_Outside;
		}
	}
	else
	if (plate_box.contains(instance_box))
	{
		if (m_exclude_bounding_box.size() > 0)
		{
			Polygon hull = instance->convex_hull_2d();
			int index;
			for (index = 0; index < m_exclude_bounding_box.size(); index ++)
			{
				Polygon p = m_exclude_bounding_box[index].polygon(true);  // instance convex hull is scaled, so we need to scale here
				if (intersection({ p }, { hull }).empty() == false)
				//if (m_exclude_bounding_box[index].intersects(instance_box))
				{
					break;
				}
			}
			if (index >= m_exclude_bounding_box.size())
				outside = false;
		}
		else
			outside = false;
	}

	return outside;
}

int ReferencePlate::printable_instance_size()
{
    int size = 0;
    for (std::set<std::pair<int, int>>::iterator it = obj_to_instance_set.begin(); it != obj_to_instance_set.end(); ++it) {
        int obj_id      = it->first;
        int instance_id = it->second;

        if (obj_id >= m_model->objects.size())
			continue;

        ModelObject *  object   = m_model->objects[obj_id];
        ModelInstance *instance = object->instances[instance_id];

        if ((instance->printable) && (instance_outside_set.find(std::pair(obj_id, instance_id)) == instance_outside_set.end())) {
            size++;
        }
    }
    return size;
}

std::vector<int> ReferencePlate::get_extruders(bool conside_custom_gcode) const
{
	std::vector<int> plate_extruders;
    if (check_objects_empty_and_gcode3mf(plate_extruders)) {
        return plate_extruders;
    }
	// if 3mf file
	const DynamicPrintConfig& glb_config = m_config;
	int glb_support_intf_extr = glb_config.opt_int("support_interface_filament");
	int glb_support_extr = glb_config.opt_int("support_filament");
	int glb_outer_wall_extr = glb_config.opt_int("outer_wall_filament_id");
	int glb_inner_wall_extr = glb_config.opt_int("inner_wall_filament_id");
	if (glb_outer_wall_extr == 0) glb_outer_wall_extr = glb_inner_wall_extr;
	if (glb_inner_wall_extr == 0) glb_inner_wall_extr = glb_outer_wall_extr;
	int glb_sparse_infill_extr = glb_config.opt_int("sparse_infill_filament_id");
	int glb_internal_solid_extr = glb_config.opt_int("internal_solid_filament_id");
	int glb_top_surface_extr = glb_config.opt_int("top_surface_filament_id");
	int glb_bottom_surface_extr = glb_config.opt_int("bottom_surface_filament_id");
	if (glb_top_surface_extr == 0) glb_top_surface_extr = glb_internal_solid_extr;
	if (glb_bottom_surface_extr == 0) glb_bottom_surface_extr = glb_internal_solid_extr;
	bool glb_support = glb_config.opt_bool("enable_support");
    glb_support |= glb_config.opt_int("raft_layers") > 0;

	for (int obj_idx = 0; obj_idx < m_model->objects.size(); obj_idx++) {
		if (!contain_instance_totally(obj_idx, 0))
			continue;

		ModelObject* mo = m_model->objects[obj_idx];
		for (ModelVolume* mv : mo->volumes) {
			std::vector<int> volume_extruders = mv->get_extruders();
			plate_extruders.insert(plate_extruders.end(), volume_extruders.begin(), volume_extruders.end());
		}

		// layer range
        for (auto layer_range : mo->layer_config_ranges) {
            if (layer_range.second.has("extruder")) {
                if (auto id = layer_range.second.option("extruder")->getInt(); id > 0)
					plate_extruders.push_back(id);
			}
		}

		bool obj_support = false;
		const ConfigOption* obj_support_opt = mo->config.option("enable_support");
        const ConfigOption *obj_raft_opt    = mo->config.option("raft_layers");
		if (obj_support_opt != nullptr || obj_raft_opt != nullptr) {
            if (obj_support_opt != nullptr)
				obj_support = obj_support_opt->getBool();
            if (obj_raft_opt != nullptr)
				obj_support |= obj_raft_opt->getInt() > 0;
        }
		else
			obj_support = glb_support;

        if (obj_support) {
            int                 obj_support_intf_extr = 0;
            const ConfigOption* support_intf_extr_opt = mo->config.option("support_interface_filament");
            if (support_intf_extr_opt != nullptr)
                obj_support_intf_extr = support_intf_extr_opt->getInt();
            if (obj_support_intf_extr != 0)
                plate_extruders.push_back(obj_support_intf_extr);
            else if (glb_support_intf_extr != 0)
                plate_extruders.push_back(glb_support_intf_extr);

            int                 obj_support_extr = 0;
            const ConfigOption* support_extr_opt = mo->config.option("support_filament");
            if (support_extr_opt != nullptr)
                obj_support_extr = support_extr_opt->getInt();
            if (obj_support_extr != 0)
                plate_extruders.push_back(obj_support_extr);
            else if (glb_support_extr != 0)
                plate_extruders.push_back(glb_support_extr);
        }

		int obj_outer_wall_extr = 0;
		if (const ConfigOption* wall_opt = mo->config.option("outer_wall_filament_id"); wall_opt != nullptr)
			obj_outer_wall_extr = wall_opt->getInt();
		if (obj_outer_wall_extr == 0)
			if (const ConfigOption* wall_opt = mo->config.option("inner_wall_filament_id"); wall_opt != nullptr)
				obj_outer_wall_extr = wall_opt->getInt();
		if (obj_outer_wall_extr != 0)
			plate_extruders.push_back(obj_outer_wall_extr);
		else if (glb_outer_wall_extr != 0)
			plate_extruders.push_back(glb_outer_wall_extr);

		int obj_inner_wall_extr = 0;
		if (const ConfigOption* wall_opt = mo->config.option("inner_wall_filament_id"); wall_opt != nullptr)
			obj_inner_wall_extr = wall_opt->getInt();
		if (obj_inner_wall_extr == 0)
			if (const ConfigOption* wall_opt = mo->config.option("outer_wall_filament_id"); wall_opt != nullptr)
				obj_inner_wall_extr = wall_opt->getInt();
		if (obj_inner_wall_extr != 0)
			plate_extruders.push_back(obj_inner_wall_extr);
		else if (glb_inner_wall_extr != 0)
			plate_extruders.push_back(glb_inner_wall_extr);

		int obj_sparse_infill_extr = 0;
		const ConfigOption* sparse_infill_opt = mo->config.option("sparse_infill_filament_id");
		if (sparse_infill_opt != nullptr)
			obj_sparse_infill_extr = sparse_infill_opt->getInt();
		if (obj_sparse_infill_extr != 0)
			plate_extruders.push_back(obj_sparse_infill_extr);
		else if (glb_sparse_infill_extr != 0)
			plate_extruders.push_back(glb_sparse_infill_extr);

		int obj_internal_solid_extr = 0;
		if (const ConfigOption* solid_opt = mo->config.option("internal_solid_filament_id"); solid_opt != nullptr)
			obj_internal_solid_extr = solid_opt->getInt();
		if (obj_internal_solid_extr != 0)
			plate_extruders.push_back(obj_internal_solid_extr);
		else if (glb_internal_solid_extr != 0)
			plate_extruders.push_back(glb_internal_solid_extr);

		int obj_top_surface_extr = 0;
		if (const ConfigOption* top_opt = mo->config.option("top_surface_filament_id"); top_opt != nullptr)
			obj_top_surface_extr = top_opt->getInt();
		if (obj_top_surface_extr == 0)
			obj_top_surface_extr = obj_internal_solid_extr;
		if (obj_top_surface_extr != 0)
			plate_extruders.push_back(obj_top_surface_extr);
		else if (glb_top_surface_extr != 0)
			plate_extruders.push_back(glb_top_surface_extr);

		int obj_bottom_surface_extr = 0;
		if (const ConfigOption* bottom_opt = mo->config.option("bottom_surface_filament_id"); bottom_opt != nullptr)
			obj_bottom_surface_extr = bottom_opt->getInt();
		if (obj_bottom_surface_extr == 0)
			obj_bottom_surface_extr = obj_internal_solid_extr;
		if (obj_bottom_surface_extr != 0)
			plate_extruders.push_back(obj_bottom_surface_extr);
		else if (glb_bottom_surface_extr != 0)
			plate_extruders.push_back(glb_bottom_surface_extr);

	}

	if (conside_custom_gcode) {
		//BBS
        int nums_extruders = 0;
        if (const ConfigOptionStrings *color_option = dynamic_cast<const ConfigOptionStrings *>(m_project_config.option("filament_colour"))) {
            nums_extruders = color_option->values.size();
			if (m_model->plates_custom_gcodes.find(m_plate_index) != m_model->plates_custom_gcodes.end()) {
				for (auto item : m_model->plates_custom_gcodes.at(m_plate_index).gcodes) {
					if (item.type == CustomGCode::Type::ToolChange && item.extruder <= nums_extruders)
						plate_extruders.push_back(item.extruder);
				}
			}
		}
	}

	std::sort(plate_extruders.begin(), plate_extruders.end());
	auto it_end = std::unique(plate_extruders.begin(), plate_extruders.end());
	plate_extruders.resize(std::distance(plate_extruders.begin(), it_end));
	return plate_extruders;
}

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
    //const DynamicPrintConfig &dconfig = m_config;
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
Transform3d frame(const json&v){Transform3d t;for(int i=0;i<16;i++)t.matrix().data()[i]=v[i].get<double>();return t;}
template<class T>void config(T&c,const json&v){ConfigSubstitutionContext substitutions(ForwardCompatibilitySubstitutionRule::Disable);for(const auto&kv:v.items()){std::string s;if(kv.value().is_array()){for(const auto&x:kv.value()){if(!s.empty())s+=",";s+=x.get<std::string>();}}else s=kv.value().get<std::string>();c.set_deserialize(kv.key(),s,substitutions);}}
Pointfs points(const json&v){Pointfs p;for(const auto&x:v)p.emplace_back(x[0].get<double>(),x[1].get<double>());return p;}
json evaluate(const json&r){
 Model model;ReferencePrint print;ReferencePlate plate;plate.m_model=&model;plate.m_print=&print;
 plate.m_config=DynamicPrintConfig::full_print_config();config(plate.m_config,r.at("settings"));config(plate.m_config,r.at("assignments"));print.value.apply(plate.m_config,true);
 int colors=r.at("filamentCount");plate.m_project_config.set_key_value("filament_colour",new ConfigOptionStrings(std::vector<std::string>(colors,"#808080")));
 const auto&bed=r.at("plate");plate.m_shape=points(bed.at("shape"));plate.m_height=bed.at("height");plate.m_origin=Vec3d(bed["origin"][0],bed["origin"][1],bed["origin"][2]);
 for(const auto&p:plate.m_shape)plate.m_bounding_box.merge(Vec3d(p.x(),p.y(),0));
 auto exclusions=points(bed.at("excluded"));for(size_t i=0;i+3<exclusions.size();i+=4){BoundingBoxf3 b;for(int j=0;j<4;j++)b.merge(Vec3d(exclusions[i+j].x(),exclusions[i+j].y(),0));b.max.z()=int(plate.m_bounding_box.size().y());b.min.z()=double(-.03f);plate.m_exclude_bounding_box.push_back(b);}
 for(const auto&a:bed.at("extruderAreas"))plate.m_extruder_areas.push_back(points(a));for(const auto&h:bed.at("extruderHeights"))plate.m_extruder_heights.push_back(h.is_null()?std::numeric_limits<double>::quiet_NaN():h.get<double>());
 BuildVolume volume(plate.m_shape,plate.m_height,plate.m_extruder_areas,plate.m_extruder_heights);ReferencePlater plater{&volume};plate.m_plater=&plater;
 for(const auto&o:r.at("objects")){auto*object=model.add_object();config(object->config,o.at("settings"));for(const auto&p:o.at("parts")){indexed_triangle_set mesh;for(const auto&v:p.at("vertices"))mesh.vertices.emplace_back(v[0].get<float>(),v[1].get<float>(),v[2].get<float>());for(const auto&t:p.at("triangles"))mesh.indices.emplace_back(t[0].get<int>(),t[1].get<int>(),t[2].get<int>());auto*part=object->add_volume(TriangleMesh(std::move(mesh)));part->set_type(ModelVolume::type_from_string(p.at("type")));part->set_transformation(Geometry::Transformation(frame(p.at("matrix"))*part->get_matrix()));config(part->config,p.at("settings"));for(const auto&kv:p.at("color").items())part->mmu_segmentation_facets.set_triangle_from_string(std::stoi(kv.key()),kv.value().get<std::string>());part->mmu_segmentation_facets.touch();}
  int k=0;for(const auto&v:o.at("ranges")){config(object->layer_config_ranges[{double(k),double(k+1)}],v);++k;}
  for(const auto&i:o.at("instances")){auto*instance=object->add_instance();instance->set_transformation(Geometry::Transformation(frame(i.at("matrix"))));instance->printable=i.at("printable");if(i.at("plateId")==r.at("plateId"))plate.obj_to_instance_set.emplace(model.objects.size()-1,object->instances.size()-1);}
 }
 for(const auto&pair:plate.obj_to_instance_set)if(plate.check_outside(pair.first,pair.second))plate.instance_outside_set.insert(pair);
 for(const auto&e:r.at("events")){CustomGCode::Item item{};item.type=CustomGCode::ToolChange;item.extruder=e.at("extruder");model.plates_custom_gcodes[0].gcodes.push_back(item);}
 json contained=json::array();for(size_t i=0;i<model.objects.size();i++)contained.push_back(plate.contain_instance_totally(i,0));
 const auto tools=plate.get_extruders(true);const int printable=plate.printable_instance_size();
 const auto&cfg=plate.m_config;const float x=r["placement"][0].get<float>(),y=r["placement"][1].get<float>(),angle=r["placement"][2].get<float>();
 json result={{"visible",false},{"extruders",tools},{"containedFirstInstances",contained},{"printableInstanceCount",printable},{"size",nullptr},{"position",{double(float(x+plate.m_origin.x()))-plate.m_origin.x(),double(float(y+plate.m_origin.y()))-plate.m_origin.y()}},{"rotation",(M_PI/180.)*angle},{"alpha",double(.66f)}};
 // GLCanvas3D.cpp2845-2910 visibility, then 3DScene.cpp832-886 float shell.
 const bool needed=cfg.opt_enum<TimelapseType>("timelapse_type")==tlSmooth||cfg.opt_bool("enable_wrapping_detection");
 if(!cfg.opt_bool("enable_prime_tower")||(!needed&&colors<=1))return result;
 if(cfg.opt_enum<PrintSequence>("print_sequence")==PrintSequence::ByObject&&printable!=1)return result;
 if((!needed&&tools.size()<2)||plate.obj_to_instance_set.empty()||tools.empty())return result;
 const Vec3d size=plate.estimate_wipe_tower_size(cfg,float(cfg.opt_float("prime_tower_width")),float(cfg.opt_float("prime_volume")),print.config().nozzle_diameter.size(),0,false,cfg.opt_bool("enable_wrapping_detection"));
 float w=size.x(),d=size.y(),h=size.z();if(d<.01f)return result;if(h==0.f)h=.1f;
 json bands=json::array();for(size_t i=0;i<tools.size();i++){TriangleMesh cube=make_cube(w,d/tools.size(),h);cube.translate({0.f,d*i/tools.size(),0.});json coords=json::array();for(const auto&face:cube.its.indices)for(int k=0;k<3;k++){const auto&p=cube.its.vertices[face[k]];coords.push_back(p.x());coords.push_back(p.y());coords.push_back(p.z());}bands.push_back({{"extruder",tools[i]},{"positions",coords}});}result["bands"]=bands;
 result["visible"]=true;result["estimatedSize"]={size.x(),size.y(),size.z()};result["size"]={double(w),double(d),double(h)};return result;
}
int main(int argc,char**argv){try{json inputs;std::ifstream(argv[1])>>inputs;json outputs=json::array();for(const auto&c:inputs)outputs.push_back({{"name",c.at("name")},{"result",evaluate(c.at("request"))}});std::ofstream(argv[2])<<outputs.dump(2);return 0;}catch(const std::exception&e){std::cerr<<e.what();return 1;}}
