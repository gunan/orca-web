// Original OrcaSlicer 2.4.2 formatting functions and active Feature-row statements.
#include <nlohmann/json.hpp>
#include <iostream>
#include <string>
#include <map>
#include <cmath>
#include <cstdio>
using json=nlohmann::json;namespace GizmoObjectManipulation { constexpr double in_to_mm=25.4,oz_to_g=28.34952; }
using ExtrusionRole=int;struct Statistics {std::map<int,std::pair<double,double>>used_filaments_per_role;};
inline std::string short_time(const std::string &time)
{
    // Parse the dhms time format.
    int days = 0;
    int hours = 0;
    int minutes = 0;
    int seconds = 0;
    float f_seconds = 0.0;
    if (time.find('d') != std::string::npos)
        ::sscanf(time.c_str(), "%dd %dh %dm %ds", &days, &hours, &minutes, &seconds);
    else if (time.find('h') != std::string::npos)
        ::sscanf(time.c_str(), "%dh %dm %ds", &hours, &minutes, &seconds);
    else if (time.find('m') != std::string::npos)
        ::sscanf(time.c_str(), "%dm %ds", &minutes, &seconds);
    else if (time.find('s') != std::string::npos) {
        ::sscanf(time.c_str(), "%fs", &f_seconds);
        seconds = int(f_seconds);
    }
    // Round to full minutes.
    if (days + hours > 0 && seconds >= 30) {
        if (++minutes == 60) {
            minutes = 0;
            if (++hours == 24) {
                hours = 0;
                ++days;
            }
        }
    }
    // Format the dhm time.
    char buffer[64];
    if (days > 0)
        ::sprintf(buffer, "%dd%dh%dm", days, hours, minutes);
    else if (hours > 0)
        ::sprintf(buffer, "%dh%dm", hours, minutes);
    else if (minutes > 0)
        ::sprintf(buffer, "%dm%ds", minutes, (int)seconds);
    else if (seconds >= 1)
        ::sprintf(buffer, "%ds", (int)seconds);
    else if (f_seconds > 0 && f_seconds < 1)
        ::sprintf(buffer, "<1s");
    else if (seconds == 0)
        ::sprintf(buffer, "0s");
    return buffer;
}
inline std::string get_time_dhms(float time_in_secs)
{
    int days = (int)(time_in_secs / 86400.0f);
    time_in_secs -= (float)days * 86400.0f;
    int hours = (int)(time_in_secs / 3600.0f);
    time_in_secs -= (float)hours * 3600.0f;
    int minutes = (int)(time_in_secs / 60.0f);
    time_in_secs -= (float)minutes * 60.0f;

    char buffer[64];
    if (days > 0)
        ::sprintf(buffer, "%dd %dh %dm %ds", days, hours, minutes, (int)time_in_secs);
    else if (hours > 0)
        ::sprintf(buffer, "%dh %dm %ds", hours, minutes, (int)time_in_secs);
    else if (minutes > 0)
        ::sprintf(buffer, "%dm %ds", minutes, (int)time_in_secs);
    else if (time_in_secs > 1)
        ::sprintf(buffer, "%ds", (int)time_in_secs);
    else
        ::sprintf(buffer, "%fs", time_in_secs);

    return buffer;
}
static std::string format_compact_weight(double value_in_grams, bool imperial_units)
{
    char buffer[64];
    if (imperial_units) {
        ::sprintf(buffer, "%.2f oz", value_in_grams / GizmoObjectManipulation::oz_to_g);
        return buffer;
    }

    const double abs_value = value_in_grams < 0.0 ? -value_in_grams : value_in_grams;
    const char* unit = "g";
    double scaled_value = abs_value;
    if (scaled_value >= 1000000.0) {
        scaled_value /= 1000000.0;
        unit = "t";
    } else if (scaled_value >= 1000.0) {
        scaled_value /= 1000.0;
        unit = "kg";
    }

    ::sprintf(buffer, "%s%.2f%s", value_in_grams < 0.0 ? "-" : "", scaled_value, unit);
    return buffer;
}
struct TestViewer{Statistics m_print_statistics;json calculate(const json&input,bool imperial_units){m_print_statistics.used_filaments_per_role[1]={input.at("filamentMeters"),input.at("filamentGrams")};
    auto used_filament_per_role = [this, imperial_units](ExtrusionRole role) {
        auto it = m_print_statistics.used_filaments_per_role.find(role);
        if (it == m_print_statistics.used_filaments_per_role.end())
            return std::make_pair(0.0, 0.0);

        double koef        = imperial_units ? GizmoObjectManipulation::in_to_mm / 1000.0 : 1.0;
        double unit_conver = imperial_units ? GizmoObjectManipulation::oz_to_g : 1;
        return std::make_pair(it->second.first / koef, it->second.second / unit_conver);
    };
    auto format_distance = [imperial_units](float distance_mm) {
        char buffer[64];
        if (imperial_units) {
            ::sprintf(buffer, "%.2fin", distance_mm / GizmoObjectManipulation::in_to_mm);
        } else if (std::fabs(distance_mm) < 1000.0f) {
            ::sprintf(buffer, "%.0fmm", distance_mm);
        } else {
            ::sprintf(buffer, "%.2fm", distance_mm / 1000.0f);
        }
        return std::string(buffer);
    };
 char buffer[64];float time=input.at("seconds"),total=input.at("totalSeconds"),percent=total>0.f?time/total:0.f;json output;
 output["time"]=(time>0.0f)?short_time(get_time_dhms(time)):"";
 if(percent==0)::sprintf(buffer,"0");else percent>0.001?::sprintf(buffer,"%.1f",percent*100) : ::sprintf(buffer,"<0.1");output["percent"]=buffer;
 auto[model_used_filament_m,model_used_filament_g]=used_filament_per_role(1);
 ::sprintf(buffer,imperial_units?"%.2fin":"%.2fm",model_used_filament_m);output["length"]=buffer;
 output["weight"]=format_compact_weight(model_used_filament_g,imperial_units);
 output["distance"]=format_distance(input.at("distanceMm").get<float>());
 ::sprintf(buffer,imperial_units?"%.2f in":"%.2f m",input.at("filamentMm").get<double>()/(imperial_units?GizmoObjectManipulation::in_to_mm:1000.));output["summaryLength"]=buffer;
 output["summaryWeight"]=format_compact_weight(input.at("filamentGrams"),imperial_units);
 return output;}};
int main(){json input;std::cin>>input;TestViewer viewer;if(input.contains("fixed")){char buffer[512];::snprintf(buffer,sizeof(buffer),"%.*f",input.at("digits").get<int>(),input.at("fixed").get<double>());std::cout<<json(buffer).dump();}else std::cout<<json{{"metric",viewer.calculate(input,false)},{"imperial",viewer.calculate(input,true)}}.dump();}
