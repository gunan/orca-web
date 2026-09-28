from pathlib import Path
import json,sys,subprocess,hashlib
root=Path(__file__).resolve().parents[2];source=Path(sys.argv[1]);build=Path(sys.argv[2]);commit='8500fcdccaa10b5099ac20d252af3a7c560046f1';path='src/slic3r/GUI/Widgets/SpinInput.cpp';assert subprocess.check_output(['git','-C',str(source),'rev-parse','HEAD'],text=True).strip()==commit;subprocess.run(['git','-C',str(source),'diff','--exit-code',commit,'--',path],check=True);native=(source/path).read_text()
def body(signature):
 start=native.index(signature);i=native.index('{',start)+1;depth=1
 while depth:depth+=(native[i]=='{')-(native[i]=='}');i+=1
 return native[start:i]
start=native.index('        delta = inc ? 1 : -1;');end=native.index('        sendSpinEvent();',start)+len('        sendSpinEvent();');press=native[start:end]
cpp='''// Original native press block, integer SetValue and onTimer arithmetic.
// GUI adapters record values; no claim about wx string parsing or native event delivery.
#include <iostream>
#include <vector>
#include <nlohmann/json.hpp>
using json=nlohmann::json;
struct wxTimerEvent{};struct wxString{static int FromDouble(int x){return x;}};
struct Text{void SetValue(int){}void SetFocus(){}};
struct Button{bool HasCapture(){return false;}void CaptureMouse(){}};
struct Timer{void Start(int value){interval=value;}int interval=0;};
struct SpinInput{int min=0,max=240,val=0,delta=0,step=1;Text text;Text* text_ctrl=&text;Timer timer;std::vector<int> events;void SetValue(int value);void onTimer(wxTimerEvent&);void sendSpinEvent(){events.push_back(val);}void press(bool inc){Button button;Button* btn=&button;
'''+press+'''\n}};
'''+body('void SpinInput::SetValue(int value)')+'\n'+body('void SpinInput::onTimer(wxTimerEvent &evnet)')+'''
int main(){json out;for(int initial:{0,30,239,240})for(bool inc:{false,true}){SpinInput spin;spin.val=initial;spin.press(inc);json row={{"initial",initial},{"direction",inc?1:-1},{"interval",spin.timer.interval},{"samples",json::array()}};row["samples"].push_back({{"time",0},{"value",spin.val},{"events",spin.events.size()}});wxTimerEvent e;for(int n=1;n<=7;n++){spin.onTimer(e);row["samples"].push_back({{"time",n*100},{"value",spin.val},{"events",spin.events.size()}});}out.push_back(row);}std::cout<<out.dump();}
'''
p=root/'tests/fixtures/native-preference-spin-reference.cpp';p.write_text(cpp);build.mkdir(parents=True,exist_ok=True);binary=build/'native-preference-spin-reference';subprocess.run(['clang++','-std=c++17','-O2','-I'+str(source/'deps_src'),str(p),'-o',str(binary)],check=True);sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest();data={'commit':commit,'sourceSha256':{path:sha(source/path)},'generatorSha256':sha(Path(__file__)),'referenceSha256':sha(p),'binarySha256':sha(binary),'cases':json.loads(subprocess.check_output([str(binary)]))};(root/'tests/fixtures/native-preference-spin-reference.json').write_text(json.dumps(data,indent=2)+'\n');print('Compiled native press/repeat/clamping reference:8 sequences,64 samples.')
