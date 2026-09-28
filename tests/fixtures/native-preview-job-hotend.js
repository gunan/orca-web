import path from 'node:path';
import assert from 'node:assert/strict';
import {createNativeHotendService} from '../../server/hotend-assets.js';

// These Preview tests route a ready job and original native G-code in the
// browser. Complete that job fixture with the real installed default hotend;
// unrelated missing-job HTTP errors must not obscure their console assertions.
export async function routeNativeReadyJobHotend(page,id){
 const service=createNativeHotendService({
  profilesDir:path.join(process.env.ORCA_RESOURCES_DIR||'/Applications/OrcaSlicer.app/Contents/Resources','profiles'),
  nativeVendorDir:null,jobStore:{get:key=>key===id?{status:'ready'}:undefined},
 });
 const {meta,bytes}=await service.resolve(id);assert.equal(meta.available,true);
 await page.route(`**/api/jobs/${id}/hotend`,route=>route.fulfill({json:meta}));
 await page.route(`**/api/jobs/${id}/hotend/model?*`,route=>{
  assert.equal(new URL(route.request().url()).searchParams.get('sha256'),meta.sha256);
  return route.fulfill({contentType:'model/stl',body:bytes});
 });
}
