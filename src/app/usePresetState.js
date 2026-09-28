import { useState, useMemo } from "react";
import { hasExpandedNativeVariants } from "../../shared/native-variants.js";
import { embeddedProjectSelection } from "../../shared/native-project-client.js";
export default function usePresetState({ projectState, emptyCatalog }) {
  const { project } = projectState;
  const [catalog, setCatalog] = useState(emptyCatalog),
    [catalogResolved, setResolved] = useState(null);
  const resolved = useMemo(
    () =>
      project.useEmbeddedSettings
        ? hasExpandedNativeVariants(project.nativeSettings || {})
          ? catalogResolved
          : embeddedProjectSelection(project)
        : catalogResolved,
    [project.useEmbeddedSettings, project.nativeSettings, catalogResolved],
  );
  const [catalogRevision, setCatalogRevision] = useState(0);
  const [catalogPending, setCatalogPending] = useState(true),
    [selectionPending, setSelectionPending] = useState(false);
  return {
    catalog,
    setCatalog,
    setResolved,
    resolved,
    catalogRevision,
    setCatalogRevision,
    catalogPending,
    setCatalogPending,
    selectionPending,
    setSelectionPending,
  };
}
