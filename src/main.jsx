import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

const accepted = ['stl', 'obj', '3mf'];

function App() {
  const [profiles, setProfiles] = useState([]);
  const [profile, setProfile] = useState('balanced');
  const [file, setFile] = useState(null);
  const [error, setError] = useState('');
  const [job, setJob] = useState(null);

  useEffect(() => { fetch('/api/profiles').then(r => r.json()).then(setProfiles).catch(() => setError('Could not reach the slicing server.')); }, []);
  useEffect(() => {
    if (!job || !['queued', 'slicing'].includes(job.status)) return;
    const timer = setTimeout(async () => {
      try { setJob(await (await fetch(`/api/jobs/${job.id}`)).json()); }
      catch { setError('Lost connection while slicing. Reconnect and try again.'); }
    }, 600);
    return () => clearTimeout(timer);
  }, [job]);

  function chooseFile(event) {
    const next = event.target.files[0];
    setJob(null);
    if (!next) return setFile(null);
    if (!accepted.includes(next.name.split('.').pop()?.toLowerCase())) {
      event.target.value = '';
      setFile(null);
      return setError('Choose an STL, OBJ, or 3MF model.');
    }
    setError(''); setFile(next);
  }

  async function submit(event) {
    event.preventDefault();
    if (!file) return setError('Choose a model before slicing.');
    setError('');
    const body = new FormData(); body.set('model', file); body.set('profile', profile);
    try {
      const response = await fetch('/api/jobs', { method: 'POST', body });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setJob(result);
    } catch (cause) { setError(cause.message || 'Could not start slicing.'); }
  }

  const busy = job && ['queued', 'slicing'].includes(job.status);
  return <div className="shell">
    <header><a className="brand" href="/" aria-label="Orca Web home"><span className="mark">O</span><span>ORCA <b>WEB</b></span></a><span className="server"><i /> SLICER ONLINE</span></header>
    <main>
      <section className="intro">
        <p className="eyebrow">SELF-HOSTED · NATIVE ORCASLICER ENGINE</p>
        <h1>Your slicer.<br/><em>Anywhere.</em></h1>
        <p className="lede">Turn your 3D models into print-ready G-code with the engine you trust—without a remote desktop.</p>
        <div className="steps"><span className={!job ? 'active' : ''}>01 <b>MODEL</b></span><hr/><span className={busy ? 'active' : ''}>02 <b>SLICE</b></span><hr/><span className={job?.status === 'ready' ? 'active' : ''}>03 <b>PRINT</b></span></div>
      </section>
      <section className="panel" aria-label="Slice a model">
        <form onSubmit={submit}>
          <label className={`drop ${file ? 'filled' : ''}`}>
            <input aria-label="Choose a 3D model" type="file" accept=".stl,.obj,.3mf" onChange={chooseFile}/>
            <span className="cube">{file ? '✓' : '⬡'}</span>
            {file ? <><strong>{file.name}</strong><small>{(file.size / 1024).toFixed(1)} KB · READY TO SLICE</small></> : <><strong>Drop your model here</strong><small>STL, OBJ, OR 3MF · UP TO 500 MB</small><span className="browse">BROWSE FILES</span></>}
          </label>
          <fieldset><legend>PRINT PROFILE</legend><div className="profiles">
            {profiles.map(item => <label key={item.id} className={profile === item.id ? 'selected' : ''}><input type="radio" name="profile" value={item.id} checked={profile === item.id} onChange={() => setProfile(item.id)}/><span><b>{item.name}</b><small>{item.description}</small></span><strong>{item.layerHeight}</strong></label>)}
          </div></fieldset>
          {error && <p className="error" role="alert">{error}</p>}
          {job?.status === 'failed' && <p className="error" role="alert">Slicing failed: {job.error}</p>}
          {busy && <div className="progress" aria-live="polite"><span/><p><b>Slicing your model…</b><small>OrcaSlicer is preparing the toolpaths</small></p></div>}
          {job?.status === 'ready' && <div className="success" aria-live="polite"><span>✓</span><p><b>Ready to print</b><small>Your G-code was generated successfully</small></p><a href={`/api/jobs/${job.id}/download`}>Download G-code</a></div>}
          <button className="slice" disabled={!file || busy} type="submit">{busy ? 'SLICING…' : 'SLICE MODEL'} <span>→</span></button>
        </form>
      </section>
    </main>
    <footer><span>YOUR FILES STAY ON YOUR SERVER</span><span>POWERED BY ORCASLICER</span></footer>
  </div>;
}

createRoot(document.getElementById('root')).render(<App/>);
