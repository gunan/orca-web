// OrcaSlicer 2.4.2, 8500fcdccaa10b5099ac20d252af3a7c560046f1.
// CutUtils.cpp's float parameters/plane sequence, AGPL-3.0. See README.md.
// Independent source-plane fixture, not the native GUI or cut_mesh engine.
#include <cmath>
#include <array>
#include <vector>
#include <string>
#include <iostream>
#include <iomanip>
#include <algorithm>
struct Groove {float depth,width,flaps_angle,angle,depth_tolerance,width_tolerance;};
// Original Cut::calculate_groove_width body, with is_approx expanded for our
// nonzero-angle fixtures and std::max qualification; no mesh code involved.
float calculate_groove_width(const Groove& groove,const float m_radius) {
    const double flap_width = std::abs(groove.flaps_angle)<1e-6f ? groove.depth : groove.depth / sin(groove.flaps_angle);
    const double total_flap_width = 2.0 * flap_width * cos(groove.flaps_angle);
    const double slot_neck_half_width = 0.5f * (groove.width);
    const double slot_mouth_half_width = 0.5 * (groove.width + total_flap_width);
    const double plane_half_height = 0.5f * (1.5f * (1.5f * m_radius));
    const double flap_taper_offset = plane_half_height * tan(groove.angle);
    const double slot_outer_x_max = std::max(slot_mouth_half_width+flap_taper_offset,slot_neck_half_width+flap_taper_offset);
    return float(2.0*slot_outer_x_max);
}
struct Plane {std::array<double,3> n;double offset;std::string keep;};
struct Cell {std::string side,kind;int groove=-1;std::vector<Plane> planes;};
Plane plane(double y,double z,double pointX,double pointZ,std::string keep){ // Rz(z)*Ry(y)*UnitZ; Geometry.cpp:348
 std::array<double,3> n{sin(y)*cos(z),sin(y)*sin(z),cos(y)};return{n,n[0]*pointX+n[2]*pointZ,keep};
}
Plane flip(Plane p){p.keep=p.keep=="upper"?"lower":"upper";return p;}
void emit(std::string name,float depth,float width,float flap,float angle,int count,float gap,float dt=.1f,float wt=.1f){
 Groove g{depth,width,float(double(flap)*M_PI/180),float(double(angle)*M_PI/180),dt,wt};const float radius=std::sqrt(40.*40.+20.*20.+20.*20.)/2;const double half=.5*double(g.depth),shift=.5*double(g.width+g.depth/tan(g.flaps_angle));const float gw=calculate_groove_width(g,radius);
 std::vector<Plane> slab{plane(0,0,0,half,"lower"),plane(0,0,0,-half,"upper")};std::vector<Cell> cells{{"upper","base",-1,{plane(0,0,0,half,"upper")}},{"lower","base",-1,{plane(0,0,0,-half,"lower")}}};
 for(int i=0;i<count;i++){
  float factor_start=-.5*((count-1)),factor=factor_start+i,offset_x=factor*(gap+gw);auto region=slab;
  if(i)region.push_back(plane(M_PI/2,0,(-gap/2.f)-(gw/2.f)+offset_x,0,"upper"));
  if(i<count-1)region.push_back(plane(M_PI/2,0,(gap/2.f)+(gw/2.f)+offset_x,0,"lower"));
  Plane L=plane(-g.flaps_angle,-g.angle,offset_x-shift,0,"lower"),R=plane(g.flaps_angle,g.angle,offset_x+shift,0,"lower");
  auto left=region;left.push_back(flip(L));cells.push_back({"lower","left-flap",i,left});
  auto right=region;right.push_back(L);right.push_back(flip(R));cells.push_back({"lower","right-flap",i,right});
  auto tongue=region;tongue.push_back(L);tongue.push_back(R);tongue.push_back(plane(0,0,0,-(half-double(g.depth_tolerance)),"upper"));
  const double smaller=shift-.5*double(g.width_tolerance);tongue.push_back(plane(-g.flaps_angle,-g.angle,offset_x-smaller,0,"lower"));tongue.push_back(plane(g.flaps_angle,g.angle,offset_x+smaller,0,"lower"));cells.push_back({"upper","tongue",i,tongue});
 }
 std::cout<<"\""<<name<<"\":{\"parameters\":{\"depth\":"<<depth<<",\"width\":"<<width<<",\"flapAngle\":"<<flap<<",\"grooveAngle\":"<<angle<<",\"count\":"<<count<<",\"gap\":"<<gap<<",\"depthTolerance\":"<<dt<<",\"widthTolerance\":"<<wt<<"},\"radius\":"<<radius<<",\"grooveWidth\":"<<gw<<",\"cells\":[";
 for(size_t i=0;i<cells.size();i++){if(i)std::cout<<",";auto &c=cells[i];std::cout<<"{\"side\":\""<<c.side<<"\",\"kind\":\""<<c.kind<<"\"";if(c.groove>=0)std::cout<<",\"groove\":"<<c.groove;std::cout<<",\"planes\":[";for(size_t j=0;j<c.planes.size();j++){if(j)std::cout<<",";auto p=c.planes[j];std::cout<<"{\"normal\":["<<p.n[0]<<","<<p.n[1]<<","<<p.n[2]<<"],\"offset\":"<<p.offset<<",\"keep\":\""<<p.keep<<"\"}";}std::cout<<"]}";}std::cout<<"]}";
}
int main(){std::cout<<std::setprecision(17)<<"{";emit("basic",4,8,60,0,1,10);std::cout<<",";emit("repeated",2,5,60,0,2,4);std::cout<<",";emit("tapered",4,8,60,10,1,10);std::cout<<",";emit("obtuse",4,8,110,0,1,10);std::cout<<",";emit("zero-clearance",4,8,60,0,1,10,0,0);std::cout<<",";emit("negative-clearance",4,8,60,0,1,10,-.1f,-.1f);std::cout<<"}\n";}
