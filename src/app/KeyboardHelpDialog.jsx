import Modal from "../Modal.jsx";
import { EDITOR_SHORTCUTS } from "../../shared/native-shortcuts.js";
import { PREVIEW_SHORTCUTS } from "../../shared/preview-shortcuts.js";
import React from "react";
export default function KeyboardHelpDialog({ toolState }) {
  const { help, setHelp } = toolState;
  return (
    help && (
      <Modal
        className="help-dialog"
        aria-label="Keyboard shortcuts"
        onClose={() => setHelp(false)}
      >
        <header>
          <h2>Keyboard shortcuts</h2>
          <button autoFocus onClick={() => setHelp(false)}>
            Close
          </button>
        </header>
        <p>
          Ctrl on Windows/Linux or ⌘ on macOS. Editing fields and open dialogs
          keep their own keys.
        </p>
        {["Global", "Prepare", "Preview"].map((group) => (
          <section key={group}>
            <h3>{group}</h3>
            <dl>
              {[...EDITOR_SHORTCUTS, ...PREVIEW_SHORTCUTS]
                .filter((row) => row[0] === group)
                .map(([scope, key, label], index) => (
                  <React.Fragment key={key + index}>
                    <dt>{key.replaceAll("Mod", "Ctrl/⌘")}</dt>
                    <dd>{label}</dd>
                  </React.Fragment>
                ))}
            </dl>
          </section>
        ))}
        <p>
          Copy/Paste uses an application model clipboard. Clone creates 1–1000
          copies with native placement. Additional preferences, selection across
          all plates and remaining native shortcuts are still being implemented.
          Browser-reserved shortcuts may require using the application menu.
        </p>
      </Modal>
    )
  );
}
