import React,{useMemo,useRef,useState} from 'react';
import NativeIcon from './NativeIcon.jsx';
import {nativeObjectTree,nativeTreeNodeSelected,nativeTreeHasVisible} from '../shared/native-object-tree.js';
import './native-object-tree.css';

export default function NativeObjectTree({project,filamentCount=1,globalSettings={},onSelect,onPrintable,onReset,onSettings,onPainting,onVariableLayers,onVisibility}){
 const roots=useMemo(()=>nativeObjectTree(project,{filamentCount,globalSettings}),[project.objects,project.plates,filamentCount,globalSettings]);
 const [closed,setClosed]=useState(new Set()),[focused,setFocused]=useState(null),[context,setContext]=useState(null),anchor=useRef(null),tree=useRef(null);
 const visible=[];function collect(nodes,depth=1,parent=null){for(const node of nodes){visible.push({node,depth,parent});if(!closed.has(node.id))collect(node.children,depth+1,node.id);}}collect(roots);
 function toggle(node,expand){setClosed(before=>{const next=new Set(before);if(expand??next.has(node.id))next.delete(node.id);else next.add(node.id);return next;});}
 function select(node,event={}){
  const toggleKey=event.ctrlKey||event.metaKey,kind=node.kind==='volume'?'part':'object';
  let range;
  if(event.shiftKey&&anchor.current){const from=visible.findIndex(row=>row.node.id===anchor.current),to=visible.findIndex(row=>row.node.id===node.id);if(from>=0)range=visible.slice(Math.min(from,to),Math.max(from,to)+1).map(row=>row.node).filter(item=>(item.kind==='volume'?'part':'object')===kind&&['object','instance','volume'].includes(item.kind)&&item.plateId===node.plateId);}
  onSelect(node,{mode:toggleKey?'toggle':'replace',range});if(!event.shiftKey)anchor.current=node.id;setFocused(node.id);setContext(null);
 }
 function focus(id){setFocused(id);requestAnimationFrame(()=>tree.current?.querySelector(`[data-tree-id="${CSS.escape(id)}"]`)?.focus());}
 function key(event,row,index){
  const navigation=['ArrowDown','ArrowUp','Home','End','ArrowLeft','ArrowRight'];
  if(event.target!==event.currentTarget&&!navigation.includes(event.key))return;
  if([...navigation,'Enter',' ','Escape'].includes(event.key))event.stopPropagation();
  const {node,parent}=row;
  if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){event.preventDefault();const n=event.key==='Home'?0:event.key==='End'?visible.length-1:Math.min(visible.length-1,Math.max(0,index+(event.key==='ArrowDown'?1:-1)));focus(visible[n].node.id);}
  else if(event.key==='ArrowRight'){event.preventDefault();if(node.children.length&&closed.has(node.id))toggle(node,true);else if(node.children.length)focus(node.children[0].id);}
  else if(event.key==='ArrowLeft'){event.preventDefault();if(node.children.length&&!closed.has(node.id))toggle(node,false);else if(parent)focus(parent);}
  else if(event.key==='Enter'||event.key===' '){event.preventDefault();select(node,event);}
  else if(event.key==='Escape')setContext(null);
  else if(event.key==='ContextMenu'||event.key==='F10'&&event.shiftKey){event.preventDefault();select(node);setContext(node.id);}
 }
 const focusId=visible.some(row=>row.node.id===focused)?focused:visible[0]?.node.id;
 return <><div role="tree" aria-label="Native object hierarchy" aria-multiselectable="true" ref={tree} className="native-object-tree">{visible.map((row,index)=>{
  const {node,depth}=row,selected=nativeTreeNodeSelected(project,node),editable=['object','volume','layer','layers'].includes(node.kind)&&!['negative_part','support_enforcer','support_blocker'].includes(node.role),printable=typeof node.printable==='boolean';
  return <div key={node.id} role="treeitem" aria-label={node.label} aria-level={depth} aria-expanded={node.children.length? !closed.has(node.id):undefined} aria-selected={selected} tabIndex={focusId===node.id?0:-1} data-tree-id={node.id} data-tree-kind={node.kind} data-object-id={node.objectId} data-plate-id={node.plateId} onClick={event=>{if(event.target===event.currentTarget)select(node,event);}} onFocus={()=>setFocused(node.id)} onKeyDown={event=>key(event,row,index)} onContextMenu={event=>{event.preventDefault();select(node,event);if(editable||['object','volume','instance','connectors'].includes(node.kind))setContext(node.id);}} className={`native-tree-row ${['object','volume','instance'].includes(node.kind)?'scene-object-row ':''}${selected?'selected ':''}${node.kind==='plate'&&node.plateId===project.activePlateId?'active-plate':''}`} style={{'--tree-depth':depth-1}}>
   <button className="tree-disclosure" aria-label={`${closed.has(node.id)?'Expand':'Collapse'} ${node.label}`} disabled={!node.children.length} onClick={()=>toggle(node)}>{node.children.length?(closed.has(node.id)?'▸':'▾'):''}</button>
   <button className="tree-label" aria-pressed={selected} onClick={event=>select(node,event)} onDoubleClick={()=>editable&&onSettings(node)} title={node.kind==='instance'?`${node.label} · assigned Plate ${node.plateNumber}`:node.label}>{node.icon&&<NativeIcon name={node.icon}/>}<span>{node.label}</span></button>
   {node.kind==='instance'&&<small className="tree-plate-badge" title="Saved plate assignment">P{node.plateNumber||'—'}</small>}
   {printable&&<button className="tree-action tree-printable" role="checkbox" aria-label={`Printable ${node.label}`} aria-checked={node.printable} title={node.printable?'Exclude from printing':'Include in printing'} onClick={()=>onPrintable(node,!node.printable)}><NativeIcon name={node.printable?'check_on':'check_off_focused'}/></button>}
   {node.filament!=null&&<small className="tree-filament" title={node.filament==='default'?'Inherit part filament':`Filament ${node.filament||'inherited'}`}>{node.filament==='default'?'D':node.filament||'D'}</small>}
   {node.variableHeight&&<button className="tree-action" aria-label={`Variable layer height for ${node.label}`} onClick={()=>onVariableLayers(node)}><NativeIcon name="obj_variable_layer_height"/></button>}
   {node.supportPaint&&<button className="tree-action" aria-label={`Support painting for ${node.label}`} onClick={()=>onPainting(node,'supports')}><NativeIcon name="objlist_support_painting"/></button>}
   {node.colorPaint&&<button className="tree-action" aria-label={`Color painting for ${node.label}`} onClick={()=>onPainting(node,'color')}><NativeIcon name="objlist_color_painting"/></button>}
   {!!node.categories?.length&&<button className="tree-action" aria-label={`Reset settings for ${node.label}`} title={`Reset ${node.categories.join(', ')} overrides`} onClick={()=>onReset(node)}><NativeIcon name="lock_normal"/></button>}
   {editable&&<button className="tree-action tree-more" aria-label={`Settings for ${node.label}`} onClick={()=>onSettings(node)}>⋯</button>}
   {context===node.id&&<div className="tree-context" role="menu" aria-label={`Actions for ${node.label}`}>{['object','volume','instance','connectors'].includes(node.kind)&&<button role="menuitem" onClick={()=>{setContext(null);onVisibility(node,!nativeTreeHasVisible(project,node));}}>{nativeTreeHasVisible(project,node)?'Hide':'Show'}</button>}{editable&&<><button role="menuitem" onClick={()=>{setContext(null);onSettings(node);}}>Edit {node.kind==='volume'?'part':node.kind==='layer'||node.kind==='layers'?'height range':'object'} settings</button><button role="menuitem" disabled={!node.categories?.length} onClick={()=>{setContext(null);onReset(node);}}>Reset settings</button></>}</div>}
  </div>;
 })}</div>{!project.objects.length&&<p>Empty plate</p>}<p className="tree-scope-note">Plate rows follow saved assignments. Selecting an object includes its instances on the active plate.</p></>;
}
