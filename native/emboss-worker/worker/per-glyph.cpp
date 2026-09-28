// OrcaSlicer 2.4.2, AGPL-3.0; GUI TextLines.cpp select_closest_contour/init,
// EmbossJob.cpp create_line_bounds/create_mesh_per_glyph/cut_per_glyph_surface.
// GUI rendering, ModelVolume and StyleManager plumbing are replaced by bounded
// request geometry/font data. Mesh slicing, contour sampling and CGAL are native.
#include "per-glyph.hpp"
#include <libslic3r/TriangleMeshSlicer.hpp>
#include <libslic3r/AABBTreeLines.hpp>
#include <libslic3r/ExPolygonsIndex.hpp>
#include <libslic3r/ClipperUtils.hpp>
using namespace Slic3r;
using namespace Slic3r::Emboss;
namespace {
TextLines text_lines(const Transform3d& text_tr,const std::vector<EmbossSource>&sources,const FontFile&ff,const FontProp&fp,unsigned count){
 if(count==0||count>128)throw std::runtime_error("Per-glyph layout requires 1–128 text lines");
 const double line_height=get_line_height(ff,fp)*get_text_shape_scale(fp,ff);
 if(!(line_height>0))throw std::runtime_error("Native font has invalid line height");
 const double first=fp.size_in_mm*(1/3.)+get_align_y_offset_in_mm(fp.align.second,count,ff,fp);
 const Transform3d inverse=(text_tr*Eigen::AngleAxisd(-M_PI_2,Vec3d::UnitX())).inverse();
 std::vector<Polygons> contours(count);std::vector<float> centers(count);
 for(unsigned i=0;i<count;++i){
  centers[i]=static_cast<float>(first-i*line_height);
  for(const auto&source:sources){MeshSlicingParams params;params.trafo=inverse*source.tr;Polygons p=slice_mesh(source.geometry,centers[i],params);contours[i].insert(contours[i].end(),p.begin(),p.end());}
  // Native fallback for lines near an object edge: slice at the text origin.
  if(contours[i].empty())for(const auto&source:sources){MeshSlicingParams params;params.trafo=inverse*source.tr;Polygons p=slice_mesh(source.geometry,0.f,params);contours[i].insert(contours[i].end(),p.begin(),p.end());}
 }
 TextLines result;result.reserve(count);
 for(unsigned i=0;i<count;++i){
  if(contours[i].empty())throw std::runtime_error("Native per-glyph layout found no cross-section; move text onto its object or disable per-glyph");
  ExPolygons polygons=union_ex(contours[i]);auto lines=to_linesf(polygons);
  if(lines.empty())throw std::runtime_error("Native per-glyph cross-section contains no closed contour");
  auto tree=AABBTreeLines::build_aabb_tree_over_indexed_lines(lines);size_t index=0;Vec2d hit;
  AABBTreeLines::squared_distance_to_indexed_lines(lines,tree,Vec2d(0.,0.),index,hit);
  ExPolygonsIndices conversion(polygons);const auto at=conversion.cvt(static_cast<uint32_t>(index));
  const Polygon&polygon=at.is_contour()?polygons[at.expolygons_index].contour:polygons[at.expolygons_index].holes[at.hole_index()];
  result.push_back(TextLine{polygon,PolygonPoint{at.point_index,hit.cast<Point::coord_type>()},centers[i]});
 }
 return result;
}
std::vector<BoundingBoxes> line_bounds(const ExPolygonsWithIds&shapes){
 std::vector<BoundingBoxes> result(get_count_lines(shapes));size_t index=0;
 for(const auto&shape:shapes){if(index>=result.size())throw std::runtime_error("Native glyph line layout mismatch");BoundingBox bb;if(!shape.expoly.empty())bb=get_extents(shape.expoly);result[index].push_back(bb);if(shape.id==ENTER_UNICODE)++index;}
 return result;
}
}
indexed_triangle_set native_per_glyph(const EmbossShape&shape,const FontFile&ff,const FontProp&fp,const Transform3d&transform,const std::vector<EmbossSource>&sources,float depth,bool outside,const GlyphSurface&surface){
 const auto bounds=line_bounds(shape.shapes_with_ids);const auto lines=text_lines(transform,sources,ff,fp,unsigned(bounds.size()));
 indexed_triangle_set result;size_t offset=0;const coord_t tangent_distance=static_cast<coord_t>(std::round(scale_(5.)));
 for(size_t line_index=0;line_index<lines.size();++line_index){
  const auto&bbs=bounds[line_index];const auto&line=lines[line_index];auto samples=sample_slice(line,bbs,shape.scale);auto angles=calculate_angles(tangent_distance,samples,line.polygon);
  for(size_t i=0;i<bbs.size();++i){const auto&bb=bbs[i];if(!bb.defined)continue;
   const auto rotate=Eigen::AngleAxisd(angles[i]+M_PI_2,Vec3d::UnitY());const Vec2d point=unscale(samples[i].point);const auto translation=Eigen::Translation3d(point.x(),0.,-point.y());
   indexed_triangle_set glyph;
   if(surface){
    ExPolygons polygons=shape.shapes_with_ids[offset+i].expoly;Point delta(-bb.center().x(),0);for(auto&polygon:polygons)polygon.translate(delta);
    const Transform3d modify=translation*rotate;glyph=surface(polygons,transform*modify);its_transform(glyph,modify);
   }else{
    const Vec2d center=bb.center().cast<double>()*shape.scale;const float surface_offset=outside?-.015f:(-depth+.015f);
    const Transform3d tr=translation*rotate*Eigen::Translation3d(-center.x(),0.,double(surface_offset))*Eigen::Scaling(shape.scale);
    ProjectTransform projection(std::make_unique<ProjectZ>(depth/shape.scale),tr);glyph=polygons2model(shape.shapes_with_ids[offset+i].expoly,projection);
   }
   if(result.vertices.size()+glyph.vertices.size()>1000000||result.indices.size()+glyph.indices.size()>1000000)throw std::runtime_error("Per-glyph mesh exceeds worker output limits");
   its_merge(result,glyph);
  }
  offset+=bbs.size();
 }
 if(result.empty())throw std::runtime_error("Native per-glyph layout produced no geometry");return result;
}
