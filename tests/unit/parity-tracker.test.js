import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { readInventory, validateInventory, summarizeInventory, renderCsv, renderMarkdown, writeReports } from '../../scripts/parity-report.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const script = path.join(root, 'scripts/parity-report.js');
function fixture(t) {
  const rootDir = mkdtempSync(path.join(tmpdir(), 'orca-parity-'));
  t.after(() => rmSync(rootDir, { recursive: true, force: true }));
  mkdirSync(path.join(rootDir, 'tests/native'), { recursive: true });
  writeFileSync(path.join(rootDir, 'tests/native/reference.test.js'), '// Fixture reference only; never counted as a passing test.\n');
  const inventory = {
    schemaVersion: 1,
    nativeBaseline: { version: '2.4.2', repositoryRevision: 'baseline' },
    scopeNote: 'A sample inventory, not exhaustive native coverage.',
    milestones: [],
    features: [{
      id: 'geometry.move', name: 'Move "A", then B | C', category: 'Geometry', priority: 'P0', status: 'missing',
      evidenceBasis: [{ kind: 'code-inspection', result: 'observed', source: 'src/main.jsx', summary: 'No implementation.', date: '2026-09-26', revision: 'baseline' }],
      acceptanceCriteria: ['Coordinates reach the native engine.'],
      plannedTests: [{ kind: 'native', description: 'Compare translated cube bounds with a native reference.' }],
      testRefs: [], history: [{ date: '2026-09-26', revision: 'baseline', status: 'missing', reason: 'Initial inventory.' }],
    }],
  };
  return { rootDir, inventory, feature: inventory.features[0] };
}

test('checked-in inventory validates and every feature has an actionable acceptance and test plan', () => {
  const inventory = readInventory(path.join(root, 'docs/parity/features.json'));
  assert.deepEqual(validateInventory(inventory, { rootDir: root }), []);
  assert.ok(inventory.features.length >= 80, 'Track major features instead of a tiny hand-picked checklist.');
  assert.equal(inventory.nativeBaseline.version, '2.4.2');
  assert.equal(new Set(inventory.features.map(feature => feature.id)).size, inventory.features.length);
});

test('rejects duplicate IDs, unknown statuses and missing acceptance or planned tests', t => {
  const { inventory, rootDir, feature } = fixture(t);
  inventory.features.push(structuredClone(feature));
  feature.status = 'looks-good';
  feature.acceptanceCriteria = [];
  feature.plannedTests = [];
  const errors = validateInventory(inventory, { rootDir });
  assert.ok(errors.some(error => error.includes('duplicate ID')));
  assert.ok(errors.some(error => error.includes('invalid status')));
  assert.ok(errors.some(error => error.includes('acceptanceCriteria')));
  assert.ok(errors.some(error => error.includes('plannedTests')));
});

test('verified rejects code-only and mock/unit-only evidence, even with an existing file', t => {
  const { inventory, rootDir, feature } = fixture(t);
  feature.status = 'verified';
  assert.ok(validateInventory(inventory, { rootDir }).some(error => error.includes('verified requires')));
  feature.evidenceBasis.push({ kind: 'mock-test', result: 'passed', source: 'tests/native/reference.test.js', summary: 'Mock run only.', date: '2026-09-26', revision: 'test' });
  feature.testRefs.push({ kind: 'mock', path: 'tests/native/reference.test.js', description: 'Existing mock reference.' });
  assert.ok(validateInventory(inventory, { rootDir }).some(error => error.includes('verified requires')));
  feature.evidenceBasis[1].kind = 'unit-test';
  feature.testRefs[0].kind = 'unit';
  assert.ok(validateInventory(inventory, { rootDir }).some(error => error.includes('verified requires')));
});

test('verified requires passed acceptance evidence and an existing matching native/manual reference', t => {
  const { inventory, rootDir, feature } = fixture(t);
  feature.status = 'verified';
  const record = { kind: 'native-test', result: 'failed', source: 'tests/native/reference.test.js', summary: 'Reference comparison.', date: '2026-09-26', revision: 'test' };
  feature.evidenceBasis.push(record);
  feature.testRefs.push({ kind: 'native', path: 'tests/native/missing.test.js', description: 'Native comparison reference.' });
  let errors = validateInventory(inventory, { rootDir });
  assert.ok(errors.some(error => error.includes('does not exist')));
  assert.ok(errors.some(error => error.includes('verified requires')));
  record.result = 'passed';
  assert.ok(validateInventory(inventory, { rootDir }).some(error => error.includes('does not exist')));
  feature.testRefs[0].path = 'tests/native/reference.test.js';
  assert.deepEqual(validateInventory(inventory, { rootDir }), []);
  record.kind = 'manual-observation';
  feature.testRefs[0].kind = 'manual';
  assert.deepEqual(validateInventory(inventory, { rootDir }), []);
});

