// Preset::save and the user-file load sequence from PresetCollection::load_presets
// (Preset.cpp:1664–1708), operating only inside the caller's isolated work folder.
static Preset::Type user_preset_type(const json& request) {
 const auto scope=request.at("scope").get<std::string>();
 if(scope=="machine")return Preset::TYPE_PRINTER;
 if(scope=="process")return Preset::TYPE_PRINT;
 if(scope=="filament")return Preset::TYPE_FILAMENT;
 throw std::runtime_error("Unknown native user preset scope");
}
static DynamicPrintConfig user_preset_defaults(PresetBundle& bundle,Preset::Type type) {
 return type==Preset::TYPE_PRINTER?bundle.printers.default_preset().config:type==Preset::TYPE_PRINT?bundle.prints.default_preset().config:bundle.filaments.default_preset().config;
}
static std::string user_preset_name(const json& request,const char* field) {
 const auto name=request.at(field).get<std::string>();
 if(name.empty()||name.size()>1000||name.find('\0')!=std::string::npos)throw std::runtime_error("Invalid native user preset name");
 return name;
}
static Preset user_preset_full(const json& values,Preset::Type type,const std::string& name,const DynamicPrintConfig& defaults,const worker_fs::path& dir) {
 // Full scopes supplied by the trusted server already contain resolved values.
 // Filling missing scope defaults is the same construction used for root users.
 Preset value(type,name,false);const auto version=Semver::parse(values.value("version",std::string("2.4.2")));if(!version)throw std::runtime_error("Invalid native preset version");value.version=*version;
 if(type==Preset::TYPE_FILAMENT){value.filament_id=values.value("filament_id",std::string());if(value.filament_id.size()>1000)throw std::runtime_error("Native filament ID exceeds limit");}
 value.config=defaults;value.config.apply(loaded(values,dir));
 extend_default_config_length(value.config,true,defaults);Preset::normalize(value.config);
 const auto invalid=Preset::remove_invalid_keys(value.config,defaults);if(!invalid.empty())throw std::runtime_error("Misplaced native user preset options: "+invalid);
 return value;
}
static json user_preset_projection(const json& request,const worker_fs::path& dir) {
 const auto type=user_preset_type(request);const auto mode=request.at("mode").get<std::string>();
 const auto name=user_preset_name(request,"name");PresetBundle bundle;const auto defaults=user_preset_defaults(bundle,type);
 if(mode=="system"){
  const auto value=preset(request.at("source"),type,defaults,dir);
  return{{"settings",serialize(value.config,dir)},{"filamentId",value.filament_id},{"version","2.4.2"}};
 }
 Preset parent(type,"Unused parent");const bool has_parent=request.contains("parent");
 if(has_parent){const auto& input=request.at("parent");const auto parent_name=user_preset_name(input,"name");if(parent_name==name)throw std::runtime_error("A preset cannot inherit itself");parent=user_preset_full(input.at("settings"),type,parent_name,defaults,dir);}
 if(mode=="save"){
  auto current=user_preset_full(request.at("settings"),type,name,defaults,dir);current.inherits()=has_parent?parent.name:std::string();
  current.config.set_key_value(type==Preset::TYPE_PRINTER?"printer_settings_id":type==Preset::TYPE_PRINT?"print_settings_id":"filament_settings_id",type==Preset::TYPE_FILAMENT?static_cast<ConfigOption*>(new ConfigOptionStrings({name})):static_cast<ConfigOption*>(new ConfigOptionString(name)));
  current.filament_id=request.value("filamentId",!current.filament_id.empty()?current.filament_id:has_parent?parent.filament_id:std::string());if(current.filament_id.size()>1000)throw std::runtime_error("Native filament ID exceeds limit");
  const auto file=dir/("user-preset-"+std::to_string(ordinal++)+".json");current.file=file.string();
  // Original method computes diff and set_with_nil with native variant strides.
  // Its companion .info contains only default empty identity fields and lives here.
  current.save(has_parent?&parent.config:nullptr);
  json document;{std::ifstream stream(file);if(!stream)throw std::runtime_error("Native user preset save produced no JSON");stream>>document;}
  worker_fs::remove(file);auto info=file;info.replace_extension(".info");worker_fs::remove(info);
  return{{"document",document},{"settings",serialize(current.config,dir)},{"filamentId",current.filament_id},{"version",current.version.to_string()}};
 }
 if(mode=="reload"){
  if(!has_parent)throw std::runtime_error("Native preset reload requires its parent");
  const auto document=request.at("document");auto checked=loaded(document,dir,true,ForwardCompatibilitySubstitutionRule::Disable);if(Preset::inherits(checked)!=parent.name)throw std::runtime_error("Native user preset parent does not match resolved inheritance");
  Preset current(type,name,false);current.config=defaults;
  const auto file=dir/("user-reload-"+std::to_string(ordinal++)+".json");current.file=file.string();{std::ofstream stream(file);stream<<document.dump();}
  current.reload(parent);worker_fs::remove(file);
  return{{"settings",serialize(current.config,dir)},{"filamentId",request.value("filamentId",parent.filament_id)},{"version",document.value("version",std::string("2.4.2"))}};
 }
 if(mode=="load"){
  const auto loaded_version=Semver::parse(request.at("document").value("version",std::string("2.4.2")));if(!loaded_version)throw std::runtime_error("Invalid native user preset version");
#ifdef ORCA_USER_PRESET_REFERENCE
  // Independent test oracle: original complete user-file loader. This branch
  // is absent from the production build. Names stay within one temp directory.
  if(name=="."||name==".."||name.find('/')!=std::string::npos||name.find('\\')!=std::string::npos)throw std::runtime_error("Unsafe reference fixture name");
  PresetCollection* collection=type==Preset::TYPE_PRINTER?static_cast<PresetCollection*>(&bundle.printers):type==Preset::TYPE_PRINT?static_cast<PresetCollection*>(&bundle.prints):static_cast<PresetCollection*>(&bundle.filaments);
  if(has_parent){auto& native_parent=collection->load_preset("",parent.name,DynamicPrintConfig(parent.config),false);native_parent.is_system=true;native_parent.filament_id=parent.filament_id;}
  const auto folder=dir/("reference-user-"+std::to_string(ordinal++));worker_fs::create_directory(folder);const auto file=folder/(name+".json");
  {std::ofstream stream(file);stream<<request.at("document").dump();}
  PresetsConfigSubstitutions substitutions;collection->load_presets(folder.string(),"",substitutions,ForwardCompatibilitySubstitutionRule::Enable,nullptr,PresetOrigin(PresetOrigin::Kind::User));
  const auto found=collection->find_preset(name,false,true);if(!found||!found->loaded)throw std::runtime_error("Original native user-file loader did not load fixture");
  const auto result=serialize(found->config,dir);const auto filament_id=found->filament_id,version=found->version.to_string();worker_fs::remove_all(folder);return{{"settings",result},{"filamentId",filament_id},{"version",version}};
#else
  auto diff=loaded(request.at("document"),dir,true);const auto inherited=Preset::inherits(diff);
  if((has_parent&&inherited!=parent.name)||(!has_parent&&!inherited.empty()))throw std::runtime_error("Native user preset parent does not match resolved inheritance");
  DynamicPrintConfig full;
  if(has_parent){
   Preset::normalize_inherits(diff,&parent);full=parent.config;
   std::string ids,variants;std::set<std::string>* keys1=nullptr;std::set<std::string>* keys2=nullptr;Preset::get_extruder_names_and_keysets(type,ids,variants,&keys1,&keys2);
   extend_default_config_length(diff,false,{});
   full.update_diff_values_to_child_config(diff,ids,variants,*keys1,*keys2);
  }else{full=defaults;full.apply(diff);extend_default_config_length(full,true,defaults);}
  Preset::normalize(full);const auto invalid=Preset::remove_invalid_keys(full,defaults);if(!invalid.empty())throw std::runtime_error("Misplaced native user preset options: "+invalid);
  // Preset.cpp:1710–1721 root-filament legacy compatibility repair. Preserve
  // native substring behavior (including whitespace), without its disk rewrite.
  if(type==Preset::TYPE_FILAMENT&&Preset::inherits(full).empty()){
   auto printers=full.option<ConfigOptionStrings>("compatible_printers",true);
   if(printers&&printers->values.empty()){const auto at=name.find('@');if(at!=std::string::npos&&at+1<name.length())printers->values.push_back(name.substr(at+1));}
  }
  return{{"settings",serialize(full,dir)},{"filamentId",has_parent?parent.filament_id:request.at("document").value("filament_id",std::string())},{"version",loaded_version->to_string()}};
#endif
 }
 throw std::runtime_error("Unknown native user preset projection mode");
}
