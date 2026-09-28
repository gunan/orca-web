# Orca Web parity work

The user's target is UI and feature parity with native OrcaSlicer. The current comparison baseline is 2.4.2; this repository is still incomplete.

- Read `docs/parity/PROGRESS.md` and `docs/parity/features.json` before choosing parity work.
- Keep stable feature IDs. Every feature needs acceptance criteria and a test plan, including missing features. Add newly discovered native functionality to the inventory.
- When implementing or changing a feature, update its status, test references, evidence, and history in `features.json`. Record the command, result, baseline version, and material limitations. Preserve historical evidence.
- Add meaningful regression tests for implemented behavior. Do not create passing placeholder tests or treat skipped tests/plans as coverage. Keep fake-engine, browser, and real-native results distinct.
- `verified` requires completed acceptance evidence for the pinned native baseline; a fake CLI or visual resemblance alone is insufficient. Use `partial` when only part of a feature is implemented.
- Run relevant tests, `npm run parity:export`, and `npm run parity:check`. For runtime/UI changes run `npm test`, `npm run build`, and `npm run test:e2e`. Native slicing changes additionally require `npm run test:native`; browser-to-native changes require `npm run test:e2e:native` when the native installation is available. Report unavailable native checks rather than substituting a fake.
- `docs/parity/native-settings.json` lists observed bundled preset keys, not the entire native UI schema. Update it when the native baseline or exposed setting definitions change, using `npm run parity:settings -- --profiles-dir PATH --native-version VERSION --write`.
- Keep unsupported controls explicitly unavailable. Do not add decorative controls that appear functional or claim rendered geometry/toolpath data that does not exist.
- Native device-control and physical printing tests require a suitable printer and explicit authorization before starting a print.
