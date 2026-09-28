// OrcaSlicer calib.cpp excerpts: AGPL-3.0; upstream source and reproduction notes in README.md.
// Pin: 8500fcdccaa10b5099ac20d252af3a7c560046f1.
// Event recorder for unmodified, pinned OrcaSlicer calib.cpp excerpts.
// This is a source-algorithm fixture generator, NOT the native GUI or writer.
#include <iostream>
#include <iomanip>
#include <sstream>
#include <string>
#include <vector>
#include <cmath>
#include <algorithm>
const double EPSILON=.0001;
struct Vec2d { double a,b; Vec2d(double x=0,double y=0):a(x),b(y){} double x()const{return a;}double y()const{return b;} Vec2d operator+(Vec2d v)const{return {a+v.a,b+v.b};}Vec2d operator-(Vec2d v)const{return {a-v.a,b-v.b};}};
struct Vec3d {double a,b,c;Vec3d(double x=0,double y=0,double z=0):a(x),b(y),c(z){}double x()const{return a;}double y()const{return b;}};
struct ConfigOptionFloats {double value; double get_at(int)const{return value;}};using ConfigOptionFloatsNullable=ConfigOptionFloats;
struct DynamicPrintConfig {ConfigOptionFloats nozzle_diameter{.4},filament_diameter{1.75},filament_flow_ratio{.98};double print_flow_ratio=1,z_offset=0;template<class T> const T*option(const char*key)const{std::string k(key);return k=="nozzle_diameter"?&nozzle_diameter:k=="filament_diameter"?&filament_diameter:&filament_flow_ratio;}};
struct Flow {float w,h;Flow(double width,double height,float):w(width),h(height){}double mm3_per_mm()const{float res=h*(w-h*(1-M_PI/4));return res;}};
struct GCodeWriter {double x=0,y=0,z=0,e=0,feed=3600,retracted=0,ret=.8,extra=0,retSpeed=30,deretSpeed=30,travel=300,travelZ=300;bool relative=true;std::vector<std::string> events;
 void event(std::string type,std::vector<double>v){std::ostringstream s;s<<std::setprecision(17)<<"[\""<<type<<"\"";for(auto n:v)s<<","<<n;s<<"]";events.push_back(s.str());}
 double ex(double v){e=relative?v:e+v;return e;}
 std::string retract(){double v=std::max(0.,ret-retracted);if(v>1e-7){retracted+=v;feed=retSpeed*60;event("retract",{ex(-v),-v,feed});}return "";}
 std::string unretract(){double v=retracted+extra;if(v>1e-7){retracted=0;feed=deretSpeed*60;event("unretract",{ex(v),v,feed});}return "";}
 std::string travel_to_xy(Vec2d p,std::string=""){x=p.x();y=p.y();feed=travel*60;event("xy",{x,y,feed});return "";}
 std::string travel_to_z(double v,std::string=""){if(std::abs(z-v)<.0001)return "";z=v;feed=travelZ*60;event("z",{z,feed});return "";}
 std::string extrude_to_xy(Vec2d p,double v,std::string=""){x=p.x();y=p.y();event("extrude",{x,y,z,ex(v),v,feed});return "";}
 std::string set_speed(double v){feed=v;event("speed",{v});return "";}
 std::string set_pressure_advance(double v){event("pa",{v});return "";}
};
struct DrawBoxOptArgs{DrawBoxOptArgs(int n,double h,double w,double s):num_perimeters(n),height(h),line_width(w),speed(s){}bool is_filled=false;int num_perimeters;double height,line_width,speed;};
struct CalibPressureAdvance {enum class DrawDigitMode{Left_To_Right,Bottom_To_Top};DynamicPrintConfig m_config;Vec3d m_last_pos;double m_encroachment=1./3.,m_digit_segment_len=2,m_digit_gap_len=1;size_t m_number_len=5;DrawDigitMode m_draw_digit_mode=DrawDigitMode::Left_To_Right;
 std::string move_to(Vec2d,GCodeWriter&,std::string="",double=0,double=-1);double e_per_mm(double,double,float,float,float)const;std::string convert_number_to_string(double,unsigned=0)const;std::string draw_digit(double,double,char,DrawDigitMode,double,double,GCodeWriter&);std::string draw_number(double,double,double,DrawDigitMode,double,double,double,GCodeWriter&);double get_distance(Vec2d,Vec2d)const;std::string draw_line(GCodeWriter&,Vec2d,double,double,double,const std::string &comment=std::string());std::string draw_box(GCodeWriter&,double,double,double,double,DrawBoxOptArgs);double to_radians(double d)const{return d*M_PI/180;}double number_spacing()const{return 3;}double speed_adjust(int speed)const{return speed*60;}
};
struct GCode{GCodeWriter w;DynamicPrintConfig c;GCodeWriter&writer(){return w;}const DynamicPrintConfig&config()const{return c;}};
struct CalibPressureAdvanceLine:CalibPressureAdvance {GCode*mp_gcodegen;double m_nozzle_diameter=.4,m_line_width=.6,m_height_layer=.2,m_thin_line_width=.4,m_number_line_width=.4,m_fast_speed=107,m_slow_speed=10.7,m_space_y=3.5,m_length_short=20,m_length_long=40;bool m_draw_numbers=true;std::string print_pa_lines(double,double,double,double,int);};
std::string CalibPressureAdvance::move_to(Vec2d pt, GCodeWriter &writer, std::string comment, double z, double layer_height)
{
    std::stringstream gcode;

    gcode << writer.retract(); // retract before z move or move
    if(z > EPSILON && layer_height >= 0){
        gcode << writer.travel_to_z(z, "z-hop"); // Perform z hop
        gcode << writer.travel_to_xy(pt, comment); // Travel with z move
        gcode << writer.travel_to_z(layer_height, "undo z-hop"); // Undo z hop
    }else {
        gcode << writer.travel_to_xy(pt, comment);
    }
    gcode << writer.unretract(); // unretract after z move is complete

    m_last_pos = Vec3d(pt.x(), pt.y(), 0);

    return gcode.str();
}

