// OrcaSlicer 2.4.2 KBShortcutsDialog.cpp and GLCanvas3D::on_char.
// Modal editors own their shortcuts. Browser form editing keeps its own undo,
// selection and navigation rather than changing the hidden Prepare workspace.
export const SHORTCUT_BASELINE='8500fcdccaa10b5099ac20d252af3a7c560046f1';
export const EDITOR_SHORTCUTS=Object.freeze([
  ['Global','Mod+N','New project','new'],['Global','Mod+O','Open project','openProject'],
  ['Global','Mod+I','Import models','importModels'],['Global','Mod+S','Save project','save'],
  ['Global','Mod+Shift+S','Save project as','saveAs'],['Global','Mod+R','Slice plate','slice'],
  ['Global','Mod+G','Export plate G-code','exportGcode'],['Global','?','Keyboard shortcuts','help'],
  ['Prepare','Mod+Z','Undo','undo'],['Prepare','Mod+Y','Redo','redo'],['Prepare','Mod+Shift+Z','Redo','redo'],
  ['Prepare','Mod+X','Cut selected to model clipboard','cutModels'],['Prepare','Mod+C','Copy to model clipboard','copyModels'],['Prepare','Mod+V','Paste from model clipboard','pasteModels'],['Prepare','Mod+K','Clone selected','cloneModels'],
  ['Prepare','Mod+A','Select all on current plate','selectAll'],
  ['Prepare','Mod+D','Delete all objects','deleteAll'],['Prepare','Delete','Delete selection','deleteSelection'],
  ['Prepare','M','Move','move'],['Prepare','R','Rotate','rotate'],['Prepare','S','Scale','scale'],
  ['Prepare','F','Place face on bed','placeFace'],['Prepare','C','Cut','cut'],
  ['Prepare','T','Text','text'],['Prepare','E','Brim ears','brim'],['Prepare','P','Paint seams','seam'],
  ['Prepare','H','Paint fuzzy skin','fuzzy'],['Prepare','Escape','Deselect all','deselectAll'],['Prepare','V','Toggle printable','togglePrintable'],
  ['Prepare','Arrow keys','Move selection by 10 mm','nudge'],['Prepare','Shift+Arrow keys','Move selection by 1 mm','nudge'],
  ['Prepare','Mod+Arrow keys','Move in camera space by 10 mm','nudge'],['Prepare','Mod+Shift+Arrow keys','Move in camera space by 1 mm','nudge'],
  ['Prepare','0–9','Assign filament; 1 then 0–6 within 500 ms selects 10–16','filamentDigit'],
  ['Prepare','Mod+0–6','Default / top / bottom / front / back / left / right camera','camera']
]);

export function editorShortcut(event,{page='Prepare',editing=false,modal=false}={}){
  if(event.defaultPrevented||event.isComposing||modal||event.altKey)return null;
  const key=String(event.key||'').toLowerCase(),command=Boolean(event.ctrlKey||event.metaKey),shift=Boolean(event.shiftKey);
  if(command){
    if(!shift&&['n','o','i','s','r','g'].includes(key))return{action:{n:'new',o:'openProject',i:'importModels',s:'save',r:'slice',g:'exportGcode'}[key]};
    if(shift&&key==='s')return{action:'saveAs'};
    if(editing||page!=='Prepare')return null;
    if(key==='z')return{action:shift?'redo':'undo'};
    if(key==='a')return shift?null:{action:'selectAll'};
    if(['arrowup','arrowdown','arrowleft','arrowright'].includes(key)){const step=shift?1:10;return{action:'nudge',cameraSpace:true,delta:{arrowup:[0,step,0],arrowdown:[0,-step,0],arrowleft:[-step,0,0],arrowright:[step,0,0]}[key]};}
    if(shift)return null;
    if(['x','c','v','k'].includes(key))return{action:{x:'cutModels',c:'copyModels',v:'pasteModels',k:'cloneModels'}[key]};
    if(key==='y')return{action:'redo'};
    if(key==='d')return{action:'deleteAll'};
    if(/^[0-6]$/.test(key))return{action:'camera',view:['Isometric','Top','Bottom','Front','Back','Left','Right'][Number(key)],...(key==='0'?{bedOnly:true}:{})};
    return null;
  }
  if(editing)return null;
  if(key==='?')return{action:'help'};
  if(page!=='Prepare')return null;
  if(['arrowup','arrowdown','arrowleft','arrowright'].includes(key)){
    const step=shift?1:10;return{action:'nudge',delta:{arrowup:[0,step,0],arrowdown:[0,-step,0],arrowleft:[-step,0,0],arrowright:[step,0,0]}[key]};
  }
  if(shift)return null;
  if(/^[0-9]$/.test(key))return{action:'filamentDigit',digit:Number(key)};
  const action={v:'togglePrintable',delete:'deleteSelection',backspace:'deleteSelection',escape:'deselectAll',m:'move',r:'rotate',s:'scale',f:'placeFace',c:'cut',t:'text',e:'brim',p:'seam',h:'fuzzy'}[key];
  return action?{action}:null;
}

// Native Delete All keeps plate definitions and presets, but discards all
// model objects, generated calibration state and per-plate custom G-code.
export function clearAllSceneObjects(project){
  const next={...project,objects:[],selectedId:null,selectedIds:[],selectionFrame:null,plates:project.plates.map(plate=>{const copy={...plate};delete copy.layerEvents;return copy;})};
  for(const key of ['calibration','calibrationPlan','nativeAssets'])delete next[key];
  return next;
}
