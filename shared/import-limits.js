import { Inflate, strFromU8 } from 'fflate';

export const DEFAULT_IMPORT_LIMITS = Object.freeze({ maxFileBytes: 128 * 1024 * 1024, maxExpandedBytes: 256 * 1024 * 1024, maxTriangles: 2000000, maxZipEntries: 4096 });
export function importLimits(overrides = {}) {
  const result = { ...DEFAULT_IMPORT_LIMITS };
  for (const [key, value] of Object.entries(overrides)) {
    if (!(key in result) || !Number.isSafeInteger(value) || value <= 0 || value > result[key]) throw new Error(`Invalid import limit: ${key}`);
    result[key] = value;
  }
  return result;
}
export function assertFileSize(bytes, limits = DEFAULT_IMPORT_LIMITS) {
  if (!Number.isSafeInteger(bytes) || bytes < 0 || bytes > limits.maxFileBytes) throw new Error(`Model exceeds the ${limits.maxFileBytes} byte import limit`);
}
export function assertTriangleCount(count, limits = DEFAULT_IMPORT_LIMITS) {
  if (!Number.isSafeInteger(count) || count < 0 || count > limits.maxTriangles) throw new Error(`Model exceeds the ${limits.maxTriangles} triangle import limit`);
}

/** Validate ZIP metadata first, then inflate in 4 KiB input chunks into bounded
 * output buffers. Advertised sizes alone are insufficient: actual output is
 * checked before copying, including archives with deliberately forged sizes.
 * Single-disk ZIP64 metadata is supported with the same small archive limits.
 * Encryption, multi-disk archives, and duplicate/unsafe names are rejected.
 * Layouts follow PKWARE APPNOTE 6.3.10 §§4.3.14–16 and 4.5.3:
 * https://pkware.cachefly.net/webdocs/casestudies/APPNOTE.TXT
 */
