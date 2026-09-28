import NativeIcon from "../NativeIcon.jsx";
import PresetSelect from "../PresetSelect.jsx";
import React from "react";

export default function PrinterPanel({
  setAddPrinterOpen,
  pending,
  catalog,
  project,
  ids,
  setProfileEditor,
  catalogPending,
  resolved,
  changePreset,
  submitting,
}) {
  return (
    <section className="native-presets">
      <button
        className="add-printer"
        onClick={() => setAddPrinterOpen(true)}
        disabled={pending || !catalog.printers.length}
      >
        ＋ Add printer
      </button>
      <label>
        <span className="native-section-title">
          <NativeIcon name="printer" />
          Printer
        </span>
        <button
          className="preset-edit"
          aria-label="Edit printer preset"
          disabled={pending || project.useEmbeddedSettings || !ids.printerId}
          onClick={() =>
            setProfileEditor({
              scope: "machine",
              id: ids.printerId,
            })
          }
        >
          ✎
        </button>
        <PresetSelect
          label="Printer"
          loading={catalogPending}
          embeddedName={
            project.useEmbeddedSettings
              ? resolved?.printer?.name ||
                project.nativeSettings?.printer_settings_id ||
                "Embedded printer"
              : undefined
          }
          options={catalog.printers}
          value={ids.printerId}
          onChange={(value) => changePreset("printerId", value)}
          disabled={catalogPending || submitting || project.useEmbeddedSettings}
        />
      </label>
      <small>
        {resolved?.printer?.bedSize || "Select a native printer"} · Nozzle{" "}
        {resolved?.printer?.nozzle || "—"} mm
      </small>
    </section>
  );
}
