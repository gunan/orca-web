"""Export source-declared preferences with separate, explicit web progress.
Usage: python3 scripts/export-native-preferences.py /path/to/pinned/OrcaSlicer
This inventories declarations, not proven visibility in an installed GUI.
"""
from pathlib import Path
import json,re,sys,hashlib,subprocess,csv
root=Path(__file__).resolve().parents[1];source=Path(sys.argv[1]).resolve();commit='8500fcdccaa10b5099ac20d252af3a7c560046f1';path='src/slic3r/GUI/Preferences.cpp';config_path='src/libslic3r/AppConfig.hpp'
assert subprocess.check_output(['git','-C',str(source),'rev-parse','HEAD'],text=True).strip()==commit
subprocess.run(['git','-C',str(source),'diff','--exit-code',commit,'--',path,config_path],check=True)
text=(source/path).read_text();spaces=lambda s:''.join('\n' if c=='\n' else ' ' for c in s)
tokens=re.compile(r'"(?:\\.|[^"\\])*"|\'(?:\\.|[^\'\\])*\'|//[^\n]*|/\*[\s\S]*?\*/')
clean=tokens.sub(lambda m:spaces(m[0]) if m[0].startswith(('//','/*')) else m[0],text)
mask=tokens.sub(lambda m:spaces(m[0]),clean)
def end_at(start):
 opening=mask[start];closing={'(':')','{':'}','[':']'}[opening];depth=1;i=start+1
 while depth:
  depth+=(mask[i]==opening)-(mask[i]==closing);i+=1
 return i
def args(start,end):
 indexes=[start+1];depth=0
 for i in range(start+1,end-1):
  if mask[i] in '({[':depth+=1
  elif mask[i] in ')}]':depth-=1
  elif mask[i]==',' and not depth:indexes.append(i+1)
 return [clean[a:b-1].strip() for a,b in zip(indexes,indexes[1:]+[end])]
def literals(value):
 return ''.join(json.loads(m[0]) for m in re.finditer(r'"(?:\\.|[^"\\])*"',value))
start=mask.index('{',mask.index('void PreferencesDialog::create_items()'));end=end_at(start)
tabs=[(m.start(),literals(m[1])) for m in re.finditer(r'm_pref_tabs->AppendItem\(([^;]+)\);',clean)]
groups=[(m.start(),literals(m[1])) for m in re.finditer(r'create_item_title\(([^;]+?)\)\s*\)',clean)]
macros=dict(re.findall(r'^#define\s+(SETTING_\w+)\s+"([^"]+)"',(source/config_path).read_text(),re.M))
progress=json.loads((root/'docs/parity/native-preferences-progress.json').read_text());rows=[]
for match in re.finditer(r'\b(create_item_\w+|create_camera_orbit_mult_input|create_debug_page)\s*\(',mask[start:end]):
 pos=start+match.start();method=match[1]
 if method=='create_item_title':continue
 a=mask.index('(',pos);b=end_at(a);arguments=args(a,b);line=text.count('\n',0,pos)+1
 variable=re.search(r'(\w+)\s*=\s*$',mask[max(start,pos-100):pos]);assert variable,(method,line)
 variable=variable[1];tab=next((v for i,v in reversed(tabs) if i<pos),'Unknown');group=next((v for i,v in reversed(groups) if i<pos),'Unknown');label=literals(arguments[0]) if arguments else 'Debug controls'
 key_index={'create_item_checkbox':2,'create_item_combobox':2,'create_item_spinctrl':4,'create_item_input':3,'create_item_darkmode':2}.get(method);key_expression=arguments[key_index] if key_index is not None and len(arguments)>key_index else None
 key=macros.get(key_expression,literals(key_expression)) if key_expression else 'camera_orbit_mult' if method=='create_camera_orbit_mult_input' else None
 if key_index is not None and (not key or not re.fullmatch(r'[a-z][a-z0-9_]*',key)):
  # A platform-dependent tooltip contributes mutually exclusive arguments.
  # Locate a literal config key without treating translated text as a key.
  candidates=[re.sub(r'^\s*#.*$', '', arg,flags=re.M).strip() for arg in arguments]
  candidates=[arg for arg in candidates if re.fullmatch(r'"[a-z][a-z0-9_]*"',arg) or arg in macros]
  key_expression=candidates[-1] if candidates else key_expression;key=macros.get(key_expression,literals(key_expression)) if candidates else None
 identity='preferences.'+re.sub(r'[^a-z0-9]+','-',(key or variable.removeprefix('item_')).lower()).strip('-')
 guards=[]
 for m in re.finditer(r'^\s*#\s*(if|ifdef|ifndef|elif|else|endif)\b([^\n]*)',clean[:pos],re.M):
  op,value=m[1],m[2].strip()
  if op in ['if','ifdef','ifndef']:guards.append(op+' '+value)
  elif op in ['elif','else'] and guards:guards[-1]=op+' '+value
  elif op=='endif' and guards:guards.pop()
 state=progress.get(identity,{'status':'missing','featureId':'ui.dialogs','testRefs':[],'scope':'No corresponding web Preferences control is implemented.'})
 rows.append({'id':identity,'tab':tab,'group':group,'sourceLabel':label,'controlFactory':method,'nativeKey':key,'nativeKeyExpression':key_expression,'sourceLine':line,'sourceConditions':guards,'visibility':'Source declaration; installed GUI visibility and runtime guards require acceptance.','status':state['status'],'featureId':state['featureId'],'scope':state['scope'],'testRefs':state['testRefs'],'plannedTests':[{'kind':'browser','description':f'Exercise {label or variable} through its actual Preferences control; validate persistence, cancellation or immediate-apply behavior and malformed input where applicable.'},{'kind':'native','description':f'Compare {label or variable} visibility, defaults and its affected application behavior with pinned native2.4.2 on the applicable platform/build.'}],'sourceCall':clean[pos:b]})
assert len({r['id'] for r in rows})==len(rows),'Duplicate preference IDs'
disabled=[r for r in rows if 'if 0' in r['sourceConditions']];rows=[r for r in rows if 'if 0' not in r['sourceConditions']]
assert set(progress).issubset({r['id'] for r in rows}),set(progress)-{r['id'] for r in rows}
output={'schemaVersion':1,'nativeVersion':'2.4.2','sourceCommit':commit,'sourcePath':path,'sourceSha256':hashlib.sha256((source/path).read_bytes()).hexdigest(),'generatorSha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),'scope':'All uncommented top-level control declarations in PreferencesDialog::create_items, including platform/build-guarded controls. Commented-out declarations and separately defined, uncalled debug/sync panes are excluded. This is not a GUI visibility census or evidence of completed functionality. An explicit #if0 declaration is retained separately and excluded from candidate controls. Planned tests are not passing tests.','controls':rows,'disabledDeclarations':disabled}
d=root/'docs/parity';(d/'native-preferences.json').write_text(json.dumps(output,indent=2)+'\n')
with (d/'native-preferences.csv').open('w',newline='') as file:
 keys=['id','tab','group','sourceLabel','nativeKey','status','featureId','scope','sourceLine','sourceConditions','plannedTests','testRefs'];writer=csv.DictWriter(file,fieldnames=keys);writer.writeheader()
 for row in rows:writer.writerow({k:json.dumps(row[k]) if isinstance(row[k],(list,dict)) else row[k] for k in keys})
print(f'Exported {len(rows)} candidate source controls ({len(disabled)} disabled declarations kept separately) across {len(set(r["tab"] for r in rows))} preference tabs; unimplemented controls retain explicit plans.')
