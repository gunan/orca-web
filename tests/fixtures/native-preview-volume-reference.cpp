// Independent float32 translation of OrcaSlicer 8500fcd libvgcode/Shaders.hpp
// Segments_Vertex_Shader. Retains FIX_TWISTING + POINTY_CAPS source branches.
// Original Prusa Research contributors; AGPLv3 or later.
// clang++ -std=c++17 -O0 -ffp-contract=off this.cpp -o /tmp/reference
#include <cmath>
#include <iostream>
#include <iomanip>
#include <array>
struct V {float x,y,z;};
V operator+(V a,V b){return {a.x+b.x,a.y+b.y,a.z+b.z};}
V operator-(V a,V b){return {a.x-b.x,a.y-b.y,a.z-b.z};}
V operator-(V a){return {-a.x,-a.y,-a.z};}
V operator*(float s,V a){return {s*a.x,s*a.y,s*a.z};}
V operator*(V a,float s){return s*a;}
V operator/(V a,float s){return {a.x/s,a.y/s,a.z/s};}
float dot(V a,V b){return a.x*b.x+a.y*b.y+a.z*b.z;}
V cross(V a,V b){return {a.y*b.z-a.z*b.y,a.z*b.x-a.x*b.z,a.x*b.y-a.y*b.x};}
V norm(V a){return a/std::sqrt(dot(a,a));}
float sign(float a){return float((a>0)-(a<0));}
struct Case{const char*name;V a,b,ha,hb,camera;};
V vertex(Case c,int id){
 const V UP={0,0,1};V line=c.b-c.a;float len=std::sqrt(dot(line,line));V dir=len<1e-4f?V{1,0,0}:line/len;
 V right=std::abs(dot(dir,UP))>.9f?norm(cross({1,0,0},dir)):norm(cross(dir,UP));V up=norm(cross(right,dir));
 const std::array<std::array<float,2>,16> signs={{{1,0},{0,1},{0,0},{0,-1},{0,-1},{1,0},{0,1},{0,0},{0,1},{-1,0},{0,0},{1,0},{1,0},{0,1},{-1,0},{0,0}}};
 V endpoint=id<4?c.a:c.b,hwa=id<4?c.ha:c.hb;
 bool ca=dot(c.camera-c.a,c.camera-c.a)<dot(c.camera-c.b,c.camera-c.b);V closer=ca?c.a:c.b,ch=ca?c.ha:c.hb;
 V view=norm(closer-c.camera),border=norm(ch.x*up+ch.y*right);
 bool vertical=std::abs(dot(view,up))/std::abs(dot(border,up))>std::abs(dot(view,right))/std::abs(dot(border,right));
 auto s=signs[id+8*int(vertical)];float halfh=.5f*hwa.x,halfw=.5f*hwa.y;V horizontal=halfw*right,vert=halfh*up;
 V pos=endpoint+(s[0]*sign(dot(-view,right)))*horizontal+(s[1]*sign(dot(-view,up)))*vert;
 if(id==2||id==7){float ld=id==2?-1.f:1.f;if(hwa.z==0)pos=pos+ld*dir*halfw;else{pos=pos+ld*dir*halfw*std::sin(std::abs(hwa.z)*.5f);pos=pos+sign(hwa.z)*horizontal*std::cos(std::abs(hwa.z)*.5f);}}
 return pos;
}
void json(V a){std::cout<<'['<<a.x<<','<<a.y<<','<<a.z<<']';}
int main(){
 const float pi=3.14159265358979323846f;
 const Case cases[]={
 {"horizontal top",{0,0,.1},{10,0,.1},{.2,.4,0},{.2,.4,0},{4,-3,30}},
 {"horizontal side",{0,0,.1},{10,0,.1},{.2,.4,0},{.2,.4,0},{4,-30,3}},
 {"opposite camera",{0,0,.1},{10,0,.1},{.2,.4,0},{.2,.4,0},{4,30,-3}},
 {"vertical segment",{4,3,1},{4,3,10},{.4,.4,0},{.4,.4,0},{20,-3,8}},
 {"sloping nonplanar",{1,2,3},{5,8,6},{.2,.42,.8},{.24,.5,-.5},{-4,-8,12}},
 {"near vertical branch",{0,0,0},{1,0,9},{.2,.4,0},{.2,.4,0},{-20,40,5}},
 {"short degenerate direction",{1,2,3},{1.00001f,2,3},{.2,.4,0},{.2,.4,0},{-10,20,20}},
 {"positive corners",{20,20,10},{30,20,10},{.2,.4,pi/2},{.2,.4,pi/2},{45,-30,50}},
 {"negative corners",{20,20,10},{30,20,10},{.2,.4,-pi/2},{.2,.4,-pi/2},{45,-30,50}},
 {"reverse cusp",{0,0,0},{0,10,0},{.2,.6,pi},{.2,.6,-pi},{20,10,4}},
 {"changing width closer start",{0,0,.1},{10,0,.2},{.2,.4,.2},{.4,.8,-.3},{-20,-1,5}},
 {"changing width closer end",{0,0,.1},{10,0,.2},{.2,.4,.2},{.4,.8,-.3},{20,-1,5}},
 {"equal endpoint distance",{-10,0,.1},{10,0,.1},{.2,.4,0},{.4,.8,0},{0,-12,5}},
 {"near-flat corner",{2,3,.1},{2,30,.1},{.2,.4,1e-6f},{.2,.4,-1e-6f},{20,15,40}},
 {"wide low extrusion",{0,0,.1},{50,50,.1},{.08,2,1.4},{.08,2,-1.4},{10,11,3}},
 {"large machine coordinates",{10000,10000,300},{10020,10040,300},{.4,1.2,.5},{.4,1.2,-.5},{9800,10100,700}}
 };
 std::cout<<std::setprecision(9)<<"{\"source\":\"OrcaSlicer8500fcd Segments_Vertex_Shader\",\"cases\":[";bool first=true;
 for(auto c:cases){if(!first)std::cout<<',';first=false;std::cout<<"{\"name\":\""<<c.name<<"\",\"start\":";json(c.a);std::cout<<",\"end\":";json(c.b);std::cout<<",\"hwaStart\":";json(c.ha);std::cout<<",\"hwaEnd\":";json(c.hb);std::cout<<",\"camera\":";json(c.camera);std::cout<<",\"vertices\":[";for(int i=0;i<8;i++){if(i)std::cout<<',';json(vertex(c,i));}std::cout<<"]}";}
 std::cout<<"]}\n";
}
