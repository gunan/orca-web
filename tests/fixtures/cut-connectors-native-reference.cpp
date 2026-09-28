// Pinned native TriangleMesh.cpp functions copied unchanged for an independent oracle.
// OrcaSlicer 8500fcdccaa10b5099ac20d252af3a7c560046f1; see retained AGPL license.
#include <cmath>
#include <vector>
#include <array>
#include <iostream>
#include <iomanip>
const double PI=M_PI;
struct Vec2f {float d[2];Vec2f(float x,float y):d{x,y}{}float operator()(int i)const{return d[i];}};
struct Vec3f {float d[3];Vec3f(float x,float y,float z):d{x,y,z}{}float operator()(int i)const{return d[i];}};
struct Vec3d {double d[3];Vec3d(double x,double y,double z):d{x,y,z}{}template<class T>Vec3f cast()const{return Vec3f(d[0],d[1],d[2]);}};
struct Face {int d[3];Face(int a,int b,int c):d{a,b,c}{}};
using stl_vertex=Vec3f;using stl_triangle_vertex_indices=Face;
namespace Eigen {using Vector2f=Vec2f;struct Rotation2Df {float a;Rotation2Df(float angle):a(angle){}Vec2f operator*(Vec2f v)const{float c=std::cos(a),s=std::sin(a);return Vec2f(c*v(0)-s*v(1),s*v(0)+c*v(1));}};}
struct indexed_triangle_set {std::vector<Vec3f> vertices;std::vector<Face> indices;};
bool is_approx(float a,float b){return std::abs(a-b)<.0001f;}
indexed_triangle_set its_make_cylinder(double r, double h, double fa)
{
    indexed_triangle_set mesh;
    size_t n_steps    = (size_t)ceil(2. * PI / fa);
    double angle_step = 2. * PI / n_steps;

    auto &vertices = mesh.vertices;
    auto &facets   = mesh.indices;
    vertices.reserve(2 * n_steps + 2);
    facets.reserve(4 * n_steps);

    // 2 special vertices, top and bottom center, rest are relative to this
    vertices.emplace_back(Vec3f(0.f, 0.f, 0.f));
    vertices.emplace_back(Vec3f(0.f, 0.f, float(h)));

    // for each line along the polygon approximating the top/bottom of the
    // circle, generate four points and four facets (2 for the wall, 2 for the
    // top and bottom.
    // Special case: Last line shares 2 vertices with the first line.
    Vec2f p = Eigen::Rotation2Df(0.f) * Eigen::Vector2f(0, r);
    vertices.emplace_back(Vec3f(p(0), p(1), 0.f));
    vertices.emplace_back(Vec3f(p(0), p(1), float(h)));
    for (size_t i = 1; i < n_steps; ++i) {
        p = Eigen::Rotation2Df(angle_step * i) * Eigen::Vector2f(0, float(r));
        vertices.emplace_back(Vec3f(p(0), p(1), 0.f));
        vertices.emplace_back(Vec3f(p(0), p(1), float(h)));
        int id = (int)vertices.size() - 1;
        facets.emplace_back( 0, id - 1, id - 3); // top
        facets.emplace_back(id,      1, id - 2); // bottom
        facets.emplace_back(id, id - 2, id - 3); // upper-right of side
        facets.emplace_back(id, id - 3, id - 1); // bottom-left of side
    }
    // Connect the last set of vertices with the first.
    int id = (int)vertices.size() - 1;
    facets.emplace_back( 0, 2, id - 1);
    facets.emplace_back( 3, 1,     id);
    facets.emplace_back(id, 2,      3);
    facets.emplace_back(id, id - 1, 2);

    return mesh;
}

