"""Build an independent oracle around the original, unchanged ObjectList method."""
from pathlib import Path
import argparse,hashlib,json,shlex,subprocess
parser=argparse.ArgumentParser();parser.add_argument('--source',required=True);parser.add_argument('--build',required=True);parser.add_argument('--output',required=True);args=parser.parse_args()
source=Path(args.source).resolve();build=Path(args.build).resolve();out=Path(args.output).resolve();out.mkdir(parents=True,exist_ok=True);root=Path(__file__).resolve().parents[3]
manifest=json.loads((root/'native/config-worker/native-source-manifest.json').read_text());name='src/slic3r/GUI/GUI_ObjectList.cpp';raw=(source/name).read_bytes();assert hashlib.sha256(raw).hexdigest()==manifest['files'][name]
text=raw.decode();body=text[text.index('void ObjectList::paste_settings_into_list()'):text.index('void ObjectList::paste_volumes_into_list(')].rstrip();(out/'native-settings-paste-original.inc').write_text(body+'\n')
commands=subprocess.check_output(['ninja','-t','commands'],cwd=build,text=True).splitlines();compile=next(shlex.split(line)for line in commands if 'worker/main.cpp.o -c' in line);obj=out/'settings-reference.o';compile[compile.index('-o')+1]=str(obj);compile[compile.index('-c')+1]=str(root/'tests/fixtures/native-settings-clipboard-reference.cpp');compile.extend(['-I'+str(out)]);subprocess.run(compile,cwd=build,check=True)
link=next(shlex.split(line)for line in reversed(commands)if '-o orca-config-worker' in line);link=link[link.index('&&')+1:link.index('&&',link.index('&&')+1)]if link[0]==':' else link
link=[str(obj)if value=='CMakeFiles/orca-config-worker.dir/worker/main.cpp.o'else value for value in link];binary=out/'native-settings-reference';link[link.index('-o')+1]=str(binary);subprocess.run(link,cwd=build,check=True)
(out/'source.json').write_text(json.dumps({'revision':manifest['commit'],'source':name,'sourceSha256':hashlib.sha256(raw).hexdigest(),'methodSha256':hashlib.sha256(body.encode()).hexdigest()},indent=2)+'\n');print(binary)
