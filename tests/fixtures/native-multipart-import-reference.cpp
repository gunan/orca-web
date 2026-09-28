// Original pinned detection and conversion; adapters retain affine/config/name data.
#include <Eigen/Geometry>
#include <nlohmann/json.hpp>
#include <string>
#include <vector>
#include <map>
#include <iostream>
#include <filesystem>
#include <limits>
#include <cassert>
using json=nlohmann::json;using Vec3d=Eigen::Vector3d;constexpr double EPSILON=1e-4;
namespace boost {namespace filesystem=std::filesystem;}
namespace Geometry {struct Transformation {Eigen::Affine3d matrix=Eigen::Affine3d::Identity();Vec3d get_offset()const{return matrix.translation();}void set_offset(Vec3d p){matrix.translation()=p;}Transformation operator*(const Transformation& other)const{Transformation t;t.matrix=matrix*other.matrix;return t;}};}
struct Config{std::map<std::string,int> data;std::vector<std::string> keys()const{std::vector<std::string> v;for(auto a:data)v.push_back(a.first);return v;}bool option(std::string k)const{return data.count(k);}int extruder()const{return data.at("extruder");}void set(std::string k,int v){data[k]=v;}};
struct ModelVolume{std::string name,tag;Config config;Geometry::Transformation transform;Geometry::Transformation get_transformation()const{return transform;}void set_transformation(Geometry::Transformation t){transform=t;}};
struct ModelInstance{Geometry::Transformation transform;Geometry::Transformation get_transformation()const{return transform;}};
struct Model;
struct ModelObject{ModelObject(Model*){}std::vector<ModelVolume*>volumes;std::vector<ModelInstance*>instances;Config config;std::string input_file,name;Vec3d origin_translation=Vec3d::Zero();double z=0;double min_z()const{return z;}ModelVolume* add_volume(const ModelVolume& v){auto* copy=new ModelVolume(v);volumes.push_back(copy);return copy;}~ModelObject(){for(auto* v:volumes)delete v;for(auto* i:instances)delete i;}};
struct Model{std::vector<ModelObject*> objects;bool looks_like_multipart_object()const;void convert_multipart_object(unsigned int);void clear_objects(){for(auto* o:objects)delete o;objects.clear();}~Model(){clear_objects();}};
bool Model::looks_like_multipart_object() const
{
    if (this->objects.size() <= 1)
        return false;
    double zmin = std::numeric_limits<double>::max();
    for (const ModelObject *obj : this->objects) {
        if (obj->volumes.size() > 1 || obj->config.keys().size() > 1)
            return false;

        double zmin_this = obj->min_z();
        if (zmin == std::numeric_limits<double>::max())
            zmin = zmin_this;
        else if (std::abs(zmin - zmin_this) > EPSILON)
            // The Object don't share zmin.
            return true;
    }
    return false;
}
void Model::convert_multipart_object(unsigned int max_extruders)
{
    assert(this->objects.size() >= 2);
    if (this->objects.size() < 2)
        return;

    ModelObject* object = new ModelObject(this);
    object->input_file = this->objects.front()->input_file;
    object->name = boost::filesystem::path(this->objects.front()->input_file).stem().string();
    //FIXME copy the config etc?

    unsigned int extruder_counter = 0;

	for (const ModelObject* o : this->objects)
    	for (const ModelVolume* v : o->volumes) {
            // If there are more than one object, put all volumes together
            // Each object may contain any number of volumes and instances
            // The volumes transformations are relative to the object containing them...
            Geometry::Transformation trafo_volume = v->get_transformation();
            // Revert the centering operation.
            trafo_volume.set_offset(trafo_volume.get_offset() - o->origin_translation);
            int counter = 1;
            auto copy_volume = [o, v, max_extruders, &counter, &extruder_counter](ModelVolume *new_v) {
                assert(new_v != nullptr);
                new_v->name = (counter > 1) ? o->name + "_" + std::to_string(counter++) : o->name;
                //BBS: Use extruder priority: volumn > object > default
                if (v->config.option("extruder"))
                    new_v->config.set("extruder", v->config.extruder());
                else if (o->config.option("extruder"))
                    new_v->config.set("extruder", o->config.extruder());

                return new_v;
            };
            if (o->instances.empty()) {
                copy_volume(object->add_volume(*v))->set_transformation(trafo_volume);
            } else {
                for (const ModelInstance* i : o->instances)
                    // ...so, transform everything to a common reference system (world)
                    copy_volume(object->add_volume(*v))->set_transformation(i->get_transformation() * trafo_volume);
            }
        }

    // commented-out to fix #2868
//    object->add_instance();
//    object->instances[0]->set_offset(object->raw_mesh_bounding_box().center());

    this->clear_objects();
    this->objects.push_back(object);
}
Geometry::Transformation transform(json a){Geometry::Transformation t;for(int i=0;i<16;i++)t.matrix.matrix().data()[i]=a[i];return t;}
int main(){json data;std::cin>>data;json predicates=json::array(),conversions=json::array();for(auto c:data["predicates"]){Model m;for(auto d:c){auto* o=new ModelObject(&m);o->z=d["minZ"];for(int k=0;k<d["configKeys"];k++)o->config.set(std::to_string(k),1);for(int n=0;n<d["volumeCount"];n++)o->volumes.push_back(new ModelVolume);m.objects.push_back(o);}predicates.push_back({{"objects",c},{"detected",m.looks_like_multipart_object()}});}
for(auto c:data["conversions"]){Model m;for(auto g:c["groups"]){auto* o=new ModelObject(&m);o->name=g["name"];o->input_file=g["inputFile"];if(!g["objectExtruder"].is_null())o->config.set("extruder",g["objectExtruder"]);for(auto v:g["volumes"]){auto* part=new ModelVolume;part->name=v["name"];part->tag=v["tag"];part->transform=transform(v["matrix"]);if(!v["extruder"].is_null())part->config.set("extruder",v["extruder"]);o->volumes.push_back(part);}for(auto v:g["instances"])o->instances.push_back(new ModelInstance{transform(v)});m.objects.push_back(o);}m.convert_multipart_object(4);c["result"]={{"name",m.objects[0]->name},{"volumes",json::array()}};for(auto* v:m.objects[0]->volumes){json matrix=json::array();for(int i=0;i<16;i++)matrix.push_back(v->transform.matrix.matrix().data()[i]);c["result"]["volumes"].push_back({{"name",v->name},{"tag",v->tag},{"extruder",v->config.option("extruder")?json(v->config.extruder()):json(nullptr)},{"matrix",matrix}});}conversions.push_back(c);}std::cout<<json{{"predicates",predicates},{"conversions",conversions}}.dump();}
