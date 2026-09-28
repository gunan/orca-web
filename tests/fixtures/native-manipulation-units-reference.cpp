// Original OrcaSlicer 2.4.2 methods; only GUI selection/edit dispatch is replaced by an output recorder.
#include <nlohmann/json.hpp>
#include <array>
#include <string>
#include <iostream>
using json=nlohmann::json;
struct Vec {std::array<double,3> values;Vec operator*(double factor)const{auto result=*this;for(auto&v:result.values)v*=factor;return result;}};
struct GizmoObjectManipulation {
 static const double in_to_mm,mm_to_in;bool m_imperial_units;
 Vec m_new_position,m_new_rotation,m_new_absolute_rotation,m_new_scale,m_new_size;
 Vec m_buffered_position,m_buffered_rotation,m_buffered_absolute_rotation,m_buffered_scale,m_buffered_size;
 struct Cache{bool valid;bool is_valid()const{return valid;}}m_cache;
 json edits=json::array();
 void change_position_value(int axis,double value){edits.push_back({{"key","position"},{"axis",axis},{"value",value}});}
 void change_rotation_value(int axis,double value){edits.push_back({{"key","rotation"},{"axis",axis},{"value",value}});}
 void change_absolute_rotation_value(int axis,double value){edits.push_back({{"key","absolute_rotation"},{"axis",axis},{"value",value}});}
 void change_scale_value(int axis,double value){edits.push_back({{"key","scale"},{"axis",axis},{"value",value}});}
 void change_size_value(int axis,double value){edits.push_back({{"key","size"},{"axis",axis},{"value",value}});}
 void update_buffered_value();void on_change(const std::string&,int,double);
};
const double GizmoObjectManipulation::in_to_mm = 25.4;
const double GizmoObjectManipulation::mm_to_in = 0.0393700787;
void GizmoObjectManipulation::update_buffered_value()
{
    if (this->m_imperial_units)
        m_buffered_position = this->m_new_position * this->mm_to_in;
    else
        m_buffered_position = this->m_new_position;

    m_buffered_rotation = this->m_new_rotation;
    m_buffered_absolute_rotation = this->m_new_absolute_rotation;
    m_buffered_scale = this->m_new_scale;

    if (this->m_imperial_units)
        m_buffered_size = this->m_new_size * this->mm_to_in;
    else
        m_buffered_size = this->m_new_size;
}
void GizmoObjectManipulation::on_change(const std::string &opt_key, int axis, double new_value)
{
    if (!m_cache.is_valid())
        return;

    if (m_imperial_units && (opt_key == "position" || opt_key == "size"))
        new_value *= in_to_mm;

    if (opt_key == "position")
        change_position_value(axis, new_value);
    else if (opt_key == "rotation")
        change_rotation_value(axis, new_value);
    else if (opt_key == "absolute_rotation")
        change_absolute_rotation_value(axis, new_value);
    else if (opt_key == "scale")
        change_scale_value(axis, new_value);
    else if (opt_key == "size")
        change_size_value(axis, new_value);
}
int main(){json input;std::cin>>input;GizmoObjectManipulation tool;tool.m_imperial_units=input.at("imperial");tool.m_cache.valid=input.value("valid",true);
 tool.m_new_position.values=input.at("position");tool.m_new_rotation.values=input.at("rotation");tool.m_new_absolute_rotation.values=input.at("absolute_rotation");tool.m_new_scale.values=input.at("scale");tool.m_new_size.values=input.at("size");tool.update_buffered_value();
 for(auto&e:input.at("edits"))tool.on_change(e.at("key"),e.at("axis"),e.at("value"));
 std::cout<<json{{"position",tool.m_buffered_position.values},{"rotation",tool.m_buffered_rotation.values},{"absolute_rotation",tool.m_buffered_absolute_rotation.values},{"scale",tool.m_buffered_scale.values},{"size",tool.m_buffered_size.values},{"edits",tool.edits}}.dump();}
