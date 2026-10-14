/** Pure same-installation conversion; the caller retains the original revision
 * and checks installed renderer/pack support before writing the candidate. */
import {legacyCompatibility} from './compatibility/legacy_schemas.mjs';
import {legacyTextToRichText} from './compatibility/rich_text.mjs';
import {validateBlockAttrs,validateBlockTreatment} from './generated/schemas';
import {validateCanonicalTree,CANONICAL_TREE_LIMITS} from './generated/instances';
import type {CanonicalTree} from './generated/types';
import {inactiveLegacySettingsSchema, type InactiveLegacySettings} from './migrationContracts';
import {LegacyMigrationError,convertLegacyDocumentNode,legacyHtmlRichTextSegments,type LegacyBlockAllocator} from './legacyDocumentMigration';
import type {LegacyHtmlParagraph} from './legacyHtmlMigration';
type Row=Record<string,unknown>;
type Path=(string|number)[];
type Schema={shape?:Record<string,Schema>;element?:Schema;unwrap?:()=>Schema;_zod?:{def?:{innerType?:Schema}}};
const own=(value:object,key:string)=>Object.prototype.hasOwnProperty.call(value,key);
function fail(path:(string|number)[],message:string):never{throw new LegacyMigrationError(path,message);}
function object(value:unknown,path:(string|number)[]):Row{if(!value||typeof value!=='object'||Array.isArray(value))fail(path,'Expected a legacy object');return value as Row;}
function rejectUnknown(value:unknown,schema:Schema,path:(string|number)[]):void{
  let current=schema,depth=0;
  while(!current.shape&&!current.element&&(current.unwrap||current._zod?.def?.innerType)){
    if(++depth>16)fail(path,'Legacy schema wrapper depth exceeded');
    current=current.unwrap?current.unwrap():current._zod!.def!.innerType!;
  }
  if(current.shape&&value!==null&&value!==undefined){const row=object(value,path);for(const key of Object.keys(row)){if(!own(current.shape,key))fail([...path,key],'Unknown authored field cannot be discarded');rejectUnknown(row[key],current.shape[key],[...path,key]);}}
  if(current.element&&Array.isArray(value))value.forEach((item,index)=>rejectUnknown(item,current.element!,[...path,index]));
}
function transformAt(root:unknown,path:readonly string[],fn:(owner:Row,key:string,at:(string|number)[])=>void,at:(string|number)[]):void{
  const [key,...rest]=path;
  if(key==='*'){if(!Array.isArray(root))fail(at,'Expected legacy repeated values');root.forEach((item,index)=>rest.length?transformAt(item,rest,fn,[...at,index]):fn(root as unknown as Row,String(index),[...at,index]));}
  else if(root&&typeof root==='object'&&own(root,key)){const row=root as Row;if(rest.length)transformAt(row[key],rest,fn,[...at,key]);else fn(row,key,[...at,key]);}
}
/** How the source site authored rich text. `plain`, the generated legacy
 * contract, splits prose on blank lines. `html` declares that the old renderer
 * displayed it as HTML; it is parsed with the article importer's allow-list. */
export type LegacyRichTextFormat='plain'|'html';
export type LegacyBlockOptions={richTextFormat?:LegacyRichTextFormat};
/** Block fields a caller may declare as HTML. Lists are separate canonical
 * blocks, so such a block can become several sibling blocks. */
