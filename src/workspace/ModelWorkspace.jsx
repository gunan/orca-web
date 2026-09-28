import PrepareToolbar from "./PrepareToolbar.jsx";
import RotationControls from "../rotation/RotationControls.jsx";
import SceneViewport from "../SceneViewport.jsx";
import { updatePrimeTower, primeTowerState } from "../../shared/prime-tower.js";
import { filamentColors } from "../../shared/filament-slots.js";
import { placeSceneOnFace } from "../../shared/scene-object-operations.js";
import { triangleCount } from "../../shared/geometry.js";
import React from "react";
export default function ModelWorkspace({
  session,
  toolState,
  status,
  selection,
  projectState,
  actions,
  presets,
  files,
  appearance,
}) {
  const { modelInput, setError } = session;
  const {
    setImportOptionsOpen,
    mode,
    setMode,
    primeTowerSelected,
    setWireframe,
    wireframe,
    arranging,
    setArrangeOpen,
    arrangeController,
    setLayerEventsOpen,
    setFilamentSequenceOpen,
    setPrimeTowerOpen,
    setCutOpen,
    setTextOpen,
    setSvgOpen,
    setBrimOpen,
    setVariableLayersOpen,
    setTreeRangeIndex,
    setHeightRangesOpen,
    setPaintingChannel,
    rotationPreview,
    rotationSnap,
    setRotationSnap,
    setRotationPreview,
    setPrimeTowerSelected,
    setPrimeTowerDragLayout,
    cameraFrame,
    cameraCommand,
    transformScope,
  } = toolState;
  const { pending, primeTowerPreview } = status;
  const {
    selected,
    multiple,
    activeObjects,
    visibleObjects,
    transformObject,
    selectionIds,
    bed,
    selectionCount,
  } = selection;
  const { project } = projectState;
  const {
    arrange,
    assemblePlate,
    changeSelected,
    edit,
    selectCanvas,
    selectRectangle,
    transform,
    choose,
    switchPlate,
    addPlate,
  } = actions;
  const { resolved } = presets;
  const { importing } = files;
  const { displayPreferences } = appearance;
  return (
    <div className="center scene-center">
      <PrepareToolbar
        modelInput={modelInput}
        setImportOptionsOpen={setImportOptionsOpen}
        mode={mode}
        setMode={setMode}
        pending={pending}
        selected={selected}
        primeTowerSelected={primeTowerSelected}
        project={project}
        multiple={multiple}
        setWireframe={setWireframe}
        wireframe={wireframe}
        arrange={arrange}
        activeObjects={activeObjects}
        arranging={arranging}
        setArrangeOpen={setArrangeOpen}
        arrangeController={arrangeController}
        setLayerEventsOpen={setLayerEventsOpen}
        resolved={resolved}
        setFilamentSequenceOpen={setFilamentSequenceOpen}
        setPrimeTowerOpen={setPrimeTowerOpen}
        assemblePlate={assemblePlate}
        visibleObjects={visibleObjects}
        setCutOpen={setCutOpen}
        setTextOpen={setTextOpen}
        setSvgOpen={setSvgOpen}
        setBrimOpen={setBrimOpen}
        setVariableLayersOpen={setVariableLayersOpen}
        setTreeRangeIndex={setTreeRangeIndex}
        setHeightRangesOpen={setHeightRangesOpen}
        setPaintingChannel={setPaintingChannel}
      />
      {mode === "Rotate" && (
        <RotationControls
          object={transformObject}
          preview={rotationPreview}
          snap={rotationSnap}
          onSnapChange={setRotationSnap}
          onChange={changeSelected}
          disabled={pending}
        />
      )}
      <SceneViewport
        rotationSnap={rotationSnap}
        onRotationPreview={setRotationPreview}
        primeTowerSelected={primeTowerSelected}
        onPrimeTowerSelect={(plateId, { dragging = false } = {}) => {
          setPrimeTowerSelected(plateId);
          setPrimeTowerDragLayout(
            dragging
              ? Boolean(selected) ||
                  primeTowerSelected === project.activePlateId
              : null,
          );
        }}
        onPrimeTowerMove={(position, plateId) => {
          if (project.activePlateId !== plateId) return;
          try {
            const process =
              resolved?.nativeProcessSettings || resolved?.settings;
            edit((current) =>
              updatePrimeTower(
                current,
                {
                  ...primeTowerState(current, process),
                  x: position[0],
                  y: position[1],
                },
                process,
              ),
            );
          } catch (cause) {
            setError(cause.message);
          }
        }}
        onPrimeTowerError={setError}
        primeTowerPreview={primeTowerPreview}
        onCameraFrame={(matrix) => {
          cameraFrame.current = matrix;
        }}
        cameraCommand={cameraCommand}
        filamentColors={filamentColors(
          project,
          resolved?.filamentSettings?.filament_colour?.[0],
        )}
        objects={activeObjects}
        selectedId={project.selectedId}
        selectedIds={selectionIds}
        transformObject={transformObject}
        onSelect={selectCanvas}
        onRectangleSelect={selectRectangle}
        onTransform={transform}
        onPlaceFace={(id, normal) => {
          if (multiple) return;
          try {
            const objects = placeSceneOnFace(project.objects, id, normal, bed, {
              scope: transformScope,
            });
            edit((current) => ({
              ...current,
              objects,
            }));
          } catch (cause) {
            setError(cause.message);
          }
        }}
        mode={multiple && mode === "Place on face" ? "Select" : mode}
        bed={bed}
        wireframe={wireframe}
        onDrop={(event) => {
          event.preventDefault();
          choose(event.dataTransfer.files);
        }}
      >
        <div className="empty-state">
          <h2>
            {importing ? "Importing geometry…" : "Drop models onto the plate"}
          </h2>
          <p>STL, OBJ, 3MF, AMF, SVG, or STEP</p>
          <button onClick={() => modelInput.current.click()}>Open File</button>
        </div>
      </SceneViewport>
      <div className="plate-tabs">
        {project.plates.map((plate) => (
          <button
            key={plate.id}
            className={plate.id === project.activePlateId ? "active" : ""}
            onClick={() => switchPlate(plate.id)}
          >
            {plate.name}
          </button>
        ))}
        <button onClick={addPlate}>＋ Add plate</button>
        {selected && project.plates.length > 1 && (
          <select
            aria-label="Move object to plate"
            value={selected.plateId}
            onChange={(event) =>
              transform(selected.id, {
                plateId: event.target.value,
              })
            }
          >
            {project.plates.map((plate) => (
              <option value={plate.id} key={plate.id}>
                {plate.name}
              </option>
            ))}
          </select>
        )}
      </div>
      <div className="statusbar">
        <span>Objects: {activeObjects.length}</span>
        <span>Triangles: {triangleCount(activeObjects)}</span>
        <span aria-label="Selection count">
          Selected: {selectionCount}{" "}
          {transformScope === "part" ? "parts" : "objects"}
        </span>
        <span className="grow" />
        <span>
          {displayPreferences.use_inches === "1" ? "Inches" : "Millimeters"} ·{" "}
          {resolved?.printer?.bedSize || "Native preset"}
        </span>
      </div>
    </div>
  );
}