double CalibPressureAdvance::e_per_mm(
    double line_width, double layer_height, float nozzle_diameter, float filament_diameter, float print_flow_ratio) const
{
    const Flow   line_flow     = Flow(line_width, layer_height, nozzle_diameter);
    const double filament_area = M_PI * std::pow(filament_diameter / 2, 2);

    return line_flow.mm3_per_mm() * print_flow_ratio / filament_area ;
}

std::string CalibPressureAdvance::convert_number_to_string(double num, unsigned int precision) const
{
    std::ostringstream stream;

    if (precision) {
        /* if number is > 1000 then there are no way we'll fit fractional part into 5 glyphs, so
         * in this case we keep full precision.
         * Otherwise we reduce precision by 1 to accomodate decimal separator */
        stream << std::setprecision(num >= 1000 ? precision : precision - 1);
    }

    stream << num;

    return stream.str();
}

std::string CalibPressureAdvance::draw_digit(
    double startx, double starty, char c, CalibPressureAdvance::DrawDigitMode mode, double line_width, double e_per_mm, GCodeWriter &writer)
{
    const double len = m_digit_segment_len;
    const double gap = line_width / 2.0;

    const auto dE     = e_per_mm * len;
    const auto two_dE = dE * 2;

    Vec2d p0, p1, p2, p3, p4, p5;
    Vec2d p0_5, p4_5;
    Vec2d gap_p0_toward_p3, gap_p2_toward_p3;
    Vec2d dot_direction;

    if (mode == CalibPressureAdvance::DrawDigitMode::Bottom_To_Top) {
        //  1-------2-------5
        //  |       |       |
        //  |       |       |
        //  0-------3-------4
        p0   = Vec2d(startx, starty);
        p0_5 = Vec2d(startx, starty + len / 2);
        p1   = Vec2d(startx, starty + len);
        p2   = Vec2d(startx + len, starty + len);
        p3   = Vec2d(startx + len, starty);
        p4   = Vec2d(startx + len * 2, starty);
        p4_5 = Vec2d(startx + len * 2, starty + len / 2);
        p5   = Vec2d(startx + len * 2, starty + len);

        gap_p0_toward_p3 = p0 + Vec2d(gap, 0);
        gap_p2_toward_p3 = p2 + Vec2d(0, gap);

        dot_direction = Vec2d(-len / 2, 0);
    } else {
        //  0-------1
        //  |       |
        //  3-------2
        //  |       |
        //  4-------5
        p0   = Vec2d(startx, starty);
        p0_5 = Vec2d(startx + len / 2, starty);
        p1   = Vec2d(startx + len, starty);
        p2   = Vec2d(startx + len, starty - len);
        p3   = Vec2d(startx, starty - len);
        p4   = Vec2d(startx, starty - len * 2);
        p4_5 = Vec2d(startx + len / 2, starty - len * 2);
        p5   = Vec2d(startx + len, starty - len * 2);

        gap_p0_toward_p3 = p0 - Vec2d(0, gap);
        gap_p2_toward_p3 = p2 - Vec2d(gap, 0);

        dot_direction = Vec2d(0, len / 2);
    }

    std::stringstream gcode;

    switch (c) {
    case '0':
        gcode << move_to(p0, writer, "Glyph: 0");
        gcode << writer.extrude_to_xy(p1, dE);
        gcode << writer.extrude_to_xy(p5, two_dE);
        gcode << writer.extrude_to_xy(p4, dE);
        gcode << writer.extrude_to_xy(gap_p0_toward_p3, two_dE);
        break;
    case '1':
        gcode << move_to(p0_5, writer, "Glyph: 1");
        gcode << writer.extrude_to_xy(p4_5, two_dE);
        break;
    case '2':
        gcode << move_to(p0, writer, "Glyph: 2");
        gcode << writer.extrude_to_xy(p1, dE);
        gcode << writer.extrude_to_xy(p2, dE);
        gcode << writer.extrude_to_xy(p3, dE);
        gcode << writer.extrude_to_xy(p4, dE);
        gcode << writer.extrude_to_xy(p5, dE);
        break;
    case '3':
        gcode << move_to(p0, writer, "Glyph: 3");
        gcode << writer.extrude_to_xy(p1, dE);
        gcode << writer.extrude_to_xy(p5, two_dE);
        gcode << writer.extrude_to_xy(p4, dE);
        gcode << move_to(gap_p2_toward_p3, writer);
        gcode << writer.extrude_to_xy(p3, dE);
        break;
    case '4':
        gcode << move_to(p0, writer, "Glyph: 4");
        gcode << writer.extrude_to_xy(p3, dE);
        gcode << writer.extrude_to_xy(p2, dE);
        gcode << move_to(p1, writer);
        gcode << writer.extrude_to_xy(p5, two_dE);
        break;
    case '5':
        gcode << move_to(p1, writer, "Glyph: 5");
        gcode << writer.extrude_to_xy(p0, dE);
        gcode << writer.extrude_to_xy(p3, dE);
        gcode << writer.extrude_to_xy(p2, dE);
        gcode << writer.extrude_to_xy(p5, dE);
        gcode << writer.extrude_to_xy(p4, dE);
        break;
    case '6':
        gcode << move_to(p1, writer, "Glyph: 6");
        gcode << writer.extrude_to_xy(p0, dE);
        gcode << writer.extrude_to_xy(p4, two_dE);
        gcode << writer.extrude_to_xy(p5, dE);
        gcode << writer.extrude_to_xy(p2, dE);
        gcode << writer.extrude_to_xy(p3, dE);
        break;
    case '7':
        gcode << move_to(p0, writer, "Glyph: 7");
        gcode << writer.extrude_to_xy(p1, dE);
        gcode << writer.extrude_to_xy(p5, two_dE);
        break;
    case '8':
        gcode << move_to(p2, writer, "Glyph: 8");
        gcode << writer.extrude_to_xy(p3, dE);
        gcode << writer.extrude_to_xy(p4, dE);
        gcode << writer.extrude_to_xy(p5, dE);
        gcode << writer.extrude_to_xy(p1, two_dE);
        gcode << writer.extrude_to_xy(p0, dE);
        gcode << writer.extrude_to_xy(p3, dE);
        break;
    case '9':
        gcode << move_to(p5, writer, "Glyph: 9");
        gcode << writer.extrude_to_xy(p1, two_dE);
        gcode << writer.extrude_to_xy(p0, dE);
        gcode << writer.extrude_to_xy(p3, dE);
        gcode << writer.extrude_to_xy(p2, dE);
        break;
    case '.':
        gcode << move_to(p4_5, writer, "Glyph: .");
        gcode << writer.extrude_to_xy(p4_5 + dot_direction, dE);
        break;
    default: break;
    }

    return gcode.str();
}

