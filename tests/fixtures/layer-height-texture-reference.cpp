// Three original OrcaSlicer 2.4.2 / 8500fcd Slicing.cpp functions unchanged.
// Independent source oracle; only vector/config/model types are shimmed.
// AGPL-3.0: see docs/native-schema/ORCASLICER-LICENSE.txt.
#include <algorithm>
#include <cassert>
#include <cmath>
#include <vector>
#include <map>
#include <iostream>
#include <iomanip>
using coordf_t=double;const double EPSILON=.0001;
template<class T,class N>T lerp(const T&a,const T&b,N t){return(N(1)-t)*a+t*b;}
bool is_approx(double a,double b){return std::abs(a-b)<EPSILON;}
template<class T>struct V3{T d[3];V3(T a,T b,T c):d{a,b,c}{}T operator()(int i)const{return d[i];}};
using Vec3crd=V3<int>;using Vec3d=V3<double>;
struct SlicingParameters{double min_layer_height=.08,max_layer_height=.3,layer_height=.2,first_object_layer_height=.2,top=20,object_shrinkage_compensation_z=1;bool fixed=true;bool first_object_layer_height_fixed()const{return fixed;}double object_print_z_height()const{return top*object_shrinkage_compensation_z;}double object_print_z_uncompensated_height()const{return top;}};
struct Option{double h;double getFloat()const{return h;}};struct Config{Option h;const Option*option(const char*)const{return &h;}};
using t_layer_height_range=std::pair<double,double>;using t_layer_config_ranges=std::map<t_layer_height_range,Config>;
void adjust_layer_series_to_align_object_height(const SlicingParameters&,std::vector<double>&){assert(false);}
std::vector<coordf_t> layer_height_profile_from_ranges(
	const SlicingParameters 	&slicing_params,
	const t_layer_config_ranges &layer_config_ranges)
{
    // 1) If there are any height ranges, trim one by the other to make them non-overlapping. Insert the 1st layer if fixed.
    std::vector<std::pair<t_layer_height_range,coordf_t>> ranges_non_overlapping;
    ranges_non_overlapping.reserve(layer_config_ranges.size() * 4);
    if (slicing_params.first_object_layer_height_fixed())
        ranges_non_overlapping.push_back(std::pair<t_layer_height_range,coordf_t>(
            t_layer_height_range(0., slicing_params.first_object_layer_height), 
            slicing_params.first_object_layer_height));
    // The height ranges are sorted lexicographically by low / high layer boundaries.
    for (t_layer_config_ranges::const_iterator it_range = layer_config_ranges.begin(); it_range != layer_config_ranges.end(); ++ it_range) {
        coordf_t lo = it_range->first.first;
        coordf_t hi = std::min(it_range->first.second, slicing_params.object_print_z_height());
        coordf_t height = it_range->second.option("layer_height")->getFloat();
        if (! ranges_non_overlapping.empty())
            // Trim current low with the last high.
            lo = std::max(lo, ranges_non_overlapping.back().first.second);
        if (lo + EPSILON < hi)
            // Ignore too narrow ranges.
            ranges_non_overlapping.push_back(std::pair<t_layer_height_range,coordf_t>(t_layer_height_range(lo, hi), height));
    }

    // 2) Convert the trimmed ranges to a height profile, fill in the undefined intervals between z=0 and z=slicing_params.object_print_z_max()
    // with slicing_params.layer_height
    std::vector<coordf_t> layer_height_profile;
    auto last_z = [&layer_height_profile]() {
        return layer_height_profile.empty() ? 0. : *(layer_height_profile.end() - 2);
    };
    auto lh_append = [&layer_height_profile](coordf_t z, coordf_t layer_height) {
        if (!layer_height_profile.empty()) {
            bool last_z_matches = is_approx(*(layer_height_profile.end() - 2), z);
            bool last_h_matches = is_approx(layer_height_profile.back(), layer_height);
            if (last_h_matches) {
                if (last_z_matches) {
                    // Drop a duplicate.
                    return;
                }
                if (layer_height_profile.size() >= 4 && is_approx(*(layer_height_profile.end() - 3), layer_height)) {
                    // Third repetition of the same layer_height. Update z of the last entry.
                    *(layer_height_profile.end() - 2) = z;
                    return;
                }
            }
        }
        layer_height_profile.push_back(z);
        layer_height_profile.push_back(layer_height);
    };

    for (const std::pair<t_layer_height_range, coordf_t>& non_overlapping_range : ranges_non_overlapping) {
        coordf_t lo = non_overlapping_range.first.first;
        coordf_t hi = non_overlapping_range.first.second;
        coordf_t height = non_overlapping_range.second;
        if (coordf_t z = last_z(); lo > z + EPSILON) {
            // Insert a step of normal layer height.
            lh_append(z, slicing_params.layer_height);
            lh_append(lo, slicing_params.layer_height);
        }
        // Insert a step of the overriden layer height.
        lh_append(lo, height);
        lh_append(hi, height);
    }

    if (coordf_t z = last_z(); z < slicing_params.object_print_z_uncompensated_height()) {
        // Insert a step of normal layer height up to the object top.
        lh_append(z, slicing_params.layer_height);
        lh_append(slicing_params.object_print_z_uncompensated_height(), slicing_params.layer_height);
    }

   	return layer_height_profile;
}

