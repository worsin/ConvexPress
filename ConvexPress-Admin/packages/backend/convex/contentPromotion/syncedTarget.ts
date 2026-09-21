import type { Doc, Id } from '../_generated/dataModel';
import type { MutationCtx, QueryCtx } from '../_generated/server';
import { requireCan } from '../helpers/permissions';
import { RequestReadLedger } from '../helpers/requestReadLedger';
import { insertWithMediaReferences, assertMediaAttachments } from '../media/attachmentGuard';
import { collectCanonicalMediaIds } from '../canonicalDocuments/foundation/documentContracts';
import { canonicalJson, sha256Hex } from '../canonicalDocuments/foundation/shared/fingerprints';
import { importSyncedPromotionClosure, parseSyncedPromotionClosure, type SyncedPromotionClosure, type SyncedPromotionTargetBinding } from '../canonicalDocuments/foundation/syncedPromotion';
import type { PromotionReference } from '../canonicalDocuments/foundation/promotionTree';
import { displayContext } from '../canonicalDocuments/displayContext';
import { collectContactDefinitions } from '../canonicalDocuments/contactDefinitions';
import { assertPackTreatments } from '../canonicalDocuments/foundation/generated/instances';
import { resolveSyncedOccurrencesSnapshot, planSyncedOccurrenceData } from '../canonicalDocuments/foundation/syncedOccurrences';
import { resolveSyncedContent, type SyncedRequest } from '../canonicalDocuments/foundation/syncedContent';
import { content, owned, installation, storedRevision, publicationReview, publishedReader, syncedFailure } from '../syncedBlocks/model';
import { enqueueRefresh } from '../syncedBlocks/refresh';

const fingerprint = (value: unknown) => sha256Hex(canonicalJson(value));
export function syncedTargetRevision(source: Doc<'syncedBlocks'>): string {
  // Background refresh progress does not change authored content. Generation,
  // ownership, draft and publication pointers still invalidate the receipt.
  const { refreshJobId: _job, ...authored } = source;
  return fingerprint(authored);
}
export type SyncedTargetPlan = {
  closureDigest: string;
  policyDigest: string;
  scope: Awaited<ReturnType<typeof installation>>;
  packId: string;
  sources: Array<{
    key: string; targetId: Id<'syncedBlocks'> | null; beforeRevision: string;
    mappingRevision: string; revisions: SyncedPromotionTargetBinding['revisions'];
    publishedRevision: number;
  }>;
};
export type SyncedTargetBackup = { key: string; targetId: Id<'syncedBlocks'>; before: Doc<'syncedBlocks'> | null; afterRevision: string };

export async function previewSyncedTargetDocuments(input: unknown, plan: SyncedTargetPlan) {
  const preview = await importSyncedPromotionClosure(input, plan.scope, plan.sources.map(s => ({ key: s.key, id: s.targetId ?? `new:${fingerprint(s.key)}`, revisions: s.revisions })), async reference => fingerprint(reference.key));
  const read = (request: SyncedRequest) => {
    const source = preview.sources.find(s => s.id === request.id);
    const version = source?.revisions.find(v => v.revision === (request.revisionPolicy === 'latest' ? source.publishedRevision : request.revision));
    return source && version ? { id: source.id, ...version, scope: plan.scope, published: true } : null;
  };
  return new Map(preview.documents.map(d => [d.key, resolveSyncedOccurrencesSnapshot(d.blocks, plan.scope, read, { requireAvailable: true })]));
}

async function targetScope(ctx: QueryCtx, closure: SyncedPromotionClosure, budget: RequestReadLedger) {
  budget.beforeRead();
  const site = budget.record(await ctx.db.query('convexpress_siteIdentity').withIndex('by_identity_key', q => q.eq('identityKey', 'site-identity')).unique());
  if (!site || site.environmentKind !== 'live' || site.websiteKey !== closure.scope.websiteKey || site.instanceKey === closure.scope.instanceKey || site.deploymentOrigin === closure.scope.deploymentOrigin)
    return syncedFailure('SYNCED_PROMOTION_SCOPE', 'Promote reusable content to a distinct live environment of this website.');
  return { websiteKey: site.websiteKey, instanceKey: site.instanceKey, deploymentOrigin: site.deploymentOrigin };
}

