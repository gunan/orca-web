import {cp,mkdir,writeFile} from 'node:fs/promises';import path from 'node:path';
export async function writeCompatibilityCatalog(directory){
 await cp(path.resolve('tests/fixtures/presets'),directory,{recursive:true});
 const write=async(vendor,type,filename,data)=>{const target=path.join(directory,vendor,type);await mkdir(target,{recursive:true});await writeFile(path.join(target,filename+'.json'),JSON.stringify({from:'system',instantiation:'true',type,...data}));};
 await write('Test','process','native-condition',{name:'Native expression A',inherits:'process base',compatible_printers:[],compatible_printers_condition:'printer_preset == "Test Printer A" and nozzle_diameter[0] == 0.4',layer_height:'0.18'});
 await write('Test','filament','fine-condition',{name:'Fine process material A',inherits:'Test PLA A',compatible_printers:['Test Printer A'],compatible_prints_condition:'layer_height < 0.15'});
 await write('Test','filament','error-condition',{name:'Native warning material A',inherits:'Test PLA A',compatible_printers:['Test Printer A'],compatible_prints_condition:'((('});
 await write('Test','filament','concrete-generic',{name:'Generic PLA @Test A',inherits:'Test PLA A',compatible_printers:['Test Printer A']});
 await write('OrcaFilamentLibrary','filament','library-generic',{name:'Generic PLA',inherits:'Test PLA A',compatible_printers:[]});
}