std::vector<coordf_t> generate_object_layers(
	const SlicingParameters 	&slicing_params,
	const std::vector<coordf_t> &layer_height_profile,
    bool is_precise_z_height)
{
    assert(! layer_height_profile.empty());

    coordf_t print_z = 0;
    coordf_t height  = 0;

    std::vector<coordf_t> out;

    if (slicing_params.first_object_layer_height_fixed()) {
        out.push_back(0);
        print_z = slicing_params.first_object_layer_height;
        out.push_back(print_z);
    }

    // Orca: XYZ shrinkage compensation
    const coordf_t shrinkage_compensation_z = slicing_params.object_shrinkage_compensation_z;
    size_t idx_layer_height_profile = 0;
    // loop until we have at least one layer and the max slice_z reaches the object height
    coordf_t slice_z = print_z + 0.5 * slicing_params.min_layer_height;
    while (slice_z < slicing_params.object_print_z_height()) {
        height = slicing_params.min_layer_height;
        if (idx_layer_height_profile < layer_height_profile.size()) {
            size_t next = idx_layer_height_profile + 2;
            for (;;) {
                // Orca: XYZ shrinkage compensation
                if (next >= layer_height_profile.size() || slice_z < layer_height_profile[next] * shrinkage_compensation_z)
                    break;
                idx_layer_height_profile = next;
                next += 2;
            }
            // Orca: XYZ shrinkage compensation
            const coordf_t z1 = layer_height_profile[idx_layer_height_profile] * shrinkage_compensation_z;
            const coordf_t h1 = layer_height_profile[idx_layer_height_profile + 1];
            height = h1;
            if (next < layer_height_profile.size()) {
                // Orca: XYZ shrinkage compensation
                const coordf_t z2 = layer_height_profile[next] * shrinkage_compensation_z;
                const coordf_t h2 = layer_height_profile[next + 1];
                height = lerp(h1, h2, (slice_z - z1) / (z2 - z1));
                assert(height >= slicing_params.min_layer_height - EPSILON && height <= slicing_params.max_layer_height + EPSILON);
            }
        }
        slice_z = print_z + 0.5 * height;
        if (slice_z >= slicing_params.object_print_z_height())
            break;
        assert(height > slicing_params.min_layer_height - EPSILON);
        assert(height < slicing_params.max_layer_height + EPSILON);
        out.push_back(print_z);
        print_z += height;
        slice_z = print_z + 0.5 * slicing_params.min_layer_height;
        out.push_back(print_z);
    }

    if (is_precise_z_height)
        adjust_layer_series_to_align_object_height(slicing_params, out);
    return out;
}

