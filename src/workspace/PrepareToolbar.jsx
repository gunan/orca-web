import "./prepare-toolbar.css";
import { NativeToolButton } from "../NativeIcon.jsx";
import React from "react";

export default function PrepareToolbar({
  modelInput,
  setImportOptionsOpen,
  mode,
  setMode,
  pending,
  selected,
  primeTowerSelected,
  project,
  multiple,
  setWireframe,
  wireframe,
  arrange,
  activeObjects,
  arranging,
  setArrangeOpen,
  arrangeController,
  setLayerEventsOpen,
  resolved,
  setFilamentSequenceOpen,
  setPrimeTowerOpen,
  assemblePlate,
  visibleObjects,
  setCutOpen,
  setTextOpen,
  setSvgOpen,
  setBrimOpen,
  setVariableLayersOpen,
  setTreeRangeIndex,
  setHeightRangesOpen,
  setPaintingChannel,
}) {
  return (
    <div
      className="toolbar prepare-toolbar"
      role="toolbar"
      aria-label="Model tools"
    >
      <div className="primary-tools">
        <NativeToolButton
          showLabel
          icon="toolbar_open"
          label="＋ Open models"
          onClick={() => modelInput.current.click()}
        />

        {["Select", "Move", "Rotate", "Scale", "Place on face"].map((name) =>
          name === "Select" ? (
            <button
              key={name}
              aria-pressed={mode === name}
              className={mode === name ? "active" : ""}
              onClick={() => setMode(name)}
            >
              Select
            </button>
          ) : (
            <NativeToolButton
              showLabel
              icon={
                {
                  Move: "toolbar_move",
                  Rotate: "toolbar_rotate",
                  Scale: "toolbar_scale",
                  "Place on face": "toolbar_flatten",
                }[name]
              }
              label={name}
              aria-pressed={mode === name}
              className={mode === name ? "active" : ""}
              key={name}
              onClick={() => setMode(name)}
              disabled={
                pending ||
                (!selected &&
                  !(
                    name === "Move" &&
                    primeTowerSelected === project.activePlateId
                  )) ||
                (multiple && name === "Place on face")
              }
            />
          ),
        )}
      </div>
      <div
        className="additional-tools"
        role="group"
        aria-label="Additional model tools"
      >
        <button onClick={() => setImportOptionsOpen(true)}>
          Import options
        </button>
        <button
          onClick={() => setWireframe((value) => !value)}
          aria-pressed={wireframe}
        >
          Wireframe
        </button>
        <NativeToolButton
          icon="toolbar_arrange"
          label="Arrange"
          onClick={() => arrange()}
          disabled={!activeObjects.length || arranging}
        />
        <button
          onClick={() => setArrangeOpen(true)}
          disabled={!activeObjects.length || arranging}
        >
          Arrange options
        </button>
        {arranging && (
          <button onClick={() => arrangeController.current?.abort()}>
            Cancel arrangement
          </button>
        )}
        <button
          onClick={() => setLayerEventsOpen(true)}
          disabled={!resolved || pending}
        >
          Layer events
        </button>
        <button
          onClick={() => setFilamentSequenceOpen(true)}
          disabled={!resolved || pending || Boolean(project.calibration)}
        >
          Filament order
        </button>
        <button
          onClick={() => setPrimeTowerOpen(true)}
          disabled={!resolved || pending || Boolean(project.calibration)}
        >
          Prime tower
        </button>
        <NativeToolButton
          icon="toolbar_assemble"
          label="Assemble plate"
          onClick={assemblePlate}
          disabled={visibleObjects.length < 2}
        />
        <NativeToolButton
          icon="toolbar_cut"
          label="Cut"
          onClick={() => setCutOpen(true)}
          disabled={!selected || multiple || pending}
        />
        <NativeToolButton
          icon="toolbar_text"
          label="Text"
          onClick={() => setTextOpen(true)}
          disabled={multiple || pending || Boolean(project.calibration)}
        />
        <button
          onClick={() => setSvgOpen(true)}
          disabled={multiple || pending || Boolean(project.calibration)}
        >
          Native SVG
        </button>
        <NativeToolButton
          icon="toolbar_brimears"
          label="Brim ears"
          onClick={() => setBrimOpen(true)}
          disabled={
            !selected || multiple || pending || Boolean(project.calibration)
          }
        />
        <NativeToolButton
          icon="toolbar_variable_layer_height"
          label="Variable layers"
          onClick={() => setVariableLayersOpen(true)}
          disabled={
            !selected || multiple || pending || Boolean(project.calibration)
          }
        />
        <button
          onClick={() => {
            setTreeRangeIndex(0);
            setHeightRangesOpen(true);
          }}
          disabled={
            !selected || multiple || pending || Boolean(project.calibration)
          }
        >
          Height ranges
        </button>
        {[
          ["supports", "toolbar_support", "Paint supports"],
          ["seam", "toolbar_seam", "Paint seams"],
          ["color", "mmu_segmentation", "Paint colors"],
          ["fuzzy", "toolbar_fuzzy_skin_paint", "Paint fuzzy skin"],
        ].map(([channel, icon, label]) => (
          <NativeToolButton
            key={channel}
            icon={icon}
            label={label}
            onClick={() => setPaintingChannel(channel)}
            disabled={
              !selected ||
              multiple ||
              (selected.native?.partType || "normal_part") !== "normal_part" ||
              pending ||
              Boolean(project.calibration)
            }
          />
        ))}
      </div>
    </div>
  );
}
