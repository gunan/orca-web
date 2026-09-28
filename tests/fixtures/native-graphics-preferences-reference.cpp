// Original cap parsing, pacing block and RenderStats class; deterministic clocks replace wall time.
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
class RenderStats
    {
    private:
        std::chrono::time_point<std::chrono::high_resolution_clock> m_measuring_start;
        int m_fps_out = -1;
        int m_fps_running = 0;
    public:
        void increment_fps_counter() { ++m_fps_running; }
        int get_fps() { return m_fps_out; }
        int get_fps_and_reset_if_needed() {
            auto cur_time = std::chrono::high_resolution_clock::now();
            int elapsed_ms = std::chrono::duration_cast<std::chrono::milliseconds>(cur_time-m_measuring_start).count();
            if (elapsed_ms > 1000  || m_fps_out == -1) {
                m_measuring_start = cur_time;
                m_fps_out = int (1000. * m_fps_running / elapsed_ms);
                m_fps_running = 0;
            }
            return m_fps_out;
        }

    };
#undef high_resolution_clock
struct Config{std::string raw;std::string get(std::string)const{return raw;}}config;
struct App{Config* app_config=&config;}app;
App& wxGetApp(){return app;}
#define SETTING_OPENGL_FPS_CAP "opengl_fps_cap"
struct GLCanvas3D{int wait_ms=0;std::chrono::TestClock::time_point m_last_frame_start_time;int _get_effective_fps_cap()const;void schedule_extra_frame(int ms){wait_ms=ms;}struct Event{void RequestMore(){}}evt;void tick();};
int GLCanvas3D::_get_effective_fps_cap() const
{
    if (wxGetApp().app_config == nullptr)
        return 0;

    int fps_cap = 0;
    try {
        fps_cap = std::stoi(wxGetApp().app_config->get(SETTING_OPENGL_FPS_CAP));
    }
    catch (...) {
        fps_cap = 0;
    }

    fps_cap = std::max(0, std::min(fps_cap, 240));

    return fps_cap;
}
#define steady_clock TestClock
void GLCanvas3D::tick(){wait_ms=0;
    const int fps_cap = _get_effective_fps_cap();
    if (fps_cap > 0) {
        const auto now = std::chrono::steady_clock::now();
        const auto min_frame_time = std::chrono::duration<double>(1.0 / static_cast<double>(fps_cap));
        const auto elapsed = now - m_last_frame_start_time;
        if (elapsed < min_frame_time) {
            const int wait_ms = std::max(1, static_cast<int>(std::ceil(std::chrono::duration<double, std::milli>(min_frame_time - elapsed).count())));
            schedule_extra_frame(wait_ms);
            evt.RequestMore();
            return;
        }

        // Pace by frame-start interval so rendering time is part of the target budget.
        m_last_frame_start_time = now;
    }


}
#undef steady_clock
int main(){json result;GLCanvas3D canvas;for(const auto* raw:{"0","1","30","240","999","-5","30abc","  +60.9","garbage","2147483647","2147483648","-2147483649"," 30","1e2"}){config.raw=raw;result["caps"].push_back({{"input",raw},{"output",canvas._get_effective_fps_cap()}});}RenderStats stats;for(auto t:{1000000,1000100,1001000,1001001,1003001,1003002,1004002}){clock_ms=t;result["frames"].push_back({{"time",t},{"fps",stats.get_fps_and_reset_if_needed()}});stats.increment_fps_counter();}config.raw="30";for(auto t:{1000000,1000001,1000033,1000034,1000067,1000074,1001000}){clock_ms=t;canvas.tick();result["pacing"].push_back({{"time",t},{"wait",canvas.wait_ms}});}std::cout<<result.dump();}
