// Reference fixture generator: unmodified adaptive/smoothing functions from
// OrcaSlicer 2.4.2 commit 8500fcdccaa10b5099ac20d252af3a7c560046f1.
// AGPL-3.0; see repository native-source licensing notices.
// Shim types only replace model plumbing and provide analytic triangle normals.
#include <algorithm>
#include <cassert>
#include <cmath>
#include <cfloat>
#include <iomanip>
#include <iostream>
#include <map>
#include <vector>
#include <utility>
using coordf_t=double;constexpr double EPSILON=.0001;constexpr double LAYER_HEIGHT_CHANGE_STEP=.04;
template<class T,class N>T lerp(const T&a,const T&b,N t){return(N(1)-t)*a+t*b;}
struct SlicingParameters{double min_layer_height=.08,max_layer_height=.3,layer_height=.2,first_object_layer_height=.2,top=20;bool first_object_layer_height_fixed()const{return true;}double object_print_z_uncompensated_height()const{return top;}};
struct Option{double value;double opt_float(const char*)const{return value;}};
struct FaceZ{std::pair<float,float>z_span;float n_cos,n_sin;};
struct ModelObject{std::vector<FaceZ>faces;std::map<std::pair<double,double>,Option>layer_config_ranges;};
struct SlicingAdaptive{using FaceZ=::FaceZ;SlicingParameters m_slicing_params;std::vector<FaceZ>m_faces;void set_slicing_parameters(const SlicingParameters&p){m_slicing_params=p;}void prepare(const ModelObject&object){m_faces=object.faces;std::sort(m_faces.begin(),m_faces.end(),[](const FaceZ&a,const FaceZ&b){return a.z_span<b.z_span;});}float next_layer_height(float,float,size_t&);};
struct HeightProfileSmoothingParams{unsigned radius;bool keep_min;};
static inline float layer_height_from_slope(const SlicingAdaptive::FaceZ &face, float max_surface_deviation)
{
// @platch's formula, see his paper "Adaptive Slicing for the FDM Process Revisited".
//    return float(max_surface_deviation / (SURFACE_CONST + 0.5 * std::abs(normal_z)));
	
// Constant stepping in horizontal direction, as used by Cura.
//    return (face.n_cos > 1e-5) ? float(max_surface_deviation * face.n_sin / face.n_cos) : FLT_MAX;

// Constant error measured as an area of the surface error triangle, Vojtech's formula.
//    return (face.n_cos > 1e-5) ? float(1.44 * max_surface_deviation * sqrt(face.n_sin / face.n_cos)) : FLT_MAX;

// Constant error measured as an area of the surface error triangle, Vojtech's formula with clamping to roughness at 90 degrees.
    return std::min(max_surface_deviation / 0.184f, (face.n_cos > 1e-5) ? float(1.44 * max_surface_deviation * sqrt(face.n_sin / face.n_cos)) : FLT_MAX);

// Constant stepping along the surface, equivalent to the "surface roughness" metric by Perez and later Pandey et all, see @platch's paper for references.
//    return float(max_surface_deviation * face.n_sin);
}

