// Generated original native range/tick functions. GPU buffer upload is replaced
// by capturing the exact enabled IDs; GUI slider methods capture native values.
#include <iostream>
#include <optional>
#include <vector>
#include <algorithm>
#include <nlohmann/json.hpp>
#include "src/libvgcode/include/PathVertex.hpp"
#include "src/libvgcode/src/ViewRange.hpp"
#include "src/libvgcode/src/Settings.hpp"
using json=nlohmann::json;
namespace libvgcode{
struct LayerRange{Interval value;const Interval&get_view_range(){return value;}};
struct ViewerImpl{std::vector<PathVertex>m_vertices;std::vector<bool>m_valid_lines_bitset;Settings m_settings;ViewRange m_view_range;LayerRange m_layers;std::vector<uint32_t>output_segments,output_options;
void update_view_full_range();void update_enabled_entities();void toggle_option_visibility(EOptionType);void toggle_extrusion_role_visibility(EGCodeExtrusionRole);const Interval&get_view_enabled_range(){return m_view_range.get_enabled();}const Interval&get_view_visible_range(){return m_view_range.get_visible();}};
static bool is_visible(const PathVertex& v, const Settings& settings)
{
    const EOptionType option_type = move_type_to_option(v.type);
    try
    {
        return (option_type == EOptionType::COUNT) ?
            (v.type == EMoveType::Extrude) ? settings.extrusion_roles_visibility[size_t(v.role)] : false :
            settings.options_visibility[size_t(option_type)];
    }
    catch (...)
    {
        return false;
    }
}void ViewerImpl::update_view_full_range()
{
    const Interval& layers_range = m_layers.get_view_range();
    const bool travels_visible = m_settings.options_visibility[size_t(EOptionType::Travels)];
    const bool wipes_visible   = m_settings.options_visibility[size_t(EOptionType::Wipes)];

    auto first_it = m_vertices.begin();
    while (first_it != m_vertices.end() &&
           (first_it->layer_id < layers_range[0] || !is_visible(*first_it, m_settings))) {
        ++first_it;
    }

    // If the first vertex is an extrusion, add an extra step to properly detect the first segment
    if (first_it != m_vertices.begin() && first_it != m_vertices.end() && first_it->type == EMoveType::Extrude)
        --first_it;

    if (first_it == m_vertices.end())
        m_view_range.set_full(Range());
    else {
        if (travels_visible || wipes_visible) {
            // if the global range starts with a travel/wipe move, extend it to the travel/wipe start
            while (first_it != m_vertices.begin() &&
                   ((travels_visible && first_it->is_travel()) ||
                    (wipes_visible && first_it->is_wipe()))) {
                --first_it;
            }
        }

        auto last_it = first_it;
        while (last_it != m_vertices.end() && last_it->layer_id <= layers_range[1]) {
            ++last_it;
        }
        if (last_it != first_it)
            --last_it;

        // remove disabled trailing options, if any 
        auto rev_first_it = std::make_reverse_iterator(first_it);
        if (rev_first_it != m_vertices.rbegin())
            --rev_first_it;
        auto rev_last_it = std::make_reverse_iterator(last_it);
        if (rev_last_it != m_vertices.rbegin())
            --rev_last_it;

        bool reduced = false;
        while (rev_last_it != rev_first_it && !is_visible(*rev_last_it, m_settings)) {
            ++rev_last_it;
            reduced = true;
        }

        if (reduced && rev_last_it != m_vertices.rend())
            last_it = rev_last_it.base() - 1;

        if (travels_visible || wipes_visible) {
            // if the global range ends with a travel/wipe move, extend it to the travel/wipe end
            while (last_it != m_vertices.end() && last_it + 1 != m_vertices.end() &&
                   ((travels_visible && last_it->is_travel() && (last_it + 1)->is_travel()) ||
                    (wipes_visible && last_it->is_wipe() && (last_it + 1)->is_wipe()))) {
                  ++last_it;
            }
        }

        if (first_it != last_it)
            m_view_range.set_full(std::distance(m_vertices.begin(), first_it), std::distance(m_vertices.begin(), last_it));
        else
            m_view_range.set_full(Range());

        if (m_settings.top_layer_only_view_range) {
            const Interval& full_range = m_view_range.get_full();
            auto top_first_it = m_vertices.begin() + full_range[0];
            bool shortened = false;
            while (top_first_it != m_vertices.end() && (top_first_it->layer_id < layers_range[1] || !is_visible(*top_first_it, m_settings))) {
                ++top_first_it;
                shortened = true;
            }
            if (shortened)
                --top_first_it;

            // when spiral vase mode is enabled and only one layer is shown, extend the range by one step
            if (m_settings.spiral_vase_mode && layers_range[0] > 0 && layers_range[0] == layers_range[1])
                --top_first_it;
            m_view_range.set_enabled(std::distance(m_vertices.begin(), top_first_it), full_range[1]);
        }
        else
            m_view_range.set_enabled(m_view_range.get_full());
    }

    m_settings.update_view_full_range = false;
}void ViewerImpl::update_enabled_entities()
{
    if (m_vertices.empty())
        return;

    std::vector<uint32_t> enabled_segments;
    std::vector<uint32_t> enabled_options;
    Interval range = m_view_range.get_visible();

    // when top layer only visualization is enabled, we need to render
    // all the toolpaths in the other layers as grayed, so extend the range
    // to contain them
    if (m_settings.top_layer_only_view_range)
        range[0] = m_view_range.get_full()[0];

    // to show the options at the current tool marker position we need to extend the range by one extra step
    if (m_vertices[range[1]].is_option() && range[1] < static_cast<uint32_t>(m_vertices.size()) - 1)
        ++range[1];

    if (m_settings.spiral_vase_mode) {
        // when spiral vase mode is enabled and only one layer is shown, extend the range by one step
        const Interval& layers_range = m_layers.get_view_range();
        if (layers_range[0] > 0 && layers_range[0] == layers_range[1])
            --range[0];
    }

    for (size_t i = range[0]; i < range[1]; ++i) {
        const PathVertex& v = m_vertices[i];

        if (!m_valid_lines_bitset[i] && !v.is_option())
            continue;
        if (v.is_travel()) {
            if (!m_settings.options_visibility[size_t(EOptionType::Travels)])
                continue;
        }
        else if (v.is_wipe()) {
            if (!m_settings.options_visibility[size_t(EOptionType::Wipes)])
                continue;
        }
        else if (v.is_option()) {
            if (!m_settings.options_visibility[size_t(move_type_to_option(v.type))])
                continue;
        }
        else if (v.is_extrusion()) {
            if (!m_settings.extrusion_roles_visibility[size_t(v.role)])
                continue;
        }
        else
            continue;

        if (v.is_option())
            enabled_options.push_back(static_cast<uint32_t>(i));
        else
            enabled_segments.push_back(static_cast<uint32_t>(i));
    }

output_segments=enabled_segments;output_options=enabled_options;
}void ViewerImpl::toggle_option_visibility(EOptionType type)
{
    m_settings.options_visibility[size_t(type)] = ! m_settings.options_visibility[size_t(type)];
    const Interval old_enabled_range = m_view_range.get_enabled();
    update_view_full_range();
    const Interval& new_enabled_range = m_view_range.get_enabled();
    if (old_enabled_range != new_enabled_range) {
        const Interval& visible_range = m_view_range.get_visible();
        if (old_enabled_range == visible_range)
            m_view_range.set_visible(new_enabled_range);
        else if (m_settings.top_layer_only_view_range && new_enabled_range[0] < visible_range[0])
            m_view_range.set_visible(new_enabled_range[0], visible_range[1]);
    }
    m_settings.update_enabled_entities = true;
    m_settings.update_colors = true;
}void ViewerImpl::toggle_extrusion_role_visibility(EGCodeExtrusionRole role)
{
    m_settings.extrusion_roles_visibility[size_t(role)] = ! m_settings.extrusion_roles_visibility[size_t(role)];
    update_view_full_range();
    m_settings.update_enabled_entities = true;
    m_settings.update_colors = true;
}
}
struct Slider{std::vector<double>values,alternate;int low=0,high=0,max=0;int GetActiveValue(){return high;}int GetMinValue(){return 0;}int GetMaxValue(){return max;}void SetSliderValues(const std::vector<double>&v){values=v;}void SetSliderAlternateValues(const std::vector<double>&v){alternate=v;}void SetMaxValue(int v){max=v;}void SetSelectionSpan(int a,int b){low=a;high=b;}void SetHigherValue(int v){high=v;}};
struct Result{std::vector<int>moves{1};};
struct GCodeViewer{libvgcode::ViewerImpl m_viewer;Slider slider;Slider*m_moves_slider=&slider;Result result;Result*m_gcode_result=&result;const libvgcode::PathVertex&get_gcode_vertex_at(size_t id){return m_viewer.m_vertices.at(id);}void update_moves_slider(bool);};
void GCodeViewer::update_moves_slider(bool set_to_max)
{
    if (m_gcode_result->moves.empty())
        return;

    const libvgcode::Interval& range = m_viewer.get_view_enabled_range();
    const libvgcode::Interval& visible_range = m_viewer.get_view_visible_range();
    uint32_t last_gcode_id = get_gcode_vertex_at(range[0]).gcode_id;
    uint32_t gcode_id_min = get_gcode_vertex_at(visible_range[0]).gcode_id;
    uint32_t gcode_id_max = get_gcode_vertex_at(visible_range[1]).gcode_id;

    const size_t range_size = range[1] - range[0] + 1;
    std::vector<double> values;
    values.reserve(range_size);
    std::vector<double> alternate_values;
    alternate_values.reserve(range_size);

    std::optional<uint32_t> visible_range_min_id;
    std::optional<uint32_t> visible_range_max_id;
    uint32_t counter = 0;

    for (size_t i = range[0]; i <= range[1]; ++i) {
        const uint32_t gcode_id = get_gcode_vertex_at(i).gcode_id;
        bool skip = false;
        if (i > range[0]) {
            // skip consecutive moves with same gcode id (resulting from processing G2 and G3 lines)
            if (last_gcode_id == gcode_id) {
                values.back() = i + 1;
                skip = true;
            }
            else
                last_gcode_id = gcode_id;
        }

        if (!skip) {
            values.emplace_back(i + 1);
            alternate_values.emplace_back(gcode_id);
            if (alternate_values.back() == gcode_id_min)
                visible_range_min_id = counter;
            else if (alternate_values.back() == gcode_id_max)
                visible_range_max_id = counter;
            ++counter;
        }
    }

    const int span_min_id = visible_range_min_id.has_value() ? *visible_range_min_id : 0;
    const int span_max_id = visible_range_max_id.has_value() ? *visible_range_max_id : static_cast<int>(values.size()) - 1;

    bool keep_min = m_moves_slider->GetActiveValue() == m_moves_slider->GetMinValue();

    m_moves_slider->SetSliderValues(values);
    m_moves_slider->SetSliderAlternateValues(alternate_values);
    m_moves_slider->SetMaxValue(static_cast<int>(values.size()) - 1);
    m_moves_slider->SetSelectionSpan(span_min_id, span_max_id);
    if (set_to_max)
        m_moves_slider->SetHigherValue(keep_min ? m_moves_slider->GetMinValue() : m_moves_slider->GetMaxValue());
}
int main(){json input;std::cin>>input;json out=json::array();for(const auto&test:input){GCodeViewer gui;auto&v=gui.m_viewer;for(const auto&row:test.at("vertices")){libvgcode::PathVertex p;p.type=libvgcode::EMoveType(int(row[0]));p.layer_id=row[1];p.role=libvgcode::EGCodeExtrusionRole(int(row[2]));p.gcode_id=row[3];v.m_vertices.push_back(p);v.m_valid_lines_bitset.push_back(row[4]==1);}auto control=test.at("control");v.m_layers.value={control.at("firstLayer"),control.at("lastLayer")};v.m_settings.top_layer_only_view_range=control.at("topLayerOnly");v.m_settings.spiral_vase_mode=control.value("spiralVase",false);for(int i=0;i<9;i++)v.m_settings.options_visibility[i]=control.at("options")[i];for(const auto&r:control.at("hiddenRoles"))v.m_settings.extrusion_roles_visibility[int(r)]=false;
 v.update_view_full_range();auto enabled=v.m_view_range.get_enabled();if(control.contains("visibleRange")){auto range=control.at("visibleRange");v.m_view_range.set_visible(range[0],range[1]);}else v.m_view_range.set_visible(enabled);if(control.contains("toggleOption"))v.toggle_option_visibility(libvgcode::EOptionType(int(control.at("toggleOption"))));if(control.contains("toggleRole"))v.toggle_extrusion_role_visibility(libvgcode::EGCodeExtrusionRole(int(control.at("toggleRole"))));enabled=v.m_view_range.get_enabled();v.update_enabled_entities();gui.update_moves_slider(false);json ticks=json::array();for(size_t i=0;i<gui.slider.values.size();i++)ticks.push_back({{"vertexIndex",uint32_t(gui.slider.values[i])-1},{"line",uint32_t(gui.slider.alternate[i])}});out.push_back({{"full",v.m_view_range.get_full()},{"enabled",enabled},{"visible",v.m_view_range.get_visible()},{"ticks",ticks},{"segmentIds",v.output_segments},{"eventIds",v.output_options}});
 }std::cout<<out.dump()<<"\n";}
