import {prepareShrinkageWarmup} from './shrinkage-warmup.js';
import {importPrusaArchive} from './native-prusa.js';
import {prepareLegacyShrinkageWarmup} from './legacy-shrinkage.js';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, readdir, rename, rm, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

export function buildSlicerArgs(input, outputDirectory, profilePath, { printerPath, filamentPath, dataDirectory, preservePosition = false } = {}) {
  const args = ['--slice', '0', '--outputdir', outputDirectory];
  const settings = [printerPath, profilePath].filter(Boolean);
  if (settings.length) args.push('--load-settings', settings.join(';'));
  if (filamentPath) args.push('--load-filaments', filamentPath);
  if (dataDirectory) args.push('--datadir', dataDirectory);
  // OrcaSlicer 2.4.2 documents these controls in --help. Native regression tests
  // verify that disabling both keeps client-baked XY placement and orientation.
  // Native STL import still drops objects onto the bed; it does not preserve a
  // floating Z coordinate, so clients must snap exported geometry to the bed.
  if (preservePosition) args.push('--arrange', '0', '--orient', '0');
  args.push(input);
  return args;
}

// Drain both pipes and retain only a bounded tail. Native logs can exceed pipe capacity.
export async function runSlicer(binary, args, { cwd, timeoutMs = 10 * 60 * 1000, signal } = {}) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new Error('Slicing cancelled'));
    const executable = binary.includes('/') || binary.includes('\\') ? path.resolve(binary) : binary;
    const child = spawn(executable, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    let log = '', timedOut = false, aborted = false, forceKill;
    const collect = chunk => { log = (log + chunk.toString()).slice(-32 * 1024); };
    child.stdout.on('data', collect);
    child.stderr.on('data', collect);
    function terminate() {
      if (forceKill) return;
      child.kill('SIGTERM');
      forceKill = setTimeout(() => child.kill('SIGKILL'), 1000);
      forceKill.unref();
    }
    const timer = setTimeout(() => { timedOut = true; terminate(); }, timeoutMs);
    timer.unref();
    const abort = () => { aborted = true; terminate(); };
    signal?.addEventListener('abort', abort, { once: true });
    function cleanup() {
      clearTimeout(timer); clearTimeout(forceKill); signal?.removeEventListener('abort', abort);
    }
    child.once('error', error => { cleanup(); reject(new Error(`Cannot run OrcaSlicer: ${error.message}`)); });
    child.once('close', (code, childSignal) => {
      cleanup();
      if (aborted) reject(new Error('Slicing cancelled'));
      else if (timedOut) reject(new Error(`OrcaSlicer exceeded ${timeoutMs} ms timeout`));
      else if (code !== 0) {
        // Orca 2.4.2 Utils.hpp: CLI_GCODE_PATH_CONFLICTS = -101 (155 on Unix).
        // macOS may only emit "run found error, exit" for this native failure.
        const hint = code === 155 || code === -101 ? 'Generated toolpaths intersect. Adjust model spacing or prime-tower placement and slice again. ' : '';
        reject(new Error(`OrcaSlicer exited ${code ?? childSignal}: ${hint}${log.trim() || 'No diagnostic output'}`));
      }
      else resolve(log);
    });
  });
}

export async function inspectSlicer(binary) {
  try {
    const help = await runSlicer(binary, ['--help'], { timeoutMs: 5000 });
    const version = help.match(/OrcaSlicer[^\r\n]*/i)?.[0]?.replace(/:$/, '');
    if (!version) throw new Error('Executable did not identify itself as OrcaSlicer');
    return { available: true, version };
  } catch (error) { return { available: false, error: error.message }; }
}

