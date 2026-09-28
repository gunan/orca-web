import express from 'express';
import { createHash } from 'node:crypto';
import { readFile,readdir,realpath,stat } from 'node:fs/promises';
import path from 'node:path';
import { fontAttribution,parseTextFont,TEXT_LIMITS } from '../shared/text-geometry.js';

/** Only the explicitly configured or installed Orca Resources/fonts directory
 * is served. Request values are opaque IDs looked up in a private allowlist. */
export function createFontService({resourcesDir=process.env.ORCA_RESOURCES_DIR,binary=process.env.ORCA_SLICER_BIN}={}){
  const router=express.Router();let inventory;
  async function catalog(){
    if(inventory)return inventory;
    const candidates=resourcesDir?[path.join(resourcesDir,'fonts')]:[...(binary&&path.isAbsolute(binary)?[path.resolve(path.dirname(binary),'../Resources/fonts'),path.resolve(path.dirname(binary),'../resources/fonts')]:[]),...(process.platform==='darwin'?['/Applications/OrcaSlicer.app/Contents/Resources/fonts']:[]),'/usr/share/OrcaSlicer/fonts','/usr/local/share/OrcaSlicer/fonts','/opt/orca-slicer/resources/fonts'];
    let directory;for(const candidate of candidates){try{const canonical=await realpath(candidate);if((await stat(canonical)).isDirectory()){directory=canonical;break;}}catch{}}
    if(!directory)throw new Error('Bundled Orca fonts were not found. Configure ORCA_RESOURCES_DIR.');
    const records=new Map();
    for(const entry of await readdir(directory,{withFileTypes:true})){if(!entry.isFile()||!/\.(ttf|otf)$/i.test(entry.name))continue;const filename=path.join(directory,entry.name),canonical=await realpath(filename);if(path.dirname(canonical)!==directory)continue;const info=await stat(canonical);if(info.size<12||info.size>TEXT_LIMITS.fontBytes)continue;const id=createHash('sha256').update(entry.name).digest('hex').slice(0,20);records.set(id,{id,name:entry.name.replace(/\.[^.]+$/,'').replaceAll('_',' '),filename:canonical,bytes:info.size,extension:path.extname(entry.name)});}
    if(!records.size)throw new Error('No supported bundled TTF or OTF fonts were found');inventory={directory,records};return inventory;
  }
  async function record(id){const item=(await catalog()).records.get(id);if(!item){const error=new Error('Bundled font not found');error.status=404;throw error;}return item;}
  async function bytes(id){const item=await record(id),current=await realpath(item.filename);if(current!==item.filename||path.dirname(current)!==(await catalog()).directory)throw new Error('Bundled font changed outside its allowed directory');const info=await stat(current);if(info.size>TEXT_LIMITS.fontBytes)throw new Error('Font exceeds the 32 MB limit');return readFile(current);}
  const handle=fn=>async(req,res)=>{try{await fn(req,res);}catch(error){res.status(error.status||503).json({error:error.message});}};
  router.get('/',handle(async(req,res)=>{const fonts=[...(await catalog()).records.values()].map(({id,name,bytes})=>({id,name,bytes})).sort((a,b)=>a.name.localeCompare(b.name));res.json({fonts,defaultId:fonts.find(font=>font.name==='Sarabun-Medium')?.id||fonts[0].id,source:'Installed OrcaSlicer bundled fonts',licenseUrl:'/api/fonts/license'});}));
  router.get('/license',handle(async(req,res)=>{const filename=path.join((await catalog()).directory,'OFL.txt'),canonical=await realpath(filename);if(path.dirname(canonical)!==(await catalog()).directory)throw new Error('Bundled font license is outside its allowed directory');if((await stat(canonical)).size>1024*1024)throw new Error('Bundled font license is too large');res.type('text/plain').send(await readFile(canonical,'utf8'));}));
  router.get('/:id/metadata',handle(async(req,res)=>res.json(fontAttribution(parseTextFont(await bytes(req.params.id))))));
  router.get('/:id',handle(async(req,res)=>{const item=await record(req.params.id);res.set('Cache-Control','private, max-age=3600').type(item.extension==='.otf'?'font/otf':'font/ttf').send(await bytes(item.id));}));
  return{router,catalog,bytes};
}
