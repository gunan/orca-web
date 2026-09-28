# SPDX-License-Identifier: AGPL-3.0-only
# Independent original GUI method oracle; shares only bounded mesh/config loading.
from pathlib import Path
import subprocess,shlex,json,hashlib,argparse,re
p=argparse.ArgumentParser();p.add_argument('--source',type=Path,required=True);p.add_argument('--build',type=Path,required=True);p.add_argument('--output',type=Path,required=True);a=p.parse_args();stage=a.output.resolve();stage.mkdir(exist_ok=True,parents=True);root=Path(__file__).resolve().parents[1];source=a.source.resolve();base=a.build.resolve()
def function(file,name):
 s=(source/file).read_text();start=s.index(name);opening=s.index('{',start);depth=0
 for token in re.finditer(r'"(?:\\.|[^"\\])*"|\'(?:\\.|[^\'\\])*\'|//[^\n]*|/\*.*?\*/|[{}]',s[opening:],re.S):
  if token.group()=='{':depth+=1
  elif token.group()=='}':
   depth-=1
   if not depth:return s[start:opening+token.end()]
 raise RuntimeError('Unclosed native method')

methods=[function('src/slic3r/GUI/Jobs/FillBedJob.cpp',name)for name in ['void FillBedJob::prepare()','void FillBedJob::process(Ctl &ctl)','void FillBedJob::finalize(bool canceled, std::exception_ptr &eptr)']]+[function('src/slic3r/GUI/Plater.cpp','std::vector<Vec2f> Plater::get_empty_cells(const Vec2f step)')]
provenance={'sourceCommit':'8500fcdccaa10b5099ac20d252af3a7c560046f1','excerpts':[]}
provenance['excerpts']=[{'declaration':s.splitlines()[0],'sha256':hashlib.sha256(s.encode()).hexdigest()}for s in methods]
# Validate the independent viewport methods separately from the original Fill pin.
tower_spec=json.loads((root/'fill-tower-source-hashes.json').read_text())
assert subprocess.check_output(['git','-C',str(source),'rev-parse','HEAD'],text=True).strip()==tower_spec['sourceCommit']
for name,digest in tower_spec['sources'].items():assert hashlib.sha256((source/name).read_bytes()).hexdigest()==digest,name
info=(source/'src/slic3r/GUI/GLCanvas3D.hpp').read_text();begin=info.index('    class WipeTowerInfo {');end=info.index('\n    };',begin)+7;info=info[begin:end]
arrange=(source/'src/slic3r/GUI/Jobs/ArrangeJob.cpp').read_text();begin=arrange.index('class WipeTower:');end=arrange.index('\n};',begin)+3;arrange=re.sub(r'\bWipeTower\b','ReferenceArrangeTower',arrange[begin:end])
viewport=(root/'scripts/fill-tower-reference.cpp.in').read_text().replace('INFO_CLASS_DEFINITION',info).replace('INFO_FUNCTION_DEFINITION',function('src/slic3r/GUI/GLCanvas3D.cpp','GLCanvas3D::WipeTowerInfo GLCanvas3D::get_wipe_tower_info(')).replace('ARRANGE_CLASS_DEFINITION',arrange)

expected=root/'fill-source-hashes.json'
if expected.exists():assert json.loads(expected.read_text())==provenance,'Pinned native Fill source changed'
else:expected.write_text(json.dumps(provenance,indent=2)+'\n')
helper=(root/'worker/native-fill-bed.cpp').read_text();prefix=helper[:helper.index('json native_fill_bed(')];setup=helper[helper.index(' using namespace arrangement;',helper.index('json native_fill_bed(')):helper.index(' ArrangePolygons selected,unselected,locked;')]
main=(root/'worker/main.cpp').read_text();add_exclusions=main[main.index('void add_exclusions('):main.index('\nint main(')]
shim=r'''
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
'''
# Fix a misspelled declaration in the generator itself instead of altering native text.
footer=r'''
}
json reference_run(const json&request){
SETUP
 const auto local=BoundingBoxf(Vec2d(unscaled<double>(local_box.min.x()),unscaled<double>(local_box.min.y())),Vec2d(unscaled<double>(local_box.max.x()),unscaled<double>(local_box.max.y())));
 independent::ctx={&model,&config,&params,&print,selected_object,selected_instance,plate_index,plate_count,cols,origin,plate_box,local,is_bbl};
 independent::ctx.tower=viewport_reference::evaluate(request.value("referenceTower",json()),config,plate_index,Vec2d(width,depth));
 independent::FillBedJob job;independent::Ctl ctl;const size_t before=selected_model->instances.size();job.process(ctl);json placements=json::array();for(const auto&ap:job.m_selected)placements.push_back({{"priority",ap.priority},{"bedIndex",ap.bed_idx},{"translation",{unscaled<double>(ap.translation.x()),unscaled<double>(ap.translation.y())}},{"rotation",ap.rotation},{"order",ap.itemid}});std::exception_ptr ep;job.finalize(false,ep);json frames=json::array();for(const auto*i:selected_model->instances)frames.push_back(mat(i->get_matrix()));return{{"frames",frames},{"added",selected_model->instances.size()-before},{"requiresArrange",independent::ctx.arranged},{"placements",placements},{"tower",viewport_reference::describe(independent::ctx.tower)}};
}
int main(int argc,char**argv){try{if(argc!=3)throw std::runtime_error("input/output paths required");json in;std::ifstream(argv[1])>>in;std::ofstream(argv[2])<<reference_run(in).dump();}catch(const std::exception&e){std::cerr<<e.what()<<'\n';return 1;}}
'''.replace('SETUP',setup)
file=stage/'independent-fill.cpp';file.write_text('#include <fstream>\n#include <iostream>\n#include <optional>\n'+prefix+add_exclusions+viewport+shim+'\n'.join(methods)+footer);(stage/'reference-source-hashes.json').write_text(json.dumps(provenance,indent=2)+'\n');(stage/'tower-source-hashes.json').write_text(json.dumps(tower_spec,indent=2)+'\n')
commands=subprocess.check_output(['ninja','-C',str(base),'-t','commands'],text=True).splitlines();args=shlex.split(next(x for x in commands if x.endswith('/worker/main.cpp')));obj=stage/'independent-fill.o';args[args.index('-c')+1]=str(file)
for flag in ['-o','-MT']:args[args.index(flag)+1]=str(obj)
args[args.index('-MF')+1]=str(obj)+'.d';args.insert(1,'-I'+str(root/'worker'));subprocess.run(args,cwd=stage,check=True)
line=next(x for x in commands if ' -o orca-arrange-worker 'in x);args=shlex.split(line.removeprefix(': && ').removesuffix(' && :'));args=[str(obj)if a=='CMakeFiles/orca-arrange-worker.dir/worker/main.cpp.o'else str(base/a)if a.endswith('.o')and not a.startswith('/')else a for a in args if not a.endswith('/worker/nearest-empty-cell.cpp.o')and not any(a.endswith('/worker/'+f+'.cpp.o') for f in ['native-fill-bed','native-fill-tower','native-prime-tower','native-tower-plate'])];args[args.index('-o')+1]=str(stage/'independent-fill');subprocess.run(args,cwd=stage,check=True)
