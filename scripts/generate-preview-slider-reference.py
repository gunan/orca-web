from pathlib import Path
import hashlib,json,subprocess,sys
source=Path(sys.argv[1]);stage=Path(__file__).resolve().parents[1]
commit='8500fcdccaa10b5099ac20d252af3a7c560046f1'
if subprocess.check_output(['git','-C',str(source),'rev-parse','HEAD'],text=True).strip()!=commit:raise SystemExit('Wrong native source')
slider=(source/'src/slic3r/GUI/IMSlider.cpp').read_text();canvas=(source/'src/slic3r/GUI/GLCanvas3D.cpp').read_text()
expected={'IMSlider.cpp': '7a777c58b4515aa4d0d3354badf929a20dcf6e2793a9fd71bb3441e7bce2284d', 'GLCanvas3D.cpp': 'a44c6c43ca28690da12b5502eab1a6bdec3f8392da4c0454586e065a43614ddb'}
for name,text in [('IMSlider.cpp',slider),('GLCanvas3D.cpp',canvas)]:
 if hashlib.sha256(text.encode()).hexdigest()!=expected[name]:raise SystemExit('Pinned source hash differs: '+name)
def extract(text,signature):
 start=text.index(signature);opening=text.index('{',start);level=1;i=opening+1
 while level:
  if text[i]=='{':level+=1
  elif text[i]=='}':level-=1
  i+=1
 return text[start:i]
functions='\n'.join(extract(slider,signature)for signature in ['void IMSlider::SetLowerValue(','void IMSlider::SetHigherValue(','void IMSlider::correct_lower_value()','void IMSlider::correct_higher_value()','bool IMSlider::switch_one_layer_mode()'])
start=canvas.index('                        int increment = (evt.CmdDown() || evt.ShiftDown()) ? 5 : 1;');end=canvas.index('                        m_dirty = true;',start)
handler=canvas[start:end]
header='''// Generated from pinned original native methods; only GUI-owned accessors are stubbed.
#include <algorithm>
#include <iostream>
#include <string>
#include <nlohmann/json.hpp>
using json=nlohmann::json;
enum Selection{ssUndef,ssLower,ssHigher};
enum Key{WXK_UP=1,WXK_DOWN,WXK_LEFT,WXK_RIGHT,WXK_HOME,WXK_END};
struct Event{int key;bool command,shift;bool CmdDown(){return command;}bool ShiftDown(){return shift;}int GetKeyCode(){return key;}};
struct IMSlider{
 int m_lower_value=0,m_higher_value=0,m_min_value=0,m_max_value=0,m_one_layer_value=0;bool m_is_one_layer=false,m_show_custom_gcode_window=false,dirty=false;Selection m_selection=ssHigher;
 int GetLowerValue(){return m_lower_value;}int GetHigherValue(){return m_higher_value;}int GetMinValue(){return m_min_value;}int GetMaxValue(){return m_max_value;}Selection GetSelection(){return m_selection;}
 bool is_dirty(){return dirty;}bool is_one_layer(){return m_is_one_layer;}void set_as_dirty(){dirty=true;}void show_go_to_layer(bool){}
 void SetLowerValue(int);void SetHigherValue(int);void correct_lower_value();void correct_higher_value();bool switch_one_layer_mode();
};
'''
footer='''
int main(){json cases;std::cin>>cases;json out=json::array();for(const auto& test:cases){auto state=test.at("state");IMSlider layer,moves;layer.m_lower_value=state.at("low");layer.m_higher_value=state.at("high");layer.m_max_value=state.at("maxLayer");layer.m_one_layer_value=state.at("remembered");layer.m_is_one_layer=state.at("singleLayer");layer.m_selection=state.at("active")=="low"?ssLower:ssHigher;moves.m_higher_value=state.at("move");moves.m_max_value=state.at("maxMove");IMSlider *m_layers_slider=&layer,*m_moves_slider=&moves;Event evt{0,false,false};const std::string action=test.at("action").at("action");int amount=test.at("action").value("amount",1);evt.shift=amount==5;
 if(action=="singleLayer")layer.switch_one_layer_mode();
 else {evt.key=action=="arrowup"?WXK_UP:action=="arrowdown"?WXK_DOWN:action=="arrowleft"?WXK_LEFT:action=="arrowright"?WXK_RIGHT:action=="home"?WXK_HOME:WXK_END;const int keyCode=evt.GetKeyCode();
'''+handler+'''
 }
 out.push_back({{"low",layer.m_lower_value},{"high",layer.m_higher_value},{"maxLayer",layer.m_max_value},{"remembered",layer.m_one_layer_value},{"singleLayer",layer.m_is_one_layer},{"active",layer.m_selection==ssLower?"low":"high"},{"move",moves.m_higher_value},{"maxMove",moves.m_max_value}});
 }std::cout<<out.dump(2)<<"\\n";}
'''
cpp=header+functions+footer
file=stage/'tests/fixtures/native-preview-slider-reference.cpp';file.write_text(cpp)
states=[dict(low=0,high=9,maxLayer=9,active='high',singleLayer=False,remembered=4,move=10,maxMove=10),dict(low=2,high=6,maxLayer=9,active='low',singleLayer=False,remembered=4,move=0,maxMove=10),dict(low=4,high=4,maxLayer=9,active='high',singleLayer=True,remembered=0,move=5,maxMove=10),dict(low=0,high=0,maxLayer=0,active='high',singleLayer=False,remembered=0,move=0,maxMove=0)]
cases=[]
for state in states:
 for action in ['arrowup','arrowdown','arrowleft','arrowright','home','end','singleLayer']:
  for amount in ([1,5]if action.startswith('arrow')else[1]):cases.append({'state':state,'action':{'action':action,'amount':amount}})
binary=stage/'slider-reference';subprocess.run(['clang++','-std=c++17',str(file),'-I'+str(source/'deps_src'),'-o',str(binary)],check=True)
result=subprocess.check_output([str(binary)],input=json.dumps(cases),text=True)
manifest={'commit':commit,'sources':{'IMSlider.cpp':hashlib.sha256(slider.encode()).hexdigest(),'GLCanvas3D.cpp':hashlib.sha256(canvas.encode()).hexdigest()},'cases':[{**case,'expected':expected}for case,expected in zip(cases,json.loads(result))]}
(stage/'tests/fixtures/native-preview-slider-reference.json').write_text(json.dumps(manifest,indent=2)+'\n');print(len(cases),'native reference cases')
