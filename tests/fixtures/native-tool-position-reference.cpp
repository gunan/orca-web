// Pinned original OrcaSlicer2.4.2 functions; AGPL-3.0-or-later.
#include <nlohmann/json.hpp>
#include <Eigen/Core>
#include <Eigen/Geometry>
#include <iostream>
#include <numeric>
#include <cstring>
#include <cstdio>
#include <cassert>
#include "src/libvgcode/include/ColorRange.hpp"
#include "src/libvgcode/include/PathVertex.hpp"
using json=nlohmann::json;
#define ENABLE_ACTUAL_SPEED_DEBUG 1
static constexpr double EPSILON=1e-4;
static std::string _u8L(const std::string&s){return s;}
using EMoveType=libvgcode::EMoveType;
struct ColorRGBA{void a(float){}};
namespace libvgcode {

static Eigen::Vector3f convert(const Vec3&p){return {p[0],p[1],p[2]};}
static ColorRGBA convert(const Color&){return {};}
static EMoveType convert(EMoveType x){return x;}
class ViewerImpl{public:std::vector<PathVertex>m_vertices;struct{ETimeMode time_mode{ETimeMode::Normal};}m_settings;Interval visible{0,0},enabled{0,0};ColorRange range;void prepare(){for(const auto&v:m_vertices)range.update(v.actual_feedrate);}
 void set_view_visible_range(uint32_t a,uint32_t b){visible={a,b};}const Interval&get_view_visible_range()const{return visible;}const Interval&get_view_enabled_range()const{return enabled;}const PathVertex&get_current_vertex()const{return m_vertices[visible[1]];}size_t get_current_vertex_id()const{return visible[1];}const PathVertex&get_vertex_at(size_t i)const{return m_vertices.at(i);}size_t get_vertices_count()const{return m_vertices.size();}const ColorRange&get_color_range(EViewType)const{return range;}ETimeMode get_time_mode()const{return m_settings.time_mode;}float get_estimated_time_at(size_t id)const;};
float ViewerImpl::get_estimated_time_at(size_t id) const
{
    return std::accumulate(m_vertices.begin(), m_vertices.begin() + id + 1, 0.0f, 
        [this](float a, const PathVertex& v) { return a + v.times[static_cast<size_t>(m_settings.time_mode)]; });
}
}
class GCodeViewer {public:
 struct SequentialView{struct ActualSpeedImguiWidget{struct Item{float pos,speed;bool internal;};};struct Marker{std::vector<ActualSpeedImguiWidget::Item>data;void set_actual_speed_data(const std::vector<ActualSpeedImguiWidget::Item>&v){data=v;}void set_actual_speed_y_range(std::pair<float,float>){}void set_actual_speed_levels(const std::vector<std::pair<float,ColorRGBA>>&){}}marker;}m_sequential_view;
 libvgcode::ViewerImpl m_viewer;void enable_moves_slider(bool){}void update_sequential_view_current(unsigned int,unsigned int);
};
void GCodeViewer::update_sequential_view_current(unsigned int first, unsigned int last)
{
    m_viewer.set_view_visible_range(static_cast<uint32_t>(first), static_cast<uint32_t>(last));
    const libvgcode::Interval& enabled_range = m_viewer.get_view_enabled_range();
    enable_moves_slider(enabled_range[1] > enabled_range[0]);

#if ENABLE_ACTUAL_SPEED_DEBUG
    if (enabled_range[1] != m_viewer.get_view_visible_range()[1]) {
        const libvgcode::PathVertex& curr_vertex = m_viewer.get_current_vertex();
        if (curr_vertex.is_extrusion() || curr_vertex.is_travel() || curr_vertex.is_wipe() ||
            curr_vertex.type == libvgcode::EMoveType::Seam) {
            const libvgcode::ColorRange& color_range = m_viewer.get_color_range(libvgcode::EViewType::ActualSpeed);
            const std::array<float, 2>& interval = color_range.get_range();
            const size_t vertices_count = m_viewer.get_vertices_count();
            std::vector<SequentialView::ActualSpeedImguiWidget::Item> actual_speed_data;
            // collect vertices sharing the same gcode_id
            const size_t curr_id = m_viewer.get_current_vertex_id();
            size_t start_id = curr_id;
            while (start_id > 0) {
                --start_id;
                if (curr_vertex.gcode_id != m_viewer.get_vertex_at(start_id).gcode_id)
                    break;
            }
            size_t end_id = curr_id;
            while (end_id < vertices_count - 1) {
                ++end_id;
                if (curr_vertex.gcode_id != m_viewer.get_vertex_at(end_id).gcode_id)
                    break;
            }

            if (m_viewer.get_vertex_at(end_id - 1).type == libvgcode::convert(EMoveType::Seam))
                --end_id;

            assert(end_id - start_id >= 2);

            float total_len = 0.0f;
            for (size_t i = start_id; i < end_id; ++i) {
                const libvgcode::PathVertex& v = m_viewer.get_vertex_at(i);
                const float len = (i > start_id) ?
                    (libvgcode::convert(v.position) - libvgcode::convert(m_viewer.get_vertex_at(i - 1).position)).norm() : 0.0f;
                total_len += len;
                if (i == start_id || len > EPSILON)
                    actual_speed_data.push_back({ total_len, v.actual_feedrate, v.times[0] == 0.0f });
            }

            std::vector<std::pair<float, ColorRGBA>> levels;
            const std::vector<float> values = color_range.get_values();
            for (float value : values) {
                levels.push_back(std::make_pair(value, libvgcode::convert(color_range.get_color_at(value))));
                levels.back().second.a(0.5f);
            }

            // ORCA Compress consecutive duplicate speeds with 0.1 precision
            auto sameSpeed = [](float a, float b) {
                return static_cast<int>(std::roundf(a * 10.0f)) == static_cast<int>(std::roundf(b * 10.0f));
            };
            std::vector<SequentialView::ActualSpeedImguiWidget::Item> compressed;
            if (!actual_speed_data.empty()) {
                compressed.push_back(actual_speed_data[0]);
                for (int i = 1; i < (int)actual_speed_data.size(); ++i) {
                    const bool same_as_prev = sameSpeed(actual_speed_data[i].speed, actual_speed_data[i - 1].speed);
                    const bool same_as_next = (i + 1 < (int)actual_speed_data.size()) && sameSpeed(actual_speed_data[i].speed, actual_speed_data[i + 1].speed);
                    if (!same_as_prev) {
                        if (!sameSpeed(compressed.back().speed, actual_speed_data[i - 1].speed))
                            compressed.push_back(actual_speed_data[i - 1]);
                        compressed.push_back(actual_speed_data[i]);
                    } else if (!same_as_next)
                        compressed.push_back(actual_speed_data[i]);
                }
                if (compressed.back().pos != actual_speed_data.back().pos)
                    compressed.push_back(actual_speed_data.back());
            }

            m_sequential_view.marker.set_actual_speed_data(compressed);
            m_sequential_view.marker.set_actual_speed_y_range(std::make_pair(interval[0], interval[1]));
            m_sequential_view.marker.set_actual_speed_levels(levels);
        }
    }
#endif // ENABLE_ACTUAL_SPEED_DEBUG
}
static std::string to_string(libvgcode::EMoveType type)
{
    switch (type)
    {
    case libvgcode::EMoveType::Noop:        { return _u8L("Noop"); }
    case libvgcode::EMoveType::Retract:     { return _u8L("Retract"); }
    case libvgcode::EMoveType::Unretract:   { return _u8L("Unretract"); }
    case libvgcode::EMoveType::Seam:        { return _u8L("Seam"); }
    case libvgcode::EMoveType::ToolChange:  { return _u8L("Tool Change"); }
    case libvgcode::EMoveType::ColorChange: { return _u8L("Color Change"); }
    case libvgcode::EMoveType::PausePrint:  { return _u8L("Pause Print"); }
    case libvgcode::EMoveType::CustomGCode: { return _u8L("Custom G-code"); }
    case libvgcode::EMoveType::Travel:      { return _u8L("Travel"); }
    case libvgcode::EMoveType::Wipe:        { return _u8L("Wipe"); }
    case libvgcode::EMoveType::Extrude:     { return _u8L("Extrude"); }
    default:                                { return _u8L("Unknown"); }
    }
}
static std::string to_string(libvgcode::EGCodeExtrusionRole role)
{
    switch (role)
    {                                                              // ORCA matched terms
    case libvgcode::EGCodeExtrusionRole::None:                     { return _u8L("Unknown"); }
    case libvgcode::EGCodeExtrusionRole::Perimeter:                { return _u8L("Inner wall"); }
    case libvgcode::EGCodeExtrusionRole::ExternalPerimeter:        { return _u8L("Outer wall"); }
    case libvgcode::EGCodeExtrusionRole::OverhangPerimeter:        { return _u8L("Overhang wall"); }
    case libvgcode::EGCodeExtrusionRole::InternalInfill:           { return _u8L("Sparse infill"); }
    case libvgcode::EGCodeExtrusionRole::SolidInfill:              { return _u8L("Internal solid infill"); }
    case libvgcode::EGCodeExtrusionRole::TopSolidInfill:           { return _u8L("Top surface"); }
    case libvgcode::EGCodeExtrusionRole::Ironing:                  { return _u8L("Ironing"); }
    case libvgcode::EGCodeExtrusionRole::BridgeInfill:             { return _u8L("Bridge"); }
    case libvgcode::EGCodeExtrusionRole::GapFill:                  { return _u8L("Gap infill"); }
    case libvgcode::EGCodeExtrusionRole::Skirt:                    { return _u8L("Skirt"); }
    case libvgcode::EGCodeExtrusionRole::SupportMaterial:          { return _u8L("Support"); }
    case libvgcode::EGCodeExtrusionRole::SupportMaterialInterface: { return _u8L("Support interface"); }
    case libvgcode::EGCodeExtrusionRole::WipeTower:                { return _u8L("Prime tower"); }
    case libvgcode::EGCodeExtrusionRole::Custom:                   { return _u8L("Custom"); }
    // ORCA
    case libvgcode::EGCodeExtrusionRole::BottomSurface:            { return _u8L("Bottom surface"); }
    case libvgcode::EGCodeExtrusionRole::InternalBridgeInfill:     { return _u8L("Internal bridge"); } // ORCA
    case libvgcode::EGCodeExtrusionRole::Brim:                     { return _u8L("Brim"); }
    case libvgcode::EGCodeExtrusionRole::SupportTransition:        { return _u8L("Support transition"); }
    case libvgcode::EGCodeExtrusionRole::Mixed:                    { return _u8L("Mixed"); }
    default:                                                       { return _u8L("Unknown"); }
    }
}
inline std::string get_time_dhms(float time_in_secs)
{
    int days = (int)(time_in_secs / 86400.0f);
    time_in_secs -= (float)days * 86400.0f;
    int hours = (int)(time_in_secs / 3600.0f);
    time_in_secs -= (float)hours * 3600.0f;
    int minutes = (int)(time_in_secs / 60.0f);
    time_in_secs -= (float)minutes * 60.0f;

    char buffer[64];
    if (days > 0)
        ::sprintf(buffer, "%dd %dh %dm %ds", days, hours, minutes, (int)time_in_secs);
    else if (hours > 0)
        ::sprintf(buffer, "%dh %dm %ds", hours, minutes, (int)time_in_secs);
    else if (minutes > 0)
        ::sprintf(buffer, "%dm %ds", minutes, (int)time_in_secs);
    else if (time_in_secs > 1)
        ::sprintf(buffer, "%ds", (int)time_in_secs);
    else
        ::sprintf(buffer, "%fs", time_in_secs);

    return buffer;
}
json properties(libvgcode::ViewerImpl*viewer,libvgcode::EViewType view_type){const std::string NA_TXT="N/A";const char*NA_CSTR=NA_TXT.c_str();
        libvgcode::PathVertex vertex = viewer->get_current_vertex();
        size_t vertex_id = viewer->get_current_vertex_id();
        // Seam moves may contain non-deterministic vertex data, so use the
        // last visible non-seam vertex instead (except in FeatureType view)
        if (view_type != libvgcode::EViewType::FeatureType && vertex.type == libvgcode::EMoveType::Seam) {
            const libvgcode::Interval& visible_range = viewer->get_view_visible_range();
            if (visible_range[1] > 0) {
                vertex_id = static_cast<size_t>(visible_range[1]) - 1;
                vertex = viewer->get_vertex_at(vertex_id);
            }
        }
        const bool is_extrusion = vertex.is_extrusion();

        char detail_buf[1024];
        switch (view_type) {
            case libvgcode::EViewType::FeatureType:
                if (is_extrusion)
                    strcpy(detail_buf, to_string(vertex.role).c_str());
                else if (vertex.type != libvgcode::EMoveType::Noop)
                    strcpy(detail_buf, to_string(vertex.type).c_str());
                else
                    strcpy(detail_buf, NA_CSTR); // Noop moves are not shown in the "Line type" view, so show N/A for them.
                break;
            case libvgcode::EViewType::Height:
                if (is_extrusion)
                    sprintf(detail_buf, "%s%.2f", _u8L("Height: ").c_str(), vertex.height);
                else
                    sprintf(detail_buf, "%s%s", _u8L("Height: ").c_str(), NA_CSTR);
                break;
            case libvgcode::EViewType::Width:
                if (is_extrusion)
                    sprintf(detail_buf, "%s%.2f", _u8L("Width: ").c_str(), vertex.width);
                else
                    sprintf(detail_buf, "%s%s", _u8L("Width: ").c_str(), NA_CSTR);
                break;
            case libvgcode::EViewType::VolumetricFlowRate:
                if (is_extrusion)
                    sprintf(detail_buf, "%s%.2f", _u8L("Flow: ").c_str(), vertex.volumetric_rate());
                else
                    sprintf(detail_buf, "%s%s", _u8L("Flow: ").c_str(), NA_CSTR);
                break;
            case libvgcode::EViewType::FanSpeed:
                sprintf(detail_buf, "%s%.0f", _u8L("Fan: ").c_str(), vertex.fan_speed);
                break;
            case libvgcode::EViewType::Temperature:
                sprintf(detail_buf, "%s%.0f", _u8L("Temperature: ").c_str(), vertex.temperature);
                break;
            case libvgcode::EViewType::LayerTimeLinear:
            case libvgcode::EViewType::LayerTimeLogarithmic:
                sprintf(detail_buf, "%s%.1f", _u8L("Layer Time: ").c_str(), vertex.layer_duration);
                break;
            case libvgcode::EViewType::Tool:
                sprintf(detail_buf, "%s%d", _u8L("Tool: ").c_str(), vertex.extruder_id + 1);
                break;
            case libvgcode::EViewType::ColorPrint:
                sprintf(detail_buf, "%s%d", _u8L("Color: ").c_str(), vertex.color_id + 1);
                break;
            case libvgcode::EViewType::Acceleration:
                sprintf(detail_buf, "%s%.0f", _u8L("Acceleration: ").c_str(), vertex.acceleration);
                break;
            case libvgcode::EViewType::Jerk:
                sprintf(detail_buf, "%s%.1f", _u8L("Jerk: ").c_str(), vertex.jerk);
                break;
            case libvgcode::EViewType::PressureAdvance:
                sprintf(detail_buf, "%s%.4f", _u8L("PA: ").c_str(), vertex.pressure_advance);
                break;
            default:
                detail_buf[0] = '\0';
                break;
        }


 json rows=json::array();auto add_row=[&](std::string key,std::string value){rows.push_back({key,value});};char buff[1024];
            add_row(_u8L("Type"), _u8L(to_string(vertex.type)));
            add_row(_u8L("Line Type"), is_extrusion ? _u8L(to_string(vertex.role)) : NA_TXT);
            if (is_extrusion) sprintf(buff, ("%.3f " + _u8L("mm")).c_str(), vertex.width); else strcpy(buff, NA_CSTR);
            add_row(_u8L("Width"), buff);
            if (is_extrusion) sprintf(buff, ("%.3f " + _u8L("mm")).c_str(), vertex.height); else strcpy(buff, NA_CSTR);
            add_row(_u8L("Height"), buff);
            sprintf(buff, "%d", vertex.layer_id + 1);
            add_row(_u8L("Layer"), buff);
            sprintf(buff, ("%.1f " + _u8L("mm/s")).c_str(), vertex.feedrate);
            add_row(_u8L("Speed"), buff);
            sprintf(buff, ("%.0f " + _u8L("mm/s²")).c_str(), vertex.acceleration);
            add_row(_u8L("Acceleration"), buff);
            sprintf(buff, ("%.1f " + _u8L("mm/s")).c_str(), vertex.jerk);
            add_row(_u8L("Jerk"), buff);
            if (is_extrusion) sprintf(buff, ("%.3f " + _u8L("mm³/s")).c_str(), vertex.volumetric_rate()); else strcpy(buff, NA_CSTR);
            add_row(_u8L("Flow rate"), buff);
            sprintf(buff, "%.0f %%", vertex.fan_speed);
            add_row(_u8L("Fan speed"), buff);
            sprintf(buff, ("%.0f " + _u8L("°C")).c_str(), vertex.temperature);
            add_row(_u8L("Temperature"), buff);
            sprintf(buff, "%.4f", vertex.pressure_advance);
            add_row(_u8L("Pressure Advance"), buff);
            const float estimated_time = viewer->get_estimated_time_at(vertex_id);
            sprintf(buff, "%s (%.3fs)", get_time_dhms(estimated_time).c_str(), vertex.times[static_cast<size_t>(viewer->get_time_mode())]);
            add_row(_u8L("Time"), buff);


 return {{"propertyVertexId",vertex_id},{"position",vertex.position},{"detail",detail_buf},{"rows",rows},{"elapsed",viewer->get_estimated_time_at(vertex_id)}};
}

