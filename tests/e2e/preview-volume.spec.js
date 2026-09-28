import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {nativePreviewVolumeVertexShader} from '../../src/preview-volume-shader.js';
import {parseGcode} from '../../shared/gcode.js';
import {derivePreviewAttributes} from '../../shared/gcode-attributes.js';
import {buildPreviewVolumeData} from '../../shared/preview-volume.js';
import {selectPreviewSegments} from '../../shared/gcode-preview.js';
const code='; filament_diameter: 1.75\nG90\nM83\nG92 X0 Y0 Z0 E0\n;LAYER_CHANGE\n;Z:0.2\n;HEIGHT:0.2\n;WIDTH:0.4\n;TYPE:Outer wall\nG1 X10 E1 F1200\n;WIDTH:0.6\n;TYPE:Sparse infill\nG1 Y10 E1 F2400\n;LAYER_CHANGE\n;Z:0.4\n;HEIGHT:0.4\n;WIDTH:0.8\nG1 X0 E1 F1200\nG1 X5 F3000\n';
async function preview(page,text){
 const errors=[];page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/api/jobs',route=>route.request().method()==='POST'?route.fulfill({status:202,json:{id:'volume-fixture',filename:'cube.stl',status:'ready'}}):route.continue());
 await page.route('**/api/jobs/volume-fixture/download',route=>route.fulfill({status:200,contentType:'text/plain',body:text}));
 await page.goto('/');await expect(page.getByLabel('Layer height',{exact:true})).toBeEnabled();await page.getByLabel('Choose a 3D model').setInputFiles(path.resolve('tests/fixtures/cube.stl'));await page.getByRole('button',{name:'Slice model',exact:true}).click();await expect(page.getByRole('heading',{name:'G-code toolpath preview'})).toBeVisible();
 return errors;
}
test('production WebGL segment vertices match the independent native C++ shader reference for camera/cap/turn branches',async({page})=>{
 const fixture=JSON.parse(await readFile(new URL('../fixtures/native-preview-volume-reference.json',import.meta.url),'utf8'));
 await page.goto('/');
 const actual=await page.evaluate(({shader,cases})=>{
  const canvas=document.createElement('canvas'),gl=canvas.getContext('webgl2');if(!gl)throw Error('WebGL2 required');
  function compile(type,source){const value=gl.createShader(type);gl.shaderSource(value,source);gl.compileShader(value);if(!gl.getShaderParameter(value,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(value));return value;}
  const source='#version 300 es\n'+shader.replace('out vec3 color;','out vec3 color;\nout vec3 native_probe_position;').replace('  gl_Position =','  native_probe_position = pos;\n  gl_Position =');
  const program=gl.createProgram();gl.attachShader(program,compile(gl.VERTEX_SHADER,source));gl.attachShader(program,compile(gl.FRAGMENT_SHADER,'#version 300 es\nprecision highp float;out vec4 c;void main(){c=vec4(1);}'));gl.transformFeedbackVaryings(program,['native_probe_position'],gl.INTERLEAVED_ATTRIBS);gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));gl.useProgram(program);
  const vao=gl.createVertexArray();gl.bindVertexArray(vao);const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([0,1,2,3,4,5,6,7]),gl.STATIC_DRAW);const id=gl.getAttribLocation(program,'native_vertex_id');gl.enableVertexAttribArray(id);gl.vertexAttribPointer(id,1,gl.FLOAT,false,0,0);
  const feedback=gl.createTransformFeedback();gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK,feedback);const output=gl.createBuffer();gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER,0,output);gl.bufferData(gl.TRANSFORM_FEEDBACK_BUFFER,8*3*4,gl.STREAM_READ);
  const identity=new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);for(const name of ['viewMatrix','projectionMatrix'])gl.uniformMatrix4fv(gl.getUniformLocation(program,name),false,identity);
  const results=[];gl.enable(gl.RASTERIZER_DISCARD);
  for(const row of cases){for(const[name,value]of[['native_start',row.start],['native_end',row.end],['native_hwa_start',row.hwaStart],['native_hwa_end',row.hwaEnd],['native_color_start',[1,1,1]],['native_color_end',[1,1,1]]]){const location=gl.getAttribLocation(program,name);if(location>=0){if(name.startsWith('native_hwa'))gl.vertexAttrib4fv(location,[...value,0]);else gl.vertexAttrib3fv(location,value);}}gl.uniform3fv(gl.getUniformLocation(program,'camera_position'),row.camera);gl.beginTransformFeedback(gl.POINTS);gl.drawArrays(gl.POINTS,0,8);gl.endTransformFeedback();const value=new Float32Array(24);gl.getBufferSubData(gl.TRANSFORM_FEEDBACK_BUFFER,0,value);results.push(Array.from(value));}
  gl.disable(gl.RASTERIZER_DISCARD);const error=gl.getError();gl.getExtension('WEBGL_lose_context')?.loseContext();if(error!==gl.NO_ERROR)throw Error('WebGL error '+error);return results;
 },{shader:nativePreviewVolumeVertexShader,cases:fixture.cases});
 expect(actual).toHaveLength(16);
 // GPU sin/cos and normalization may use different float approximations than libc.
 // A 0.1 micron bound plus two float32 ULPs at large machine coordinates preserves
 // the native shape while allowing that documented shader arithmetic variation.
 for(let c=0;c<fixture.cases.length;c++)fixture.cases[c].vertices.flat().forEach((expected,index)=>{expect(Math.abs(actual[c][index]-expected),`${fixture.cases[c].name} vertex coordinate ${index}`).toBeLessThanOrEqual(Math.max(0.0001,Math.abs(expected)*0.0000002));});
});
test('solid and fallback geometry share feature/layer/move visibility and render without shader errors',async({page})=>{
 const errors=await preview(page,code),canvas=page.getByRole('img',{name:'3D G-code toolpaths'});
 await expect(canvas).toHaveAttribute('data-visible-volumes','3');await expect(canvas).toHaveAttribute('data-volume-triangles','24');await expect(canvas).toHaveAttribute('data-visible-fallback-lines','0');
 await page.getByLabel('Show travel and retractions').check();await expect(canvas).toHaveAttribute('data-visible-fallback-lines','1');await page.getByLabel('Visible toolpath segments').fill('1');await expect(canvas).toHaveAttribute('data-visible-volumes','1');await expect(canvas).toHaveAttribute('data-visible-fallback-lines','0');
 await page.getByLabel('Show Outer wall toolpaths').uncheck();await expect(canvas).toHaveAttribute('data-visible-volumes','0');await page.getByLabel('Visible toolpath segments').fill('3');await expect(canvas).toHaveAttribute('data-visible-volumes','2');await expect(canvas).toHaveAttribute('data-visible-fallback-lines','1');
 await page.getByLabel('Last preview layer').fill('0');await expect(canvas).toHaveAttribute('data-visible-volumes','1');await expect(canvas).toHaveAttribute('data-visible-fallback-lines','0');
 await page.getByRole('button',{name:'Hide all features'}).click();await expect(canvas).toHaveAttribute('data-visible-volumes','0');await page.getByRole('button',{name:'Show all features'}).click();await expect(canvas).toHaveAttribute('data-visible-volumes','2');
 await page.getByRole('button',{name:'Play toolpath playback'}).click();await expect(page.getByRole('button',{name:'Play toolpath playback'})).toBeVisible();await expect(canvas).toHaveAttribute('data-visible-volumes','2');
 expect(errors).toEqual([]);await page.screenshot({path:test.info().outputPath('solid-paths.png')});
});
test('missing dimensions retain visible lines and never acquire invented solid geometry',async({page})=>{
 const errors=await preview(page,code.replace(/^;(?:WIDTH|HEIGHT):.*\n/gm,'')),canvas=page.getByRole('img',{name:'3D G-code toolpaths'});await expect(canvas).toHaveAttribute('data-visible-volumes','0');await expect(canvas).toHaveAttribute('data-visible-fallback-lines','3');await expect(page.getByTestId('volume-availability')).toContainText('0 / 3');expect(errors).toEqual([]);
});
test('actual native GUI extrusion geometry follows the independently selected source segments',async({page})=>{
 const text=await readFile(path.resolve('tests/fixtures/native-gui-shrink98-2.4.2.gcode'),'utf8'),parsed=parseGcode(text,{includeSource:true}),data=buildPreviewVolumeData(parsed,derivePreviewAttributes(parsed));const errors=await preview(page,text),canvas=page.getByRole('img',{name:'3D G-code toolpaths'});expect(data.knownCount).toBe(6896);await expect(canvas).toHaveAttribute('data-visible-volumes','6896');
 await page.getByLabel('First preview layer').fill('50');await page.getByLabel('Last preview layer').fill('50');const selection=selectPreviewSegments(parsed,{firstLayer:50,lastLayer:50}),count=selection.indices.filter(index=>data.segments[index]).length;expect(count).toBeGreaterThan(20);await expect(canvas).toHaveAttribute('data-visible-volumes',String(count));await expect(canvas).toHaveAttribute('data-volume-triangles',String(count*8));await page.getByRole('button',{name:'Fit toolpaths'}).click();await page.getByLabel('Toolpath color mode').selectOption('width');await expect(canvas).toHaveAttribute('data-visible-volumes',String(count));await page.screenshot({path:test.info().outputPath('native-solid-layer.png')});expect(errors).toEqual([]);
});

// These fixtures exercise the bounded source-only parser; native processing has separate real-worker coverage.
test.beforeEach(async({page})=>{await page.route('**/api/jobs/native-preview/capabilities',route=>route.fulfill({status:200,json:{available:false,error:'Source-only preview fixture'}}));});
