const roleColors={negative_part:'#d9546a',modifier_part:'#edbc41',support_enforcer:'#58b7ef',support_blocker:'#d976e4'};
export function sceneMaterialState(object,{selected=false,filamentColor='#c5ccdb'}={}){
  const role=object.native?.partType||'normal_part',helper=Object.hasOwn(roleColors,role),opacity=helper ? (selected ? .55 : .3) : object.printable===false ? .35 : 1;
  return{role,color:helper?roleColors[role]:selected?'#11b68b':filamentColor,opacity,transparent:opacity<1,depthWrite:opacity===1,depthTest:!helper,renderOrder:helper?2:object.printable===false?1:0};
}