using Vec3f=Eigen::Vector3f;using Vec3d=Eigen::Vector3d;using stl_vertex=Vec3f;using Transform3d=Eigen::Affine3d;
namespace Geometry {static Transform3d translation_transform(const Vec3d&p){return Transform3d(Eigen::Translation3d(p));}static Transform3d rotation_transform(const Vec3d&p){return Transform3d(Eigen::AngleAxisd(p[2],Vec3d::UnitZ())*Eigen::AngleAxisd(p[1],Vec3d::UnitY())*Eigen::AngleAxisd(p[0],Vec3d::UnitX()));}static Transform3d scale_transform(double v){return Transform3d(Eigen::Scaling(v));}}
inline Vec3f face_normal(const stl_vertex vertex[3]) { return  (vertex[1] - vertex[0]).cross(vertex[2] - vertex[1]).normalized(); }
inline Vec3f face_normal_normalized(const stl_vertex vertex[3]) { return  face_normal(vertex).normalized(); }
json asset_reference(const json&triangles){json normals=json::array(),transforms=json::array();for(const auto&t:triangles){stl_vertex v[3];for(int j=0;j<3;j++)v[j]=Vec3f(t[j][0].get<float>(),t[j][1].get<float>(),t[j][2].get<float>());auto n=face_normal_normalized(v);normals.push_back({n[0],n[1],n[2]});}
struct Model{struct Box{Vec3d size(){return {3.5,3.5,12.};}};Box get_bounding_box(){return {};}}m_model;const float m_model_z_offset=.5f;
for(auto p:{Vec3f(0,0,.2f),Vec3f(101.23456f,-25.7f,10.2f),Vec3f(-10000.5f,99999.5f,400.f)}){Vec3f m_world_position=p;float scale_factor=1.f;
    const Transform3d model_matrix = (Geometry::translation_transform((m_world_position + m_model_z_offset * Vec3f::UnitZ()).cast<double>()) *
        Geometry::translation_transform(scale_factor * m_model.get_bounding_box().size().z() * Vec3d::UnitZ()) * Geometry::rotation_transform({ M_PI, 0.0, 0.0 })) *
        Geometry::scale_transform(scale_factor);

json values=json::array();for(int j=0;j<16;j++)values.push_back(model_matrix.matrix().data()[j]);transforms.push_back({{"position",{p[0],p[1],p[2]}},{"matrix",values}});}return {{"normals",normals},{"transforms",transforms}};}

