#include <fstream>
#include <iostream>
#include <optional>
// SPDX-License-Identifier: AGPL-3.0-only
// OrcaSlicer 2.4.2 FillBedJob.cpp at 8500fcdccaa10b5099ac20d252af3a7c560046f1.
// GUI ownership/progress is replaced by bounded JSON and the parent process
// cancellation deadline. Packing, float-grid order, setters and finalization
// retain the source behavior, including the all-instance setter.
#include "native-fill-bed.hpp"
#include "native-fill-tower.hpp"
#include "native-plate.hpp"
#include "input-validation.hpp"
#include "libslic3r/BuildVolume.hpp"
#include "libslic3r/ClipperUtils.hpp"
#include <numeric>
using namespace Slic3r;
using json=nlohmann::json;
extern void add_exclusions(arrangement::ArrangePolygons&,const DynamicPrintConfig&,int,float);
namespace {
using namespace arrangement;
constexpr size_t max_candidates=4096,max_instances=256,max_grid_visits=2000000;
void require(bool ok,const char*message){if(!ok)throw std::runtime_error(message);}
Transform3d tr(const json&values){Transform3d t=Transform3d::Identity();if(!values.is_null())for(int i=0;i<16;i++)t.matrix().data()[i]=values.at(i).get<double>();return t;}
json mat(const Transform3d&t){json v=json::array();for(int i=0;i<16;i++)v.push_back(t.matrix().data()[i]);return v;}
template<class Config>void assign(Config&config,const json&values){ConfigSubstitutionContext substitutions(ForwardCompatibilitySubstitutionRule::Disable);for(const auto&kv:values.items()){std::string value;if(kv.value().is_array()){const auto*option=config.option(kv.key());if(option&&option->type()==coStrings)value=ConfigOptionStrings(kv.value().get<std::vector<std::string>>()).serialize();else for(const auto&v:kv.value()){if(!value.empty())value+=",";value+=v.get<std::string>();}}else value=kv.value().get<std::string>();config.set_deserialize(kv.key(),value,substitutions);}}
std::vector<BoundingBoxf> excluded_boxes(const DynamicPrintConfig&config,const Vec2d&origin){std::vector<BoundingBoxf>boxes;const auto*points=config.option<ConfigOptionPoints>("bed_exclude_area");if(points)for(size_t i=0;i+3<points->values.size();i+=4){BoundingBoxf box;for(size_t j=i;j<i+4;j++)box.merge(points->values[j]+origin);boxes.push_back(box);}return boxes;}
// Plater::get_empty_cells: strict <, X-major iteration, float addition,
// expanded BuildVolume bounds, bbox exclusion overlap (not polygon packing).
std::vector<Vec2f> grid(const Vec2f step,const BoundingBoxf&bbox,const std::vector<BoundingBoxf>&exclusions){
 require(step.allFinite()&&step.minCoeff()>0,"Native Fill grid needs a positive finite footprint");
 std::vector<Vec2f>cells;size_t visits=0;const float first_x=step.x()/2+bbox.min.x(),first_y=step.y()/2+bbox.min.y();
 require(first_x+step.x()>first_x&&first_y+step.y()>first_y,"Native Fill grid exceeds float coordinate resolution");
 for(float x=first_x;x<bbox.max.x()-step.x()/2;x+=step.x()){
  require(x+step.x()>x,"Native Fill X grid no longer advances");
  for(float y=first_y;y<bbox.max.y()-step.y()/2;y+=step.y()){
   require(++visits<=max_grid_visits&&y+step.y()>y,"Native Fill grid exceeds bounded visit limit");
   BoundingBoxf cell(Vec2d(x-step.x()/2,y-step.y()/2),Vec2d(x+step.x()/2,y+step.y()/2));bool blocked=false;
   for(const auto&box:exclusions)if(box.overlap(cell)){blocked=true;break;}
   if(!blocked){require(cells.size()<max_candidates,"Native Fill grid exceeds 4096 cells; enlarge the object or use a smaller plate");cells.emplace_back(x,y);}
  }
 }return cells;
}
}
void add_exclusions(ArrangePolygons& target,const DynamicPrintConfig& config,int beds,float inflation){
 if(config.opt_bool("enable_wrapping_detection")){const auto* wrap=config.option<ConfigOptionPoints>("wrapping_exclude_area");if(wrap&&wrap->values.size()>=3)for(int bed=0;bed<beds;++bed){ArrangePolygon ap;for(const auto& point:wrap->values)ap.poly.contour.append({scaled(point.x()),scaled(point.y())});ap.is_virt_object=true;ap.bed_idx=bed;ap.height=1;ap.inflation=scaled(inflation);ap.name="WrappingRegion";target.push_back(std::move(ap));}}

 const auto* regions=config.option<ConfigOptionPoints>("bed_exclude_area");if(!regions)return;
 const auto& points=regions->values;for(size_t i=0;i+3<points.size();i+=4){BoundingBoxf box;for(size_t j=i;j<i+4;++j)box.merge(points[j]);if(box.size().x()<=0||box.size().y()<=0)continue;
  for(int bed=0;bed<beds;++bed){ArrangePolygon ap;ap.poly.contour=Polygon({{scaled(box.min.x()),scaled(box.min.y())},{scaled(box.max.x()),scaled(box.min.y())},{scaled(box.max.x()),scaled(box.max.y())},{scaled(box.min.x()),scaled(box.max.y())}});ap.is_virt_object=true;ap.bed_idx=bed;ap.height=1;ap.inflation=scaled(inflation);ap.name="ExcludedRegion"+std::to_string(i/4);target.push_back(std::move(ap));}
 }
}
// Independent GUI viewport footprint oracle. The render size is supplied by
// the separately compiled original PartPlate oracle, never the production worker.
namespace viewport_reference {
using namespace Slic3r;
using ArrangePolygon=arrangement::ArrangePolygon;
struct GLVolume {
 bool is_wipe_tower=true;int index=1000;TriangleMesh mesh;
 int object_idx()const{return index;}
 BoundingBoxf3 bounding_box()const{return mesh.bounding_box();}
};
struct GLCanvas3D {
     class WipeTowerInfo {
    protected:
        Vec2d m_pos = {std::nan(""), std::nan("")};
        double m_rotation = 0.;
        BoundingBoxf m_bb;
        // BBS: add partplate logic
        int m_plate_idx = -1;
        friend class GLCanvas3D;

