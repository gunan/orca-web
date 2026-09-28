from pathlib import Path
import sys,subprocess,json,hashlib
source=Path(sys.argv[1]).resolve();root=Path(__file__).resolve().parents[2];commit='8500fcdccaa10b5099ac20d252af3a7c560046f1';paths=['src/slic3r/GUI/GLCanvas3D.cpp','src/slic3r/GUI/GLCanvas3D.hpp','src/slic3r/GUI/Preferences.cpp','src/libslic3r/AppConfig.cpp','src/slic3r/GUI/Widgets/SpinInput.cpp'];assert subprocess.check_output(['git','-C',str(source),'rev-parse','HEAD'],text=True).strip()==commit;subprocess.run(['git','-C',str(source),'diff','--exit-code',commit,'--',*paths],check=True)
native=(source/paths[0]).read_text();header=(source/paths[1]).read_text()
def body(text,signature):
 start=text.index(signature);i=text.index('{',start)+1;depth=1
 while depth:depth+=(text[i]=='{')-(text[i]=='}');i+=1
 return text[start:i]
cap=body(native,'int GLCanvas3D::_get_effective_fps_cap() const');stats=body(header,'class RenderStats')+';';start=native.index('    const int fps_cap = _get_effective_fps_cap();');end=native.index('    _refresh_if_shown_on_screen();',start);pacing=native[start:end]
cpp='''// Original cap parsing, pacing block and RenderStats class; deterministic clocks replace wall time.
#include <chrono>
#include <cmath>
#include <algorithm>
#include <string>
#include <iostream>
#include <nlohmann/json.hpp>
using json=nlohmann::json;
long long clock_ms=1000000;
namespace std::chrono{struct TestClock{using rep=long long;using period=std::milli;using duration=std::chrono::duration<rep,period>;using time_point=std::chrono::time_point<TestClock>;static constexpr bool is_steady=true;static time_point now(){return time_point(duration(clock_ms));}};}
#define high_resolution_clock TestClock
'''+stats+'''
#undef high_resolution_clock
struct Config{std::string raw;std::string get(std::string)const{return raw;}}config;
struct App{Config* app_config=&config;}app;
App& wxGetApp(){return app;}
#define SETTING_OPENGL_FPS_CAP "opengl_fps_cap"
struct GLCanvas3D{int wait_ms=0;std::chrono::TestClock::time_point m_last_frame_start_time;int _get_effective_fps_cap()const;void schedule_extra_frame(int ms){wait_ms=ms;}struct Event{void RequestMore(){}}evt;void tick();};
'''+cap+'''
#define steady_clock TestClock
void GLCanvas3D::tick(){wait_ms=0;
'''+pacing+'''
}
#undef steady_clock
int main(){json result;GLCanvas3D canvas;for(const auto* raw:{"0","1","30","240","999","-5","30abc","  +60.9","garbage","2147483647","2147483648","-2147483649"," 30","1e2"}){config.raw=raw;result["caps"].push_back({{"input",raw},{"output",canvas._get_effective_fps_cap()}});}RenderStats stats;for(auto t:{1000000,1000100,1001000,1001001,1003001,1003002,1004002}){clock_ms=t;result["frames"].push_back({{"time",t},{"fps",stats.get_fps_and_reset_if_needed()}});stats.increment_fps_counter();}config.raw="30";for(auto t:{1000000,1000001,1000033,1000034,1000067,1000074,1001000}){clock_ms=t;canvas.tick();result["pacing"].push_back({{"time",t},{"wait",canvas.wait_ms}});}std::cout<<result.dump();}
'''
file=root/'tests/fixtures/native-graphics-preferences-reference.cpp';file.write_text(cpp);build=Path(sys.argv[2]).resolve();build.mkdir(parents=True,exist_ok=True);binary=build/'native-graphics-preferences-reference';subprocess.run(['clang++','-std=c++17','-O2','-I'+str(source/'deps_src'),str(file),'-o',str(binary)],check=True)
hash=lambda p:hashlib.sha256(p.read_bytes()).hexdigest();out={'commit':commit,'sourceSha256':{p:hash(source/p) for p in paths},'generatorSha256':hash(Path(__file__)),'referenceSha256':hash(file),'binarySha256':hash(binary),**json.loads(subprocess.check_output([str(binary)]))};(root/'tests/fixtures/native-graphics-preferences-reference.json').write_text(json.dumps(out,indent=2)+'\n');print('Compiled original FPS parsing, frame pacing and frame-counter reference.')
