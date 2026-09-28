// Pinned original OrcaSlicer2.4.2 model/asset lookup; AGPL-3.0-or-later.
#include <nlohmann/json.hpp>
#include <filesystem>
#include <iostream>
#include <string>
#include <vector>
#include <map>
#include <algorithm>
namespace boost{namespace filesystem{using path=std::filesystem::path;static bool exists(const path&p){return std::filesystem::exists(p);}}}
namespace Slic3r{
std::string data,resources;static std::string data_dir(){return data;}static std::string resources_dir(){return resources;}
struct ConfigOptionString{std::string value;};struct Config{ConfigOptionString model;template<class T>const ConfigOptionString*opt(const std::string&)const{return &model;}};
struct VendorProfile{struct PrinterModel{std::string id,name,hotend_model;};std::string id;std::vector<PrinterModel>models;};struct Preset{VendorProfile*vendor;Config config;};
struct PresetBundle{std::map<std::string,VendorProfile>vendors;std::string get_hotend_model_for_printer_model(std::string model_name);};
namespace PresetUtils{
const VendorProfile::PrinterModel* system_printer_model(const Preset &preset)
	{
		const VendorProfile::PrinterModel *out = nullptr;
		if (preset.vendor != nullptr) {
			auto *printer_model = preset.config.opt<ConfigOptionString>("printer_model");
			if (printer_model != nullptr && ! printer_model->value.empty()) {
				auto it = std::find_if(preset.vendor->models.begin(), preset.vendor->models.end(), [printer_model](const VendorProfile::PrinterModel &pm) { return pm.id == printer_model->value; });
				if (it != preset.vendor->models.end())
					out = &(*it);
			}
		}
		return out;
	}
std::string system_printer_hotend_model(const Preset& preset)
    {
        std::string out;
        const VendorProfile::PrinterModel* pm = PresetUtils::system_printer_model(preset);
        if (pm != nullptr && !pm->hotend_model.empty()) {
            out = Slic3r::data_dir() + "/vendor/" + preset.vendor->id + "/" + pm->hotend_model;
            if (!boost::filesystem::exists(boost::filesystem::path(out)))
                out = Slic3r::resources_dir() + "/profiles/" + preset.vendor->id + "/" + pm->hotend_model;
        }
        
        if (out.empty() ||!boost::filesystem::exists(boost::filesystem::path(out)))
            out = Slic3r::resources_dir() + "/profiles/hotend.stl";
        return out;
    }
}
std::string PresetBundle::get_hotend_model_for_printer_model(std::string model_name)
{
    std::string hotend_stl, vendor_name, out;

    for (auto vendor_profile: this->vendors)
    {
        for (auto vendor_model: vendor_profile.second.models)
        {
            if (vendor_model.name == model_name)
            {
                hotend_stl = vendor_model.hotend_model;
                vendor_name = vendor_profile.first;
                break;
            }
        }
    }

    if (!hotend_stl.empty())
    {
        out = Slic3r::data_dir() + "/vendor/" + vendor_name + "/" + hotend_stl;
        if (!boost::filesystem::exists(boost::filesystem::path(out)))
            out = Slic3r::resources_dir() + "/profiles/" + vendor_name + "/" + hotend_stl;
    }

    if (out.empty() ||!boost::filesystem::exists(boost::filesystem::path(out)))
        out = Slic3r::resources_dir() + "/profiles/hotend.stl";

    return out;
}
}
int main(){using namespace Slic3r;using json=nlohmann::json;json input;std::cin>>input;const std::string root=input["root"];data=root+"/data";resources=root+"/resources";PresetBundle b;for(const auto&m:input["models"]){const std::string vendor=m["vendor"];auto&v=b.vendors[vendor];v.id=vendor;v.models.push_back({m["id"],m["name"],m["hotendModel"]});}std::string result;if(input["system"]==true){Preset p{&b.vendors[input["vendor"].get<std::string>()],{{input["printerModel"].get<std::string>()}}};result=PresetUtils::system_printer_hotend_model(p);}else{std::string name=input["printerModel"];result=b.get_hotend_model_for_printer_model(name.empty()?"MyKlipper 0.4 nozzle":name);}std::cout<<json({{"path",std::filesystem::relative(result,root).generic_string()},{"exists",std::filesystem::exists(result)}}).dump();}
