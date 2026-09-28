// Original all-plate accumulation/conversion blocks, Orca2.4.2 AGPL.
#include <nlohmann/json.hpp>
#include <iostream>
#include <vector>
#include <map>
#include <cmath>
#include <cstdio>
using json=nlohmann::json;constexpr double PI=3.141592653589793238;template<class T>T sqr(T x){return x*x;}
namespace GizmoObjectManipulation{constexpr double in_to_mm=25.4;}
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
struct PrintEstimatedStatistics{struct Mode{float time=0;};Mode modes[2];std::map<size_t,double>model_volumes_per_extruder,support_volumes_per_extruder,wipe_tower_volumes_per_extruder,flush_per_filament;};
struct PrintBase{};struct Print:PrintBase{struct Stats{double total_cost=0;}stats;const Stats&print_statistics()const{return stats;}};struct Result{PrintEstimatedStatistics print_statistics;};
struct Plate{Result result;Print print;std::vector<int>extruders;Result*get_slice_result(){return &result;}const auto&get_extruders(bool)const{return extruders;}void get_print(PrintBase**p,void*,void*){*p=&print;}};
struct PartPlateList{std::vector<Plate*>plates;const auto&get_nonempty_plate_list()const{return plates;}};struct Plater{PartPlateList list;std::vector<int>colors;PartPlateList&get_partplate_list(){return list;}const auto&get_extruders_colors()const{return colors;}};
struct App{Plater p;Plater*plater(){return &p;}};App application;App&wxGetApp(){return application;}
struct Viewer{struct NativeViewer{size_t mode=0;size_t get_time_mode()const{return mode;}}m_viewer;std::vector<float>diameters,densities;json calculate(bool imperial_units){auto&filament_diameters=diameters;auto&filament_densities=densities;
    std::map<int, double> model_volume_of_extruders_all_plates; // map<extruder_idx, volume>
    std::map<int, double> flushed_volume_of_extruders_all_plates; // map<extruder_idx, flushed volume>
    std::map<int, double> wipe_tower_volume_of_extruders_all_plates; // map<extruder_idx, flushed volume>
    std::map<int, double> support_volume_of_extruders_all_plates; // map<extruder_idx, flushed volume>
    std::vector<double> model_used_filaments_m_all_plates;
    std::vector<double> model_used_filaments_g_all_plates;
    std::vector<double> flushed_filaments_m_all_plates;
    std::vector<double> flushed_filaments_g_all_plates;
    std::vector<double> wipe_tower_used_filaments_m_all_plates;
    std::vector<double> wipe_tower_used_filaments_g_all_plates;
    std::vector<double> support_used_filaments_m_all_plates;
    std::vector<double> support_used_filaments_g_all_plates;
    float total_time_all_plates = 0.0f;
    float total_cost_all_plates = 0.0f;
    bool show_detailed_statistics_page = false;
    struct ColumnData {
        enum {
            Model = 1,
            Flushed = 2,
            WipeTower = 4,
            Support = 1 << 3,
        };
    };
    int displayed_columns = 0;
    auto get_used_filament_from_volume = [this, imperial_units, &filament_diameters, &filament_densities](double volume, int extruder_id) {
        double koef = imperial_units ? 1.0 / GizmoObjectManipulation::in_to_mm : 0.001;
        std::pair<double, double> ret = { koef * volume / (PI * sqr(0.5 * filament_diameters[extruder_id])),
                                            volume * filament_densities[extruder_id] * 0.001 };
        return ret;
    };        PartPlateList& plate_list = wxGetApp().plater()->get_partplate_list();
        for (auto plate : plate_list.get_nonempty_plate_list())
        {
            auto plate_print_statistics = plate->get_slice_result()->print_statistics;
            auto plate_extruders = plate->get_extruders(true);
            auto max_extruders_colors = wxGetApp().plater()->get_extruders_colors().size();
            for (size_t extruder_id : plate_extruders) {
                extruder_id -= 1;
                // Skip stale/overflow extruder indices (e.g. from object assignments that outlived a
                // filament-count change) so downstream per-extruder lookups stay in range. Ported
                // from BambuStudio (STUDIO-15763).
                if (extruder_id >= max_extruders_colors)
                    continue;
                if (plate_print_statistics.model_volumes_per_extruder.find(extruder_id) == plate_print_statistics.model_volumes_per_extruder.end())
                    model_volume_of_extruders_all_plates[extruder_id] += 0;
                else {
                    double model_volume = plate_print_statistics.model_volumes_per_extruder.at(extruder_id);
                    model_volume_of_extruders_all_plates[extruder_id] += model_volume;
                }
                if (plate_print_statistics.flush_per_filament.find(extruder_id) == plate_print_statistics.flush_per_filament.end())
                    flushed_volume_of_extruders_all_plates[extruder_id] += 0;
                else {
                    double flushed_volume = plate_print_statistics.flush_per_filament.at(extruder_id);
                    flushed_volume_of_extruders_all_plates[extruder_id] += flushed_volume;
                }
                if (plate_print_statistics.wipe_tower_volumes_per_extruder.find(extruder_id) == plate_print_statistics.wipe_tower_volumes_per_extruder.end())
                    wipe_tower_volume_of_extruders_all_plates[extruder_id] += 0;
                else {
                    double wipe_tower_volume = plate_print_statistics.wipe_tower_volumes_per_extruder.at(extruder_id);
                    wipe_tower_volume_of_extruders_all_plates[extruder_id] += wipe_tower_volume;
                }
                if (plate_print_statistics.support_volumes_per_extruder.find(extruder_id) == plate_print_statistics.support_volumes_per_extruder.end())
                    support_volume_of_extruders_all_plates[extruder_id] += 0;
                else {
                    double support_volume = plate_print_statistics.support_volumes_per_extruder.at(extruder_id);
                    support_volume_of_extruders_all_plates[extruder_id] += support_volume;
                }
            }
            const PrintEstimatedStatistics::Mode& plate_time_mode = plate_print_statistics.modes[static_cast<size_t>(m_viewer.get_time_mode())];
            total_time_all_plates += plate_time_mode.time;

            Print     *print;
            plate->get_print((PrintBase **) &print, nullptr, nullptr);
            total_cost_all_plates += print->print_statistics().total_cost;
        }

