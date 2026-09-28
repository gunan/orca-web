// Original OrcaSlicer 8500fcd scalar color/range functions; AGPLv3 or later.
// Independent entry point: original functions below are unmodified. Explicitly
// unknown PA is represented by -1, which original range collection excludes.
#include <iostream>
#include <optional>
#include <nlohmann/json.hpp>
#include "src/libvgcode/include/ColorRange.hpp"
#include "src/libvgcode/include/PathVertex.hpp"
#include "src/libvgcode/src/Layers.hpp"
#include "src/libvgcode/src/Utils.hpp"
#include "src/libvgcode/src/Settings.hpp"
namespace libvgcode {
template<class T, class O = T>
using IntegerOnly = std::enable_if_t<std::is_integral<T>::value, O>;

// Rounding up.
// 1.5 is rounded to 2
// 1.49 is rounded to 1
// 0.5 is rounded to 1,
// 0.49 is rounded to 0
// -0.5 is rounded to 0,
// -0.51 is rounded to -1,
// -1.5 is rounded to -1.
// -1.51 is rounded to -2.
// If input is not a valid float (it is infinity NaN or if it does not fit)
// the float to int conversion produces a max int on Intel and +-max int on ARM.
template<typename I>
inline IntegerOnly<I, I> fast_round_up(double a)
{
    // Why does Java Math.round(0.49999999999999994) return 1?
    // https://stackoverflow.com/questions/9902968/why-does-math-round0-49999999999999994-return-1
    return a == 0.49999999999999994 ? I(0) : I(floor(a + 0.5));
}

// Round to a bin with minimum two digits resolution.
// Equivalent to conversion to string with sprintf(buf, "%.2g", value) and conversion back to float, but faster.
static float round_to_bin(const float value)
{
//    assert(value >= 0);
    constexpr float const scale[5]     = { 100.f,  1000.f,  10000.f,  100000.f,  1000000.f };
    constexpr float const invscale[5]  = { 0.01f,  0.001f,  0.0001f,  0.00001f,  0.000001f };
    constexpr float const threshold[5] = { 0.095f, 0.0095f, 0.00095f, 0.000095f, 0.0000095f };
    // Scaling factor, pointer to the tables above.
    int                   i = 0;
    // While the scaling factor is not yet large enough to get two integer digits after scaling and rounding:
    for (; value < threshold[i] && i < 4; ++i);
    // At least on MSVC std::round() calls a complex function, which is pretty expensive.
    // our fast_round_up is much cheaper and it could be inlined.
//    return std::round(value * scale[i]) * invscale[i];
    double a = value * scale[i];
    assert(std::abs(a) < double(std::numeric_limits<int64_t>::max()));
    return fast_round_up<int64_t>(a) * invscale[i];
}

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


class ViewerImpl { public:
 std::vector<PathVertex>m_vertices;Layers m_layers;Settings m_settings;std::optional<Settings>m_settings_used_for_ranges;
 ColorRange m_width_range,m_height_range,m_speed_range,m_actual_speed_range,m_fan_speed_range,m_temperature_range,m_pressure_advance_range,m_acceleration_range,m_jerk_range,m_volumetric_rate_range,m_actual_volumetric_rate_range;
 std::array<ColorRange,2>m_layer_time_range{ColorRange(EColorRangeType::Linear),ColorRange(EColorRangeType::Logarithmic)};
 Palette m_tool_colors{{255,0,0}},m_color_print_colors{{255,0,0}};
 auto get_extrusion_role_color(EGCodeExtrusionRole role)const{return DEFAULT_EXTRUSION_ROLES_COLORS[size_t(role)];}
 auto get_option_color(EOptionType type)const{return DEFAULT_OPTIONS_COLORS[size_t(type)];}
 void update_color_ranges();Color get_vertex_color(const PathVertex&)const;
 nlohmann::json range(const ColorRange&r)const{return {{"min",r.m_count?nlohmann::json(r.get_range()[0]):nlohmann::json(nullptr)},{"max",r.m_count?nlohmann::json(r.get_range()[1]):nlohmann::json(nullptr)},{"count",r.m_count},{"values",r.m_count?r.get_values():std::vector<float>{}},{"palette",r.get_palette()}};}
};
void ViewerImpl::update_color_ranges()
{
    // Color ranges do not need to be recalculated that often. If the following settings are the same
    // as last time, the current ranges are still valid. The recalculation is quite expensive.
    if (m_settings_used_for_ranges.has_value() &&
        m_settings.extrusion_roles_visibility == m_settings_used_for_ranges->extrusion_roles_visibility &&
        m_settings.options_visibility == m_settings_used_for_ranges->options_visibility)
        return;

    m_width_range.reset();
    m_height_range.reset();
    m_speed_range.reset();
    m_actual_speed_range.reset();
    m_fan_speed_range.reset();
    m_temperature_range.reset();
    // ORCA: Add Pressure Advance visualization support
    m_pressure_advance_range.reset();
    // ORCA: Add Acceleration visualization support
    m_acceleration_range.reset();
    // ORCA: Add Jerk visualization support
    m_jerk_range.reset();
    m_volumetric_rate_range.reset();
    m_actual_volumetric_rate_range.reset();
    m_layer_time_range[0].reset(); // ColorRange::EType::Linear
    m_layer_time_range[1].reset(); // ColorRange::EType::Logarithmic

    for (size_t i = 0; i < m_vertices.size(); i++) {
        const PathVertex& v = m_vertices[i];
        if (v.is_extrusion()) {
            m_height_range.update(round_to_bin(v.height));
            if (!v.is_custom_gcode() || m_settings.extrusion_roles_visibility[size_t(EGCodeExtrusionRole::Custom)]) {
                m_width_range.update(round_to_bin(v.width));
                m_volumetric_rate_range.update(round_to_bin(v.volumetric_rate()));
                m_actual_volumetric_rate_range.update(round_to_bin(v.actual_volumetric_rate()));
            }
            m_fan_speed_range.update(round_to_bin(v.fan_speed));
            m_temperature_range.update(round_to_bin(v.temperature));
            // ORCA: Add Pressure Advance visualization support
            if (v.pressure_advance >= 0.0f)
                m_pressure_advance_range.update(v.pressure_advance);
        }
        if ((v.is_travel() && m_settings.options_visibility[size_t(EOptionType::Travels)]) ||
            (v.is_wipe() && m_settings.options_visibility[size_t(EOptionType::Wipes)]) ||
             v.is_extrusion()) {
            m_speed_range.update(v.feedrate);
            m_actual_speed_range.update(v.actual_feedrate);
            // ORCA: Add Acceleration visualization support
            m_acceleration_range.update(v.acceleration);
            // ORCA: Add Jerk visualization support
            m_jerk_range.update(v.jerk);
        }
    }

    const std::vector<float> times = m_layers.get_times(m_settings.time_mode);
    for (size_t i = 0; i < m_layer_time_range.size(); ++i) {
        for (float t : times) {
            m_layer_time_range[i].update(t);
        }
    }

    m_settings_used_for_ranges = m_settings;
}
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
int main(){using namespace libvgcode;using json=nlohmann::json;json input;std::cin>>input;ViewerImpl v;for(const auto&r:input.at("vertices")){PathVertex p;p.position={r[0],r[1],r[2]};p.height=r[3];p.width=r[4];p.feedrate=r[5];p.actual_feedrate=r[6];p.mm3_per_mm=r[7];p.fan_speed=r[8];p.temperature=r[9];p.role=EGCodeExtrusionRole(int(r[10]));p.type=EMoveType(int(r[11]));p.gcode_id=r[12];p.layer_id=r[13];p.extruder_id=r[14];p.color_id=r[15];p.times={r[16],r[17]};p.pressure_advance=r[18].is_null()?-1.f:r[18].get<float>();p.acceleration=r[19];p.jerk=r[20];v.m_layers.update(p,v.m_vertices.size());v.m_vertices.push_back(p);}json result=json::object();
 const std::vector<std::pair<std::string,EViewType>>modes={{"speed",EViewType::Speed},{"actualSpeed",EViewType::ActualSpeed},{"fanSpeed",EViewType::FanSpeed},{"temperature",EViewType::Temperature},{"pressureAdvance",EViewType::PressureAdvance},{"acceleration",EViewType::Acceleration},{"jerk",EViewType::Jerk}};
 for(int travels=0;travels<2;++travels)for(int wipes=0;wipes<2;++wipes){v.m_settings.options_visibility[size_t(EOptionType::Travels)]=travels;v.m_settings.options_visibility[size_t(EOptionType::Wipes)]=wipes;v.update_color_ranges();const std::string key=std::string("travel")+(travels?"Visible":"Hidden")+"Wipe"+(wipes?"Visible":"Hidden");json capture={{"ranges",{{"speed",v.range(v.m_speed_range)},{"actualSpeed",v.range(v.m_actual_speed_range)},{"fanSpeed",v.range(v.m_fan_speed_range)},{"temperature",v.range(v.m_temperature_range)},{"pressureAdvance",v.range(v.m_pressure_advance_range)},{"acceleration",v.range(v.m_acceleration_range)},{"jerk",v.range(v.m_jerk_range)}}},{"colors",json::object()}};
 for(const auto&entry:modes){v.m_settings.view_type=entry.second;auto&colors=capture["colors"][entry.first];colors=json::array();for(const auto&p:v.m_vertices){if(entry.first=="pressureAdvance"&&p.is_extrusion()&&p.pressure_advance<0)colors.push_back({184,189,192});else colors.push_back(v.get_vertex_color(p));}}
 result[key]=capture;}std::cout<<result.dump();}