int generate_layer_height_texture(
	const SlicingParameters 	&slicing_params,
	const std::vector<coordf_t> &layers,
	void *data, int rows, int cols, bool level_of_detail_2nd_level)
{
// https://github.com/aschn/gnuplot-colorbrewer
    std::vector<Vec3crd> palette_raw;
    palette_raw.push_back(Vec3crd(0x01A, 0x098, 0x050));
    palette_raw.push_back(Vec3crd(0x066, 0x0BD, 0x063));
    palette_raw.push_back(Vec3crd(0x0A6, 0x0D9, 0x06A));
    palette_raw.push_back(Vec3crd(0x0D9, 0x0F1, 0x0EB));
    palette_raw.push_back(Vec3crd(0x0FE, 0x0E6, 0x0EB));
    palette_raw.push_back(Vec3crd(0x0FD, 0x0AE, 0x061));
    palette_raw.push_back(Vec3crd(0x0F4, 0x06D, 0x043));
    palette_raw.push_back(Vec3crd(0x0D7, 0x030, 0x027));

    // Clear the main texture and the 2nd LOD level.
//	memset(data, 0, rows * cols * (level_of_detail_2nd_level ? 5 : 4));
    // 2nd LOD level data start
    unsigned char *data1 = reinterpret_cast<unsigned char*>(data) + rows * cols * 4;
    int ncells  = std::min((cols-1) * rows, int(ceil(16. * (slicing_params.object_print_z_height() / slicing_params.min_layer_height))));
    int ncells1 = ncells / 2;
    int cols1   = cols / 2;
    coordf_t z_to_cell = coordf_t(ncells-1) / slicing_params.object_print_z_height();
    coordf_t cell_to_z = slicing_params.object_print_z_height() / coordf_t(ncells-1);
    coordf_t z_to_cell1 = coordf_t(ncells1-1) / slicing_params.object_print_z_height();
    // for color scaling
	coordf_t hscale = 2.f * std::max(slicing_params.max_layer_height - slicing_params.layer_height, slicing_params.layer_height - slicing_params.min_layer_height);
	if (hscale == 0)
		// All layers have the same height. Provide some height scale to avoid division by zero.
		hscale = slicing_params.layer_height;
    for (size_t idx_layer = 0; idx_layer < layers.size(); idx_layer += 2) {
        coordf_t lo  = layers[idx_layer];
		coordf_t hi  = layers[idx_layer + 1];
        coordf_t mid = 0.5f * (lo + hi);
		assert(mid <= slicing_params.object_print_z_height());
		coordf_t h = hi - lo;
		hi = std::min(hi, slicing_params.object_print_z_height());
        int cell_first = std::clamp(int(ceil(lo * z_to_cell)), 0, ncells-1);
        int cell_last  = std::clamp(int(floor(hi * z_to_cell)), 0, ncells-1);
        for (int cell = cell_first; cell <= cell_last; ++ cell) {
            coordf_t idxf = (0.5 * hscale + (h - slicing_params.layer_height)) * coordf_t(palette_raw.size()-1) / hscale;
            int idx1 = std::clamp(int(floor(idxf)), 0, int(palette_raw.size() - 1));
            int idx2 = std::min(int(palette_raw.size() - 1), idx1 + 1);
			coordf_t t = idxf - coordf_t(idx1);
            const Vec3crd &color1 = palette_raw[idx1];
            const Vec3crd &color2 = palette_raw[idx2];
            coordf_t z = cell_to_z * coordf_t(cell);
            assert(lo - EPSILON <= z && z <= hi + EPSILON);
            // Intensity profile to visualize the layers.
            coordf_t intensity = cos(M_PI * 0.7 * (mid - z) / h);
            // Color mapping from layer height to RGB.
            Vec3d color(
                intensity * lerp(coordf_t(color1(0)), coordf_t(color2(0)), t), 
                intensity * lerp(coordf_t(color1(1)), coordf_t(color2(1)), t),
                intensity * lerp(coordf_t(color1(2)), coordf_t(color2(2)), t));
            int row = cell / (cols - 1);
            int col = cell - row * (cols - 1);
			assert(row >= 0 && row < rows);
			assert(col >= 0 && col < cols);
            unsigned char *ptr = (unsigned char*)data + (row * cols + col) * 4;
            ptr[0] = (unsigned char)std::clamp(int(floor(color(0) + 0.5)), 0, 255);
            ptr[1] = (unsigned char)std::clamp(int(floor(color(1) + 0.5)), 0, 255);
            ptr[2] = (unsigned char)std::clamp(int(floor(color(2) + 0.5)), 0, 255);
            ptr[3] = 255;
            if (col == 0 && row > 0) {
                // Duplicate the first value in a row as a last value of the preceding row.
                ptr[-4] = ptr[0];
                ptr[-3] = ptr[1];
                ptr[-2] = ptr[2];
                ptr[-1] = ptr[3];
            }
        }
        if (level_of_detail_2nd_level) {
            cell_first = std::clamp(int(ceil(lo * z_to_cell1)), 0, ncells1-1);
            cell_last  = std::clamp(int(floor(hi * z_to_cell1)), 0, ncells1-1);
            for (int cell = cell_first; cell <= cell_last; ++ cell) {
                coordf_t idxf = (0.5 * hscale + (h - slicing_params.layer_height)) * coordf_t(palette_raw.size()-1) / hscale;
                int idx1 = std::clamp(int(floor(idxf)), 0, int(palette_raw.size() - 1));
                int idx2 = std::min(int(palette_raw.size() - 1), idx1 + 1);
    			coordf_t t = idxf - coordf_t(idx1);
                const Vec3crd &color1 = palette_raw[idx1];
                const Vec3crd &color2 = palette_raw[idx2];
                // Color mapping from layer height to RGB.
                Vec3d color(
                    lerp(coordf_t(color1(0)), coordf_t(color2(0)), t), 
                    lerp(coordf_t(color1(1)), coordf_t(color2(1)), t),
                    lerp(coordf_t(color1(2)), coordf_t(color2(2)), t));
                int row = cell / (cols1 - 1);
                int col = cell - row * (cols1 - 1);
    			assert(row >= 0 && row < rows/2);
    			assert(col >= 0 && col < cols/2);
                unsigned char *ptr = data1 + (row * cols1 + col) * 4;
                ptr[0] = (unsigned char)std::clamp(int(floor(color(0) + 0.5)), 0, 255);
                ptr[1] = (unsigned char)std::clamp(int(floor(color(1) + 0.5)), 0, 255);
                ptr[2] = (unsigned char)std::clamp(int(floor(color(2) + 0.5)), 0, 255);
                ptr[3] = 255;
                if (col == 0 && row > 0) {
                    // Duplicate the first value in a row as a last value of the preceding row.
                    ptr[-4] = ptr[0];
                    ptr[-3] = ptr[1];
                    ptr[-2] = ptr[2];
                    ptr[-1] = ptr[3];
                }
            }
        }
    }

    // Returns number of cells of the 0th LOD level.
    return ncells;
}
void array(const std::vector<double>&v){std::cout<<"[";for(size_t i=0;i<v.size();i++){if(i)std::cout<<",";std::cout<<v[i];}std::cout<<"]";}
void emit(int id,SlicingParameters p,t_layer_config_ranges ranges,std::vector<double> profile={}){const auto initial=layer_height_profile_from_ranges(p,ranges);if(profile.empty())profile=initial;const auto layers=generate_object_layers(p,profile,false);int rows=128,cols=128;std::vector<unsigned char>bytes(rows*cols*5,0);const int cells=generate_layer_height_texture(p,layers,bytes.data(),rows,cols,true);std::cout<<"{\"id\":"<<id<<",\"context\":{\"objectHeight\":"<<p.top<<",\"firstLayerHeight\":"<<p.first_object_layer_height<<",\"layerHeight\":"<<p.layer_height<<",\"minLayerHeight\":"<<p.min_layer_height<<",\"maxLayerHeight\":"<<p.max_layer_height<<",\"firstLayerFixed\":"<<(p.fixed?"true":"false")<<",\"shrinkageCompensationZ\":"<<p.object_shrinkage_compensation_z<<",\"ranges\":[";bool first=true;for(const auto &entry:ranges){if(!first)std::cout<<",";first=false;std::cout<<"{\"minZ\":"<<entry.first.first<<",\"maxZ\":"<<entry.first.second<<",\"settings\":{\"layer_height\":\""<<entry.second.h.h<<"\"}}";}std::cout<<"]},\"initial\":";array(initial);std::cout<<",\"profile\":";array(profile);std::cout<<",\"layers\":";array(layers);std::cout<<",\"width\":"<<cols<<",\"height\":"<<rows<<",\"cells\":"<<cells<<",\"hex\":\"";const char hex[]="0123456789abcdef";for(auto c:bytes)std::cout<<hex[c>>4]<<hex[c&15];std::cout<<"\"}";}
int main(){std::cout<<std::setprecision(17)<<"[";SlicingParameters p;emit(0,p,{});std::cout<<",";p.first_object_layer_height=.3;emit(1,p,{});std::cout<<",";p.first_object_layer_height=.2;emit(2,p,{}, {0,.2,.2,.2,.2,.08,3,.3,8,.1,20,.2});std::cout<<",";emit(3,p,{{{0,2},{{.12}}},{{4,8},{{.1}}},{{6,12},{{.25}}},{{19,25},{{.16}}}});std::cout<<",";p.fixed=false;emit(4,p,{{{3,6},{{.12}}}});std::cout<<",";p.fixed=true;p.object_shrinkage_compensation_z=1.03;emit(5,p,{});std::cout<<",";p.object_shrinkage_compensation_z=1;p.min_layer_height=.2;p.max_layer_height=.2;emit(6,p,{});std::cout<<",";p.min_layer_height=.08;p.max_layer_height=.3;p.first_object_layer_height=.35;emit(7,p,{});std::cout<<"]\n";}
