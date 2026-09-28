import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { extractProfileSchema, extractProjectSchema } from './lib/native-profile-schema.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(await readFile(path.join(root, 'scripts/native-profile-schema-sources.json'), 'utf8'));
const argumentsList = process.argv.slice(2);
const directoryIndex = argumentsList.indexOf('--source-dir');
const directory = path.resolve(directoryIndex >= 0 ? argumentsList[directoryIndex + 1] : path.join(root, '.cache/native-schema', manifest.commit));
const download = argumentsList.includes('--download');
const check = argumentsList.includes('--check');
await mkdir(directory, { recursive: true });
const sources = {};
for (const file of manifest.files) {
  const url = `https://raw.githubusercontent.com/OrcaSlicer/OrcaSlicer/${manifest.commit}/${file.path}`;
  const filename = path.join(directory, file.name);
  if (download) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Download failed (${response.status}): ${url}`);
    const source = await response.text();
    const hash = crypto.createHash('sha256').update(source).digest('hex');
    if (hash !== file.sha256) throw new Error(`Pinned source hash mismatch for ${file.name}`);
    await writeFile(filename, source);
  }
  const source = await readFile(filename, 'utf8');
  if (crypto.createHash('sha256').update(source).digest('hex') !== file.sha256) throw new Error(`Pinned source hash mismatch for ${file.name}`);
  sources[file.name] = source;
}
const schema = extractProfileSchema(sources, manifest);
const output = JSON.stringify(schema, null, 2) + '\n';
const filename = path.join(root, 'shared/native-profile-schema.json');
if (check) {
  if (await readFile(filename, 'utf8') !== output) throw new Error('Generated native profile schema is stale');
} else await writeFile(filename, output);
console.log(JSON.stringify({machine:schema.machine.coverage,filament:schema.filament.coverage}, null, 2));

const projectSchema = extractProjectSchema(sources, manifest);
const projectOutput = JSON.stringify(projectSchema, null, 2) + '\n';
const projectFilename = path.join(root, 'shared/native-project-schema.json');
if (check) { if (await readFile(projectFilename, 'utf8') !== projectOutput) throw new Error('Generated native project schema is stale'); }
else await writeFile(projectFilename, projectOutput);
console.log(JSON.stringify(projectSchema.coverage, null, 2));
