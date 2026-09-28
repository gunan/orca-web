import Modal from "../../Modal.jsx";
import React from "react";
export default function NativeTextLossDialog({ toolState, actions }) {
  const { nativeTextAction, setNativeTextAction } = toolState;
  const { confirmNativeTextLoss } = actions;
  return (
    nativeTextAction && (
      <Modal
        className="help-dialog"
        aria-label="Remove native text editing metadata"
        onClose={() => setNativeTextAction(null)}
      >
        <h2>{nativeTextAction.title}</h2>
        <p>{nativeTextAction.message}</p>
        <p>
          The prepared result will replace the selected geometry. Undo restores
          the original mesh and its metadata.
        </p>
        <div className="unsaved-buttons">
          <button autoFocus onClick={() => setNativeTextAction(null)}>
            Keep native text
          </button>
          <button onClick={confirmNativeTextLoss}>
            Remove metadata and continue
          </button>
        </div>
      </Modal>
    )
  );
}
