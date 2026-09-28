import RecentFilesMenu from "../RecentFilesMenu.jsx";
import React from "react";
export default function AppMenuBar({
  actions,
  toolState,
  files,
  appearance,
  projectState,
  status,
}) {
  const { menus, openRecentFile, undoEdit, redoEdit } = actions;
  const { menu, setMenu } = toolState;
  const { recentFiles } = files;
  const { setPreferencesOpen } = appearance;
  const { project, canUndo, canRedo } = projectState;
  const { dirty } = status;
  return (
    <div className="menubar">
      {Object.entries(menus).map(([name, items]) => (
        <div className="menu-container" key={name}>
          <button
            aria-expanded={menu === name}
            aria-haspopup="menu"
            onClick={() => setMenu(menu === name ? null : name)}
          >
            {name}
          </button>
          {menu === name && (
            <div className="command-menu" role="menu">
              {items.map(([label, action, disabled]) =>
                label === "Recent files" ? (
                  <RecentFilesMenu
                    key={label}
                    recent={recentFiles}
                    onOpen={openRecentFile}
                    onClose={() => setMenu(null)}
                  />
                ) : (
                  <button
                    role="menuitem"
                    key={label}
                    disabled={disabled}
                    onClick={() => {
                      setMenu(null);
                      action();
                    }}
                  >
                    {label}
                  </button>
                ),
              )}
            </div>
          )}
        </div>
      ))}
      <button
        onClick={() => {
          setMenu(null);
          setPreferencesOpen(true);
        }}
      >
        Preferences
      </button>
      <i />
      <b>
        {project.name}
        {dirty ? " *" : ""}
      </b>
      <small>
        {project.objects.length} objects · {project.plates.length} plates
      </small>
      <div className="grow" />
      <button aria-label="Undo" disabled={!canUndo} onClick={undoEdit}>
        ↶
      </button>
      <button aria-label="Redo" disabled={!canRedo} onClick={redoEdit}>
        ↷
      </button>
    </div>
  );
}
