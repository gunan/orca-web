#!/usr/bin/env python3
"""Explicit pinned native preview build; never runs from the HTTP server."""
from pathlib import Path
import os,sys,subprocess,hashlib,json,shutil,platform
HERE=Path(__file__).resolve().parents[1];REPO=HERE.parent.parent
CACHE=Path(os.environ.get('ORCA_NATIVE_CACHE_DIR',REPO/'.native-cache')).resolve()
SOURCE=Path(os.environ.get('ORCA_SOURCE_DIR',CACHE/'upstream/repository')).resolve()
PREFIX=Path(os.environ.get('ORCA_NATIVE_PREFIX',CACHE/'prefix')).resolve()
DEPENDENCIES=Path(os.environ.get('ORCA_NATIVE_DEPENDENCIES',CACHE/'dependencies')).resolve()
BUILD=Path(os.environ.get('ORCA_GCODE_BUILD_DIR',CACHE/'gcode-build')).resolve()
if sys.platform!='darwin':raise SystemExit('This build recipe is validated on macOS. Supply a separately validated ORCA_GCODE_WORKER_BIN on other platforms.')
def run(args):print(' '.join(str(value)for value in args),flush=True);subprocess.run([str(value)for value in args],check=True)
# Share the existing verified dependency bootstrap. It also produces the emboss
# helper on a fresh cache; no extra downloads occur once those dependencies exist.
required=[SOURCE/'src/libslic3r/GCode/GCodeProcessor.cpp',PREFIX/'lib/libboost_log.a',PREFIX/'lib/libgmp.a',PREFIX/'lib/libmpfr.a',PREFIX/'lib/libtbb.a',DEPENDENCIES/'eigen/eigen-5.0.1']
if not all(path.exists()for path in required):
 if any(os.environ.get(name)for name in ['ORCA_SOURCE_DIR','ORCA_NATIVE_PREFIX','ORCA_NATIVE_DEPENDENCIES']):raise SystemExit('Explicit native source/dependency paths are incomplete; populate the shared pinned dependency cache first.')
 bootstrap=REPO/'native/emboss-worker/scripts/build.py'
 if not bootstrap.is_file():raise SystemExit('Shared native dependency bootstrap is missing.')
 run([sys.executable,bootstrap])
cmake=Path(os.environ.get('CMAKE',CACHE/'tooling/bin/cmake'))
if not cmake.exists():
 installed=shutil.which('cmake')
 if not installed:raise SystemExit('CMake is unavailable; run the shared native dependency bootstrap first.')
 cmake=Path(installed)
BUILD.mkdir(parents=True,exist_ok=True)
run([cmake,'-S',HERE,'-B',BUILD,'-G','Ninja','-DCMAKE_BUILD_TYPE=Release',f'-DORCA_SOURCE_DIR={SOURCE}',f'-DORCA_NATIVE_PREFIX={PREFIX}',f'-DORCA_NATIVE_DEPENDENCIES={DEPENDENCIES}'])
jobs=str(min(4,max(1,int(os.environ.get('ORCA_NATIVE_BUILD_JOBS','2')))))
run([cmake,'--build',BUILD,'-j'+jobs]);binary=BUILD/'orca-gcode-worker';run([binary,'--version'])
manifest={'binarySha256':hashlib.sha256(binary.read_bytes()).hexdigest(),'sourceManifest':json.loads((HERE/'native-source-manifest.json').read_text()),'dependencyManifest':json.loads((HERE/'dependency-manifest.json').read_text()),'platform':sys.platform,'architecture':platform.machine(),'compiler':subprocess.check_output(['clang++','--version'],text=True).splitlines()[0],'buildRecipe':'native/gcode-worker/scripts/build.py'}
(BUILD/'build-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n');print('Native G-code preview helper built:',binary)
