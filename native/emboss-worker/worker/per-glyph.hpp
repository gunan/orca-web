// OrcaSlicer 2.4.2, AGPL-3.0. Adapted from TextLines.cpp and EmbossJob.cpp.
#pragma once
#include <libslic3r/Emboss.hpp>
#include <libslic3r/TriangleMesh.hpp>
#include <functional>
struct EmbossSource {indexed_triangle_set geometry;Slic3r::Transform3d tr;};
using GlyphSurface=std::function<indexed_triangle_set(const Slic3r::ExPolygons&,const Slic3r::Transform3d&)>;
indexed_triangle_set native_per_glyph(const Slic3r::EmbossShape&,const Slic3r::Emboss::FontFile&,const Slic3r::FontProp&,const Slic3r::Transform3d&,const std::vector<EmbossSource>&,float,bool,const GlyphSurface&);
