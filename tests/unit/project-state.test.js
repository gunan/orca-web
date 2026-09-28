import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyProject } from '../../shared/project.js';
import { createMesh } from '../../shared/geometry.js';
import { projectHasChanges } from '../../shared/project-state.js';
test('selection is transient while geometry, settings, plates and metadata affect saved state',()=>{
  const saved={...emptyProject(),objects:[createMesh({positions:[0,0,0,1,0,0,0,1,0],plateId:'plate-1'})]};
  assert.equal(projectHasChanges(saved,saved),false);
  assert.equal(projectHasChanges({...saved,selectedId:'another'},saved),false);
  assert.equal(projectHasChanges(structuredClone(saved),saved),false);
  for(const changed of [{...saved,name:'Changed'},{...saved,overrides:{layer_height:'.3'}},{...saved,objects:[{...saved.objects[0],position:[2,0,0]}]},{...saved,metadata:{author:'Editor'}},{...saved,plates:[...saved.plates,{id:'two',name:'Plate 2'}]}]) assert.equal(projectHasChanges(changed,saved),true);
  const changed=structuredClone(saved);changed.objects[0].positions[0]=1;assert.equal(projectHasChanges(changed,saved),true);
});
test('initial native preset resolution does not dirty an empty unnamed document',()=>{
  assert.equal(projectHasChanges({...emptyProject(),ids:{printerId:'p',processId:'q',filamentId:'r'}},null),false);
  assert.equal(projectHasChanges({...emptyProject(),overrides:{wall_loops:'4'}},null),true);
});