    public:
        inline operator bool() const {
            return !std::isnan(m_pos.x()) && !std::isnan(m_pos.y());
        }

        inline const Vec2d& pos() const { return m_pos; }
        inline double rotation() const { return m_rotation; }
        inline const Vec2d bb_size() const { return m_bb.size(); }

        void apply_wipe_tower() const { apply_wipe_tower(m_pos, m_rotation); }
        void apply_wipe_tower(Vec2d pos, double rot) const;
    };
 struct {std::vector<GLVolume*>volumes;}m_volumes;
 WipeTowerInfo get_wipe_tower_info(int plate_idx)const;
};
struct Preset {DynamicPrintConfig config;};
struct Presets {Preset preset;Preset&get_edited_preset(){return preset;}};
struct Bundle {DynamicPrintConfig project_config;Presets prints;};
struct PartPlate {Vec2d size;Vec2d get_size(){return size;}};
struct PartPlateList {PartPlate plate;PartPlate*get_plate(int){return &plate;}};
struct Plater {PartPlateList plates;PartPlateList&get_partplate_list(){return plates;}};
struct App {Bundle bundle;Bundle*preset_bundle=&bundle;Plater p;Plater*plater(){return &p;}};
static App app;App&wxGetApp(){return app;}
GLCanvas3D::WipeTowerInfo GLCanvas3D::get_wipe_tower_info(int plate_idx) const
{
    WipeTowerInfo wti;

    for (const GLVolume* vol : m_volumes.volumes) {
        if (vol->is_wipe_tower && vol->object_idx() - 1000 == plate_idx) {
            DynamicPrintConfig& proj_cfg = wxGetApp().preset_bundle->project_config;
            wti.m_pos = Vec2d(proj_cfg.opt<ConfigOptionFloats>("wipe_tower_x")->get_at(plate_idx),
                              proj_cfg.opt<ConfigOptionFloats>("wipe_tower_y")->get_at(plate_idx));
            // BBS: don't support rotation
            //wti.m_rotation = (M_PI/180.) * proj_cfg->opt_float("wipe_tower_rotation_angle");

            auto& preset = wxGetApp().preset_bundle->prints.get_edited_preset();
            float wt_brim_width = preset.config.opt_float("prime_tower_brim_width");

            const BoundingBoxf3& bb = vol->bounding_box();
            if (wt_brim_width < 0) wt_brim_width = WipeTower::get_auto_brim_by_height((float)bb.max.z());
            wti.m_bb = BoundingBoxf{to_2d(bb.min), to_2d(bb.max)};
            wti.m_bb.offset(wt_brim_width);

            float brim_width = wxGetApp().preset_bundle->prints.get_edited_preset().config.opt_float("prime_tower_brim_width");
            if (brim_width < 0) brim_width = WipeTower::get_auto_brim_by_height((float) bb.max.z());
            wti.m_bb.offset((brim_width));

            // BBS: the wipe tower pos might be outside bed
            PartPlate* plate = wxGetApp().plater()->get_partplate_list().get_plate(plate_idx);
            Vec2d plate_size = plate->get_size();
            wti.m_pos.x() = std::clamp(wti.m_pos.x(), 0.0, plate_size(0) - wti.m_bb.size().x());
            wti.m_pos.y() = std::clamp(wti.m_pos.y(), 0.0, plate_size(1) - wti.m_bb.size().y());

            // BBS: add partplate logic
            wti.m_plate_idx = plate_idx;
            break;
        }
    }

    return wti;
}
class ReferenceArrangeTower: public GLCanvas3D::WipeTowerInfo {
public:
    explicit ReferenceArrangeTower(const GLCanvas3D::WipeTowerInfo &wti)
        : GLCanvas3D::WipeTowerInfo(wti)
    {}

    explicit ReferenceArrangeTower(GLCanvas3D::WipeTowerInfo &&wti)
        : GLCanvas3D::WipeTowerInfo(std::move(wti))
    {}

    void apply_arrange_result(const Vec2d& tr, double rotation, int item_id)
    {
        m_pos = unscaled(tr); m_rotation = rotation;
        apply_wipe_tower();
    }

