import {v} from 'convex/values';
import {paginationOptsValidator} from 'convex/server';
import {query,mutation,type QueryCtx} from '../_generated/server';
import type {Doc,Id} from '../_generated/dataModel';
import {requireCan,resolveUserRole} from '../helpers/permissions';
import {RequestReadLedger} from '../helpers/requestReadLedger';
import {canonicalJson,sha256Hex} from '../canonicalDocuments/foundation/shared/fingerprints';
import {migrateLegacyDocument} from '../canonicalDocuments/foundation/legacyDocumentMigration';
import {canonicalStoredTreeValidator} from '../canonicalDocuments/foundation/generated/storage';
import {collectCanonicalMediaIds} from '../canonicalDocuments/foundation/documentContracts';
import {assertAuthoredActions} from '../canonicalDocuments/foundation/authoredDefinitions';
import {insertWithMediaReferences,patchWithMediaReferences} from '../media/attachmentGuard';
import {content,installation,ownedSource,publicationReview,storedRevision,syncedFailure} from './model';

const MAX_SOURCES=40,MAX_BYTES=1024*1024;
export const legacyDigest=(row:Doc<'reusableBlocks'>)=>{const {usageCount,updatedAt,...authored}=row;return sha256Hex(canonicalJson(authored));};
/** Scan only structure; the strict converter validates every authored property. */
export function legacyReferences(raw:string):string[]{
 if(new TextEncoder().encode(raw).byteLength>512*1024)return syncedFailure('LEGACY_IMPORT_LIMIT','The legacy document exceeds the import byte limit.');
 let root:unknown;try{root=JSON.parse(raw);}catch{return [];}
 const ids=new Set<string>();let count=0;
 const visit=(node:unknown,depth:number)=>{if(depth>32||++count>4000)return syncedFailure('LEGACY_IMPORT_LIMIT','The legacy document exceeds the reference scan limit.');if(!node||typeof node!=='object')return;const n=node as {type?:unknown;attrs?:{blockId?:unknown};content?:unknown};if(n.type==='reusableBlock'){if(typeof n.attrs?.blockId!=='string'||!n.attrs.blockId)return syncedFailure('LEGACY_IMPORT_REFERENCE','A legacy reusable source identity is missing.');ids.add(n.attrs.blockId);}if(Array.isArray(n.content))for(const child of n.content)visit(child,depth+1);};visit(root,0);return [...ids];
}
async function mapped(ctx:QueryCtx,id:Id<'reusableBlocks'>,budget:RequestReadLedger){budget.beforeRead();return budget.record(await ctx.db.query('syncedBlocks').withIndex('by_legacy_source',q=>q.eq('legacySourceId',id)).unique());}
export async function assertLegacyWritable(ctx:QueryCtx,id:Id<'reusableBlocks'>){if(await mapped(ctx,id,new RequestReadLedger()))syncedFailure('LEGACY_SOURCE_IMPORTED','This source was imported. Edit its canonical synced content; the original is retained for recovery.');}
/** Resolve imports for ordinary document migration without granting source editing. */
export async function legacyReferenceMap(ctx:QueryCtx,raw:string,budget:RequestReadLedger){
 const result=new Map<string,string>(),scope=await installation(ctx,budget);
 for(const value of legacyReferences(raw)){const id=ctx.db.normalizeId('reusableBlocks',value);if(!id)return syncedFailure('LEGACY_IMPORT_REFERENCE','A legacy reusable source identity is invalid.');budget.beforeRead();const old=budget.record(await ctx.db.get('reusableBlocks',id)),target=await mapped(ctx,id,budget);if(!old||!target||target.legacySourceDigest!==legacyDigest(old)||!await ownedSource(ctx,target._id,scope,budget))return syncedFailure('LEGACY_IMPORT_REQUIRED','Import and review the legacy reusable source before converting this document.');result.set(value,target._id);}
 return result;
}
async function plan(ctx:QueryCtx,rootId:Id<'reusableBlocks'>){
 const budget=new RequestReadLedger(),actor=await requireCan(ctx,'post.create',budget);await requireCan(ctx,'post.update',budget);await requireCan(ctx,'post.read',budget);
 const role=await resolveUserRole(ctx,actor,budget),scope=await installation(ctx,budget),active=new Set<string>(),done=new Set<string>();let bytes=0;
 const sources:Array<{old:Doc<'reusableBlocks'>;digest:string;target:Doc<'syncedBlocks'>|null;blocks:ReturnType<typeof migrateLegacyDocument>}>=[];
 async function visit(id:Id<'reusableBlocks'>,depth:number):Promise<void>{
  if(active.has(id))return syncedFailure('LEGACY_IMPORT_CYCLE','Legacy reusable content contains a cycle. Resolve it before importing.');if(done.has(id))return;
  if(depth>8||done.size+active.size>=MAX_SOURCES)return syncedFailure('LEGACY_IMPORT_LIMIT','Import is incomplete: the reusable graph exceeds eight levels or forty sources.');
  budget.beforeRead();const old=budget.record(await ctx.db.get('reusableBlocks',id));if(!old)return syncedFailure('LEGACY_IMPORT_MISSING','A referenced legacy source is missing.');
  if(old.createdBy!==actor._id&&(!role||role.level<80))return syncedFailure('LEGACY_IMPORT_FORBIDDEN','An Editor role is required to import another author’s reusable content.');
  bytes+=new TextEncoder().encode(JSON.stringify(old)).byteLength;if(bytes>MAX_BYTES)return syncedFailure('LEGACY_IMPORT_LIMIT','Import is incomplete: the source graph exceeds one MiB.');
  active.add(id);const refs=legacyReferences(old.content),mapping=new Map<string,string>();
  for(const raw of refs){const child=ctx.db.normalizeId('reusableBlocks',raw);if(!child)return syncedFailure('LEGACY_IMPORT_REFERENCE','A referenced legacy source identity is invalid.');await visit(child,depth+1);mapping.set(raw,`legacy:${child}`);}
  const blocks=migrateLegacyDocument({postId:id,content:old.content,reusableSources:mapping});content(old.title,blocks);assertAuthoredActions({blocks});
  const target=await mapped(ctx,id,budget),digest=legacyDigest(old);
  if(target){if(target.legacySourceDigest!==digest||!await ownedSource(ctx,target._id,scope,budget))return syncedFailure('LEGACY_IMPORT_CHANGED','The imported source or installation changed. Review its retained original before proceeding.');const first=await storedRevision(ctx,target._id,1,budget);if(!first||content(first.title,first.blocks).digest!==first.digest)return syncedFailure('LEGACY_IMPORT_CHANGED','The imported source’s initial revision is unavailable.');}
  sources.push({old,digest,target,blocks});active.delete(id);done.add(id);
 }
 await visit(rootId,1);
 if(sources.some(s=>s.old.isPublished&&!s.target))await requireCan(ctx,'post.publish',budget);
 const digest=sha256Hex(canonicalJson({scope,rootId,sources:sources.map(s=>({id:s.old._id,digest:s.digest,target:s.target?{id:s.target._id,generation:s.target.generation}:null,blocks:s.blocks}))}));
 return {actor,scope,budget,sources,digest};
}
const entry=v.object({legacyId:v.id('reusableBlocks'),title:v.string(),published:v.boolean(),locked:v.boolean(),targetId:v.union(v.id('syncedBlocks'),v.null()),blocks:canonicalStoredTreeValidator});
export const list=query({args:{paginationOpts:paginationOptsValidator},returns:v.object({page:v.array(v.object({id:v.id('reusableBlocks'),title:v.string(),published:v.boolean(),locked:v.boolean()})),isDone:v.boolean(),continueCursor:v.string()}),handler:async(ctx,args)=>{await requireCan(ctx,'post.create');await requireCan(ctx,'post.update');const actor=await requireCan(ctx,'post.read'),role=await resolveUserRole(ctx,actor);const opts={...args.paginationOpts,numItems:Math.min(Math.max(args.paginationOpts.numItems,1),20),maximumRowsRead:20,maximumBytesRead:512*1024};const result=await(role&&role.level>=80?ctx.db.query('reusableBlocks').withIndex('by_title'):ctx.db.query('reusableBlocks').withIndex('by_createdBy',q=>q.eq('createdBy',actor._id))).paginate(opts);return {page:result.page.map(s=>({id:s._id,title:s.title,published:s.isPublished,locked:s.isLocked===true})),isDone:result.isDone,continueCursor:result.continueCursor};}});
export const review=query({args:{legacyId:v.id('reusableBlocks')},returns:v.object({digest:v.string(),sources:v.array(entry)}),handler:async(ctx,args)=>{const p=await plan(ctx,args.legacyId);return {digest:p.digest,sources:p.sources.map(s=>({legacyId:s.old._id,title:s.old.title,published:s.old.isPublished,locked:s.old.isLocked===true,targetId:s.target?._id??null,blocks:s.blocks}))};}});
export const apply=mutation({args:{legacyId:v.id('reusableBlocks'),expectedDigest:v.string()},returns:v.object({id:v.id('syncedBlocks'),created:v.number(),reused:v.number()}),handler:async(ctx,args)=>{
 const p=await plan(ctx,args.legacyId);if(p.digest!==args.expectedDigest)return syncedFailure('LEGACY_IMPORT_CONFLICT','The source graph or its imported content changed. Review the import again.');
 const ids=new Map<string,Id<'syncedBlocks'>>();let created=0,reused=0;
 for(const s of p.sources){if(s.target){ids.set(s.old._id,s.target._id);reused++;continue;}
 const blocks=migrateLegacyDocument({postId:s.old._id,content:s.old.content,reusableSources:ids}),value=content(s.old.title,blocks),now=Date.now();
 const id=await ctx.db.insert('syncedBlocks',{...p.scope,title:value.title,generation:1,lastRevision:1,isLocked:s.old.isLocked===true,legacySourceId:s.old._id,legacySourceDigest:s.digest,createdBy:s.old.createdBy,updatedBy:p.actor._id,createdAt:now,updatedAt:now});
 const revisionId=await insertWithMediaReferences(ctx,'syncedBlockRevisions',{syncedBlockId:id,revision:1,...value,legacySourceJson:JSON.stringify(s.old),createdBy:p.actor._id,createdAt:now},undefined,p.budget,collectCanonicalMediaIds(blocks));
 if(s.old.isPublished){const source=(await ctx.db.get('syncedBlocks',id))!,version=(await ctx.db.get('syncedBlockRevisions',revisionId))!;await publicationReview(ctx,source,version,p.scope,p.budget);await patchWithMediaReferences(ctx,'syncedBlockRevisions',revisionId,{publishedAt:now},undefined,p.budget);await ctx.db.patch('syncedBlocks',id,{publishedRevision:1,generation:2});}
 ids.set(s.old._id,id);created++;
 }
 return {id:ids.get(args.legacyId)!,created,reused};
}});
