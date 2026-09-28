import {attachmentImageSource,attachmentInfo,decodeAttachment,normalizeAuxiliary,normalizeModelMetadata} from './native-auxiliary.js';
import {inspectThumbnail} from './native-assets.js';

export const IMAGE_WORKER_ID=Object.freeze({protocol:1,orcaVersion:'2.4.2',orcaRevision:'8500fcdccaa10b5099ac20d252af3a7c560046f1',wxVersion:'3.3.2',wxRevision:'88f3483ca546fbf4ad732e1acd94cc930935077a'});
export const NATIVE_COVER_SIZES=Object.freeze({cover:['thumbnail_3mf.png',240,240],small:['thumbnail_small.png',252,188],middle:['thumbnail_middle.png',680,680]});

// Publish the complete generated set as one project-history operation. Never
// retain half of an old cover set when generation or validation fails.
export function applyNativeCover(project,sourcePath,result){
  const current=normalizeAuxiliary(project.nativeAuxiliary),source=current?.files.find(file=>file.path===sourcePath),image=source&&attachmentImageSource(source);
  if(!image)throw new Error('The source cover picture no longer exists or is invalid.');
  if(!result||Object.entries(IMAGE_WORKER_ID).some(([key,value])=>result.provenance?.[key]!==value))throw new Error('Cover generation did not use the pinned native image worker.');
  if(result.sourceWidth!==image.width||result.sourceHeight!==image.height)throw new Error('Cover source dimensions changed.');
  const generated=[],covers={};
  for(const[kind,[name,width,height]]of Object.entries(NATIVE_COVER_SIZES)){
    const value=result.images?.[kind];
    if(value?.name!==name||value.width!==width||value.height!==height)throw new Error('Incomplete native cover image set.');
    const size=inspectThumbnail(decodeAttachment(value.data));
    if(size.width!==width||size.height!==height)throw new Error('Invalid native cover dimensions.');
    const path=`Auxiliaries/.thumbnails/${name}`;generated.push({path,data:value.data});covers[kind]=path;
  }
  const paths=new Set(generated.map(file=>file.path.normalize('NFC').toLocaleLowerCase('en-US')));
  const nativeAuxiliary=normalizeAuxiliary({version:1,files:[...current.files.filter(file=>!paths.has(file.path.normalize('NFC').toLocaleLowerCase('en-US'))),...generated],covers});
  const nativeModelMetadata=normalizeModelMetadata({...project.nativeModelMetadata,DesignerCover:attachmentInfo(source).name});
  return{...project,nativeAuxiliary,nativeModelMetadata};
}
