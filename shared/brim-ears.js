import { Euler, Matrix4, Quaternion, Vector3 } from 'three';
import { sourceBounds } from './geometry.js';

export const BRIM_EARS_PATH = 'Metadata/brim_ear_points.txt';
export function normalizeBrimEars(value = []) {
  if (!Array.isArray(value) || value.length > 1024) throw new Error('An object supports at most 1024 brim ears');
  return value.map(ear => {
    if (!ear || !Array.isArray(ear.position) || ear.position.length !== 3 || !ear.position.every(number => typeof number === 'number' && Number.isFinite(number) && Math.abs(number) <= 1e7)) throw new Error('A brim ear needs three finite coordinates');
    if (typeof ear.radius !== 'number' || !Number.isFinite(ear.radius) || ear.radius <= 0 || ear.radius > 1000) throw new Error('Brim ear radius must be greater than zero and at most 1000 mm');
    return {position: [...ear.position], radius: ear.radius};
  });
}
export function meshPointMatrix(object) {
  const center = sourceBounds(object).center;
  return new Matrix4().compose(new Vector3(...center.map((value,axis) => value + object.position[axis])), new Quaternion().setFromEuler(new Euler(...object.rotation.map(value => value*Math.PI/180),'XYZ')), new Vector3(...object.scale)).multiply(new Matrix4().makeTranslation(...center.map(value => -value)));
}
export function transformBrimEars(ears, matrix) {
  return normalizeBrimEars(ears).map(ear => ({position: new Vector3(...ear.position).applyMatrix4(matrix).toArray(), radius:ear.radius}));
}
export function worldBrimEars(object) { return transformBrimEars(object.brimEars || [],meshPointMatrix(object)); }
const group = object => object.native?.groupId || object.id;
export function brimEarMembers(objects, selectedId) {
  const selected = objects.find(object => object.id === selectedId);
  if (!selected) throw new Error('Select an object to edit brim ears');
  return objects.filter(object => object.plateId === selected.plateId && group(object) === group(selected));
}
export function groupBrimEars(objects,selectedId) { return brimEarMembers(objects,selectedId).flatMap(worldBrimEars); }
export function updateBrimEars(objects,selectedId,ears) {
  ears = normalizeBrimEars(ears);
  const members = brimEarMembers(objects,selectedId), anchor = members.find(object => (object.native?.partType || 'normal_part') === 'normal_part');
  if (!anchor) throw new Error('Brim ears require a normal part');
  const local = transformBrimEars(ears,meshPointMatrix(anchor).invert());
  return objects.map(object => {
    if (!members.includes(object)) return object;
    const native = {...object.native,groupId:group(anchor),objectName:anchor.native?.objectName || anchor.name,partType:object.native?.partType || 'normal_part',partSettings:{...object.native?.partSettings},objectSettings:{...object.native?.objectSettings,brim_type:'painted'}};
    const {brimEars:_ears,...rest} = object;
    return {...rest,native,...(object.id === anchor.id && local.length ? {brimEars:local} : {})};
  });
}
export function readBrimEars(text) {
  if (typeof text !== 'string' || text.length > 16*1024*1024) throw new Error('Brim ear metadata exceeds its limit');
  const lines = text.trim().split(/\r?\n/), result = new Map();
  if (lines[0]?.startsWith('brim_points_format_version=')) {
    if (lines.shift() !== 'brim_points_format_version=0') throw new Error('Unsupported brim ear metadata version');
  }
  for (const line of lines.filter(Boolean)) {
    const match = line.match(/^object_id=([1-9]\d*)\|(.+)$/);
    if (!match || Number(match[1]) > 10000 || result.has(Number(match[1]))) throw new Error('Invalid or duplicate brim ear object index');
    const values = match[2].trim().split(/\s+/).map(Number);
    if (values.length % 4) throw new Error('Incomplete brim ear point');
    const ears=[];for(let i=0;i<values.length;i+=4) ears.push({position:values.slice(i,i+3),radius:values[i+3]});
    result.set(Number(match[1]),normalizeBrimEars(ears));
  }
  return result;
}
export function writeBrimEars(groups) {
  const lines = [];
  groups.forEach((ears,index) => { const normalized=normalizeBrimEars(ears);if(normalized.length)lines.push(`object_id=${index+1}|${normalized.flatMap(ear=>[...ear.position,ear.radius]).join(' ')}`); });
  return lines.length ? `brim_points_format_version=0\n${lines.join('\n')}\n` : null;
}