float SlicingAdaptive::next_layer_height(const float print_z, float quality_factor, size_t &current_facet)
{
	float  height = (float)m_slicing_params.max_layer_height;

	float  max_surface_deviation;

	{
#if 0
// @platch's formula for quality:
	    double delta_min = SURFACE_CONST * m_slicing_params.min_layer_height;
	    double delta_mid = (SURFACE_CONST + 0.5) * m_slicing_params.layer_height;
	    double delta_max = (SURFACE_CONST + 0.5) * m_slicing_params.max_layer_height;
#else
// Vojtech's formula for triangle area error metric.
	    double delta_min = m_slicing_params.min_layer_height;
	    double delta_mid = m_slicing_params.layer_height;
	    double delta_max = m_slicing_params.max_layer_height;
#endif
	    max_surface_deviation = (quality_factor < 0.5f) ?
	    	lerp(delta_min, delta_mid, 2. * quality_factor) :
	    	lerp(delta_max, delta_mid, 2. * (1. - quality_factor));
	}
	
	// find all facets intersecting the slice-layer
	size_t ordered_id = current_facet;
	{
		bool first_hit = false;
		for (; ordered_id < m_faces.size(); ++ ordered_id) {
	        const std::pair<float, float> &zspan = m_faces[ordered_id].z_span;
	        // facet's minimum is higher than slice_z -> end loop
			if (zspan.first >= print_z)
				break;
			// facet's maximum is higher than slice_z -> store the first event for next cusp_height call to begin at this point
			if (zspan.second > print_z) {
				// first event?
				if (! first_hit) {
					first_hit = true;
					current_facet = ordered_id;
	            }
				// skip touching facets which could otherwise cause small cusp values
				if (zspan.second < print_z + EPSILON)
					continue;
				// compute cusp-height for this facet and store minimum of all heights
				height = std::min(height, layer_height_from_slope(m_faces[ordered_id], max_surface_deviation));
	        }
		}
	}

	// lower height limit due to printer capabilities
	height = std::max(height, float(m_slicing_params.min_layer_height));

	// check for sloped facets inside the determined layer and correct height if necessary
	if (height > float(m_slicing_params.min_layer_height)) {
		for (; ordered_id < m_faces.size(); ++ ordered_id) {
            const std::pair<float, float> &zspan = m_faces[ordered_id].z_span;
            // facet's minimum is higher than slice_z + height -> end loop
			if (zspan.first >= print_z + height)
				break;

			// skip touching facets which could otherwise cause small cusp values
			if (zspan.second < print_z + EPSILON)
				continue;

			// Compute cusp-height for this facet and check against height.
            float reduced_height = layer_height_from_slope(m_faces[ordered_id], max_surface_deviation);

			float z_diff = zspan.first - print_z;
			if (reduced_height < z_diff) {
				assert(z_diff < height + EPSILON);
				// The currently visited triangle's slope limits the next layer height so much, that
				// the lowest point of the currently visible triangle is already above the newly proposed layer height.
				// This means, that we need to limit the layer height so that the offending newly visited triangle
				// is just above of the new layer.
#ifdef ADAPTIVE_LAYER_HEIGHT_DEBUG
                BOOST_LOG_TRIVIAL(trace) << "cusp computation, height is reduced from " << height << "to " << z_diff << " due to z-diff";
#endif /* ADAPTIVE_LAYER_HEIGHT_DEBUG */
				height = z_diff;
			} else if (reduced_height < height) {
#ifdef ADAPTIVE_LAYER_HEIGHT_DEBUG
				BOOST_LOG_TRIVIAL(trace) << "adaptive layer computation: height is reduced from " << height << "to " << reduced_height << " due to higher facet";
#endif /* ADAPTIVE_LAYER_HEIGHT_DEBUG */
				height = reduced_height;
			}
		}
		// lower height limit due to printer capabilities again
		height = std::max(height, float(m_slicing_params.min_layer_height));
	}

#ifdef ADAPTIVE_LAYER_HEIGHT_DEBUG
    BOOST_LOG_TRIVIAL(trace) << "adaptive layer computation, layer-bottom at z:" << print_z << ", quality_factor:" << quality_factor << ", resulting layer height:" << height;
#endif  /* ADAPTIVE_LAYER_HEIGHT_DEBUG */
	return height; 
}

