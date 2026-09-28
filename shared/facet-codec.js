import {transformPositions} from './geometry.js';

export const PAINT_CHANNELS=Object.freeze({supports:'paint_supports',seam:'paint_seam',color:'paint_color',fuzzy:'paint_fuzzy_skin'});
export const PAINT_LIMITS=Object.freeze({depth:24,nibblesPerFacet:131072,totalNodes:2000000,strokeNodes:200000});
const maxState=(channel,filamentCount=16)=>{if(!Object.hasOwn(PAINT_CHANNELS,channel))throw new Error('Unknown painting channel');return channel==='color'?Math.min(filamentCount,16):channel==='fuzzy'?1:2;};
function stateValid(state,channel,filamentCount){if(!Number.isInteger(state)||state<0||state>maxState(channel,filamentCount))throw new Error(`Invalid ${channel} painting state or filament slot`);return state;}
/** Orca 2.4.2 FacetsAnnotation reverses nibble order. Child nodes are serialized
 * in reverse traversal order; the resulting string lists children 0..N first.
 * A leaf uses 0/4/8, or an extra high nibble followed by C for states 3..16. */
export function decodeFacet(code,{channel='color',filamentCount=16,budget}={}){
  if(typeof code!=='string'||!code.length||code.length>PAINT_LIMITS.nibblesPerFacet||!/^[0-9A-F]+$/.test(code))throw new Error('Invalid native facet hexadecimal string');
  let cursor=code.length-1,nodes=0;
  function next(){if(cursor<0)throw new Error('Truncated native facet tree');return parseInt(code[cursor--],16);}
  function read(depth){if(depth>PAINT_LIMITS.depth)throw new Error('Native facet tree is too deep');nodes++;if(budget&&++budget.nodes>PAINT_LIMITS.totalNodes)throw new Error('Painting exceeds the total node limit');const value=next(),split=value&3,side=value>>2;
    if(!split)return{state:stateValid(side===3?next()+3:side,channel,filamentCount)};
    if(side>2||(split===3&&side!==0))throw new Error('Invalid native facet split side');const children=new Array(split+1);for(let child=split;child>=0;child--)children[child]=read(depth+1);return{split,side,children};
  }
  const tree=read(0);if(cursor!==-1)throw new Error('Trailing data in native facet tree');return{tree,nodes};
}
export function encodeFacet(tree,{channel='color',filamentCount=16,collapse=false}={}){
  let nodes=0;
  function write(node,depth){if(++nodes>PAINT_LIMITS.nibblesPerFacet||depth>PAINT_LIMITS.depth)throw new Error('Native facet tree exceeds limits');if(node&&Object.hasOwn(node,'state')){const state=stateValid(node.state,channel,filamentCount);return state<3?String(state*4):(state-3).toString(16).toUpperCase()+'C';}
    if(!node||![1,2,3].includes(node.split)||!Number.isInteger(node.side)||node.side<0||node.side>2||node.split===3&&node.side!==0||!Array.isArray(node.children)||node.children.length!==node.split+1)throw new Error('Invalid native facet split tree');
    const children=node.children.map(child=>write(child,depth+1));if(collapse&&children.every(value=>value===children[0])&&children[0].length<=2)return children[0];return children.join('')+((node.side<<2)|node.split).toString(16).toUpperCase();
  }
  const code=write(tree,0);if(code.length>PAINT_LIMITS.nibblesPerFacet)throw new Error('Native facet string exceeds the length limit');return code;
}
export function normalizePainting(value,triangleCount,{filamentCount=16,budget={nodes:0}}={}){
  if(value==null)return undefined;if(!value||value.version!==1||typeof value!=='object'||Array.isArray(value))throw new Error('Invalid facet painting data');if(!Number.isInteger(triangleCount)||triangleCount<0||triangleCount>2000000)throw new Error('Invalid painted mesh triangle count');
  for(const key of Object.keys(value))if(!['version','winding'].includes(key)&&!Object.hasOwn(PAINT_CHANNELS,key))throw new Error(`Unknown painting channel: ${key}`);
  const winding=value.winding??1;if(winding!==1&&winding!==-1)throw new Error('Invalid painting vertex winding');
  const result={version:1,winding};for(const channel of Object.keys(PAINT_CHANNELS)){const source=value[channel];if(source==null)continue;if(typeof source!=='object'||Array.isArray(source))throw new Error('Painted facets must be indexed maps');const target={};
    for(const[index,code]of Object.entries(source)){if(!/^(0|[1-9]\d*)$/.test(index)||Number(index)>=triangleCount)throw new Error('Painted facet index is outside the mesh');decodeFacet(code,{channel,filamentCount,budget});if(code!=='0')target[index]=code;}if(Object.keys(target).length)result[channel]=target;
  }return result;
}
const midpoint=(a,b)=>a.map((value,index)=>(value+b[index])/2);
/** Exact child order from TriangleSelector::perform_split, including the
 * special-side rotation for one- and two-edge subdivisions. */
export function splitFacetVertices(vertices,split,side=0){
  const[a,b,c]=[0,1,2].map(index=>vertices[(side+index)%3]);
  if(split===1){const bc=midpoint(b,c);return[[a,b,bc],[bc,c,a]];}
  if(split===2){const ab=midpoint(a,b),ac=midpoint(a,c);return[[a,ab,ac],[ab,b,ac],[b,c,ac]];}
  if(split===3&&side===0){const ab=midpoint(a,b),bc=midpoint(b,c),ca=midpoint(c,a);return[[a,ab,ca],[ab,b,bc],[bc,c,ca],[ab,bc,ca]];}
  throw new Error('Invalid facet subdivision');
}
export function expandFacet(vertices,code,options={}){
  if(!Array.isArray(vertices)||vertices.length!==3||vertices.some(point=>point.length!==3||!point.every(Number.isFinite)))throw new Error('A facet requires three finite vertices');
  const{tree}=decodeFacet(code,options),output=[];function visit(node,points,path){if(Object.hasOwn(node,'state')){output.push({vertices:points,state:node.state,path});return;}const children=splitFacetVertices(points,node.split,node.side);node.children.forEach((child,index)=>visit(child,children[index],[...path,index]));}visit(tree,vertices,[]);return output;
}
/** Winding is kept explicitly because a two-edge native split has an
 * asymmetric diagonal. A reflected two-edge tree cannot generally be rewritten
 * with dyadic midpoint splits without changing its painted boundary. Exporters
 * retain the original tree and use a mirrored component transform instead. */
export function flipPaintingWinding(value,triangleCount,options={}){
  const source=normalizePainting(value,triangleCount,options);return source?{...source,winding:-source.winding}:undefined;
}
export function paintingVertices(vertices,painting){return painting?.winding===-1?[vertices[0],vertices[2],vertices[1]]:vertices;}
export function paintedFacetGeometry(mesh,channel,{filamentCount=16}={}){
  const painting=normalizePainting(mesh.painting,mesh.positions.length/9,{filamentCount}),map=painting?.[channel]||{},points=transformPositions(mesh),output=[];
  for(const[index,code]of Object.entries(map)){const offset=Number(index)*9,vertices=[0,3,6].map(start=>Array.from(points.slice(offset+start,offset+start+3)));for(const part of expandFacet(paintingVertices(vertices,painting),code,{channel,filamentCount}))if(part.state)output.push({triangleIndex:Number(index),...part});}
  return output;
}