/** Internal receipt planner. A title is never used to guess a reusable source:
 * only an explicit prior source mapping may select an existing destination. */
export async function planSyncedTargets(ctx: QueryCtx, input: unknown, packId?: string, budget = new RequestReadLedger()): Promise<SyncedTargetPlan> {
  const closure = parseSyncedPromotionClosure(input);
  await requireCan(ctx, 'manage_options', budget);
  const actor = await requireCan(ctx, 'post.publish', budget);
  const scope = await targetScope(ctx, closure, budget);
  const display = await displayContext(ctx, budget), effectivePack = packId ?? display.presentation.packId;
  // Pure review identities are never looked up in the destination database.
  // Transport slots are placeholders; use the codec to bind nested sources
  // before checking the actual expanded runtime and template policy.
  const preview = await importSyncedPromotionClosure(closure, scope, closure.sources.map(s => ({ key: s.key, id: fingerprint(s.key), revisions: s.revisions.map(v => ({ source: v.revision, target: v.revision })) })), async reference => fingerprint(reference.key));
  const read = (request: SyncedRequest) => {
    const source = preview.sources.find(s => s.id === request.id);
    const version = source?.revisions.find(v => v.revision === (request.revisionPolicy === 'latest' ? source.publishedRevision : request.revision));
    return source && version ? { id: source.id, ...version, scope, published: true } : null;
  };
  for (const blocks of [...preview.documents.map(d => d.blocks), ...preview.sources.flatMap(s => s.revisions.map(v => v.blocks))]) {
    assertPackTreatments(blocks, effectivePack);
    const occurrences = resolveSyncedOccurrencesSnapshot(blocks, scope, read, { requireAvailable: true });
    assertPackTreatments(occurrences.resolverTree, effectivePack);
    collectContactDefinitions(occurrences.resolverTree);
    planSyncedOccurrenceData(occurrences, display.scope, display.policy);
  }
  const plan: SyncedTargetPlan = { closureDigest: fingerprint(closure), policyDigest: fingerprint({ display, effectivePack }), scope, packId: effectivePack, sources: [] };
  const targets = new Set<string>();
  for (const source of closure.sources) {
    budget.beforeRead();
    const mapping = budget.record(await ctx.db.query('contentPromotion_mappings').withIndex('by_source_key', q => q.eq('sourceInstanceKey', closure.scope.instanceKey).eq('sourceKey', source.key.slice('@promotion:'.length))).unique());
    let current: Doc<'syncedBlocks'> | null = null;
    if (mapping) {
      if (mapping.kind !== 'syncedBlock') return syncedFailure('PROMOTION_MAPPING_CONFLICT', 'The reusable source mapping changed kind.');
      const id = ctx.db.normalizeId('syncedBlocks', mapping.targetId);
      if (!id || targets.has(id)) return syncedFailure('PROMOTION_MAPPING_CONFLICT', 'Reusable sources must map to distinct destination sources.');
      current = (await owned(ctx, id, actor._id, budget)).source;
      targets.add(id);
      await requireCan(ctx, 'post.update', budget);
      const draft = await storedRevision(ctx, id, current.lastRevision, budget);
      if (!draft || content(draft.title, draft.blocks).digest !== draft.digest) return syncedFailure('SYNCED_REVISION', 'Recover the destination draft before promoting.');
      if (current.publishedRevision !== undefined) {
        const published = current.publishedRevision === current.lastRevision ? draft : await storedRevision(ctx, id, current.publishedRevision, budget);
        if (!published || published.publishedAt === undefined || content(published.title, published.blocks).digest !== published.digest) return syncedFailure('SYNCED_REVISION', 'Recover the destination publication before promoting.');
      }
    } else await requireCan(ctx, 'post.create', budget);
    const last = current?.lastRevision ?? 0;
    if (!Number.isSafeInteger(last) || last < 0 || last + source.revisions.length > 1_000_000 || current && !Number.isSafeInteger(current.generation + 1)) return syncedFailure('SYNCED_REVISION_LIMIT', 'The destination reusable revision limit was reached.');
    // Import the selected publication last so the editor opens that version.
    // Older target drafts and every prior pinned revision remain immutable.
    const ordered = [...source.revisions].sort((a, b) => Number(a.revision === source.publishedRevision) - Number(b.revision === source.publishedRevision) || a.revision - b.revision);
    const revisions = ordered.map((v, index) => ({ source: v.revision, target: last + index + 1 }));
    plan.sources.push({ key: source.key, targetId: current?._id ?? null, beforeRevision: current ? syncedTargetRevision(current) : fingerprint(null), mappingRevision: fingerprint(mapping), revisions, publishedRevision: revisions.find(v => v.source === source.publishedRevision)!.target });
  }
  return plan;
}