        for (auto it = model_volume_of_extruders_all_plates.begin(); it != model_volume_of_extruders_all_plates.end(); it++) {
            auto [model_used_filament_m, model_used_filament_g] = get_used_filament_from_volume(it->second, it->first);
            if (model_used_filament_m != 0.0 || model_used_filament_g != 0.0)
                displayed_columns |= ColumnData::Model;
            model_used_filaments_m_all_plates.push_back(model_used_filament_m);
            model_used_filaments_g_all_plates.push_back(model_used_filament_g);
        }
        for (auto it = flushed_volume_of_extruders_all_plates.begin(); it != flushed_volume_of_extruders_all_plates.end(); it++) {
            auto [flushed_filament_m, flushed_filament_g] = get_used_filament_from_volume(it->second, it->first);
            if (flushed_filament_m != 0.0 || flushed_filament_g != 0.0)
                displayed_columns |= ColumnData::Flushed;
            flushed_filaments_m_all_plates.push_back(flushed_filament_m);
            flushed_filaments_g_all_plates.push_back(flushed_filament_g);
        }
        for (auto it = wipe_tower_volume_of_extruders_all_plates.begin(); it != wipe_tower_volume_of_extruders_all_plates.end(); it++) {
            auto [wipe_tower_filament_m, wipe_tower_filament_g] = get_used_filament_from_volume(it->second, it->first);
            if (wipe_tower_filament_m != 0.0 || wipe_tower_filament_g != 0.0)
                displayed_columns |= ColumnData::WipeTower;
            wipe_tower_used_filaments_m_all_plates.push_back(wipe_tower_filament_m);
            wipe_tower_used_filaments_g_all_plates.push_back(wipe_tower_filament_g);
        }
        for (auto it = support_volume_of_extruders_all_plates.begin(); it != support_volume_of_extruders_all_plates.end(); it++) {
            auto [support_filament_m, support_filament_g] = get_used_filament_from_volume(it->second, it->first);
            if (support_filament_m != 0.0 || support_filament_g != 0.0)
                displayed_columns |= ColumnData::Support;
            support_used_filaments_m_all_plates.push_back(support_filament_m);
            support_used_filaments_g_all_plates.push_back(support_filament_g);
        }

json result={{"seconds",total_time_all_plates},{"cost",total_cost_all_plates},{"timeLabel",short_time(get_time_dhms(total_time_all_plates))},{"mask",displayed_columns},{"rows",json::array()}};size_t i=0;
for(const auto&entry:model_volume_of_extruders_all_plates){json row={{"tool",entry.first},{"amounts",json::object()}};float column_sum_m=0,column_sum_g=0;
if(displayed_columns & ColumnData::Model){row["amounts"]["model"]={model_used_filaments_m_all_plates[i],model_used_filaments_g_all_plates[i]};column_sum_m+=model_used_filaments_m_all_plates[i];column_sum_g+=model_used_filaments_g_all_plates[i];}
if(displayed_columns & ColumnData::Support){row["amounts"]["support"]={support_used_filaments_m_all_plates[i],support_used_filaments_g_all_plates[i]};column_sum_m+=support_used_filaments_m_all_plates[i];column_sum_g+=support_used_filaments_g_all_plates[i];}
if(displayed_columns & ColumnData::Flushed){row["amounts"]["flushed"]={flushed_filaments_m_all_plates[i],flushed_filaments_g_all_plates[i]};column_sum_m+=flushed_filaments_m_all_plates[i];column_sum_g+=flushed_filaments_g_all_plates[i];}
if(displayed_columns & ColumnData::WipeTower){row["amounts"]["tower"]={wipe_tower_used_filaments_m_all_plates[i],wipe_tower_used_filaments_g_all_plates[i]};column_sum_m+=wipe_tower_used_filaments_m_all_plates[i];column_sum_g+=wipe_tower_used_filaments_g_all_plates[i];}

row["total"]={column_sum_m,column_sum_g};result["rows"].push_back(row);i++;}return result;}};
int main(){json input;std::cin>>input;Viewer viewer;viewer.diameters=input["plates"][0]["data"]["filamentDiameters"].get<std::vector<float>>();viewer.densities=input["plates"][0]["data"]["filamentDensities"].get<std::vector<float>>();application.p.colors.resize(input["plates"][0]["data"]["toolsColors"].size());std::vector<Plate>plates(input["plates"].size());for(size_t i=0;i<plates.size();i++){auto&plate=plates[i];const auto&source=input["plates"][i],data=source["data"];const auto&stats=data["materialStatistics"];plate.extruders=source["extruders"].get<std::vector<int>>();plate.print.stats.total_cost=data["editorStatistics"]["cost"];auto&target=plate.result.print_statistics;target.model_volumes_per_extruder=stats["modelVolumes"].get<std::map<size_t,double>>();target.support_volumes_per_extruder=stats["supportVolumes"].get<std::map<size_t,double>>();target.wipe_tower_volumes_per_extruder=stats["towerVolumes"].get<std::map<size_t,double>>();target.flush_per_filament=stats["flushedVolumes"].get<std::map<size_t,double>>();for(const auto&mode:data["modes"])target.modes[mode["name"]=="normal"?0:1].time=mode["processorSeconds"];application.p.list.plates.push_back(&plate);}
json result;for(int mode=0;mode<2;mode++){viewer.m_viewer.mode=mode;result[mode?"stealth":"normal"]={{"metric",viewer.calculate(false)},{"imperial",viewer.calculate(true)}};}result["timeCases"]=json::array();for(float seconds:{0.f,.0000001f,.0000005f,.9999999f,59.9f,60.f,3599.f,3630.f,86399.f,86400.f,999999.f,9999999.f})result["timeCases"].push_back({seconds,short_time(get_time_dhms(seconds))});std::cout<<result.dump();}