    ArrangePolygon get_arrange_polygon() const
    {
        Polygon ap({
            {scaled(m_bb.min)},
            {scaled(m_bb.max.x()), scaled(m_bb.min.y())},
            {scaled(m_bb.max)},
            {scaled(m_bb.min.x()), scaled(m_bb.max.y())}
            });

        ArrangePolygon ret;
        ret.poly.contour = std::move(ap);
        ret.translation  = scaled(m_pos);
        ret.rotation     = m_rotation;
        //BBS
        ret.name = "ReferenceArrangeTower";
        ret.is_virt_object = true;
        ret.is_wipe_tower = true;
        ++ret.priority;

        BOOST_LOG_TRIVIAL(debug) << " arrange: wipe tower info:" << m_bb << ", m_pos: " << m_pos.transpose();

        return ret;
    }
};
std::optional<ArrangePolygon> evaluate(const json&render,const DynamicPrintConfig&config,int index,Vec2d plateSize){
 if(render.is_null()||!render.at("visible").get<bool>())return{};
 app.bundle.project_config=config;app.bundle.prints.preset.config=config;app.p.plates.plate.size=plateSize;
 const auto&size=render.at("size");GLVolume volume;volume.index=1000+index;
 volume.mesh=make_cube(size[0].get<float>(),size[1].get<float>(),size[2].get<float>());
 GLCanvas3D canvas;canvas.m_volumes.volumes={&volume};ReferenceArrangeTower tower(canvas.get_wipe_tower_info(index));
 auto polygon=tower.get_arrange_polygon();polygon.bed_idx=0;polygon.setter=nullptr;return polygon;
}
json describe(const std::optional<ArrangePolygon>&tower){
 if(!tower)return nullptr;json points=json::array();for(const auto&p:tower->poly.contour.points)points.push_back({p.x(),p.y()});
 return{{"polygon",points},{"translation",{tower->translation.x(),tower->translation.y()}},{"rotation",tower->rotation},{"bedIndex",tower->bed_idx},{"priority",tower->priority},{"isVirtual",tower->is_virt_object},{"isWipeTower",tower->is_wipe_tower}};
}
}