export async function sliceModel({ binary, input, output, profilePath, printerPath, filamentPath, preservePosition = false, timeoutMs, signal, shrinkageWarmup, legacySelection, engineVersion }) {
  const deadline=Date.now()+(timeoutMs??10*60*1000);
  const remaining=()=>{const value=deadline-Date.now();if(value<=0)throw new Error("Native slicing exceeded its job timeout");return value;};
  await mkdir(path.dirname(output), { recursive: true });
  const work = await mkdtemp(path.join(path.dirname(output), '.slice-'));
  const dataDirectory = path.join(work, 'config');
  try {
    await mkdir(dataDirectory);
    let targetInput = path.resolve(input),nativeImport;
    if(!shrinkageWarmup&&legacySelection&&path.extname(input).toLowerCase()==='.3mf'){
      const imported=await importPrusaArchive(await readFile(targetInput),{selection:legacySelection,filename:path.basename(input),work,signal,timeoutMs:remaining()});
      if(imported){nativeImport=imported.nativeImport;targetInput=path.join(work,'imported-prusa.3mf');await writeFile(targetInput,imported.bytes);shrinkageWarmup=prepareShrinkageWarmup({...imported,engineVersion});printerPath=undefined;profilePath=undefined;filamentPath=undefined;legacySelection=undefined;preservePosition=true;}
    }
    if (!shrinkageWarmup && legacySelection) shrinkageWarmup = await prepareLegacyShrinkageWarmup({input:targetInput,selection:legacySelection,engineVersion,preservePosition,binary,work,printerPath,profilePath,filamentPath,signal,runNative:runSlicer,timeoutMs:remaining()});
    const rawArchiveWarmup = shrinkageWarmup?.sourceMode === 'native-archive' && legacySelection && path.extname(input).toLowerCase() === '.3mf';
    if (shrinkageWarmup && legacySelection && !rawArchiveWarmup) { printerPath = undefined; profilePath = undefined; filamentPath = undefined; preservePosition = true; }
    if (shrinkageWarmup) {
      if (shrinkageWarmup.version !== 1 || !(shrinkageWarmup.bytes instanceof Uint8Array) || shrinkageWarmup.bytes.byteLength > 128*1024*1024 || shrinkageWarmup.targetOutputName !== 'plate_1.gcode' || JSON.stringify(shrinkageWarmup.expectedOutputNames) !== JSON.stringify(['plate_1.gcode','plate_2.gcode']) || (!rawArchiveWarmup && (profilePath || printerPath || filamentPath || !preservePosition))) throw new Error('Invalid native shrinkage initialization request');
      targetInput = path.join(work, 'initialized-project.3mf');
      await writeFile(targetInput, shrinkageWarmup.bytes);
    }
    const args = buildSlicerArgs(targetInput, work, profilePath && path.resolve(profilePath), {
      printerPath: printerPath && path.resolve(printerPath),
      filamentPath: filamentPath && path.resolve(filamentPath), dataDirectory, preservePosition
    });
    const log = await runSlicer(binary, args, { cwd: work, timeoutMs:remaining(), signal });
    const files = (await readdir(work)).filter(file => file.toLowerCase().endsWith('.gcode'));
    if (files.length === 0) throw new Error(`OrcaSlicer finished without producing G-code. ${log.trim()}`);
    if (shrinkageWarmup) {
      if (JSON.stringify([...files].sort()) !== JSON.stringify(shrinkageWarmup.expectedOutputNames)) throw new Error('Native shrinkage initialization produced unexpected plate outputs');
      for (const file of files) if (!(await stat(path.join(work,file))).size) throw new Error('Native shrinkage initialization produced an empty plate output');
    } else if (files.length > 1) throw new Error('This version supports exporting one plate per job. Multiple plate outputs were produced; none were selected.');
    const generated = path.join(work, shrinkageWarmup ? 'plate_1.gcode' : files[0]);
    if (!(await stat(generated)).size) throw new Error('OrcaSlicer produced an empty G-code file');
    if (signal?.aborted) throw new Error('Slicing cancelled');
    await rename(generated, output);
    if (signal?.aborted) {
      await unlink(output);
      throw new Error('Slicing cancelled');
    }
    return { log, ...(nativeImport&&{nativeImport}), ...(shrinkageWarmup && { shrinkageInitialization: shrinkageWarmup.summary }) };
  } finally { await rm(work, { recursive: true, force: true }); }
}
