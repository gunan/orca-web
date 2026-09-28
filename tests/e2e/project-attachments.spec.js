import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {extractBoundedZip} from '../../shared/import-limits.js';
const fixture=path.resolve('tests/fixtures/native-gui-cube-2.4.2.3mf');
async function start(page){await page.goto('/');await expect(page.getByLabel('Layer height',{exact:true})).toBeEnabled();await page.getByLabel('Open Orca Web project').setInputFiles(fixture);await expect(page.getByText('Embedded native presets',{exact:true})).toBeVisible();await page.getByRole('button',{name:'Project',exact:true}).click();}
async function download(page,button){const waiting=page.waitForEvent('download');await button.click();return readFile(await(await waiting).path());}
test('project attachments download exact bytes, rename, undo deletion and travel with metadata through both save formats',async({page})=>{
  await start(page);await page.getByRole('tab',{name:/^Others/}).click();const bytes=Buffer.from('Assembly notes\nUse two M3 bolts.\n');
  await page.getByLabel('Add Others files',{exact:true}).setInputFiles({name:'assembly.txt',mimeType:'text/plain',buffer:bytes});await expect(page.getByRole('button',{name:'Download assembly.txt'})).toBeVisible();
  expect(await download(page,page.getByRole('button',{name:'Download assembly.txt'}))).toEqual(bytes);
  await page.getByRole('button',{name:'Rename assembly.txt'}).click();await page.getByLabel('File name',{exact:true}).fill('notes.txt');await page.getByRole('button',{name:'Save name'}).click();await expect(page.getByRole('button',{name:'Download notes.txt'})).toBeVisible();
  await page.getByRole('button',{name:'Delete notes.txt'}).click();await expect(page.getByText('No files in this category.')).toBeVisible();await page.getByRole('button',{name:'Undo',exact:true}).click();await expect(page.getByRole('button',{name:'Download notes.txt'})).toBeVisible();
  await page.getByLabel('Copyright',{exact:true}).fill('Example Designer');await page.getByLabel('License',{exact:true}).selectOption('BY-SA');
  const json=JSON.parse((await download(page,page.getByRole('contentinfo').getByRole('button',{name:'Save project',exact:true}))).toString());expect(json.nativeModelMetadata.License).toBe('BY-SA');expect(json.nativeAuxiliary.files[0].path).toBe('Auxiliaries/Others/notes.txt');expect(Buffer.from(json.nativeAuxiliary.files[0].data,'base64')).toEqual(bytes);
  const files=extractBoundedZip(await download(page,page.getByRole('button',{name:'Export native project',exact:true})));expect(Buffer.from(files['Auxiliaries/Others/notes.txt'])).toEqual(bytes);expect(Buffer.from(files['3D/3dmodel.model']).toString()).toContain('<metadata name="Copyright">Example Designer</metadata>');
});
test('duplicate or unsupported attachments fail visibly without overwriting the retained file or breaking the editor',async({page})=>{
  await start(page);await page.getByRole('tab',{name:/^Others/}).click();const upload=page.getByLabel('Add Others files',{exact:true});await upload.setInputFiles({name:'data.txt',mimeType:'text/plain',buffer:Buffer.from('original')});await expect(page.getByRole('button',{name:'Download data.txt'})).toBeVisible();
  await upload.setInputFiles({name:'DATA.TXT',mimeType:'text/plain',buffer:Buffer.from('replacement')});await expect(page.getByRole('alert')).toContainText('Duplicate');expect((await download(page,page.getByRole('button',{name:'Download data.txt'}))).toString()).toBe('original');
  await upload.setInputFiles({name:'program.html',mimeType:'text/html',buffer:Buffer.from('<script>throw new Error("must not execute")</script>')});await expect(page.getByRole('alert')).toContainText('Unsupported');await page.getByRole('button',{name:'Rename data.txt'}).click();await page.getByLabel('File name',{exact:true}).fill('../outside.txt');await page.getByRole('button',{name:'Save name'}).click();await expect(page.getByRole('alert')).toContainText('Invalid');await page.getByRole('button',{name:'Cancel rename'}).click();await expect(page.getByRole('button',{name:'Download data.txt'})).toBeEnabled();
});
test('attachment reads cannot modify a project changed while the file was loading',async({page})=>{
  await page.addInitScript(()=>{const read=File.prototype.arrayBuffer;File.prototype.arrayBuffer=function(){if(this.name==='slow.txt')return new Promise(resolve=>{window.releaseAttachment=()=>resolve(read.call(this));});return read.call(this);};});
  await start(page);await page.getByRole('tab',{name:/^Others/}).click();await page.getByLabel('Add Others files',{exact:true}).setInputFiles({name:'slow.txt',mimeType:'text/plain',buffer:Buffer.from('pending')});await expect(page.getByRole('button',{name:'Reading files…'})).toBeVisible();await page.getByLabel('Project name',{exact:true}).fill('Changed during read');await page.evaluate(()=>window.releaseAttachment());await expect(page.getByRole('alert')).toContainText('project changed');await expect(page.getByRole('button',{name:'Download slow.txt'})).toHaveCount(0);
});
