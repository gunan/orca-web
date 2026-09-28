import {hasFacetPainting} from '../shared/facet-correspondence.js';
import React,{useEffect,useMemo,useState} from 'react';
import Modal from './Modal.jsx';
import SceneViewport from './SceneViewport.jsx';
import {bedBounds} from '../shared/geometry.js';
import {addTextToScene,fontAttribution,normalizeTextConfiguration,parseTextFont,textSurfaceAnchor,TEXT_SURFACES} from '../shared/text-geometry.js';
import './text-dialog.css';

const fontCache=new Map();
async function getFont(id,signal){if(fontCache.has(id))return fontCache.get(id);const response=await fetch(`/api/fonts/${encodeURIComponent(id)}`,{signal});if(!response.ok)throw new Error((await response.json()).error||'Cannot load bundled font');const font=parseTextFont(await response.arrayBuffer());if(fontCache.size>=3)fontCache.delete(fontCache.keys().next().value);fontCache.set(id,font);return font;}
export default function TextDialog({objects=[],selectedId,bed,plateId='plate-1',filamentColors,onApply,onClose}){
  const selected=objects.find(object=>object.id===selectedId),editing=Boolean(selected?.text);
  const painted=editing&&hasFacetPainting(selected),[clearPaint,setClearPaint]=useState(false);
  const initial=()=>{if(editing)return normalizeTextConfiguration(selected.text);let placement;try{placement=textSurfaceAnchor(objects,selectedId);}catch{const bounds=bedBounds(bed);placement={anchor:[bounds.center[0],bounds.center[1],bounds.min[2]],normal:[0,0,1]};}return normalizeTextConfiguration({text:'Orca',mode:selected?'emboss':'standalone',...placement});};
  const[config,setConfig]=useState(initial),[fontList,setFontList]=useState([]),[font,setFont]=useState(null),[fontError,setFontError]=useState(''),[pending,setPending]=useState(true),[result,setResult]=useState(null),[error,setError]=useState(''),[surface,setSurface]=useState('Top');
  useEffect(()=>{const controller=new AbortController();fetch('/api/fonts',{signal:controller.signal}).then(async response=>{const data=await response.json();if(!response.ok)throw new Error(data.error||'Cannot load fonts');setFontList(data.fonts);setConfig(current=>({...current,fontId:current.fontId||data.defaultId}));}).catch(cause=>{if(cause.name!=='AbortError')setFontError(cause.message);});return()=>controller.abort();},[]);
  useEffect(()=>{if(!config.fontId)return;const controller=new AbortController();setFont(null);setFontError('');getFont(config.fontId,controller.signal).then(value=>{if(!controller.signal.aborted)setFont(value);}).catch(cause=>{if(cause.name!=='AbortError')setFontError(cause.message);});return()=>controller.abort();},[config.fontId]);
  const signature=JSON.stringify(config);
  useEffect(()=>{setPending(true);setError('');setResult(null);if(!font){setPending(false);return;}const timer=setTimeout(()=>{try{const options={...config,fontName:fontAttribution(font).name};setResult(addTextToScene({objects,selectedId,font,options,plateId,bed}));}catch(cause){setError(cause.message);}finally{setPending(false);}},160);return()=>clearTimeout(timer);},[signature,font,objects,selectedId,plateId,JSON.stringify(bed)]);
  const preview=useMemo(()=>result?.objects.filter(object=>object.plateId===(result.text.plateId||plateId))||objects.filter(object=>object.plateId===plateId),[result,objects,plateId]);
  const attribution=font?fontAttribution(font):null;
  function change(key,value){setConfig(current=>({...current,[key]:value}));}
  function chooseSurface(name){setSurface(name);try{setConfig(current=>({...current,...textSurfaceAnchor(objects,selectedId,name)}));}catch(cause){setError(cause.message);}}
  function chooseMode(mode){setConfig(current=>{if(mode==='standalone'&&!editing){const bounds=bedBounds(bed);return{...current,mode,anchor:[bounds.center[0],bounds.center[1],bounds.min[2]],normal:[0,0,1]};}if(mode!=='standalone'&&!editing){try{return{...current,mode,...textSurfaceAnchor(objects,selectedId,surface)};}catch{}}return{...current,mode};});}
  const number=(label,key,step=.1)=><label>{label}<input aria-label={label} type="number" step={step} value={config[key]} onChange={event=>change(key,event.target.value===''?'':Number(event.target.value))}/></label>;
  return <Modal className="text-dialog" aria-label={editing?'Edit text':'Add text'} onClose={onClose}>
    <header><h2>{editing?'Edit text':'Text / emboss'}</h2><button aria-label="Close text tool" onClick={onClose}>×</button></header>
    <div className="text-tool-layout"><div className="text-controls">
      <label>Text<textarea aria-label="Text content" rows={3} maxLength={512} value={config.text} onChange={event=>change('text',event.target.value)}/></label>
      <label>Bundled font<select aria-label="Text font" value={config.fontId} onChange={event=>change('fontId',event.target.value)}><option value="" disabled>Choose a font</option>{fontList.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label>Operation<select aria-label="Text operation" value={config.mode} onChange={event=>chooseMode(event.target.value)}><option value="standalone">Standalone text</option><option value="emboss">Emboss · add material</option><option value="engrave">Engrave · remove material</option></select></label>
      {!editing&&config.mode!=='standalone'&&<label>Planar surface<select aria-label="Text surface" value={surface} onChange={event=>chooseSurface(event.target.value)}>{Object.keys(TEXT_SURFACES).map(name=><option key={name}>{name}</option>)}</select></label>}
      <div className="text-number-grid">{number('Font size (em mm)','size')}{number('Text depth (mm)','depth')}{config.mode!=='standalone'&&number('Text overlap (mm)','embed')}{number('Character spacing (mm)','charSpacing')}{number('Line spacing','lineSpacing')}{number('Text angle (degrees)','angle',1)}</div>
      <label>Alignment<select aria-label="Text alignment" value={config.align} onChange={event=>change('align',event.target.value)}>{['left','center','right'].map(value=><option key={value}>{value}</option>)}</select></label>
      <fieldset><legend>Text anchor (mm)</legend>{['X','Y','Z'].map((axis,index)=><label key={axis}>{axis}<input aria-label={`Text anchor ${axis}`} type="number" step=".1" value={config.anchor[index]} onChange={event=>change('anchor',config.anchor.map((value,i)=>i===index?(event.target.value===''?'':Number(event.target.value)):value))}/></label>)}</fieldset>
      {editing&&<p>Anchor values use the text's original placement. Object and part transforms remain applied when the text changes.</p>}
      {attribution&&<details><summary>Font attribution and license</summary><p>{attribution.copyright}</p><p>{attribution.license||'See the bundled font license and the font author’s terms.'}</p>{/^https?:\/\//.test(attribution.licenseURL)&&<a href={attribution.licenseURL} target="_blank" rel="noreferrer">Font license</a>}<a href="/api/fonts/license" target="_blank" rel="noreferrer">Bundled license file</a></details>}
    </div><div className="text-preview" aria-label="Text geometry preview"><SceneViewport objects={preview} selectedId={result?.selectedId||null} mode="View" bed={bed} filamentColors={filamentColors} onSelect={()=>{}} onTransform={()=>{}} onPlaceFace={()=>{}}/></div></div>
    {fontError||error?<p role="alert">{fontError||error}</p>:pending||!font?<p role="status">Generating text geometry…</p>:result?<p role="status">{result.text.positions.length/9} triangles · closed text surfaces · {result.text.native.partType==='negative_part'?'negative volume':'normal part'}</p>:null}
    {painted&&<label className="paint-loss-consent"><input aria-label="Clear painting from regenerated text" type="checkbox" checked={clearPaint} onChange={event=>setClearPaint(event.target.checked)}/>Regenerating text changes its triangles and clears support, seam, color and fuzzy painting on this text part. Clear this painting and update the text.</label>}
    <footer><p>This saved text uses the earlier planar text format. New text uses the native geometry helper.</p><button onClick={onClose}>Cancel text</button><button disabled={pending||!result||!!fontError||painted&&!clearPaint} onClick={()=>{onApply(result);onClose();}}>{editing?'Update text':'Add text'}</button></footer>
  </Modal>;
}
