import type {QueryCtx} from '../_generated/server';
import type {Id} from '../_generated/dataModel';
import {requireCan} from '../helpers/permissions';
import {RequestReadLedger} from '../helpers/requestReadLedger';
import {owned,storedRevision,publishedProjection,syncedFailure} from '../syncedBlocks/model';
import {syncedScopeSchema} from '../canonicalDocuments/foundation/syncedContent';
import {exportSyncedPromotionClosure,parseSyncedPromotionClosure} from '../canonicalDocuments/foundation/syncedPromotion';
import type {CanonicalReference} from '../canonicalDocuments/foundation/promotionTree';
import type {ContentPromotionManifest} from '@convexpress/site-contract/content-promotion';

/** Roots already live in the authored records. Do not duplicate their bodies
 * in the wire payload; rebuild the exact closed graph for each review/apply. */
export function syncedClosureFromManifest(manifest:ContentPromotionManifest){
  if(!manifest.synced)return null;
  const {source,synced}=manifest;
  if(synced.scope.websiteKey!==source.websiteKey||synced.scope.instanceKey!==source.instanceKey||synced.scope.deploymentOrigin!==source.deploymentOrigin)return syncedFailure('SYNCED_PROMOTION_SCOPE','Reusable sources belong to another promotion source.');
  const closure=parseSyncedPromotionClosure({...synced,documents:manifest.records.filter(r=>(r.kind==='page'||r.kind==='post')&&r.data.blocksVersion===2).map(r=>({key:r.key,tree:r.data.canonical}))});
  if(manifest.records.length+closure.sources.length+closure.sources.reduce((count,s)=>count+s.revisions.length,0)>100)return syncedFailure('PROMOTION_LIMIT','Reusable sources and revisions exceed the authored promotion record budget.');
  return closure;
}

/** Internal promotion adapter. The exporter must authorize and load the root
 * documents before calling this helper, and authorize ordinary dependencies in
 * resolve. Reusable source ownership is checked here for every distinct head. */
export async function captureSyncedPromotionClosure(
  ctx:QueryCtx,documents:unknown,resolve:(reference:CanonicalReference)=>Promise<string>,
  budget=new RequestReadLedger(),
){
  await requireCan(ctx,'manage_options',budget);
  const actor=await requireCan(ctx,'post.read',budget);
  budget.beforeRead();
  const identity=await ctx.db.query('convexpress_siteIdentity').withIndex('by_identity_key',q=>q.eq('identityKey','site-identity')).unique();
  budget.record(identity);
  if(!identity||identity.environmentKind!=='staging')return syncedFailure('PROMOTION_SOURCE_MISMATCH','Export reusable content from the selected staging environment.');
  const scope=syncedScopeSchema.parse({websiteKey:identity.websiteKey,instanceKey:identity.instanceKey,deploymentOrigin:identity.deploymentOrigin});
  const sources=new Map<Id<'syncedBlocks'>,Awaited<ReturnType<typeof owned>>>();
  return exportSyncedPromotionClosure(documents,scope,async request=>{
    const id=ctx.db.normalizeId('syncedBlocks',request.id);if(!id)return null;
    let state=sources.get(id);
    if(!state){state=await owned(ctx,id,actor._id,budget);sources.set(id,state);}
    const source=state.source;
    if(source.publishedRevision===undefined)return null;
    const revision=await storedRevision(ctx,id,request.revisionPolicy==='latest'?source.publishedRevision:request.revision,budget);
    if(!revision||revision.publishedAt===undefined)return null;
    return{source:{id:source._id,generation:source.generation,publishedRevision:source.publishedRevision,scope},revision:publishedProjection(source,revision,scope)};
  },resolve);
}