indexed_triangle_set its_make_frustum(double r, double h, double fa)
{
    indexed_triangle_set mesh;
    size_t n_steps    = (size_t)ceil(2. * PI / fa);
    double angle_step = 2. * PI / n_steps;

    auto &vertices = mesh.vertices;
    auto &facets   = mesh.indices;
    vertices.reserve(2 * n_steps + 2);
    facets.reserve(4 * n_steps);

    // 2 special vertices, top and bottom center, rest are relative to this
    vertices.emplace_back(Vec3f(0.f, 0.f, 0.f));
    vertices.emplace_back(Vec3f(0.f, 0.f, float(h)));

    // for each line along the polygon approximating the top/bottom of the
    // circle, generate four points and four facets (2 for the wall, 2 for the
    // top and bottom.
    // Special case: Last line shares 2 vertices with the first line.
    Vec2f vec_top = Eigen::Rotation2Df(0.f) * Eigen::Vector2f(0, 0.5f*r);
    Vec2f vec_botton = Eigen::Rotation2Df(0.f) * Eigen::Vector2f(0, r);

    vertices.emplace_back(Vec3f(vec_botton(0), vec_botton(1), 0.f));
    vertices.emplace_back(Vec3f(vec_top(0), vec_top(1), float(h)));
    for (size_t i = 1; i < n_steps; ++i) {
        vec_top = Eigen::Rotation2Df(angle_step * i) * Eigen::Vector2f(0, 0.5f*float(r));
        vec_botton = Eigen::Rotation2Df(angle_step * i) * Eigen::Vector2f(0, float(r));
        vertices.emplace_back(Vec3f(vec_botton(0), vec_botton(1), 0.f));
        vertices.emplace_back(Vec3f(vec_top(0), vec_top(1), float(h)));
        int id = (int)vertices.size() - 1;
        facets.emplace_back( 0, id - 1, id - 3); // top
        facets.emplace_back(id,      1, id - 2); // bottom
        facets.emplace_back(id, id - 2, id - 3); // upper-right of side
        facets.emplace_back(id, id - 3, id - 1); // bottom-left of side
    }
    // Connect the last set of vertices with the first.
    int id = (int)vertices.size() - 1;
    facets.emplace_back( 0, 2, id - 1);
    facets.emplace_back( 3, 1,     id);
    facets.emplace_back(id, 2,      3);
    facets.emplace_back(id, id - 1, 2);

    return mesh;
}

indexed_triangle_set its_make_frustum_dowel(double radius, double h, int sectorCount)
{
    int   stackCount = 2;
    float sectorStep = float(2. * M_PI / sectorCount);
    float stackStep = float(M_PI / stackCount);

    indexed_triangle_set mesh;
    auto& vertices = mesh.vertices;
    vertices.reserve((stackCount - 1) * sectorCount + 2);
    for (int i = 0; i <= stackCount; ++i) {
        // from pi/2 to -pi/2
        double stackAngle = 0.5 * M_PI - stackStep * i;
        double xy = radius * cos(stackAngle);
        double z = radius * sin(stackAngle);
        if (i == 0 || i == stackCount)
            vertices.emplace_back(Vec3f(float(xy), 0.f, float(h * sin(stackAngle))));
        else
            for (int j = 0; j < sectorCount; ++j) {
                // from 0 to 2pi
                double sectorAngle = sectorStep * j + 0.25 * M_PI;
                vertices.emplace_back(Vec3d(xy * std::cos(sectorAngle), xy * std::sin(sectorAngle), z).cast<float>());
            }
    }

    auto& facets = mesh.indices;
    facets.reserve(2 * (stackCount - 1) * sectorCount);
    for (int i = 0; i < stackCount; ++i) {
        // Beginning of current stack.
        int k1 = (i == 0) ? 0 : (1 + (i - 1) * sectorCount);
        int k1_first = k1;
        // Beginning of next stack.
        int k2 = (i == 0) ? 1 : (k1 + sectorCount);
        int k2_first = k2;
        for (int j = 0; j < sectorCount; ++j) {
            // 2 triangles per sector excluding first and last stacks
            int k1_next = k1;
            int k2_next = k2;
            if (i != 0) {
                k1_next = (j + 1 == sectorCount) ? k1_first : (k1 + 1);
                facets.emplace_back(k1, k2, k1_next);
            }
            if (i + 1 != stackCount) {
                k2_next = (j + 1 == sectorCount) ? k2_first : (k2 + 1);
                facets.emplace_back(k1_next, k2, k2_next);
            }
            k1 = k1_next;
            k2 = k2_next;
        }
    }

    return mesh;
}

