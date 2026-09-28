import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {mkdtemp,mkdir,writeFile,symlink,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createFontService} from '../../server/fonts.js';
import {testFont} from '../fixtures/text-font.js';

test('font service serves only allowlisted native bundled files and their attribution, rejecting links and path requests',async t=>{
  const directory=await mkdtemp(path.join(tmpdir(),'orca-fonts-'));t.after(()=>rm(directory,{recursive:true,force:true}));await mkdir(path.join(directory,'fonts'));const font=Buffer.from(testFont().toArrayBuffer());
  await writeFile(path.join(directory,'fonts','Sarabun-Medium.otf'),font);await writeFile(path.join(directory,'fonts','OFL.txt'),'Synthetic test font license');await writeFile(path.join(directory,'secret.txt'),'not a font');await symlink(path.join(directory,'secret.txt'),path.join(directory,'fonts','External.ttf'));
  const service=createFontService({resourcesDir:directory}),app=express();app.use('/api/fonts',service.router);const server=await new Promise(resolve=>{const value=app.listen(0,'127.0.0.1',()=>resolve(value));});t.after(()=>new Promise(resolve=>server.close(resolve)));const url=`http://127.0.0.1:${server.address().port}/api/fonts`;
  const catalog=await(await fetch(url)).json();assert.equal(catalog.fonts.length,1);assert.equal(catalog.defaultId,catalog.fonts[0].id);assert.ok(!JSON.stringify(catalog).includes(directory));const id=catalog.defaultId;
  assert.deepEqual(Buffer.from(await(await fetch(`${url}/${id}`)).arrayBuffer()),font);assert.equal((await(await fetch(`${url}/${id}/metadata`)).json()).family,'Test Ring');assert.equal(await(await fetch(`${url}/license`)).text(),'Synthetic test font license');
  for(const request of ['no-such-font','External.ttf','%2e%2e%2fsecret.txt'])assert.equal((await fetch(`${url}/${request}`)).status,404);
  await rm(path.join(directory,'fonts','Sarabun-Medium.otf'));await symlink(path.join(directory,'secret.txt'),path.join(directory,'fonts','Sarabun-Medium.otf'));assert.equal((await fetch(`${url}/${id}`)).status,503);
});
