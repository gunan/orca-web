import React from "react";
import manifest from "../public/native-icons/manifest.json";
import toolbarManifest from "../public/native-toolbar-icons/manifest.json";
const files = new Set(manifest.files.map((item) => item.file));
const toolbarIcons = new Set(toolbarManifest.icons);
export default function NativeIcon({ name, className = "" }) {
  const dark = files.has(`${name}_dark.svg`) ? `${name}_dark` : name;
  return (
    <span aria-hidden="true" className={`native-icon ${className}`}>
      <img
        className="native-icon-light"
        src={`/native-icons/${name}.svg`}
        alt=""
      />
      <img
        className="native-icon-dark"
        src={`/native-icons/${dark}.svg`}
        alt=""
      />
    </span>
  );
}
function NativeToolbarIcon({ name }) {
  if (!toolbarIcons.has(name)) return <NativeIcon name={name} />;
  return (
    <span aria-hidden="true" className="native-icon native-toolbar-icon">
      {["light", "dark"].map((theme) => (
        <img
          key={theme}
          className={`native-icon-${theme}`}
          src={`/native-toolbar-icons/${name}-${theme}-36.png`}
          srcSet={`/native-toolbar-icons/${name}-${theme}-72.png 2x`}
          alt=""
        />
      ))}
    </span>
  );
}
export function NativeToolButton({ icon, label, showLabel = false, ...props }) {
  return (
    <button
      {...props}
      className={`native-tool ${showLabel ? "labeled-tool" : ""} ${props.className || ""}`}
      aria-label={label}
      title={label}
    >
      <NativeToolbarIcon name={icon} />
      <span className={showLabel ? "tool-label" : "sr-only"}>{label}</span>
    </button>
  );
}
