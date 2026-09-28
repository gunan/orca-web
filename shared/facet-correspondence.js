import {PAINT_CHANNELS,normalizePainting,decodeFacet,encodeFacet} from './facet-painting.js';
export const hasFacetPainting=mesh=>Object.keys(PAINT_CHANNELS).some(channel=>Object.values(mesh.painting?.[channel]||{}).some(code=>uniformState(code,channel)!==0));
function uniformState(code,channel){const {tree}=decodeFacet(code,{channel}),states=new Set();function walk(node){if(Object.hasOwn(node,'state'))states.add(node.state);else node.children.forEach(walk);}walk(tree);return states.size===1?[...states][0]:null;}
export function paintingCorrespondenceError(message){const error=new Error(`${message} Clear the affected painting in the painting editor before retrying.`);error.code='PAINTING_CORRESPONDENCE_LOSS';return error;}
/** Remap exact triangle correspondence, preserving native asymmetric subdivision
 * bases. Individual orientation repairs are safe for flat states; incompatible
 * reflections of varying-state subdivisions must be rejected before data loss. */
export function remapFacetPainting(mesh,indices,{reversed=[]}={}){
 const source=normalizePainting(mesh.painting,mesh.positions.length/9);if(!source)return undefined;
 let winding=null;const result={version:1};
 for(const channel of Object.keys(PAINT_CHANNELS)){
  const map={};indices.forEach((sourceIndex,target)=>{if(!Number.isInteger(sourceIndex)||sourceIndex<0||sourceIndex>=mesh.positions.length/9)throw new Error('Invalid source facet correspondence');const code=source[channel]?.[sourceIndex];if(!code)return;
   const uniform=uniformState(code,channel);if(uniform!==null){if(uniform)map[target]=encodeFacet({state:uniform},{channel});return;}
   const basis=source.winding*(reversed[target]?-1:1);if(winding!==null&&winding!==basis)throw paintingCorrespondenceError('Repair would give painted subdivisions incompatible vertex orientations.');winding=basis;map[target]=code;
  });if(Object.keys(map).length)result[channel]=map;
 }
 result.winding=winding??source.winding;return Object.keys(PAINT_CHANNELS).some(channel=>result[channel])?result:undefined;
}
export function mergeFacetPainting(meshes){
 const result={version:1};let winding=null,offset=0;
 for(const mesh of meshes){const source=remapFacetPainting(mesh,Array.from({length:mesh.positions.length/9},(_,index)=>index));
  if(source)for(const channel of Object.keys(PAINT_CHANNELS))for(const [index,code]of Object.entries(source[channel]||{})){
   if(uniformState(code,channel)===null){if(winding!==null&&winding!==source.winding)throw paintingCorrespondenceError('Assembly would combine incompatible reflected paint subdivisions.');winding=source.winding;}
   result[channel]||={};result[channel][offset+Number(index)]=code;
  }offset+=mesh.positions.length/9;
 }
 result.winding=winding??1;return Object.keys(PAINT_CHANNELS).some(channel=>result[channel])?result:undefined;
}
export function assertRemovableFacets(mesh,indices){
 const source=normalizePainting(mesh.painting,mesh.positions.length/9);if(!source)return;
 if(indices.some(index=>Object.keys(PAINT_CHANNELS).some(channel=>source[channel]?.[index])))throw paintingCorrespondenceError('Repair would delete a painted degenerate or duplicate facet.');
}
