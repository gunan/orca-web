// Original pinned GUI PartPlate function; real native ModelVolume/TriangleSelector.
#include "libslic3r/Model.hpp"
#include <nlohmann/json.hpp>
#include <iostream>
using namespace Slic3r;using json=nlohmann::json;
struct FacadePreset{DynamicPrintConfig config;};struct Prints{FacadePreset preset;const FacadePreset&get_edited_preset()const{return preset;}};struct Bundle{Prints prints;DynamicPrintConfig project_config;};struct App{Bundle*preset_bundle;};Bundle bundle;App app{&bundle};App&wxGetApp(){return app;}
struct PartPlate{Model*m_model;int m_plate_index=0;std::vector<bool>contained;bool check_objects_empty_and_gcode3mf(std::vector<int>&)const{return m_model->objects.empty();}bool contain_instance_totally(int object,int instance)const{if(instance!=0)throw std::runtime_error("Unexpected native instance index");return contained.at(object);}std::vector<int>get_extruders(bool)const;};
std::vector<int> PartPlate::get_extruders(bool conside_custom_gcode) const
{
	std::vector<int> plate_extruders;
    if (check_objects_empty_and_gcode3mf(plate_extruders)) {
        return plate_extruders;
    }
	// if 3mf file
	const DynamicPrintConfig& glb_config = wxGetApp().preset_bundle->prints.get_edited_preset().config;
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
        if (const ConfigOptionStrings *color_option = dynamic_cast<const ConfigOptionStrings *>(wxGetApp().preset_bundle->project_config.option("filament_colour"))) {
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
template<class Config>void fill(Config& config,const json&values){ConfigSubstitutionContext substitutions(ForwardCompatibilitySubstitutionRule::Disable);for(auto i=values.begin();i!=values.end();++i)config.set_deserialize(i.key(),i.value().is_string()?i.value().get<std::string>():i.value().dump(),substitutions);}
int main(){try{json input;std::cin>>input;fill(bundle.prints.preset.config,input.at("global"));bundle.project_config.set_key_value("filament_colour",new ConfigOptionStrings(std::vector<std::string>(input.at("filamentCount").get<int>(),"#FFFFFF")));Model model;PartPlate plate{&model};json volumes=json::array();
 for(const auto&object:input.at("objects")){auto*mo=model.add_object();fill(mo->config,object.at("config"));plate.contained.push_back(object.at("contained"));json ids=json::array();
  for(const auto&volume:object.at("volumes")){indexed_triangle_set mesh;auto paint=volume.value("painting",json::object());size_t count=1;for(auto i=paint.begin();i!=paint.end();++i)count=std::max(count,size_t(std::stoul(i.key())+1));if(count>12)throw std::runtime_error("Fixture paint exceeds cube triangles");mesh.vertices={{0,0,0},{10,0,0},{10,10,0},{0,10,0},{0,0,10},{10,0,10},{10,10,10},{0,10,10}};mesh.indices={{0,2,1},{0,3,2},{4,5,6},{4,6,7},{0,1,5},{0,5,4},{1,2,6},{1,6,5},{2,3,7},{2,7,6},{3,0,4},{3,4,7}};auto*mv=mo->add_volume(TriangleMesh(mesh),ModelVolume::type_from_string(volume.at("type")),false);fill(mv->config,volume.at("config"));for(auto i=paint.begin();i!=paint.end();++i)mv->mmu_segmentation_facets.set_triangle_from_string(std::stoi(i.key()),i.value());ids.push_back(mv->get_extruders());}
  for(size_t i=0;i<object.at("ranges").size();i++){ModelConfig config;fill(config,object["ranges"][i]);mo->layer_config_ranges.emplace(std::pair<double,double>{double(i),double(i+1)},std::move(config));}volumes.push_back(ids);
 }
 for(const auto&event:input.at("events")){CustomGCode::Type type=event.at("type")=="ToolChange"?CustomGCode::Type::ToolChange:CustomGCode::Type::PausePrint;model.plates_custom_gcodes[0].gcodes.push_back({.2,type,event.at("extruder"),"",""});}
 std::cout<<json{{"extruders",plate.get_extruders(true)},{"volumes",volumes}}.dump();}catch(const std::exception&e){std::cerr<<e.what()<<"\n";return 1;}}
