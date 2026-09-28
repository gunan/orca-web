// Independent reference for selected OrcaSlicer 8500fcd native operations.
// Float formulas transcribed from GCodeProcessor.cpp3830–3947, PathVertex.hpp129,
// ViewerImpl.cpp47 and ColorRange.cpp57; not a full GCodeProcessor replacement.
// Local generator reads a native G-code fixture and prints source-line values.
#include <array>
#include <algorithm>
#include <cmath>
#include <cstdlib>
#include <fstream>
#include <iomanip>
#include <iostream>
#include <map>
#include <sstream>
#include <string>
#include <vector>
int main(int argc,char**argv){
 if(argc!=2)return 2;std::ifstream input(argv[1]);if(!input)return 3;
 std::vector<std::string> lines;std::string line;while(std::getline(input,line))lines.push_back(line);
 float diameter=0;for(const auto& raw:lines){auto p=raw.find("; filament_diameter = ");if(p!=std::string::npos)diameter=std::stof(raw.substr(p+22));}
 if(diameter<=0)return 4;
 std::array<double,4> pos={0,0,0,0},origin={0,0,0,0};bool relative=false,relative_e=false,wiping=false;double units=1;float forced_h=0,forced_w=0,feedrate=0;int line_id=0;
 std::cout<<std::setprecision(9)<<'[';bool first=true;
 for(auto raw:lines){line_id++;auto semi=raw.find(';');if(semi!=std::string::npos){const auto comment=raw.substr(semi+1);if(comment.rfind("HEIGHT:",0)==0)forced_h=std::stof(comment.substr(7));if(comment.rfind("WIDTH:",0)==0)forced_w=std::stof(comment.substr(6));if(comment=="WIPE_START")wiping=true;if(comment=="WIPE_END")wiping=false;raw.resize(semi);}
 std::istringstream in(raw);std::string command;in>>command;std::map<char,float> words;std::string token;while(in>>token){if(token.size()>1&&std::isalpha(token[0])){char*end;float v=std::strtof(token.c_str()+1,&end);if(end!=token.c_str()+1)words[token[0]]=v;}}
 if(command=="G90")relative=false;else if(command=="G91")relative=true;else if(command=="M82")relative_e=false;else if(command=="M83")relative_e=true;else if(command=="G20")units=double(25.4f);else if(command=="G21")units=1;
 else if(command=="G92"){for(int a=0;a<4;a++)if(words.count("XYZE"[a])){float value=words["XYZE"[a]]*float(units);if(a==3)pos[a]=value;else origin[a]=pos[a]-value;}}
 else if(command=="G28"){for(int a=0;a<3;a++)if(words.empty()||words.count("XYZ"[a]))pos[a]=0;}
 else if(command=="G0"||command=="G1"){
 std::array<double,4> end=pos;std::array<double,4> delta;for(int a=0;a<4;a++){if(words.count("XYZE"[a])){const double v=double(words["XYZE"[a]])*units;end[a]=(relative||(a==3&&relative_e))?pos[a]+v:origin[a]+v;}delta[a]=end[a]-pos[a];}
 if(words.count('F'))feedrate=double(words['F'])*(1.0f/60.0f);pos=end;
 if(delta[3]<=0||(delta[0]==0&&delta[1]==0)||wiping||forced_h<=0||forced_w<=0)continue;
 float radius=.5f*diameter;float area=float(M_PI)*(radius*radius);float length=std::sqrt(delta[0]*delta[0]+delta[1]*delta[1]+delta[2]*delta[2]);float volume=area*delta[3];float per_mm=volume/length;float flow=feedrate*per_mm;float width=std::min(forced_w,std::max(2.0f,4.0f*forced_h));
 if(!first)std::cout<<',';first=false;std::cout<<'['<<line_id<<','<<forced_h<<','<<width<<','<<flow<<','<<per_mm<<']';
 }}std::cout<<"]\n";
}
