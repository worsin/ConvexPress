/** Pure same-installation conversion; the caller retains the original revision
 * and checks installed renderer/pack support before writing the candidate. */
import {legacyCompatibility} from './compatibility/legacy_schemas.mjs';
import {legacyTextToRichText} from './compatibility/rich_text.mjs';
import {validateBlockAttrs,validateBlockTreatment} from './generated/schemas';
import {validateCanonicalTree,CANONICAL_TREE_LIMITS} from './generated/instances';
import type {CanonicalTree} from './generated/types';
import {LegacyMigrationError} from './legacyDocumentMigration';
type Row=Record<string,unknown>;
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
export function migrateLegacyBlocks(input:unknown):CanonicalTree{
  let serialized:string;try{serialized=JSON.stringify(input);}catch{fail(['blocks'],'Legacy tree must be JSON');}
  if(!serialized||new TextEncoder().encode(serialized).length>CANONICAL_TREE_LIMITS.bytes)fail(['blocks'],'Legacy tree exceeds byte budget');
  if(!Array.isArray(input))fail(['blocks'],'Expected legacy block array');
  let count=0;
  const visit=(input:unknown,path:(string|number)[],depth:number):unknown=>{
    if(++count>CANONICAL_TREE_LIMITS.nodes||depth>CANONICAL_TREE_LIMITS.depth)fail(path,'Legacy tree exceeds depth/node budget');
    const row=object(input,path);
    for(const key of Object.keys(row))if(!['id','name','version','attrs','innerBlocks','layout','lock'].includes(key))fail([...path,key],'Unknown legacy envelope property');
    // Legacy rendering ignored layout and the old editor did not enforce locks.
    // Even overlapping canonical keys would silently activate new behavior.
    // Retain these in the source revision until an explicit intent review exists.
    if(row.layout!==undefined&&Object.keys(object(row.layout,[...path,'layout'])).length)fail([...path,'layout'],'Saved inactive layout needs an explicit intent review');
    if(row.lock!==undefined&&Object.values(object(row.lock,[...path,'lock'])).some(Boolean))fail([...path,'lock'],'Saved inactive locks need an explicit intent review');
    if(typeof row.name!=='string'||!own(legacyCompatibility,row.name))fail([...path,'name'],'No generated legacy schema');
    const definition=legacyCompatibility[row.name];
    if(row.version!==definition.fromVersion)fail([...path,'version'],'Legacy version differs from its compatibility source');
    rejectUnknown(row.attrs,definition.savedSchema as Schema,[...path,'attrs']);
    let attrs:Row;
    try{attrs=object(structuredClone(definition.renderedSchema.parse(row.attrs)),[...path,'attrs']);}catch{fail([...path,'attrs'],'Actual legacy renderer schema refuses this content');}
    const treatmentValues:Row={};
    for(const change of definition.transforms)transformAt(attrs,change.path,(owner,key,at)=>{
      if(change.kind==='empty-to-null'){if(owner[key]===''||(Array.isArray(owner[key])&&owner[key].length===0))owner[key]=null;}
      else if(change.kind==='text-to-richtext'){try{owner[key]=legacyTextToRichText(owner[key],change.mode);}catch{fail(at,'Legacy text cannot be represented losslessly');}}
      else{if(change.path.length!==1)fail(at,'Nested design intent requires an explicit treatment adapter');treatmentValues[key]=owner[key];delete owner[key];}
    },[...path,'attrs']);
    let treatment:unknown;
    if(Object.keys(treatmentValues).length){const keys=Object.keys(treatmentValues).sort();const matches=definition.treatments.filter(item=>JSON.stringify([...item.axes].sort())===JSON.stringify(keys));if(matches.length!==1)fail([...path,'treatment'],'Exact composable treatment mapping required');treatment={name:matches[0].name,values:treatmentValues};try{validateBlockTreatment(row.name,treatment);}catch{fail([...path,'treatment'],'Authored treatment axes exceed their exact target contract');}}
    let canonicalAttrs:unknown;try{canonicalAttrs=validateBlockAttrs(row.name,attrs);}catch{fail([...path,'attrs'],'Legacy rendered attrs require a further target adapter');}
    if(row.innerBlocks!==undefined&&!Array.isArray(row.innerBlocks))fail([...path,'innerBlocks'],'Legacy children must be an array');
    return {id:row.id,name:row.name,version:definition.toVersion,attrs:canonicalAttrs,...(treatment?{treatment}:{}),...(row.layout!==undefined?{layout:row.layout}:row.name==='reference/field-guide'&&treatment?{layout:{spacing:'none',width:'full'}}:{}),...(row.lock!==undefined?{lock:row.lock}:{}),...(row.innerBlocks!==undefined?{children:(row.innerBlocks as unknown[]).map((child,index)=>visit(child,[...path,'innerBlocks',index],depth+1))}:{})};
  };
  return validateCanonicalTree(input.map((row,index)=>visit(row,['blocks',index],1)));
}