std::string CalibPressureAdvance::draw_number(double                              startx,
                                              double                              starty,
                                              double                              value,
                                              CalibPressureAdvance::DrawDigitMode mode,
                                              double                              line_width,
                                              double                              e_per_mm,
                                              double                              speed,
                                              GCodeWriter                        &writer)
{
    auto              sNumber = convert_number_to_string(value, m_number_len);
    std::stringstream gcode;
    gcode << writer.set_speed(speed);

    for (std::string::size_type i = 0; i < sNumber.length(); ++i) {
        if (i >= m_number_len) {
            break;
        }
        switch (mode) {
        case DrawDigitMode::Bottom_To_Top:
            gcode << draw_digit(startx, starty + i * number_spacing(), sNumber[i], mode, line_width, e_per_mm, writer);
            break;
        default: gcode << draw_digit(startx + i * number_spacing(), starty, sNumber[i], mode, line_width, e_per_mm, writer);
        }
    }

    return gcode.str();
}


double CalibPressureAdvance::get_distance(Vec2d from, Vec2d to) const
{
    return std::hypot((to.x() - from.x()), (to.y() - from.y()));
}

std::string CalibPressureAdvance::draw_line(
    GCodeWriter &writer, Vec2d to_pt, double line_width, double layer_height, double speed, const std::string &comment)
{
    const double e_per_mm = CalibPressureAdvance::e_per_mm(line_width, layer_height,
                                                           m_config.option<ConfigOptionFloats>("nozzle_diameter")->get_at(0),
                                                           m_config.option<ConfigOptionFloats>("filament_diameter")->get_at(0),
                                                           m_config.option<ConfigOptionFloatsNullable>("filament_flow_ratio")->get_at(0));

    const double length = get_distance(Vec2d(m_last_pos.x(), m_last_pos.y()), to_pt);
    auto         dE     = e_per_mm * length;

    std::stringstream gcode;

    gcode << writer.set_speed(speed);
    gcode << writer.extrude_to_xy(to_pt, dE, comment);

    m_last_pos = Vec3d(to_pt.x(), to_pt.y(), 0);

    return gcode.str();
}