/** Runs inside the outer promotion transaction after ordinary target IDs have
 * been allocated. The caller owns their authorization, page writes and receipt.
 * Nothing here is a public mutation or a substitute for that outer receipt. */
export async function applySyncedTargets(ctx: MutationCtx, input: unknown, expected: SyncedTargetPlan, resolve: (reference: PromotionReference) => Promise<string>, budget = new RequestReadLedger(), beforeMaterialize?: () => Promise<void>) {
  const closure = parseSyncedPromotionClosure(input);
  const plan = await planSyncedTargets(ctx, closure, expected.packId, budget);
  if (fingerprint(plan) !== fingerprint(expected)) return syncedFailure('PROMOTION_CONFLICT', 'Reusable content or policy changed after review.');
  const actor = await requireCan(ctx, 'post.publish', budget), now = Date.now();
  const bindings: SyncedPromotionTargetBinding[] = [], backups: SyncedTargetBackup[] = [];
  for (const item of plan.sources) {
    const source = closure.sources.find(s => s.key === item.key)!;
    const title = source.revisions.find(v => v.revision === source.publishedRevision)!.title;
    budget.beforeRead();
    const before = item.targetId ? budget.record(await ctx.db.get('syncedBlocks', item.targetId)) : null;
    const targetId = item.targetId ?? await ctx.db.insert('syncedBlocks', { ...plan.scope, title, generation: 0, lastRevision: 0, createdBy: actor._id, updatedBy: actor._id, createdAt: now, updatedAt: now });
    bindings.push({ key: item.key, id: targetId, revisions: item.revisions });
    backups.push({ key: item.key, targetId, before, afterRevision: '' });
  }
  // Allocate every head before rewriting any body. Finite revision graphs may
  // have cycles at source level, so a topological source ordering is incorrect.
  await beforeMaterialize?.();
  const imported = await importSyncedPromotionClosure(closure, plan.scope, bindings, resolve);
  for (const source of imported.sources) {
    const backup = backups.find(b => b.key === source.key)!;
    for (const version of source.revisions) {
      collectContactDefinitions(version.blocks);
      await insertWithMediaReferences(ctx, 'syncedBlockRevisions', { syncedBlockId: backup.targetId, ...version, createdBy: actor._id, createdAt: now, publishedAt: now }, undefined, budget, collectCanonicalMediaIds(version.blocks));
    }
    const published = source.revisions.find(v => v.revision === source.publishedRevision)!;
    await ctx.db.patch('syncedBlocks', backup.targetId, { title: published.title, generation: (backup.before?.generation ?? 0) + 1, lastRevision: source.publishedRevision, publishedRevision: source.publishedRevision, updatedBy: actor._id, updatedAt: now });
  }
  for (const backup of backups) {
    budget.beforeRead();
    const source = budget.record(await ctx.db.get('syncedBlocks', backup.targetId))!;
    const version = (await storedRevision(ctx, source._id, source.publishedRevision!, budget))!;
    await publicationReview(ctx, source, version, plan.scope, budget);
    await enqueueRefresh(ctx, source, plan.scope, source.generation, 'post.publish', budget);
    backup.afterRevision = syncedTargetRevision(source);
    budget.beforeRead();
    const previous = budget.record(await ctx.db.query('contentPromotion_mappings').withIndex('by_source_key', q => q.eq('sourceInstanceKey', closure.scope.instanceKey).eq('sourceKey', backup.key.slice('@promotion:'.length))).unique());
    if (previous) await ctx.db.patch('contentPromotion_mappings', previous._id, { updatedAt: now });
    else await ctx.db.insert('contentPromotion_mappings', { sourceInstanceKey: closure.scope.instanceKey, sourceKey: backup.key.slice('@promotion:'.length), kind: 'syncedBlock', targetId: source._id, updatedAt: now });
  }
  return { ...imported, bindings, backups };
}

