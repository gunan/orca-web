# Milestone 30 — collision-safe native tower identities

Native tower requests now keep unrelated object IDs and instance-family tokens in separate namespaces. Bounded, deterministic worker names preserve long, escaped and multibyte project identities without dropping geometry or material assignments. [Implementation and focused evidence](NATIVE_TOWER_IDENTITIES.md).

Baseline: installed OrcaSlicer 2.4.2, source `8500fcdccaa10b5099ac20d252af3a7c560046f1`. Native worker code, paired binaries and original golden geometry are unchanged.

| Command | Result |
|---|---|
| `npm test` | 986 passed; zero failures, cancellations or skips |
| `npm run build` | Passed |
| `npm run test:e2e -- --workers=2` | 290 passed; zero failures or skips |
| `npm run test:native` | 305 passed, 1 failed; zero cancellations or skips |
| `npm run test:e2e:native` | 73 passed, 1 failed; zero skips |
| Final focused identity unit/native run | 16 passed |
| Focused identity browser/native run | 2 passed |
| Eight final fixtures against previous adapter | 8 failed, 0 passed; expected regression proof |
| `npm run parity:export` / `npm run parity:check` | Passed |

Full [unit/API](UNIT_VALIDATION_M30.log), [browser](BROWSER_VALIDATION_M30.log), [native](NATIVE_VALIDATION_M30.log) and [browser/native](BROWSER_NATIVE_VALIDATION_M30.log) logs are retained.

The strict linked-edit native test fails between two byte-identical **reference** inputs: 11,057 versus 11,189 motion commands; both web runs produce 11,057. The reference runs differ at 2,204 motion lines. [Hashes/counts](M30_INSTANCE_REPEATABILITY.json) and [all four exact outputs](M30_INSTANCE_REPEATABILITY.zip) preserve the fixed reference/reference/web/web experiment. This demonstrates native nondeterminism independent of web archive generation. No tolerance change, retry selection or parity promotion was applied.

The native browser flow-calibration test times out after saving its result because React crashes: `Cannot read properties of null (reading 'id')` in the Preview hotend-loading effect. Saving clears the current job while the previous parsed native data remains in the effect's render. The [exact trace](M30_PREVIEW_JOB_CRASH.zip) records the page error. This is a real application defect, not merely a test deadline. Its isolated fix is subsequent work. The existing Preview idle test passes in this run; M28/M29 failures remain historical evidence and their damping issue is also subsequent work.

The inventory remains 130 major units: 1 missing,119 partial,8 implemented and2 verified. Arbitrary/native motion repeatability, post-slice towers, drag/gizmos, fractional/custom bed details, fresh desktop visual acceptance and physical hardware remain incomplete. No printer was contacted.
