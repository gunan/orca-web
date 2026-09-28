import PrinterPanel from "../printers/PrinterPanel.jsx";
import FilamentSlots from "../FilamentSlots.jsx";
import {
  addFilamentSlot,
  removeFilamentSlot,
  setFilamentColor,
  filamentSlotCount,
} from "../../shared/filament-slots.js";
import { physicalNozzleCount } from "../../shared/purge-volumes.js";
import Settings from "../Settings.jsx";
import PresetSelect from "../PresetSelect.jsx";
import { NativeToolButton } from "../NativeIcon.jsx";
import NativeObjectTree from "../NativeObjectTree.jsx";
import React from "react";
export default function PrepareSidebar({
  toolState,
  status,
  presets,
  projectState,
  actions,
  files,
  settings,
  selection,
  session,
}) {
  const {
    setAddPrinterOpen,
    setProfileEditor,
    filamentError,
    setFlushOpen,
    setTreeEditorScope,
    setPartsEditorOpen,
    setSettingsCorrections,
    setCompare,
    arranging,
    primeTowerSelected,
  } = toolState;
  const { pending } = status;
  const { catalog, catalogPending, resolved } = presets;
  const { project, ids, overrides } = projectState;
  const {
    changePreset,
    useInstalledPresets,
    editFilaments,
    changeFilamentSlot,
    resetSetting,
    changeSetting,
    resetSettings,
    arrange,
    selectAll,
    deselectAll,
    selectTreeNode,
    treePrintability,
    resetTreeSettings,
    treeSettings,
    treePainting,
    treeVariableLayers,
    treeVisibility,
  } = actions;
  const { submitting } = files;
  const { displayedSelection, settingsState } = settings;
  const { selected, activeObjects } = selection;
  const { modelInput } = session;
  return (
    <aside className="native-sidebar">
      <PrinterPanel
        setAddPrinterOpen={setAddPrinterOpen}
        pending={pending}
        catalog={catalog}
        project={project}
        ids={ids}
        setProfileEditor={setProfileEditor}
        catalogPending={catalogPending}
        resolved={resolved}
        changePreset={changePreset}
        submitting={submitting}
      />
      {project.useEmbeddedSettings && (
        <section className="embedded-presets">
          <b>Embedded native presets</b>
          <p>
            {resolved?.printer?.name} · {resolved?.process?.name}
          </p>
          <p>{project.nativeSettings?.filament_settings_id?.join(", ")}</p>
          <button onClick={useInstalledPresets} disabled={pending}>
            Use installed presets
          </button>
        </section>
      )}
      <FilamentSlots
        project={project}
        options={catalog.filaments}
        pending={pending}
        add={() =>
          editFilaments((current) =>
            addFilamentSlot(current, {
              nozzles: physicalNozzleCount(
                displayedSelection?.printerSettings || {},
              ),
            }),
          )
        }
        remove={(index) =>
          editFilaments((current) =>
            removeFilamentSlot(current, index, {
              nozzles: physicalNozzleCount(
                displayedSelection?.printerSettings || {},
              ),
            }),
          )
        }
        changePreset={(index, value) =>
          index === 0
            ? changePreset("filamentId", value)
            : changeFilamentSlot(index, value)
        }
        onEdit={(index) =>
          setProfileEditor({
            scope: "filament",
            filamentIndex: index,
            id: project.filamentIds?.[index] || ids.filamentId,
          })
        }
        changeColor={(index, color) =>
          editFilaments((current) => setFilamentColor(current, index, color))
        }
        error={filamentError}
        onPurge={() => setFlushOpen(true)}
      />
      {catalog.warnings?.length > 0 && (
        <details className="catalog-warning">
          <summary>{catalog.warnings.length} preset catalog notices</summary>
          <ul>
            {catalog.warnings.map((warning, index) => (
              <li key={index}>{warning}</li>
            ))}
          </ul>
        </details>
      )}
      <Settings
        editObjectSettings={() => {
          setTreeEditorScope("object");
          setPartsEditorOpen(true);
        }}
        hasSelectedObject={Boolean(selected)}
        state={settingsState}
        reviewCorrections={() =>
          setSettingsCorrections(
            settingsState.correctionPlan.groups.filter(
              (item) => item.mode !== "automatic",
            ),
          )
        }
        embedded={project.useEmbeddedSettings}
        embeddedProcessName={
          project.useEmbeddedSettings
            ? resolved?.process?.name ||
              project.nativeSettings?.print_settings_id ||
              "Embedded process"
            : undefined
        }
        catalogPending={catalogPending}
        editPreset={() =>
          setProfileEditor({
            scope: "process",
            id: ids.processId,
          })
        }
        PresetSelect={PresetSelect}
        compare={() => setCompare(true)}
        resetSetting={resetSetting}
        catalog={catalog}
        ids={ids}
        changePreset={changePreset}
        resolved={displayedSelection}
        overrides={overrides}
        changeSetting={changeSetting}
        reset={resetSettings}
        pending={pending || Boolean(project.calibration)}
      />
      <section
        className="scene-object-list native-tree-panel"
        data-empty={!project.objects.length}
        aria-label="Objects"
      >
        <div className="side-title">
          <b>Objects</b>
          <button
            aria-label="Add models"
            onClick={() => modelInput.current.click()}
          >
            ＋
          </button>
          <NativeToolButton
            icon="toolbar_arrange"
            label="Arrange"
            onClick={() => arrange()}
            disabled={!activeObjects.length || arranging}
          />
        </div>
        <div className="selection-actions">
          <button onClick={selectAll} disabled={!activeObjects.length}>
            Select all
          </button>
          <button
            onClick={deselectAll}
            disabled={!selected && primeTowerSelected !== project.activePlateId}
          >
            Deselect all
          </button>
        </div>
        <NativeObjectTree
          project={project}
          filamentCount={filamentSlotCount(project)}
          globalSettings={{
            ...resolved?.settings,
            ...overrides,
          }}
          onSelect={selectTreeNode}
          onPrintable={treePrintability}
          onReset={resetTreeSettings}
          onSettings={treeSettings}
          onPainting={treePainting}
          onVariableLayers={treeVariableLayers}
          onVisibility={treeVisibility}
        />
      </section>
    </aside>
  );
}