const htmlRichTextFields:Readonly<Record<string,string>>={'core/rich-text':'body'};
// The article importer's markup test: untagged text keeps the plain conversion.
const markup=/<[!/?a-z]/iu;
const characterReference=/&(?:#[0-9]+|#x[0-9a-f]+|[a-z][a-z0-9]*);/iu;
// The generated instance contract allows identifiers of at most 128 characters.
const MAX_BLOCK_ID_LENGTH=128;
export function migrateLegacyBlocks(input:unknown):CanonicalTree {
  return convertLegacyBlocks(input, false, {}).blocks;
}
export function reviewLegacyBlocks(input:unknown, options:LegacyBlockOptions={}):{blocks:CanonicalTree;inactiveSettings:InactiveLegacySettings[]} {
  return convertLegacyBlocks(input, true, options);
}
/** Every identity the source blocks declare, bounded like the conversion: a
 * larger or deeper tree is refused before its conversion completes. */
function sourceIds(blocks:readonly unknown[]):Set<string>{
  const ids=new Set<string>(),pending:{rows:readonly unknown[];depth:number}[]=[{rows:blocks,depth:1}];
  let seen=0;
  for(let level=pending.pop();level;level=pending.pop()){
    if(level.depth>CANONICAL_TREE_LIMITS.depth)continue;
    for(const row of level.rows){
      if(++seen>CANONICAL_TREE_LIMITS.nodes)return ids;
      if(!row||typeof row!=='object')continue;
      if('id' in row&&typeof row.id==='string')ids.add(row.id);
      if('innerBlocks' in row&&Array.isArray(row.innerBlocks))pending.push({rows:row.innerBlocks,depth:level.depth+1});
    }
  }
  return ids;
}
/** The HTML a declared field holds; undefined keeps the plain conversion. */
function declaredHtml(value:unknown,path:Path):string|undefined{
  if(typeof value!=='string')return undefined;
  if(markup.test(value))return value;
  // The old renderer displayed a character reference decoded; plain text would show it literally.
  if(characterReference.test(value))fail(path,'Character references in untagged HTML text require review');
  return undefined;
}
/** One legacy block whose field holds HTML becomes, in document order, a block
 * of its own kind per run of paragraphs and a canonical list per HTML list.
 * The first block keeps the source identity and the block's other fields;
 * later blocks take `${id}-2`, `${id}-3`, ... skipping identities in use. */
function expandHtmlRichText(source:{id:string;name:string;version:number;field:string;attrs:Row;html:string},path:Path,depth:number,taken:Set<string>,spend:(path:Path,depth:number)=>void):unknown[]{
  const {id,name,version,field,attrs}=source;
  const at=[...path,'attrs',field],empty=():{type:'doc';content:LegacyHtmlParagraph[]}=>({type:'doc',content:[]});
  let withFields:unknown,defaults:unknown;
  try{withFields=validateBlockAttrs(name,{...attrs,[field]:empty()});defaults=validateBlockAttrs(name,{[field]:empty()});}
  catch{fail([...path,'attrs'],'Legacy rendered attrs require a further target adapter');}
  const segments=legacyHtmlRichTextSegments(source.html,at);
  // Fields such as a heading display before the HTML, so they lead a list too.
  if(!segments.length||(segments[0].kind==='list'&&JSON.stringify(withFields)!==JSON.stringify(defaults)))segments.unshift({kind:'rich-text',body:empty(),path:at});
  let suffix=1;
  const identity=():string=>{
    if(suffix===1){suffix=2;return id;}
    while(taken.has(`${id}-${suffix}`))suffix++;
    const derived=`${id}-${suffix++}`;
    if(derived.length>MAX_BLOCK_ID_LENGTH)fail([...path,'id'],'A derived block identity exceeds the canonical identifier limit');
    taken.add(derived);
    return derived;
  };
  const allocator:LegacyBlockAllocator={identity,spend};
  let first=true;
  return segments.map(segment=>{
    if(segment.kind==='list')return convertLegacyDocumentNode(segment.list,segment.path,depth,allocator);
    const blockId=identity();
    spend(segment.path,depth);
    let validated:unknown;
    try{validated=validateBlockAttrs(name,first?{...attrs,[field]:segment.body}:{[field]:segment.body});}
    catch{fail(segment.path,'HTML rich text exceeds the canonical rich-text text or node budget');}
    first=false;
    return {id:blockId,name,version,attrs:validated};
  });
}
function convertLegacyBlocks(input:unknown, reviewInactive:boolean, options:LegacyBlockOptions):{blocks:CanonicalTree;inactiveSettings:InactiveLegacySettings[]} {
  const inactiveSettings:InactiveLegacySettings[]=[];
  let serialized:string;try{serialized=JSON.stringify(input);}catch{fail(['blocks'],'Legacy tree must be JSON');}
  if(!serialized||new TextEncoder().encode(serialized).length>CANONICAL_TREE_LIMITS.bytes)fail(['blocks'],'Legacy tree exceeds byte budget');
  if(!Array.isArray(input))fail(['blocks'],'Expected legacy block array');
  let count=0;
  const spend=(path:Path,depth:number)=>{if(++count>CANONICAL_TREE_LIMITS.nodes||depth>CANONICAL_TREE_LIMITS.depth)fail(path,'Legacy tree exceeds depth/node budget');};
  // Identities of source blocks, so derived sibling identities never claim one.
  const taken=options.richTextFormat==='html'?sourceIds(input):new Set<string>();
  const visit=(input:unknown,path:Path,depth:number):unknown[]=>{
    spend(path,depth);
    const row=object(input,path);
    for(const key of Object.keys(row))if(!['id','name','version','attrs','innerBlocks','layout','lock'].includes(key))fail([...path,key],'Unknown legacy envelope property');
    // Validate even inactive values: an unknown envelope must not disappear.
    let settings:InactiveLegacySettings;
    try { settings=inactiveLegacySettingsSchema.parse({blockId:row.id,name:row.name,...(row.layout!==undefined?{layout:row.layout}:{}),...(row.lock!==undefined?{lock:row.lock}:{})}); }
    catch { fail(path,'Saved layout or lock settings differ from the legacy contract'); }
    const hasLayout=settings.layout && Object.keys(settings.layout).length>0;
    const hasLocks=settings.lock && Object.values(settings.lock).some(Boolean);
    if(hasLayout||hasLocks) {
      if(!reviewInactive) fail([...path,hasLayout?'layout':'lock'],'Saved inactive settings need an explicit intent review');
      inactiveSettings.push(settings);
    }
    if(typeof row.name!=='string'||!own(legacyCompatibility,row.name))fail([...path,'name'],'No generated legacy schema');
    const definition=legacyCompatibility[row.name];
    if(row.version!==definition.fromVersion)fail([...path,'version'],'Legacy version differs from its compatibility source');
    rejectUnknown(row.attrs,definition.savedSchema as Schema,[...path,'attrs']);
    let attrs:Row;
    try{attrs=object(structuredClone(definition.renderedSchema.parse(row.attrs)),[...path,'attrs']);}catch{fail([...path,'attrs'],'Actual legacy renderer schema refuses this content');}
    const htmlField=options.richTextFormat==='html'&&own(htmlRichTextFields,row.name)?htmlRichTextFields[row.name]:undefined;
    const html=htmlField===undefined?undefined:declaredHtml(attrs[htmlField],[...path,'attrs',htmlField]);
    const treatmentValues:Row={};
    for(const change of definition.transforms)if(html===undefined||change.kind!=='text-to-richtext'||change.path.join('.')!==htmlField)transformAt(attrs,change.path,(owner,key,at)=>{
      if(change.kind==='empty-to-null'){if(owner[key]===''||(Array.isArray(owner[key])&&owner[key].length===0))owner[key]=null;}
      else if(change.kind==='text-to-richtext'){try{owner[key]=legacyTextToRichText(owner[key],change.mode);}catch{fail(at,'Legacy text cannot be represented losslessly');}}
      else{if(change.path.length!==1)fail(at,'Nested design intent requires an explicit treatment adapter');treatmentValues[key]=owner[key];delete owner[key];}
    },[...path,'attrs']);
    let treatment:unknown;
    if(Object.keys(treatmentValues).length){const keys=Object.keys(treatmentValues).sort();const matches=definition.treatments.filter(item=>JSON.stringify([...item.axes].sort())===JSON.stringify(keys));if(matches.length!==1)fail([...path,'treatment'],'Exact composable treatment mapping required');treatment={name:matches[0].name,values:treatmentValues};try{validateBlockTreatment(row.name,treatment);}catch{fail([...path,'treatment'],'Authored treatment axes exceed their exact target contract');}}
    if(html!==undefined&&htmlField!==undefined){
      if(treatment!==undefined)fail([...path,'treatment'],'A block expanded from HTML cannot carry a treatment');
      if(row.innerBlocks!==undefined)fail([...path,'innerBlocks'],'A block expanded from HTML cannot carry children');
      if(typeof row.id!=='string')fail([...path,'id'],'A block expanded from HTML requires its persisted identity');
      count--; // The blocks it becomes replace the source block in the budget.
      return expandHtmlRichText({id:row.id,name:row.name,version:definition.toVersion,field:htmlField,attrs,html},path,depth,taken,spend);
    }
    let canonicalAttrs:unknown;try{canonicalAttrs=validateBlockAttrs(row.name,attrs);}catch{fail([...path,'attrs'],'Legacy rendered attrs require a further target adapter');}
    if(row.innerBlocks!==undefined&&!Array.isArray(row.innerBlocks))fail([...path,'innerBlocks'],'Legacy children must be an array');
    const preservesOwnSpacing = ['reference/field-guide','core/divider','core/spacer'].includes(row.name) && treatment;
    return [{id:row.id,name:row.name,version:definition.toVersion,attrs:canonicalAttrs,...(treatment?{treatment}:{}),...(preservesOwnSpacing?{layout:{spacing:'none',width:'full'}}:{}),...(row.innerBlocks!==undefined?{children:(row.innerBlocks as unknown[]).flatMap((child,index)=>visit(child,[...path,'innerBlocks',index],depth+1))}:{})}];
  };
  return {blocks:validateCanonicalTree(input.flatMap((row,index)=>visit(row,['blocks',index],1))),inactiveSettings};
}
