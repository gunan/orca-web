import test from 'node:test';
import assert from 'node:assert/strict';
import { deflateSync, strToU8, strFromU8, zipSync } from 'fflate';
import { extractBoundedZip } from '../../shared/import-limits.js';

// Deliberately small ZIP64 archives exercise metadata without large allocations.
function archive(text='ZIP64 works',compression=8){
  const name=strToU8('mesh.model'),raw=strToU8(text),data=compression===8?deflateSync(raw):raw;
  const localSize=30+name.length+20,central=localSize+data.length,centralSize=46+name.length+32,record=central+centralSize,locator=record+56,end=locator+20;
  const bytes=new Uint8Array(end+22),view=new DataView(bytes.buffer),u16=(offset,value)=>view.setUint16(offset,value,true),u32=(offset,value)=>view.setUint32(offset,value,true),u64=(offset,value)=>view.setBigUint64(offset,BigInt(value),true);
  u32(0,0x04034b50);u16(4,45);u16(8,compression);u32(18,0xffffffff);u32(22,0xffffffff);u16(26,name.length);u16(28,20);bytes.set(name,30);
  const localExtra=30+name.length;u16(localExtra,1);u16(localExtra+2,16);u64(localExtra+4,raw.length);u64(localExtra+12,data.length);bytes.set(data,localSize);
  u32(central,0x02014b50);u16(central+4,45);u16(central+6,45);u16(central+10,compression);u32(central+20,0xffffffff);u32(central+24,0xffffffff);u16(central+28,name.length);u16(central+30,32);u16(central+34,0xffff);u32(central+42,0xffffffff);bytes.set(name,central+46);
  const extra=central+46+name.length;u16(extra,1);u16(extra+2,28);u64(extra+4,raw.length);u64(extra+12,data.length);u64(extra+20,0);u32(extra+28,0);
  u32(record,0x06064b50);u64(record+4,44);u16(record+12,45);u16(record+14,45);u64(record+24,1);u64(record+32,1);u64(record+40,centralSize);u64(record+48,central);
  u32(locator,0x07064b50);u64(locator+8,record);u32(locator+16,1);
  u32(end,0x06054b50);u16(end+8,0xffff);u16(end+10,0xffff);u32(end+12,0xffffffff);u32(end+16,0xffffffff);
  return{bytes,view,central,extra,localExtra,record,locator,end,u16,u32,u64};
}
test('bounded ZIP64 reader accepts stored/deflated small files and regular ZIP remains compatible',()=>{
  for(const method of [0,8])assert.equal(strFromU8(extractBoundedZip(archive('ZIP64 works',method).bytes)['mesh.model']),'ZIP64 works');
  assert.equal(strFromU8(extractBoundedZip(zipSync({'regular.txt':strToU8('normal')}))['regular.txt']),'normal');
  assert.throws(()=>extractBoundedZip(archive().bytes,{maxExpandedBytes:5}),/expanded size/);
});
test('ZIP64 rejects oversized counts, integer overflow, directory lengths and multi-disk metadata before inflating',()=>{
  for(const mutation of [a=>a.u64(a.record+24,4097),a=>a.u64(a.record+32,4097)]){const a=archive();mutation(a);assert.throws(()=>extractBoundedZip(a.bytes),/too many/);}
  for(const offset of ['locator','record','extra']){const a=archive();a.u64(a[offset]+(offset==='locator'?8:4),2n**63n);assert.throws(()=>extractBoundedZip(a.bytes),/safe integer/);}
  for(const size of [43,45,1000000]){const a=archive();a.u64(a.record+4,size);assert.throws(()=>extractBoundedZip(a.bytes),/record length/);}
  const outOfBounds=archive();outOfBounds.u64(outOfBounds.locator+8,Number.MAX_SAFE_INTEGER);assert.throws(()=>extractBoundedZip(outOfBounds.bytes),/directory bounds/);
  for(const mutate of [a=>a.u32(a.locator+16,2),a=>a.u32(a.record+16,1),a=>a.u32(a.extra+28,1)]){const a=archive();mutate(a);assert.throws(()=>extractBoundedZip(a.bytes),/Multi-disk/);}
});
test('ZIP64 rejects missing/truncated extras, overlapping directory bounds, forged expansions and inconsistent headers',()=>{
  const missing=archive();missing.u16(missing.extra,2);assert.throws(()=>extractBoundedZip(missing.bytes),/Missing ZIP64/);
  const truncated=archive();truncated.u16(truncated.extra+2,5);assert.throws(()=>extractBoundedZip(truncated.bytes),/extra field|Truncated/);
  const tooLong=archive();tooLong.u16(tooLong.extra+2,1000);assert.throws(()=>extractBoundedZip(tooLong.bytes),/extra field length/);
  const tooLarge=archive();tooLarge.u64(tooLarge.extra+4,300*1024*1024);assert.throws(()=>extractBoundedZip(tooLarge.bytes),/expanded size/);
  const badOffset=archive();badOffset.u64(badOffset.extra+20,Number.MAX_SAFE_INTEGER);assert.throws(()=>extractBoundedZip(badOffset.bytes),/local header/);
  const badDirectory=archive();badDirectory.u64(badDirectory.record+40,badDirectory.bytes.length);assert.throws(()=>extractBoundedZip(badDirectory.bytes),/directory bounds/);
  const forged=archive('x'.repeat(1000000));forged.u64(forged.extra+4,16);forged.u64(forged.localExtra+4,16);assert.throws(()=>extractBoundedZip(forged.bytes,{maxExpandedBytes:1000}),/actual expanded/);
  const mismatch=archive();mismatch.u64(mismatch.localExtra+4,4);assert.throws(()=>extractBoundedZip(mismatch.bytes),/sizes disagree/);
  const oldMismatch=archive();oldMismatch.u16(oldMismatch.end+10,2);assert.throws(()=>extractBoundedZip(oldMismatch.bytes),/headers disagree/);
  const missingLocator=archive();missingLocator.u32(missingLocator.locator,0);assert.throws(()=>extractBoundedZip(missingLocator.bytes),/Missing ZIP64 directory locator/);
});
