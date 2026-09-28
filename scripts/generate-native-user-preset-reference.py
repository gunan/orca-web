#!/usr/bin/env python3
"""Capture the complete original native user-file loader independently of the port.

Build the production configuration helper first, then pass its build directory.
Only the test reference main object is rebuilt with ORCA_USER_PRESET_REFERENCE;
all original verified library objects and production source hashes are retained.
"""
from pathlib import Path
import hashlib,json,shlex,shutil,subprocess,sys,tempfile

root=Path(__file__).resolve().parents[1]
build=Path(sys.argv[1]).resolve() if len(sys.argv)>1 else root/'native/build/config'
manifest=json.loads((build/'build-manifest.json').read_text())
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
assert sha(build/'orca-config-worker')==manifest['binarySha256']
assert manifest['sourceManifest']['commit']=='8500fcdccaa10b5099ac20d252af3a7c560046f1'
for name,digest in manifest['workerSources'].items():
 assert sha(root/'native/config-worker'/name)==digest,name
ninja=shutil.which('ninja');assert ninja,'Ninja is required to recover the validated compile/link commands'
commands=subprocess.check_output([ninja,'-t','commands','orca-config-worker'],cwd=build,text=True).splitlines()
parsed=[shlex.split(row)for row in commands]
template=next(row for row in parsed if '-c' in row and Path(row[-1]).resolve()==root/'native/config-worker/worker/main.cpp')
link=parsed[-1];link=link[link.index(template[0]):];link=link[:link.index('&&')] if '&&' in link else link
cases=json.loads((root/'tests/fixtures/native-user-preset-input.json').read_text());captures=[]
with tempfile.TemporaryDirectory(prefix='orca-user-preset-reference-') as folder:
 out=Path(folder);obj=out/'reference-main.o';binary=out/'reference-worker'
 command=template.copy();command[command.index('-o')+1]=str(obj)
 for option,suffix in [('-MF','.d'),('-MT','.o')]:
  if option in command:command[command.index(option)+1]=str(out/('reference-main'+suffix))
 command.insert(1,'-DORCA_USER_PRESET_REFERENCE=1')
 subprocess.run(command,cwd=build,check=True)
 link[link.index('CMakeFiles/orca-config-worker.dir/worker/main.cpp.o')]=str(obj)
 link[link.index('-o')+1]=str(binary);subprocess.run(link,cwd=build,check=True)
 def run(worker,request):
  with tempfile.TemporaryDirectory(prefix='request-',dir=out) as work:
   work=Path(work);input=work/'request.json';output=work/'output.json';input.write_text(json.dumps(request))
   subprocess.run([str(worker),str(input),str(output)],cwd=work,check=True,capture_output=True,timeout=30)
   return json.loads(output.read_text())['userPreset']
 for fixture in cases:
  request=dict(operation='user-preset-projection',scope=fixture['scope'],name='Imported @Printer' if fixture['id']=='root-filament-name-restriction' else fixture['id'])
  if 'parent' in fixture:request['parent']=fixture['parent']
  saved=run(build/'orca-config-worker',dict(request,mode='save',settings=fixture['settings']))
  input=dict(request,mode='load',document=saved['document'])
  captures.append(dict(id=fixture['id'],input=input,expected=run(binary,input)))
 provenance={'sourceManifest':manifest['sourceManifest'],'productionBinarySha256':manifest['binarySha256'],'referenceBinarySha256':sha(binary),'workerSources':manifest['workerSources'],'generatorSha256':sha(Path(__file__)),'inputSha256':sha(root/'tests/fixtures/native-user-preset-input.json')}
(root/'tests/fixtures/native-user-preset-reference.json').write_text(json.dumps({'provenance':provenance,'cases':captures},indent=2)+'\n')
print('Captured',len(captures),'original complete user-file loader cases.')
