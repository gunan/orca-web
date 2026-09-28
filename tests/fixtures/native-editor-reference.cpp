// Pinned original OrcaSlicer 2.4.2 editor algorithms, AGPL-3.0-or-later.
#include <nlohmann/json.hpp>
#include <iostream>
#include <vector>
#include <map>
#include <cmath>
#include <algorithm>
#include <string>
#include <cstdio>
using json=nlohmann::json;
constexpr double PI=3.141592653589793238;template<class T>T sqr(T x){return x*x;}
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
static int find_close_layer_idx(const std::vector<double> &zs, double &z, double eps)
{
    if (zs.empty()) return -1;
    auto it_h = std::lower_bound(zs.begin(), zs.end(), z);
    if (it_h == zs.end()) {
        auto it_l = it_h;
        --it_l;
        if (z - *it_l < eps) return int(zs.size() - 1);
    } else if (it_h == zs.begin()) {
        if (*it_h - z < eps) return 0;
    } else {
        auto it_l = it_h;
        --it_l;
        double dist_l = z - *it_l;
        double dist_h = *it_h - z;
        if (std::min(dist_l, dist_h) < eps) { return (dist_l < dist_h) ? int(it_l - zs.begin()) : int(it_h - zs.begin()); }
    }
    return -1;
}
constexpr double epsilon() { return 0.0011; }
struct PrintEstimatedStatistics{enum class ETimeMode{Normal,Stealth};struct Mode{float time;};std::vector<Mode>modes;std::map<size_t,double>total_volumes_per_extruder,model_volumes_per_extruder;};
struct GCodeProcessorResult{PrintEstimatedStatistics print_statistics;};
struct GCodeProcessor{GCodeProcessorResult result;const auto&get_result()const{return result;}bool is_stealth_time_estimator_enabled()const{return result.print_statistics.modes.size()>1;}};
struct Extruder{size_t index;double diameter,density,cost;size_t id()const{return index;}double filament_diameter()const{return diameter;}double filament_density()const{return density;}double filament_cost()const{return cost;}};
struct PrintConfig{struct Float{double value;double getFloat()const{return value;}}time_cost;};
struct PrintStatistics{std::string estimated_normal_print_time,estimated_silent_print_time;double total_extruded_volume,total_used_filament,total_weight,total_cost;std::map<size_t,double>filament_stats;};
    static void update_print_estimated_stats(const GCodeProcessor& processor, const std::vector<Extruder>& extruders, PrintStatistics& print_statistics, const PrintConfig& config)
    {
        const GCodeProcessorResult& result = processor.get_result();
        double normal_print_time = result.print_statistics.modes[static_cast<size_t>(PrintEstimatedStatistics::ETimeMode::Normal)].time;
        print_statistics.estimated_normal_print_time = get_time_dhms(normal_print_time);
        print_statistics.estimated_silent_print_time = processor.is_stealth_time_estimator_enabled() ?
            get_time_dhms(result.print_statistics.modes[static_cast<size_t>(PrintEstimatedStatistics::ETimeMode::Stealth)].time) : "N/A";

        // update filament statictics
        double total_extruded_volume = 0.0;
        double total_used_filament   = 0.0;
        double total_weight          = 0.0;
        double total_cost            = 0.0;

        for (auto volume : result.print_statistics.total_volumes_per_extruder) {
            total_extruded_volume += volume.second;

            size_t extruder_id = volume.first;
            auto extruder = std::find_if(extruders.begin(), extruders.end(), [extruder_id](const Extruder& extr) {return extr.id() == extruder_id; });
            if (extruder == extruders.end())
                continue;

            double s = PI * sqr(0.5* extruder->filament_diameter());
            double weight = volume.second * extruder->filament_density() * 0.001;
            total_used_filament += volume.second/s;
            total_weight        += weight;
            total_cost          += weight * extruder->filament_cost() * 0.001;
        }

        total_cost += config.time_cost.getFloat() * (normal_print_time/3600.0);

        print_statistics.total_extruded_volume = total_extruded_volume;
        print_statistics.total_used_filament   = total_used_filament;
        print_statistics.total_weight          = total_weight;
        print_statistics.total_cost            = total_cost;

        print_statistics.filament_stats = result.print_statistics.model_volumes_per_extruder;
    }
