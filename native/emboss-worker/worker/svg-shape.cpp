// GLGizmoSVG.cpp select_shape/get_tesselation_tolerance, pinned 8500fcd.
// Native NanoSVG + NSVGUtils perform parsing, fill/stroke conversion and centering.
// AGPL-3.0; NanoSVG retains its original zlib license in the pinned source.
#define NANOSVG_IMPLEMENTATION
#include <nanosvg/nanosvg.h>
#include "svg-shape.hpp"
#include <libslic3r/NSVGUtils.hpp>
#include <cmath>
#include <stdexcept>
Slic3r::EmbossShape native_svg_shape(const std::string &source, double tolerance_scale, double shape_scale) {
 using namespace Slic3r;
 if(source.empty() || source.size()>2*1024*1024 || source.find('\0')!=std::string::npos)throw std::runtime_error("SVG source exceeds 2 MiB or contains NUL");
 if(!std::isfinite(tolerance_scale)||tolerance_scale<.001||tolerance_scale>1000||!std::isfinite(shape_scale)||shape_scale<1e-12||shape_scale>1)throw std::runtime_error("SVG scale exceeds native worker bounds");
 auto image=Slic3r::nsvgParse(source,"mm",96.f);if(!image)throw std::runtime_error("Native NanoSVG parser rejected source");
 size_t shape_count=0,points=0;
 for(const NSVGshape *shape=image->shapes;shape;shape=shape->next){
  if(++shape_count>4096)throw std::runtime_error("SVG exceeds 4096 shapes");
  if(!std::isfinite(shape->strokeWidth)||std::abs(shape->strokeWidth)>100000)throw std::runtime_error("SVG stroke width exceeds coordinate bounds");
  for(const NSVGpath *path=shape->paths;path;path=path->next){
   if(path->npts<0||(points+=size_t(path->npts))>20000)throw std::runtime_error("SVG exceeds 20000 parsed curve points");
   for(int i=0;i<path->npts*2;++i)if(!std::isfinite(path->pts[i])||std::abs(path->pts[i])>100000)throw std::runtime_error("SVG coordinate exceeds 100000 mm");
  }
 }
 // Native tolerance is squared in integer coordinates and divided by current XY scale squared.
 const double tolerance=(.1*.1)/(SCALING_FACTOR*SCALING_FACTOR)/(tolerance_scale*tolerance_scale);
 NSVGLineParams params(tolerance);EmbossShape shape;shape.scale=shape_scale;
 shape.shapes_with_ids=create_shape_with_ids(*image,params);
 size_t linear_points=0;for(const auto &s:shape.shapes_with_ids)for(const auto &polygon:s.expoly){linear_points+=polygon.contour.points.size();for(const auto &hole:polygon.holes)linear_points+=hole.points.size();}
 if(linear_points>200000)throw std::runtime_error("Native SVG tessellation exceeds 200000 outline points");
 if(shape.shapes_with_ids.empty())throw std::runtime_error("SVG contains no visible fill or stroke paths to emboss");
 return shape;
}
