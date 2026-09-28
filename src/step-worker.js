import createOCCT from 'occt-import-js';
import wasmUrl from 'occt-import-js/dist/occt-import-js.wasm?url';

self.onmessage = async event => {
  try {
    const occt = await createOCCT({ locateFile: name => name.endsWith('.wasm') ? wasmUrl : name, print: () => {}, printErr: () => {} });
    const result = occt.ReadStepFile(new Uint8Array(event.data.buffer), event.data.params);
    let triangles = 0;
    for (const mesh of result.meshes || []) { triangles += (mesh.index?.array?.length || 0) / 3; if (triangles > event.data.maxTriangles) throw new Error('STEP model exceeds the triangle import limit'); }
    self.postMessage({ result });
  } catch (error) { self.postMessage({ error: error.message || 'STEP import failed' }); }
};
