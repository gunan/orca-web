#include <Eigen/Core>
#include <nlohmann/json.hpp>
#include <iostream>
#include <cmath>
using Vec3d=Eigen::Vector3d;using json=nlohmann::json;
static bool shift=false;constexpr int WXK_SHIFT=1;bool wxGetKeyState(int){return shift;}
struct Selection{bool empty=false,tower=true;bool is_empty()const{return empty;}bool is_wipe_tower()const{return tower;}};
struct Parent{Selection selection;const Selection&get_selection()const{return selection;}};
struct UpdateData{struct Ray{Vec3d a,b;Vec3d unit_vector()const{return(b-a).normalized();}}mouse_ray;};
struct GLGizmoMove3D{Vec3d m_starting_drag_position,m_starting_box_center;double m_snap_step=1.;Parent m_parent;struct Grabber{bool enabled=true;};Grabber m_grabbers[3];void change_cs_by_selection(){};double calc_projection(const UpdateData&)const;bool on_is_activable()const;void data_changed(bool);};
struct GLGizmoRotate3D{Parent m_parent;bool on_is_activable()const;};struct GLGizmoScale3D{Parent m_parent;bool on_is_activable()const;};
double GLGizmoMove3D::calc_projection(const UpdateData& data) const
{
    double projection = 0.0;

    const Vec3d starting_vec = m_starting_drag_position - m_starting_box_center;
    const double len_starting_vec = starting_vec.norm();
    if (len_starting_vec != 0.0) {
        const Vec3d mouse_dir = data.mouse_ray.unit_vector();
        // finds the intersection of the mouse ray with the plane parallel to the camera viewport and passing throught the starting position
        // use ray-plane intersection see i.e. https://en.wikipedia.org/wiki/Line%E2%80%93plane_intersection algebric form
        // in our case plane normal and ray direction are the same (orthogonal view)
        // when moving to perspective camera the negative z unit axis of the camera needs to be transformed in world space and used as plane normal
        const Vec3d inters = data.mouse_ray.a + (m_starting_drag_position - data.mouse_ray.a).dot(mouse_dir) * mouse_dir;
        // vector from the starting position to the found intersection
        const Vec3d inters_vec = inters - m_starting_drag_position;

        // finds projection of the vector along the staring direction
        projection = inters_vec.dot(starting_vec.normalized());
    }

    if (wxGetKeyState(WXK_SHIFT))
        projection = m_snap_step * (double)std::round(projection / m_snap_step);

    return projection;
}
bool GLGizmoMove3D::on_is_activable() const
{
    return !m_parent.get_selection().is_empty();
}
bool GLGizmoRotate3D::on_is_activable() const
{
    // BBS: don't support rotate wipe tower
    const Selection& selection = m_parent.get_selection();
    return !m_parent.get_selection().is_empty() && !selection.is_wipe_tower();
}
bool GLGizmoScale3D::on_is_activable() const
{
    const Selection& selection = m_parent.get_selection();
    return !selection.is_empty() && !selection.is_wipe_tower();
}
void GLGizmoMove3D::data_changed(bool is_serializing) {
    m_grabbers[2].enabled = !m_parent.get_selection().is_wipe_tower();
    change_cs_by_selection();
}
Vec3d vec(const json&j){return{j[0].get<double>(),j[1].get<double>(),j[2].get<double>()};}
int main(){json input;std::cin>>input;json output=json::array();for(const auto&c:input){GLGizmoMove3D g;g.m_starting_drag_position=vec(c["handle"]);g.m_starting_box_center=vec(c["center"]);g.m_snap_step=c.value("snapStep",1.);shift=c.value("shift",false);UpdateData data{{vec(c["ray"][0]),vec(c["ray"][1])}};output.push_back(g.calc_projection(data));}GLGizmoMove3D move;GLGizmoRotate3D rotate;GLGizmoScale3D scale;move.data_changed(false);json result;result["projections"]=output;result["towerTools"]={{"move",move.on_is_activable()},{"rotate",rotate.on_is_activable()},{"scale",scale.on_is_activable()},{"axes",{move.m_grabbers[0].enabled,move.m_grabbers[1].enabled,move.m_grabbers[2].enabled}}};std::cout<<result.dump();}