std::vector<double> layer_height_profile_adaptive(const SlicingParameters& slicing_params, const ModelObject& object, float quality_factor)
{
    // 1) Initialize the SlicingAdaptive class with the object meshes.
    SlicingAdaptive as;
    as.set_slicing_parameters(slicing_params);
    as.prepare(object);

    // 2) Generate layers using the algorithm of @platsch 
    std::vector<double> layer_height_profile;
    layer_height_profile.push_back(0.0);
    layer_height_profile.push_back(slicing_params.first_object_layer_height);
    if (slicing_params.first_object_layer_height_fixed()) {
        layer_height_profile.push_back(slicing_params.first_object_layer_height);
        layer_height_profile.push_back(slicing_params.first_object_layer_height);
    }
    double print_z = slicing_params.first_object_layer_height;
    // last facet visited by the as.next_layer_height() function, where the facets are sorted by their increasing Z span.
    size_t current_facet = 0;
    // loop until we have at least one layer and the max slice_z reaches the object height
    while (print_z + EPSILON < slicing_params.object_print_z_uncompensated_height()) {
        float height = slicing_params.max_layer_height;
        // Slic3r::debugf "\n Slice layer: %d\n", $id;
        // determine next layer height
        float cusp_height = as.next_layer_height(float(print_z), quality_factor, current_facet);

#if 0
        // check for horizontal features and object size
        if (this->config.match_horizontal_surfaces.value) {
            coordf_t horizontal_dist = as.horizontal_facet_distance(print_z + height, min_layer_height);
            if ((horizontal_dist < min_layer_height) && (horizontal_dist > 0)) {
                #ifdef SLIC3R_DEBUG
                std::cout << "Horizontal feature ahead, distance: " << horizontal_dist << std::endl;
                #endif
                // can we shrink the current layer a bit?
                if (height-(min_layer_height - horizontal_dist) > min_layer_height) {
                    // yes we can
                    height -= (min_layer_height - horizontal_dist);
                    #ifdef SLIC3R_DEBUG
                    std::cout << "Shrink layer height to " << height << std::endl;
                    #endif
                } else {
                    // no, current layer would become too thin
                    height += horizontal_dist;
                    #ifdef SLIC3R_DEBUG
                    std::cout << "Widen layer height to " << height << std::endl;
                    #endif
                }
            }
        }
#endif
        height = std::min(cusp_height, height);

        // apply z-gradation
        /*
        my $gradation = $self->config->get_value('adaptive_slicing_z_gradation');
        if($gradation > 0) {
            $height = $height - unscale((scale($height)) % (scale($gradation)));
        }
        */
    
        // look for an applicable custom range
        /*
        if (my $range = first { $_->[0] <= $print_z && $_->[1] > $print_z } @{$self->layer_height_ranges}) {
            $height = $range->[2];
    
            # if user set custom height to zero we should just skip the range and resume slicing over it
            if ($height == 0) {
                $print_z += $range->[1] - $range->[0];
                next;
            }
        }
        */
        //BBS: avoid the layer height change to be too steep
        if (layer_height_profile.back() < height && height - layer_height_profile.back() > LAYER_HEIGHT_CHANGE_STEP)
            height = layer_height_profile.back() + LAYER_HEIGHT_CHANGE_STEP;
        else if (layer_height_profile.back() > height && layer_height_profile.back() - height > LAYER_HEIGHT_CHANGE_STEP)
            height = layer_height_profile.back() - LAYER_HEIGHT_CHANGE_STEP;

        for (auto const& [range,options] : object.layer_config_ranges) {
            if ( print_z >= range.first && print_z <= range.second) {
                    height = options.opt_float("layer_height");
                    break;
            };
        };

        layer_height_profile.push_back(print_z);
        layer_height_profile.push_back(height);
        print_z += height;
    }

    double z_gap = slicing_params.object_print_z_uncompensated_height() - *(layer_height_profile.end() - 2);
    if (z_gap > 0.0)
    {
        layer_height_profile.push_back(slicing_params.object_print_z_uncompensated_height());
        layer_height_profile.push_back(std::clamp(z_gap, slicing_params.min_layer_height, slicing_params.max_layer_height));
    }

    return layer_height_profile;
}

