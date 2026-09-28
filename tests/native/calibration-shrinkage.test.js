import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createApp,defaultBinary} from '../../server/app.js';
import {exportSTL} from '../../shared/geometry.js';

async function serverFor(t){
  const dataDir=await mkdtemp(path.join(tmpdir(),'orca-calib-shrink-')),app=await createApp({dataDir,binary:process.env.ORCA_SLICER_BIN||defaultBinary}),server=app.listen(0,'127.0.0.1');
  await new Promise(resolve=>server.once('listening',resolve));t.after(async()=>{await app.locals.shutdown();await new Promise(resolve=>server.close(resolve));await rm(dataDir,{recursive:true,force:true});});
  const base=`http://127.0.0.1:${server.address().port}`,get=async route=>(await fetch(base+route)).json(),post=async(route,body)=>{const response=await fetch(base+route,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}),data=await response.json();assert.ok(response.ok,JSON.stringify(data));return data;};
  assert.equal((await get('/api/health')).engine.version,'OrcaSlicer-2.4.2');const {defaults}=await get('/api/presets');
  const custom=await post('/api/presets/custom',{type:'filament',name:'Native calibration shrinkage 98',baseId:defaults.filamentId,compatiblePrinterIds:[defaults.printerId],settings:{filament_shrink:[98],filament_shrinkage_compensation_z:[98]}}),ids={...defaults,filamentId:custom.id};
  return{app,base,get,post,ids,dataDir,async ready(id){await app.locals.waitForIdle();const result=await get(`/api/jobs/${id}`);assert.equal(result.status,'ready',result.error);assert.equal(result.shrinkageInitialization.method,'native-two-apply');const response=await fetch(`${base}/api/jobs/${id}/download`);assert.equal(response.status,200);return{result,code:await response.text()};}};
}
for(const request of [{mode:'temperature',start:230,end:225,step:5},{mode:'pressure-advance',start:0,end:.02,step:.002}])test(`native shrinkage ${request.mode} calibration schedules the actual compensated layers`,{timeout:120000},async t=>{
  const api=await serverFor(t),prepared=await api.post('/api/calibrations/prepare',{...api.ids,...request}),form=new FormData();
  for(const [key,value]of Object.entries(api.ids))form.set(key,value);form.set('model',new Blob([exportSTL(prepared.objects)]),'calibration.stl');form.set('calibration',JSON.stringify(prepared.calibration));form.set('preservePosition','true');form.set('settings','{}');
  const response=await fetch(`${api.base}/api/jobs`,{method:'POST',body:form}),job=await response.json();assert.equal(response.status,202,JSON.stringify(job));const{result,code}=await api.ready(job.id);
  const zs=[...code.matchAll(/^;Z:([\d.]+)/gm)].map(match=>Number(match[1])),commands=code.split('\n').filter(line=>line.includes(`; Orca Web calibration ${request.mode}, layer `));
  assert.equal(commands.length,zs.length);assert.equal(result.calibrationSummary.layers,zs.length);assert.equal(zs.length,Math.round(prepared.plan.height/.98/.2));assert.ok(zs.at(-1)>prepared.plan.height);
  for(let index=0;index<zs.length;index++){const expected=request.mode==='temperature'?`M104 S${index<=50?230:225}`:`M900 K${Number((Math.floor(zs[index])*.002).toPrecision(4))}`;assert.equal(commands[index],`${expected} ; Orca Web calibration ${request.mode}, layer ${index+1}`);}
  if(request.mode==='temperature'){assert.equal(zs.length,102);assert.equal(zs.at(-1),20.4);assert.match(commands[0],/^M104 S230 /);assert.match(commands.at(-1),/^M104 S225 /);}
  assert.equal((await readdir(path.join(api.dataDir,'jobs'))).filter(name=>name.endsWith('.gcode')).length,1);assert.deepEqual(await readdir(path.join(api.dataDir,'work')),[]);
  t.diagnostic(`${request.mode}: ${zs.length} real compensated layers, ${commands.length} independently checked native schedule commands; one published target output.`);
});

function wallRatios(code){let object,feature='',z=0,x=0,y=0,e=0,relative=false;const byObject=new Map();for(const source of code.split('\n')){const match=source.match(/^; printing object (.+) id:/);if(match)object=match[1];if(source.startsWith('; stop printing object '))object=null;if(source.startsWith(';TYPE:'))feature=source.slice(6).trim();if(source.startsWith(';Z:'))z=Number(source.slice(3));const line=source.split(';')[0].trim();if(/^M83\b/.test(line))relative=true;if(/^M82\b/.test(line))relative=false;const words=Object.fromEntries([...line.matchAll(/\b([XYEF])([-+]?\d*\.?\d+)/gi)].map(m=>[m[1].toUpperCase(),Number(m[2])]));if(/^G92\b/.test(line)){if(words.E!==undefined)e=words.E;continue;}if(!/^G[01]\b/.test(line))continue;const nx=words.X??x,ny=words.Y??y,length=Math.hypot(nx-x,ny-y),extrusion=words.E===undefined?0:relative?words.E:words.E-e;if(object&&feature==='Outer wall'&&Math.abs(z-.4)<.01&&length>5&&extrusion>0){if(!byObject.has(object))byObject.set(object,[]);byObject.get(object).push(extrusion/length);}x=nx;y=ny;if(words.E!==undefined)e=relative?e+words.E:words.E;}return new Map([...byObject].map(([name,values])=>{values.sort((a,b)=>a-b);return[name,values[Math.floor(values.length/2)]]}));}
test('native project flow calibration retains all independent flow ratios with shrinkage initialization',{timeout:120000},async t=>{
  const api=await serverFor(t),prepared=await api.post('/api/calibrations/prepare',{...api.ids,mode:'flow-ratio',method:'coarse',pattern:'monotonic'}),job=await api.post('/api/jobs/calibration',{calibration:prepared.calibration,ids:api.ids,objects:prepared.objects}),{result,code}=await api.ready(job.id);
  assert.equal(result.calibrationSummary.mode,'flow-ratio');assert.equal(result.calibrationSummary.specimenCount,9);const ratios=wallRatios(code),base=ratios.get('flowrate_0');assert.ok(base>0);
  for(const specimen of prepared.plan.specimens){const value=ratios.get(specimen.name);assert.ok(value>0,specimen.name);assert.ok(Math.abs(value/base-specimen.multiplier)<.003,`${specimen.name}: ${value/base} vs ${specimen.multiplier}`);}
  assert.equal((await readdir(path.join(api.dataDir,'jobs'))).filter(name=>name.endsWith('.gcode')).length,1);assert.deepEqual(await readdir(path.join(api.dataDir,'work')),[]);
  t.diagnostic('All 9 labelled specimens preserve effective independent wall E/mm ratios within 0.3%; warmup target only is published.');
});
