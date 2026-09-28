#!/usr/bin/env node
import {readFile,writeFile} from 'node:fs/promises';import{createHash}from'node:crypto';import path from'node:path';import{fileURLToPath}from'node:url';
import{EDITOR_SHORTCUTS,SHORTCUT_BASELINE}from'../shared/native-shortcuts.js';
const root=fileURLToPath(new URL('../',import.meta.url)),sourceRoot=process.argv[2]||process.env.ORCA_SOURCE_DIR;
if(!sourceRoot)throw new Error('Provide the pinned OrcaSlicer source directory as the first argument or ORCA_SOURCE_DIR.');
const source='src/slic3r/GUI/KBShortcutsDialog.cpp',text=await readFile(path.join(sourceRoot,source),'utf8'),lines=text.split('\n'),groups={global:'Global',plater:'Prepare',gizmos:'Gizmo',object_list:'Object list',preview:'Preview'},records=[];let inFunction=false,group=null,appleBranch=null;
function shortcut(expression){const tokens=expression.match(/\b(?:ctrl|alt|shift)\b|"(?:\\.|[^"\\])*"/g)||[];return tokens.map(token=>({ctrl:'Mod+',alt:'Alt+',shift:'Shift+'}[token]??JSON.parse(token))).join('');}
if(createHash('sha256').update(text).digest('hex')!=='408f986d15262335c3bfd5dc0fa23db08343f8994588d746387d452e65f6a703')throw new Error('Keyboard source does not match the pinned baseline');
const supported=new Map(EDITOR_SHORTCUTS.map(([group,key,label,action])=>[`${group}:${key.toLowerCase()}`,action]));
for(let index=0;index<lines.length;index++){
 const line=lines[index];if(line.includes('void KBShortcutsDialog::fill_shortcuts()'))inFunction=true;if(!inFunction)continue;if(line.startsWith('wxPanel* KBShortcutsDialog::create_page'))break;
 const heading=line.match(/Shortcuts (\w+)_shortcuts\s*=/);if(heading)group=groups[heading[1]];
 if(/^\s*#ifdef __APPLE__/.test(line)){appleBranch=true;continue;}if(/^\s*#else/.test(line)&&appleBranch!==null){appleBranch=false;continue;}if(/^\s*#endif/.test(line)){appleBranch=null;continue;}
 const row=line.match(/^\s*\{\s*(.*?),\s*(?:L\("((?:\\.|[^"\\])*)"\)|(mouse_actions\[.*\]))\s*\}/);if(!row||!group)continue;
 const key=shortcut(row[1]),description=row[2]!==undefined?JSON.parse('"'+row[2]+'"'):'Configured mouse action',lookup=`${group}:${key.toLowerCase()}`,action=(group==='Preview'?'previewShortcut':null)||supported.get(lookup)||(['Prepare','Object list'].includes(group)?supported.get(`Prepare:${key.toLowerCase()}`):null)||(group==='Prepare'&&['Mod+Any arrow','Shift+Any arrow'].includes(key)?'nudge':null)||(group==='Prepare'&&key==='1-9'?'filamentDigit':null)||(group==='Prepare'&&/^Mod\+[0-6]$/.test(key)?'camera':null)||(group==='Prepare'&&/^(Shift\+)?Arrow (Up|Down|Left|Right)$/.test(key)?'nudge':null)||(['Prepare','Object list'].includes(group)&&key==='Esc'?'deselectAll':null)||(['Global','Object list'].includes(group)&&['Del','fn+⌫'].includes(key)?'deleteSelection':null),platform=appleBranch===true?'macOS':appleBranch===false?'Windows/Linux':'all';
 records.push({group,shortcut:key,description,platform,sourceLine:index+1,webBinding:action||null,status:action?'implemented binding':'pending or separate tool interaction',...(group==='Preview'&&{coverageNote:'Native slider transitions, hidden command/event ticks, and top-layer-only playback are source-verified for native-processed data; source-only fallback and visual layout retain explicit limits.'})});
}
if(records.length<65||!records.some(row=>row.shortcut==='Mod+D'&&row.description==='Delete all'))throw new Error('Native shortcut parser no longer matches the pinned help structure');
const output={nativeVersion:'2.4.2',revision:SHORTCUT_BASELINE,source,sourceSha256:createHash('sha256').update(text).digest('hex'),scope:'All entries in the pinned native keyboard-help table, including platform variants and configurable mouse actions. Binding status does not certify complete underlying feature or native visual parity. Source handlers contain additional context predicates; Preview and other remaining entries are separate work.',shortcuts:records};
const filename=path.join(root,'docs/parity/native-shortcuts.json');await writeFile(filename,JSON.stringify(output,null,2)+'\n');
console.log(`Exported ${records.length} native shortcut entries to ${filename}`);
