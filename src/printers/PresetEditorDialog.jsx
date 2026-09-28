import ProfileEditor from "../ProfileEditor.jsx";
import { filamentSlotCount } from "../../shared/filament-slots.js";
import { projectSettingDefinitions } from "../../shared/profile-settings.js";
import React from "react";
export default function PresetEditorDialog({
  toolState,
  projectState,
  presets,
  actions,
}) {
  const { profileEditor, setProfileEditor } = toolState;
  const { project, ids, overrides } = projectState;
  const { resolved, catalog } = presets;
  const { savedPreset } = actions;
  return (
    profileEditor && (
      <ProfileEditor
        projectSettings={project.projectOverrides || {}}
        filamentIndex={profileEditor.filamentIndex || 0}
        selection={{
          ...ids,
          filamentIds: project.filamentIds,
        }}
        printerConfig={resolved?.printerSettings}
        processConfig={{
          ...resolved?.settings,
          ...overrides,
        }}
        filamentConfig={resolved?.filamentSettings}
        nativeContext={{
          ...resolved?.context,
          filamentCount: filamentSlotCount(project),
          projectSettings: Object.fromEntries(
            projectSettingDefinitions
              .filter((item) =>
                Object.hasOwn(
                  project.nativeSettings || project.projectOverrides || {},
                  item.key,
                ),
              )
              .map((item) => [
                item.key,
                (project.nativeSettings || project.projectOverrides)[item.key],
              ]),
          ),
        }}
        open
        scope={profileEditor.scope}
        selectedId={profileEditor.id}
        printerId={ids.printerId}
        printers={catalog.printers}
        initialOverrides={profileEditor.scope === "process" ? overrides : {}}
        onClose={() => setProfileEditor(null)}
        onSaved={savedPreset}
      />
    )
  );
}
