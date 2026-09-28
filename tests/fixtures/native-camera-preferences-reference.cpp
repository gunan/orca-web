// Pinned original mouse-action selection methods; synthetic input supplies wx event flags.
#include <nlohmann/json.hpp>
#include <map>
#include <iostream>
using json=nlohmann::json;
struct wxMouseEvent{int button;bool LeftIsDown()const{return button==0;}bool MiddleIsDown()const{return button==1;}bool RightIsDown()const{return button==2;}bool Dragging()const{return true;}bool Moving()const{return false;}bool AltDown()const{return false;}bool ShiftDown()const{return false;}};
struct GLCanvas3D{bool m_is_touchpad_navigation=false;
enum class MouseButton { None, Left, Middle, Right };
enum class MouseAction { None, Pan, Rotation };
 bool clicked_button_matches_action(const wxMouseEvent&,MouseAction,const std::map<MouseButton,MouseAction>&)const;
 bool is_camera_rotate(const wxMouseEvent&,const std::map<MouseButton,MouseAction>&)const;
 bool is_camera_pan(const wxMouseEvent&,const std::map<MouseButton,MouseAction>&)const;
};
bool GLCanvas3D::clicked_button_matches_action(const wxMouseEvent& evt, const MouseAction action, const std::map<MouseButton, MouseAction>& mappings) const
{
    MouseButton clicked = MouseButton::None;
    if (evt.LeftIsDown()) {
        clicked = MouseButton::Left;
    }
    if (evt.MiddleIsDown()) {
        clicked = MouseButton::Middle;
    }
    if (evt.RightIsDown()) {
        clicked = MouseButton::Right;
    }

    auto it = mappings.find(clicked);
    if (it == mappings.end()) {
        return false;
    }
    return it->second == action;
}
bool GLCanvas3D::is_camera_rotate(const wxMouseEvent& evt, const std::map<MouseButton, MouseAction>& mappings) const
{
    if (m_is_touchpad_navigation) {
        return evt.Moving() && evt.AltDown() && !evt.ShiftDown();
    } else {
        return evt.Dragging() && clicked_button_matches_action(evt, MouseAction::Rotation, mappings);
    }
}
bool GLCanvas3D::is_camera_pan(const wxMouseEvent& evt, const std::map<MouseButton, MouseAction>& mappings) const
{
    if (m_is_touchpad_navigation) {
        return evt.Moving() && evt.ShiftDown() && !evt.AltDown();
    } else {
        return evt.Dragging() && clicked_button_matches_action(evt, MouseAction::Pan, mappings);
        ;
    }
}
int main(){using B=GLCanvas3D::MouseButton;using A=GLCanvas3D::MouseAction;GLCanvas3D canvas;json result=json::array();for(int left=0;left<3;left++)for(int middle=0;middle<3;middle++)for(int right=0;right<3;right++){std::map<B,A> mapping={{B::Left,A(left)},{B::Middle,A(middle)},{B::Right,A(right)}};for(int button=0;button<3;button++){wxMouseEvent evt{button};result.push_back({{"mapping",{left,middle,right}},{"button",button},{"action",canvas.is_camera_rotate(evt,mapping)?"rotate":canvas.is_camera_pan(evt,mapping)?"pan":"none"}});}}std::cout<<result.dump();}