/** Restore authored heads by appending the prior draft. Imported immutable
 * history is retained: pages outside this receipt may now pin those revisions. */
export async function restoreSyncedTargets(ctx: MutationCtx, backups: SyncedTargetBackup[], budget = new RequestReadLedger()) {
  await requireCan(ctx, 'manage_options', budget);
  const actor = await requireCan(ctx, 'post.restore', budget);
  await requireCan(ctx, 'post.update', budget);
  if (backups.length > 100 || new Set(backups.map(b => b.targetId)).size !== backups.length) return syncedFailure('PROMOTION_BACKUP_INVALID', 'Invalid reusable source backups.');
  if (backups.some(b => !b.before)) return syncedFailure('PROMOTION_CREATED_RECORDS', 'Review references before deleting newly created reusable sources.');
  const scope = await installation(ctx, budget), restored: Array<{ source: Doc<'syncedBlocks'>; generation: number; capability: 'post.publish' | 'post.unpublish'; publishedRevision: number | undefined }> = [];
  for (const backup of backups) {
    const { source } = await owned(ctx, backup.targetId, actor._id, budget), before = backup.before!;
    if (before._id !== source._id || before.websiteKey !== scope.websiteKey || before.instanceKey !== scope.instanceKey || before.deploymentOrigin !== scope.deploymentOrigin || syncedTargetRevision(source) !== backup.afterRevision) return syncedFailure('PROMOTION_CONFLICT', 'Reusable content changed after promotion.');
    const capability: 'post.publish' | 'post.unpublish' = before.publishedRevision === undefined ? 'post.unpublish' : 'post.publish';
    await requireCan(ctx, capability, budget);
    const draft = await storedRevision(ctx, source._id, before.lastRevision, budget);
    if (!draft || content(draft.title, draft.blocks).digest !== draft.digest) return syncedFailure('SYNCED_REVISION', 'The prior reusable draft cannot be restored.');
    const revision = source.lastRevision + 1, generation = source.generation + 1;
    if (revision > 1_000_000 || !Number.isSafeInteger(generation)) return syncedFailure('SYNCED_REVISION_LIMIT', 'The destination reusable revision limit was reached.');
    const now = Date.now(), value = content(draft.title, draft.blocks);
    await insertWithMediaReferences(ctx, 'syncedBlockRevisions', { syncedBlockId: source._id, revision, ...value, createdBy: actor._id, createdAt: now }, undefined, budget, collectCanonicalMediaIds(value.blocks));
    await ctx.db.patch('syncedBlocks', source._id, { title: draft.title, lastRevision: revision, generation, publishedRevision: before.publishedRevision, updatedBy: actor._id, updatedAt: now });
    restored.push({ source, generation, capability, publishedRevision: before.publishedRevision });
  }
  for (const item of restored) {
    if (item.publishedRevision !== undefined) {
      const version = await storedRevision(ctx, item.source._id, item.publishedRevision, budget);
      if (!version || version.publishedAt === undefined || content(version.title, version.blocks).digest !== version.digest) return syncedFailure('SYNCED_REVISION', 'The prior reusable publication cannot be restored.');
      // A prior publication may intentionally reference a withdrawn child.
      // Restore that unavailable state without republishing the child, while
      // still checking integrity, cycles, budgets and every available body.
      const graph = await resolveSyncedContent([{ id: 'restored-publication', name: 'core/synced', version: 1, attrs: { syncedBlock: item.source._id, revisionPolicy: 'latest' } }], scope, publishedReader(ctx, scope, budget));
      for (const revision of graph.revisions) {
        collectContactDefinitions(revision.blocks);
        await assertMediaAttachments(ctx, 'syncedBlockRevisions', { title: revision.title, blocks: revision.blocks }, budget, collectCanonicalMediaIds(revision.blocks));
      }
    }
    await enqueueRefresh(ctx, item.source, scope, item.generation, item.capability, budget);
  }
}
