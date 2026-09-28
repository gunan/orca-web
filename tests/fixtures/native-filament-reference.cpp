// Pinned original OrcaSlicer2.4.2 color and material functions. AGPL-3.0-or-later.
#include <nlohmann/json.hpp>
#include <iostream>
#include <map>
#include <cmath>
#include <cstdio>
#include <iomanip>
#include "src/libvgcode/include/ColorRange.hpp"
#include "src/libvgcode/include/PathVertex.hpp"
#include "src/libvgcode/src/Layers.hpp"
#include "src/libvgcode/src/Utils.hpp"
#include "src/libvgcode/src/Settings.hpp"
using json=nlohmann::json;
namespace GizmoObjectManipulation{constexpr double in_to_mm=25.4,oz_to_g=28.34952;}
static std::string format_compact_weight(double value_in_grams, bool imperial_units)
{
    char buffer[64];
    if (imperial_units) {
        ::sprintf(buffer, "%.2f oz", value_in_grams / GizmoObjectManipulation::oz_to_g);
        return buffer;
    }

    const double abs_value = value_in_grams < 0.0 ? -value_in_grams : value_in_grams;
    const char* unit = "g";
    double scaled_value = abs_value;
    if (scaled_value >= 1000000.0) {
        scaled_value /= 1000000.0;
        unit = "t";
    } else if (scaled_value >= 1000.0) {
        scaled_value /= 1000.0;
        unit = "kg";
    }

    ::sprintf(buffer, "%s%.2f%s", value_in_grams < 0.0 ? "-" : "", scaled_value, unit);
    return buffer;
}
    auto format_compact_count = [](unsigned long long value) {
        static constexpr const char* suffixes[] = { "", "K", "M", "B", "T", "P", "E" };
        constexpr size_t suffix_count = sizeof(suffixes) / sizeof(suffixes[0]);

        if (value < 1000)
            return std::to_string(value);

        size_t suffix_index = 0;
        unsigned long long divisor = 1;
        while (suffix_index + 1 < suffix_count && value / divisor >= 1000) {
            divisor *= 1000;
            ++suffix_index;
        }

        const unsigned long long whole = value / divisor;
        const unsigned long long tenths = (value % divisor) * 10 / divisor;

        std::string ret = std::to_string(whole);
        if (tenths != 0)
            ret += "." + std::to_string(tenths);
        ret += suffixes[suffix_index];
        return ret;
    };