export function extractBoundedZip(input, limitOverrides = {}) {
  const limits = importLimits(limitOverrides), bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  assertFileSize(bytes.byteLength, limits);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  function uint64(offset,bound,label='ZIP64 value'){
    if(offset<0||offset+8>bound)throw new Error(`Truncated ${label}`);
    const value=view.getBigUint64(offset,true);
    if(value>BigInt(Number.MAX_SAFE_INTEGER))throw new Error(`${label} exceeds the safe integer range`);
    return Number(value);
  }
  function extraFields(start,length){
    const fields=new Map(),end=start+length;
    for(let offset=start;offset<end;){
      if(offset+4>end)throw new Error('Truncated ZIP extra field');
      const type=view.getUint16(offset,true),size=view.getUint16(offset+2,true);offset+=4;
      if(offset+size>end)throw new Error('Invalid ZIP extra field length');
      if(type===1&&fields.has(type))throw new Error('Duplicate ZIP64 extra field');
      fields.set(type,{start:offset,end:offset+size});offset+=size;
    }
    return fields;
  }
  function zip64Entry(values,fields){
    const required=Object.values(values).some(value=>value===0xffffffff)||values.disk===0xffff;
    if(!required)return values;
    const extra=fields.get(1);if(!extra)throw new Error('Missing ZIP64 extra field');
    let cursor=extra.start;
    for(const key of ['expanded','compressed','local','disk']){
      if(values[key]===undefined||values[key]!== (key==='disk'?0xffff:0xffffffff))continue;
      if(key==='disk'){if(cursor+4>extra.end)throw new Error('Truncated ZIP64 disk field');values[key]=view.getUint32(cursor,true);cursor+=4;}
      else{values[key]=uint64(cursor,extra.end,`ZIP64 ${key}`);cursor+=8;}
    }
    return values;
  }
  let end = -1;
  for (let offset = bytes.length - 22; offset >= Math.max(0, bytes.length - 65557); offset--) {
    if (view.getUint32(offset, true) === 0x06054b50 && offset + 22 + view.getUint16(offset + 20, true) === bytes.length) { end = offset; break; }
  }
  if (end < 0) throw new Error('Invalid ZIP archive directory');
  if (view.getUint16(end + 4, true) || view.getUint16(end + 6, true)) throw new Error('Multi-disk ZIP archives are not supported');
  let diskCount=view.getUint16(end+8,true),count=view.getUint16(end+10,true),centralSize=view.getUint32(end+12,true),centralOffset=view.getUint32(end+16,true),directoryEnd=end;
  const locator=end-20,hasLocator=locator>=0&&view.getUint32(locator,true)===0x07064b50;
  if(hasLocator||count===0xffff||diskCount===0xffff||centralOffset===0xffffffff||centralSize===0xffffffff){
    if(!hasLocator)throw new Error('Missing ZIP64 directory locator');
    if(view.getUint32(locator+4,true)!==0||view.getUint32(locator+16,true)!==1)throw new Error('Multi-disk ZIP64 archives are not supported');
    const record=uint64(locator+8,end,'ZIP64 directory offset');
    if(record+56>locator||view.getUint32(record,true)!==0x06064b50)throw new Error('Invalid ZIP64 directory bounds');
    const size=uint64(record+4,locator,'ZIP64 directory record length');
    if(size<44||size>locator-record-12||record+12+size!==locator)throw new Error('Invalid ZIP64 directory record length');
    if(view.getUint32(record+16,true)!==0||view.getUint32(record+20,true)!==0)throw new Error('Multi-disk ZIP64 archives are not supported');
    const wide=[uint64(record+24,locator,'ZIP64 entry count'),uint64(record+32,locator,'ZIP64 entry count'),uint64(record+40,locator,'ZIP64 directory size'),uint64(record+48,locator,'ZIP64 directory offset')];
    for(const[index,value]of [diskCount,count,centralSize,centralOffset].entries())if(value!==(index<2?0xffff:0xffffffff)&&value!==wide[index])throw new Error('ZIP and ZIP64 directory headers disagree');
    [diskCount,count,centralSize,centralOffset]=wide;directoryEnd=record;
  }
  if(count>limits.maxZipEntries||diskCount!==count)throw new Error('ZIP archive contains too many entries');
  if(centralOffset>directoryEnd||centralSize>directoryEnd-centralOffset)throw new Error('Invalid ZIP archive directory bounds');
  const entries = [], names = new Set();
  let cursor = centralOffset, total = 0;
  for (let index = 0; index < count; index++) {
    if (cursor + 46 > centralOffset + centralSize || view.getUint32(cursor, true) !== 0x02014b50) throw new Error('Invalid ZIP directory entry');
    const flags = view.getUint16(cursor + 8, true), compression = view.getUint16(cursor + 10, true);
    const nameLength = view.getUint16(cursor + 28, true), extraLength = view.getUint16(cursor + 30, true), commentLength = view.getUint16(cursor + 32, true);
    if (flags & (1|64|8192) || ![0, 8].includes(compression)) throw new Error('Encrypted or unsupported ZIP compression');
    if (cursor + 46 + nameLength + extraLength + commentLength > centralOffset + centralSize) throw new Error('Invalid ZIP filename bounds');
    const {compressed,expanded,local,disk}=zip64Entry({compressed:view.getUint32(cursor+20,true),expanded:view.getUint32(cursor+24,true),local:view.getUint32(cursor+42,true),disk:view.getUint16(cursor+34,true)},extraFields(cursor+46+nameLength,extraLength));
    if(disk!==0)throw new Error('Multi-disk ZIP entries are not supported');
    const name = strFromU8(bytes.subarray(cursor + 46, cursor + 46 + nameLength));
    if (!name || name.includes('\0') || name.includes('\\') || name.startsWith('/') || /^[A-Za-z]:/.test(name) || name.split('/').some(part => ['..', '__proto__', 'constructor', 'prototype'].includes(part)) || names.has(name)) throw new Error('Unsafe or duplicate ZIP filename');
    names.add(name);
    if(expanded>limits.maxExpandedBytes-total)throw new Error('ZIP expanded size exceeds the import limit');total+=expanded;
    if (local + 30 > centralOffset || view.getUint32(local, true) !== 0x04034b50) throw new Error('Invalid ZIP local header');
    if (view.getUint16(local + 8, true) !== compression || view.getUint16(local + 6, true) !== flags) throw new Error('ZIP headers disagree');
    const localNameLength = view.getUint16(local + 26, true), localExtraLength = view.getUint16(local + 28, true);
    const start = local + 30 + localNameLength + localExtraLength;
    if(start>centralOffset||compressed>centralOffset-start||strFromU8(bytes.subarray(local+30,local+30+localNameLength))!==name)throw new Error('Invalid ZIP entry bounds');
    const localSizes=zip64Entry({compressed:view.getUint32(local+18,true),expanded:view.getUint32(local+22,true)},extraFields(local+30+localNameLength,localExtraLength));
    if(!(flags&8)&&(localSizes.compressed!==compressed||localSizes.expanded!==expanded))throw new Error('ZIP local and directory sizes disagree');
    entries.push({ name, compression, compressed, expanded, start });
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  if (cursor !== centralOffset + centralSize) throw new Error('ZIP directory contains unexpected data');
  const files = Object.create(null);
  for (const entry of entries) {
    const data = bytes.subarray(entry.start, entry.start + entry.compressed);
    if (entry.compression === 0) {
      if (entry.compressed !== entry.expanded) throw new Error('ZIP stored size mismatch');
      files[entry.name] = data.slice();
    } else {
      const output = new Uint8Array(entry.expanded);
      let produced = 0;
      const inflater = new Inflate(chunk => {
        if (produced + chunk.length > output.length) throw new Error('ZIP actual expanded size exceeds its declared size');
        output.set(chunk, produced); produced += chunk.length;
      });
      for (let offset = 0; offset < data.length; offset += 4096) inflater.push(data.subarray(offset, offset + 4096), offset + 4096 >= data.length);
      if (!data.length || produced !== entry.expanded) throw new Error('ZIP expanded size mismatch');
      files[entry.name] = output;
    }
  }
  return files;
}
