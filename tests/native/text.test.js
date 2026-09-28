import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,readFile,readdir,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {inspectSlicer,runSlicer} from '../../server/slicer.js';
import {importNative3MF,exportNative3MF} from '../../shared/native-project.js';
import {addTextToScene,parseTextFont,textSurfaceAnchor} from '../../shared/text-geometry.js';
import {meshBounds,transformPositions} from '../../shared/geometry.js';

const binary=process.env.ORCA_SLICER_BIN||(process.platform==='darwin'?'/Applications/OrcaSlicer.app/Contents/MacOS/OrcaSlicer':'orca-slicer');
async function slice(directory,label,project,signal){const root=path.join(directory,label);await mkdir(path.join(root,'config'),{recursive:true});await mkdir(path.join(root,'output'));const input=path.join(root,'text.3mf');await writeFile(input,exportNative3MF(project));await runSlicer(binary,['--slice','0','--arrange','0','--orient','0','--datadir',path.join(root,'config'),'--outputdir',path.join(root,'output'),input],{cwd:root,timeoutMs:60000,signal});assert.deepEqual((await readdir(path.join(root,'output'))).filter(file=>file.endsWith('.gcode')),['plate_1.gcode']);return readFile(path.join(root,'output','plate_1.gcode'),'utf8');}
function moves(code){const result=[];let from=[0,0],z=0;for(const line of code.split(/\r?\n/)){const zm=line.match(/^;Z:([-+.\d]+)/);if(zm)z=Number(zm[1]);if(!/^G[01]\s/.test(line))continue;const xm=line.match(/\bX([-+.\d]+)/),ym=line.match(/\bY([-+.\d]+)/),em=line.match(/\bE([-+.\d]+)/),to=[xm?Number(xm[1]):from[0],ym?Number(ym[1]):from[1]];if(em&&Number(em[1])>0&&(xm||ym))result.push({from,to,z});from=to;}assert.ok(result.length>1000);return result;}
function capArea(mesh){const points=transformPositions(mesh),top=meshBounds(mesh).max[2],triangles=[],edges=new Map();const key=p=>p.map(number=>number.toFixed(5)).join(',');for(let i=0;i<points.length;i+=9){const triangle=[0,1,2].map(vertex=>Array.from(points.slice(i+vertex*3,i+vertex*3+2)));if(![0,1,2].every(v=>Math.abs(points[i+v*3+2]-top)<.001))continue;triangles.push(triangle);for(let j=0;j<3;j++){const a=triangle[j],b=triangle[(j+1)%3],id=[key(a),key(b)].sort().join(';');if(edges.has(id))edges.delete(id);else edges.set(id,[a,b]);}}
  function distance(point,[a,b]){const delta=b.map((value,index)=>value-a[index]),length=delta[0]**2+delta[1]**2,t=Math.max(0,Math.min(1,((point[0]-a[0])*delta[0]+(point[1]-a[1])*delta[1])/length));return Math.hypot(point[0]-a[0]-t*delta[0],point[1]-a[1]-t*delta[1]);}
  function inside(point){return triangles.some(triangle=>{const signs=triangle.map((a,index)=>{const b=triangle[(index+1)%3];return(b[0]-a[0])*(point[1]-a[1])-(b[1]-a[1])*(point[0]-a[0]);});return signs.every(x=>x>=-1e-6)||signs.every(x=>x<=1e-6);});}
  return point=>inside(point)&&Math.min(...[...edges.values()].map(edge=>distance(point,edge)))>.45;
}

test('installed native slicer deposits raised text with a counter and preserves engraved letter cavities',{timeout:120000},async t=>{
  const engine=await inspectSlicer(binary);assert.equal(engine.available,true,engine.error);assert.match(engine.version,/^OrcaSlicer-2\.4\.2(?:\b|$)/);
  const directory=await mkdtemp(path.join(tmpdir(),'orca-native-text-'));t.after(()=>rm(directory,{recursive:true,force:true}));
  const project=importNative3MF(await readFile(new URL('../fixtures/orca-2.4.2-cube.3mf',import.meta.url))),body=project.objects[0];const resources=process.env.ORCA_RESOURCES_DIR||(process.platform==='darwin'?'/Applications/OrcaSlicer.app/Contents/Resources':'/usr/share/OrcaSlicer');const font=parseTextFont(await readFile(path.join(resources,'fonts','Sarabun-Medium.ttf'))),placement=textSurfaceAnchor(project.objects,body.id);
  const baseCode=await slice(directory,'base',project,t.signal),baseMoves=moves(baseCode),options={text:'O',size:18,depth:2,embed:.3,...placement};
  const emboss=addTextToScene({objects:project.objects,selectedId:body.id,font,options:{...options,mode:'emboss'}});const embossCode=await slice(directory,'emboss',{...project,objects:emboss.objects},t.signal),raised=moves(embossCode).filter(segment=>segment.z>20.4);assert.ok(raised.length>100,'Raised text must have actual deposited paths above the original body');
  const center=meshBounds(emboss.text).center;for(const segment of raised)for(const fraction of [.25,.5,.75]){const point=segment.from.map((value,axis)=>value+(segment.to[axis]-value)*fraction);assert.ok(Math.hypot(point[0]-center[0],point[1]-center[1])>1.5,'The counter of O must remain open above the body');}
  const engrave=addTextToScene({objects:project.objects,selectedId:body.id,font,options:{...options,mode:'engrave'}});const engraveCode=await slice(directory,'engrave',{...project,objects:engrave.objects},t.signal),engraved=moves(engraveCode).filter(segment=>segment.z>18.5&&segment.z<19.9),inside=capArea(engrave.text);let baselineInk=0;
  for(const segment of baseMoves.filter(segment=>segment.z>18.5&&segment.z<19.9))for(const fraction of [.25,.5,.75]){const point=segment.from.map((value,axis)=>value+(segment.to[axis]-value)*fraction);if(inside(point))baselineInk++;}assert.ok(baselineInk>20,'The baseline must deposit material where the letter will be engraved');
  for(const segment of engraved)for(const fraction of [.25,.5,.75]){const point=segment.from.map((value,axis)=>value+(segment.to[axis]-value)*fraction);assert.equal(inside(point),false,'Engraved letter outlines must remain free of deposited paths');}
  const used=code=>Number(code.match(/^; filament used \[mm\] = (.+)$/m)?.[1]);assert.ok(used(embossCode)>used(baseCode));assert.notEqual(used(engraveCode),used(baseCode),'Engraved walls and cavity must affect native material use');
  t.diagnostic(`${raised.length} raised-text deposition segments preserve O's counter; ${baselineInk} baseline samples occupy the removed engraved ink. Filament ${used(baseCode)} → emboss ${used(embossCode)}, engrave ${used(engraveCode)} mm.`);
});
