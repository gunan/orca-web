// Compile with the verified configuration-worker source/dependencies/generated
// headers. This selects unchanged Preset.cpp predicates, rather than the
// diagnostics-instrumented copies exercised by the production operation.
#define ORCA_COMPATIBILITY_REFERENCE 1
#include "../../native/config-worker/worker/main.cpp"
