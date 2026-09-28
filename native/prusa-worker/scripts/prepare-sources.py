from pathlib import Path
import hashlib,json,subprocess,sys
source=Path(sys.argv[1]).resolve();output=Path(sys.argv[2]).resolve()
spec=json.loads((Path(__file__).resolve().parents[1]/'source-manifest.json').read_text())
if subprocess.check_output(['git','-C',str(source),'rev-parse','HEAD'],text=True).strip()!=spec['commit']:
 raise RuntimeError('Expected the pinned OrcaSlicer2.4.2 checkout')
if subprocess.run(['git','-C',str(source),'diff','--quiet','HEAD','--','src','deps_src']).returncode:
 raise RuntimeError('Pinned Orca source has local modifications')
for name,expected in spec['sources'].items():
 if hashlib.sha256((source/name).read_bytes()).hexdigest()!=expected:raise RuntimeError('Native source hash mismatch: '+name)
def function(text,signature):
 start=text.index(signature);i=text.index('{',start)+1;level=1
 # Selected functions have no brace-like characters in strings or comments.
 while level:
  if text[i]=='{':level+=1
  elif text[i]=='}':level-=1
  i+=1
 return text[start:i]
model=(source/'src/libslic3r/Model.cpp').read_text()
body=function(model,'Model Model::read_from_step(')
model=model.replace(body+'\n\n','',1)
if hashlib.sha256(model.encode()).hexdigest()!=spec['generatedModelSha256']:raise RuntimeError('Unexpected Model.cpp extraction')
(output/'native-Model.cpp').write_text(model)
thumb=(source/'src/libslic3r/GCode/Thumbnails.cpp').read_text()
helpers=[function(thumb,'std::pair<GCodeThumbnailDefinitionsList, ThumbnailErrors> make_and_check_thumbnail_list(const std::string&'),function(thumb,'std::string get_error_string(')]
result='#include "libslic3r/GCode/Thumbnails.hpp"\n#include "libslic3r/format.hpp"\n#include <boost/algorithm/string/case_conv.hpp>\n#include <sstream>\nnamespace Slic3r::GCodeThumbnails { using namespace std::literals;\n'+'\n'.join(helpers)+'\n}\n'
if hashlib.sha256(result.encode()).hexdigest()!=spec['generatedThumbnailSha256']:raise RuntimeError('Unexpected thumbnail config helper extraction')
(output/'native-thumbnail-config.cpp').write_text(result)
