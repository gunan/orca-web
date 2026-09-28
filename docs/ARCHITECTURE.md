# Frontend organization

The frontend is organized around the ordinary slicing workflow. `src/main.jsx` only mounts React. `src/App.jsx` composes the workspaces and connects their controllers; it does not implement preset requests, file parsing, clipboard placement, slicing or model transforms.

| Area | Responsibility |
|---|---|
| `src/app/useProjectState.js`, `src/useProject.js` | Project document, undo/redo and selection history |
| `src/app/useWorkspaceSession.js` | Server health, feedback, job state and operation references |
| `src/app/usePresetState.js`, `usePresetActions.js` | Printer/process/material catalogs, selection and custom preset saves |
| `src/app/useProjectFiles.js`, `useProjectExport.js` | Import transactions, project restoration, downloads and export |
| `src/app/useModelSelection.js`, `useModelTransforms.js` | Active plate, selected model/group, transform commands and bounds |
| `src/app/useGeometryActions.js`, `useObjectTreeActions.js` | Mesh editing and object tree commands |
| `src/app/useModelClipboard.js`, `useSettingsClipboard.js` | Model and setting clipboard operations |
| `src/app/useSlicing.js`, `useSessionLifecycle.js` | Slice submission, job polling, autosave and catalog lifecycle |
| `src/app/useWorkspaceTools.js` | Active tool and dialog state |
| `src/app/useWorkspaceActions.js` | Composition of the domain workflows and their keyboard/menu commands |
| `src/app/WorkspaceDialogs.jsx` | Dialog composition with domain controllers |
| `src/workspace/PrepareToolbar.jsx` | Primary labeled model tools and additional tools |
| `src/workspace/PrepareSidebar.jsx`, `SelectionInspector.jsx` | Preset/settings sidebar and selected-model inspector |
| `src/workspace/ModelWorkspace.jsx`, `src/SceneViewport.jsx` | Canvas integration and Three.js rendering/interaction |
| `src/workspace/dialogs/` | Independent painting, cut, part, layer and brim dialog adapters |
| `src/printers/` | Add/create printer flow and preset editor adapters |
| `src/rotation/` | Live rotation controls, angle presets and display normalization |
| `src/lib/http.js` | JSON request/response handling |
| `shared/` | UI-independent geometry, settings and native project formats |
| `server/` | HTTP endpoints, durable presets/jobs and native worker/process adapters |

The app passes named domain controllers (`projectState`, `presets`, `selection`, `session`, `toolState`, `files`, `appearance`, `settings`, `status`, `actions`) to its composition components. Lower-level widgets retain specific inputs and callbacks. Avoid passing a single generic application object or importing application state into the shared geometry/settings modules.

Put new behavior in the domain that owns it. Keep the app entry point and top-level layout declarative. Use normal formatting; compressed lines are not a substitute for module boundaries. A workflow regression should exercise visible behavior and the saved project/native output, rather than asserting component names or line counts.
