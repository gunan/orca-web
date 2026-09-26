import { spawn } from 'node:child_process';
import { readdir, rename } from 'node:fs/promises';
import path from 'node:path';

export function buildSlicerArgs(input, outputDirectory, profilePath) {
  const args = ['--slice', '0', '--outputdir', outputDirectory];
  if (profilePath) args.push('--load-settings', profilePath);
  args.push(input);
  return args;
}

export async function sliceModel({ binary, input, output, profilePath }) {
  const outputDirectory = path.dirname(output);
  const before = new Set(await readdir(outputDirectory));
  const args = buildSlicerArgs(input, outputDirectory, profilePath);

  await new Promise((resolve, reject) => {
    const child = spawn(binary, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.once('error', reject);
    child.once('close', code => code === 0 ? resolve() : reject(new Error(stderr.trim() || `OrcaSlicer exited with code ${code}`)));
  });

  const generated = (await readdir(outputDirectory)).find(file => !before.has(file) && file.endsWith('.gcode'));
  if (!generated) throw new Error('OrcaSlicer finished without producing G-code');
  await rename(path.join(outputDirectory, generated), output);
}
