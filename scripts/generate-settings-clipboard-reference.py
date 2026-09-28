from pathlib import Path
import argparse,json,subprocess
parser=argparse.ArgumentParser();parser.add_argument('--reference-dir',required=True);args=parser.parse_args()
r=Path(__file__).resolve().parents[1];reference=Path(args.reference_dir).resolve();cases=[]
def add(name,clipboard,targets,globalSettings={}):cases.append(dict(name=name,clipboard=clipboard,targets=targets,globalSettings=globalSettings))
def target(settings={},parent={},kind='part'):return dict(kind=kind,settings=settings,parentSettings=parent)
add('object-replace-preserves-extruder',{'wall_loops':'7','extruder':'1'},[target({'wall_loops':'3','sparse_infill_density':'20%','extruder':'2'},kind='object')])
add('empty-object-cache-clears-overrides',{},[target({'wall_loops':'3','extruder':'2'},kind='object')])
add('copied-extruder-not-invented',{'wall_loops':'7','extruder':'2'},[target({'sparse_infill_density':'20%'},kind='object')])
add('matching-parent-values-stay-inherited',{'wall_loops':'4','sparse_infill_density':'30%'},[target({'wall_loops':'8'},{'wall_loops':'4'})],{'wall_loops':'2','sparse_infill_density':'15%'})
add('native-equality-ignores-lexical-float-format',{'sparse_infill_density':'30.00%','outer_wall_speed':'50.00'},[target({}, {'outer_wall_speed':'50.0'})],{'sparse_infill_density':'30%'})
add('part-compensates-unmatched-parent-object-options',{'wall_loops':'4','layer_height':'0.16'},[target({'extruder':'2'},{'layer_height':'0.12','wall_loops':'3'})],{'layer_height':'0.2','wall_loops':'2'})
add('part-copies-region-only-despite-object-cache',{'wall_loops':'4','layer_height':'0.16','support_material_style':'snug'},[target({}, {})],{'wall_loops':'2'})
add('multiple-parts-share-first-destination-comparison',{'wall_loops':'4','sparse_infill_density':'30%'},[target({}, {'wall_loops':'4'}),target({'extruder':'2'}, {'wall_loops':'7'})],{'wall_loops':'2','sparse_infill_density':'15%'})
add('multiple-part-parent-compensation-is-reused',{'wall_loops':'4','outer_wall_speed':'70'},[target({}, {'wall_loops':'3','layer_height':'.12'}),target({}, {'outer_wall_speed':'40'})],{'wall_loops':'2','layer_height':'.2','outer_wall_speed':'60'})
add('float-and-percentage-values-remain-distinct',{'sparse_infill_anchor':'30%'},[target({}, {'sparse_infill_anchor':'30'})],{'sparse_infill_anchor':'400%'})
add('range-paste-retains-its-extruder',{'layer_height':'.1','wall_loops':'5','extruder':'1'},[target({'layer_height':'.3','extruder':'2'},{'wall_loops':'3'},'range')],{'layer_height':'.2','wall_loops':'2'})
add('object-array-preserves-independent-destination-filaments',{'wall_loops':'5'},[target({'extruder':'2'},kind='object'),target({'extruder':'0'},kind='object'),target({},kind='object')])
inputs=reference/'inputs.json';inputs.write_text(json.dumps(cases))
run=subprocess.run([reference/'native-settings-reference',inputs],capture_output=True,text=True,check=True);answers=json.loads(run.stdout);assert len(answers)==len(cases)
for case,expected in zip(cases,answers):case['expected']=expected
provenance=json.loads((reference/'source.json').read_text());(r/'tests/fixtures/native-settings-clipboard-reference.json').write_text(json.dumps(dict(provenance=provenance,cases=cases),indent=2)+'\n')
print(len(cases),'original native settings clipboard reference cases')
