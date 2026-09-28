// Extracted original Model placement methods. Bounds adapters represent axis-aligned
// normal volumes; this reference does not exercise native archive parsing or rotation.
#include <Eigen/Geometry>
#include <nlohmann/json.hpp>
#include <iostream>
#include <vector>
#include <cmath>
using Vec2d=Eigen::Vector2d;using Vec3d=Eigen::Vector3d;using json=nlohmann::json;
constexpr double EPSILON=1e-4,SINKING_Z_THRESHOLD=-0.001,SINKING_MIN_Z_THRESHOLD=0.001;
Vec2d to_2d(Vec3d v){return v.head<2>();}
struct BoundingBoxf3{Eigen::AlignedBox3d box;void merge(BoundingBoxf3 other){box.extend(other.box);}Vec3d center(){return box.center();}};
struct ModelInstance{Vec3d offset;bool auto_drop;Vec3d get_offset(){return offset;}void set_offset(Vec3d v){offset=v;}};
struct ModelObject{std::vector<ModelInstance*> instances;Vec3d low,high;
 BoundingBoxf3 instance_bounding_box(size_t n,bool){BoundingBoxf3 b;b.box.extend(low+instances[n]->offset);b.box.extend(high+instances[n]->offset);return b;}
 void invalidate_bounding_box(){}int parts_count(){return 1;}
 double min_z(){return low.z()+instances.front()->offset.z();}double max_z(){return high.z()+instances.front()->offset.z();}
 void translate_instance(size_t i,Vec3d v){instances[i]->offset+=v;}void ensure_on_bed(bool);
};
struct Model{std::vector<ModelObject*> objects;bool center_instances_around_point(const Vec2d&);};
void ModelObject::ensure_on_bed(bool allow_negative_z)
{
    double z_offset = 0.0;

    if (allow_negative_z) {
        if (parts_count() == 1) {
            const double min_z = this->min_z();
            const double max_z = this->max_z();
            if (min_z >= SINKING_Z_THRESHOLD || max_z < 0.0)
                z_offset = -min_z;
        }
        else {
            const double max_z = this->max_z();
            if (max_z < SINKING_MIN_Z_THRESHOLD)
                z_offset = SINKING_MIN_Z_THRESHOLD - max_z;
        }
    }
    else
        z_offset = -this->min_z();

    if (z_offset != 0.0) {
        for (size_t i = 0; i < instances.size(); ++i) {
            if (!instances[i]->auto_drop)
                continue;

            translate_instance(i, z_offset * Vec3d::UnitZ());
        }
    }
}
bool Model::center_instances_around_point(const Vec2d &point)
{
    BoundingBoxf3 bb;
    for (ModelObject *o : this->objects)
        for (size_t i = 0; i < o->instances.size(); ++ i)
            bb.merge(o->instance_bounding_box(i, false));

    Vec2d shift2 = point - to_2d(bb.center());
	if (std::abs(shift2(0)) < EPSILON && std::abs(shift2(1)) < EPSILON)
		// No significant shift, don't do anything.
		return false;

	Vec3d shift3 = Vec3d(shift2(0), shift2(1), 0.0);
	for (ModelObject *o : this->objects) {
		for (ModelInstance *i : o->instances)
			i->set_offset(i->get_offset() + shift3);
		o->invalidate_bounding_box();
	}
	return true;
}
Vec3d vec(json a){return Vec3d(a[0],a[1],a[2]);}
int main(){json cases;std::cin>>cases;for(auto& c:cases){Model model;for(auto g:c["groups"]){auto* o=new ModelObject;o->low=vec(g["min"]);o->high=vec(g["max"]);for(size_t i=0;i<g["offsets"].size();i++)o->instances.push_back(new ModelInstance{vec(g["offsets"][i]),g["autoDrop"][i]});model.objects.push_back(o);}
 for(auto* o:model.objects)o->ensure_on_bed(false);model.center_instances_around_point(Vec2d(c["center"][0],c["center"][1]));for(auto* o:model.objects)o->ensure_on_bed(false);
 c["placedOffsets"]=json::array();for(auto* o:model.objects){json offsets=json::array();for(auto* i:o->instances){auto p=i->offset;offsets.push_back({p.x(),p.y(),p.z()});delete i;}c["placedOffsets"].push_back(offsets);delete o;}}
 std::cout<<cases.dump();}