indexed_triangle_set its_make_snap(double r, double h, float space_proportion, float bulge_proportion)
{
    const float radius = (float)r;
    const float height = (float)h;
    const size_t sectors_cnt = 10; //(float)fa;
    const float halfPI = 0.5f * (float)PI;

    const float space_len = space_proportion * radius;

    const float b_len = radius;
    const float m_len = (1 + bulge_proportion) * radius;
    const float t_len = 0.5f * radius;

    const float b_height = 0.f;
    const float m_height = 0.5f * height;
    const float t_height = height;

    const float b_angle = acos(space_len/b_len);
    const float t_angle = acos(space_len/t_len);

    const float b_angle_step = b_angle / (float)sectors_cnt;
    const float t_angle_step = t_angle / (float)sectors_cnt;

    const Vec2f b_vec = Eigen::Vector2f(0, b_len);
    const Vec2f t_vec = Eigen::Vector2f(0, t_len);


    auto add_side_vertices = [b_vec, t_vec, b_height, m_height, t_height](std::vector<stl_vertex>& vertices, float b_angle, float t_angle, const Vec2f& m_vec) {
        Vec2f b_pt = Eigen::Rotation2Df(b_angle) * b_vec;
        Vec2f m_pt = Eigen::Rotation2Df(b_angle) * m_vec;
        Vec2f t_pt = Eigen::Rotation2Df(t_angle) * t_vec;

        vertices.emplace_back(Vec3f(b_pt(0), b_pt(1), b_height));
        vertices.emplace_back(Vec3f(m_pt(0), m_pt(1), m_height));
        vertices.emplace_back(Vec3f(t_pt(0), t_pt(1), t_height));
    };

    auto add_side_facets = [](std::vector<stl_triangle_vertex_indices>& facets, int vertices_cnt, int frst_id, int scnd_id) {
        int id = vertices_cnt - 1;

        facets.emplace_back(frst_id, id - 2, id - 5);

        facets.emplace_back(id - 2, id - 1, id - 5);
        facets.emplace_back(id - 1, id - 4, id - 5);
        facets.emplace_back(id - 4, id - 1, id);
        facets.emplace_back(id, id - 3, id - 4);

        facets.emplace_back(id, scnd_id, id - 3);
    };

    const float f = (b_len - m_len) / m_len; // Flattening

    auto get_m_len = [b_len, f](float angle) {
        const float rad_sqr = b_len * b_len;
        const float sin_sqr = sin(angle) * sin(angle);
        const float f_sqr = (1-f)*(1-f);
        return sqrtf(rad_sqr / (1 + (1 / f_sqr - 1) * sin_sqr));
    };

    auto add_sub_mesh = [add_side_vertices, add_side_facets, get_m_len,
                        b_height, t_height, b_angle, t_angle, b_angle_step, t_angle_step]
                        (indexed_triangle_set& mesh, float center_x, float angle_rotation, int frst_vertex_id) {
        auto& vertices = mesh.vertices;
        auto& facets     = mesh.indices;

        // 2 special vertices, top and bottom center, rest are relative to this
        vertices.emplace_back(Vec3f(center_x, 0.f, b_height));
        vertices.emplace_back(Vec3f(center_x, 0.f, t_height));

        float b_angle_start = angle_rotation - b_angle;
        float t_angle_start = angle_rotation - t_angle;
        const float b_angle_stop  = angle_rotation + b_angle;

        const int frst_id = frst_vertex_id;
        const int scnd_id = frst_id + 1;

        // add first side vertices and internal facets
        {
            const Vec2f m_vec = Eigen::Vector2f(0, get_m_len(b_angle_start));
            add_side_vertices(vertices, b_angle_start, t_angle_start, m_vec);

            int id = (int)vertices.size() - 1;

            facets.emplace_back(frst_id, id - 2, id - 1);
            facets.emplace_back(frst_id, id - 1, id);
            facets.emplace_back(frst_id, id, scnd_id);
        }

        // add d side vertices and facets
        while (!is_approx(b_angle_start, b_angle_stop)) {
            b_angle_start += b_angle_step;
            t_angle_start += t_angle_step;

            const Vec2f m_vec = Eigen::Vector2f(0, get_m_len(b_angle_start));
            add_side_vertices(vertices, b_angle_start, t_angle_start, m_vec);

            add_side_facets(facets, (int)vertices.size(), frst_id, scnd_id);
        }

        // add last internal facets to close the mesh
        {
            int id = (int)vertices.size() - 1;

            facets.emplace_back(frst_id, scnd_id, id);
            facets.emplace_back(frst_id, id, id - 1);
            facets.emplace_back(frst_id, id - 1, id - 2);
        }
    };


    indexed_triangle_set mesh;

    mesh.vertices.reserve(2 * (3 * (2 * sectors_cnt + 1) + 2));
    mesh.indices.reserve(2 * (6 * 2 * sectors_cnt + 6));

    add_sub_mesh(mesh, -space_len, halfPI    , 0);
    add_sub_mesh(mesh,  space_len, 3 * halfPI, (int)mesh.vertices.size());

    return mesh;
}
void emit(const indexed_triangle_set&m){std::cout<<"{\"vertices\":[";for(size_t i=0;i<m.vertices.size();i++){if(i)std::cout<<",";auto v=m.vertices[i];std::cout<<"["<<v(0)<<","<<v(1)<<","<<v(2)<<"]";}std::cout<<"],\"faces\":[";for(size_t i=0;i<m.indices.size();i++){if(i)std::cout<<",";auto f=m.indices[i];std::cout<<"["<<f.d[0]<<","<<f.d[1]<<","<<f.d[2]<<"]";}std::cout<<"]}";}
int main(){std::cout<<std::setprecision(10)<<"{";bool first=true;for(int n:{3,4,6,360})for(int type=0;type<3;type++){if(!first)std::cout<<",";first=false;std::cout<<"\""<<n<<"-"<<type<<"\":";emit(type==0?its_make_cylinder(1,1,2*PI/n):type==1?its_make_frustum(1,1,2*PI/n):its_make_frustum_dowel(1,1,n));}std::cout<<",\"snap\":";emit(its_make_snap(1,1,.3f,.15f));std::cout<<"}\n";}
