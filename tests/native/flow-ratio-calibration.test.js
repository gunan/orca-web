import test from 'node:test';import assert from 'node:assert/strict';import{mkdtemp,mkdir,readFile,readdir,rm}from'node:fs/promises';import{tmpdir}from'node:os';import path from'node:path';import express from'express';
import{createPresetCatalog}from'../../server/presets.js';import{createCustomPresetCatalog}from'../../server/custom-presets.js';import{createCalibrationSessions}from'../../server/calibration-sessions.js';import{runSlicer}from'../../server/slicer.js';import{applyCalibrationGcode}from'../../shared/calibration.js';import{analyzeMesh}from'../../shared/geometry.js';import{FLOW_RATIO_METHODS}from'../../shared/flow-ratio-calibration.js';import{writeFile}from'node:fs/promises';import{importNative3MF}from'../../shared/native-project.js';
const binary=process.env.ORCA_SLICER_BIN||'/Applications/OrcaSlicer.app/Contents/MacOS/OrcaSlicer',resourcesDir=process.env.ORCA_RESOURCES_DIR||'/Applications/OrcaSlicer.app/Contents/Resources';let base;
test.before(async()=>{base=await createPresetCatalog({binary})});
function outerExtrusionByObject(gcode){
 let name=null,feature='',z=0,x=0,y=0,e=0,relative=false;const samples=new Map();
 for(const source of gcode.split('\n')){
  const object=source.match(/^; printing object (.+) id:/);if(object)name=object[1];if(source.startsWith('; stop printing object '))name=null;
  if(source.startsWith(';TYPE:'))feature=source.slice(6).trim();if(source.startsWith(';Z:'))z=Number(source.slice(3));
  const line=source.split(';')[0].trim();if(/^M83\b/.test(line))relative=true;if(/^M82\b/.test(line))relative=false;
  const words=Object.fromEntries([...line.matchAll(/\b([XYZEF])([-+]?\d*\.?\d+(?:e[-+]?\d+)?)/gi)].map(match=>[match[1].toUpperCase(),Number(match[2])]));
  if(/^G92\b/.test(line)){if(words.E!==undefined)e=words.E;continue;}if(!/^G[01]\b/.test(line))continue;
  const nextX=words.X??x,nextY=words.Y??y,length=Math.hypot(nextX-x,nextY-y),extrusion=words.E===undefined?0:relative?words.E:words.E-e;
  if(name&&feature==='Outer wall'&&Math.abs(z-.4)<.01&&length>5&&extrusion>0){if(!samples.has(name))samples.set(name,[]);samples.get(name).push(extrusion/length);}
  x=nextX;y=nextY;if(words.E!==undefined)e=relative?e+words.E:words.E;
 }
 return new Map([...samples].map(([name,values])=>{values.sort((a,b)=>a-b);return[name,values[Math.floor(values.length/2)]]}));
}
for(const method of Object.keys(FLOW_RATIO_METHODS))test(`real native ${method} flow calibration retains independent effective ratios and saves a durable result`,{timeout:120000},async t=>{
 const directory=await mkdtemp(path.join(tmpdir(),'orca-flow-native-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 const catalog=await createCustomPresetCatalog({baseCatalog:base,dataDir:directory}),ids=catalog.list().defaults;
 const sessions=createCalibrationSessions({binary,resourcesDir,catalog}),app=express();app.use('/api/calibrations',sessions.router);app.use((error,req,res,next)=>res.status(error.status||500).json({error:error.message}));
 const server=app.listen(0,'127.0.0.1');await new Promise((resolve,reject)=>{server.once('listening',resolve);server.once('error',reject)});t.after(async()=>{await sessions.shutdown();await new Promise(resolve=>server.close(resolve))});
 const address=`http://127.0.0.1:${server.address().port}`,post=(route,body)=>fetch(address+route,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
 const response=await post('/api/calibrations/prepare',{...ids,mode:'flow-ratio',method,pattern:method==='coarse'?'monotonic':'archimedeanchords'}),prepared=await response.json();assert.equal(response.status,200,JSON.stringify(prepared));
 assert.equal(prepared.objects.length,FLOW_RATIO_METHODS[method].modifiers.length);assert.equal(prepared.nativeProject,undefined,'Trusted project bytes must stay server-side');
 for(const object of prepared.objects)assert.equal(analyzeMesh(object).manifold,true,object.name);
 const validated=await sessions.validateProject({calibration:prepared.calibration,ids,objects:prepared.objects});
 const exportResponse=await post('/api/calibrations/project',{calibration:prepared.calibration,ids,objects:prepared.objects});assert.equal(exportResponse.status,200);const exported=new Uint8Array(await exportResponse.arrayBuffer());assert.deepEqual(exported,validated.bytes);const reimported=importNative3MF(exported);assert.equal(reimported.objects.length,prepared.objects.length);for(const specimen of prepared.plan.specimens)assert.equal(reimported.objects.find(object=>object.name===specimen.name).native.objectSettings.print_flow_ratio,String(specimen.multiplier));
 const changed=structuredClone(prepared.objects);changed[0].native.objectSettings.print_flow_ratio='2';await assert.rejects(sessions.validateProject({calibration:prepared.calibration,ids,objects:changed}),/object settings changed/);
 await assert.rejects(sessions.validateUpload({calibration:prepared.calibration,ids,inputPath:'unused.stl',overrides:{}}),/native 3MF/);
 const model=path.join(directory,'flow.3mf');await writeFile(model,validated.bytes);await mkdir(path.join(directory,'output'));await mkdir(path.join(directory,'config'));
 await runSlicer(binary,['--slice','0','--arrange','0','--orient','0','--outputdir',path.join(directory,'output'),'--datadir',path.join(directory,'config'),model],{cwd:directory,timeoutMs:60000,signal:t.signal});
 const outputs=(await readdir(path.join(directory,'output'))).filter(name=>name.endsWith('.gcode'));assert.equal(outputs.length,1);
 const raw=await readFile(path.join(directory,'output',outputs[0]),'utf8'),output=applyCalibrationGcode(raw,validated.plan);assert.ok(output.gcode.endsWith(raw));assert.equal(output.summary.specimenCount,prepared.objects.length);
 const actual=outerExtrusionByObject(raw),zero=actual.get('flowrate_0');assert.ok(zero>0,JSON.stringify([...actual]));
 for(const specimen of prepared.plan.specimens){const observed=actual.get(specimen.name);assert.ok(observed>0,`Missing measurable wall for ${specimen.name}`);assert.ok(Math.abs(observed/zero-specimen.multiplier)<.003,`${specimen.name}: actual relative E/mm ${observed/zero}, planned ${specimen.multiplier}`);}
 const specimen=prepared.plan.specimens.find(item=>item.modifier<0),name=`Native ${method} measured result`,savedResponse=await post('/api/calibrations/result',{token:prepared.calibration.token,objectId:specimen.objectId,name}),saved=await savedResponse.json();assert.equal(savedResponse.status,201,JSON.stringify(saved));assert.equal(saved.result.flowRatio,specimen.flowRatio);
 const reloaded=await createCustomPresetCatalog({baseCatalog:base,dataDir:directory}),stored=reloaded.getCustom(saved.preset.id);assert.deepEqual(stored.overrides.filament_flow_ratio,[String(specimen.flowRatio)]);assert.deepEqual(stored.compatiblePrinterIds,[ids.printerId]);
 const retried=await(await post('/api/calibrations/result',{token:prepared.calibration.token,objectId:specimen.objectId,name})).json();assert.equal(retried.preset.id,saved.preset.id);
 assert.equal((await post('/api/calibrations/result',{token:prepared.calibration.token,objectId:'invented',name:'Invalid'})).status,400);
 t.diagnostic(`${method}: ${prepared.objects.length} closed labelled native objects; measured relative wall extrusion matches each planned multiplier within 0.3%; selected result ${specimen.flowRatio} persisted and reloaded. No printer contacted.`);
});
