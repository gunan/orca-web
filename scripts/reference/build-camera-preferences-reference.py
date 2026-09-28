from pathlib import Path
import sys,subprocess,json,hashlib,re
source=Path(sys.argv[1]).resolve();root=Path(__file__).resolve().parents[2];commit='8500fcdccaa10b5099ac20d252af3a7c560046f1';paths=['src/slic3r/GUI/GLCanvas3D.cpp','src/slic3r/GUI/GLCanvas3D.hpp','src/slic3r/GUI/Preferences.cpp','src/libslic3r/AppConfig.cpp'];assert subprocess.check_output(['git','-C',str(source),'rev-parse','HEAD'],text=True).strip()==commit;subprocess.run(['git','-C',str(source),'diff','--exit-code',commit,'--',*paths],check=True)
native=(source/paths[0]).read_text();header=(source/paths[1]).read_text();config=(source/paths[3]).read_text()
def method(signature):
 start=native.index(signature);i=native.index('{',start)+1;depth=1
 while depth:depth+=(native[i]=='{')-(native[i]=='}');i+=1
 return native[start:i]
methods=[method('bool GLCanvas3D::'+name+'(') for name in ['clicked_button_matches_action','is_camera_rotate','is_camera_pan']]
enums='\n'.join(re.findall(r'enum class Mouse(?:Button|Action) \{[^}]+\};',header));assert len(enums.splitlines())==2
cpp='''// Pinned original mouse-action selection methods; synthetic input supplies wx event flags.
#include <nlohmann/json.hpp>
#include <map>
#include <iostream>
using json=nlohmann::json;
struct wxMouseEvent{int button;bool LeftIsDown()const{return button==0;}bool MiddleIsDown()const{return button==1;}bool RightIsDown()const{return button==2;}bool Dragging()const{return true;}bool Moving()const{return false;}bool AltDown()const{return false;}bool ShiftDown()const{return false;}};
struct GLCanvas3D{bool m_is_touchpad_navigation=false;
'''+enums+'''
 bool clicked_button_matches_action(const wxMouseEvent&,MouseAction,const std::map<MouseButton,MouseAction>&)const;
 bool is_camera_rotate(const wxMouseEvent&,const std::map<MouseButton,MouseAction>&)const;
 bool is_camera_pan(const wxMouseEvent&,const std::map<MouseButton,MouseAction>&)const;
};
'''+ '\n'.join(methods)+'''
int main(){using B=GLCanvas3D::MouseButton;using A=GLCanvas3D::MouseAction;GLCanvas3D canvas;json result=json::array();for(int left=0;left<3;left++)for(int middle=0;middle<3;middle++)for(int right=0;right<3;right++){std::map<B,A> mapping={{B::Left,A(left)},{B::Middle,A(middle)},{B::Right,A(right)}};for(int button=0;button<3;button++){wxMouseEvent evt{button};result.push_back({{"mapping",{left,middle,right}},{"button",button},{"action",canvas.is_camera_rotate(evt,mapping)?"rotate":canvas.is_camera_pan(evt,mapping)?"pan":"none"}});}}std::cout<<result.dump();}
'''
file=root/'tests/fixtures/native-camera-preferences-reference.cpp';file.write_text(cpp);build=Path(sys.argv[2]).resolve();build.mkdir(parents=True,exist_ok=True);binary=build/'native-camera-preferences-reference';subprocess.run(['clang++','-std=c++17','-O2','-I'+str(source/'deps_src'),str(file),'-o',str(binary)],check=True)
keys=['camera_orbit_mult','left_mouse_drag_action','middle_mouse_drag_action','right_mouse_drag_action'];defaults={k:re.search(r'if \(get\("'+k+r'"\).empty\(\)\)\s*set\("'+k+r'", "([^"]+)"\)',config).group(1) for k in keys};defaults['reverse_mouse_wheel_zoom']=re.search(r'if \(get\("reverse_mouse_wheel_zoom"\).empty\(\)\)\s*set_bool\("reverse_mouse_wheel_zoom", (\w+)\)',config).group(1)
hash=lambda p:hashlib.sha256(p.read_bytes()).hexdigest();out={'commit':commit,'sourceSha256':{p:hash(source/p)for p in paths},'generatorSha256':hash(Path(__file__)),'referenceSha256':hash(file),'binarySha256':hash(binary),'defaults':defaults,'cases':json.loads(subprocess.check_output([str(binary)]))};(root/'tests/fixtures/native-camera-preferences-reference.json').write_text(json.dumps(out,indent=2)+'\n');print(f'Compiled original action lookup: {len(out["cases"])} button/mapping cases; native defaults extracted.')
