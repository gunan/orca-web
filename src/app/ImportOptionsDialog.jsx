import Modal from "../Modal.jsx";
import React from "react";
export default function ImportOptionsDialog({ toolState }) {
  const {
    importOptionsOpen,
    setImportOptionsOpen,
    importOptions,
    setImportOptions,
  } = toolState;
  return (
    importOptionsOpen && (
      <Modal
        aria-label="Model import options"
        className="help-dialog"
        onClose={() => setImportOptionsOpen(false)}
      >
        <h2>Model import options</h2>
        <p>
          SVG drawings are extruded into solids. STEP files are tessellated
          locally using OpenCascade.
        </p>
        {[
          ["svgDepth", "SVG extrusion depth (mm)", 0.01],
          ["svgScale", "SVG scale", 0.001],
          ["stepLinearDeflection", "STEP linear deflection (mm)", 0.001],
          ["stepAngularDeflection", "STEP angular deflection (radians)", 0.01],
        ].map(([key, label, min]) => (
          <label className="import-option" key={key}>
            {label}
            <input
              aria-label={label}
              type="number"
              min={min}
              step="any"
              value={importOptions[key]}
              onChange={(event) =>
                setImportOptions((current) => ({
                  ...current,
                  [key]: event.target.value,
                }))
              }
            />
          </label>
        ))}
        <button autoFocus onClick={() => setImportOptionsOpen(false)}>
          Done
        </button>
      </Modal>
    )
  );
}
