// SPDX-License-Identifier: AGPL-3.0-only
#pragma once
#include "libslic3r/ModelArrange.hpp"
#include <nlohmann/json.hpp>
#include <optional>
std::optional<Slic3r::arrangement::ArrangePolygon> native_fill_tower(
    const nlohmann::json& preview_request, const Slic3r::DynamicPrintConfig& config,
    int plate_index, const Slic3r::Vec2d& plate_size, const Slic3r::Vec2d& origin);
nlohmann::json fill_tower_diagnostic(const Slic3r::arrangement::ArrangePolygon& tower);
