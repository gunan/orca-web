// Original Orca 2.4.2 compatibility predicates and boolean-only parser.
// The generated predicates differ only in diagnostic routing; tests separately
// link the unchanged functions from original Preset.cpp as a reference.
#include "native-compatibility-predicates.hpp"
#include <boost/algorithm/string/trim.hpp>
namespace WorkerCompatibility {
static std::string text(const json& value, const char* field, size_t maximum = 1000) {
    if (!value.is_string() || value.get_ref<const std::string&>().size() > maximum) throw std::runtime_error(std::string("Invalid compatibility ") + field);
    return value.get<std::string>();
}
static std::vector<std::string> strings(const json& value, const char* field) {
    if (!value.is_array() || value.size() > 10000) throw std::runtime_error(std::string("Invalid compatibility ") + field);
    std::vector<std::string> result;
    for (const auto& item : value) result.push_back(text(item,field));
    return result;
}
static const VendorProfile* metadata(Preset& value, const json& meta, std::map<std::string,VendorProfile>& vendors) {
    if (!meta.is_object() || meta.size() > 16) throw std::runtime_error("Invalid compatibility metadata");
    const auto vendor_name = text(meta.value("vendor",json("")),"vendor");
    auto& vendor = vendors[vendor_name]; vendor.name = vendor_name;
    value.vendor = vendor_name.empty() ? nullptr : &vendor;
    value.is_system = meta.value("isSystem",true);
    if (meta.contains("parent")) value.inherits() = text(meta.at("parent"),"parent");
    value.alias = meta.contains("alias") ? text(meta.at("alias"),"alias") : "";
    // PresetBundle.cpp:5083–5101; use native trim semantics and preserve the
    // original name if the explicit/derived alias is empty.
    if (value.alias.empty()) {
        const auto end_pos=value.name.find_first_of("@");
        if (end_pos!=std::string::npos) { value.alias=value.name.substr(0,end_pos);boost::trim_right(value.alias); }
    }
    if(value.alias.empty())value.alias=value.name;
    if (meta.contains("excludedFrom")) { auto excluded = strings(meta.at("excludedFrom"),"excluded printers"); value.m_excluded_from = std::set<std::string>(excluded.begin(),excluded.end()); }
    for (const auto* key : {"compatible_printers","compatible_prints"}) if (meta.contains(key)) value.config.set_key_value(key,new ConfigOptionStrings(strings(meta.at(key),key)));
    for (const auto* key : {"compatible_printers_condition","compatible_prints_condition"}) if (meta.contains(key)) value.config.set_key_value(key,new ConfigOptionString(text(meta.at(key),key,16384)));
    return value.vendor;
}
static Preset candidate(const json& input, std::map<std::string,VendorProfile>& vendors) {
    const auto scope = input.at("type").get<std::string>();
    if (scope != "process" && scope != "filament") throw std::runtime_error("Compatibility candidate must be process or filament");
    Preset value(scope == "process" ? Preset::TYPE_PRINT : Preset::TYPE_FILAMENT,text(input.at("name"),"name"));
    metadata(value,input,vendors); return value;
}
static json evaluate(const Preset& value, const Preset& printer, const Preset* process = nullptr) {
    diagnostics.clear();
    const PresetWithVendorProfile candidate(value,value.vendor), machine(printer,printer.vendor);
#ifdef ORCA_COMPATIBILITY_REFERENCE
    const bool printer_ok = Slic3r::is_compatible_with_printer(candidate,machine);
    const bool process_ok = !process || value.type != Preset::TYPE_FILAMENT || (printer_ok && Slic3r::is_compatible_with_print(candidate,PresetWithVendorProfile(*process,process->vendor),machine));
#else
    const bool printer_ok = worker_is_compatible_with_printer(candidate,machine);
    const bool process_ok = !process || value.type != Preset::TYPE_FILAMENT || (printer_ok && worker_is_compatible_with_print(candidate,PresetWithVendorProfile(*process,process->vendor),machine));
#endif
    return {{"compatible",printer_ok && process_ok},{"printerCompatible",printer_ok},{"processCompatible",process_ok},{"diagnostics",diagnostics}};
}
struct LibraryRegistry : PresetCollection {
    LibraryRegistry() : PresetCollection(Preset::TYPE_FILAMENT,{},static_cast<const PrintRegionConfig&>(FullPrintConfig::defaults())) {}
    using PresetCollection::update_library_profile_excluded_from;
};
static json exclusions(const json& candidates) {
    if (!candidates.is_array() || candidates.size() > 12000) throw std::runtime_error("Compatibility registry exceeds12000 entries");
    LibraryRegistry registry; std::map<std::string,VendorProfile> vendors; std::set<std::string> ids; std::map<std::string,std::string> names;
    for (const auto& input : candidates) {
        if (input.at("type") != "filament") throw std::runtime_error("Library registry requires filaments");
        const auto id = text(input.at("id"),"ID");
        if (id.empty() || !ids.insert(id).second) throw std::runtime_error("Duplicate compatibility ID");
        auto value = candidate(input,vendors);
        if (!names.emplace(value.name,id).second) throw std::runtime_error("Duplicate native material name in compatibility registry");
        // Original names preserve native collection ordering, including the
        // Generic prefix special case and last-alias precedence.
        auto& stored = registry.load_preset("",value.name,std::move(value.config),false);
        stored.vendor = value.vendor; stored.alias = value.alias;
    }
    registry.update_library_profile_excluded_from();
    json result = json::object();
    for (const auto& value : registry.get_presets()) if (!value.m_excluded_from.empty()) result[names.at(value.name)] = value.m_excluded_from;
    return result;
}
static json evaluate_request(const json& request, const worker_fs::path& dir) {
    const auto& candidates=request.at("candidates");
    if (!candidates.is_array() || candidates.size() > 512) throw std::runtime_error("Compatibility batch exceeds512 entries");
    PresetBundle bundle; std::map<std::string,VendorProfile> vendors;
    const auto& printer_input=request.at("printer");
    auto printer=preset(printer_input,Preset::TYPE_PRINTER,bundle.printers.default_preset().config,dir);
    metadata(printer,printer_input.value("metadata",json::object()),vendors);
    // Catalog inspection accepts already-validated hardware edits through the
    // same active-variant path used by ordinary native configuration resolution.
    DynamicPrintConfig context;context.apply(FullPrintConfig::defaults());context.apply(printer.config);
    if (printer_input.contains("overrides")) context.apply(loaded(printer_input.at("overrides"),dir));
    apply_overrides(printer,printer_input,context,0,dir);
    Preset process(Preset::TYPE_PRINT,"");
    if (request.contains("process")) {
        process=preset(request.at("process"),Preset::TYPE_PRINT,bundle.prints.default_preset().config,dir);
        metadata(process,request.at("process").value("metadata",json::object()),vendors);
        apply_overrides(process,request.at("process"),context,0,dir);
    }
    json result=json::array(); std::set<std::string> ids;
    for (const auto& input : candidates) {
        const auto id=text(input.at("id"),"ID");if(id.empty()||!ids.insert(id).second)throw std::runtime_error("Duplicate compatibility ID");
        const auto value=candidate(input,vendors);
        auto item=evaluate(value,printer,request.contains("process")?&process:nullptr);item["id"]=id;result.push_back(item);
    }
    return result;
}
}
