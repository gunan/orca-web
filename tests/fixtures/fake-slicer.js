// Process-boundary test double. This is never evidence of native slicing parity.
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { unzipSync, strFromU8 } from 'fflate';
const args = process.argv.slice(2);
if (args.includes('--help')) { console.log('OrcaSlicer-test-fixture'); process.exit(0); }
const get = flag => args[args.indexOf(flag) + 1];
const input = args.at(-1);
if (!/\.(stl|obj|3mf)$/i.test(input)) throw new Error('Input extension was not preserved');
const content = await readFile(input, 'utf8');
if (content.includes('FAIL_TEST')) throw new Error('Intentional fixture slicing failure');
if (content.includes('SLOW_TEST')) await new Promise(resolve => setTimeout(resolve, 300));
let machine, processPreset, filament;
if (input.endsWith('.3mf') && !args.includes('--load-settings')) {
  const files = unzipSync(await readFile(input));
  const settings = JSON.parse(strFromU8(files['Metadata/project_settings.config']));
  if (!settings.printer_settings_id || !settings.print_settings_id || !settings.filament_settings_id?.length) throw new Error('Embedded project settings are incomplete');
  machine = { name: settings.printer_settings_id };
  processPreset = settings;
  filament = { name: settings.filament_settings_id.join(', ') };
} else {
  const settings = await Promise.all(get('--load-settings').split(';').map(async filename => JSON.parse(await readFile(filename, 'utf8'))));
  machine = settings.find(item => item.type === 'machine');
  processPreset = settings.find(item => item.type === 'process');
  filament = JSON.parse(await readFile(get('--load-filaments'), 'utf8'));
  if (!machine || !processPreset || filament.type !== 'filament') throw new Error('Complete machine, process, and filament presets required');
  for (const preset of [machine, processPreset, filament]) {
    if (preset.from !== 'system' || preset.inherits) throw new Error('Presets must be flattened native configs');
  }
}
const lines = ['; test adapter only', `; source = ${content.split('\n')[0]}`, `; machine = ${machine.name}`, `; filament = ${filament.name}`];
for (const [key, value] of Object.entries(processPreset)) lines.push(`; ${key} = ${Array.isArray(value) ? value.join(',') : value}`);
lines.push('G28', 'G1 X20 Y20 Z0.2 E1');
await writeFile(path.join(get('--outputdir'), 'plate_1.gcode'), lines.join('\n'));
