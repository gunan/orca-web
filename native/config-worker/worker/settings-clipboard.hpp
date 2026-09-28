// Source-adapted GUI_ObjectList::paste_settings_into_list, OrcaSlicer 2.4.2.
// GUI selection/history is handled by the browser. ConfigOption equality,
// apply_only and typed serialization are the original native implementation.
static DynamicPrintConfig clipboard_config(const json& values) {
    if (!values.is_object() || values.size() > 512) throw std::runtime_error("Clipboard settings need a bounded object");
    DynamicPrintConfig config;
    for (const auto& [key,value] : values.items()) {
        if (key.size() > 128 || !value.is_string() || value.get_ref<const std::string&>().size() > 65536)
            throw std::runtime_error("Clipboard settings require bounded native serialized values");
        config.set_deserialize_strict(key, value.get<std::string>());
    }
    return config;
}
static json serialized_clipboard(const DynamicPrintConfig& config) {
    json result = json::object();
    for (const auto& key : config.keys()) result[key] = config.option(key)->serialize();
    return result;
}
static json paste_process_settings(const json& request, const worker_fs::path& directory) {
    const auto& targets = request.at("targets");
    if (!targets.is_array() || targets.empty() || targets.size() > 256) throw std::runtime_error("Choose 1–256 settings destinations");
    const auto config_cache = clipboard_config(request.at("clipboard"));
    DynamicPrintConfig global; global.apply(FullPrintConfig::defaults()); global.apply(loaded(request.at("globalSettings"), directory));
    PrintRegionConfig region;
    const auto part_options = region.keys();
    std::unique_ptr<t_config_option_keys> global_keys;
    json output = json::array();
    for (const auto& target : targets) {
        const auto kind = target.at("kind").get<std::string>();
        if (kind != "object" && kind != "part" && kind != "range") throw std::runtime_error("Invalid settings destination kind");
        auto config = clipboard_config(target.at("settings"));
        const auto parent = clipboard_config(target.value("parentSettings",json::object()));
        auto keys = config_cache.keys();
        std::unique_ptr<ConfigOption> extruder(config.option("extruder") ? config.option("extruder")->clone() : nullptr);
        config.clear();
        if (kind != "object") {
            if (global_keys == nullptr) {
                DynamicPrintConfig inherited;
                inherited.apply_only(global, keys);
                inherited.apply_only(parent, keys);
                const auto equals = inherited.equal(config_cache);
                global_keys.reset(new t_config_option_keys);
                const auto parent_keys = parent.keys();
                std::copy_if(parent_keys.begin(), parent_keys.end(), std::back_inserter(*global_keys),
                    [&equals](const auto& key){return std::find(equals.begin(),equals.end(),key)==equals.end();});
                keys.erase(std::remove_if(keys.begin(),keys.end(),
                    [&equals](const auto& key){return std::find(equals.begin(),equals.end(),key)!=equals.end();}),keys.end());
            }
            // Original ObjectList computes this set once per Paste, even when
            // selected parts have different parents. Do not recompute it here.
            config.apply_only(global,*global_keys);
        }
        for (const auto& key : keys) {
            if (kind != "object" && std::find(part_options.begin(),part_options.end(),key)==part_options.end()) continue;
            if (const auto* option = config_cache.option(key)) config.set_key_value(key,option->clone());
        }
        if (extruder) config.set_key_value("extruder",extruder.release());
        else config.erase("extruder");
        output.push_back(serialized_clipboard(config));
    }
    return output;
}
