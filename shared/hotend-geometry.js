/** Decode bounded native hotend STL without centering, scaling or repairing its
 * vertex frame. Both binary and ASCII encodings use the native flat normals. */
export function parseNativeHotend(bytes){
 if(!(bytes instanceof ArrayBuffer)||bytes.byteLength<15||bytes.byteLength>5*1024*1024)throw new Error('Native hotend asset is truncated or exceeds bounds');
 const view=new DataView(bytes),count=view.byteLength>=84?view.getUint32(80,true):0;let triangles,coordinates=[];
 if(count>0&&count<=100000&&84+count*50===view.byteLength){triangles=count;for(let i=0;i<count;i++)for(let j=0;j<9;j++)coordinates.push(view.getFloat32(84+i*50+12+j*4,true));}
 else {
  let text;try{text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{throw new Error('Native hotend asset has invalid geometry');}
  const body=text.match(/^\s*solid[^\r\n]*[\r\n]([\s\S]*)\bendsolid[^\r\n]*\s*$/i)?.[1];if(body===undefined)throw new Error('Native hotend asset has invalid geometry');
  const number='[+-]?(?:\\d*\\.\\d+|\\d+\\.?\\d*)(?:[eE][+-]?\\d+)?',vector=`(${number})\\s+(${number})\\s+(${number})`,facet=new RegExp(`facet\\s+normal\\s+${number}\\s+${number}\\s+${number}\\s+outer\\s+loop\\s+vertex\\s+${vector}\\s+vertex\\s+${vector}\\s+vertex\\s+${vector}\\s+endloop\\s+endfacet`,'gi');
  let matched,end=0;while((matched=facet.exec(body))){if(body.slice(end,matched.index).trim())throw new Error('Native hotend asset has invalid geometry');coordinates.push(...matched.slice(1).map(Number));end=facet.lastIndex;if(coordinates.length>900000)throw new Error('Native hotend asset exceeds triangle bounds');}
  if(body.slice(end).trim()||!coordinates.length)throw new Error('Native hotend asset has invalid geometry');triangles=coordinates.length/9;
 }
 const positions=Float32Array.from(coordinates),normals=new Float32Array(triangles*9),bounds={min:[Infinity,Infinity,Infinity],max:[-Infinity,-Infinity,-Infinity]};
 for(let i=0;i<triangles;i++){
  for(let j=0;j<9;j++){const value=positions[i*9+j];if(!Number.isFinite(value)||Math.abs(value)>10000)throw new Error('Native hotend asset has invalid coordinates');const k=j%3;bounds.min[k]=Math.min(bounds.min[k],value);bounds.max[k]=Math.max(bounds.max[k],value);}
  const offset=i*9,f=Math.fround,a=[0,1,2].map(k=>f(positions[offset+3+k]-positions[offset+k])),b=[0,1,2].map(k=>f(positions[offset+6+k]-positions[offset+3+k]));
  let normal=[f(f(a[1]*b[2])-f(a[2]*b[1])),f(f(a[2]*b[0])-f(a[0]*b[2])),f(f(a[0]*b[1])-f(a[1]*b[0]))];
  for(let pass=0;pass<2;pass++){const length=f(Math.sqrt(f(f(f(normal[0]*normal[0])+f(normal[1]*normal[1]))+f(normal[2]*normal[2]))));if(length)normal=normal.map(value=>f(value/length));}
  for(let j=0;j<3;j++)normals.set(normal,offset+j*3);
 }
 return {positions,normals,bounds,triangles};
}
