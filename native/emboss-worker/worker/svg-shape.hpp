// OrcaSlicer 2.4.2 SVG orchestration; AGPL-3.0, see ../LICENSE.txt.
#pragma once
#include <libslic3r/EmbossShape.hpp>
#include <string>
Slic3r::EmbossShape native_svg_shape(const std::string &source, double tolerance_scale, double shape_scale);
