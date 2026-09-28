#include <vector>
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
bool GLTexture::load_from_svg_files_as_sprites_array(const std::vector<std::string>& filenames, const std::vector<std::pair<int, bool>>& states, unsigned int sprite_size_px, bool compress)
{
    reset();

    if (filenames.empty() || states.empty() || sprite_size_px == 0)
        return false;

    bool dark_mode = wxGetApp().app_config->get("dark_color_mode") == "1";

    // every tile needs to have a 1px border around it to avoid artifacts when linear sampling on its edges
    unsigned int sprite_size_px_ex = sprite_size_px + 1;

    m_width = 1 + (int)(sprite_size_px_ex * states.size());
    m_height = 1 + (int)(sprite_size_px_ex * filenames.size());

    int n_pixels = m_width * m_height;
    int sprite_n_pixels = sprite_size_px_ex * sprite_size_px_ex;
    int sprite_stride = sprite_size_px_ex * 4;
    int sprite_bytes = sprite_n_pixels * 4;

    if (n_pixels <= 0) {
        reset();
        return false;
    }

    std::vector<unsigned char> data(n_pixels * 4, 0);
    std::vector<unsigned char> sprite_data(sprite_bytes, 0);
    std::vector<unsigned char> sprite_white_only_data(sprite_bytes, 0); // normal
    std::vector<unsigned char> sprite_gray_only_data(sprite_bytes, 0); // disable
    std::vector<unsigned char> output_data(sprite_bytes, 0);

    //BBS
    std::vector<unsigned char> pressed_data(sprite_bytes, 0); // (gizmo) pressed
    std::vector<unsigned char> disable_data(sprite_bytes, 0);
    std::vector<unsigned char> hover_data(sprite_bytes, 0); // hover

    const unsigned char pressed_color[3] = {255, 255, 255};
    const unsigned char hover_color[3] = {255, 255, 255};
    const unsigned char normal_color[3] = {43, 52, 54};
    const unsigned char disable_color[3] = {200, 200, 200};
    const unsigned char pressed_color_dark[3] = {60, 60, 65};
    const unsigned char hover_color_dark[3] = {60, 60, 65};
    const unsigned char normal_color_dark[3] = {182, 182, 182};
    const unsigned char disable_color_dark[3] = {76, 76, 85};

    NSVGrasterizer* rast = nsvgCreateRasterizer();
    if (rast == nullptr) {
        reset();
        return false;
    }

    int sprite_id = -1;
    for (const std::string& filename : filenames) {
        ++sprite_id;

        if (!boost::filesystem::exists(filename))
            continue;

        if (!boost::algorithm::iends_with(filename, ".svg"))
            continue;

        NSVGimage* image = nsvgParseFromFile(filename.c_str(), "px", 96.0f);
        if (image == nullptr)
            continue;

        float scale = (float)sprite_size_px / std::max(image->width, image->height);

        // offset by 1 to leave the first pixel empty (both in x and y)
        nsvgRasterize(rast, image, 1, 1, scale, sprite_data.data(), sprite_size_px, sprite_size_px, sprite_stride);

        ::memcpy((void*)pressed_data.data(), (const void*)sprite_data.data(), sprite_bytes);
        for (int i = 0; i < sprite_n_pixels; ++i) {
            int offset = i * 4;
            if (pressed_data.data()[offset + 0] == 0 &&
                pressed_data.data()[offset + 1] == 0 &&
                pressed_data.data()[offset + 2] == 0) {
                hover_data.data()[offset + 0] = dark_mode ? pressed_color_dark[0] : pressed_color[0];
                hover_data.data()[offset + 0] = dark_mode ? pressed_color_dark[1] : pressed_color[1];
                hover_data.data()[offset + 0] = dark_mode ? pressed_color_dark[2] : pressed_color[2];
            }
        }

        ::memcpy((void*)disable_data.data(), (const void*)sprite_data.data(), sprite_bytes);
        for (int i = 0; i < sprite_n_pixels; ++i) {
            int offset = i * 4;
            if (disable_data.data()[offset] != 0)
                ::memset((void*)&disable_data.data()[offset], 200, 3);
        }

        ::memcpy((void*)hover_data.data(), (const void*)sprite_data.data(), sprite_bytes);
        for (int i = 0; i < sprite_n_pixels; ++i) {
            int offset = i * 4;
            if (hover_data.data()[offset + 0] == 0 &&
                hover_data.data()[offset + 1] == 0 &&
                hover_data.data()[offset + 2] == 0)
            {
                hover_data.data()[offset + 0] = dark_mode ? hover_color_dark[0] : hover_color[0];
                hover_data.data()[offset + 1] = dark_mode ? hover_color_dark[1] : hover_color[1];
                hover_data.data()[offset + 2] = dark_mode ? hover_color_dark[2] : hover_color[2];
            }
        }

        ::memcpy((void*)sprite_white_only_data.data(), (const void*)sprite_data.data(), sprite_bytes);
        for (int i = 0; i < sprite_n_pixels; ++i) {
            int offset = i * 4;
            if (sprite_white_only_data.data()[offset + 0] != 0 ||
                sprite_white_only_data.data()[offset + 1] != 0 ||
                sprite_white_only_data.data()[offset + 2] != 0) {
                sprite_white_only_data.data()[offset + 0] = dark_mode ? normal_color_dark[0] : normal_color[0];
                sprite_white_only_data.data()[offset + 1] = dark_mode ? normal_color_dark[1] : normal_color[1];
                sprite_white_only_data.data()[offset + 2] = dark_mode ? normal_color_dark[2] : normal_color[2];
            }
        }

        ::memcpy((void*)sprite_gray_only_data.data(), (const void*)sprite_data.data(), sprite_bytes);
        for (int i = 0; i < sprite_n_pixels; ++i) {
            int offset = i * 4;
            if (sprite_gray_only_data.data()[offset + 0] != 0 ||
                sprite_gray_only_data.data()[offset + 1] != 0 ||
                sprite_gray_only_data.data()[offset + 2] != 0) {
                sprite_gray_only_data.data()[offset + 0] = dark_mode ? disable_color_dark[0] : disable_color[0];
                sprite_gray_only_data.data()[offset + 1] = dark_mode ? disable_color_dark[1] : disable_color[1];
                sprite_gray_only_data.data()[offset + 2] = dark_mode ? disable_color_dark[2] : disable_color[2];
            }
        }


        int sprite_offset_px = sprite_id * (int)sprite_size_px_ex * m_width;
        int state_id = -1;
        for (const std::pair<int, bool>& state : states) {
            ++state_id;

            // select the sprite variant
            std::vector<unsigned char>* src = nullptr;
            switch (state.first)
            {
            case 1: { src = &sprite_white_only_data; break; }
            case 2: { src = &sprite_gray_only_data; break; }
            default: { src = &hover_data; break; }
            }

            // applies background, if needed
            if (state.second) {
                src = &pressed_data;
            }

            ::memcpy((void*)output_data.data(), (const void*)src->data(), sprite_bytes);

            //BBS use BBS pressed style
            //if (state.second) {
            //    float inv_255 = 1.0f / 255.0f;
            //    // offset by 1 to leave the first pixel empty (both in x and y)
            //    for (unsigned int r = 1; r <= sprite_size_px; ++r) {
            //        unsigned int offset_r = r * sprite_size_px_ex;
            //        for (unsigned int c = 1; c <= sprite_size_px; ++c) {
            //            unsigned int offset = (offset_r + c) * 4;
            //            float alpha = (float)output_data.data()[offset + 3] * inv_255;
            //            output_data.data()[offset + 0] = (unsigned char)(output_data.data()[offset + 0] * alpha);
            //            output_data.data()[offset + 1] = (unsigned char)(output_data.data()[offset + 1] * alpha);
            //            output_data.data()[offset + 2] = (unsigned char)(output_data.data()[offset + 2] * alpha);
            //            output_data.data()[offset + 3] = (unsigned char)(128 * (1.0f - alpha) + output_data.data()[offset + 3] * alpha);
            //        }
            //    }
            //}

            int state_offset_px = sprite_offset_px + state_id * sprite_size_px_ex;
            for (int j = 0; j < (int)sprite_size_px_ex; ++j) {
                ::memcpy((void*)&data.data()[(state_offset_px + j * m_width) * 4], (const void*)&output_data.data()[j * sprite_stride], sprite_stride);
            }
        }

        nsvgDelete(image);
    }

    nsvgDeleteRasterizer(rast);

    // sends data to gpu
    glsafe(::glPixelStorei(GL_UNPACK_ALIGNMENT, 1));
    glsafe(::glGenTextures(1, &m_id));
    glsafe(::glBindTexture(GL_TEXTURE_2D, m_id));
    if (compress && OpenGLManager::are_compressed_textures_supported())
        glsafe(::glTexImage2D(GL_TEXTURE_2D, 0, GL_COMPRESSED_RGBA_S3TC_DXT5_EXT, (GLsizei)m_width, (GLsizei)m_height, 0, GL_RGBA, GL_UNSIGNED_BYTE, (const void*)data.data()));
    else
        glsafe(::glTexImage2D(GL_TEXTURE_2D, 0, GL_RGBA, (GLsizei)m_width, (GLsizei)m_height, 0, GL_RGBA, GL_UNSIGNED_BYTE, (const void*)data.data()));
    glsafe(::glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_LINEAR));
    glsafe(::glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MAX_LEVEL, 0));
    glsafe(::glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_LINEAR));

    glsafe(::glBindTexture(GL_TEXTURE_2D, 0));

    m_source = filenames.front();

