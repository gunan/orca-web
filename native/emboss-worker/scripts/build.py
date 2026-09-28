#!/usr/bin/env python3
"""Explicit build command; no downloads or compilation occur at server startup."""
from pathlib import Path
import os,sys,subprocess,shutil,json,hashlib,platform
HERE=Path(__file__).resolve().parent.parent;REPO=HERE.parent.parent;CACHE=Path(os.environ.get('ORCA_NATIVE_CACHE_DIR',REPO/'.native-cache')).resolve();PREFIX=CACHE/'prefix';SOURCE=CACHE/'upstream/repository';DEPS=CACHE/'dependencies';BUILD=CACHE/'build';JOBS=str(min(2,max(1,int(os.environ.get('ORCA_NATIVE_BUILD_JOBS','2')))));COMMIT='8500fcdccaa10b5099ac20d252af3a7c560046f1';BINARY=REPO/'native/build/emboss/orca-emboss-worker';WORKER_BUILD=BUILD/('emboss-'+hashlib.sha256(str(HERE).encode()).hexdigest()[:12])
if sys.version_info<(3,12):raise SystemExit('Python 3.12 or newer is required for bounded archive extraction and hashing.')
if sys.platform!='darwin':raise SystemExit('This build recipe is validated on macOS. Supply a separately validated ORCA_EMBOSS_WORKER_BIN on other platforms.')
CACHE.mkdir(parents=True,exist_ok=True);BUILD.mkdir(exist_ok=True);PREFIX.mkdir(exist_ok=True)
def run(args,cwd=None):print(' '.join(str(a)for a in args),flush=True);subprocess.run([str(a)for a in args],cwd=cwd,check=True)
cmake=Path(os.environ.get('CMAKE',CACHE/'tooling/bin/cmake'))
if not cmake.exists():
 existing=shutil.which('cmake')
 if existing:cmake=Path(existing)
 else:
  run([sys.executable,'-m','venv',CACHE/'tooling']);lock=CACHE/'cmake-requirements.txt';lock.write_text('cmake==3.31.6 --hash=sha256:da9d4fd9abd571fd016ddb27da0428b10277010b23bb21e3678f8b9e96e1686e\n');run([CACHE/'tooling/bin/pip','install','--require-hashes','-r',lock])
if not SOURCE.exists():
 SOURCE.parent.mkdir(exist_ok=True);run(['git','clone','--filter=blob:none','--no-checkout','--single-branch','https://github.com/SoftFever/OrcaSlicer.git',SOURCE]);run(['git','-C',SOURCE,'fetch','origin',COMMIT,'--depth=1']);run(['git','-C',SOURCE,'sparse-checkout','set','src','deps','deps_src','cmake']);run(['git','-C',SOURCE,'checkout','--detach',COMMIT])
if subprocess.check_output(['git','-C',str(SOURCE),'rev-parse','HEAD'],text=True).strip()!=COMMIT:raise SystemExit('Existing source cache has a different commit; choose a separate ORCA_NATIVE_CACHE_DIR.')
run([sys.executable,HERE/'scripts/fetch-deps.py',CACHE])
def dependency(name):return next(path for path in (DEPS/name).iterdir() if path.is_dir())
if not(PREFIX/'lib/libgmp.a').exists():
 gmp=dependency('gmp');patch=SOURCE/'deps/GMP/0001-GMP_GCC15.patch';probe=subprocess.run(['git','apply','--reverse','--check',str(patch)],cwd=gmp,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
 if probe.returncode:run(['git','apply',patch],gmp)
 run(['./configure','--enable-shared=no','--enable-cxx=yes','--enable-static=yes',f'--prefix={PREFIX}'],gmp);run(['make','-j'+JOBS],gmp);run(['make','install'],gmp)
if not(PREFIX/'lib/libmpfr.a').exists():
 mpfr=dependency('mpfr');run(['./configure','--enable-shared=no','--enable-static=yes',f'--with-gmp={PREFIX}',f'--prefix={PREFIX}'],mpfr);run(['make','-j'+JOBS],mpfr);run(['make','install'],mpfr)
def cmake_dependency(name,source,options):
 directory=BUILD/name;run([cmake,'-S',source,'-B',directory,'-G','Ninja','-DCMAKE_BUILD_TYPE=Release',f'-DCMAKE_INSTALL_PREFIX={PREFIX}',*options]);run([cmake,'--build',directory,'-j'+JOBS]);run([cmake,'--install',directory])
if not(PREFIX/'lib/libtbb.a').exists():cmake_dependency('tbb',dependency('tbb'),['-DTBB_TEST=OFF','-DTBB_BUILD_TESTS=OFF','-DTBB_BUILD_SHARED=OFF','-DBUILD_SHARED_LIBS=OFF','-DTBB_STRICT=OFF'])
if not(PREFIX/'lib/libboost_log.a').exists():cmake_dependency('boost',dependency('boost'),['-DBOOST_INCLUDE_LIBRARIES=log','-DBUILD_TESTING=OFF','-DBUILD_SHARED_LIBS=OFF'])
# Native libslic3r includes Boost headers beyond Boost.Log's selected targets.
boost_include=PREFIX/'include/boost';boost_include.mkdir(parents=True,exist_ok=True)
for include in (dependency('boost')/'libs').glob('*/include/boost'):
 for item in include.rglob('*'):
  destination=boost_include/item.relative_to(include)
  if item.is_dir():destination.mkdir(parents=True,exist_ok=True)
  elif not destination.exists():destination.symlink_to(item)
# Preserve exact source licenses with the cache, rather than copying only binaries.
licenses=CACHE/'licenses';licenses.mkdir(exist_ok=True)
for name in ['cgal','eigen','boost','tbb','gmp','mpfr','cereal']:
 target=licenses/name;target.mkdir(exist_ok=True)
 for file in dependency(name).iterdir():
  if file.is_file()and(file.name.upper().startswith('LICENSE')or file.name.upper().startswith('COPYING')):shutil.copy2(file,target/file.name)
shutil.copy2(SOURCE/'LICENSE.txt',licenses/'OrcaSlicer-LICENSE.txt')
BINARY.parent.mkdir(parents=True,exist_ok=True);run([cmake,'-S',HERE,'-B',WORKER_BUILD,'-G','Ninja','-DCMAKE_BUILD_TYPE=Release',f'-DORCA_NATIVE_CACHE={CACHE}',f'-DCMAKE_RUNTIME_OUTPUT_DIRECTORY={BINARY.parent}']);run([cmake,'--build',WORKER_BUILD,'-j'+JOBS]);run([BINARY,'--version'])
manifest={'nativeVersion':'2.4.2','commit':COMMIT,'binarySha256':hashlib.sha256(BINARY.read_bytes()).hexdigest(),'dependencyManifest':json.loads((HERE/'dependency-manifest.json').read_text()),'platform':sys.platform,'architecture':platform.machine(),'compiler':subprocess.check_output(['clang++','--version'],text=True).splitlines()[0],'sdk':subprocess.check_output(['xcrun','--show-sdk-version'],text=True).strip(),'cmake':subprocess.check_output([str(cmake),'--version'],text=True).splitlines()[0],'buildRecipe':'native/emboss-worker/scripts/build.py'};(BINARY.parent/'build-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n');print('Native text worker built:',BINARY)
