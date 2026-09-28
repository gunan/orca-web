# Native preset compatibility

The web catalog evaluates bundled process and material compatibility with the pinned OrcaSlicer 2.4.2 boolean parser and preset predicates. Changing the process reloads material choices using that process. Selected IDs that no longer appear remain visible as unavailable and require a replacement; the web does not claim native alias-based automatic reselection policy.

The installed `Prusa CORE One L 0.4 nozzle` now offers its seven expression-based process presets, including `0.20mm SPEED @CORE One L 0.4`. Ordinary configuration, custom active-value editing, project preparation, calibration consumers and upload slicing use the native configuration resolver. That resolver checks compatibility after loading the printer/process and applying active overrides, so changing nozzle diameter cannot bypass the rule at job admission.

## Original source behavior

Pinned revision: `8500fcdccaa10b5099ac20d252af3a7c560046f1`.

| Rule | Original source |
|---|---|
| A nonempty explicit printer list takes precedence over its expression. | `Preset.cpp:809–841` |
| A nonempty process list takes precedence over its expression. | `Preset.cpp:771–791` |
| A user printer may match its immediate inherited parent; recursive grandparents are not checked. | `Preset.cpp:799–807` |
| Different vendor pointers do not reject compatibility. | `Preset.cpp:809–813` |
| Printer expressions receive `printer_preset` and `num_extruders`, plus the typed printer configuration. | `Preset.cpp:843–850` |
| Material process expressions receive the typed process configuration. The process predicate is short-circuited after printer rejection. | `Preset.cpp:771–791,3340–3374` |
| Parser exceptions produce a diagnostic and return compatible. The web preserves that result and displays the diagnostic. | `Preset.cpp:783–786,830–833` |
| OrcaFilamentLibrary alias exclusions apply to a printer or its immediate parent. | `Preset.cpp:816–824,3704–3734` |
| Missing explicit alias derives from the name before `@` with native right-trimming, then falls back to the full name. | `PresetBundle.cpp:5083–5101` |

`PlaceholderParser::evaluate_boolean_expression` is the unchanged original function from `PlaceholderParser.cpp:2536–2543`. It creates the local boolean context directly. No generic macro-generation or environment-populating parser constructor is exposed. The compatibility header is not an HTTP macro execution API.

The build verifies all source hashes before compiling. Four original predicate functions are extracted with only the two catch log statements redirected to a bounded diagnostics vector. Their control flow, native typed options, extra variables and return values remain intact. The original `Flow::extrusion_width` dependencies are extracted without behavior changes, avoiding a GUI/full-slicer dependency. The original `PresetCollection::update_library_profile_excluded_from` method runs on an isolated native registry through a public-access subclass; original material names preserve native collection order and last-alias precedence.

## Boundaries and operations

`server/native-compatibility.js` receives metadata only from trusted catalog records. `GET /api/presets?printerId=…&processId=…` and `/api/profiles` use asynchronous native results; the old synchronous `.list()` remains a conservative internal/fallback API for legacy configured catalogs, and is not the browser's compatibility authority.

The native configuration helper adds internal `preset-compatibility` and `filament-library-exclusions` operations. There is no route accepting raw source chains, candidate expressions, paths or arbitrary operations. Each expression is bounded to 16 KiB, each list to 10,000 names, each batch to 512 candidates and the registry to 12,000 materials. Existing 8 MiB input/16 MiB output, 30-second CPU limit, shared one-active/four-pending queue, cancellation, worker identity checks and cache bounds remain. All listing batches share one 30-second deadline. Resolution's registry lookup and full native configuration share one deadline too. Old or unavailable helpers fail explicitly; there is no JavaScript expression fallback.

The registry includes the bundled profiles this server has loaded, plus its saved custom presets. Native account settings and user-enabled-vendor filters are not read. Existing inheritance errors are retained as catalog notices. A custom printer uses its saved immediate `baseName`; its previous recursive alias list is not treated as native compatibility evidence.

## Verification

- 21 table cases match a separately linked reference calling the unchanged original `Preset.cpp` predicates: typed vectors, regex/arithmetic, extra variables, explicit-list precedence, both condition languages, parser failures, immediate-parent behavior, cross-vendor allowance, library exclusions and short-circuiting.
- Native malformed/oversized input rejection and original registry last-alias precedence are exercised.
- Installed CORE One expression discovery and changed-nozzle rejection are covered through the native resolver.
- HTTP tests cover process-sensitive materials, alias exclusions, warning propagation, and rejecting incompatible upload/configuration requests before enqueue.
- Existing custom preset, active-variant and cancellation/cache/queue regressions remain part of the focused checks.
- Browser checks select and slice a CORE One expression preset with the installed 2.4.2 executable, refresh process-dependent catalog context, and save/edit a custom derivative. G-code contains the selected native process and actual extrusion commands.

The independent reference source is [native-compatibility-reference.cpp](../tests/fixtures/native-compatibility-reference.cpp), with captured original results and helper hash in [native-compatibility-reference.json](../tests/fixtures/native-compatibility-reference.json). These are source/CLI/browser checks, not a fresh native GUI compatibility-selection capture.

## Remaining preset behavior

Native JSON imports with nonempty compatibility expressions or process-specific material restrictions still reject explicitly. The current custom record format stores an explicit printer-ID list; rewriting an imported condition into that list would change native list precedence, so this work does not silently do that. A separate preservation update is needed for imported native compatibility metadata and for the editor that changes those rules.

Native automatic selection/unselection policies, user-installed vendor enablement, unresolved system inheritance files, full preset-package import and native GUI selection roundtrips remain separate acceptance work. This closes bundled expression evaluation and admission, not every preset-management feature.
