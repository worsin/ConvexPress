import type { MutationCtx } from '../_generated/server';
import type { Id, Doc } from '../_generated/dataModel';
import { requireCan } from '../helpers/permissions';
import { insertWithMediaReferences } from '../media/attachmentGuard';
import { hash, fail, identity, validateManifest } from './shared';

export type CanonicalPromotionAllocation = { receiptId: Id<'contentPromotion_receipts'>; key: string };
async function reviewed(ctx: MutationCtx, allocation: CanonicalPromotionAllocation) {
  const actor = await requireCan(ctx, 'manage_options');
  const receipt = await ctx.db.get('contentPromotion_receipts', allocation.receiptId);
  if (!receipt || receipt.operatorId !== actor._id || receipt.status !== 'ready' || receipt.expiresAt < Date.now()) return fail('PROMOTION_ALLOCATION_INVALID', 'The page allocation needs its current promotion receipt.');
  const manifest = validateManifest(JSON.parse(receipt.manifestJson));
  if (hash(await identity(ctx)) !== hash(manifest.target)) return fail('PROMOTION_TARGET_MISMATCH', 'The allocation belongs to another environment.');
  const record = manifest.records.find(r => r.key === allocation.key);
  const plan = JSON.parse(receipt.planJson) as { plan: { changes: Array<{ key: string; targetId: string | null }> } };
  if (!record || !['page', 'post'].includes(record.kind) || record.data.blocksVersion !== 2 || !plan.plan.changes.some(c => c.key === record.key && c.targetId === null)) return fail('PROMOTION_ALLOCATION_INVALID', 'Only a reviewed new canonical document can be allocated.');
  await requireCan(ctx, record.kind === 'page' ? 'page.create' : 'post.create');
  return { actor, record };
}

/** Called only within apply's transaction. The allocation doubles as the new
 * record's null backup; no pending content or allocation survives a refusal. */
export async function allocateCanonicalPromotionTarget(ctx: MutationCtx, allocation: CanonicalPromotionAllocation): Promise<Id<'posts'>> {
  const { actor, record } = await reviewed(ctx, allocation);
  const backups = await ctx.db.query('contentPromotion_backups').withIndex('by_receipt', q => q.eq('receiptId', allocation.receiptId)).take(101);
  if (backups.some(b => b.key === allocation.key)) return fail('PROMOTION_ALLOCATION_INVALID', 'This document already has a receipt allocation.');
  const now = Date.now();
  const id = await insertWithMediaReferences(ctx, 'posts', { type: record.kind as 'page' | 'post', title: String(record.data.title), slug: String(record.data.slug), status: 'draft', visibility: 'public', commentStatus: 'closed', authorId: actor._id, createdAt: now, updatedAt: now });
  const row = (await ctx.db.get('posts', id))!;
  await ctx.db.insert('contentPromotion_backups', { receiptId: allocation.receiptId, key: allocation.key, kind: 'canonicalAllocation', targetId: id, beforeJson: null, afterRevision: hash(row) });
  return id;
}

/** Internal authoring bridge: proves that this exact untouched draft was
 * created by this receipt, preserving create-only authoring permissions. */
export async function consumeCanonicalPromotionAllocation(ctx: MutationCtx, allocation: CanonicalPromotionAllocation, previous: Doc<'posts'>, kind: 'page' | 'post') {
  const { actor, record } = await reviewed(ctx, allocation);
  const backups = await ctx.db.query('contentPromotion_backups').withIndex('by_receipt', q => q.eq('receiptId', allocation.receiptId)).take(101);
  const backup = backups.find(b => b.key === allocation.key);
  if (!backup || backup.kind !== 'canonicalAllocation' || backup.targetId !== previous._id || backup.beforeJson !== null || backup.afterRevision !== hash(previous) || previous.authorId !== actor._id || record.kind !== kind) return fail('PROMOTION_ALLOCATION_INVALID', 'The reserved document changed before final authoring.');
  await ctx.db.patch('contentPromotion_backups', backup._id, { kind });
}
