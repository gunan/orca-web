const printer={name:'Compatibility printer',vendor:'Fixture',chain:[{name:'Compatibility printer',type:'machine',instantiation:'true',nozzle_diameter:['0.4','0.6'],printer_notes:'MODEL_CORE HF'}],metadata:{isSystem:true,parent:'Immediate parent',vendor:'Fixture'}};
const process={name:'Compatibility process',vendor:'Fixture',chain:[{name:'Compatibility process',type:'process',instantiation:'true',layer_height:'0.2',wall_loops:'3'}]};
const candidate=(id,values={})=>({id,name:id,type:'process',vendor:'Fixture',isSystem:true,compatible_printers:[],compatible_prints:[],compatible_printers_condition:'',compatible_prints_condition:'',...values});
export const compatibilityCases=[
 {id:'empty',value:candidate('empty'),expected:true},
 {id:'list-wins-true',value:candidate('list-wins-true',{compatible_printers:['Compatibility printer'],compatible_printers_condition:'false'}),expected:true},
 {id:'list-wins-false',value:candidate('list-wins-false',{compatible_printers:['Other'],compatible_printers_condition:'true'}),expected:false},
 {id:'false-expression',value:candidate('false-expression',{compatible_printers_condition:'false'}),expected:false},
 {id:'typed-regex-and-extras',value:candidate('typed-regex-and-extras',{compatible_printers_condition:'printer_notes =~ /.*MODEL_CORE.*/ and nozzle_diameter[0] == 0.4 and nozzle_diameter[1] == 0.6 and num_extruders == 2 and printer_preset == "Compatibility printer"'}),expected:true},
 {id:'native-arithmetic',value:candidate('native-arithmetic',{compatible_printers_condition:'nozzle_diameter[0] * 10 == 4 and num_extruders > 1'}),expected:true},
 {id:'unknown-variable',value:candidate('unknown-variable',{compatible_printers_condition:'unknown_native_option == 3'}),expected:true,diagnostic:true},
 {id:'malformed-expression',value:candidate('malformed-expression',{compatible_printers_condition:'((('}),expected:true,diagnostic:true},
 {id:'user-immediate-parent',value:candidate('user-immediate-parent',{compatible_printers:['Immediate parent']}),printerMetadata:{isSystem:false,parent:'Immediate parent',vendor:'Fixture'},expected:true},
 {id:'system-parent-not-inherited',value:candidate('system-parent-not-inherited',{compatible_printers:['Immediate parent']}),expected:false},
 {id:'grandparent-not-inherited',value:candidate('grandparent-not-inherited',{compatible_printers:['Grandparent']}),printerMetadata:{isSystem:false,parent:'Immediate parent',vendor:'Fixture'},expected:false},
 {id:'cross-vendor',value:candidate('cross-vendor',{vendor:'Other vendor',compatible_printers:['Compatibility printer']}),expected:true},
 {id:'library-excluded-printer',value:candidate('library-excluded-printer',{type:'filament',vendor:'OrcaFilamentLibrary',excludedFrom:['Compatibility printer']}),expected:false},
 {id:'library-excluded-parent',value:candidate('library-excluded-parent',{type:'filament',vendor:'OrcaFilamentLibrary',excludedFrom:['Immediate parent']}),expected:false},
 {id:'regular-vendor-exclusion-ignored',value:candidate('regular-vendor-exclusion-ignored',{type:'filament',excludedFrom:['Compatibility printer']}),expected:true},
 {id:'print-typed-condition',value:candidate('print-typed-condition',{type:'filament',compatible_prints_condition:'layer_height <= 0.2 and wall_loops == 3'}),expected:true},
 {id:'print-false-condition',value:candidate('print-false-condition',{type:'filament',compatible_prints_condition:'layer_height > 0.2'}),expected:false},
 {id:'print-list-wins',value:candidate('print-list-wins',{type:'filament',compatible_prints:['Compatibility process'],compatible_prints_condition:'false'}),expected:true},
 {id:'print-mismatching-list',value:candidate('print-mismatching-list',{type:'filament',compatible_prints:['Other'],compatible_prints_condition:'((('}),expected:false},
 {id:'print-error-compatible',value:candidate('print-error-compatible',{type:'filament',compatible_prints_condition:'((('}),expected:true,diagnostic:true},
 {id:'printer-rejection-short-circuits-print',value:candidate('printer-rejection-short-circuits-print',{type:'filament',compatible_printers:['Other'],compatible_prints_condition:'((('}),expected:false},
];
export function compatibilityRequest(item){return{operation:'preset-compatibility',printer:{...structuredClone(printer),...(item.printerMetadata?{metadata:item.printerMetadata}:{})},process:structuredClone(process),candidates:[structuredClone(item.value)]};}
export const libraryRequest={operation:'filament-library-exclusions',candidates:[
 candidate('library-first',{name:'Generic PLA A',type:'filament',vendor:'OrcaFilamentLibrary',alias:'PLA'}),
 candidate('library-last',{name:'Generic PLA Z',type:'filament',vendor:'OrcaFilamentLibrary',alias:'PLA'}),
 candidate('vendor-exclusion',{name:'Vendor PLA',type:'filament',vendor:'Vendor',alias:'PLA',compatible_printers:['Specific printer']}),
 candidate('different-alias',{name:'Vendor PETG',type:'filament',vendor:'Vendor',alias:'PETG',compatible_printers:['Ignored printer']}),
]};
