import Modal from "../Modal.jsx";
import { settingDefinitions } from "../../shared/settings.js";
import React from "react";
export default function SettingsCorrectionsDialog({ toolState, actions }) {
  const { settingsCorrections, setSettingsCorrections } = toolState;
  const { applySettingsCorrections } = actions;
  return (
    settingsCorrections && (
      <Modal
        className="help-dialog"
        aria-label="Native setting changes"
        onClose={() => setSettingsCorrections(null)}
      >
        <h2>Native setting changes</h2>
        <p>These settings require related changes before slicing.</p>
        <ul>
          {settingsCorrections.map((group) => (
            <li key={group.id}>
              <p>{group.reason}</p>
              {group.changes.map((item) => (
                <div key={item.key}>
                  <b>
                    {settingDefinitions.find(
                      (definition) => definition.key === item.key,
                    )?.label || item.key}
                  </b>
                  : {String(item.value)}
                </div>
              ))}
            </li>
          ))}
        </ul>
        <div className="unsaved-buttons">
          <button onClick={() => setSettingsCorrections(null)}>
            Keep editing
          </button>
          {settingsCorrections.every((item) => item.alternative) && (
            <button onClick={() => applySettingsCorrections(true)}>
              Use native alternative
            </button>
          )}
          <button onClick={() => applySettingsCorrections()}>
            Apply required changes
          </button>
        </div>
      </Modal>
    )
  );
}
