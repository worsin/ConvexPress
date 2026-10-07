/** Site-owned language settings are authored aggregates, not customer data. */
import {promotionDataSchemas,type ContentPromotionManifest,type PromotionKind} from '@convexpress/site-contract/content-promotion';
import type {QueryCtx,MutationCtx} from '../_generated/server';
import type {Id} from '../_generated/dataModel';
import {validateLocales} from '../localization/model';
import {fail,hash,referencedKey,type Row} from './shared';
import type {Plan} from './planner';
type Routing=ReturnType<typeof promotionDataSchemas.localeRouting.parse>;
type Group=ReturnType<typeof promotionDataSchemas.localeGroup.parse>;
export const isLocaleKind=(kind:string):kind is 'localeRouting'|'localeGroup'=>kind==='localeRouting'||kind==='localeGroup';
export async function readLocaleGroup(ctx:Pick<QueryCtx,'db'>,row:Row):Promise<Row>{
 const id=ctx.db.normalizeId('locale_translation_groups',row._id);
 if(!id)fail('PROMOTION_MAPPING_INVALID','Invalid translation group identity.');
 const rows=await ctx.db.query('locale_translations').withIndex('by_group',q=>q.eq('groupId',id)).take(25);
 if(rows.length>24)fail('PROMOTION_LOCALIZATION_LIMIT','A translation group exceeds 24 entries; no partial group can be promoted.');
 return {...row,translations:rows.map(r=>({code:r.code,documentId:r.documentId})).sort((a,b)=>a.code.localeCompare(b.code))};
}
function validateGroups(routing:Routing,groups:Group[],documentType?:(id:string)=>string|undefined){
 validateLocales(routing.locales as Parameters<typeof validateLocales>[0],routing.enabled);
 const keys=new Set<string>(),assigned=new Set<string>();
 for(const group of groups){
  if(keys.has(group.key))fail('PROMOTION_DUPLICATE_IDENTITY','Translation group keys must be unique.');keys.add(group.key);
  const codes=new Set<string>();let type:string|undefined;
  for(const entry of group.translations){
   if(codes.has(entry.code)||assigned.has(entry.documentId))fail('PROMOTION_LOCALE_DUPLICATE','Choose one document per language and one translation group per document.');
   codes.add(entry.code);assigned.add(entry.documentId);
   if(!routing.locales.some(l=>l.code===entry.code))fail('PROMOTION_LOCALE_NOT_CONFIGURED','Configure every selected translation language.');
   if(routing.locales.some(l=>l.landingPageId===entry.documentId&&l.code!==entry.code))fail('PROMOTION_LOCALE_LANGUAGE','A landing page cannot be assigned to another language.');
   if(documentType){const next=documentType(entry.documentId);if(!next||type&&type!==next)fail('PROMOTION_LOCALE_DOCUMENT','A group needs existing documents of one type.');type=next;}
  }
 }
}
export function validateLocalizationManifest(manifest:ContentPromotionManifest){
 const records=manifest.records.filter(r=>isLocaleKind(r.kind));
 if(!records.length){if(manifest.selection.includeLocalization || manifest.selection.localeGroupKeys?.length)fail('PROMOTION_LOCALE_CONFIGURATION','Selected language settings are missing from this manifest.');return;}
 for(const key of manifest.selection.localeGroupKeys??[])if(!records.some(r=>r.kind==='localeGroup'&&r.data.key===key))fail('PROMOTION_LOCALE_GROUP_MISSING','A selected translation group is missing from this manifest.');
 if(!manifest.selection.includeLocalization)fail('LOCALIZATION_SELECTION_REQUIRED','Include language settings explicitly before promoting them.');
 const routing=records.filter(r=>r.kind==='localeRouting');
 if(routing.length!==1)fail('PROMOTION_LOCALE_CONFIGURATION','Include exactly one language configuration with translation groups.');
 const config=promotionDataSchemas.localeRouting.parse(routing[0]!.data);
 const documents=new Map(manifest.records.filter(r=>r.kind==='page'||r.kind==='post').map(r=>[r.key,r]));
 const document=(value:string)=>{const key=referencedKey(value);return key?documents.get(key):undefined;};
 for(const locale of config.locales)if(document(locale.landingPageId)?.kind!=='page')fail('PROMOTION_LOCALE_LANDING','Each landing page must be included in this authored selection.');
 validateGroups(config,records.filter(r=>r.kind==='localeGroup').map(r=>promotionDataSchemas.localeGroup.parse(r.data)),value=>document(value)?.kind);
}
async function targetState(ctx:Pick<QueryCtx,'db'>){
 const routing=await ctx.db.query('locale_routing').withIndex('by_key',q=>q.eq('key','site')).unique();
 const rows=await ctx.db.query('locale_translation_groups').take(101);
 if(rows.length>100)fail('PROMOTION_LOCALIZATION_LIMIT','Target language review exceeds 100 groups. No partial language configuration can be applied.');
 const groups:Row[]=[];for(const row of rows)groups.push(await readLocaleGroup(ctx,row));
 return {routing,groups};
}
/** Complete current group snapshot binds both child entries and new/removed groups
 * into review. Unselected groups are retained and must remain compatible. */