std::vector<double> smooth_height_profile(const std::vector<double>& profile, const SlicingParameters& slicing_params, const HeightProfileSmoothingParams& smoothing_params)
{
    auto gauss_blur = [&slicing_params](const std::vector<double>& profile, const HeightProfileSmoothingParams& smoothing_params) -> std::vector<double> {
        auto gauss_kernel = [] (unsigned int radius) -> std::vector<double> {
            unsigned int size = 2 * radius + 1;
            std::vector<double> ret;
            ret.reserve(size);

            // Reworked from static inline int getGaussianKernelSize(float sigma) taken from opencv-4.1.2\modules\features2d\src\kaze\AKAZEFeatures.cpp
            double sigma = 0.3 * (double)(radius - 1) + 0.8;
            double two_sq_sigma = 2.0 * sigma * sigma;
            double inv_root_two_pi_sq_sigma = 1.0 / ::sqrt(M_PI * two_sq_sigma);

            for (unsigned int i = 0; i < size; ++i)
            {
                double x = (double)i - (double)radius;
                ret.push_back(inv_root_two_pi_sq_sigma * ::exp(-x * x / two_sq_sigma));
            }

            return ret;
        };

        // skip first layer ?
        size_t skip_count = slicing_params.first_object_layer_height_fixed() ? 4 : 0;

        // not enough data to smmoth
        if ((int)profile.size() - (int)skip_count < 6)
            return profile;
        
        unsigned int radius = std::max(smoothing_params.radius, (unsigned int)1);
        std::vector<double> kernel = gauss_kernel(radius);
        int two_radius = 2 * (int)radius;

        std::vector<double> ret;
        size_t size = profile.size();
        ret.reserve(size);

        // leave first layer untouched
        for (size_t i = 0; i < skip_count; ++i)
        {
            ret.push_back(profile[i]);
        }

        // smooth the rest of the profile by biasing a gaussian blur
        // the bias moves the smoothed profile closer to the min_layer_height
        double delta_h = slicing_params.max_layer_height - slicing_params.min_layer_height;
        double inv_delta_h = (delta_h != 0.0) ? 1.0 / delta_h : 1.0;

        double max_dz_band = (double)radius * slicing_params.layer_height;
        for (size_t i = skip_count; i < size; i += 2)
        {
            double zi = profile[i];
            double hi = profile[i + 1];
            ret.push_back(zi);
            ret.push_back(0.0);
            double& height = ret.back();
            int begin = std::max((int)i - two_radius, (int)skip_count);
            int end = std::min((int)i + two_radius, (int)size - 2);
            double weight_total = 0.0;
            for (int j = begin; j <= end; j += 2)
            {
                int kernel_id = radius + (j - (int)i) / 2;
                double dz = std::abs(zi - profile[j]);
                if (dz * slicing_params.layer_height <= max_dz_band)
                {
                    double dh = std::abs(slicing_params.max_layer_height - profile[j + 1]);
                    double weight = kernel[kernel_id] * sqrt(dh * inv_delta_h);
                    height += weight * profile[j + 1];
                    weight_total += weight;
                }
            }

            height = std::clamp(weight_total == 0 ? hi : height / weight_total, slicing_params.min_layer_height, slicing_params.max_layer_height);
            if (smoothing_params.keep_min)
                height = std::min(height, hi);
        }

        return ret;
    };

    //BBS: avoid the layer height change to be too steep
    //auto has_steep_height_change = [&slicing_params](const std::vector<double>& profile, const double height_step) {
    //    //BBS: skip first layer
    //    size_t skip_count = slicing_params.first_object_layer_height_fixed() ? 4 : 0;
    //    size_t size = profile.size();
    //    //BBS: not enough data to smmoth, return false directly
    //    if ((int)size - (int)skip_count < 6)
    //        return false;

    //    //BBS: Don't need to check the difference between top layer and the last 2th layer
    //    for (size_t i = skip_count; i < size - 6; i += 2) {
    //        if (abs(profile[i + 1] - profile[i + 3]) > height_step)
    //            return true;
    //    }
    //    return false;
    //};

    int count = 0;
    std::vector<double> ret = profile;
    // bool has_steep_change = has_steep_height_change(ret, LAYER_HEIGHT_CHANGE_STEP);
    while (/*has_steep_change &&*/ count < 6) {
       ret = gauss_blur(ret, smoothing_params);
       //has_steep_change = has_steep_height_change(ret, LAYER_HEIGHT_CHANGE_STEP);
       count++;
    }
    return ret;
    // return gauss_blur(profile, smoothing_params);
}


void emit(const std::vector<double>&v){std::cout<<"[";for(size_t i=0;i<v.size();i++){if(i)std::cout<<",";std::cout<<std::setprecision(17)<<v[i];}std::cout<<"]";}
int main(){SlicingParameters p;ModelObject cube;cube.faces={{{0,0},1,0},{{0,20},0,1},{{20,20},1,0}};ModelObject pyramid;float nx=0,ny=-400,nz=200,length=std::sqrt(nx*nx+ny*ny+nz*nz);nx/=length;ny/=length;nz/=length;pyramid.faces={{{0,0},1,0},{{0,20},std::abs(nz),std::sqrt(nx*nx+ny*ny)}};std::cout<<"{\"version\":\"2.4.2\",\"commit\":\"8500fcdccaa10b5099ac20d252af3a7c560046f1\",\"cases\":[";bool first=true;for(auto name:{"cube","pyramid"})for(float quality:{0.f,.25f,.5f,1.f}){if(!first)std::cout<<",";first=false;auto profile=layer_height_profile_adaptive(p,std::string(name)=="cube"?cube:pyramid,quality);std::cout<<"{\"shape\":\""<<name<<"\",\"quality\":"<<quality<<",\"profile\":";emit(profile);std::cout<<",\"smooth\":";emit(smooth_height_profile(profile,p,{3,false}));std::cout<<",\"keepMin\":";emit(smooth_height_profile(profile,p,{3,true}));std::cout<<"}";}std::cout<<"]}\n";}
