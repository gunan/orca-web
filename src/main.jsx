import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

const accepted = ['stl', 'obj', '3mf'];
const tools = ['Select', 'Move', 'Rotate', 'Scale', 'Place on face', 'Cut', 'Paint supports'];
const settingGroups = {
  Quality: [['Layer height', 'layer_height', '0.20', 'mm'], ['First layer height', 'initial_layer_print_height', '0.20', 'mm'], ['Seam position', 'seam_position', 'Aligned', ''], ['Wall generator', 'wall_generator', 'Arachne', '']],
  Strength: [['Wall loops', 'wall_loops', '3', ''], ['Top shell layers', 'top_shell_layers', '5', ''], ['Bottom shell layers', 'bottom_shell_layers', '4', ''], ['Sparse infill density', 'sparse_infill_density', '15', '%'], ['Sparse infill pattern', 'sparse_infill_pattern', 'Gyroid', '']],
  Speed: [['Outer wall', 'outer_wall_speed', '80', 'mm/s'], ['Inner wall', 'inner_wall_speed', '150', 'mm/s'], ['Sparse infill', 'sparse_infill_speed', '180', 'mm/s'], ['Travel speed', 'travel_speed', '500', 'mm/s']],
  Support: [['Enable support', 'enable_support', false, 'toggle'], ['Type', 'support_type', 'Normal (auto)', ''], ['Threshold angle', 'support_threshold_angle', '30', '°']],
  Others: [['Brim type', 'brim_type', 'Auto', ''], ['Brim width', 'brim_width', '5', 'mm'], ['Enable ironing', 'ironing', false, 'toggle']]
};

function Icon({ children }) { return <span className="icon" aria-hidden="true">{children}</span>; }
function ModelCanvas({ file, view, onDrop }) {
  const input = useRef();
  return <section className={`viewport ${file ? 'has-model' : ''}`} onDragOver={e => e.preventDefault()} onDrop={onDrop}>
    <div className="view-cube"><b>TOP</b><span>FRONT</span></div>
    <div className="camera-tools"><button title="Home view">⌂</button><button title="Zoom to selection">⊙</button><button title="Orthographic view">◇</button></div>
    <div className="build-volume"><div className="plate-grid"/><div className="axis"><i className="x">X</i><i className="y">Y</i><i className="z">Z</i></div>
      {file ? <div className={`model-object ${view}`}><div className="model-top"/><div className="model-front"/><div className="model-side"/><span>Selected model</span></div> : null}
    </div>
    {!file && <div className="empty-state"><div className="empty-cube">⬡</div><h2>Drop a model onto the plate</h2><p>STL, STEP, 3MF, OBJ, AMF or SVG</p><button onClick={() => input.current.click()}>Open File</button><input ref={input} aria-label="Choose a 3D model" hidden type="file" accept=".stl,.obj,.3mf" onChange={e => onDrop({ dataTransfer: { files: e.target.files }, preventDefault(){} })}/></div>}
    <div className="plate-label"><span>1</span> Smooth PEI Plate <b>256 × 256 mm</b></div>
  </section>;
}

function Settings({ values, setValues }) {
  const [tab, setTab] = useState('Quality');
  const [search, setSearch] = useState('');
  const rows = (settingGroups[tab] || []).filter(r => r[0].toLowerCase().includes(search.toLowerCase()));
  return <aside className="settings">
    <div className="preset-head"><b>Process</b><select aria-label="Process preset"><option>0.20mm Standard @BBL X1C</option><option>0.12mm Fine @BBL X1C</option><option>0.28mm Extra Draft @BBL X1C</option></select><button title="Save preset">▣</button></div>
    <div className="mode-row"><div><button>Global</button><button className="on">Objects</button></div><span>Advanced <input type="checkbox" defaultChecked/></span></div>
    <label className="search"><span>⌕</span><input aria-label="Search settings" placeholder="Search settings" value={search} onChange={e => setSearch(e.target.value)}/><kbd>⌘K</kbd></label>
    <div className="setting-tabs">{Object.keys(settingGroups).map(x => <button className={tab === x ? 'active' : ''} onClick={() => setTab(x)} key={x}>{x}</button>)}</div>
    <div className="setting-list">{rows.map(([label,key,initial,unit]) => <label key={key}><span>{label}</span>{unit === 'toggle' ? <input type="checkbox" checked={Boolean(values[key] ?? initial)} onChange={e => setValues(v => ({...v,[key]:e.target.checked}))}/> : <span className="value"><input value={values[key] ?? initial} onChange={e => setValues(v => ({...v,[key]:e.target.value}))}/><em>{unit}</em></span>}</label>)}</div>
    <div className="settings-foot"><button>↶ Reset</button><button>Compare presets</button></div>
  </aside>;
}

