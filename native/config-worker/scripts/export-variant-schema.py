"""Export exact native option-set membership for bounded archive validation."""
from pathlib import Path
import hashlib,json,re,sys
source=Path(sys.argv[1]);target=Path(sys.argv[2]);name='src/libslic3r/PrintConfig.cpp'
manifest=json.loads((Path(__file__).resolve().parents[1]/'native-source-manifest.json').read_text())
text=(source/name).read_text();digest=hashlib.sha256((source/name).read_bytes()).hexdigest()
if digest!=manifest['files'][name]:raise SystemExit('Native variant schema source hash differs from pinned source')
result={'sourceRevision':manifest['commit'],'source':name,'sha256':digest}
for key in ['printer_options_with_variant_1','printer_options_with_variant_2','print_options_with_variant','filament_options_with_variant']:
 body=text[text.index('std::set<std::string> '+key):];body=body[:body.index('};')]
 body=re.sub(r'//[^\n]*','',body);body=re.sub(r'/\*.*?\*/','',body,flags=re.S)
 result[key]=sorted(set(re.findall(r'"([a-z0-9_]+)"',body)))
target.write_text(json.dumps(result,indent=2)+'\n')
