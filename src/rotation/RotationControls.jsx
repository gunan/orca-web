import React from "react";
import {
  displayAngle,
  withRotationAngle,
  ROTATION_PRESETS,
} from "./rotation.js";
import "./rotation.css";

export default function RotationControls({
  object,
  preview,
  snap,
  onSnapChange,
  onChange,
  disabled,
}) {
  if (!object) return null;
  const angles = preview || object.rotation;
  function change(axis, value) {
    if (value !== "" && Number.isFinite(Number(value)))
      onChange({
        rotation: withRotationAngle(object.rotation, axis, Number(value)),
      });
  }
  return (
    <section className="rotation-controls" aria-label="Rotate model">
      <header>
        <strong>
          Rotate <span>{object.name}</span>
        </strong>
        <label>
          <input
            type="checkbox"
            checked={snap}
            onChange={(event) => onSnapChange(event.target.checked)}
            disabled={disabled}
          />
          Snap to 90°
        </label>
      </header>
      <div className="rotation-axes">
        {["X", "Y", "Z"].map((axis, index) => (
          <div className="rotation-axis" key={axis}>
            <label>
              <span
                className={`rotation-axis-label axis-${axis.toLowerCase()}`}
              >
                {axis}
              </span>
              <input
                aria-label={`${axis} rotation angle`}
                type="number"
                step={snap ? 90 : 1}
                value={displayAngle(angles[index])}
                onChange={(event) => change(index, event.target.value)}
                disabled={disabled || Boolean(preview)}
              />
              <span>°</span>
            </label>
            <div
              className="rotation-presets"
              role="group"
              aria-label={`${axis} rotation presets`}
            >
              {ROTATION_PRESETS.map((angle) => (
                <button
                  key={angle}
                  aria-label={`Rotate ${axis} to ${angle}°`}
                  aria-pressed={displayAngle(angles[index]) === angle}
                  onClick={() => change(index, angle)}
                  disabled={disabled || Boolean(preview)}
                >
                  {angle}°
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
      <p>
        Drag a colored ring or choose an angle. Turn off snapping for free
        rotation.
      </p>
    </section>
  );
}
