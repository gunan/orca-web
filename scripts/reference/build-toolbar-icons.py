#!/usr/bin/env python3
"""Rasterize toolbar states with the pinned original GLTexture implementation."""
from pathlib import Path
import argparse, hashlib, json, struct, subprocess, zlib

p = argparse.ArgumentParser()
p.add_argument('--source', required=True)
p.add_argument('--output', required=True)
a = p.parse_args()
root = Path(a.source)
out = Path(a.output)
repo = Path(__file__).resolve().parents[2]
commit = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=root, text=True).strip()
assert commit == '8500fcdccaa10b5099ac20d252af3a7c560046f1'
out.mkdir(parents=True, exist_ok=True)
path = 'src/slic3r/GUI/GLTexture.cpp'
original = (root / path).read_text()
start = original.index('bool GLTexture::load_from_svg_files_as_sprites_array')
end = original.index('\nvoid GLTexture::reset()', start)
method = original[start:end]
source = r'''#include <vector>
#include <string>
#include <cstring>
#include <filesystem>
#include <fstream>
#include <algorithm>
#include <cctype>
#include <iostream>
#define NANOSVG_IMPLEMENTATION
#include "nanosvg.h"
#define NANOSVGRAST_IMPLEMENTATION
#include "nanosvgrast.h"
namespace boost { namespace filesystem = std::filesystem; namespace algorithm {
bool iends_with(const std::string&s,const std::string&suffix){if(s.size()<suffix.size())return false;return std::equal(suffix.rbegin(),suffix.rend(),s.rbegin(),[](char a,char b){return std::tolower(a)==std::tolower(b);});}
}}
static bool dark=false;struct Config{std::string get(const char*){return dark?"1":"0";}};
struct App{Config config;Config*app_config=&config;};App&wxGetApp(){static App a;return a;}
using GLsizei=int;
constexpr int GL_UNPACK_ALIGNMENT=0,GL_TEXTURE_2D=1,GL_COMPRESSED_RGBA_S3TC_DXT5_EXT=2,GL_RGBA=3,GL_UNSIGNED_BYTE=4,GL_TEXTURE_MIN_FILTER=5,GL_LINEAR=6,GL_TEXTURE_MAX_LEVEL=7,GL_TEXTURE_MAG_FILTER=8;
#define glsafe(x) x
void glPixelStorei(int,int){}void glGenTextures(int,unsigned int*id){*id=1;}
void glBindTexture(int,unsigned int){}void glTexParameteri(int,int,int){}
static std::vector<unsigned char> captured;
void glTexImage2D(int,int,int,int w,int h,int,int,int,const void*data){const auto*p=static_cast<const unsigned char*>(data);captured.assign(p,p+w*h*4);}
struct OpenGLManager{static bool are_compressed_textures_supported(){return false;}};
struct GLTexture {int m_width=0,m_height=0;unsigned int m_id=0;std::string m_source;
void reset(){m_width=m_height=0;m_id=0;m_source.clear();}
bool load_from_svg_files_as_sprites_array(const std::vector<std::string>&,const std::vector<std::pair<int,bool>>&,unsigned int,bool);
};
''' + method + r'''
int main(int argc,char**argv){if(argc<5)return 2;dark=std::string(argv[1])=="dark";int size=std::stoi(argv[2]);std::vector<std::string>files;for(int i=4;i<argc;++i)files.emplace_back(argv[i]);GLTexture t;
if(!t.load_from_svg_files_as_sprites_array(files,{{1,false},{0,false},{0,true},{2,false}},size,false))return 3;
std::ofstream f(argv[3],std::ios::binary);f.write(reinterpret_cast<const char*>(captured.data()),captured.size());std::cout<<t.m_width<<" "<<t.m_height;}
'''
(out/'reference.cpp').write_text(source)
subprocess.run(['clang++','-std=c++17','-O2','-I'+str(root/'deps_src/nanosvg'),str(out/'reference.cpp'),'-o',str(out/'reference')],check=True)
sha = lambda data: hashlib.sha256(data).hexdigest()
inputs = json.loads((repo/'public/native-icons/manifest.json').read_text())
names = ['toolbar_open','toolbar_move','toolbar_rotate','toolbar_scale','toolbar_flatten','toolbar_arrange','toolbar_assemble','toolbar_cut','toolbar_text','toolbar_brimears','toolbar_variable_layer_height','toolbar_support','toolbar_seam','mmu_segmentation','toolbar_fuzzy_skin_paint']
files = {item['file']:item['sha256'] for item in inputs['files']}
assets = repo/'public/native-toolbar-icons'
assets.mkdir(exist_ok=True)
def png(width,height,rgba):
    def chunk(kind,data):return struct.pack('>I',len(data))+kind+data+struct.pack('>I',zlib.crc32(kind+data)&0xffffffff)
    rows=b''.join(b'\0'+rgba[y*width*4:(y+1)*width*4] for y in range(height))
    return b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',width,height,8,6,0,0,0))+chunk(b'IDAT',zlib.compress(rows,9))+chunk(b'IEND',b'')
manifest={'nativeVersion':'2.4.2','sourceCommit':commit,'sourceSha256':sha((root/path).read_bytes()),'supportSources':{p:sha((root/p).read_bytes()) for p in ['deps_src/nanosvg/nanosvg.h','deps_src/nanosvg/nanosvgrast.h','src/slic3r/GUI/Gizmos/GLGizmosManager.cpp','src/slic3r/GUI/GLToolbar.cpp']},'methodSha256':sha(method.encode()),'referenceSourceSha256':sha(source.encode()),'generatorSha256':sha(Path(__file__).read_bytes()),'binarySha256':sha((out/'reference').read_bytes()),'states':['normal','hover','selected','disabled'],'icons':names,'inputs':{},'atlases':[],'strips':[]}
for theme in ['light','dark']:
    filenames=[name+('_dark' if theme=='dark' and name+'_dark.svg' in files else '')+'.svg' for name in names]
    for file in filenames:
        assert sha((repo/'public/native-icons'/file).read_bytes())==files[file]
        manifest['inputs'][file]=files[file]
    for size in [36,72]:
        raw=out/f'{theme}-{size}.rgba'
        width,height=map(int,subprocess.check_output([str(out/'reference'),theme,str(size),str(raw),*[str(repo/'public/native-icons'/file) for file in filenames]],text=True).split())
        data=raw.read_bytes();assert len(data)==width*height*4
        filename=f'{theme}-{size}.png';encoded=png(width,height,data);(assets/filename).write_bytes(encoded)
        for index,name in enumerate(names):
            strip=bytearray()
            for y in range(size):
                row=(1+index*(size+1)+y)*width*4
                for state in range(4):
                    offset=row+(1+state*(size+1))*4
                    strip.extend(data[offset:offset+size*4])
            file=f'{name}-{theme}-{size}.png';encoded_strip=png(size*4,size,strip)
            (assets/file).write_bytes(encoded_strip)
            manifest['strips'].append({'file':file,'icon':name,'theme':theme,'size':size,'rgbaSha256':sha(strip),'sha256':sha(encoded_strip)})
        manifest['atlases'].append({'file':filename,'theme':theme,'size':size,'width':width,'height':height,'rgbaSha256':sha(data),'sha256':sha(encoded)})
(assets/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
print('Generated four exact native state atlases,15 icons in two themes and two resolutions.')