namespace independent {
using namespace arrangement;
#define _u8L(x) std::string(x)
constexpr int MAX_NUM_PLATES=36;
struct Context {Model*model;DynamicPrintConfig*config;ArrangeParams*params;NativeArrangePrint*print;int objectIndex,instanceIndex,plateIndex,plateCount,columns;Vec2d origin;BoundingBox plateBox;BoundingBoxf localBox;bool isBbl,arranged=false;std::optional<ArrangePolygon>tower;};static Context ctx;
struct Selection{int get_instance_idx(){return ctx.instanceIndex;}};
struct GLCanvas3D{double get_size_proportional_to_max_bed_size(double factor){return factor*std::max(ctx.localBox.size().x(),ctx.localBox.size().y());}};
struct PartPlate{int get_index(){return ctx.plateIndex;}BoundingBox get_bounding_box_crd(){return ctx.plateBox;}BoundingBoxf3 get_build_volume(bool){const double e=BuildVolume::SceneEpsilon;return BoundingBoxf3(Vec3d(ctx.localBox.min.x()+ctx.origin.x()-e,ctx.localBox.min.y()+ctx.origin.y()-e,-e),Vec3d(ctx.localBox.max.x()+ctx.origin.x()+e,ctx.localBox.max.y()+ctx.origin.y()+e,ctx.config->opt_float("printable_height")+e));}std::vector<BoundingBoxf3>boxes;std::vector<BoundingBoxf3>&get_exclude_areas(){boxes.clear();for(const auto&box:excluded_boxes(*ctx.config,ctx.origin))boxes.emplace_back(Vec3d(box.min.x(),box.min.y(),0),Vec3d(box.max.x(),box.max.y(),1));return boxes;}};
struct PartPlateList{static constexpr int MAX_PLATES_COUNT=36;PartPlate plate;int select_plate_by_obj(int,int){return 0;}PartPlate*get_curr_plate(){return&plate;}int get_plate_cols(){return ctx.columns;}int get_curr_plate_index(){return ctx.plateIndex;}int get_plate_count(){return ctx.plateCount;}NativeArrangePrint&get_current_fff_print(){return*ctx.print;}void preprocess_exclude_areas(ArrangePolygons&target,bool,int beds=36,double inflation=0){add_exclusions(target,*ctx.config,beds,unscaled<float>(inflation));}void preprocess_nonprefered_areas(ArrangePolygons&target,int beds){for(int i=0;i<beds;i++){ArrangePolygon ap;ap.poly.contour=Polygon({{scaled(18.),0},{scaled(240.),0},{scaled(240.),scaled(15.)},{scaled(18.),scaled(15.)}});ap.is_virt_object=true;ap.is_extrusion_cali_object=true;ap.bed_idx=i;ap.height=1;target.push_back(ap);}}};
struct ObjectList{void add_object_to_list(size_t,bool,bool,bool){}void update_printable_state(size_t,int){}};struct Sidebar{ObjectList list;ObjectList*obj_list(){return&list;}};
struct Plater{Sidebar side;Sidebar&sidebar(){return side;}PartPlateList list;Selection selection;GLCanvas3D canvas;PartPlateList&get_partplate_list(){return list;}int get_selected_object_idx(){return ctx.objectIndex;}Selection&get_selection(){return selection;}Model&model(){return*ctx.model;}DynamicPrintConfig*config(){return ctx.config;}GLCanvas3D*canvas3D(){return&canvas;}void arrange(){ctx.arranged=true;}void update(){}void set_prepare_state(int){}static std::vector<Vec2f>get_empty_cells(const Vec2f step);};
struct PresetBundle{const DynamicPrintConfig&full_config(){return*ctx.config;}bool is_bbl_vendor(){return ctx.isBbl;}};

struct App{Plater p;PresetBundle bundle;ObjectList list;PresetBundle*preset_bundle=&bundle;Plater*plater(){return&p;}ObjectList*obj_list(){return&list;}};static App app;App&wxGetApp(){return app;}
struct Await{void wait(){}};struct Ctl{template<class F>Await call_on_main_thread(F f){f();return{};}void update_status(int,std::string){}bool was_canceled(){return false;}};
struct Job{enum{PREPARE_STATE_MENU};};
double bed_stride_x(const Plater*){return 1.2*ctx.localBox.size().x();}double bed_stride_y(const Plater*){return 1.2*ctx.localBox.size().y();}ArrangeParams init_arrange_params(Plater*){return*ctx.params;}std::optional<ArrangePolygon>get_wipe_tower_arrangepoly(const Plater&){return ctx.tower;}
struct FillBedJob{int m_object_idx=-1;ArrangePolygons m_selected,m_unselected,m_locked;Points m_bedpts;ArrangeParams params;int m_status_range=0;Plater*m_plater=&app.p;bool m_instances=true;int status_range(){return m_status_range;}void prepare();void process(Ctl&);void finalize(bool,std::exception_ptr&);};
void FillBedJob::prepare()
{
    PartPlateList& plate_list = m_plater->get_partplate_list();

    m_locked.clear();
    m_selected.clear();
    m_unselected.clear();
    m_bedpts.clear();

    params = init_arrange_params(m_plater);

    m_object_idx = m_plater->get_selected_object_idx();
    if (m_object_idx == -1)
        return;

    //select current plate at first
    int sel_id = m_plater->get_selection().get_instance_idx();
    sel_id = std::max(sel_id, 0);

    int sel_ret = plate_list.select_plate_by_obj(m_object_idx, sel_id);
    BOOST_LOG_TRIVIAL(debug) << __FUNCTION__ << boost::format(":select plate obj_id %1%, ins_id %2%, ret %3%}") % m_object_idx % sel_id % sel_ret;

    PartPlate* plate = plate_list.get_curr_plate();
    Model& model = m_plater->model();
    BoundingBox plate_bb = plate->get_bounding_box_crd();
    int plate_cols = plate_list.get_plate_cols();
    int cur_plate_index = plate->get_index();

    ModelObject *model_object = m_plater->model().objects[m_object_idx];
    if (model_object->instances.empty()) return;

    const Slic3r::DynamicPrintConfig& global_config = wxGetApp().preset_bundle->full_config();
    m_selected.reserve(model_object->instances.size());
    for (size_t oidx = 0; oidx < model.objects.size(); ++oidx)
    {
        ModelObject* mo = model.objects[oidx];
        for (size_t inst_idx = 0; inst_idx < mo->instances.size(); ++inst_idx)
        {
            bool selected = (oidx == m_object_idx);

            ArrangePolygon ap = get_instance_arrange_poly(mo->instances[inst_idx], global_config);
            BoundingBox ap_bb = ap.transformed_poly().contour.bounding_box();
            ap.name = mo->name;

            if (selected)
            {
                if (mo->instances[inst_idx]->printable)
                {
                    ++ap.priority;
                    ap.itemid = m_selected.size();
                    m_selected.emplace_back(ap);
                }
                else
                {
                    if (plate_bb.contains(ap_bb))
                    {
                        ap.bed_idx = 0;
                        ap.itemid = m_unselected.size();
                        ap.row = cur_plate_index / plate_cols;
                        ap.col = cur_plate_index % plate_cols;
                        ap.translation(X) -= bed_stride_x(m_plater) * ap.col;
                        ap.translation(Y) += bed_stride_y(m_plater) * ap.row;
                        m_unselected.emplace_back(ap);
                    }
                    else
                    {
                        ap.bed_idx = PartPlateList::MAX_PLATES_COUNT;
                        ap.itemid = m_locked.size();
                        m_locked.emplace_back(ap);
                    }
                }
            }
            else
            {
                if (plate_bb.contains(ap_bb))
                {
                    ap.bed_idx = 0;
                    ap.itemid = m_unselected.size();
                    ap.row = cur_plate_index / plate_cols;
                    ap.col = cur_plate_index % plate_cols;
                    ap.translation(X) -= bed_stride_x(m_plater) * ap.col;
                    ap.translation(Y) += bed_stride_y(m_plater) * ap.row;
                    m_unselected.emplace_back(ap);
                }
                else
                {
                    ap.bed_idx = PartPlateList::MAX_PLATES_COUNT;
                    ap.itemid = m_locked.size();
                    m_locked.emplace_back(ap);
                }
            }
        }
    }
    /*
    for (ModelInstance *inst : model_object->instances)
        if (inst->printable) {
            ArrangePolygon ap = get_arrange_poly(inst);
            // Existing objects need to be included in the result. Only
            // the needed amount of object will be added, no more.
            ++ap.priority;
            m_selected.emplace_back(ap);
        }*/

    if (m_selected.empty()) return;

    bool enable_wrapping = global_config.option<ConfigOptionBool>("enable_wrapping_detection")->value;
    //add the virtual object into unselect list if has
    double scaled_exclusion_gap = scale_(1);
    plate_list.preprocess_exclude_areas(params.excluded_regions, enable_wrapping, 1, scaled_exclusion_gap);
    plate_list.preprocess_exclude_areas(m_unselected, enable_wrapping);

    m_bedpts = get_bed_shape(*m_plater->config());

    auto &objects = m_plater->model().objects;
    /*BoundingBox bedbb = get_extents(m_bedpts);

    for (size_t idx = 0; idx < objects.size(); ++idx)
        if (int(idx) != m_object_idx)
            for (ModelInstance *mi : objects[idx]->instances) {
                ArrangePolygon ap = get_arrange_poly(mi);
                auto ap_bb = ap.transformed_poly().contour.bounding_box();

                if (ap.bed_idx == 0 && !bedbb.contains(ap_bb))
                    ap.bed_idx = arrangement::UNARRANGED;

                m_unselected.emplace_back(ap);
            }*/
    if (auto wt = get_wipe_tower_arrangepoly(*m_plater))
        m_unselected.emplace_back(std::move(*wt));

    double sc = scaled<double>(1.) * scaled(1.);

    auto polys = offset_ex(m_selected.front().poly, params.min_obj_distance / 2);
    ExPolygon poly = polys.empty() ? m_selected.front().poly : polys.front();
    double poly_area = poly.area() / sc;
    double unsel_area = std::accumulate(m_unselected.begin(),
                                        m_unselected.end(), 0.,
                                        [cur_plate_index](double s, const auto &ap) {
                                            //BBS: m_unselected instance is in the same partplate
                                            return s + (ap.bed_idx == cur_plate_index) * ap.poly.area();
                                            //return s + (ap.bed_idx == 0) * ap.poly.area();
                                        }) / sc;

    double fixed_area = unsel_area + m_selected.size() * poly_area;
    double bed_area   = Polygon{m_bedpts}.area() / sc;

    // This is the maximum number of items, the real number will always be close but less.
    int needed_items = (bed_area - fixed_area) / poly_area;

    //int sel_id = m_plater->get_selection().get_instance_idx();
    // if the selection is not a single instance, choose the first as template
    //sel_id = std::max(sel_id, 0);
    ModelInstance *mi = model_object->instances[sel_id];
    ArrangePolygon template_ap = get_instance_arrange_poly(mi, global_config);

    int obj_idx;
    double offset_base, offset;
    bool was_one_instance;
    if (m_instances) {
        obj_idx = m_plater->get_selected_object_idx();
        offset_base = m_plater->canvas3D()->get_size_proportional_to_max_bed_size(0.05);
        offset = offset_base;
        was_one_instance = model_object->instances.size()==1;
    }

    for (int i = 0; i < needed_items; ++i, offset += offset_base) {
        ArrangePolygon ap = template_ap;
        ap.poly = m_selected.front().poly;
        ap.bed_idx = PartPlateList::MAX_PLATES_COUNT;
        ap.itemid = -1;
        ap.setter = [this, mi, offset](const ArrangePolygon &p) {
            ModelObject *mo = m_plater->model().objects[m_object_idx];
            ModelObject *obj;
            if (m_instances) {
                ModelInstance* model_instance = mo->instances.back();
                Vec3d offset_vec = model_instance->get_offset() + Vec3d(offset, offset, 0.0);
                mo->add_instance(offset_vec, model_instance->get_scaling_factor(), model_instance->get_rotation(), model_instance->get_mirror());
                obj = mo;
            } else {
                ModelObject* newObj = m_plater->model().add_object(*mo);
                newObj->name = mo->name +" "+ std::to_string(p.itemid);
                obj = newObj;
            }
            for (ModelInstance *newInst : obj->instances) { newInst->apply_arrange_result(p.translation.cast<double>(), p.rotation); }            
            //m_plater->sidebar().obj_list()->paste_objects_into_list({m_plater->model().objects.size()-1});
        };
        m_selected.emplace_back(ap);
    }

    m_status_range = m_selected.size();

    // The strides have to be removed from the fixed items. For the
    // arrangeable (selected) items bed_idx is ignored and the
    // translation is irrelevant.
    //BBS: remove logic for unselected object
    /*double stride = bed_stride(m_plater);
    for (auto &p : m_unselected)
        if (p.bed_idx > 0)
            p.translation(X) -= p.bed_idx * stride;*/
}
void FillBedJob::process(Ctl &ctl)
{
    auto statustxt = _u8L("Filling");
    ctl.call_on_main_thread([this] { prepare(); }).wait();
    ctl.update_status(0, statustxt);

    if (m_object_idx == -1 || m_selected.empty()) return;

    update_arrange_params(params, m_plater->config(), m_selected);
    m_bedpts = get_shrink_bedpts(m_plater->config(), params);

    auto &partplate_list               = m_plater->get_partplate_list();
    auto &print                        = wxGetApp().plater()->get_partplate_list().get_current_fff_print();
    const Slic3r::DynamicPrintConfig& global_config = wxGetApp().preset_bundle->full_config();
    PresetBundle* preset_bundle = wxGetApp().preset_bundle;
    const bool is_bbl = wxGetApp().preset_bundle->is_bbl_vendor();
    if (is_bbl && params.avoid_extrusion_cali_region && global_config.opt_bool("scan_first_layer"))
        partplate_list.preprocess_nonprefered_areas(m_unselected, MAX_NUM_PLATES);

    update_selected_items_inflation(m_selected, m_plater->config(), params);
    update_unselected_items_inflation(m_unselected, m_plater->config(), params);

    bool do_stop = false;
    params.stopcondition = [&ctl, &do_stop]() {
        return ctl.was_canceled() || do_stop;
    };

    params.progressind = [this, &ctl, &statustxt](unsigned st,std::string str="") {
         if (st > 0)
             ctl.update_status(st * 100 / status_range(), statustxt + " " + str);
    };

    params.on_packed = [&do_stop] (const ArrangePolygon &ap) {
        do_stop = ap.bed_idx > 0 && ap.priority == 0;
    };
    // final align用的是凸包，在有fixed item的情况下可能找到的参考点位置是错的，这里就不做了。见STUDIO-3265
    params.do_final_align = !is_bbl;

    if (m_selected.size() > 100){
        // too many items, just find grid empty cells to put them
        Vec2f step = unscaled<float>(get_extents(m_selected.front().poly).size()) + Vec2f(m_selected.front().brim_width, m_selected.front().brim_width);
        std::vector<Vec2f> empty_cells = Plater::get_empty_cells(step);
        size_t n=std::min(m_selected.size(), empty_cells.size());
        for (size_t i = 0; i < n; i++) {
            m_selected[i].translation = scaled<coord_t>(empty_cells[i]);
            m_selected[i].bed_idx= 0;
        }
        for (size_t i = n; i < m_selected.size(); i++) {
            m_selected[i].bed_idx = -1;
        }
    }
    else
        arrangement::arrange(m_selected, m_unselected, m_bedpts, params);

    // finalize just here.
    ctl.update_status(100, ctl.was_canceled() ?
                                       _u8L("Bed filling canceled.") :
                                       _u8L("Bed filling done."));
}
void FillBedJob::finalize(bool canceled, std::exception_ptr &eptr)
{
    // Ignore the arrange result if aborted.
    if (canceled || eptr)
        return;

    if (m_object_idx == -1) return;

    ModelObject *model_object = m_plater->model().objects[m_object_idx];
    if (model_object->instances.empty()) return;

    //BBS: partplate
    PartPlateList& plate_list = m_plater->get_partplate_list();
    int plate_cols = plate_list.get_plate_cols();
    int cur_plate = plate_list.get_curr_plate_index();

    size_t inst_cnt = model_object->instances.size();

    int added_cnt = std::accumulate(m_selected.begin(), m_selected.end(), 0, [](int s, auto &ap) {
        return s + int(ap.priority == 0 && ap.bed_idx == 0);
    });

    int oldSize = m_plater->model().objects.size();

    if (added_cnt > 0) {
        //BBS: adjust the selected instances
        for (ArrangePolygon& ap : m_selected) {
            if (ap.bed_idx != 0) {
                BOOST_LOG_TRIVIAL(debug) << __FUNCTION__ << boost::format(":skipped: bed_id %1%, trans {%2%,%3%}") % ap.bed_idx % unscale<double>(ap.translation(X)) % unscale<double>(ap.translation(Y));
                /*if (ap.itemid == -1)*/
                    continue;
                ap.bed_idx = plate_list.get_plate_count();
            }
            else
                ap.bed_idx = cur_plate;

            if (m_selected.size() <= 100) {
                ap.row = ap.bed_idx / plate_cols;
                ap.col = ap.bed_idx % plate_cols;
                ap.translation(X) += bed_stride_x(m_plater) * ap.col;
                ap.translation(Y) -= bed_stride_y(m_plater) * ap.row;
            }

            ap.apply();

            BOOST_LOG_TRIVIAL(debug) << __FUNCTION__ << boost::format(":selected: bed_id %1%, trans {%2%,%3%}") % ap.bed_idx % unscale<double>(ap.translation(X)) % unscale<double>(ap.translation(Y));
        }

        int   newSize = m_plater->model().objects.size();
        auto obj_list = m_plater->sidebar().obj_list();
        for (size_t i = oldSize; i < newSize; i++) {
            obj_list->add_object_to_list(i, true, true, false);
            obj_list->update_printable_state(i, 0);
        }

        BOOST_LOG_TRIVIAL(debug) << __FUNCTION__ << ": paste_objects_into_list";

        /*for (ArrangePolygon& ap : m_selected) {
            if (ap.bed_idx != arrangement::UNARRANGED && (ap.priority != 0 || ap.bed_idx == 0))
                ap.apply();
        }*/

        //model_object->ensure_on_bed();
        //BOOST_LOG_TRIVIAL(debug) << __FUNCTION__ << ": model_object->ensure_on_bed()";

        if (m_instances) {// && wxGetApp().app_config->get("auto_arrange") == "true") {
            m_plater->set_prepare_state(Job::PREPARE_STATE_MENU);
            m_plater->arrange();
        }
        m_plater->update();
    }
}
std::vector<Vec2f> Plater::get_empty_cells(const Vec2f step)
{
    PartPlate* plate = wxGetApp().plater()->get_partplate_list().get_curr_plate();
    BoundingBoxf3 build_volume = plate->get_build_volume(true);
    Vec2d vmin(build_volume.min.x(), build_volume.min.y()), vmax(build_volume.max.x(), build_volume.max.y());
    BoundingBoxf bbox(vmin, vmax);
    std::vector<Vec2f> cells;
    auto min_x = step(0)/2;// start_point.x() - step(0) * int((start_point.x() - bbox.min.x()) / step(0));
    auto min_y = step(1)/2;// start_point.y() - step(1) * int((start_point.y() - bbox.min.y()) / step(1));
    auto& exclude_box3s = plate->get_exclude_areas();
    std::vector<BoundingBoxf> exclude_boxs;
    for (auto& box : exclude_box3s) {
        Vec2d vmin(box.min.x(), box.min.y()), vmax(box.max.x(), box.max.y());
        exclude_boxs.emplace_back(vmin, vmax);
    }
    for (float x = min_x + bbox.min.x(); x < bbox.max.x() - step(0) / 2; x += step(0))
        for (float y = min_y + bbox.min.y(); y < bbox.max.y() - step(1) / 2; y += step(1)) {
            bool in_exclude = false;
            BoundingBoxf cell(Vec2d(x - step(0) / 2, y - step(1) / 2), Vec2d(x + step(0) / 2, y + step(1) / 2));
            for (auto& box : exclude_boxs) {
                if (box.overlap(cell)) {
                    in_exclude = true;
                    break;
                }
            }
            if(in_exclude)
                continue;
            cells.emplace_back(x, y);
        }
    return cells;
}
}
json reference_run(const json&request){
 using namespace arrangement;
 require(request.value("operation",std::string())=="fill-bed","Expected native Fill request");
 require(request.value("mode",std::string("instances"))=="instances","Native Fill supports the Clone dialog's instance workflow");
 // Reuse the arrangement mesh/settings validator, retaining non-printable
 // instances as fixed objects here rather than routing them outside the bed.
 json checked=request;checked["format"]="orca-arrangement-request";size_t total_instances=0;std::set<std::string>instance_ids;
 for(auto&object:checked.at("objects")){
  const auto&instances=object.at("instances");require(instances.is_array()&&!instances.empty()&&(total_instances+=instances.size())<=max_instances,"Native Fill requires at most 256 input instances");
  for(const auto&i:instances){arrangement_input::matrix(i.at("matrix"));require(i.at("id").is_string()&&!i.at("id").get_ref<const std::string&>().empty()&&i.at("id").get_ref<const std::string&>().size()<=256&&instance_ids.insert(i.at("id").get<std::string>()).second,"Invalid native instance identity");if(i.contains("printable"))require(i["printable"].is_boolean(),"Invalid native instance printable state");}
  object["matrix"]=instances.front()["matrix"];object["printable"]=true;
 }arrangement_input::request(checked);
 require(request.value("format",std::string())=="orca-fill-bed-request","Invalid Fill request format");
 const auto&plate=request.at("plate");for(const auto*key:{"index","count","columns"})require(plate.at(key).is_number_integer(),"Invalid native Fill plate index");const int plate_index=plate.at("index").get<int>(),plate_count=plate.at("count").get<int>(),cols=plate.at("columns").get<int>();
 require(plate_count>=1&&plate_count<=36&&plate_index>=0&&plate_index<plate_count&&cols==int(std::ceil(std::sqrt(double(plate_count)))) ,"Invalid native Fill plate layout");
 const auto&origin_j=plate.at("origin");require(origin_j.is_array()&&origin_j.size()==2,"Invalid Fill plate origin");Vec2d origin;for(int axis=0;axis<2;axis++)origin[axis]=arrangement_input::number(origin_j[axis],-1e6,1e6);
 require(request.contains("isBbl")&&request["isBbl"].is_boolean(),"Native vendor context is required for Fill");const bool is_bbl=request.at("isBbl").get<bool>();
 auto config=DynamicPrintConfig::full_print_config();assign(config,request.value("settings",json::object()));
 const auto bed=get_bed_shape(config);require(bed.size()>=3&&Polygon(bed).area()>0,"Native Fill requires a positive bed area");const auto local_box=Polygon(bed).bounding_box();
 const double width=unscaled<double>(local_box.size().x()),depth=unscaled<double>(local_box.size().y());
 require(width>0&&depth>0&&width<=100000&&depth<=100000,"Native Fill bed dimensions exceed bounds");
 const Vec2d expected_origin(1.2*width*(plate_index%cols),-1.2*depth*(plate_index/cols));require((origin-expected_origin).cwiseAbs().maxCoeff()<1e-7,"Fill plate origin does not match native plate layout");
 const auto*extruder_areas=config.option<ConfigOptionPointsGroups>("extruder_printable_area");require(!extruder_areas||extruder_areas->values.empty(),"Fill for per-extruder printable regions is not implemented yet");
 const BoundingBox plate_box(Point(local_box.min.x()+scaled(origin.x()),local_box.min.y()+scaled(origin.y())),Point(local_box.max.x()+scaled(origin.x()),local_box.max.y()+scaled(origin.y())));
 Model model;int selected_object=-1,selected_instance=-1;std::vector<std::vector<std::string>>ids;size_t expanded_triangles=0,world_visits=0;
 for(const auto&o:request.at("objects")){
  auto*obj=model.add_object();obj->name=o.at("id").get<std::string>();assign(obj->config,o.value("settings",json::object()));ids.emplace_back();
  for(const auto&p:o.at("parts")){indexed_triangle_set mesh;for(const auto&v:p.at("vertices"))mesh.vertices.emplace_back(v[0].get<float>(),v[1].get<float>(),v[2].get<float>());for(const auto&f:p.at("triangles"))mesh.indices.emplace_back(f[0].get<int>(),f[1].get<int>(),f[2].get<int>());auto*volume=obj->add_volume(TriangleMesh(std::move(mesh)));volume->set_type(ModelVolume::type_from_string(p.value("type",std::string("normal_part"))));volume->set_transformation(tr(p.value("matrix",json()))*volume->get_matrix());assign(volume->config,p.value("settings",json::object()));const auto colors=p.value("color",json::object());for(const auto&color:colors.items())volume->mmu_segmentation_facets.set_triangle_from_string(std::stoi(color.key()),color.value().get<std::string>());}
  for(const auto&i:o.at("instances")){auto*instance=obj->add_instance();instance->set_transformation(Geometry::Transformation(tr(i.at("matrix"))));instance->printable=i.value("printable",true);ids.back().push_back(i.at("id").get<std::string>());if(o.at("id")==request.at("selectedObjectId")&&i.at("id")==request.at("selectedInstanceId")){selected_object=int(model.objects.size()-1);selected_instance=int(obj->instances.size()-1);}}
 }require(selected_object>=0&&selected_instance>=0,"Select one native model instance to Fill");
 for(const auto&o:request.at("objects")){size_t faces=0;for(const auto&p:o.at("parts"))faces+=p.at("triangles").size();expanded_triangles+=faces*o.at("instances").size();require(expanded_triangles<=2000000,"Native Fill input exceeds two million expanded triangles");for(const auto&i:o.at("instances"))for(const auto&p:o.at("parts")){const Transform3d world=tr(i.at("matrix"))*tr(p.value("matrix",json()));for(const auto&v:p.at("vertices")){require(++world_visits<=8000000,"Native Fill transform validation exceeds eight million vertices");const Vec3d point=world*Vec3d(v[0].get<double>(),v[1].get<double>(),v[2].get<double>());require(point.allFinite()&&point.cwiseAbs().maxCoeff()<=1e6,"Native Fill world coordinates exceed bounds");}}}
 auto*selected_model=model.objects[selected_object];require(selected_model->instances[selected_instance]->printable,"Select a printable model instance to Fill");
 NativeArrangePrint print;print.m_config.apply(config,true);std::vector<NativeArrangeObject>print_objects;for(auto*obj:model.objects){NativeArrangeObject item;item.object_config.apply(config,true);item.object_config.apply(obj->config.get(),true);item.object_height=obj->instance_convex_hull_bounding_box(obj->instances.front()).size().z();print_objects.push_back(std::move(item));}for(auto&obj:print_objects)print.m_objects.push_back(&obj);
 const auto options=request.value("options",json::object());ArrangeParams params;params.min_obj_distance=scaled(options.value("spacing",0.));params.allow_rotations=options.value("rotation",false);params.allow_multi_materials_on_same_plate=options.value("multipleMaterials",true);params.align_to_y_axis=options.value("alignY",false);params.avoid_extrusion_cali_region=options.value("avoidCalibration",false);params.is_seq_print=options.value("sequential",false);params.object_skirt_offset=std::get<0>(print.object_skirt_offset());params.clearance_radius=config.opt_float("extruder_clearance_radius")+2*params.object_skirt_offset;params.clearance_height_to_rod=config.opt_float("extruder_clearance_height_to_rod");params.clearance_height_to_lid=config.opt_float("extruder_clearance_height_to_lid");params.printable_height=config.opt_float("printable_height");params.nozzle_height=config.opt_float("nozzle_height");params.align_center=config.opt<ConfigOptionPoint>("best_object_pos")->value;params.progressind=[](unsigned,std::string){};if(params.is_seq_print){params.bed_shrink_x=BED_SHRINK_SEQ_PRINT;params.bed_shrink_y=BED_SHRINK_SEQ_PRINT;}

 const auto local=BoundingBoxf(Vec2d(unscaled<double>(local_box.min.x()),unscaled<double>(local_box.min.y())),Vec2d(unscaled<double>(local_box.max.x()),unscaled<double>(local_box.max.y())));
 independent::ctx={&model,&config,&params,&print,selected_object,selected_instance,plate_index,plate_count,cols,origin,plate_box,local,is_bbl};
 independent::ctx.tower=viewport_reference::evaluate(request.value("referenceTower",json()),config,plate_index,Vec2d(width,depth));
 independent::FillBedJob job;independent::Ctl ctl;const size_t before=selected_model->instances.size();job.process(ctl);json placements=json::array();for(const auto&ap:job.m_selected)placements.push_back({{"priority",ap.priority},{"bedIndex",ap.bed_idx},{"translation",{unscaled<double>(ap.translation.x()),unscaled<double>(ap.translation.y())}},{"rotation",ap.rotation},{"order",ap.itemid}});std::exception_ptr ep;job.finalize(false,ep);json frames=json::array();for(const auto*i:selected_model->instances)frames.push_back(mat(i->get_matrix()));return{{"frames",frames},{"added",selected_model->instances.size()-before},{"requiresArrange",independent::ctx.arranged},{"placements",placements},{"tower",viewport_reference::describe(independent::ctx.tower)}};
}
int main(int argc,char**argv){try{if(argc!=3)throw std::runtime_error("input/output paths required");json in;std::ifstream(argv[1])>>in;std::ofstream(argv[2])<<reference_run(in).dump();}catch(const std::exception&e){std::cerr<<e.what()<<'\n';return 1;}}
