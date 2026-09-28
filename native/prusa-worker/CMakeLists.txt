cmake_minimum_required(VERSION 3.31)
project(OrcaPrusaWorker LANGUAGES C CXX)
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(ROOT "${CMAKE_CURRENT_SOURCE_DIR}")
set(ORCA_NATIVE_CACHE "${CMAKE_CURRENT_SOURCE_DIR}/../../.native-cache" CACHE PATH "Pinned source and dependency cache")
set(ORCA_SOURCE_DIR "${ORCA_NATIVE_CACHE}/upstream/repository" CACHE PATH "Pinned Orca source")
set(ORCA_NATIVE_PREFIX "${ORCA_NATIVE_CACHE}/prefix" CACHE PATH "Pinned dependencies")
set(ORCA_NATIVE_DEPENDENCIES "${ORCA_NATIVE_CACHE}/dependencies" CACHE PATH "Pinned dependency sources")
set(ORCA "${ORCA_SOURCE_DIR}")
set(SRC "${ORCA}/src/libslic3r")
set(EIGEN "${ORCA_NATIVE_DEPENDENCIES}/eigen/eigen-5.0.1")
set(CGAL_DIR "${ORCA_NATIVE_DEPENDENCIES}/cgal/CGAL-5.6.3")
set(BOOST_ROOT "${ORCA_NATIVE_PREFIX}")
set(Boost_NO_SYSTEM_PATHS ON)
set(Boost_NO_BOOST_CMAKE ON)
list(PREPEND CMAKE_PREFIX_PATH "${ORCA_NATIVE_PREFIX}")
find_package(Python3 REQUIRED COMPONENTS Interpreter)
execute_process(COMMAND "${Python3_EXECUTABLE}" "${CMAKE_CURRENT_SOURCE_DIR}/scripts/prepare-sources.py" "${ORCA}" "${CMAKE_CURRENT_BINARY_DIR}" RESULT_VARIABLE preparation_result)
if(NOT preparation_result EQUAL 0)
 message(FATAL_ERROR "Pinned Prusa importer source verification failed")