constexpr double PI=3.141592653589793238;template<class T>T sqr(T value){return value*value;}
struct Statistics{std::map<size_t,double>model_volumes_per_extruder,support_volumes_per_extruder,wipe_tower_volumes_per_extruder,flush_per_filament,total_volumes_per_extruder;};
struct MaterialViewer{
 struct Used{std::vector<size_t>ids;const auto&get_used_extruders_ids()const{return ids;}}m_viewer;
 Statistics m_print_statistics;std::vector<float>m_filament_diameters,m_filament_densities;
 json calculate(bool imperial_units){
    auto get_used_filament_from_volume = [this, imperial_units](double volume, int extruder_id) {
        double koef = imperial_units ? 1.0 / GizmoObjectManipulation::in_to_mm : 0.001;
        std::pair<double, double> ret = { koef * volume / (PI * sqr(0.5 * m_filament_diameters[extruder_id])),
                                          volume * m_filament_densities[extruder_id] * 0.001 };
        return ret;
    };
    std::vector<double> model_used_filaments_m;
    std::vector<double> model_used_filaments_g;
    double total_model_used_filament_m = 0, total_model_used_filament_g = 0;
    std::vector<double> flushed_filaments_m;
    std::vector<double> flushed_filaments_g;
    double total_flushed_filament_m = 0, total_flushed_filament_g = 0;
    std::vector<double> wipe_tower_used_filaments_m;
    std::vector<double> wipe_tower_used_filaments_g;
    double total_wipe_tower_used_filament_m = 0, total_wipe_tower_used_filament_g = 0;
    std::vector<double> support_used_filaments_m;
    std::vector<double> support_used_filaments_g;
    double total_support_used_filament_m = 0, total_support_used_filament_g = 0;
    struct ColumnData {
        enum {
            Model = 1,
            Flushed = 2,
            WipeTower = 4,
            Support = 1 << 3,
        };
    };
    int displayed_columns = 0;
    std::map<std::string, float> color_print_offsets;
    std::vector<double> used_filaments_m;
    std::vector<double> used_filaments_g;

    // used filament statistics
    for (size_t extruder_id : m_viewer.get_used_extruders_ids()) {
        if (m_print_statistics.model_volumes_per_extruder.find(extruder_id) == m_print_statistics.model_volumes_per_extruder.end()) {
            model_used_filaments_m.push_back(0.0);
            model_used_filaments_g.push_back(0.0);
        }
        else {
            double volume = m_print_statistics.model_volumes_per_extruder.at(extruder_id);
            auto [model_used_filament_m, model_used_filament_g] = get_used_filament_from_volume(volume, extruder_id);
            model_used_filaments_m.push_back(model_used_filament_m);
            model_used_filaments_g.push_back(model_used_filament_g);
            total_model_used_filament_m += model_used_filament_m;
            total_model_used_filament_g += model_used_filament_g;
            displayed_columns |= ColumnData::Model;
        }
    }

    for (size_t extruder_id : m_viewer.get_used_extruders_ids()) {
        if (m_print_statistics.wipe_tower_volumes_per_extruder.find(extruder_id) == m_print_statistics.wipe_tower_volumes_per_extruder.end()) {
            wipe_tower_used_filaments_m.push_back(0.0);
            wipe_tower_used_filaments_g.push_back(0.0);
        }
        else {
            double volume = m_print_statistics.wipe_tower_volumes_per_extruder.at(extruder_id);
            auto [wipe_tower_used_filament_m, wipe_tower_used_filament_g] = get_used_filament_from_volume(volume, extruder_id);
            wipe_tower_used_filaments_m.push_back(wipe_tower_used_filament_m);
            wipe_tower_used_filaments_g.push_back(wipe_tower_used_filament_g);
            total_wipe_tower_used_filament_m += wipe_tower_used_filament_m;
            total_wipe_tower_used_filament_g += wipe_tower_used_filament_g;
            displayed_columns |= ColumnData::WipeTower;
        }
    }

    for (size_t extruder_id : m_viewer.get_used_extruders_ids()) {
        if (m_print_statistics.flush_per_filament.find(extruder_id) == m_print_statistics.flush_per_filament.end()) {
            flushed_filaments_m.push_back(0.0);
            flushed_filaments_g.push_back(0.0);
        }
        else {
            double volume = m_print_statistics.flush_per_filament.at(extruder_id);
            auto [flushed_filament_m, flushed_filament_g] = get_used_filament_from_volume(volume, extruder_id);
            flushed_filaments_m.push_back(flushed_filament_m);
            flushed_filaments_g.push_back(flushed_filament_g);
            total_flushed_filament_m += flushed_filament_m;
            total_flushed_filament_g += flushed_filament_g;
            displayed_columns |= ColumnData::Flushed;
        }
    }

    for (size_t extruder_id : m_viewer.get_used_extruders_ids()) {
        if (m_print_statistics.support_volumes_per_extruder.find(extruder_id) == m_print_statistics.support_volumes_per_extruder.end()) {
            support_used_filaments_m.push_back(0.0);
            support_used_filaments_g.push_back(0.0);
        }
        else {
            double volume = m_print_statistics.support_volumes_per_extruder.at(extruder_id);
            auto [used_filament_m, used_filament_g] = get_used_filament_from_volume(volume, extruder_id);
            support_used_filaments_m.push_back(used_filament_m);
            support_used_filaments_g.push_back(used_filament_g);
            total_support_used_filament_m += used_filament_m;
            total_support_used_filament_g += used_filament_g;
            displayed_columns |= ColumnData::Support;
        }
    }
 json out={{"mask",displayed_columns},{"model",json::array()},{"support",json::array()},{"flushed",json::array()},{"tower",json::array()},{"rowTotals",json::array()},{"totals",{{"model",{total_model_used_filament_m,total_model_used_filament_g}},{"support",{total_support_used_filament_m,total_support_used_filament_g}},{"flushed",{total_flushed_filament_m,total_flushed_filament_g}},{"tower",{total_wipe_tower_used_filament_m,total_wipe_tower_used_filament_g}}}}};
 for(size_t i=0;i<m_viewer.ids.size();i++){out["model"].push_back({model_used_filaments_m[i],model_used_filaments_g[i]});out["support"].push_back({support_used_filaments_m[i],support_used_filaments_g[i]});out["flushed"].push_back({flushed_filaments_m[i],flushed_filaments_g[i]});out["tower"].push_back({wipe_tower_used_filaments_m[i],wipe_tower_used_filaments_g[i]});float column_sum_m=0,column_sum_g=0;
 if(displayed_columns & ColumnData::Model){column_sum_m += model_used_filaments_m[i];column_sum_g += model_used_filaments_g[i];}
 if(displayed_columns & ColumnData::Support){column_sum_m += support_used_filaments_m[i];column_sum_g += support_used_filaments_g[i];}
 if(displayed_columns & ColumnData::Flushed){column_sum_m += flushed_filaments_m[i];column_sum_g += flushed_filaments_g[i];}
 if(displayed_columns & ColumnData::WipeTower){column_sum_m += wipe_tower_used_filaments_m[i];column_sum_g += wipe_tower_used_filaments_g[i];}

 out["rowTotals"].push_back({column_sum_m,column_sum_g});}return out;
 }
};
struct Result{Statistics print_statistics;std::vector<float>filament_densities,filament_costs;};
static double native_cost(Result*current_result){
    auto& ps = current_result->print_statistics;
    double total_cost = 0.0;
    for (auto volume : ps.total_volumes_per_extruder) {
        size_t extruder_id = volume.first;
        double density = current_result->filament_densities.at(extruder_id);
        double cost = current_result->filament_costs.at(extruder_id);
        double weight = volume.second * density * 0.001;
        total_cost += weight * cost * 0.001;
    }
 return total_cost;}