export async function reviewLocalization(ctx:QueryCtx,manifest:ContentPromotionManifest,plan:Plan,known:Map<string,string>){
 if(!manifest.records.some(r=>isLocaleKind(r.kind)))return;
 const state=await targetState(ctx);
 plan.dependencies.push({key:'localization:target-context',table:'locale_routing',targetId:state.routing?._id??'absent',revision:hash(state)});
 const config=promotionDataSchemas.localeRouting.parse(manifest.records.find(r=>r.kind==='localeRouting')!.data);
 const map=(value:string)=>known.get(referencedKey(value)??'')??value;
 config.locales=config.locales.map(l=>({...l,landingPageId:map(l.landingPageId)}));
 const replacements=manifest.records.filter(r=>r.kind==='localeGroup');
 const replacedIds=new Set(plan.changes.filter(r=>r.kind==='localeGroup').map(r=>r.targetId));
 const groups=state.groups.filter(g=>!replacedIds.has(g._id)).map(g=>promotionDataSchemas.localeGroup.parse({key:g.key,translations:g.translations}));
 for(const r of replacements){const group=promotionDataSchemas.localeGroup.parse(r.data);groups.push({...group,translations:group.translations.map(t=>({...t,documentId:map(t.documentId)}))});}
 validateGroups(config,groups);
}
export async function writeLocalization(ctx:MutationCtx,kind:'localeRouting'|'localeGroup',id:string|null,data:Record<string,unknown>):Promise<string>{
 const table=kind==='localeRouting'?'locale_routing':'locale_translation_groups';
 const normalized=id?ctx.db.normalizeId(table,id):null;
 if(id&&!normalized)fail('PROMOTION_MAPPING_INVALID','Invalid language settings identity.');
 const before=normalized?await ctx.db.get(table,normalized):null;
 const metadata={revision:(before?.revision??0)+1,updatedAt:Date.now(),updatedBy:data.updatedBy as Id<'users'>};
 if(kind==='localeRouting'){
  const value=promotionDataSchemas.localeRouting.parse({key:data.key,enabled:data.enabled,locales:data.locales});
  return normalized?(await ctx.db.patch('locale_routing',normalized as Id<'locale_routing'>,{...value,locales:value.locales as Parameters<typeof validateLocales>[0],...metadata}),normalized):await ctx.db.insert('locale_routing',{...value,locales:value.locales as Parameters<typeof validateLocales>[0],...metadata});
 }
 const value=promotionDataSchemas.localeGroup.parse({key:data.key,translations:data.translations});
 const groupId=normalized as Id<'locale_translation_groups'>|null;
 const existing=groupId?await ctx.db.query('locale_translations').withIndex('by_group',q=>q.eq('groupId',groupId)).take(25):[];
 if(existing.length>24)fail('PROMOTION_LOCALIZATION_LIMIT','Translation group exceeds its atomic write limit.');
 const target=groupId??await ctx.db.insert('locale_translation_groups',{key:value.key,...metadata});
 if(groupId)await ctx.db.patch('locale_translation_groups',groupId,{key:value.key,...metadata});
 for(const entry of existing)await ctx.db.delete('locale_translations',entry._id);
 for(const entry of value.translations)await ctx.db.insert('locale_translations',{groupId:target,code:entry.code,documentId:entry.documentId as Id<'posts'>});
 return target;
}
/** After apply/restore, validate the combined final state in the same transaction. */
export async function assertLocalizationState(ctx:QueryCtx){
 const {routing,groups}=await targetState(ctx);
 if(!routing)fail('PROMOTION_LOCALE_CONFIGURATION','Language configuration is missing.');
 const documents=new Map<string,string>();
 for(const id of new Set([...routing.locales.map(l=>l.landingPageId),...groups.flatMap(g=>(g.translations as Group['translations']).map(t=>t.documentId))])){
  const normalized=ctx.db.normalizeId('posts',id),row=normalized?await ctx.db.get('posts',normalized):null;
  if(!row||row.status==='trash')fail('PROMOTION_LOCALE_DOCUMENT','A language destination no longer exists.');documents.set(id,row.type);
 }
 for(const locale of routing.locales)if(documents.get(locale.landingPageId)!=='page')fail('PROMOTION_LOCALE_LANDING','A language landing must be a page.');
 validateGroups(routing,groups.map(g=>promotionDataSchemas.localeGroup.parse({key:g.key,translations:g.translations})),id=>documents.get(id));
}
