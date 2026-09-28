/** Reproduce native-preview-palette.json from the pinned authoritative sources.
 * Usage: node scripts/extract-preview-palette.mjs /path/ViewerImpl.cpp /path/ExtrusionEntity.cpp
 * This script reads local files only; it does not download or execute native code.
 */
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const paths = process.argv.slice(2);
if (paths.length !== 2) throw new Error('Expected ViewerImpl.cpp and ExtrusionEntity.cpp source paths');
const [viewer, extrusion] = await Promise.all(paths.map(path => readFile(path, 'utf8')));
const block = viewer.match(/DEFAULT_EXTRUSION_ROLES_COLORS\s*=\s*\{\s*\{([\s\S]*?)\}\s*\};/)?.[1];
if (!block) throw new Error('Native default role palette declaration not found');
const names = new Map([...extrusion.matchAll(/case\s+er(\w+)\s*:\s*return\s+L\("([^"]+)"\)/g)].map(match => [match[1], match[2]]));
const roles = [...block.matchAll(/\{\s*(\d+),\s*(\d+),\s*(\d+)\s*\},\s*\/\/\s*(\w+)/g)].map(match => {
  const nativeRole = match[4], name = names.get(nativeRole);
  if (!name) throw new Error(`Missing native role label: ${nativeRole}`);
  return { nativeRole, name, rgb: match.slice(1, 4).map(Number) };
});
if (roles.length !== 20 || new Set(roles.map(role => role.nativeRole)).size !== 20) throw new Error('Expected the pinned native 20-role palette');
const hash = source => createHash('sha256').update(source).digest('hex');
if (hash(viewer) !== '0f393952652a923a9a2f18072aeebc5819a6d30b8b65dd8d43657697f887b49a' ||
    hash(extrusion) !== '341f64233ea602ae8081c5281e37c4db3902f8f2795dff312c7f82586ce11d3d') {
  throw new Error('Source hashes do not match the pinned 2.4.2 commit');
}
process.stdout.write(JSON.stringify({
  commit: '8500fcdccaa10b5099ac20d252af3a7c560046f1',
  sourceSha256: { 'ViewerImpl.cpp': hash(viewer), 'ExtrusionEntity.cpp': hash(extrusion) },
  roles
}, null, 2) + '\n');