function App() {
  const [profiles, setProfiles] = useState([]), [profile, setProfile] = useState('balanced');
  const [file, setFile] = useState(null), [error, setError] = useState(''), [job, setJob] = useState(null);
  const [page, setPage] = useState('Prepare'), [tool, setTool] = useState('Select'), [view, setView] = useState('solid');
  const [settings, setSettings] = useState({}), [filament, setFilament] = useState('Generic PLA'), [printer, setPrinter] = useState('Bambu Lab X1 Carbon 0.4 nozzle');
  useEffect(() => { fetch('/api/profiles').then(r => r.json()).then(setProfiles).catch(() => setError('Could not reach the slicing server.')); }, []);
  useEffect(() => { if (!job || !['queued','slicing'].includes(job.status)) return; const timer=setTimeout(async()=>{try{setJob(await (await fetch(`/api/jobs/${job.id}`)).json())}catch{setError('Lost connection while slicing.')}},600); return()=>clearTimeout(timer)},[job]);
  function choose(next) { setJob(null); if (!next) return setFile(null); if (!accepted.includes(next.name.split('.').pop()?.toLowerCase())) return setError('Choose an STL, OBJ, or 3MF model.'); setError(''); setFile(next); }
  function drop(e){e.preventDefault(); choose(e.dataTransfer.files[0])}
  async function submit(){ if(!file)return setError('Choose a model before slicing.'); setError(''); const body=new FormData(); body.set('model',file); body.set('profile',profile); body.set('printer',printer); body.set('filament',filament); body.set('settings',JSON.stringify(settings)); try{const r=await fetch('/api/jobs',{method:'POST',body});const x=await r.json();if(!r.ok)throw new Error(x.error);setJob(x);setPage('Preview')}catch(e){setError(e.message||'Could not start slicing.')} }
  const busy=job&&['queued','slicing'].includes(job.status); const currentProfile=useMemo(()=>profiles.find(x=>x.id===profile),[profiles,profile]);
  return <div className="app"><h1 className="sr-only">Your slicer. Anywhere.</h1>
    <header className="titlebar"><a className="brand" href="/"><span className="orca-mark">◒</span><b>OrcaSlicer</b><small>WEB</small></a><nav>{['Prepare','Preview','Device','Project'].map(x=><button key={x} className={page===x?'active':''} onClick={()=>setPage(x)}>{x}</button>)}</nav><div className="head-actions"><button title="Settings">⚙</button><button title="Notifications">♢</button><span className="online"><i/> Online</span><button className="account">A</button></div></header>
    <div className="menubar"><span>File</span><span>Edit</span><span>View</span><span>Help</span><i/><b>{file ? file.name.replace(/\.[^.]+$/,'') : 'Untitled'}</b><small>{file ? '• Modified' : 'Ready'}</small></div>
    <div className="presetbar"><label>Printer<select value={printer} onChange={e=>setPrinter(e.target.value)}><option>Bambu Lab X1 Carbon 0.4 nozzle</option><option>Generic Klipper 0.4 nozzle</option><option>Prusa MK4 0.4 nozzle</option></select></label><label>Filament<select value={filament} onChange={e=>setFilament(e.target.value)}><option>Generic PLA</option><option>Generic PETG</option><option>Generic ABS</option></select></label><div className="filament-chip"><i/> 1&nbsp; {filament}</div><button className="plus">＋</button><div className="spacer"/><button>▦ Calibration</button><button>⌁ Wi-Fi</button></div>
    <div className="workspace">
      <aside className="objects"><div className="side-title"><b>Objects</b><button>＋</button><button>⋯</button></div><div className="object-tree"><div className="plate-row"><span>▾　▱</span><b>Plate 1</b><small>256 × 256</small></div>{file?<div className="object-row selected"><span>◇</span><div><b>{file.name}</b><small>1 object · {(file.size/1024).toFixed(1)} KB</small></div><i>◉</i></div>:<p>No objects on this plate</p>}</div><div className="plates"><div><b>Plates</b><span>1 / 1</span></div><button className="plate-card active"><i>1</i><span>{file?'1 object':'Empty plate'}</span><b>▦</b></button><button className="add-plate">＋ Add plate</button></div></aside>
      <div className="center"><div className="toolbar">{tools.map((x,i)=><button className={tool===x?'active':''} onClick={()=>setTool(x)} title={x} key={x}><Icon>{['⌖','✣','↻','⌗','◩','✂','♨'][i]}</Icon><small>{x}</small></button>)}<i/><button onClick={()=>setView(view==='solid'?'wire':'solid')} title="Toggle wireframe"><Icon>▧</Icon><small>View</small></button></div><ModelCanvas file={file} view={view} onDrop={drop}/><div className="statusbar"><span><i className="green"/> Ready</span><span>Objects: {file?1:0}</span><span>Triangles: {file?'12':'0'}</span><span className="grow"/><span>100%</span><span>Perspective</span></div></div>
      <Settings values={settings} setValues={setSettings}/>
    </div>
    <footer className="actionbar"><div className="estimate">{job?.status==='ready'?<><b>✓ Ready to print</b><span>G-code generated successfully</span></>:<><b>{file?'Model ready':'No model loaded'}</b><span>{currentProfile?.name||'Standard'} · {currentProfile?.layerHeight||'0.20 mm'} layer</span></>}</div>{error&&<p role="alert" className="error">{error}</p>}{job?.status==='failed'&&<p role="alert" className="error">{job.error}</p>}{job?.status==='ready'&&<a className="download" href={`/api/jobs/${job.id}/download`}>↓ Download G-code</a>}<select aria-label="Print profile" value={profile} onChange={e=>setProfile(e.target.value)}>{profiles.map(x=><option value={x.id} key={x.id}>{x.name} · {x.layerHeight}</option>)}</select><button aria-label="Slice model" className="slice" disabled={!file||busy} onClick={submit}>{busy?<><i className="spinner"/> Slicing…</>:'Slice plate'} <span>▸</span></button></footer>
  </div>;
}
createRoot(document.getElementById('root')).render(<App/>);