namespace libvgcode{
static const std::array<Color, size_t(EGCodeExtrusionRole::COUNT)> DEFAULT_EXTRUSION_ROLES_COLORS = { {
    { 230, 179, 179 }, // None
    { 255, 230,  77 }, // Perimeter
    { 255, 125,  56 }, // ExternalPerimeter
    {  31,  31, 255 }, // OverhangPerimeter
    { 176,  48,  41 }, // InternalInfill
    { 150,  84, 204 }, // SolidInfill
    { 240,  64,  64 }, // TopSolidInfill
    { 255, 140, 105 }, // Ironing
    {  77, 128, 186 }, // BridgeInfill
    { 255, 255, 255 }, // GapFill
    {   0, 135, 110 }, // Skirt
    {   0, 255,   0 }, // SupportMaterial
    {   0, 128,   0 }, // SupportMaterialInterface
    { 179, 227, 171 }, // WipeTower
    {  94, 209, 148 },  // Custom
    // ORCA
    { 102,  92, 199 }, // BottomSurface
    {  77, 128, 186 }, // InternalBridgeInfill
    {   0,  59, 110 }, // Brim
    {   0,  64,   0 }, // SupportTransition
    { 128, 128, 128 }, // Mixed
} };

static const std::array<Color, size_t(EOptionType::COUNT)> DEFAULT_OPTIONS_COLORS{ {
    {  56,  72, 155 }, // Travels
    { 255, 255,   0 }, // Wipes
    { 205,  34, 214 }, // Retractions
    {  73, 173, 207 }, // Unretractions
    { 230, 230, 230 }, // Seams
    { 193, 190,  99 }, // ToolChanges
    { 218, 148, 139 }, // ColorChanges
    {  82, 240, 131 }, // PausePrints
    { 226, 210,  67 }  // CustomGCodes
} };


class ViewerImpl{public:Layers m_layers;Settings m_settings;Palette m_tool_colors,m_color_print_colors;
 ColorRange m_width_range,m_height_range,m_speed_range,m_actual_speed_range,m_fan_speed_range,m_temperature_range,m_pressure_advance_range,m_acceleration_range,m_jerk_range,m_volumetric_rate_range,m_actual_volumetric_rate_range;
 std::array<ColorRange,2>m_layer_time_range{ColorRange(EColorRangeType::Linear),ColorRange(EColorRangeType::Logarithmic)};
 auto get_extrusion_role_color(EGCodeExtrusionRole r)const{return DEFAULT_EXTRUSION_ROLES_COLORS[size_t(r)];}auto get_option_color(EOptionType t)const{return DEFAULT_OPTIONS_COLORS[size_t(t)];}Color get_vertex_color(const PathVertex&)const;
};
Color ViewerImpl::get_vertex_color(const PathVertex& v) const
{
    if (v.type == EMoveType::Noop)
        return DUMMY_COLOR;

    if ((v.is_wipe() && (m_settings.view_type != EViewType::Speed && m_settings.view_type != EViewType::ActualSpeed && m_settings.view_type != EViewType::Acceleration && m_settings.view_type != EViewType::Jerk)) || v.is_option())
        return get_option_color(move_type_to_option(v.type));

    switch (m_settings.view_type)
    {
    case EViewType::FeatureType:
    {
        return v.is_travel() ? get_option_color(move_type_to_option(v.type)) : get_extrusion_role_color(v.role);
    }
    case EViewType::Height:
    {
        return v.is_travel() ? get_option_color(move_type_to_option(v.type)) : m_height_range.get_color_at(v.height);
    }
    case EViewType::Width:
    {
        return v.is_travel() ? get_option_color(move_type_to_option(v.type)) : m_width_range.get_color_at(v.width);
    }
    case EViewType::Speed:
    {
        return m_speed_range.get_color_at(v.feedrate);
    }
    case EViewType::ActualSpeed:
    {
        return m_actual_speed_range.get_color_at(v.actual_feedrate);
    }
    case EViewType::FanSpeed:
    {
        return v.is_travel() ? get_option_color(move_type_to_option(v.type)) : m_fan_speed_range.get_color_at(v.fan_speed);
    }
    case EViewType::Temperature:
    {
        return v.is_travel() ? get_option_color(move_type_to_option(v.type)) : m_temperature_range.get_color_at(v.temperature);
    }
// ORCA: Add Pressure Advance visualization support
    case EViewType::PressureAdvance:
    {
        return v.is_travel() ? get_option_color(move_type_to_option(v.type)) : m_pressure_advance_range.get_color_at(v.pressure_advance);
    }
    // ORCA: Add Acceleration visualization support
    case EViewType::Acceleration:
    {
        return m_acceleration_range.get_color_at(v.acceleration);
    }
    // ORCA: Add Jerk visualization support
    case EViewType::Jerk:
    {
        return m_jerk_range.get_color_at(v.jerk);
    }
    case EViewType::VolumetricFlowRate:
    {
        return v.is_travel() ? get_option_color(move_type_to_option(v.type)) : m_volumetric_rate_range.get_color_at(v.volumetric_rate());
    }
    case EViewType::ActualVolumetricFlowRate:
    {
        return v.is_travel() ? get_option_color(move_type_to_option(v.type)) : m_actual_volumetric_rate_range.get_color_at(v.actual_volumetric_rate());
    }
    case EViewType::LayerTimeLinear:
    {
        return v.is_travel() ? get_option_color(move_type_to_option(v.type)) :
            m_layer_time_range[0].get_color_at(m_layers.get_layer_time(m_settings.time_mode, static_cast<size_t>(v.layer_id)));
    }
    case EViewType::LayerTimeLogarithmic:
    {
        return v.is_travel() ? get_option_color(move_type_to_option(v.type)) :
            m_layer_time_range[1].get_color_at(m_layers.get_layer_time(m_settings.time_mode, static_cast<size_t>(v.layer_id)));
    }
    case EViewType::Tool:
    {
        assert(static_cast<size_t>(v.extruder_id) < m_tool_colors.size());
        return m_tool_colors[v.extruder_id];
    }
    case EViewType::Summary: // ORCA
    case EViewType::ColorPrint:
    {
        return m_layers.layer_contains_colorprint_options(static_cast<size_t>(v.layer_id)) ? DUMMY_COLOR :
            m_color_print_colors[static_cast<size_t>(v.color_id) % m_color_print_colors.size()];
    }
    default: { break; }
    }

    return DUMMY_COLOR;
}
}
namespace CustomGCode{enum Type{ColorChange,PausePrint,Custom};struct Item{Type type;std::string color;};}
struct GCodeProcessorResult{std::vector<std::string>extruder_colors;std::vector<CustomGCode::Item>custom_gcode_per_print_z;};
struct App{bool is_gcode_viewer()const{return true;}};App wxGetApp(){return App();}
struct Plater{struct Current{std::vector<CustomGCode::Item>gcodes;};struct Model{Current get_curr_plate_custom_gcodes(){return {};}};struct Private{Model model;};Private storage,*p=&storage;
 std::vector<std::string>get_extruder_colors_from_plater_config(const GCodeProcessorResult*result)const{return result->extruder_colors;}
 std::vector<std::string>get_colors_for_color_print(const GCodeProcessorResult*const result)const;};