namespace libvgcode{enum class EViewType{FeatureType,ColorPrint,Width};}
struct Preview{struct Viewer{int count=0;int get_used_extruders_count()const{return count;}}m_viewer;int m_last_extruder_count_default_applied=0,m_view_type_sel=0;libvgcode::EViewType view=libvgcode::EViewType::Width;std::vector<libvgcode::EViewType>view_type_items{libvgcode::EViewType::FeatureType,libvgcode::EViewType::ColorPrint,libvgcode::EViewType::Width};void set_view_type(libvgcode::EViewType value){view=value;}void load(){
    int current_count = m_viewer.get_used_extruders_count();
    if (current_count > 1) {
        if (m_last_extruder_count_default_applied != 2) {
            auto it = std::find(view_type_items.begin(), view_type_items.end(), libvgcode::EViewType::ColorPrint);
            if (it != view_type_items.end())
                m_view_type_sel = std::distance(view_type_items.begin(), it);
            set_view_type(libvgcode::EViewType::ColorPrint);
            m_last_extruder_count_default_applied = 2;
        }
    } else {
        if (m_last_extruder_count_default_applied != 1) {
            auto it = std::find(view_type_items.begin(), view_type_items.end(), libvgcode::EViewType::FeatureType);
            if (it != view_type_items.end())
                m_view_type_sel = std::distance(view_type_items.begin(), it);
            set_view_type(libvgcode::EViewType::FeatureType);
            m_last_extruder_count_default_applied = 1;
        }
    }
}};
int main(){json in;std::cin>>in;json out;GCodeProcessor processor;const auto&data=in["data"],context=in["context"];
 for(const auto&mode:data["modes"])processor.result.print_statistics.modes.push_back({mode["processorSeconds"].get<float>()});processor.result.print_statistics.total_volumes_per_extruder=data["materialStatistics"]["totalVolumes"].get<std::map<size_t,double>>();processor.result.print_statistics.model_volumes_per_extruder=data["materialStatistics"]["modelVolumes"].get<std::map<size_t,double>>();std::vector<Extruder>extruders;for(size_t i=0;i<context["filamentDiameters"].size();i++)extruders.push_back({i,context["filamentDiameters"][i],context["filamentDensities"][i],context["filamentCosts"][i]});PrintStatistics stats;PrintConfig config{{context["timeCost"]}};update_print_estimated_stats(processor,extruders,stats,config);out["summary"]={{"source","native-editor-formula"},{"filamentMm",stats.total_used_filament},{"filamentGrams",stats.total_weight},{"filamentMm3",stats.total_extruded_volume},{"cost",stats.total_cost},{"timeCost",config.time_cost.value}};
 std::vector<double>zs;for(const auto&layer:data["layers"])zs.push_back(layer["z"]);out["events"]=json::array();for(const auto&event:context["customEvents"]){double z=event["z"];int layer=find_close_layer_idx(zs,z,epsilon());json item={{"type",event["type"]},{"extruder",event["extruder"]},{"z",z},{"layer",layer+1},{"seconds",json::array()},{"labels",json::array()}};for(size_t mode=0;mode<data["modes"].size();mode++){float seconds=0;for(int i=0;i<layer;i++)seconds+=data["layers"][i]["seconds"][mode].get<float>();item["seconds"].push_back(seconds);item["labels"].push_back(short_time(get_time_dhms(seconds)));}out["events"].push_back(item);}
 out["smart"]=json::array();Preview preview;for(int count:{0,1,2,3,2,1,1}){preview.m_viewer.count=count;preview.load();out["smart"].push_back({count,preview.m_last_extruder_count_default_applied,int(preview.view)});preview.view=libvgcode::EViewType::Width;}
 out["times"]=json::array();for(float seconds:{0.f,.3f,1.f,59.9f,60.f,3599.f,3629.f,3630.f,86399.f,86400.f,90061.f})out["times"].push_back({seconds,short_time(get_time_dhms(seconds))});out["summaryTimeLabels"]=json::array();for(const auto&mode:processor.result.print_statistics.modes)out["summaryTimeLabels"].push_back(short_time(get_time_dhms(mode.time)));std::cout<<out.dump();}
