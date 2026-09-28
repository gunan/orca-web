import Modal from "../Modal.jsx";
import CutClipboardDialog from "../workspace/dialogs/CutClipboardDialog.jsx";
import PaintingDialog from "../workspace/dialogs/PaintingDialog.jsx";
import VariableLayersDialog from "../workspace/dialogs/VariableLayersDialog.jsx";
import HeightRangesDialog from "../workspace/dialogs/HeightRangesDialog.jsx";
import BrimDialog from "../workspace/dialogs/BrimDialog.jsx";
import CloneDialog from "../CloneDialog.jsx";
import NativeSvgDialog from "../NativeSvgDialog.jsx";
import {
  filamentColors,
  filamentSlotCount,
} from "../../shared/filament-slots.js";
import ArrangeDialog from "../ArrangeDialog.jsx";
import ModelCutDialog from "../workspace/dialogs/ModelCutDialog.jsx";
import PartsDialog from "../workspace/dialogs/PartsDialog.jsx";
import SettingsCorrectionsDialog from "../printers/SettingsCorrectionsDialog.jsx";
import PrimeTowerEditor from "../PrimeTowerEditor.jsx";
import { applyAutomaticProcessCorrections } from "../../shared/process-settings-state.js";
import FlushVolumesEditor from "../FlushVolumesEditor.jsx";
import FilamentSequenceEditor from "../FilamentSequenceEditor.jsx";
import LayerEventsEditor from "../LayerEventsEditor.jsx";
import AddPrinterDialog from "../printers/AddPrinterDialog.jsx";
import PresetEditorDialog from "../printers/PresetEditorDialog.jsx";
import CalibrationResultDialog from "../CalibrationResultDialog.jsx";
import CalibrationDialog from "../CalibrationDialog.jsx";
import NativeTextLossDialog from "../workspace/dialogs/NativeTextLossDialog.jsx";
import UnsavedChangesDialog from "./UnsavedChangesDialog.jsx";
import PresetCompare from "../PresetCompare.jsx";
import ImportOptionsDialog from "./ImportOptionsDialog.jsx";
import ZeroVolumeImportDialog from "../ZeroVolumeImportDialog.jsx";
import MultipartImportDialog from "../MultipartImportDialog.jsx";
import ProjectLoadDialog from "../ProjectLoadDialog.jsx";
import PreferencesDialog from "./PreferencesDialog.jsx";
import KeyboardHelpDialog from "./KeyboardHelpDialog.jsx";
import React from "react";
export default function WorkspaceDialogs({
  files,
  actions,
  toolState,
  selection,
  projectState,
  session,
  presets,
  settings,
  appearance,
}) {
  return (
    <>
      {files.importing && !files.multipartImport && !files.zeroVolumeImport && (
        <Modal
          aria-label={`Importing ${files.importing}`}
          onClose={actions.cancelImport}
        >
          <h2>Importing {files.importing}</h2>
          <p role="status">
            {files.importing === "project"
              ? "Reading the project and restoring its presets…"
              : "Reading model geometry…"}
          </p>
          <button autoFocus onClick={actions.cancelImport}>
            Cancel import
          </button>
        </Modal>
      )}
      <CutClipboardDialog toolState={toolState} actions={actions} />
      <PaintingDialog
        toolState={toolState}
        selection={selection}
        projectState={projectState}
        actions={actions}
      />
      <VariableLayersDialog
        toolState={toolState}
        selection={selection}
        session={session}
        projectState={projectState}
        presets={presets}
        actions={actions}
      />
      <HeightRangesDialog
        toolState={toolState}
        selection={selection}
        projectState={projectState}
        presets={presets}
        actions={actions}
      />
      <BrimDialog
        toolState={toolState}
        selection={selection}
        projectState={projectState}
        presets={presets}
        actions={actions}
      />
      {toolState.cloneOpen && (
        <CloneDialog
          canAutoArrange
          onFill={actions.fillBed}
          onClone={actions.cloneModels}
          onClose={() => toolState.setCloneOpen(false)}
        />
      )}
      {toolState.clipboardBusy && !toolState.cloneOpen && (
        <Modal
          aria-label={`Paste ${toolState.clipboardTask}`}
          onClose={() => toolState.clipboardRequest.current?.abort()}
        >
          <h2>Paste {toolState.clipboardTask}</h2>
          <p role="status">
            {toolState.clipboardTask === "models"
              ? "Finding native placement…"
              : "Applying native process settings…"}
          </p>
          <button onClick={() => toolState.clipboardRequest.current?.abort()}>
            Cancel paste
          </button>
        </Modal>
      )}
      {toolState.svgOpen && (
        <NativeSvgDialog
          filamentColors={filamentColors(
            projectState.project,
            presets.resolved?.filamentSettings?.filament_colour?.[0],
          )}
          objects={projectState.project.objects}
          selectedId={projectState.project.selectedId}
          bed={selection.bed}
          plateId={projectState.project.activePlateId}
          onApply={(result) =>
            actions.edit((current) => ({
              ...current,
              objects: result.objects,
              selectedId: result.selectedId,
              nativeWorkflow: true,
            }))
          }
          onClose={() => toolState.setSvgOpen(false)}
        />
      )}
      {toolState.arrangeOpen && (
        <ArrangeDialog
          options={toolState.arrangeOptions}
          selected={Boolean(selection.selected)}
          onClose={() => toolState.setArrangeOpen(false)}
          onApply={actions.arrange}
        />
      )}
      {toolState.textOpen && (
        <selection.TextDialog
          filamentColors={filamentColors(
            projectState.project,
            presets.resolved?.filamentSettings?.filament_colour?.[0],
          )}
          objects={projectState.project.objects}
          selectedId={projectState.project.selectedId}
          bed={selection.bed}
          plateId={projectState.project.activePlateId}
          onApply={(result) =>
            actions.edit((current) => ({
              ...current,
              objects: result.objects,
              selectedId: result.selectedId,
              nativeWorkflow: true,
            }))
          }
          onClose={() => toolState.setTextOpen(false)}
        />
      )}
      <ModelCutDialog
        toolState={toolState}
        selection={selection}
        projectState={projectState}
        actions={actions}
      />
      <PartsDialog
        toolState={toolState}
        projectState={projectState}
        presets={presets}
        actions={actions}
      />
      <SettingsCorrectionsDialog toolState={toolState} actions={actions} />
      {toolState.primeTowerOpen && (
        <PrimeTowerEditor
          project={projectState.project}
          process={presets.resolved?.settings}
          bed={selection.bed}
          onChange={(next) => {
            try {
              actions.edit({
                ...next,
                overrides: applyAutomaticProcessCorrections(
                  presets.resolved,
                  next.overrides,
                  {
                    filamentCount: filamentSlotCount(next),
                    projectSettings:
                      next.nativeSettings || next.projectOverrides,
                  },
                ),
              });
            } catch (cause) {
              session.setError(cause.message);
            }
          }}
          onClose={() => toolState.setPrimeTowerOpen(false)}
        />
      )}
      {toolState.flushOpen && (
        <FlushVolumesEditor
          project={projectState.project}
          printerSettings={settings.displayedSelection?.printerSettings}
          onChange={actions.changeProjectSettings}
          onClose={() => toolState.setFlushOpen(false)}
        />
      )}
      {toolState.filamentSequenceOpen && (
        <FilamentSequenceEditor
          plate={projectState.project.plates.find(
            (plate) => plate.id === projectState.project.activePlateId,
          )}
          settings={
            projectState.project.nativeSettings ||
            projectState.project.projectOverrides ||
            {}
          }
          filamentCount={filamentSlotCount(projectState.project)}
          onChange={(changed) =>
            actions.edit((current) => ({
              ...current,
              nativeWorkflow: true,
              plates: current.plates.map((plate) =>
                plate.id === changed.id ? changed : plate,
              ),
            }))
          }
          onClose={() => toolState.setFilamentSequenceOpen(false)}
        />
      )}
      {toolState.layerEventsOpen && (
        <LayerEventsEditor
          plate={projectState.project.plates.find(
            (plate) => plate.id === projectState.project.activePlateId,
          )}
          maxHeight={selection.bed.height}
          filamentCount={
            projectState.project.useEmbeddedSettings
              ? projectState.project.nativeSettings?.filament_settings_id
                  ?.length || 1
              : projectState.project.filamentIds?.length || 1
          }
          extruderCount={
            presets.resolved?.printerSettings?.nozzle_diameter?.length || 1
          }
          onChange={(layerEvents) =>
            actions.edit((current) => ({
              ...current,
              nativeWorkflow: true,
              plates: current.plates.map((plate) =>
                plate.id === current.activePlateId
                  ? {
                      ...plate,
                      layerEvents,
                    }
                  : plate,
              ),
            }))
          }
          onClose={() => toolState.setLayerEventsOpen(false)}
        />
      )}
      {toolState.addPrinterOpen && (
        <AddPrinterDialog
          printers={presets.catalog.printers}
          selectedId={projectState.ids.printerId}
          onSelect={(id) => {
            if (projectState.project.useEmbeddedSettings)
              actions.edit((current) => ({
                ...current,
                useEmbeddedSettings: false,
              }));
            actions.changePreset("printerId", id);
          }}
          onClose={() => toolState.setAddPrinterOpen(false)}
          actions={actions}
        />
      )}
      <PresetEditorDialog
        toolState={toolState}
        projectState={projectState}
        presets={presets}
        actions={actions}
      />
      <CalibrationResultDialog
        open={toolState.calibrationResultOpen}
        onClose={() => toolState.setCalibrationResultOpen(false)}
        calibration={projectState.project.calibration}
        plan={projectState.project.calibrationPlan}
        onSaved={async ({ preset }) => {
          await actions.savedPreset(preset);
          session.setNotice(
            "Calibrated filament saved and selected. The model now uses ordinary slicing settings.",
          );
        }}
      />
      <CalibrationDialog
        printerConfig={presets.resolved?.printerSettings}
        open={toolState.calibrationOpen}
        onClose={() => toolState.setCalibrationOpen(false)}
        selection={projectState.ids}
        onCreate={actions.createCalibration}
      />
      <NativeTextLossDialog toolState={toolState} actions={actions} />
      <UnsavedChangesDialog toolState={toolState} actions={actions} />
      {toolState.compare && presets.resolved && (
        <PresetCompare
          catalog={presets.catalog}
          ids={projectState.ids}
          resolved={settings.displayedSelection}
          overrides={projectState.overrides}
          onClose={() => toolState.setCompare(false)}
        />
      )}
      <ImportOptionsDialog toolState={toolState} />
      {files.zeroVolumeImport && (
        <ZeroVolumeImportDialog onContinue={files.zeroVolumeImport.continue} />
      )}
      {files.multipartImport && (
        <MultipartImportDialog onChoose={files.multipartImport.choose} />
      )}
      {files.projectLoadDialog && (
        <ProjectLoadDialog
          file={files.projectLoadDialog.file}
          onClose={() => files.setProjectLoadDialog(null)}
          onAccept={(action) => {
            const { file, entry } = files.projectLoadDialog;
            files.setProjectLoadDialog(null);
            actions.applyProjectLoad(file, entry, action, entry === "open");
          }}
        />
      )}
      <PreferencesDialog appearance={appearance} files={files} />
      <KeyboardHelpDialog toolState={toolState} />
    </>
  );
}
