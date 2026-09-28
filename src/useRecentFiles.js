import {useEffect,useRef,useState} from 'react';
import {createRecentFileStore} from './recent-file-store.js';
import {RECENT_DEFAULTS} from '../shared/recent-files.js';
export function useRecentFiles(){
 const store=useRef(null);if(!store.current)store.current=createRecentFileStore();
 const [state,setState]=useState({rows:[],invalid:[],preferences:{...RECENT_DEFAULTS},loading:true,error:''});
 const alive=useRef(false),revision=useRef(0),queue=useRef(Promise.resolve()),channel=useRef(null);
 async function refresh(){const token=++revision.current;try{const next=await store.current.list();if(alive.current&&token===revision.current)setState({...next,loading:false,error:next.invalid.length?'Some damaged recent-file entries were hidden. Clear all to remove them.':''});}catch(error){if(alive.current&&token===revision.current)setState(value=>({...value,loading:false,error:`Recent files are unavailable: ${error.message}`}));}}
 useEffect(()=>{alive.current=true;refresh();const focus=()=>refresh();window.addEventListener('focus',focus);window.addEventListener('pageshow',focus);if(typeof BroadcastChannel==='function'){channel.current=new BroadcastChannel('orca-web:recent-files');channel.current.onmessage=focus;}return()=>{alive.current=false;revision.current++;window.removeEventListener('focus',focus);window.removeEventListener('pageshow',focus);channel.current?.close();channel.current=null;};},[]);
 function write(action){const task=queue.current.then(action).then(async value=>{channel.current?.postMessage('changed');await refresh();return value;});queue.current=task.catch(()=>{});return task;}
 function report(error){if(alive.current)setState(value=>({...value,error:`Recent files could not be updated: ${error.message}`}));}
 return{...state,refresh,
  record(file,kind,thumbnail=''){write(()=>store.current.record(file,kind,thumbnail)).catch(report);},
  async configure(value){try{await write(()=>store.current.configure(value));return '';}catch(error){report(error);return 'Recent-file preferences could not be saved. The previous limit and files are unchanged.';}},
  async remove(id){try{await write(()=>store.current.remove(id));}catch(error){report(error);}},
  async clear(){try{await write(()=>store.current.clear());}catch(error){report(error);}},
  async file(id){await queue.current;return store.current.file(id);}
 };
}
