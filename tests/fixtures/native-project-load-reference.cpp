// Native2.4.2 original load decision and Add preamble; minimal dialog/config adapters.
#include <string>
#include <map>
#include <vector>
#include <iostream>
#include <nlohmann/json.hpp>
using json=nlohmann::json;
#define SETTING_PROJECT_LOAD_BEHAVIOUR "project_load_behaviour"
#define OPTION_PROJECT_LOAD_BEHAVIOUR_LOAD_ALL "load_all"
#define OPTION_PROJECT_LOAD_BEHAVIOUR_ASK_WHEN_RELEVANT "ask_when_relevant"
#define OPTION_PROJECT_LOAD_BEHAVIOUR_ALWAYS_ASK "always_ask"
#define OPTION_PROJECT_LOAD_BEHAVIOUR_LOAD_GEOMETRY "load_geometry_only"
enum class LoadType : unsigned char
{
    Unknown,
    OpenProject,
    LoadGeometry,
    LoadConfig
};
constexpr int wxID_OK=1;int dialogs=0,choice=2,accepted=1;
struct ProjectDropDialog{ProjectDropDialog(std::string){dialogs++;}int ShowModal(){return accepted;}int get_action(){return choice;}};
struct Config{std::map<std::string,std::string> values;std::string get(std::string key){return values[key];}void set(std::string key,std::string value){values[key]=value;}};
struct MainFrame{enum{tp3DEditor};void select_tab(int){}};
struct App{Config c;MainFrame frame;Config* app_config=&c;MainFrame* mainframe=&frame;};App app;App& wxGetApp(){return app;}
struct Model{std::vector<int> objects;};Model m;Model& model(){return m;}
LoadType determine_load_type(std::string filename, std::string override_setting)
{
    std::string setting;

    if (override_setting != "") {
        setting = override_setting;
    } else {
        setting = wxGetApp().app_config->get(SETTING_PROJECT_LOAD_BEHAVIOUR);
    }

    if (setting == OPTION_PROJECT_LOAD_BEHAVIOUR_LOAD_GEOMETRY) {
        return LoadType::LoadGeometry;
    } else if (setting == OPTION_PROJECT_LOAD_BEHAVIOUR_ALWAYS_ASK) {
        ProjectDropDialog dlg(filename);
        if (dlg.ShowModal() == wxID_OK) {
            int      choice    = dlg.get_action();
            LoadType load_type = static_cast<LoadType>(choice);
            wxGetApp().app_config->set("import_project_action", std::to_string(choice));

            // BBS: jump to plater panel
            wxGetApp().mainframe->select_tab(MainFrame::tp3DEditor);
            return load_type;
        }

        return LoadType::Unknown; // Cancel
    } else {
        return LoadType::OpenProject;
    }
}
LoadType add(std::string filename){
    bool not_empty_plate = !model().objects.empty();
    bool load_setting_ask_when_relevant = wxGetApp().app_config->get(SETTING_PROJECT_LOAD_BEHAVIOUR) == OPTION_PROJECT_LOAD_BEHAVIOUR_ASK_WHEN_RELEVANT;
    LoadType load_type = determine_load_type(filename, (not_empty_plate && load_setting_ask_when_relevant) ? OPTION_PROJECT_LOAD_BEHAVIOUR_ALWAYS_ASK : "");
return load_type;
}

int main(){json out=json::array();for(std::string setting:{OPTION_PROJECT_LOAD_BEHAVIOUR_LOAD_ALL,OPTION_PROJECT_LOAD_BEHAVIOUR_ASK_WHEN_RELEVANT,OPTION_PROJECT_LOAD_BEHAVIOUR_ALWAYS_ASK,OPTION_PROJECT_LOAD_BEHAVIOUR_LOAD_GEOMETRY})for(std::string entry:{"open","add"})for(bool hasObjects:{false,true}){dialogs=0;app.c.values[SETTING_PROJECT_LOAD_BEHAVIOUR]=setting;m.objects.resize(hasObjects?1:0);auto result=entry=="add"?add("reference.3mf"):determine_load_type("reference.3mf","");out.push_back({{"behaviour",setting},{"entry",entry},{"hasObjects",hasObjects},{"action",dialogs?"ask":result==LoadType::OpenProject?"project":"geometry"}});}std::cout<<out.dump();}