test('rejects references outside the repository and code inspection labeled as a passing test', t => {
  const { inventory, rootDir, feature } = fixture(t);
  feature.testRefs.push({ kind: 'native', path: '../elsewhere.js', description: 'Invalid reference.' });
  feature.evidenceBasis[0].result = 'passed';
  const errors = validateInventory(inventory, { rootDir });
  assert.ok(errors.some(error => error.includes('inside the repository')));
  assert.ok(errors.some(error => error.includes('code inspection cannot')));
});

test('a later native acceptance failure prevents verification based on a historical pass', t => {
  const { inventory, rootDir, feature } = fixture(t);
  feature.status = 'verified';
  feature.testRefs.push({ kind: 'native', path: 'tests/native/reference.test.js', description: 'Native comparison.' });
  const record = { kind: 'native-test', result: 'passed', source: 'tests/native/reference.test.js', summary: 'Reference comparison passes.', date: '2026-09-26', revision: 'first' };
  feature.evidenceBasis.push(record);
  assert.deepEqual(validateInventory(inventory, { rootDir }), []);
  feature.evidenceBasis.push({ ...record, result: 'failed', revision: 'second', summary: 'Regression: reference comparison fails.' });
  assert.ok(validateInventory(inventory, { rootDir }).some(error => error.includes('latest native or manual acceptance attempt')));
});

test('reports recorded and passing evidence separately without turning test plans into executed tests', t => {
  const { inventory, feature } = fixture(t);
  feature.status = 'partial';
  feature.evidenceBasis.push(
    { kind: 'mock-test', result: 'passed', source: 'fixture.sh', summary: 'Mock succeeds.', date: '2026-09-26', revision: 'test' },
    { kind: 'native-test', result: 'failed', source: 'probe.md', summary: 'Native fails.', date: '2026-09-26', revision: 'test' },
  );
  const summary = summarizeInventory(inventory);
  assert.equal(summary.statusCounts.partial, 1);
  assert.equal(summary.statusCounts.verified, 0);
  assert.equal(summary.evidenceCounts['native-test'], 1);
  assert.equal(summary.passedEvidenceCounts['native-test'], 0);
  assert.equal(summary.passedEvidenceCounts['mock-test'], 1);
  assert.equal(summary.testReferenceCounts.native, 0);
  assert.equal(summary.plannedOnly, 1);
  assert.match(renderMarkdown(inventory), /Test plans do not count as executed or passing tests/);
});

test('exports deterministic CSV and Markdown with escaped cells and does not mutate inventory', t => {
  const { inventory, rootDir } = fixture(t);
  const before = structuredClone(inventory);
  const csv = renderCsv(inventory);
  assert.match(csv, /"Move ""A"", then B \| C"/);
  assert.match(renderMarkdown(inventory), /B \\\| C/);
  const outputs = writeReports(inventory, { rootDir });
  assert.equal(readFileSync(outputs.csv, 'utf8'), csv);
  assert.equal(readFileSync(outputs.markdown, 'utf8'), renderMarkdown(inventory));
  assert.deepEqual(inventory, before);
});

test('CLI --check is read-only and fails invalid inventory without generating reports', t => {
  const { inventory, rootDir, feature } = fixture(t);
  const inventoryFile = path.join(rootDir, 'inventory.json');
  writeFileSync(inventoryFile, JSON.stringify(inventory));
  const before = readdirSync(rootDir);
  const args = [script, '--check', '--root', rootDir, '--inventory', inventoryFile];
  const valid = spawnSync(process.execPath, args, { encoding: 'utf8' });
  assert.equal(valid.status, 0, valid.stderr);
  assert.deepEqual(readdirSync(rootDir), before);
  assert.equal(JSON.parse(valid.stdout).total, 1);
  feature.status = 'verified';
  writeFileSync(inventoryFile, JSON.stringify(inventory));
  const invalid = spawnSync(process.execPath, args, { encoding: 'utf8' });
  assert.equal(invalid.status, 1);
  assert.match(invalid.stderr, /verified requires/);
  assert.deepEqual(readdirSync(rootDir), before);
});
