import React, { useEffect, useRef, useState } from 'react';
import './devices.css';

async function request(url, options = {}) {
  const response = await fetch(url, { ...options, headers: { ...(options.body && { 'Content-Type': 'application/json' }), ...options.headers } });
  if (response.status === 204) return null;
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
  return data;
}
const empty = { name: '', type: 'moonraker', url: '', apiKey: '', cameraUrl: '' };
const temperature = value => Number.isFinite(value) ? `${value.toFixed(1)} °C` : 'Unavailable';
function ConfirmAction({ action, device, cancel, confirm, pending }) {
  const ref = useRef();
  useEffect(() => { ref.current.showModal(); }, []);
  return <dialog ref={ref} className="device-confirm" aria-label="Confirm printer action" onCancel={event => { event.preventDefault(); if (!pending) cancel(); }}><h2>{action.title}</h2><p>Printer: <b>{device.name}</b></p><p>{device.url}</p><p>{action.description}</p>{action.job && <dl><dt>File</dt><dd>{action.job.filename}</dd><dt>Printer preset</dt><dd>{action.job.printer}</dd><dt>Process</dt><dd>{action.job.profile}</dd><dt>Filament</dt><dd>{action.job.filament}</dd></dl>}<div><button onClick={cancel} disabled={pending}>Cancel</button><button className="primary" onClick={confirm} disabled={pending}>{pending ? 'Sending…' : action.confirmLabel || 'Confirm action'}</button></div></dialog>;
}
export default function DeviceWorkspace({ currentJob }) {
  const [devices, setDevices] = useState([]), [selectedId, setSelectedId] = useState(''), [status, setStatus] = useState(null);
  const [form, setForm] = useState(null), [keyChanged, setKeyChanged] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false), [pending, setPending] = useState(false), [jobs, setJobs] = useState([]), [jobId, setJobId] = useState(currentJob?.status === 'ready' ? currentJob.id : '');
  const [action, setAction] = useState(null), [pollVersion, setPollVersion] = useState(0), [showCamera, setShowCamera] = useState(false), [cameraError, setCameraError] = useState(false);
  const [distance, setDistance] = useState('10'), [speed, setSpeed] = useState('10'), [targets, setTargets] = useState({ hotend: '0', bed: '0' }), [fan, setFan] = useState('0');
  const generation = useRef(0);
  const device = devices.find(item => item.id === selectedId), job = jobs.find(item => item.id === jobId);
  const supports = capability => status?.capabilities?.includes(capability) === true;
  const enabled = Boolean(status?.ready && !pending), canMove = enabled && !status?.busy;
  useEffect(() => {
    const controller = new AbortController();
    Promise.all([request('/api/devices', { signal: controller.signal }), request('/api/jobs', { signal: controller.signal })]).then(([next, history]) => { if (controller.signal.aborted) return; setDevices(next); setSelectedId(next[0]?.id || ''); setJobs(history.filter(item => item.status === 'ready')); }).catch(problem => { if (!controller.signal.aborted) setError(problem.message); });
    return () => { controller.abort(); generation.current++; };
  }, []);
  useEffect(() => {
    const controller = new AbortController(), current = ++generation.current; let timer;
    setStatus(null); setError(''); setShowCamera(false); setCameraError(false);
    if (!selectedId) return () => controller.abort();
    async function refresh() {
      setLoading(true);
      try { const data = await request(`/api/devices/${selectedId}/status`, { signal: controller.signal }); if (!controller.signal.aborted && current === generation.current) { setStatus(data); setError(''); } }
      catch (problem) { if (!controller.signal.aborted && current === generation.current) { setError(problem.message); setStatus(null); } }
      finally { if (!controller.signal.aborted && current === generation.current) { setLoading(false); timer = setTimeout(refresh, 5000); } }
    }
    refresh(); return () => { controller.abort(); clearTimeout(timer); };
  }, [selectedId, pollVersion]);
  function editConnection(existing) { setForm(existing ? { ...existing, apiKey: '' } : { ...empty }); setKeyChanged(false); setError(''); }
  async function save(event) {
    event.preventDefault(); setPending(true); setError('');
    try {
      const values = { ...form }; if (form.id && !keyChanged) delete values.apiKey;
      const next = await request(`/api/devices${form.id ? `/${form.id}` : ''}`, { method: form.id ? 'PUT' : 'POST', body: JSON.stringify(values) });
      setDevices(items => items.some(item => item.id === next.id) ? items.map(item => item.id === next.id ? next : item) : [...items, next]);
      setSelectedId(next.id); setForm(null); setPollVersion(value => value + 1); setNotice('Printer connection saved.');
    } catch (problem) { setError(problem.message); } finally { setPending(false); }
  }
  async function execute() {
    const target = action; if (!target || !device) return; setPending(true); setError('');
    try {
      if (target.kind === 'delete') {
        await request(`/api/devices/${device.id}`, { method: 'DELETE' }); setDevices(items => items.filter(item => item.id !== device.id)); setSelectedId(''); setNotice('Printer connection removed.');
      } else if (target.kind === 'upload') {
        const result = await request(`/api/devices/${device.id}/upload`, { method: 'POST', body: JSON.stringify({ jobId: target.job.id, print: target.print, confirmed: true }) });
        setNotice(`${result.filename} uploaded to ${device.name}.${result.printRequested ? ' Print start was requested; check the printer status.' : ''}`);
      } else {
        await request(`/api/devices/${device.id}/command`, { method: 'POST', body: JSON.stringify({ ...target.command, confirmed: true }) }); setNotice(`${target.title} sent to ${device.name}.`);
      }
      setAction(null); setPollVersion(value => value + 1);
    } catch (problem) { setAction(null); setError(problem.message); } finally { setPending(false); }
  }
  function command(title, description, values) { setAction({ title, description, command: values }); }
  function upload(print) { if (job) setAction({ kind: 'upload', title: print ? 'Upload and start print' : 'Upload G-code', description: print ? 'Start this job on the selected printer after checking its bed and material.' : 'Copy this completed G-code file to the printer storage.', job, print, confirmLabel: print ? 'Start print' : 'Upload file' }); }
  return <section className="device-workspace"><div className="device-heading"><h2>Device</h2><button onClick={() => editConnection()} disabled={pending}>Add printer</button></div>{error && <p role="alert" className="device-error">{error}</p>}{notice && <p role="status" className="device-notice"><span>{notice}</span><button aria-label="Dismiss device message" onClick={() => setNotice('')}>×</button></p>}
    <div className="device-layout"><aside className="device-connections"><h3>Printers</h3>{devices.map(item => <button key={item.id} className={selectedId === item.id ? 'selected' : ''} onClick={() => { setSelectedId(item.id); setNotice(''); }} disabled={pending}><b>{item.name}</b><span>{item.type === 'moonraker' ? 'Klipper / Moonraker' : 'OctoPrint'}</span></button>)}{!devices.length && <p>Add a Moonraker or OctoPrint connection to monitor and control a printer.</p>}</aside>
    <div className="device-details">{form ? <form className="connection-form" onSubmit={save}><h3>{form.id ? 'Edit printer connection' : 'Add printer connection'}</h3><label>Name<input aria-label="Printer connection name" required maxLength={100} value={form.name} onChange={event => setForm({ ...form, name: event.target.value })}/></label><label>Connector<select aria-label="Printer connector" value={form.type} onChange={event => setForm({ ...form, type: event.target.value })}><option value="moonraker">Klipper / Moonraker</option><option value="octoprint">OctoPrint</option></select></label><label>URL<input aria-label="Printer URL" type="url" required placeholder="http://printer.local" value={form.url} onChange={event => setForm({ ...form, url: event.target.value })}/></label><label>API key<input aria-label="Printer API key" type="password" autoComplete="new-password" value={form.apiKey} placeholder={form.hasApiKey ? 'Stored key retained unless changed' : 'If required by printer'} onChange={event => { setKeyChanged(true); setForm({ ...form, apiKey: event.target.value }); }}/></label>{form.hasApiKey && <label className="inline"><input type="checkbox" checked={keyChanged && form.apiKey === ''} onChange={event => { setKeyChanged(event.target.checked); setForm({ ...form, apiKey: '' }); }}/>Remove stored API key</label>}<label>Camera URL<input aria-label="Camera URL" type="url" placeholder="Optional MJPEG or snapshot URL" value={form.cameraUrl} onChange={event => setForm({ ...form, cameraUrl: event.target.value })}/></label><div><button className="primary" disabled={pending}>Save connection</button><button type="button" disabled={pending} onClick={() => setForm(null)}>Cancel editing</button></div></form> : device ? <>
      <div className="device-title"><div><h3>{device.name}</h3><small>{device.url}</small></div><span data-testid="printer-state">{status?.state || (loading ? 'Connecting…' : 'Unavailable')}</span><button onClick={() => setPollVersion(value => value + 1)} disabled={loading || pending}>Refresh status</button><button onClick={() => editConnection(device)} disabled={pending}>Edit connection</button><button onClick={() => setAction({ kind: 'delete', title: 'Remove printer connection', description: 'Remove this saved connection and its stored API key.', confirmLabel: 'Remove connection' })} disabled={pending}>Remove connection</button></div>
      <div className="device-cards"><section className="device-card"><h3>Current print</h3><p>{status?.filename || 'No active file'}</p>{status?.progress != null && <><progress aria-label="Print progress" max="1" value={status.progress}/><p>{(status.progress * 100).toFixed(1)}%</p></>}<div className="device-buttons"><button disabled={!enabled || !supports('pause') || !status?.printing} onClick={() => command('Pause print', 'Pause the current print.', { action: 'pause' })}>Pause</button><button disabled={!enabled || !supports('resume') || !status?.paused} onClick={() => command('Resume print', 'Resume the paused print.', { action: 'resume' })}>Resume</button><button disabled={!enabled || !supports('cancel') || !status?.busy} onClick={() => command('Cancel print', 'Stop the active print.', { action: 'cancel' })}>Cancel print</button></div></section>
      <section className="device-card"><h3>Send a slicing job</h3><select aria-label="Sliced job to upload" value={jobId} onChange={event => setJobId(event.target.value)}><option value="">Select a completed job</option>{jobs.map(item => <option key={item.id} value={item.id}>{item.filename} · {new Date(item.createdAt).toLocaleString()}</option>)}</select>{job && <p>{job.printer} · {job.profile} · {job.filament}</p>}<div className="device-buttons"><button disabled={!job || pending || !supports('upload')} onClick={() => upload(false)}>Upload only</button><button className="primary" disabled={!job || !canMove || !supports('print')} onClick={() => upload(true)}>Upload and print</button></div></section>
      <section className="device-card"><h3>Temperature</h3>{['hotend','bed'].map(heater => <div className="heater" key={heater}><label>{heater === 'hotend' ? 'Hotend' : 'Bed'} <b data-testid={`${heater}-temperature`}>{temperature(status?.temperature?.[heater]?.actual)}</b><span>Target: {temperature(status?.temperature?.[heater]?.target)}</span><input aria-label={`${heater} target temperature`} type="number" min="0" max={heater === 'bed' ? 150 : 350} value={targets[heater]} onChange={event => setTargets({ ...targets, [heater]: event.target.value })}/></label><button disabled={!enabled || !supports(heater) || targets[heater] === ''} onClick={() => command('Set temperature', `Set ${heater} target to ${targets[heater]} °C.`, { action: 'temperature', heater, target: targets[heater] })}>Set {heater}</button><button disabled={!enabled || !supports(heater)} onClick={() => command('Turn heater off', `Set ${heater} target to 0 °C.`, { action: 'temperature', heater, target: 0 })}>Turn {heater} off</button></div>)}</section>
      <section className="device-card"><h3>Motion</h3><div className="motion-inputs"><label>Distance (mm)<input aria-label="Jog distance" type="number" min="0.1" max="100" step="0.1" value={distance} onChange={event => setDistance(event.target.value)}/></label><label>Speed (mm/s)<input aria-label="Jog speed" type="number" min="0.1" max="100" step="0.1" value={speed} onChange={event => setSpeed(event.target.value)}/></label></div>{['x','y','z'].map(axis => <div className="device-buttons" key={axis}><button disabled={!canMove || !supports('home')} onClick={() => command('Home axis', `Home the ${axis.toUpperCase()} axis.`, { action: 'home', axes: [axis] })}>Home {axis.toUpperCase()}</button>{[-1,1].map(direction => <button key={direction} disabled={!canMove || !supports('jog') || Number(distance) <= 0 || Number(distance) > 100 || !Number.isFinite(Number(distance))} onClick={() => command('Move axis', `Move ${axis.toUpperCase()} by ${direction * Number(distance)} mm at ${speed} mm/s.`, { action: 'jog', axis, distance: direction * Number(distance), speed })}>{axis.toUpperCase()} {direction < 0 ? '−' : '+'}</button>)}</div>)}</section>
      <section className="device-card"><h3>Part cooling fan</h3><p>{supports('fan') ? status?.fan == null ? 'Current speed unavailable' : `Current speed: ${Math.round(status.fan * 100)}%` : 'This connector does not advertise fan control.'}</p><label>Fan percentage<input aria-label="Fan percentage" type="number" min="0" max="100" value={fan} onChange={event => setFan(event.target.value)}/></label><button disabled={!enabled || !supports('fan')} onClick={() => command('Set fan speed', `Set part cooling fan to ${fan}%.`, { action: 'fan', speed: fan })}>Set fan</button></section>
      <section className="device-card"><h3>Camera</h3>{device.cameraUrl ? <><button onClick={() => { setShowCamera(value => !value); setCameraError(false); }}>{showCamera ? 'Hide camera' : 'Show camera'}</button>{showCamera && (cameraError ? <p role="alert">Camera stream could not be loaded. Check its URL and browser access.</p> : <img className="printer-camera" src={device.cameraUrl} alt="Printer camera" onError={() => setCameraError(true)}/>)}</> : <p>Add a camera URL in the connection settings.</p>}</section></div>
    </> : <p className="device-empty">Select or add a printer connection.</p>}</div></div>
    {action && device && <ConfirmAction action={action} device={device} cancel={() => setAction(null)} confirm={execute} pending={pending}/>}
  </section>;
}
