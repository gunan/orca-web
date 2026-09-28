// Original native press block, integer SetValue and onTimer arithmetic.
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
        delta = inc ? 1 : -1;
        SetValue(val + delta * step);
        text_ctrl->SetFocus();
        if (!btn->HasCapture())
            btn->CaptureMouse();
        delta *= 8;
        timer.Start(100);
        sendSpinEvent();
}};
void SpinInput::SetValue(int value)
{
    if (value < min) value = min;
    else if (value > max) value = max;
    this->val = value;
    text_ctrl->SetValue(wxString::FromDouble(value));
}
void SpinInput::onTimer(wxTimerEvent &evnet) {
    if (delta < -1 || delta > 1) {
        delta /= 2;
        return;
    }
    SetValue(val + delta * step);
    sendSpinEvent();
}
int main(){json out;for(int initial:{0,30,239,240})for(bool inc:{false,true}){SpinInput spin;spin.val=initial;spin.press(inc);json row={{"initial",initial},{"direction",inc?1:-1},{"interval",spin.timer.interval},{"samples",json::array()}};row["samples"].push_back({{"time",0},{"value",spin.val},{"events",spin.events.size()}});wxTimerEvent e;for(int n=1;n<=7;n++){spin.onTimer(e);row["samples"].push_back({{"time",n*100},{"value",spin.val},{"events",spin.events.size()}});}out.push_back(row);}std::cout<<out.dump();}
