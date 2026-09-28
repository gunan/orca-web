// Harness for unmodified ObjectList methods extracted by the reproduction script.
#include "libslic3r/PrintConfig.hpp"
#include "libslic3r/Preset.hpp"
#include <nlohmann/json.hpp>
#include <fstream>
#include <iostream>
using namespace Slic3r;
using json=nlohmann::json;
using wxDataViewItem=int;
using wxDataViewItemArray=std::vector<int>;
enum ItemType{itUndef=0,itObject=1,itVolume=2,itLayer=4,itSettings=8,itLayerRoot=16};
struct OwnedConfig{DynamicPrintConfig config;DynamicPrintConfig& get(){return config;}const DynamicPrintConfig& get()const{return config;}auto keys()const{return config.keys();}void reset(){config.clear();}ConfigOption* option(const std::string& key){return config.option(key);}void apply_only(const DynamicPrintConfig& source,const t_config_option_keys& keys){config.apply_only(source,keys);}void set_key_value(const std::string& key,ConfigOption* value){config.set_key_value(key,value);}void erase(const std::string& key){config.erase(key);}};
struct FakeNode{ItemType kind;int parent;OwnedConfig config;};
struct FakeModel{std::vector<FakeNode> nodes;ItemType GetItemType(int id){return nodes.at(id).kind;}int GetParent(int id){return nodes.at(id).parent;}};
struct FakeTab{DynamicPrintConfig config;const DynamicPrintConfig* get_config(){return &config;}};
struct FakeApp{FakeTab tab;FakeTab* get_tab(Preset::Type){return &tab;}};
static FakeApp application;
FakeApp& wxGetApp(){return application;}
struct SettingsFactory{static std::vector<std::string> get_options(bool){return PrintRegionConfig().keys();}};
struct FakeClipboard{DynamicPrintConfig config;DynamicPrintConfig& get_config_cache(){return config;}};
class ObjectList{
public:
 FakeModel model;FakeModel* m_objects_model=&model;FakeClipboard m_clipboard;wxDataViewItemArray selected;
 void GetSelections(wxDataViewItemArray& output){output=selected;}
 OwnedConfig& get_item_config(int id){return model.nodes.at(id).config;}
 void take_snapshot(const char*){}
 void add_settings_item(int,const DynamicPrintConfig*){}
 void part_selection_changed(){}
 void paste_settings_into_list();
};
#include "native-settings-paste-original.inc"
static DynamicPrintConfig read_config(const json& values){DynamicPrintConfig result;for(const auto& [key,value]:values.items())result.set_deserialize_strict(key,value.get<std::string>());return result;}
int main(int argc,char**argv){try{if(argc!=2)return 2;json inputs;std::ifstream(argv[1])>>inputs;json outputs=json::array();for(const auto& input:inputs){ObjectList list;list.m_clipboard.config=read_config(input.at("clipboard"));application.tab.config.clear();application.tab.config.apply(FullPrintConfig::defaults());application.tab.config.apply(read_config(input.at("globalSettings")));for(const auto& target:input.at("targets")){int parent=list.model.nodes.size();list.model.nodes.push_back({itObject,parent,{read_config(target.value("parentSettings",json::object()))}});int id=list.model.nodes.size();list.model.nodes.push_back({target.at("kind")=="object"?itObject:target.at("kind")=="part"?itVolume:itLayer,parent,{read_config(target.at("settings"))}});list.selected.push_back(id);}list.paste_settings_into_list();json result=json::array();for(int id:list.selected){json item=json::object();const auto& cfg=list.model.nodes.at(id).config.get();for(const auto& key:cfg.keys())item[key]=cfg.option(key)->serialize();result.push_back(item);}outputs.push_back(result);}std::cout<<outputs.dump(2)<<'\n';return 0;}catch(const std::exception& error){std::cerr<<error.what()<<'\n';return 1;}}