std::vector<std::string> Plater::get_colors_for_color_print(const GCodeProcessorResult* const result) const
{
    std::vector<std::string> colors = get_extruder_colors_from_plater_config(result);

    if (wxGetApp().is_gcode_viewer() && result != nullptr) {
        for (const CustomGCode::Item& code : result->custom_gcode_per_print_z) {
            if (code.type == CustomGCode::ColorChange)
                colors.emplace_back(code.color);
        }
    }
    else {
        //BBS
        colors.reserve(colors.size() + p->model.get_curr_plate_custom_gcodes().gcodes.size());
        for (const CustomGCode::Item& code : p->model.get_curr_plate_custom_gcodes().gcodes) {
            if (code.type == CustomGCode::ColorChange)
                colors.emplace_back(code.color);
        }
    }

    return colors;
}
int main(){using namespace libvgcode;json in;std::cin>>in;ViewerImpl viewer;viewer.m_tool_colors=in["toolsColors"].get<Palette>();viewer.m_color_print_colors=in["colorPrintColors"].get<Palette>();std::vector<PathVertex>vertices;std::map<size_t,bool>used;
 for(const auto&r:in["vertices"]){PathVertex v;v.position={r[0],r[1],r[2]};v.height=r[3];v.width=r[4];v.feedrate=r[5];v.actual_feedrate=r[6];v.mm3_per_mm=r[7];v.fan_speed=r[8];v.temperature=r[9];v.role=EGCodeExtrusionRole(int(r[10]));v.type=EMoveType(int(r[11]));v.gcode_id=r[12];v.layer_id=r[13];v.extruder_id=r[14];v.color_id=r[15];v.times={r[16],r[17]};viewer.m_layers.update(v,vertices.size());vertices.push_back(v);if(v.type==EMoveType::Extrude)used[v.extruder_id]=true;}
 json out={{"colors",json::object()},{"weights",json::array()}};for(const auto&entry:std::vector<std::pair<std::string,EViewType>>{{"color",EViewType::ColorPrint},{"summary",EViewType::Summary}}){viewer.m_settings.view_type=entry.second;out["colors"][entry.first]=json::array();for(const auto&v:vertices)out["colors"][entry.first].push_back(viewer.get_vertex_color(v));}
 MaterialViewer m;for(const auto&v:used)m.m_viewer.ids.push_back(v.first);m.m_filament_diameters=in["filamentDiameters"].get<std::vector<float>>();m.m_filament_densities=in["filamentDensities"].get<std::vector<float>>();auto&s=m.m_print_statistics;const auto&stats=in["materialStatistics"];s.model_volumes_per_extruder=stats["modelVolumes"].get<std::map<size_t,double>>();s.support_volumes_per_extruder=stats["supportVolumes"].get<std::map<size_t,double>>();s.wipe_tower_volumes_per_extruder=stats["towerVolumes"].get<std::map<size_t,double>>();s.flush_per_filament=stats["flushedVolumes"].get<std::map<size_t,double>>();s.total_volumes_per_extruder=stats["totalVolumes"].get<std::map<size_t,double>>();Result result{s,m.m_filament_densities,in["filamentCosts"].get<std::vector<float>>()};out["cost"]=native_cost(&result);out["metric"]=m.calculate(false);out["imperial"]=m.calculate(true);for(double weight:{0.,1.2345,999.99,1000.,1000000.,-1234.})out["weights"].push_back({weight,format_compact_weight(weight,false),format_compact_weight(weight,true)});out["counts"]=json::array();for(unsigned long long count:{0ull,999ull,1000ull,1001ull,1099ull,1100ull,999999ull,1000000ull,4294967295ull})out["counts"].push_back({count,format_compact_count(count)});out["paletteCases"]=json::array();for(const auto&items:std::vector<std::vector<CustomGCode::Item>>{{},{{CustomGCode::PausePrint,""}},{{CustomGCode::ColorChange,"#123ABC"},{CustomGCode::Custom,""}}}){GCodeProcessorResult result{{"#FF8000","#FF8000"},items};Plater plater;std::vector<std::string>colors;if(!items.empty()){colors=plater.get_colors_for_color_print(&result);colors.push_back("#808080");}out["paletteCases"].push_back(colors.empty()?result.extruder_colors:colors);}std::cout<<out.dump();}
