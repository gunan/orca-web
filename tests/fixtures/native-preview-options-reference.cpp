// Original native option diamond generation with GPU upload replaced by JSON.
#include <algorithm>
#include <cmath>
#include <iostream>
#include <nlohmann/json.hpp>
#include "src/libvgcode/src/Utils.hpp"
namespace libvgcode{struct OptionTemplate{unsigned int m_top_vao_id=0;uint8_t m_resolution=0,m_vertices_count=0;std::vector<float>result;void init(uint8_t);};
void OptionTemplate::init(uint8_t resolution)
{
    if (m_top_vao_id != 0)
        return;

    m_resolution = std::clamp<uint8_t>(resolution, 3, 85);
    m_vertices_count = static_cast<uint8_t>(3 * m_resolution);
    const float step = 2.0f * PI / float(m_resolution);

    //
    // top and bottom cones (paired wedges)
    //
    std::vector<float> top_vertices;
    top_vertices.reserve(6 * m_vertices_count);
    std::vector<float> bottom_vertices;
    bottom_vertices.reserve(6 * m_vertices_count);

    const Vec3 top_apex = { 0.0f, 0.0f, 0.5f };
    const Vec3 top_apex_normal = { 0.0f, 0.0f, 1.0f };
    const Vec3 bottom_apex = { 0.0f, 0.0f, -0.5f };
    const Vec3 bottom_apex_normal = { 0.0f, 0.0f, -1.0f };
    for (uint8_t i = 0; i < m_resolution; ++i) {
        const float curr_angle = float(i) * step;
        const float next_angle = float(i + 1) * step;
        const Vec3 curr_pos = { 0.5f * std::cos(curr_angle), 0.5f * std::sin(curr_angle), 0.0f };
        const Vec3 next_pos = { 0.5f * std::cos(next_angle), 0.5f * std::sin(next_angle), 0.0f };
        const Vec3 curr_norm = normalize(curr_pos);
        const Vec3 next_norm = normalize(next_pos);

        add_vertex(top_apex, top_apex_normal, top_vertices);
        add_vertex(curr_pos, curr_norm, top_vertices);
        add_vertex(next_pos, next_norm, top_vertices);

        add_vertex(bottom_apex, bottom_apex_normal, bottom_vertices);
        add_vertex(next_pos, next_norm, bottom_vertices);
        add_vertex(curr_pos, curr_norm, bottom_vertices);
    }

result=top_vertices;result.insert(result.end(),bottom_vertices.begin(),bottom_vertices.end());
}
}
int main(){libvgcode::OptionTemplate t;t.init(16);std::cout<<nlohmann::json(t.result).dump()<<"\n";}