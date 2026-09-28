#include "libslic3r/Model.hpp"
#include <stdexcept>
namespace Slic3r {
// Import worker never enables native GUI backup. These guards preserve the
// native disabled-backup path and fail if a future source change enables it.
void save_object_mesh(ModelObject& object){if(!object.get_model()||!object.get_model()->is_need_backup())return;if(object.volumes.empty()||object.instances.empty())return;throw std::runtime_error("3MF worker cannot schedule GUI backup");}
// Native bbs_3mf.cpp delete_object_mesh is itself an empty implementation.
void delete_object_mesh(ModelObject&){}
void remove_backup(Model&,bool){throw std::runtime_error("3MF worker cannot remove GUI backup");}
}
