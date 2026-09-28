#pragma once
#include <cstdint>
namespace Int128 {inline int sign_determinant_2x2_filtered(int64_t a,int64_t b,int64_t c,int64_t d){__int128 result=(__int128)a*d-(__int128)b*c;return(result>0)-(result<0);}}
