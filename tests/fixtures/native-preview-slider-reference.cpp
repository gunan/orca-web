// Generated from pinned original native methods; only GUI-owned accessors are stubbed.
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
void IMSlider::SetLowerValue(const int lower_val)
{
    m_lower_value = lower_val;
    correct_lower_value();
    set_as_dirty();
}
void IMSlider::SetHigherValue(const int higher_val)
{
    m_higher_value = higher_val;
    correct_higher_value();
    set_as_dirty();
}
void IMSlider::correct_lower_value()
{
    if (m_lower_value < m_min_value)
        m_lower_value = m_min_value;
    else if (m_lower_value > m_max_value)
        m_lower_value = m_max_value;

    if ((m_lower_value >= m_higher_value && m_lower_value <= m_max_value) || m_is_one_layer) m_higher_value = m_lower_value;
}
void IMSlider::correct_higher_value()
{
    if (m_higher_value > m_max_value)
        m_higher_value = m_max_value;
    else if (m_higher_value < m_min_value)
        m_higher_value = m_min_value;

    if ((m_higher_value <= m_lower_value && m_higher_value >= m_min_value) || m_is_one_layer) m_lower_value = m_higher_value;
}
bool IMSlider::switch_one_layer_mode()
{
    if (m_show_custom_gcode_window)
        return false;

    m_is_one_layer = !m_is_one_layer;
    if (!m_is_one_layer) {                       // DEACTIVATE
        m_one_layer_value = GetHigherValue();    // ORCA Backup value on deactivate
        SetLowerValue(m_min_value);
        SetHigherValue(m_max_value);             // Higher value resets on toggling off one layer mode to show whole model
    }else{                                       // ACTIVATE
                                                 // ORCA Ensure value fits range. value set in IMSlider::SetSelectionSpan but added this just in case
        if(!m_one_layer_value || m_one_layer_value > m_max_value || m_one_layer_value < m_min_value){
            m_one_layer_value = int((m_max_value - m_min_value)/2);
            SetHigherValue(m_one_layer_value);  
        }
        else if(GetHigherValue() == m_max_value) // ORCA Prefer backup value if higher value reseted
            SetHigherValue(m_one_layer_value);   // ORCA Restore value
        else                                     // ORCA Prefer higher value if user changed higher value. so it will show section on same view
            SetHigherValue(GetHigherValue());    // ORCA use same position with higher value if user changed its position. visible section stays same when switching one layer mode with this
    }
    if (m_selection == ssUndef) m_selection = ssHigher;
    set_as_dirty();
    return true;
}
int main(){json cases;std::cin>>cases;json out=json::array();for(const auto& test:cases){auto state=test.at("state");IMSlider layer,moves;layer.m_lower_value=state.at("low");layer.m_higher_value=state.at("high");layer.m_max_value=state.at("maxLayer");layer.m_one_layer_value=state.at("remembered");layer.m_is_one_layer=state.at("singleLayer");layer.m_selection=state.at("active")=="low"?ssLower:ssHigher;moves.m_higher_value=state.at("move");moves.m_max_value=state.at("maxMove");IMSlider *m_layers_slider=&layer,*m_moves_slider=&moves;Event evt{0,false,false};const std::string action=test.at("action").at("action");int amount=test.at("action").value("amount",1);evt.shift=amount==5;
 if(action=="singleLayer")layer.switch_one_layer_mode();
 else {evt.key=action=="arrowup"?WXK_UP:action=="arrowdown"?WXK_DOWN:action=="arrowleft"?WXK_LEFT:action=="arrowright"?WXK_RIGHT:action=="home"?WXK_HOME:WXK_END;const int keyCode=evt.GetKeyCode();
                        int increment = (evt.CmdDown() || evt.ShiftDown()) ? 5 : 1;
                        if ((evt.CmdDown() || evt.ShiftDown()) && evt.GetKeyCode() == 'G') {
                            m_layers_slider->show_go_to_layer(true);
                        }
                        else if (keyCode == WXK_UP || keyCode == WXK_DOWN) {
                            int new_pos;
                            if (m_layers_slider->GetSelection() == ssHigher) {
                                new_pos = keyCode == WXK_UP ? m_layers_slider->GetHigherValue() + increment : m_layers_slider->GetHigherValue() - increment;
                                m_layers_slider->SetHigherValue(new_pos);
                                m_moves_slider->SetHigherValue(m_moves_slider->GetMaxValue());
                            }
                            else if (m_layers_slider->GetSelection() == ssLower) {
                                new_pos = keyCode == WXK_UP ? m_layers_slider->GetLowerValue() + increment : m_layers_slider->GetLowerValue() - increment;
                                m_layers_slider->SetLowerValue(new_pos);
                            }
                        } else if (keyCode == WXK_LEFT) {
                            if (m_moves_slider->GetHigherValue() == m_moves_slider->GetMinValue() && (m_layers_slider->GetHigherValue() > m_layers_slider->GetMinValue())) {
                                m_layers_slider->SetHigherValue(m_layers_slider->GetHigherValue() - 1);
                                m_moves_slider->SetHigherValue(m_moves_slider->GetMaxValue());
                            } else {
                                m_moves_slider->SetHigherValue(m_moves_slider->GetHigherValue() - increment);
                            }
                        } else if (keyCode == WXK_RIGHT) {
                            if (m_moves_slider->GetHigherValue() == m_moves_slider->GetMaxValue() && (m_layers_slider->GetHigherValue() < m_layers_slider->GetMaxValue())) {
                                m_layers_slider->SetHigherValue(m_layers_slider->GetHigherValue() + 1);
                                m_moves_slider->SetHigherValue(m_moves_slider->GetMinValue());
                            } else {
                                m_moves_slider->SetHigherValue(m_moves_slider->GetHigherValue() + increment);
                            }
                        } else if (keyCode == WXK_HOME || keyCode == WXK_END) {
                            const int new_pos = keyCode == WXK_HOME ? m_moves_slider->GetMinValue() : m_moves_slider->GetMaxValue();
                            m_moves_slider->SetHigherValue(new_pos);
                            m_moves_slider->set_as_dirty();
                        }

                        if (m_layers_slider->is_dirty() && m_layers_slider->is_one_layer())
                            m_layers_slider->SetLowerValue(m_layers_slider->GetHigherValue());


 }
 out.push_back({{"low",layer.m_lower_value},{"high",layer.m_higher_value},{"maxLayer",layer.m_max_value},{"remembered",layer.m_one_layer_value},{"singleLayer",layer.m_is_one_layer},{"active",layer.m_selection==ssLower?"low":"high"},{"move",moves.m_higher_value},{"maxMove",moves.m_max_value}});
 }std::cout<<out.dump(2)<<"\n";}
