#!/usr/bin/env node
// Transport-only fixture. It is not a native arrangement substitute.
import{readFile,writeFile}from'node:fs/promises';
import{Matrix4}from'three';
const revision='8500fcdccaa10b5099ac20d252af3a7c560046f1';
if(process.argv[2]==='--version'){console.log(`OrcaArrangeWorker-2.4.2 revision${revision}`);process.exit(0);}
const request=JSON.parse(await readFile(process.argv[2],'utf8')),mode=request.fixtureMode;
if(mode==='WAIT')await new Promise(()=>setInterval(()=>{},10000));
if(mode==='FAIL'){console.error('Fixture arrangement failed');process.exit(1);}
if(mode==='NOISY'){process.stdout.write('X'.repeat(100000));await new Promise(()=>setInterval(()=>{},10000));}
if(mode==='LARGE'){await writeFile(process.argv[3],'X'.repeat(10000));process.exit(0);}
// Import transport defaults assume valid solids. Zero-volume tests supply an
// explicit recorded reply; this fixture does not calculate native mesh volume.
if(request.operation==='inspect-import'){const result=request.fixtureResult||{format:'orca-native-import-inspection',version:1,sourceRevision:revision,objects:request.objects.map(o=>({id:o.id,volume:1000})),retainedIds:request.objects.map(o=>o.id),removedCount:0,unitSuggestion:'none'};if(mode==='INVALID')result.retainedIds=['unknown'];await writeFile(process.argv[3],JSON.stringify(result));process.exit(0);}
// Tower transport replay only. The fixture performs no native geometry work.
if(request.operation==='prime-tower-preview'){const result=request.fixtureResult;if(!result){console.error('No native tower transport replay supplied');process.exit(1);}if(mode==='INVALID')result.plateId='wrong-plate';await writeFile(process.argv[3],JSON.stringify(result));process.exit(0);}
// Cut transport replay is supplied only by tests; no geometry is calculated.
if(request.operation==='cut-to-parts'){const result=request.fixtureResult;if(mode==='INVALID')result.parts[0].sourceId='unknown';await writeFile(process.argv[3],JSON.stringify(result));process.exit(0);}
// Clipboard transport fixture: deterministic translations only. Actual native
// placement is verified against the independent original-C++ reference suite.
// Fill transport fixture intentionally does not calculate native packing.
if(request.operation==='fill-bed'){
 const source=request.objects.find(o=>o.id===request.selectedObjectId),last=source.instances.at(-1),result={format:'orca-native-fill-bed',version:1,sourceRevision:revision,selectedObjectId:source.id,selectedInstanceId:request.selectedInstanceId,added:1,requiresArrange:true,instances:[...source.instances.map((i,index)=>({...i,index,sourceInstanceId:i.id})),{id:null,index:source.instances.length,sourceInstanceId:last.id,matrix:last.matrix,printable:true}]};
 if(mode==='INVALID')result.instances[0].matrix[15]=0;
 await writeFile(process.argv[3],JSON.stringify(result));process.exit(0);
}
if(request.operation==='nearest-empty-cell'){
 const result={format:'orca-native-clipboard',version:1,sourceRevision:revision};
 if(request.pasteParts){result.destinationId=request.pasteParts.destinationId;result.parts=request.clipboardObjects[0].parts.flatMap((part,sourceIndex)=>Array.from({length:request.copies||1},(_,copy)=>{const m=new Matrix4().fromArray(request.clipboardObjects[0].matrix).multiply(new Matrix4().fromArray(part.matrix)).toArray();return{copy,sourceIndex,originalMatrix:m,matrix:[...m]};}));}
 else result.clones=request.clipboardObjects.flatMap(source=>Array.from({length:request.copies},(_,copy)=>{const matrix=[...source.matrix];matrix[12]+=21*(copy+1);return{copy,sourceId:source.id,originalMatrix:source.matrix,matrix};}));
 if(mode==='INVALID')(result.clones?.[0]||result.parts[0]).matrix[15]=0;
 await writeFile(process.argv[3],JSON.stringify(result));process.exit(0);
}
const result={format:'orca-native-arrangement',version:1,sourceRevision:revision,objects:request.objects.filter(o=>o.selected).map(o=>({id:o.id,matrix:o.matrix,bedIndex:0}))};if(mode==='INVALID')result.objects[0].matrix[15]=0;await writeFile(process.argv[3],JSON.stringify(result));
