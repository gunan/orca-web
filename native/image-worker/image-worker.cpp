// SPDX-License-Identifier: AGPL-3.0-or-later
#include <wx/image.h>
#include <wx/log.h>

#include <filesystem>
#include <iostream>
#include <algorithm>
#define GERNERATE_IMAGE_RESIZE 0
#define GERNERATE_IMAGE_CROP_VERTICAL 1
bool load_image(const std::string &filename,wxImage &image){
  const wxString value=wxString::FromUTF8(filename),lower=value.Lower();
  const wxBitmapType type=lower.EndsWith(".png")?wxBITMAP_TYPE_PNG:lower.EndsWith(".bmp")?wxBITMAP_TYPE_BMP:(lower.EndsWith(".jpg")||lower.EndsWith(".jpeg"))?wxBITMAP_TYPE_JPEG:wxBITMAP_TYPE_INVALID;
  return type!=wxBITMAP_TYPE_INVALID&&image.LoadFile(value,type);
}
#include "native-cover-functions.hpp"
int main(int argc,char**argv){
  if(argc==2&&std::string(argv[1])=="--version"){
    std::cout<<"{\"protocol\":1,\"orcaVersion\":\"2.4.2\",\"orcaRevision\":\"8500fcdccaa10b5099ac20d252af3a7c560046f1\",\"wxVersion\":\"3.3.2\",\"wxRevision\":\"88f3483ca546fbf4ad732e1acd94cc930935077a\"}\n";return 0;
  }
  if(argc!=3){std::cerr<<"Expected input image and private output directory\n";return 2;}
  try{
    const std::filesystem::path input(argv[1]),output(argv[2]);
    if(!std::filesystem::is_regular_file(input)||std::filesystem::file_size(input)>32*1024*1024||!std::filesystem::is_directory(output))throw std::runtime_error("Invalid image input/output bounds");
    wxLog::SetActiveTarget(new wxLogStderr());wxImage::InitStandardHandlers();wxInitAllImageHandlers();
    wxImage original;if(!load_image(input.string(),original)||!original.IsOk()||original.GetWidth()<=0||original.GetHeight()<=0||original.GetWidth()>4096||original.GetHeight()>4096)throw std::runtime_error("Invalid or oversized image");
    struct Target {const char*filename;int width;int height;};
    for(const Target target: {Target{"thumbnail_3mf.png",240,240},Target{"thumbnail_small.png",252,188},Target{"thumbnail_middle.png",680,680}}){
      const float factor=std::min(original.GetHeight()/(float)target.height,original.GetWidth()/(float)target.width);
      const int w=(int)(original.GetWidth()/factor),h=(int)(original.GetHeight()/factor);
      if(w>16384||h>16384||(long long)w*h>16*1024*1024)throw std::runtime_error("Oversized native cover surface");
      wxImage result;
      if(!generate_image(input.string(),result,wxSize(target.width,target.height),GERNERATE_IMAGE_RESIZE)||!result.IsOk()||!result.SaveFile(wxString::FromUTF8((output/target.filename).string()),wxBITMAP_TYPE_PNG))throw std::runtime_error("Native cover generation failed");
    }
    std::cout<<"{\"protocol\":1,\"sourceWidth\":"<<original.GetWidth()<<",\"sourceHeight\":"<<original.GetHeight()<<"}\n";
    wxImage::CleanUpHandlers();return 0;
  }catch(const std::exception&error){std::cerr<<error.what()<<'\n';return 1;}
}
