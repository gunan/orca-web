#!/usr/bin/env node
import { existsSync, readFileSync, statSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const STATUSES = ['missing', 'partial', 'implemented', 'verified', 'blocked'];
export const EVIDENCE_KINDS = ['code-inspection', 'unit-test', 'integration-test', 'browser-test', 'mock-test', 'native-test', 'manual-observation'];
export const TEST_KINDS = ['unit', 'integration', 'browser', 'mock', 'native', 'manual'];
const scriptPath = fileURLToPath(import.meta.url);
const defaultRoot = path.resolve(path.dirname(scriptPath), '..');
const nonempty = value => typeof value === 'string' && value.trim().length > 0;
const textList = value => Array.isArray(value) && value.length > 0 && value.every(nonempty);
const countBy = (items, field, choices) => Object.fromEntries(choices.map(choice => [choice, items.filter(item => item[field] === choice).length]));

export function readInventory(filePath = path.join(defaultRoot, 'docs/parity/features.json')) {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

export function validateInventory(inventory, { rootDir = defaultRoot } = {}) {
  const errors = [];
  if (!inventory || typeof inventory !== 'object' || Array.isArray(inventory)) return ['Inventory must be an object.'];
  if (inventory.schemaVersion !== 1) errors.push('schemaVersion must be 1.');
  if (!nonempty(inventory.nativeBaseline?.version)) errors.push('nativeBaseline.version is required.');
  if (!nonempty(inventory.scopeNote)) errors.push('scopeNote is required.');
  if (!Array.isArray(inventory.features) || inventory.features.length === 0) return [...errors, 'features must be a nonempty array.'];
  const ids = new Set();
  for (const [index, feature] of inventory.features.entries()) {
    if (!feature || typeof feature !== 'object' || Array.isArray(feature)) { errors.push(`Feature ${index} must be an object.`); continue; }
    const label = feature.id || `Feature ${index}`;
    if (!nonempty(feature.id) || !/^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)+$/.test(feature.id)) errors.push(`${label}: invalid stable ID.`);
    if (ids.has(feature.id)) errors.push(`${label}: duplicate ID.`);
    ids.add(feature.id);
    for (const key of ['name', 'category']) if (!nonempty(feature[key])) errors.push(`${label}: ${key} is required.`);
    if (!['P0', 'P1', 'P2'].includes(feature.priority)) errors.push(`${label}: invalid priority.`);
    if (!STATUSES.includes(feature.status)) errors.push(`${label}: invalid status.`);
    if (!textList(feature.acceptanceCriteria)) errors.push(`${label}: nonempty acceptanceCriteria are required.`);
    if (!Array.isArray(feature.plannedTests) || feature.plannedTests.length === 0 || feature.plannedTests.some(test => !test || !TEST_KINDS.includes(test.kind) || !nonempty(test.description))) errors.push(`${label}: nonempty plannedTests with valid kind and description are required.`);
    const evidence = Array.isArray(feature.evidenceBasis) ? feature.evidenceBasis : [];
    if (!evidence.length) errors.push(`${label}: evidenceBasis is required, including for unimplemented inventory items.`);
    for (const record of evidence) {
      if (!record || !EVIDENCE_KINDS.includes(record.kind) || !['observed', 'passed', 'failed'].includes(record.result) || !nonempty(record.source) || !nonempty(record.summary) || !nonempty(record.date) || !nonempty(record.revision)) errors.push(`${label}: invalid evidence record.`);
      if (record?.kind === 'code-inspection' && record.result !== 'observed') errors.push(`${label}: code inspection cannot be a passed test.`);
    }
    const refs = Array.isArray(feature.testRefs) ? feature.testRefs : [];
    if (!Array.isArray(feature.testRefs)) errors.push(`${label}: testRefs must be an array (empty when only planned).`);
    for (const ref of refs) {
      if (!ref || !TEST_KINDS.includes(ref.kind) || !nonempty(ref.path) || !nonempty(ref.description)) { errors.push(`${label}: invalid test reference.`); continue; }
      const resolved = path.resolve(rootDir, ref.path);
      const relative = path.relative(path.resolve(rootDir), resolved);
      if (path.isAbsolute(ref.path) || relative.startsWith(`..${path.sep}`) || relative === '..') errors.push(`${label}: test reference must remain inside the repository: ${ref.path}`);
      else if (!existsSync(resolved) || !statSync(resolved).isFile()) errors.push(`${label}: test reference does not exist: ${ref.path}`);
    }
    if (feature.status === 'verified') {
      const latestAcceptance = evidence.filter(record => ['native-test', 'manual-observation'].includes(record?.kind) && ['passed', 'failed'].includes(record?.result)).at(-1);
      const matched = latestAcceptance?.result === 'passed' && (
        (latestAcceptance.kind === 'native-test' && refs.some(ref => ref?.kind === 'native')) ||
        (latestAcceptance.kind === 'manual-observation' && refs.some(ref => ref?.kind === 'manual'))
      );
      if (!matched) errors.push(`${label}: verified requires the latest native or manual acceptance attempt to pass and a matching existing test reference; historical passes, mock, unit, and browser tests alone do not certify parity.`);
    }
    if (feature.history !== undefined && (!Array.isArray(feature.history) || feature.history.some(event => !event || !STATUSES.includes(event.status) || !nonempty(event.date) || !nonempty(event.revision) || !nonempty(event.reason)))) errors.push(`${label}: invalid status history.`);
  }
  return errors;
}

export function summarizeInventory(inventory) {
  const features = inventory.features;
  const categories = [...new Set(features.map(feature => feature.category))];
  return {
    total: features.length,
    statusCounts: countBy(features, 'status', STATUSES),
    priorityCounts: countBy(features, 'priority', ['P0', 'P1', 'P2']),
    categoryCounts: categories.map(category => ({ category, total: features.filter(feature => feature.category === category).length, ...countBy(features.filter(feature => feature.category === category), 'status', STATUSES) })),
    evidenceCounts: Object.fromEntries(EVIDENCE_KINDS.map(kind => [kind, features.filter(feature => feature.evidenceBasis.some(record => record.kind === kind)).length])),
    passedEvidenceCounts: Object.fromEntries(EVIDENCE_KINDS.filter(kind => kind !== 'code-inspection').map(kind => [kind, features.filter(feature => feature.evidenceBasis.some(record => record.kind === kind && record.result === 'passed')).length])),
    testReferenceCounts: Object.fromEntries(TEST_KINDS.map(kind => [kind, new Set(features.flatMap(feature => feature.testRefs.filter(ref => ref.kind === kind).map(ref => ref.path))).size])),
    plannedOnly: features.filter(feature => feature.testRefs.length === 0).length,
  };
}

const csvCell = value => `"${String(value ?? '').replaceAll('"', '""')}"`;
const mdCell = value => String(value ?? '').replaceAll('|', '\\|').replaceAll('\n', '<br>');

export function renderCsv(inventory) {
  const columns = ['id', 'category', 'name', 'priority', 'status', 'evidence_basis', 'acceptance_criteria', 'planned_tests', 'test_refs'];
  const rows = inventory.features.map(feature => [feature.id, feature.category, feature.name, feature.priority, feature.status,
    feature.evidenceBasis.map(record => `${record.kind}/${record.result} @ ${record.revision} (${record.date}): ${record.summary} [${record.source}]`).join('\n'),
    feature.acceptanceCriteria.join('\n'), feature.plannedTests.map(test => `${test.kind}: ${test.description}`).join('\n'),
    feature.testRefs.map(ref => `${ref.kind}: ${ref.path} — ${ref.description}`).join('\n')]);
  return [columns, ...rows].map(row => row.map(csvCell).join(',')).join('\n') + '\n';
}

export function renderMarkdown(inventory) {
  const summary = summarizeInventory(inventory);
  const lines = ['# Orca Web parity progress', '', `Native baseline: **OrcaSlicer ${inventory.nativeBaseline.version}**. Inventory baseline revision: \`${inventory.nativeBaseline.repositoryRevision}\`.`, '', inventory.scopeNote, '',
    'Generated from `features.json` by `node scripts/parity-report.js --write`. Regeneration does not run tests or change feature status. Counts describe this inventory, not a percentage of all native functionality.', '',
    '## Implementation status', '', '| Status | Features |', '|---|---:|', ...STATUSES.map(status => `| ${status} | ${summary.statusCounts[status]} |`), `| **Total** | **${summary.total}** |`, '',
    'Partial items may have passing tests for a limited path. Implemented means the feature is claimed complete but has not passed recorded native acceptance. Verified requires recorded native/manual acceptance evidence and a matching existing test reference; validation checks provenance structure, not the truth of the claim.', '',
    '## Recorded evidence', '', '| Evidence type | Features with records | Features with passed evidence |', '|---|---:|---:|',
    ...EVIDENCE_KINDS.map(kind => `| ${kind} | ${summary.evidenceCounts[kind]} | ${kind === 'code-inspection' ? 'n/a' : summary.passedEvidenceCounts[kind]} |`), '',
    'These counts can overlap, include historical records, and are not a fresh test run. Mock, unit, integration, browser, native, and manual evidence are reported separately. Failed native probes do not count as passed evidence.', '',
    '| Test/reference type | Distinct referenced files |', '|---|---:|', ...TEST_KINDS.map(kind => `| ${kind} | ${summary.testReferenceCounts[kind]} |`), '', `${summary.plannedOnly} feature(s) have planned tests only, with no existing test reference. Test plans do not count as executed or passing tests.`, '',
    '## Coverage by category', '', '| Category | Total | Missing | Partial | Implemented | Verified | Blocked |', '|---|---:|---:|---:|---:|---:|---:|',
    ...summary.categoryCounts.map(row => `| ${mdCell(row.category)} | ${row.total} | ${STATUSES.map(status => row[status]).join(' | ')} |`), '', '## Feature inventory', '', '| ID | Feature | Priority | Status | Acceptance criteria | Planned tests | Existing references |', '|---|---|---|---|---|---|---|',
    ...inventory.features.map(feature => `| ${[feature.id, feature.name, feature.priority, feature.status, feature.acceptanceCriteria.join('\n'), feature.plannedTests.map(test => `${test.kind}: ${test.description}`).join('\n'), feature.testRefs.length ? feature.testRefs.map(ref => `${ref.kind}: ${ref.path}`).join('\n') : 'Planned only'].map(mdCell).join(' | ')} |`), '',
    '## Recorded milestones', '', ...(inventory.milestones || []).map(milestone => `- ${milestone.date} — ${milestone.summary} (revision \`${milestone.revision}\`).`), '',
    'See `README.md` for status rules and `PARITY_AUDIT.md` for the original observations and limitations.', ''];
  return lines.join('\n');
}

export function writeReports(inventory, { rootDir = defaultRoot } = {}) {
  const errors = validateInventory(inventory, { rootDir });
  if (errors.length) throw new Error(errors.join('\n'));
  const directory = path.join(rootDir, 'docs/parity');
  mkdirSync(directory, { recursive: true });
  const outputs = { csv: path.join(directory, 'features.csv'), markdown: path.join(directory, 'PROGRESS.md') };
  writeFileSync(outputs.csv, renderCsv(inventory));
  writeFileSync(outputs.markdown, renderMarkdown(inventory));
  return outputs;
}

function main(args) {
  let mode, rootDir = defaultRoot, inventoryPath;
  for (let index = 0; index < args.length; index++) {
    const argument = args[index];
    if (['--check', '--write'].includes(argument)) {
      if (mode) throw new Error('Choose exactly one of --check and --write.');
      mode = argument;
    } else if (['--root', '--inventory'].includes(argument)) {
      if (!args[index + 1] || args[index + 1].startsWith('--')) throw new Error(`${argument} requires a path.`);
      const value = path.resolve(args[++index]);
      if (argument === '--root') rootDir = value; else inventoryPath = value;
    } else throw new Error(`Unknown argument: ${argument}`);
  }
  if (!mode) throw new Error('Usage: node scripts/parity-report.js (--check | --write) [--root PATH] [--inventory PATH]');
  const inventory = readInventory(inventoryPath || path.join(rootDir, 'docs/parity/features.json'));
  const errors = validateInventory(inventory, { rootDir });
  if (errors.length) throw new Error(errors.join('\n'));
  if (mode === '--write') {
    const outputs = writeReports(inventory, { rootDir });
    process.stdout.write(`Wrote ${outputs.csv}\nWrote ${outputs.markdown}\n`);
  }
  process.stdout.write(`${JSON.stringify(summarizeInventory(inventory), null, 2)}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  try { main(process.argv.slice(2)); }
  catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1; }
}
