# Single-volume native material assignment

Pinned `bbs_3mf.cpp:2228–2250` normalizes object/volume material IDs and erases the material override on a sole volume. The parent object's material becomes effective. Previously the browser could set `filamentSlot=2` while retaining imported `native.objectSettings.extruder=1`; the layer editor predicted slot 2, but the native importer sliced slot 1.

Native import now exposes the effective source material in `filamentSlot`, while preserving the original native metadata for inspection. Export synchronizes a sole volume's parent material to the current explicit part selection. Multi-volume objects retain independent part choices and their distinct parent setting.

Four units cover stale source import, inspector edits, part-editor edits, and multi-volume independence. The installed native regression verifies tool 0/100 layers for slot 1 at 100% and tool 1/102 layers ending at Z 20.4 for slot 2 at 98% Z. The browser-native regression exercises the actual object material selector, layer texture, native project download, and native slice. Its final run requires the integrated backend patch; no frontend code changes are necessary.

Revision: `8500fcdccaa10b5099ac20d252af3a7c560046f1`. No printer was contacted.
