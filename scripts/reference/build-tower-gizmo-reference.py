#!/usr/bin/env python3
"""Compile pinned original Move projection and Move/Rotate/Scale enablement."""
from pathlib import Path
import argparse,json,hashlib,subprocess
p=argparse.ArgumentParser();p.add_argument('--source',required=True);p.add_argument('--eigen',required=True);p.add_argument('--output',required=True);a=p.parse_args();root=Path(a.source);out=Path(a.output);out.mkdir(parents=True,exist_ok=True)
commit=subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip();assert commit=='8500fcdccaa10b5099ac20d252af3a7c560046f1'
paths={kind:'src/slic3r/GUI/Gizmos/GLGizmo'+kind+'.cpp' for kind in ['Move','Rotate','Scale']}
def extract(kind,signature):
 s=(root/paths[kind]).read_text();start=s.index(signature);open=s.index('{',start);depth=0
 for end in range(open,len(s)):
  if s[end]=='{':depth+=1
  if s[end]=='}':
   depth-=1
   if depth==0:return s[start:end+1]
methods=[extract('Move','double GLGizmoMove3D::calc_projection'),*[extract(kind,f'bool GLGizmo{kind}3D::on_is_activable') for kind in ['Move','Rotate','Scale']],extract('Move','void GLGizmoMove3D::data_changed')]
source='''#include <Eigen/Core>
#include <nlohmann/json.hpp>
#include <iostream>
#include <cmath>
using Vec3d=Eigen::Vector3d;using json=nlohmann::json;
static bool shift=false;constexpr int WXK_SHIFT=1;bool wxGetKeyState(int){return shift;}
struct Selection{bool empty=false,tower=true;bool is_empty()const{return empty;}bool is_wipe_tower()const{return tower;}};
struct Parent{Selection selection;const Selection&get_selection()const{return selection;}};
struct UpdateData{struct Ray{Vec3d a,b;Vec3d unit_vector()const{return(b-a).normalized();}}mouse_ray;};
struct GLGizmoMove3D{Vec3d m_starting_drag_position,m_starting_box_center;double m_snap_step=1.;Parent m_parent;struct Grabber{bool enabled=true;};Grabber m_grabbers[3];void change_cs_by_selection(){};double calc_projection(const UpdateData&)const;bool on_is_activable()const;void data_changed(bool);};
struct GLGizmoRotate3D{Parent m_parent;bool on_is_activable()const;};struct GLGizmoScale3D{Parent m_parent;bool on_is_activable()const;};
'''+ '\n'.join(methods)+'''
Vec3d vec(const json&j){return{j[0].get<double>(),j[1].get<double>(),j[2].get<double>()};}
int main(){json input;std::cin>>input;json output=json::array();for(const auto&c:input){GLGizmoMove3D g;g.m_starting_drag_position=vec(c["handle"]);g.m_starting_box_center=vec(c["center"]);g.m_snap_step=c.value("snapStep",1.);shift=c.value("shift",false);UpdateData data{{vec(c["ray"][0]),vec(c["ray"][1])}};output.push_back(g.calc_projection(data));}GLGizmoMove3D move;GLGizmoRotate3D rotate;GLGizmoScale3D scale;move.data_changed(false);json result;result["projections"]=output;result["towerTools"]={{"move",move.on_is_activable()},{"rotate",rotate.on_is_activable()},{"scale",scale.on_is_activable()},{"axes",{move.m_grabbers[0].enabled,move.m_grabbers[1].enabled,move.m_grabbers[2].enabled}}};std::cout<<result.dump();}
'''
(out/'reference.cpp').write_text(source);subprocess.run(['clang++','-std=c++17','-O2','-I'+a.eigen,'-I'+str(root/'deps_src'),str(out/'reference.cpp'),'-o',str(out/'reference')],check=True)
sha=lambda b:hashlib.sha256(b).hexdigest();manifest={'sourceCommit':commit,'sources':{v:sha((root/v).read_bytes()) for v in paths.values()},'methodsSha256':sha('\n'.join(methods).encode()),'referenceSourceSha256':sha(source.encode()),'generatorSha256':sha(Path(__file__).read_bytes()),'binarySha256':sha((out/'reference').read_bytes())};(out/'provenance.json').write_text(json.dumps(manifest,indent=2)+'\n')
