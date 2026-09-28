import React,{useEffect,useMemo,useRef,useState} from 'react';
import {AUXILIARY_GROUPS,AUXILIARY_LIMITS,addAttachments,attachmentInfo,attachmentImageSource,decodeAttachment,removeProjectAttachment,renameProjectAttachment} from '../shared/native-auxiliary.js';
import {applyNativeCover} from '../shared/native-cover.js';
import './project-attachments.css';
function Picture({file}){const source=useMemo(()=>attachmentImageSource(file),[file]);return source?<img className="attachment-picture" src={source.url} alt={attachmentInfo(file).name} width={source.width} height={source.height}/>:null;}

export default function ProjectAttachments({project,update}){
  const [group,setGroup]=useState('Model Pictures'),[error,setError]=useState(''),[busy,setBusy]=useState(false),[renaming,setRenaming]=useState(null),[name,setName]=useState('');
  const input=useRef(),generation=useRef(0),latest=useRef(project),coverRequest=useRef();latest.current=project;
  const [coverCapability,setCoverCapability]=useState({available:false,reason:'Checking cover generation…'}),[coverBusy,setCoverBusy]=useState(null);
  useEffect(()=>{const controller=new AbortController();fetch('/api/project-images/capabilities',{signal:controller.signal}).then(response=>{if(!response.ok)throw new Error('Native cover generation is unavailable.');return response.json();}).then(setCoverCapability).catch(cause=>{if(!controller.signal.aborted)setCoverCapability({available:false,reason:cause.message});});return()=>{generation.current++;controller.abort();coverRequest.current?.abort();};},[]);
  async function setCover(file){
    if(coverRequest.current)return;const initial=latest.current,controller=new AbortController();coverRequest.current=controller;setCoverBusy(file.path);setError('');
    try{
      const response=await fetch('/api/project-images/cover',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:attachmentInfo(file).name,data:file.data}),signal:controller.signal}),result=await response.json();
      if(!response.ok)throw new Error(result.error||'Native cover generation failed.');
      if(controller.signal.aborted)return;
      if(latest.current!==initial)throw new Error('The project changed while generating the cover. Set the cover again.');
      const next=applyNativeCover(initial,file.path,result);update(current=>current===initial?next:current);
    }catch(cause){if(!controller.signal.aborted)setError(cause.message);}finally{if(coverRequest.current===controller){coverRequest.current=null;if(!controller.signal.aborted)setCoverBusy(null);}}
  }
  function cancelCover(){coverRequest.current?.abort();coverRequest.current=null;setCoverBusy(null);}

  const files=project.nativeAuxiliary?.files||[],otherGroups=[...new Set(files.map(file=>attachmentInfo(file).group))].filter(value=>!Object.hasOwn(AUXILIARY_GROUPS,value));
  async function add(selected){
    if(!selected.length)return;const initial=latest.current,token=++generation.current;setBusy(true);setError('');
    try{
      if([...selected].some(file=>file.size>AUXILIARY_LIMITS.file)||[...selected].reduce((n,file)=>n+file.size,0)>AUXILIARY_LIMITS.total)throw new Error('Attachments are limited to 32 MiB each and 64 MiB total.');
      const incoming=await Promise.all([...selected].map(async file=>({name:file.name,bytes:new Uint8Array(await file.arrayBuffer())})));
      if(token!==generation.current)return;
      // An open/new/undo action must not attach asynchronously read files to a
      // different document. The user can retry after the document changes.
      if(latest.current!==initial)throw new Error('The project changed while reading attachments. Add the files again.');
      const next=addAttachments(initial.nativeAuxiliary,group,incoming);update(current=>({...current,nativeAuxiliary:next}));
    }catch(cause){if(token===generation.current)setError(cause.message);}finally{if(token===generation.current)setBusy(false);}
  }
  function change(operation){try{const initial=latest.current,next=operation(initial);update(current=>current===initial?next:current);setError('');return true;}catch(cause){setError(cause.message);return false;}}
  function download(file){const url=URL.createObjectURL(new Blob([decodeAttachment(file.data)],{type:'application/octet-stream'})),link=document.createElement('a');link.href=url;link.download=attachmentInfo(file).name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  return <section className="project-attachments" aria-label="Project attachments">
    <h3>Project files</h3>
    <div className="attachment-tabs" role="tablist" aria-label="Attachment categories">{[...Object.keys(AUXILIARY_GROUPS),...otherGroups].map(value=><button key={value} role="tab" aria-selected={group===value} onClick={()=>{setGroup(value);setRenaming(null);}}>{value}<small>{files.filter(file=>attachmentInfo(file).group===value).length}</small></button>)}</div>
    <div role="tabpanel" aria-label={group}>
      {Object.hasOwn(AUXILIARY_GROUPS,group)&&<><input type="file" ref={input} hidden multiple aria-label={`Add ${group} files`} accept={AUXILIARY_GROUPS[group].map(ext=>'.'+ext).join(',')} onChange={event=>{add(event.target.files);event.target.value='';}}/><button disabled={busy} onClick={()=>input.current.click()}>{busy?'Reading files…':'Add files'}</button></>}
      {error&&<p role="alert">{error}</p>}
      {group==='Model Pictures'&&!coverCapability.available&&<p className="attachment-hint" role="status">{coverCapability.reason}</p>}
      {coverBusy&&<p role="status">Generating project cover… <button onClick={cancelCover}>Cancel cover generation</button></p>}
      <ul className="attachment-list">{files.filter(file=>attachmentInfo(file).group===group).map(file=>{const info=attachmentInfo(file);return <li key={file.path}><Picture file={file}/>
        {renaming===file.path?<form onSubmit={event=>{event.preventDefault();if(change(value=>renameProjectAttachment(value,file.path,name)))setRenaming(null);}}><label>File name<input value={name} onChange={event=>setName(event.target.value)} autoFocus/></label><button type="submit">Save name</button><button type="button" onClick={()=>setRenaming(null)}>Cancel rename</button></form>:<><span><b>{info.name}</b><small>{info.size.toLocaleString()} bytes{Object.values(project.nativeAuxiliary?.covers||{}).includes(file.path)||file.path===`Auxiliaries/Model Pictures/${project.nativeModelMetadata?.DesignerCover}`?' · Project cover':''}</small></span>{info.group==='Model Pictures'&&attachmentImageSource(file)&&<button disabled={!coverCapability.available||Boolean(coverBusy)} title={!coverCapability.available?coverCapability.reason:undefined} aria-label={`Set ${info.name} as cover`} onClick={()=>setCover(file)}>Set as cover</button>}<button onClick={()=>download(file)} aria-label={`Download ${info.name}`}>Download</button><button onClick={()=>{setRenaming(file.path);setName(info.name);}} aria-label={`Rename ${info.name}`}>Rename</button><button onClick={()=>change(value=>removeProjectAttachment(value,file.path))} aria-label={`Delete ${info.name}`}>Delete</button></>}
      </li>;})}</ul>
      {!files.some(file=>attachmentInfo(file).group===group)&&<p>No files in this category.</p>}
    </div>
    <p className="attachment-hint">Files travel with the saved web project and native 3MF export. Limit: 32 MiB per file, 64 MiB total.</p>
  </section>;
}
