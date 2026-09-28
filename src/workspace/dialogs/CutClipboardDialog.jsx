import Modal from "../../Modal.jsx";
import React from "react";
export default function CutClipboardDialog({ toolState, actions }) {
  const { cutClipboardDialog } = toolState;
  const { resolveCutClipboard } = actions;
  return (
    cutClipboardDialog && (
      <Modal
        aria-label="Cut correspondence"
        onClose={() => resolveCutClipboard("cancel")}
      >
        <h2>
          {cutClipboardDialog.confirmation.type === "part"
            ? "Change a part of a cut object"
            : "Delete an object from a cut"}
        </h2>
        <p>This action breaks the relationship between related cut objects.</p>
        {cutClipboardDialog.confirmation.type === "part" && (
          <p>
            Invalidate cut information first, then cut the selected part again.
            Its geometry remains until the second cut.
          </p>
        )}
        <footer>
          {cutClipboardDialog.confirmation.type === "part" ? (
            <>
              <button onClick={() => resolveCutClipboard("invalidate")}>
                Invalidate cut info
              </button>
              {cutClipboardDialog.confirmation.canDeleteConnectors && (
                <button
                  onClick={() => resolveCutClipboard("delete-connectors")}
                >
                  Delete all connectors
                </button>
              )}
            </>
          ) : (
            <button onClick={() => resolveCutClipboard("delete")}>
              Delete
            </button>
          )}
          <button autoFocus onClick={() => resolveCutClipboard("cancel")}>
            Cancel
          </button>
        </footer>
      </Modal>
    )
  );
}
