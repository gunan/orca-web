import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {inflateSync} from 'node:zlib';

const root=new URL('../../public/native-toolbar-icons/',import.meta.url),manifest=JSON.parse(readFileSync(new URL('manifest.json',root)));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
function png(file){
 const data=readFileSync(new URL(file,root));let width,height;const chunks=[];
 assert.equal(data.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
 for(let offset=8;offset<data.length;){const size=data.readUInt32BE(offset),kind=data.toString('ascii',offset+4,offset+8),bytes=data.subarray(offset+8,offset+8+size);if(kind==='IHDR'){width=bytes.readUInt32BE(0);height=bytes.readUInt32BE(4);assert.deepEqual([...bytes.subarray(8)],[8,6,0,0,0]);}if(kind==='IDAT')chunks.push(bytes);offset+=size+12;}
 const raw=inflateSync(Buffer.concat(chunks)),rgba=Buffer.alloc(width*height*4);assert.equal(raw.length,height*(width*4+1));
 for(let y=0;y<height;y++){assert.equal(raw[y*(width*4+1)],0);raw.copy(rgba,y*width*4,y*(width*4+1)+1,(y+1)*(width*4+1));}
 return {data,rgba,width,height};
}
test('native toolbar raster inputs and generator retain the pinned provenance',()=>{
 assert.equal(manifest.sourceCommit,'8500fcdccaa10b5099ac20d252af3a7c560046f1');assert.equal(manifest.nativeVersion,'2.4.2');
 for(const [file,hash]of Object.entries(manifest.inputs))assert.equal(sha(readFileSync(new URL('../../public/native-icons/'+file,import.meta.url))),hash,file);
 assert.equal(sha(readFileSync(new URL('../../scripts/reference/build-toolbar-icons.py',import.meta.url))),manifest.generatorSha256);
 assert.equal(sha(readFileSync(new URL('../fixtures/native-toolbar-reference.cpp',import.meta.url))),manifest.referenceSourceSha256);
 assert.equal(manifest.icons.length,15);assert.equal(manifest.strips.length,60);
});
for(const theme of ['light','dark'])for(const size of [36,72])test(`all ${theme} ${size}px icon strips exactly preserve the original native state atlas`,()=>{
 const entry=manifest.atlases.find(a=>a.theme===theme&&a.size===size),atlas=png(entry.file);
 assert.equal(sha(atlas.data),entry.sha256);assert.equal(sha(atlas.rgba),entry.rgbaSha256);
 for(const [index,icon]of manifest.icons.entries()){
  const entry=manifest.strips.find(a=>a.theme===theme&&a.size===size&&a.icon===icon),strip=png(entry.file);
  assert.equal(strip.width,size*4);assert.equal(strip.height,size);assert.equal(sha(strip.data),entry.sha256);assert.equal(sha(strip.rgba),entry.rgbaSha256);
  for(let y=0;y<size;y++)for(let state=0;state<4;state++){
   const from=((1+index*(size+1)+y)*atlas.width+1+state*(size+1))*4;
   assert.deepEqual(strip.rgba.subarray((y*size*4+state*size)*4,(y*size*4+(state+1)*size)*4),atlas.rgba.subarray(from,from+size*4),`${icon} state ${state}, row ${y}`);
  }
 }
});
for(const theme of ['light','dark'])test(`Move ${theme} has distinct native normal, selected and disabled states with preserved alpha`,()=>{
 const {rgba,width,height}=png(`toolbar_move-${theme}-36.png`),normal=theme==='light'?[43,52,54]:[182,182,182],disabled=theme==='light'?[200,200,200]:[76,76,85];let colored=0,covered=0;
 for(let y=0;y<height;y++)for(let x=0;x<36;x++){
  const at=state=>(y*width+x+state*36)*4;
  assert.equal(rgba[at(0)+3],rgba[at(2)+3]);assert.equal(rgba[at(3)+3],rgba[at(2)+3]);
  if(rgba[at(2)+3]===255){covered++;assert.deepEqual([...rgba.subarray(at(0),at(0)+3)],normal);assert.deepEqual([...rgba.subarray(at(3),at(3)+3)],disabled);if(rgba[at(2)]===0&&rgba[at(2)+1]===150&&rgba[at(2)+2]===136)colored++;}
 }
 assert(covered>10);assert(colored>5,'selected green arrows remain present');
});
