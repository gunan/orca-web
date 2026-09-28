import {XMLParser,XMLValidator} from 'fast-xml-parser';
import {strFromU8} from 'fflate';
/** Browser routing hint; the worker also executes native PrusaFileParser.
 * Do not substitute this for archive safety or native format validation. */
export function isPrusaProject(entries){
 const bytes=entries['3D/3dmodel.model'];if(!bytes||entries['3D/_rels/3dmodel.model.rels'])return false;
 const text=strFromU8(bytes);if(/<!DOCTYPE|<!ENTITY/i.test(text)||XMLValidator.validate(text)!==true)throw new Error('Invalid3MF model XML');
 const model=new XMLParser({ignoreAttributes:false,parseTagValue:false,parseAttributeValue:false}).parse(text).model;
 const metadata=model?.metadata==null?[]:Array.isArray(model.metadata)?model.metadata:[model.metadata];
 return metadata.some(item=>String(item['@_name']||'').includes('Application')&&String(item['#text']||'').includes('PrusaSlicer'));
}