endif()
find_package(CGAL REQUIRED)
find_package(TBB REQUIRED)
find_package(OpenSSL REQUIRED)
set(Boost_USE_STATIC_LIBS ON)
find_package(Boost 1.84.0 EXACT REQUIRED COMPONENTS log filesystem thread chrono atomic regex date_time)
set(QHULL_NATIVE
 "${ORCA}/deps_src/qhull/src/libqhull_r/global_r.c"
 "${ORCA}/deps_src/qhull/src/libqhull_r/stat_r.c"
 "${ORCA}/deps_src/qhull/src/libqhull_r/geom2_r.c"
 "${ORCA}/deps_src/qhull/src/libqhull_r/poly2_r.c"
 "${ORCA}/deps_src/qhull/src/libqhull_r/merge_r.c"
 "${ORCA}/deps_src/qhull/src/libqhull_r/libqhull_r.c"
 "${ORCA}/deps_src/qhull/src/libqhull_r/geom_r.c"
 "${ORCA}/deps_src/qhull/src/libqhull_r/poly_r.c"
 "${ORCA}/deps_src/qhull/src/libqhull_r/qset_r.c"
 "${ORCA}/deps_src/qhull/src/libqhull_r/mem_r.c"
 "${ORCA}/deps_src/qhull/src/libqhull_r/random_r.c"
 "${ORCA}/deps_src/qhull/src/libqhull_r/usermem_r.c"
 "${ORCA}/deps_src/qhull/src/libqhull_r/io_r.c"
 "${ORCA}/deps_src/qhull/src/libqhull_r/user_r.c"
 "${ORCA}/deps_src/qhull/src/libqhull_r/rboxlib_r.c"
 "${ORCA}/deps_src/qhull/src/libqhullcpp/Coordinates.cpp"
 "${ORCA}/deps_src/qhull/src/libqhullcpp/PointCoordinates.cpp"
 "${ORCA}/deps_src/qhull/src/libqhullcpp/Qhull.cpp"
 "${ORCA}/deps_src/qhull/src/libqhullcpp/QhullFacet.cpp"
 "${ORCA}/deps_src/qhull/src/libqhullcpp/QhullFacetList.cpp"
 "${ORCA}/deps_src/qhull/src/libqhullcpp/QhullFacetSet.cpp"
 "${ORCA}/deps_src/qhull/src/libqhullcpp/QhullHyperplane.cpp"
 "${ORCA}/deps_src/qhull/src/libqhullcpp/QhullPoint.cpp"
 "${ORCA}/deps_src/qhull/src/libqhullcpp/QhullPointSet.cpp"
 "${ORCA}/deps_src/qhull/src/libqhullcpp/QhullPoints.cpp"
 "${ORCA}/deps_src/qhull/src/libqhullcpp/QhullQh.cpp"
 "${ORCA}/deps_src/qhull/src/libqhullcpp/QhullRidge.cpp"
 "${ORCA}/deps_src/qhull/src/libqhullcpp/QhullSet.cpp"
 "${ORCA}/deps_src/qhull/src/libqhullcpp/QhullStat.cpp"
 "${ORCA}/deps_src/qhull/src/libqhullcpp/QhullVertex.cpp"
 "${ORCA}/deps_src/qhull/src/libqhullcpp/QhullVertexSet.cpp"
 "${ORCA}/deps_src/qhull/src/libqhullcpp/RboxPoints.cpp"
 "${ORCA}/deps_src/qhull/src/libqhullcpp/RoadError.cpp"
 "${ORCA}/deps_src/qhull/src/libqhullcpp/RoadLogEvent.cpp"
)
add_executable(orca-prusa-import ${QHULL_NATIVE} worker/backup-guards.cpp "${CMAKE_CURRENT_BINARY_DIR}/native-thumbnail-config.cpp" ${SRC}/ObjectID.cpp ${SRC}/miniz_extension.cpp worker/main.cpp "${CMAKE_CURRENT_BINARY_DIR}/native-Model.cpp" ${SRC}/Format/3mf.cpp ${SRC}/TriangleMesh.cpp ${SRC}/TriangleSelector.cpp ${SRC}/Geometry.cpp ${SRC}/Geometry/ConvexHull.cpp ${ORCA}/deps_src/miniz/miniz.c ${ORCA}/deps_src/semver/semver.c
 ${SRC}/libslic3r.cpp ${SRC}/Config.cpp ${SRC}/PrintConfig.cpp ${SRC}/MaterialType.cpp ${SRC}/LocalesUtils.cpp ${SRC}/Utils.cpp ${SRC}/Semver.cpp
 ${SRC}/Point.cpp ${SRC}/Polygon.cpp ${SRC}/Polyline.cpp ${SRC}/MultiPoint.cpp ${SRC}/Line.cpp ${SRC}/ExPolygon.cpp ${SRC}/BoundingBox.cpp ${SRC}/ClipperUtils.cpp ${SRC}/clipper.cpp)
target_include_directories(orca-prusa-import PRIVATE "${ROOT}/generated" "${ROOT}/worker" "${SRC}/GCode" "${ORCA}/src" "${SRC}" "${ORCA}/deps_src" "${ORCA}/deps_src/admesh" "${ORCA}/deps_src/miniz" "${ORCA}/deps_src/clipper" "${ORCA}/deps_src/clipper2/Clipper2Lib/include" "${ORCA}/deps_src/fast_float" "${ORCA}/deps_src/libigl" "${ORCA}/deps_src/qhull/src" "${EIGEN}" "${ORCA_NATIVE_PREFIX}/include" "${ORCA_NATIVE_DEPENDENCIES}/cereal/cereal-1.3.0/include")
target_compile_definitions(orca-prusa-import PRIVATE NDEBUG USE_TBB TBB_USE_CAPTURED_EXCEPTION=0)
target_compile_options(orca-prusa-import PRIVATE -O1 "$<$<COMPILE_LANGUAGE:CXX>:-include${ROOT}/worker/unsupported-step.hpp>" -ffunction-sections -fdata-sections)
if(APPLE)
 target_link_options(orca-prusa-import PRIVATE -Wl,-dead_strip)
else()
 target_link_options(orca-prusa-import PRIVATE -Wl,--gc-sections)
endif()
target_link_libraries(orca-prusa-import PRIVATE CGAL::CGAL TBB::tbb TBB::tbbmalloc OpenSSL::Crypto Boost::log Boost::filesystem Boost::thread Boost::chrono Boost::atomic Boost::regex Boost::date_time expat)

set_source_files_properties(${SRC}/LocalesUtils.cpp PROPERTIES COMPILE_FLAGS "-include sstream")
