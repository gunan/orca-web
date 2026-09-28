import React, { useState, useEffect } from "react";
import { meshBounds, analyzeMesh } from "../../shared/geometry.js";
import {
  nativeManipulationInput,
  nativeManipulationDisplay,
} from "../../shared/native-manipulation-units.js";

export default function TransformPanel({
  object,
  change,
  center,
  drop,
  duplicate,
  remove,
  split,
  disassemble,
  repair,
  mirror,
  disabled,
  imperial = false,
}) {
  const fmt = (value) => Number(value.toFixed(3));
  const [lock, setLock] = useState(true);
  const [report, setReport] = useState(null);
  useEffect(() => setReport(null), [object]);
  if (!object)
    return (
      <p className="selection-hint">
        Select a model to edit its position, rotation, and size.
      </p>
    );
  const bounds = meshBounds(object);
  function update(key, index, text) {
    const input = Number(text);
    if (!text || !Number.isFinite(input) || (key === "scale" && input <= 0))
      return;
    const value = nativeManipulationInput(key, input, imperial);
    const array = [...object[key]];
    if (key === "scale" && lock) {
      const ratio = value / array[index];
      array.forEach((old, axis) => {
        array[axis] = old * ratio;
      });
    } else array[index] = value;
    change({ [key]: array });
  }
  return (
    <div className="transform-panel" aria-label="Object transform">
      <label className="object-name">
        Name
        <input
          aria-label="Object name"
          value={object.name}
          disabled={disabled || object.multipleSelection}
          onChange={(event) => change({ name: event.target.value })}
        />
      </label>
      {["position", "rotation", "scale"].map((key) => (
        <fieldset key={key} disabled={disabled}>
          <legend>
            {key === "position"
              ? `Position offset (${imperial ? "in" : "mm"})`
              : key === "rotation"
                ? "Rotation (°)"
                : "Scale factor"}
          </legend>
          {["X", "Y", "Z"].map((axis, index) => (
            <label key={axis}>
              {axis}
              <input
                aria-label={`${key} ${axis}`}
                type="number"
                step={
                  key === "scale" || (key === "position" && imperial)
                    ? ".01"
                    : ".1"
                }
                min={key === "scale" ? ".001" : undefined}
                value={fmt(
                  nativeManipulationDisplay(key, object[key][index], imperial),
                )}
                onChange={(event) => update(key, index, event.target.value)}
              />
            </label>
          ))}
        </fieldset>
      ))}
      <label>
        <input
          type="checkbox"
          checked={lock}
          onChange={(event) => setLock(event.target.checked)}
        />{" "}
        Uniform scaling
      </label>
      <p data-testid="object-dimensions">
        Size:{" "}
        {bounds.size
          .map((value) =>
            fmt(nativeManipulationDisplay("size", value, imperial)),
          )
          .join(" × ")}{" "}
        {imperial ? "in" : "mm"}
      </p>
      <div className="object-commands">
        <button onClick={center}>Center</button>
        <button onClick={drop}>Drop to bed</button>
        <button
          onClick={() => change({ rotation: [0, 0, 0], scale: [1, 1, 1] })}
        >
          Reset transform
        </button>
        <button onClick={duplicate}>Duplicate</button>
        <button onClick={remove}>Delete object</button>
        <button onClick={() => setReport(analyzeMesh(object))}>
          Analyze mesh
        </button>
        <button onClick={split} disabled={object.multipleSelection}>
          Split shells
        </button>
        <button
          onClick={disassemble}
          disabled={object.multipleSelection || !object.assemblyParts?.length}
        >
          Disassemble
        </button>
        <button onClick={repair} disabled={object.multipleSelection}>
          Repair mesh
        </button>
        {["X", "Y", "Z"].map((axis) => (
          <button
            key={axis}
            disabled={object.multipleSelection}
            onClick={() => mirror(axis.toLowerCase())}
          >
            Mirror {axis}
          </button>
        ))}
      </div>
      {report && (
        <pre className="mesh-report" aria-label="Mesh analysis">
          {JSON.stringify(report, null, 2)}
        </pre>
      )}
    </div>
  );
}
