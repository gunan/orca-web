import PrimeTowerInspector from "../PrimeTowerInspector.jsx";
import { filamentSlotCount } from "../../shared/filament-slots.js";
import TransformPanel from "./TransformPanel.jsx";
import React from "react";
export default function SelectionInspector({
  toolState,
  projectState,
  presets,
  selection,
  status,
  actions,
  appearance,
  files,
}) {
  const {
    primeTowerSelected,
    setPrimeTowerOpen,
    setTextOpen,
    setSvgOpen,
    setTreeEditorScope,
    setPartsEditorOpen,
    transformScope,
    setTransformScope,
  } = toolState;
  const { project } = projectState;
  const { resolved } = presets;
  const { selected, multiple, transformObject } = selection;
  const { pending } = status;
  const {
    changeSelected,
    centerSelected,
    dropSelected,
    duplicateSelected,
    deleteSelected,
    splitSelected,
    disassembleSelected,
    repairSelected,
    mirrorSelected,
  } = actions;
  const { displayPreferences } = appearance;
  const { importing } = files;
  return (
    <aside className="object-inspector">
      {primeTowerSelected === project.activePlateId ? (
        <PrimeTowerInspector
          project={project}
          process={resolved?.nativeProcessSettings || resolved?.settings}
          onEdit={() => setPrimeTowerOpen(true)}
        />
      ) : (
        <>
          {selected?.native?.embossShape && (
            <div
              className="native-text-info"
              role="note"
              aria-label="Native text metadata"
            >
              <strong>
                {selected.native.textConfiguration
                  ? "Native text"
                  : "Native embossed shape"}
              </strong>
              {selected.native.textConfiguration && (
                <p>{selected.native.textConfiguration.text}</p>
              )}
              <p>
                {selected.native.embossShape.useSurface
                  ? "Uses native surface projection"
                  : "Planar"}{" "}
                · {selected.native.embossShape.depth} mm depth
              </p>
              <p>
                Editing metadata is preserved. Native text and embedded SVG can
                be regenerated with the installed geometry helper.
              </p>
              {selected.native.textConfiguration ? (
                <button
                  disabled={multiple || pending}
                  onClick={() => setTextOpen(true)}
                >
                  Edit native text
                </button>
              ) : (
                selected.native.embossShape.svg && (
                  <button
                    disabled={multiple || pending}
                    onClick={() => setSvgOpen(true)}
                  >
                    Edit native SVG
                  </button>
                )
              )}
            </div>
          )}
          {selected?.text && (
            <button disabled={multiple} onClick={() => setTextOpen(true)}>
              Edit text
            </button>
          )}
          {selected && (
            <button
              disabled={multiple}
              onClick={() => {
                setTreeEditorScope("object");
                setPartsEditorOpen(true);
              }}
            >
              Object / part settings
            </button>
          )}
          {selected && (
            <label className="object-filament">
              Object filament
              <select
                disabled={multiple}
                aria-label="Object filament slot"
                value={selected.filamentSlot || 1}
                onChange={(event) =>
                  changeSelected({
                    filamentSlot: Number(event.target.value),
                  })
                }
              >
                {Array.from(
                  {
                    length: filamentSlotCount(project),
                  },
                  (_, index) => (
                    <option key={index} value={index + 1}>
                      {index + 1}
                    </option>
                  ),
                )}
              </select>
            </label>
          )}
          <label className="object-filament">
            Transform scope
            <select
              aria-label="Transform scope"
              value={transformScope}
              onChange={(event) => setTransformScope(event.target.value)}
            >
              <option value="object">Whole object</option>
              <option value="part">Selected part</option>
            </select>
          </label>
          <TransformPanel
            imperial={displayPreferences.use_inches === "1"}
            disabled={Boolean(importing)}
            object={transformObject}
            change={changeSelected}
            center={centerSelected}
            drop={dropSelected}
            duplicate={duplicateSelected}
            remove={deleteSelected}
            split={splitSelected}
            disassemble={disassembleSelected}
            repair={repairSelected}
            mirror={mirrorSelected}
          />
        </>
      )}
    </aside>
  );
}
