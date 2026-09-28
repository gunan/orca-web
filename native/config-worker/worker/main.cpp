// Read-only native preset configuration bridge. No GUI, presets directory writes, or printer I/O.
#include "libslic3r/PresetBundle.hpp"
#include "libslic3r/Utils.hpp"
#include <nlohmann/json.hpp>
#include <boost/log/core.hpp>
#include <filesystem>
#include <fstream>
#include <iostream>
#include <sys/resource.h>
namespace Slic3r { void extend_default_config_length(DynamicPrintConfig&, const bool, const DynamicPrintConfig&); }
using namespace Slic3r;
using json = nlohmann::json;
namespace worker_fs = std::filesystem;
static constexpr const char* Revision = "8500fcdccaa10b5099ac20d252af3a7c560046f1";
static size_t ordinal = 0;
static json reports = json::array();
static void bounded_values(const json& data) {
    if (!data.is_object() || data.size() > 2048) throw std::runtime_error("Preset settings must be a bounded object");
    for (const auto& [key, value] : data.items()) {
        if (key.size() > 128) throw std::runtime_error("Preset key exceeds its limit");
        const size_t limit = key == "flush_volumes_matrix" ? 262144 : 1024;
        if (value.is_array()) {
            if (value.size() > limit) throw std::runtime_error("Preset vector exceeds its limit");
            for (const auto& item : value) if (!item.is_string() || item.get_ref<const std::string&>().size() > 65536) throw std::runtime_error("Preset vector requires bounded native strings");
        } else if (!value.is_string() || value.get_ref<const std::string&>().size() > 65536) throw std::runtime_error("Preset values require native strings or string vectors");
    }
}
static DynamicPrintConfig loaded(const json& data, const worker_fs::path& dir, bool load_inherits = false, ForwardCompatibilitySubstitutionRule substitution_rule = ForwardCompatibilitySubstitutionRule::Enable) {
    bounded_values(data);
    const worker_fs::path file = dir / ("scope-" + std::to_string(ordinal++) + ".json");
    { std::ofstream stream(file); if (!stream) throw std::runtime_error("Cannot write isolated config input"); stream << data.dump(); }
    DynamicPrintConfig value;
    ConfigSubstitutionContext substitutions(substitution_rule);
    std::map<std::string,std::string> metadata;
    std::string reason;
    int status;
    try { status = value.load_from_json(file.string(), substitutions, load_inherits, metadata, reason); }
    catch (...) { worker_fs::remove(file); throw; }
    worker_fs::remove(file);
    if (status != 0 || !reason.empty()) throw std::runtime_error("Native preset deserialization failed: " + reason);
    if (!substitutions.unrecogized_keys.empty() || !substitutions.substitutions.empty())
        reports.push_back({{"unrecognized", substitutions.unrecogized_keys}, {"substitutions", substitutions.substitutions.size()}});
    return value;
}
static Preset preset(const json& input, Preset::Type type, const DynamicPrintConfig& defaults, const worker_fs::path& dir) {
    const std::string name = input.at("name").get<std::string>();
    if (name.empty() || name.size() > 1000) throw std::runtime_error("Invalid preset name");
    const auto& chain = input.at("chain");
    if (!chain.is_array() || chain.empty() || chain.size() > 64) throw std::runtime_error("Preset chain needs 1–64 entries");
    Preset result(type, name);
    result.config = defaults;
    // PresetBundle::load_config_bundle's system parse_subfile sequence. User-diff inheritance is a different method.
    for (size_t index = 0; index < chain.size(); ++index) {
        const auto& node = chain[index];
        const std::string vendor = input.contains("vendors") ? input.at("vendors").at(index).get<std::string>() : input.value("vendor", std::string());
        const auto config = loaded(node, dir), parent = result.config;
        result.config.apply(config);
        extend_default_config_length(result.config, true, parent);
        if (node.value("instantiation", std::string("true")) != "false" || vendor == "Template") Preset::normalize(result.config);
        const auto removed = Preset::remove_invalid_keys(result.config, parent);
        if (!removed.empty()) reports.push_back({{"removedMisplaced", removed}});
        if (node.contains("filament_id") && !node.at("filament_id").get<std::string>().empty()) result.filament_id = node.at("filament_id");
    }
    return result;
}
// Tab::switch_excluder uses the same native index and ConfigOptionVector::set_at
// used below. A web active-value edit changes that index, leaving inactive variants intact.
static void apply_overrides(Preset& preset, const json& input, DynamicPrintConfig& context, int filament_extruder, const worker_fs::path& dir) {
    if (!input.contains("overrides")) return;
    auto changes = loaded(input.at("overrides"), dir);
    const bool machine = preset.type == Preset::TYPE_PRINTER, process = preset.type == Preset::TYPE_PRINT;
    const auto& keys = machine ? printer_options_with_variant_1 : process ? print_options_with_variant : filament_options_with_variant;
    const std::string ids = machine ? "printer_extruder_id" : process ? "print_extruder_id" : "";
    const std::string variants = machine ? "printer_extruder_variant" : process ? "print_extruder_variant" : "filament_extruder_variant";
    auto diameters = context.option<ConfigOptionFloats>("nozzle_diameter");
    auto types = context.option<ConfigOptionEnumsGeneric>("extruder_type");
    auto volumes = context.option<ConfigOptionEnumsGeneric>("nozzle_volume_type");
    const size_t count = filament_extruder > 0 ? 1 : diameters->size();
    for (const auto& key : changes.keys()) {
        const size_t stride = machine && printer_options_with_variant_2.count(key) ? 2 : 1;
        auto source = changes.option(key);
        if (!keys.count(key) && stride == 1) { preset.config.set_key_value(key, source->clone()); continue; }
        auto target = dynamic_cast<ConfigOptionVectorBase*>(preset.config.option(key));
        auto incoming = dynamic_cast<const ConfigOptionVectorBase*>(source);
        if (!target || !incoming || !incoming->size()) throw std::runtime_error("Variant overrides require nonempty vectors");
        if (target->size() <= count * stride || incoming->size() == target->size()) { target->set(source); continue; }
        if (incoming->size() != count * stride) throw std::runtime_error("Variant override must specify all active values or the complete native variant vector: " + key);
        for (size_t index = 0; index < count; ++index) {
            const int physical = filament_extruder > 0 ? filament_extruder : static_cast<int>(index + 1);
            const int native_index = preset.config.get_index_for_extruder(physical, ids, ExtruderType(types->get_at(physical - 1)), NozzleVolumeType(volumes->get_at(physical - 1)), variants, stride);
            if (native_index < 0) throw std::runtime_error("Selected native extruder variant is unavailable for " + key);
            for (size_t component = 0; component < stride; ++component) target->set_at(source, native_index + component, index * stride + component);
        }
    }
}
static json serialize(const DynamicPrintConfig& config, const worker_fs::path& dir) {
    const auto file = dir / ("result-" + std::to_string(ordinal++) + ".json");
    config.save_to_json(file.string(), "project_settings", "user", "2.4.2");
    json value; { std::ifstream stream(file); stream >> value; }
    worker_fs::remove(file);
    return value;
}
#include "settings-clipboard.hpp"
#include "profile-editor.hpp"
#include "compatibility.hpp"
#include "user-preset.hpp"
int main(int argc, char** argv) {
    if (argc == 2 && std::string(argv[1]) == "--version") { std::cout << "OrcaConfigWorker-2.4.2 revision" << Revision << '\n'; return 0; }
    if (argc != 3) { std::cerr << "usage: orca-config-worker request.json output.json\n"; return 2; }
    try {
        boost::log::core::get()->set_logging_enabled(false);
        const rlimit cpu{30,30}, file_limit{16*1024*1024,16*1024*1024};
        setrlimit(RLIMIT_CPU, &cpu); setrlimit(RLIMIT_FSIZE, &file_limit);
        if (!worker_fs::is_regular_file(argv[1]) || worker_fs::file_size(argv[1]) > 8*1024*1024) throw std::runtime_error("Preset input exceeds 8 MiB");
        if (worker_fs::exists(argv[2])) throw std::runtime_error("Output file already exists");
        json request; { std::ifstream stream(argv[1]); stream >> request; }
        const auto dir = worker_fs::absolute(argv[2]).parent_path();
        json output = {{"sourceRevision", Revision}};
        if (request.value("operation",std::string()) == "paste-process-settings") {
            output["settingsClipboardVersion"] = 1;
            output["settings"] = paste_process_settings(request,dir);
        } else if (request.value("operation",std::string()) == "profile-editor-projection") {
            output["profileEditorVersion"] = 1;
            json source_indices = json::object();
            output["editorSettings"] = serialize(profile_editor_projection(request, dir, source_indices), dir);
            output["editorSourceIndices"] = source_indices;
        } else if (request.value("operation",std::string()) == "preset-compatibility") {
            output["compatibilityVersion"] = 1;
            output["compatibility"] = WorkerCompatibility::evaluate_request(request,dir);
        } else if (request.value("operation",std::string()) == "filament-library-exclusions") {
            output["compatibilityVersion"] = 1;
            output["exclusions"] = WorkerCompatibility::exclusions(request.at("candidates"));
        } else if (request.value("operation",std::string()) == "user-preset-projection") {
            output["userPresetVersion"] = 1;
            output["userPreset"] = user_preset_projection(request,dir);
        } else if (request.contains("operation")) { throw std::runtime_error("Unsupported configuration operation");
        } else if (request.contains("embeddedSettings")) {
            auto config = loaded(request.at("embeddedSettings"), dir);
            config.update_values_to_printer_extruders(config, printer_options_with_variant_1, "printer_extruder_id", "printer_extruder_variant");
            config.update_values_to_printer_extruders(config, printer_options_with_variant_2, "printer_extruder_id", "printer_extruder_variant", 2);
            config.update_values_to_printer_extruders(config, print_options_with_variant, "print_extruder_id", "print_extruder_variant");
            config.update_values_to_printer_extruders_for_multiple_filaments(config, filament_options_with_variant, "filament_self_index", "filament_extruder_variant");
            output["effectiveSettings"] = serialize(config, dir);
        } else {
            const auto compatibility_policy=request.value("compatibilityPolicy",std::string("enforce"));
            if(compatibility_policy!="enforce" && compatibility_policy!="inspect")throw std::runtime_error("Invalid native compatibility policy");
            output["compatibilityPolicy"]=compatibility_policy;
            PresetBundle bundle;
            auto printer = preset(request.at("printer"), Preset::TYPE_PRINTER, bundle.printers.default_preset().config, dir);
            auto process = preset(request.at("process"), Preset::TYPE_PRINT, bundle.prints.default_preset().config, dir);
            const auto& materials = request.at("filaments");
            if (!materials.is_array() || materials.empty() || materials.size() > 64) throw std::runtime_error("Choose 1–64 materials");
            auto project = loaded(request.value("project", json::object()), dir);
            DynamicPrintConfig context; context.apply(FullPrintConfig::defaults()); context.apply(printer.config); context.apply(project);
            // Hardware settings are needed before choosing active variant indices.
            if (request.at("printer").contains("overrides")) {
                auto hardware = loaded(request.at("printer").at("overrides"), dir);
                for (const auto& key : hardware.keys()) if (!printer_options_with_variant_1.count(key) && !printer_options_with_variant_2.count(key)) context.set_key_value(key, hardware.option(key)->clone());
            }
            apply_overrides(printer, request.at("printer"), context, 0, dir);
            apply_overrides(process, request.at("process"), context, 0, dir);
            auto maps = context.option<ConfigOptionInts>("filament_map");
            std::vector<Preset> filaments;
            json scopes = {{"printer", serialize(printer.config, dir)}, {"process", serialize(process.config, dir)}, {"filaments", json::array()}};
            std::vector<std::string> names, ids;
            for (const auto& material : materials) {
                filaments.push_back(preset(material, Preset::TYPE_FILAMENT, bundle.filaments.default_preset().config, dir));
                apply_overrides(filaments.back(), material, context, maps->get_at(filaments.size() - 1), dir);
                scopes["filaments"].push_back(serialize(filaments.back().config, dir));
                names.push_back(filaments.back().name); ids.push_back(filaments.back().filament_id);
            }
            std::map<std::string,VendorProfile> compatibility_vendors;
            // Compatibility-only ancestry/list metadata must not alter the
            // already-resolved preset configuration sent to full_config.
            auto compatibility_printer=printer, compatibility_process=process;
            WorkerCompatibility::metadata(compatibility_printer,request.at("printer").value("metadata",json::object()),compatibility_vendors);
            WorkerCompatibility::metadata(compatibility_process,request.at("process").value("metadata",json::object()),compatibility_vendors);
            output["compatibility"] = json::array();
            auto process_check=WorkerCompatibility::evaluate(compatibility_process,compatibility_printer);process_check["name"]=process.name;output["compatibility"].push_back(process_check);
            if (compatibility_policy=="enforce" && !process_check.at("compatible").get<bool>()) throw std::runtime_error("Native preset is incompatible with selected printer: " + process.name);
            for (size_t index=0;index<filaments.size();++index) {
                auto compatibility_filament=filaments[index];
                WorkerCompatibility::metadata(compatibility_filament,materials[index].value("metadata",json::object()),compatibility_vendors);
                auto check=WorkerCompatibility::evaluate(compatibility_filament,compatibility_printer,&compatibility_process);check["name"]=filaments[index].name;output["compatibility"].push_back(check);
                if (compatibility_policy=="enforce" && !check.at("compatible").get<bool>()) throw std::runtime_error("Native material is incompatible with selected printer or process: " + filaments[index].name);
            }
            const std::string printer_name = printer.name, process_name = process.name;
            bundle.printers.load_preset("", printer.name, std::move(printer.config));
            bundle.prints.load_preset("", process.name, std::move(process.config));
            for (size_t index = 0; index < filaments.size(); ++index) {
                auto& material = filaments[index];
                // Per-slot edits must not collide when several slots select the same native preset.
                const std::string internal_name = "OrcaWebInternalSlot" + std::to_string(index + 1);
                bundle.filament_presets.push_back(internal_name);
                bundle.filaments.load_preset("", internal_name, std::move(material.config));
            }
            bundle.project_config.apply(project);
            for (const bool effective : {false, true}) {
                auto config = bundle.full_config(effective);
                config.option<ConfigOptionStrings>("filament_settings_id", true)->values = names;
                config.option<ConfigOptionStrings>("filament_ids", true)->values = ids;
                output[effective ? "effectiveSettings" : "archiveSettings"] = serialize(config, dir);
            }
            output["scopes"] = scopes;
        }
        output["reports"] = reports;
        const std::string bytes = output.dump();
        if (bytes.size() > 16*1024*1024) throw std::runtime_error("Native configuration output exceeds 16 MiB");
        std::ofstream stream(argv[2]); if (!stream) throw std::runtime_error("Cannot create native output"); stream << bytes << '\n';
        return 0;
    } catch (const std::exception& error) { std::cerr << error.what() << '\n'; return 1; }
}
