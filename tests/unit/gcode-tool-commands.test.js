import test from 'node:test';import assert from 'node:assert/strict';import{parseGcode}from'../../shared/gcode.js';
test('preview changes tools only for leading T commands, never heater or acceleration parameters',()=>{
 const result=parseGcode('G90\nM83\nG1 X0 Y0 Z.2\nT1\nG1 X1 E.1\nM204 P3000 T3000\nG1 X2 E.1\nM104 S220 T0\nG1 X3 E.1\nG10 P0 T4\nG1 X4 E.1\nN50 T2*18\nG1 X5 E.1\nM117 TOOL T0\nG1 X6 E.1\nT1.5\nG1 X7 E.1');assert.deepEqual(result.segments.filter(s=>s.kind==='extrusion').map(s=>s.tool),[1,1,1,1,2,2,2]);
});