int main(){json input;std::cin>>input;GCodeViewer viewer;for(const auto&r:input["vertices"]){libvgcode::PathVertex p;p.position={r[0],r[1],r[2]};p.height=r[3];p.width=r[4];p.feedrate=r[5];p.actual_feedrate=r[6];p.mm3_per_mm=r[7];p.fan_speed=r[8];p.temperature=r[9];p.role=libvgcode::EGCodeExtrusionRole(int(r[10]));p.type=EMoveType(int(r[11]));p.gcode_id=r[12];p.layer_id=r[13];p.extruder_id=r[14];p.color_id=r[15];p.times={r[16],r[17]};p.pressure_advance=r[18].is_null()?0.f:r[18].get<float>();p.acceleration=r[19];p.jerk=r[20];p.layer_duration=input["layers"][p.layer_id]["seconds"][0];viewer.m_viewer.m_vertices.push_back(p);}viewer.m_viewer.prepare();viewer.m_viewer.enabled={0,uint32_t(viewer.m_viewer.m_vertices.size()-1)};
 const std::vector<std::pair<std::string,libvgcode::EViewType>>modes={{"feature",libvgcode::EViewType::FeatureType},{"speed",libvgcode::EViewType::Speed},{"width",libvgcode::EViewType::Width},{"height",libvgcode::EViewType::Height},{"flow",libvgcode::EViewType::VolumetricFlowRate},{"actualSpeed",libvgcode::EViewType::ActualSpeed},{"fanSpeed",libvgcode::EViewType::FanSpeed},{"temperature",libvgcode::EViewType::Temperature},{"pressureAdvance",libvgcode::EViewType::PressureAdvance},{"acceleration",libvgcode::EViewType::Acceleration},{"jerk",libvgcode::EViewType::Jerk},{"tool",libvgcode::EViewType::Tool},{"layerTime",libvgcode::EViewType::LayerTimeLinear}};
 json result=json::array();for(auto index:input["indices"]){size_t id=index;viewer.m_sequential_view.marker.data.clear();viewer.update_sequential_view_current(0,id);json item={{"id",id},{"profiles",json::array()},{"properties",json::object()}};for(const auto&row:viewer.m_sequential_view.marker.data)item["profiles"].push_back({{"position",row.pos},{"speed",row.speed},{"internal",row.internal}});for(const auto&mode:modes)item["properties"][mode.first]=properties(&viewer.m_viewer,mode.second);result.push_back(item);}std::cout<<json({{"samples",result},{"hotend",asset_reference(input["assetTriangles"])}}).dump();}
