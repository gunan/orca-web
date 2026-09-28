#pragma once
#include <functional>
// Only Model declarations need these callback types. The STEP implementation
// is outside this read-only 3MF worker and is not linked.
#define slic3r_Format_STEP_hpp_
namespace Slic3r { class Step; using ImportStepProgressFn=std::function<void(int,int,int,bool&)>; using StepIsUtf8Fn=std::function<void(bool)>; }