#if 0
    // debug output
    static int pass = 0;
    ++pass;

    wxImage output(m_width, m_height);
    output.InitAlpha();

    for (int h = 0; h < m_height; ++h) {
        int px_h = h * m_width;
        for (int w = 0; w < m_width; ++w) {
            int offset = (px_h + w) * 4;
            output.SetRGB(w, h, data.data()[offset + 0], data.data()[offset + 1], data.data()[offset + 2]);
            output.SetAlpha(w, h, data.data()[offset + 3]);
        }
    }

    std::string out_filename = resources_dir() + "/images/test_" + std::to_string(pass) + ".png";
    output.SaveFile(out_filename, wxBITMAP_TYPE_PNG);
#endif // 0

    return true;
}

int main(int argc,char**argv){if(argc<5)return 2;dark=std::string(argv[1])=="dark";int size=std::stoi(argv[2]);std::vector<std::string>files;for(int i=4;i<argc;++i)files.emplace_back(argv[i]);GLTexture t;
if(!t.load_from_svg_files_as_sprites_array(files,{{1,false},{0,false},{0,true},{2,false}},size,false))return 3;
std::ofstream f(argv[3],std::ios::binary);f.write(reinterpret_cast<const char*>(captured.data()),captured.size());std::cout<<t.m_width<<" "<<t.m_height;}
