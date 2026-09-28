import {readFile} from 'node:fs/promises';
import {importNative3MF} from '../../shared/native-project.js';
import {fixtureCatalog} from './native-project-catalog.js';
import {createCalibrationPlan,applyCalibrationOverrides} from '../../shared/calibration.js';
import {preparePAPatternProject} from '../../server/pa-pattern-calibration.js';
export const multiPatternRequest={mode:'pressure-advance-pattern',start:0,end:.08,step:.005,speeds:[80,120,160,200],accelerations:[1000,2000]};
export async function prepareMultiPatternFixture(){
 const base=importNative3MF(await readFile(new URL('./orca-2.4.2-cube.3mf',import.meta.url))),catalog=fixtureCatalog(base),ids=catalog.list().defaults,selection=catalog.resolveSelection(ids),plan=createCalibrationPlan(multiPatternRequest,selection);
 return{catalog,ids,selection,plan,prepared:await preparePAPatternProject({plan,selection:applyCalibrationOverrides(selection,plan)})};
}