std::string CalibPressureAdvance::draw_box(GCodeWriter &writer, double min_x, double min_y, double size_x, double size_y, DrawBoxOptArgs opt_args)
{
    std::stringstream gcode;

    double       x     = min_x;
    double       y     = min_y;
    const double max_x = min_x + size_x;
    const double max_y = min_y + size_y;

    const double spacing = opt_args.line_width - opt_args.height * (1 - M_PI / 4);

    // if number of perims exceeds size of box, reduce it to max
    const int max_perimeters = std::min(
        // this is the equivalent of number of perims for concentric fill
        std::floor(size_x * std::sin(to_radians(45))) / (spacing / std::sin(to_radians(45))),
        std::floor(size_y * std::sin(to_radians(45))) / (spacing / std::sin(to_radians(45))));

    opt_args.num_perimeters = std::min(opt_args.num_perimeters, max_perimeters);

    gcode << move_to(Vec2d(min_x, min_y), writer, "Move to box start");

    // DrawLineOptArgs line_opt_args(*this);
    auto line_arg_height     = opt_args.height;
    auto line_arg_line_width = opt_args.line_width;
    auto line_arg_speed      = opt_args.speed;
    std::string comment = "";

    for (int i = 0; i < opt_args.num_perimeters; ++i) {
        if (i != 0) { // after first perimeter, step inwards to start next perimeter
            x += spacing;
            y += spacing;
            gcode << move_to(Vec2d(x, y), writer, "Step inwards to print next perimeter");
        }

        y += size_y - i * spacing * 2;
        comment = "Draw perimeter (up)";
        gcode << draw_line(writer, Vec2d(x, y), line_arg_line_width, line_arg_height, line_arg_speed, comment);

        x += size_x - i * spacing * 2;
        comment = "Draw perimeter (right)";
        gcode << draw_line(writer, Vec2d(x, y), line_arg_line_width, line_arg_height, line_arg_speed, comment);

        y -= size_y - i * spacing * 2;
        comment = "Draw perimeter (down)";
        gcode << draw_line(writer, Vec2d(x, y), line_arg_line_width, line_arg_height, line_arg_speed, comment);

        x -= size_x - i * spacing * 2;
        comment = "Draw perimeter (left)";
        gcode << draw_line(writer, Vec2d(x, y), line_arg_line_width, line_arg_height, line_arg_speed, comment);
    }

    if (!opt_args.is_filled) {
        return gcode.str();
    }

    // create box infill
    const double spacing_45 = spacing / std::sin(to_radians(45));

    const double bound_modifier = (spacing * (opt_args.num_perimeters - 1)) + (opt_args.line_width * (1 - m_encroachment));
    const double x_min_bound    = min_x + bound_modifier;
    const double x_max_bound    = max_x - bound_modifier;
    const double y_min_bound    = min_y + bound_modifier;
    const double y_max_bound    = max_y - bound_modifier;
    const int    x_count        = std::floor((x_max_bound - x_min_bound) / spacing_45);
    const int    y_count        = std::floor((y_max_bound - y_min_bound) / spacing_45);

    double x_remainder = std::fmod((x_max_bound - x_min_bound), spacing_45);
    double y_remainder = std::fmod((y_max_bound - y_min_bound), spacing_45);

    x = x_min_bound;
    y = y_min_bound;

    gcode << move_to(Vec2d(x, y), writer, "Move to fill start");

    for (int i = 0; i < x_count + y_count + (x_remainder + y_remainder >= spacing_45 ? 1 : 0);
         ++i) { // this isn't the most robust way, but less expensive than finding line intersections
        if (i < std::min(x_count, y_count)) {
            if (i % 2 == 0) {
                x += spacing_45;
                y = y_min_bound;
                gcode << move_to(Vec2d(x, y), writer, "Fill: Step right");

                y += x - x_min_bound;
                x                     = x_min_bound;
                comment = "Fill: Print up/left";
                gcode << draw_line(writer, Vec2d(x, y), line_arg_line_width, line_arg_height, line_arg_speed, comment);
            } else {
                y += spacing_45;
                x = x_min_bound;
                gcode << move_to(Vec2d(x, y), writer, "Fill: Step up");

                x += y - y_min_bound;
                y                     = y_min_bound;
                comment = "Fill: Print down/right";
                gcode << draw_line(writer, Vec2d(x, y), line_arg_line_width, line_arg_height, line_arg_speed, comment);
            }
        } else if (i < std::max(x_count, y_count)) {
            if (x_count > y_count) {
                // box is wider than tall
                if (i % 2 == 0) {
                    x += spacing_45;
                    y = y_min_bound;
                    gcode << move_to(Vec2d(x, y), writer, "Fill: Step right");

                    x -= y_max_bound - y_min_bound;
                    y                     = y_max_bound;
                    comment = "Fill: Print up/left";
                    gcode << draw_line(writer, Vec2d(x, y), line_arg_line_width, line_arg_height, line_arg_speed, comment);
                } else {
                    if (i == y_count) {
                        x += spacing_45 - y_remainder;
                        y_remainder = 0;
                    } else {
                        x += spacing_45;
                    }
                    y = y_max_bound;
                    gcode << move_to(Vec2d(x, y), writer, "Fill: Step right");

                    x += y_max_bound - y_min_bound;
                    y                     = y_min_bound;
                    comment = "Fill: Print down/right";
                    gcode << draw_line(writer, Vec2d(x, y), line_arg_line_width, line_arg_height, line_arg_speed, comment);
                }
            } else {
                // box is taller than wide
                if (i % 2 == 0) {
                    x = x_max_bound;
                    if (i == x_count) {
                        y += spacing_45 - x_remainder;
                        x_remainder = 0;
                    } else {
                        y += spacing_45;
                    }
                    gcode << move_to(Vec2d(x, y), writer, "Fill: Step up");

                    x = x_min_bound;
                    y += x_max_bound - x_min_bound;
                    comment = "Fill: Print up/left";
                    gcode << draw_line(writer, Vec2d(x, y), line_arg_line_width, line_arg_height, line_arg_speed, comment);
                } else {
                    x = x_min_bound;
                    y += spacing_45;
                    gcode << move_to(Vec2d(x, y), writer, "Fill: Step up");

                    x = x_max_bound;
                    y -= x_max_bound - x_min_bound;
                    comment = "Fill: Print down/right";
                    gcode << draw_line(writer, Vec2d(x, y), line_arg_line_width, line_arg_height, line_arg_speed, comment);
                }
            }
        } else {
            if (i % 2 == 0) {
                x = x_max_bound;
                if (i == x_count) {
                    y += spacing_45 - x_remainder;
                } else {
                    y += spacing_45;
                }
                gcode << move_to(Vec2d(x, y), writer, "Fill: Step up");

                x -= y_max_bound - y;
                y                     = y_max_bound;
                comment = "Fill: Print up/left";
                gcode << draw_line(writer, Vec2d(x, y), line_arg_line_width, line_arg_height, line_arg_speed, comment);
            } else {
                if (i == y_count) {
                    x += spacing_45 - y_remainder;
                } else {
                    x += spacing_45;
                }
                y = y_max_bound;
                gcode << move_to(Vec2d(x, y), writer, "Fill: Step right");

                y -= x_max_bound - x;
                x                     = x_max_bound;
                comment = "Fill: Print down/right";
                gcode << draw_line(writer, Vec2d(x, y), line_arg_line_width, line_arg_height, line_arg_speed, comment);
            }
        }
    }

    return gcode.str();
}
std::string CalibPressureAdvanceLine::print_pa_lines(double start_x, double start_y, double start_pa, double step_pa, int num)
{
    auto       &writer = mp_gcodegen->writer();
    const auto &config = mp_gcodegen->config();

    const auto filament_diameter = config.filament_diameter.get_at(0);
    const auto print_flow_ratio  = config.print_flow_ratio;
    const auto z_offset          = config.z_offset;

    const double e_per_mm        = CalibPressureAdvance::e_per_mm(m_line_width, m_height_layer, m_nozzle_diameter, filament_diameter,
                                                                  print_flow_ratio);
    const double thin_e_per_mm   = CalibPressureAdvance::e_per_mm(m_thin_line_width, m_height_layer, m_nozzle_diameter, filament_diameter,
                                                                  print_flow_ratio);
    const double number_e_per_mm = CalibPressureAdvance::e_per_mm(m_number_line_width, m_height_layer, m_nozzle_diameter, filament_diameter,
                                                                  print_flow_ratio);

    const double      fast = CalibPressureAdvance::speed_adjust(m_fast_speed);
    const double      slow = CalibPressureAdvance::speed_adjust(m_slow_speed);
    std::stringstream gcode;
    gcode << mp_gcodegen->writer().travel_to_z(m_height_layer + z_offset);
    double y_pos = start_y;

    // prime line
    gcode << writer.set_pressure_advance(0.0);
    auto prime_x = start_x;
    gcode << move_to(Vec2d(prime_x, y_pos + (num) * m_space_y), writer);
    gcode << writer.set_speed(slow);
    gcode << writer.extrude_to_xy(Vec2d(prime_x, y_pos), e_per_mm * m_space_y * num * 1.2);

    for (int i = 0; i < num; ++i) {
        gcode << writer.set_pressure_advance(start_pa + i * step_pa);
        gcode << move_to(Vec2d(start_x, y_pos + i * m_space_y), writer);
        gcode << writer.set_speed(slow);
        gcode << writer.extrude_to_xy(Vec2d(start_x + m_length_short, y_pos + i * m_space_y), e_per_mm * m_length_short);
        gcode << writer.set_speed(fast);
        gcode << writer.extrude_to_xy(Vec2d(start_x + m_length_short + m_length_long, y_pos + i * m_space_y), e_per_mm * m_length_long);
        gcode << writer.set_speed(slow);
        gcode << writer.extrude_to_xy(Vec2d(start_x + m_length_short + m_length_long + m_length_short, y_pos + i * m_space_y),
                                      e_per_mm * m_length_short);

        if (i == 0) {
            // Print extra anchor line
            gcode << writer.set_pressure_advance(0.0);
            gcode << writer.extrude_to_xy(Vec2d(start_x + m_length_short + m_length_long + m_length_short, y_pos + (num) * m_space_y), e_per_mm * m_space_y * num * 1.2);
        }
    }
    gcode << writer.set_pressure_advance(0.0);

    if (m_draw_numbers) {

        // Orca: skip drawing indicator lines
        // gcode << writer.set_speed(fast);
        // gcode << move_to(Vec2d(start_x + m_length_short, y_pos + (num - 1) * m_space_y + 2), writer);
        // gcode << writer.extrude_to_xy(Vec2d(start_x + m_length_short, y_pos + (num - 1) * m_space_y + 7), thin_e_per_mm * 7);
        // gcode << move_to(Vec2d(start_x + m_length_short + m_length_long, y_pos + (num - 1) * m_space_y + 7), writer);
        // gcode << writer.extrude_to_xy(Vec2d(start_x + m_length_short + m_length_long, y_pos + (num - 1) * m_space_y + 2), thin_e_per_mm * 7);

        const auto     box_start_x = start_x + m_length_short + m_length_long + m_length_short + m_line_width;
        DrawBoxOptArgs default_box_opt_args(2, m_height_layer, m_line_width, fast);
        default_box_opt_args.is_filled = true;
        gcode << draw_box(writer, box_start_x, start_y - m_space_y,
                          number_spacing() * 8, (num + 1) * m_space_y, default_box_opt_args);
        gcode << writer.travel_to_z(m_height_layer*2 + z_offset);
        for (int i = 0; i < num; i += 2) {
            gcode << draw_number(box_start_x + 3 + m_line_width, y_pos + i * m_space_y + m_space_y / 2, start_pa + i * step_pa, m_draw_digit_mode,
                                 m_number_line_width, number_e_per_mm, 3600, writer);
        }
    }
    return gcode.str();
}


int main(int argc,char**argv){GCode g;CalibPressureAdvanceLine p;p.mp_gcodegen=&g;int count=argc>1?atoi(argv[1]):3;bool numbers=argc>2?atoi(argv[2]):1;bool relative=argc>3?atoi(argv[3]):1;p.m_draw_numbers=numbers;g.w.relative=relative;p.m_line_width=.4*1.5;p.print_pa_lines(75,(210-count*3.5)/2,0,.002,count);std::cout<<"[";for(size_t i=0;i<g.w.events.size();i++){if(i)std::cout<<",";std::cout<<g.w.events[i];}std::cout<<"]\n";}
