import Modal from "../Modal.jsx";
import React from "react";
export default function UnsavedChangesDialog({ toolState, actions }) {
  const { unsavedAction, setUnsavedAction } = toolState;
  const { saveProject } = actions;
  return (
    unsavedAction && (
      <Modal
        className="help-dialog"
        aria-label="Unsaved project changes"
        onClose={() => setUnsavedAction(null)}
      >
        <h2>Unsaved project changes</h2>
        <p>
          Save the current project before replacing it, or discard its unsaved
          changes.
        </p>
        <div className="unsaved-buttons">
          <button onClick={() => setUnsavedAction(null)}>Keep editing</button>
          <button
            onClick={() => {
              const action = unsavedAction;
              setUnsavedAction(null);
              action();
            }}
          >
            Discard changes
          </button>
          <button
            onClick={() => {
              if (!saveProject()) return;
              const action = unsavedAction;
              setUnsavedAction(null);
              action();
            }}
          >
            Save and continue
          </button>
        </div>
      </Modal>
    )
  );
}
