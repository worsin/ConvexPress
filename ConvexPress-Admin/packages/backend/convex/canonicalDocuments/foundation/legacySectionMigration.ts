/** Uses the exact existing Website section-to-block projection. Original source
 * stays in the safety revision; unsupported shell intent is never discarded. */
import {pageSectionsToBlocks} from './compatibility/legacy_schemas.mjs';
import {migrateLegacyBlocks} from './legacyBlockMigration';
import {LegacyMigrationError} from './legacyDocumentMigration';
import {CANONICAL_TREE_LIMITS} from './generated/instances';
const common=['eyebrow','heading','body'];
const sectionFields:Record<string,readonly string[]>={
 hero:['eyebrow','title','body','primaryCtaLabel','primaryCtaUrl','secondaryCtaLabel','secondaryCtaUrl','mediaId'],
 'feature-grid':[...common,'items'], 'cta-band':[...common,'primaryCtaLabel','primaryCtaUrl','secondaryCtaLabel','secondaryCtaUrl'],
 'story-split':[...common,'title','content','mediaId','mediaAlt','mediaPosition','ctaLabel','ctaUrl'],
 'pricing-cards':[...common,'title','content','plans','items'], 'testimonial-band':[...common,'title','content','items','testimonials'],
 'rich-text':[...common,'title','content'],
};
const itemFields:Record<string,readonly string[]>={'feature-grid':['title','description'],'pricing-cards':['name','title','price','description','body','features','ctaLabel','ctaUrl','featured'],'testimonial-band':['quote','body','name','author','role','title']};
export function migrateLegacySections(value:unknown){
  if(!Array.isArray(value)||value.length>CANONICAL_TREE_LIMITS.nodes)throw new LegacyMigrationError(['pageSections'],'Expected a bounded section array');
  let bytes:number;try{bytes=new TextEncoder().encode(JSON.stringify(value)).length;}catch{throw new LegacyMigrationError(['pageSections'],'Sections must be bounded JSON');}
  if(bytes>CANONICAL_TREE_LIMITS.bytes)throw new LegacyMigrationError(['pageSections'],'Section source exceeds byte budget');
  const sections=value.map((input,index)=>{
    const path=['pageSections',index];
    if(!input||typeof input!=='object'||Array.isArray(input))throw new LegacyMigrationError(path,'Expected an authored section');
    const row=input as Record<string,unknown>;
    for(const key of Object.keys(row))if(!['id','type','data','shell'].includes(key))throw new LegacyMigrationError([...path,key],'Unknown section envelope property');
    if(typeof row.id!=='string'||!row.id||typeof row.type!=='string'||!Object.prototype.hasOwnProperty.call(sectionFields,row.type))throw new LegacyMigrationError(path,'A stable persisted ID and supported section type are required');
    if(row.shell!==undefined&&row.shell!==null&&(!(typeof row.shell==='object')||Array.isArray(row.shell)||Object.keys(row.shell).length))throw new LegacyMigrationError([...path,'shell'],'Authored section shell requires an exact treatment adapter');
    const data=row.data??{};
    if(typeof data!=='object'||Array.isArray(data))throw new LegacyMigrationError([...path,'data'],'Expected section data');
    // Projection intentionally uses historical fallback precedence. Reject data
    // outside those known source fields rather than silently losing future fields.
    const keys=sectionFields[row.type];
    for(const [key,value] of Object.entries(data)){
      if(!keys.includes(key))throw new LegacyMigrationError([...path,'data',key],'Unknown authored section field');
      if(['items','plans','testimonials'].includes(key)){
        if(!Array.isArray(value)||value.length>100)throw new LegacyMigrationError([...path,'data',key],'Expected bounded section rows');
        for(const [i,item] of value.entries()){
          if(!item||typeof item!=='object'||Array.isArray(item))throw new LegacyMigrationError([...path,'data',key,i],'Expected a section row');
          for(const [field,entry] of Object.entries(item)){
            if(!itemFields[row.type]?.includes(field))throw new LegacyMigrationError([...path,'data',key,i,field],'Unknown section row field');
            const valid=field==='features'?Array.isArray(entry)&&entry.every(v=>typeof v==='string'):field==='featured'?typeof entry==='boolean':typeof entry==='string';
            if(!valid)throw new LegacyMigrationError([...path,'data',key,i,field],'Authored value would be coerced by the old projection');
          }
        }
      }else if(typeof value!=='string')throw new LegacyMigrationError([...path,'data',key],'Authored value would be coerced by the old projection');
    }
    return {id:row.id,type:row.type,data:data as Record<string,unknown>};
  });
  return migrateLegacyBlocks(pageSectionsToBlocks(sections));
}
