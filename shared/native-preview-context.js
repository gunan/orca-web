/** Minimal immutable editor state needed by native Preview. No paths, connection
 * credentials or scripts are accepted. Old jobs omit this capability entirely. */
export function normalizeNativePreviewContext(value){
 if(!value||typeof value!=='object'||Array.isArray(value)||value.version!==1||value.source!=='native-editor-job')throw new TypeError('Invalid native editor preview context');
 const keys=['version','source','filamentColors','filamentDiameters','filamentDensities','filamentCosts','timeCost','customEvents'];
 if(Object.keys(value).some(key=>!keys.includes(key)))throw new TypeError('Unsupported native editor preview context field');
 const colors=value.filamentColors;if(!Array.isArray(colors)||!colors.length||colors.length>256||colors.some(color=>typeof color!=='string'||!/^#[a-f\d]{6}$/i.test(color)))throw new TypeError('Native editor preview needs 1–256 filament colors');
 const out={version:1,source:'native-editor-job',filamentColors:colors.map(color=>color.toUpperCase())};
 for(const[key,min,max]of[['filamentDiameters',.001,1000],['filamentDensities',0,10000],['filamentCosts',0,100000000]]){const values=value[key];if(!Array.isArray(values)||values.length!==colors.length||values.some(v=>typeof v!=='number'||!Number.isFinite(v)||v<min||v>max))throw new TypeError(`Invalid native editor preview ${key}`);out[key]=[...values];}
 if(typeof value.timeCost!=='number'||!Number.isFinite(value.timeCost)||value.timeCost<0||value.timeCost>100000000)throw new TypeError('Invalid native editor preview time cost');out.timeCost=value.timeCost;
 const events=value.customEvents??[];if(!Array.isArray(events)||events.length>10000)throw new TypeError('Invalid native editor event count');
 out.customEvents=events.map(event=>{if(!event||typeof event!=='object'||Object.keys(event).some(key=>!['type','z','extruder','color'].includes(key))||!Number.isInteger(event.type)||event.type<0||event.type>5||typeof event.z!=='number'||!Number.isFinite(event.z)||event.z<=0||event.z>10000||!Number.isInteger(event.extruder)||event.extruder< -1||event.extruder>256||([0,2].includes(event.type)&&(event.extruder<1||event.extruder>colors.length))||typeof event.color!=='string'||event.color.length>64)throw new TypeError('Invalid native editor event metadata');return{type:event.type,z:event.z,extruder:event.extruder,color:event.color};});
 return out;
}
