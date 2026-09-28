from pathlib import Path
import hashlib,json,subprocess,sys
source_root=Path(sys.argv[1]).resolve();output=Path(sys.argv[2]).resolve();spec=Path(__file__).resolve().parent.parent/'native-helper-manifest.json';expected=json.loads(spec.read_text())
commit=subprocess.check_output(['git','-C',str(source_root),'rev-parse','HEAD'],text=True).strip()
if commit!=expected['commit']:raise RuntimeError('Native source checkout does not match pinned OrcaSlicer 2.4.2 commit')
if subprocess.run(['git','-C',str(source_root),'diff','--quiet','HEAD','--','src','deps_src']).returncode:raise RuntimeError('Pinned native source has local modifications')
for manifest_name in ['per-glyph-source-manifest.json','svg-source-manifest.json']:
 manifest=json.loads((spec.parent/manifest_name).read_text())
 if manifest['commit']!=commit:raise RuntimeError('Geometry source manifest commit mismatch')
 for item in manifest['files']:
  if hashlib.sha256((source_root/item['path']).read_bytes()).hexdigest()!=item['sha256']:raise RuntimeError('Pinned geometry source hash changed: '+item['path'])
source=source_root/expected['source'];data=source.read_bytes()
if hashlib.sha256(data).hexdigest()!=expected['sourceSha256']:raise RuntimeError('Native TriangleMesh.cpp source hash changed')
text=data.decode();start=text.index(expected['function']);end=text.index('\nvoid its_merge(',start+1);body=text[start:end]
if hashlib.sha256(body.encode()).hexdigest()!=expected['functionSha256']:raise RuntimeError('Native mesh helper hash changed')
for item in expected.get('additionalRanges',[]):
 extra=text[text.index(item['start']):text.index(item['end'])]
 if hashlib.sha256(extra.encode()).hexdigest()!=item['sha256']:raise RuntimeError('Native source range hash changed')
 body+='\n'+extra
(output/'native-mesh-helpers.cpp').write_text('// Generated exact native its_merge from pinned TriangleMesh.cpp; see native-helper-manifest.json.\n// OrcaSlicer AGPL-3.0, upstream LICENSE.txt. No geometry substitution.\n#include <libslic3r/TriangleMesh.hpp>\nnamespace Slic3r {\n'+body+'\n}\n')
