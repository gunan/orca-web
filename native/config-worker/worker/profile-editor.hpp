// Tab::switch_excluder (Tab.cpp:7433–7494) selects each field from the intact
// preset using DynamicPrintConfig::get_index_for_extruder. This is deliberately
// separate from full_config(true), whose sequential projection mutates metadata.
static DynamicPrintConfig profile_editor_projection(const json& request, const worker_fs::path& dir, json& source_indices) {
    const std::string scope = request.at("scope").get<std::string>();
    if (scope != "machine" && scope != "process" && scope != "filament") throw std::runtime_error("Unknown editor scope");
    const auto full = loaded(request.at("settings"), dir);
    const auto context = loaded(request.at("context"), dir);
    auto out = full;
    const auto* diameters = context.option<ConfigOptionFloats>("nozzle_diameter");
    const auto* types = context.option<ConfigOptionEnumsGeneric>("extruder_type");
    const auto* volumes = context.option<ConfigOptionEnumsGeneric>("nozzle_volume_type");
    if (!diameters || diameters->size() < 1 || diameters->size() > 8 || !types || !volumes || types->size() < 1 || types->size() > diameters->size() || volumes->size() < 1 || volumes->size() > diameters->size()) throw std::runtime_error("Editor requires a complete active nozzle context");
    const int selected = request.value("physicalNozzle", 1);
    if (selected < 1 || selected > int(diameters->size())) throw std::runtime_error("Editor nozzle is unavailable");
    const std::string ids = scope == "machine" ? "printer_extruder_id" : scope == "process" ? "print_extruder_id" : "";
    const std::string variants = scope == "machine" ? "printer_extruder_variant" : scope == "process" ? "print_extruder_variant" : "filament_extruder_variant";
    auto keys = scope == "machine" ? printer_options_with_variant_1 : scope == "process" ? print_options_with_variant : filament_options_with_variant;
    if (scope == "machine") keys.insert(printer_options_with_variant_2.begin(), printer_options_with_variant_2.end());
    const size_t count = scope == "filament" ? 1 : diameters->size();
    for (const auto& key : keys) {
        const auto* source = dynamic_cast<const ConfigOptionVectorBase*>(full.option(key));
        auto* target = dynamic_cast<ConfigOptionVectorBase*>(out.option(key));
        if (!source || !target) continue;
        const size_t stride = scope == "machine" && printer_options_with_variant_2.count(key) ? 2 : 1;
        target->resize(count * stride);
        source_indices[key] = json::array();
        for (size_t index = 0; index < count; ++index) {
            const int physical = scope == "filament" ? selected : int(index + 1);
            const int source_index = full.get_index_for_extruder(physical, ids, ExtruderType(types->get_at(physical - 1)), NozzleVolumeType(volumes->get_at(physical - 1)), variants, stride);
            if (source_index < 0) throw std::runtime_error("Selected editor variant is unavailable for " + key);
            for (size_t component = 0; component < stride; ++component) { target->set_at(source, index * stride + component, source_index + component); source_indices[key].push_back(source_index + component); }
        }
    }
    return out;
}
