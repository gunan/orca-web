Current update: [Milestone44](MILESTONE_44.md) adds partial recent-copy history. OS path/reveal and broader native behavior remain incomplete.

Current update: [Milestone43](MILESTONE_43.md) implements partial Home/startup behavior. The original discovery audit below records the preceding state; recent history remains missing.

# Native Home and recent-file inventory

Source inspection found two feature groups missing from the major-feature inventory. Both are recorded as missing with explicit acceptance plans; no passing test is claimed for them.

**Home and startup:** native default_page=0 opens Home, option1 opens Prepare. Home offers New project and Open project, preserves the current editor while navigating and has conditional Orca/Bambu account panels. The existing web brand link reloads the app; a native Home workspace/startup preference is not yet implemented. Cloud accounts remain dependent on actual provider integration and are not represented by simulated logins.

**Recent projects/files:** native default maximum18, effective limit0..999 with immediate pruning; STL/STEP history is opt-in. Home shows thumbnail, project name and timestamp; supports reopening, per-item Clear, Clear all and Open in explorer. Native file-menu history and OS integration must also be audited. The existing web app has no recent-file history. Browser file inputs do not grant arbitrary filesystem reopen/reveal capability; storing imported copies would need an explicit description and would leave filesystem parity incomplete.

[Audit provenance](HOME_SOURCE_AUDIT.json) separates pinned C++ source hashes from installed2.4.2 HTML/JS/CSS resource hashes. These installed resources have not been certified byte-identical to repository blobs. This is code/resource inspection, not a paired GUI acceptance result. Native source/page labels are references for implementation, not permission to execute embedded bridge commands or initiate cloud login.

Planned browser checks cover navigation without losing edits, initial/reloaded startup choices, New/Open discard/cancel handling, recent ordering/deduplication/limits, storage failure and corrupt metadata, missing/replaced source files, thumbnails, keyboard/context actions and theme/compact layout. Native acceptance must compare actual desktop behavior for matched files, modified timestamps, path identity, OS reveal, preferences and account states.
