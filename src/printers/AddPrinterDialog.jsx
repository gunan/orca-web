import React, { useEffect, useState } from "react";
import Modal from "../Modal.jsx";
import { readJson, jsonBody } from "../lib/http.js";
import "./printers.css";
function printerSize(settings) {
  const points = (settings.printable_area || []).map((point) =>
    String(point).split("x").map(Number),
  );
  const xs = points.map((p) => p[0]),
    ys = points.map((p) => p[1]);
  return {
    originX: points.length ? Math.min(...xs) : 0,
    originY: points.length ? Math.min(...ys) : 0,
    width: points.length ? Math.max(...xs) - Math.min(...xs) : 250,
    depth: points.length ? Math.max(...ys) - Math.min(...ys) : 210,
    height: settings.printable_height || 250,
    nozzle: settings.nozzle_diameter?.[0] || 0.4,
  };
}
export default function AddPrinterDialog({
  actions,
  printers,
  selectedId,
  onSelect,
  onClose,
}) {
  const { savedPreset: onSaved } = actions;
  const [baseId, setBaseId] = useState(selectedId || printers[0]?.id || "");
  const [custom, setCustom] = useState(false),
    [name, setName] = useState("");
  const [source, setSource] = useState(null),
    [size, setSize] = useState({});
  const [loading, setLoading] = useState(true),
    [saving, setSaving] = useState(false),
    [error, setError] = useState("");
  const [review, setReview] = useState(null);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    setReview(null);
    readJson(
      `/api/presets/custom/source/machine/${encodeURIComponent(baseId)}`,
      {
        signal: controller.signal,
      },
    )
      .then((result) => {
        if (controller.signal.aborted) return;
        setSource(result);
        setSize(printerSize(result.settings));
      })
      .catch((cause) => {
        if (!controller.signal.aborted) setError(cause.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [baseId]);
  function changeSize(key, value) {
    setSize((current) => ({
      ...current,
      [key]: value,
    }));
    setReview(null);
  }
  async function save(previous) {
    setSaving(true);
    setError("");
    try {
      if (!custom) {
        await onSelect(baseId);
        onClose();
        return;
      }
      const x = Number(size.originX),
        y = Number(size.originY),
        width = Number(size.width),
        depth = Number(size.depth);
      const settings = {
        printable_area: [
          `${x}x${y}`,
          `${x + width}x${y}`,
          `${x + width}x${y + depth}`,
          `${x}x${y + depth}`,
        ],
        printable_height: String(size.height),
        nozzle_diameter: [
          String(size.nozzle),
          ...(source.settings.nozzle_diameter || []).slice(1),
        ],
      };
      const request = previous || {
        type: "machine",
        baseId,
        name: name.trim(),
        settings,
        selection: {
          printerId: baseId,
        },
        mode: "Advanced",
      };
      const preparation = await readJson(
        "/api/presets/custom/prepare",
        jsonBody(request),
      );
      if (preparation.blockingErrors?.length)
        throw new Error(
          preparation.blockingErrors.map((item) => item.message).join(" "),
        );
      if (
        preparation.plan?.groups?.length ||
        preparation.unacknowledgedWarnings?.length
      ) {
        setReview({
          request,
          groups: preparation.plan?.groups || [],
          warnings: preparation.unacknowledgedWarnings || [],
        });
        return;
      }
      if (preparation.ready !== true)
        throw new Error("The printer settings could not be validated.");
      await onSaved(await readJson("/api/presets/custom", jsonBody(request)));
      onClose();
    } catch (cause) {
      setError(cause.message);
    } finally {
      setSaving(false);
    }
  }
  function acceptReview() {
    const { request, groups, warnings } = review;
    setReview(null);
    save({
      ...request,
      correctionBatches: [
        ...(request.correctionBatches || []),
        groups.map((group) => ({
          id: group.id,
          signature: group.signature,
          choice: "apply",
        })),
      ],
      acknowledgedWarnings: [
        ...(request.acknowledgedWarnings || []),
        ...warnings.map(
          (item) =>
            item.signature || `${item.scope}:${item.key}:${item.message}`,
        ),
      ],
    });
  }
  const disabled = loading || saving;
  return (
    <Modal
      className="add-printer-dialog"
      aria-label="Add printer"
      onClose={() => {
        if (!saving) onClose();
      }}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          save();
        }}
      >
        <header>
          <h2>Add printer</h2>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            aria-label="Close printer setup"
          >
            ×
          </button>
        </header>
        <p>
          Choose an installed printer profile, or use one as the starting point
          for a custom printer.
        </p>
        <label>
          Printer profile
          <select
            aria-label="Printer profile"
            value={baseId}
            onChange={(event) => setBaseId(event.target.value)}
            disabled={saving}
          >
            {printers.map((printer) => (
              <option key={printer.id} value={printer.id}>
                {printer.name}
              </option>
            ))}
          </select>
        </label>
        <label className="printer-custom-choice">
          <input
            type="checkbox"
            checked={custom}
            onChange={(event) => {
              setCustom(event.target.checked);
              setReview(null);
            }}
            disabled={saving}
          />
          Create a custom printer
        </label>
        {custom && (
          <>
            <label>
              Printer name
              <input
                autoComplete="off"
                required
                maxLength={160}
                value={name}
                onChange={(event) => {
                  setName(event.target.value);
                  setReview(null);
                }}
                disabled={disabled}
              />
            </label>
            <fieldset disabled={disabled}>
              <legend>Build volume (mm)</legend>
              {[
                ["width", "Width"],
                ["depth", "Depth"],
                ["height", "Height"],
              ].map(([key, label]) => (
                <label key={key}>
                  {label}
                  <input
                    aria-label={`Printer ${label.toLowerCase()}`}
                    type="number"
                    min="1"
                    max="10000"
                    step="any"
                    required
                    value={size[key] ?? ""}
                    onChange={(event) => changeSize(key, event.target.value)}
                  />
                </label>
              ))}
            </fieldset>
            <label>
              Nozzle diameter (mm)
              <input
                aria-label="Printer nozzle diameter"
                type="number"
                min="0.05"
                max="5"
                step="0.05"
                required
                value={size.nozzle ?? ""}
                onChange={(event) => changeSize("nozzle", event.target.value)}
                disabled={disabled}
              />
            </label>
            <small>
              The rectangular bed uses the profile’s origin. Other machine
              settings are inherited from the selected profile and can be edited
              afterward.
            </small>
          </>
        )}
        {loading && <p role="status">Loading printer settings…</p>}
        {error && <p role="alert">{error}</p>}
        {review && (
          <section className="printer-review">
            <h3>Review printer settings</h3>
            {review.groups.map((group) => (
              <p key={group.id}>
                {group.message ||
                  group.title ||
                  "The matching print settings need an adjustment."}
              </p>
            ))}
            {review.warnings.map((warning, index) => (
              <p key={index}>{warning.message}</p>
            ))}
            <button type="button" onClick={acceptReview} disabled={saving}>
              Apply recommended settings and create
            </button>
          </section>
        )}
        <footer>
          <button type="button" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button
            className="primary"
            type="submit"
            disabled={disabled || !baseId || Boolean(review)}
          >
            {saving ? "Saving…" : custom ? "Create printer" : "Add printer"}
          </button>
        </footer>
      </form>
    </Modal>
  );
}
