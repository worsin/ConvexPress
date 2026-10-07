import { makeFunctionReference as ref } from 'convex/server';
import { afterAll, beforeAll, expect, test } from 'bun:test';
import { fixture, create, save, text, reference } from '../../syncedBlocks/__tests__/fixture.test-support';
import { exportSyncedPromotionClosure } from '../../canonicalDocuments/foundation/syncedPromotion';
import { syncedContentDigest, resolveSyncedContent } from '../../canonicalDocuments/foundation/syncedContent';
import { consumerIndexGeneration } from '../../syncedBlocks/consumerIndexState';
import { installation, publishedReader } from '../../syncedBlocks/model';
import { planSyncedTargets, applySyncedTargets, restoreSyncedTargets } from '../syncedTarget';

const epoch = process.env.MEDIA_REFERENCE_INDEX_EPOCH;
beforeAll(() => { process.env.MEDIA_REFERENCE_INDEX_EPOCH = 'synced_promotion_target_test_0001'; });
afterAll(() => { if (epoch === undefined) delete process.env.MEDIA_REFERENCE_INDEX_EPOCH; else process.env.MEDIA_REFERENCE_INDEX_EPOCH = epoch; });
const noOrdinary = async () => { throw Error('Unexpected ordinary reference'); };
const scope = { websiteKey: 'synced', instanceKey: 'source', deploymentOrigin: 'https://source.convex.cloud' };

async function closure() {
  const versions = [
    { id: 'child', revision: 1, title: 'Original child', blocks: text },
    { id: 'child', revision: 2, title: 'Published child', blocks: text },
    { id: 'parent', revision: 1, title: 'Shared parent', blocks: [...reference('child').map(b => ({ ...b, id: 'latest' })), ...reference('child', 1).map(b => ({ ...b, id: 'pinned' }))] },
  ];
  return exportSyncedPromotionClosure([{ key: 'page:example', blocks: reference('parent') }], scope, async request => {
    const publishedRevision = request.id === 'child' ? 2 : 1;
    const version = versions.find(v => v.id === request.id && v.revision === (request.revisionPolicy === 'latest' ? publishedRevision : request.revision));
    return version ? { source: { id: version.id, generation: 4, publishedRevision, scope }, revision: { ...version, scope, published: true, digest: syncedContentDigest(version.title, version.blocks) } } : null;
  }, noOrdinary);
}
async function setup() {
  const f = await fixture();
  await f.t.run(async ctx => {
    const role = (await ctx.db.get('roles', f.ids.role))!;
    await ctx.db.patch('roles', role._id, { capabilities: [...role.capabilities, 'manage_options', 'post.restore'] });
    await ctx.db.patch('convexpress_siteIdentity', f.ids.site, { instanceKey: 'live', deploymentOrigin: 'https://live.convex.cloud', environmentKind: 'live' });
    await ctx.db.insert('syncedBlockConsumerIndex', { key: 'active', generation: consumerIndexGeneration()!, websiteKey: 'synced', instanceKey: 'live', deploymentOrigin: 'https://live.convex.cloud', phase: 'ready', cursor: null, sequence: 0, documents: 0, updatedAt: 1 });
    await ctx.db.insert('settings', { section: 'appearance.template', values: { active: 'core', overrides: {}, variants: {}, settings: {} }, legacyAppearanceMigration: { version: 2, migratedAt: 1 }, updatedAt: 1, updatedBy: f.ids.user });
  });
  const input = await closure();
  const review = () => f.operator.run(ctx => planSyncedTargets(ctx, input));
  const apply = async (plan?: Awaited<ReturnType<typeof review>>) => { const selected = plan ?? await review(); return f.operator.run(ctx => applySyncedTargets(ctx, input, selected, noOrdinary)); };
  const rows = () => f.t.run(async ctx => ({ sources: await ctx.db.query('syncedBlocks').take(100), versions: await ctx.db.query('syncedBlockRevisions').take(100), mappings: await ctx.db.query('contentPromotion_mappings').take(100), jobs: await ctx.db.query('syncedBlockRefreshJobs').take(100) }));
  return { ...f, input, review, apply, rows };
}

test('destination allocates the complete nested closure, remaps pins and captures target authority', async () => {
  const f = await setup(), imported = await f.apply(), stored = await f.rows();
  expect(stored.sources).toHaveLength(2); expect(stored.versions).toHaveLength(3); expect(stored.mappings).toHaveLength(2); expect(stored.jobs).toHaveLength(2);
  expect(stored.sources.every(s => s.instanceKey === 'live' && s.createdBy === f.ids.user && s.generation === 1)).toBe(true);
  const graph = await f.t.run(async ctx => resolveSyncedContent(imported.documents[0].blocks, await installation(ctx), publishedReader(ctx, await installation(ctx)), { requireAvailable: true }));
  expect(graph.bindings).toHaveLength(3);
  expect(graph.revisions.map(v => v.title).sort()).toEqual(['Original child', 'Published child', 'Shared parent']);
  expect(stored.jobs.every(job => job.instanceKey === 'live' && job.status === 'pending' && job.scheduledFunctionId)).toBe(true);
  expect(imported.backups.every(b => b.before === null)).toBe(true);
  await expect(f.operator.run(ctx => restoreSyncedTargets(ctx, imported.backups))).rejects.toThrow('Review references');
});

test('repeat promotion appends past a local draft and rollback preserves both imported and old pinned history', async () => {
  const f = await setup(), first = await f.apply();
  const child = first.bindings.find(b => b.key.endsWith(':child'))!;
  await f.operator.mutation(save, { id: child.id, expectedGeneration: 1, title: 'Production-only draft', blocks: text });
  const before = await f.rows(), second = await f.apply();
  const secondChild = second.bindings.find(b => b.key === child.key)!;
  expect(secondChild.id).toBe(child.id); expect(secondChild.revisions.map(v => v.target)).toEqual([4, 5]);
  const after = await f.rows(); expect(after.sources).toHaveLength(2); expect(after.versions).toHaveLength(7);
  for (const old of before.versions) expect(after.versions.find(v => v._id === old._id)).toEqual(old);
  await f.operator.run(ctx => restoreSyncedTargets(ctx, second.backups));
  const restored = await f.rows(), restoredChild = restored.sources.find(s => s._id === child.id)!;
  expect(restoredChild.title).toBe('Production-only draft'); expect(restoredChild.lastRevision).toBe(6); expect(restoredChild.publishedRevision).toBe(2);
  expect(restored.versions).toHaveLength(9);
  for (const old of after.versions) expect(restored.versions.find(v => v._id === old._id)).toEqual(old);
  const oldPin = await f.read(child.id, 1), importedPin = await f.read(child.id, 4);
  expect(oldPin?.title).toBe('Original child'); expect(importedPin?.title).toBe('Original child');
  expect(restored.jobs.filter(j => j.status === 'pending')).toHaveLength(2);
});

test('changed drafts, mappings, capabilities and policy invalidate review without writes', async () => {
  const f = await setup(); await f.apply();
  const plan = await f.review(), target = plan.sources[0].targetId!;
  await f.operator.mutation(save, { id: target, expectedGeneration: 1, title: 'Changed after review', blocks: text });
  const before = await f.rows(); await expect(f.apply(plan)).rejects.toThrow('changed after review'); expect(await f.rows()).toEqual(before);
  const fresh = await f.review();
  await f.t.run(ctx => ctx.db.insert('settings', { section: 'blocks', values: { disabledBlockNames: ['core/paragraph'] }, updatedAt: 1, updatedBy: f.ids.user }));
  await expect(f.apply(fresh)).rejects.toBeDefined(); expect(await f.rows()).toEqual(before);
  await f.t.run(async ctx => { const setting = await ctx.db.query('settings').withIndex('by_section', q => q.eq('section', 'blocks')).unique(); await ctx.db.delete('settings', setting!._id); const role = (await ctx.db.get('roles', f.ids.role))!; await ctx.db.patch('roles', role._id, { capabilities: role.capabilities.filter(c => c !== 'post.publish') }); });
  await expect(f.apply(fresh)).rejects.toBeDefined(); expect(await f.rows()).toEqual(before);
});

test('a late resolution failure rolls back all allocated heads', async () => {
  const f = await setup(), input = structuredClone(f.input);
  // Use a real catalog reference so failure occurs during materialization,
  // after destination source IDs have already been allocated.
  const source = input.sources.find(s => s.key.endsWith(':child'))!;
  const version = source.revisions.find(v => v.revision === 2)!;
  const { exportCanonicalPromotionTree } = await import('../../canonicalDocuments/foundation/promotionTree');
  version.tree = await exportCanonicalPromotionTree([{ id: 'page', name: 'core/featured-page', version: 1, attrs: { page: 'ordinary-source' } }], async () => '@promotion:page:ordinary');
  const plan = await f.operator.run(ctx => planSyncedTargets(ctx, input)), before = await f.rows();
  await expect(f.operator.run(ctx => applySyncedTargets(ctx, input, plan, async () => { throw Error('Dependency disappeared'); }))).rejects.toThrow('Dependency disappeared');
  expect(await f.rows()).toEqual(before);
});

test('source mappings never adopt same-title sources or cross website and author boundaries', async () => {
  const f = await setup();
  const unrelated = await f.operator.mutation(create, { title: 'Shared parent', blocks: text });
  const applied = await f.apply(); expect(applied.bindings.every(b => b.id !== unrelated.id)).toBe(true);
  const id = applied.backups[0].targetId;
  await f.t.run(ctx => ctx.db.patch('syncedBlocks', id, { instanceKey: 'foreign' }));
  await expect(f.review()).rejects.toThrow('unavailable');
  await f.t.run(ctx => ctx.db.patch('syncedBlocks', id, { instanceKey: 'live', createdBy: f.ids.customer }));
  await expect(f.review()).rejects.toThrow('Editor role');
  await expect(f.customer.run(ctx => planSyncedTargets(ctx, f.input))).rejects.toBeDefined();
  await expect(f.t.run(ctx => planSyncedTargets(ctx, f.input))).rejects.toBeDefined();
});

test('rollback refuses post-apply edits and preserves all rows', async () => {
  const f = await setup(); await f.apply(); const second = await f.apply(), target = second.backups[0].targetId;
  const source = (await f.rows()).sources.find(s => s._id === target)!;
  await f.operator.mutation(save, { id: target, expectedGeneration: source.generation, title: 'Keep this newer draft', blocks: text });
  const before = await f.rows();
  await expect(f.operator.run(ctx => restoreSyncedTargets(ctx, second.backups))).rejects.toThrow('changed after promotion');
  expect(await f.rows()).toEqual(before);
});

test('finite revision graphs with source-level cycles can be transferred atomically', async () => {
  const f = await setup();
  const versions = [
    { id: 'a', revision: 1, title: 'A original', blocks: text },
    { id: 'a', revision: 2, title: 'A published', blocks: reference('b') },
    { id: 'b', revision: 1, title: 'B published', blocks: reference('a', 1) },
  ];
  const input = await exportSyncedPromotionClosure([{ key: 'page:cycle', blocks: reference('a') }], scope, async request => {
    const publishedRevision = request.id === 'a' ? 2 : 1;
    const version = versions.find(v => v.id === request.id && v.revision === (request.revisionPolicy === 'latest' ? publishedRevision : request.revision));
    return version ? { source: { id: version.id, generation: 3, publishedRevision, scope }, revision: { ...version, scope, published: true, digest: syncedContentDigest(version.title, version.blocks) } } : null;
  }, noOrdinary);
  const plan = await f.operator.run(ctx => planSyncedTargets(ctx, input));
  const imported = await f.operator.run(ctx => applySyncedTargets(ctx, input, plan, noOrdinary));
  const graph = await f.t.run(async ctx => resolveSyncedContent(imported.documents[0].blocks, await installation(ctx), publishedReader(ctx, await installation(ctx)), { requireAvailable: true }));
  expect(graph.bindings).toHaveLength(3); expect(graph.revisions.map(v => v.title).sort()).toEqual(['A original', 'A published', 'B published']);
});

test('mapping alias, missing destination and changed mapping invalidate source selection', async () => {
  const f = await setup(); await f.apply(); const plan = await f.review(), before = await f.rows();
  const [first, second] = before.mappings;
  await f.t.run(ctx => ctx.db.patch('contentPromotion_mappings', second._id, { targetId: first.targetId }));
  await expect(f.review()).rejects.toThrow('distinct destination');
  await f.t.run(ctx => ctx.db.patch('contentPromotion_mappings', second._id, { targetId: second.targetId, updatedAt: second.updatedAt + 1 }));
  await expect(f.apply(plan)).rejects.toThrow('changed after review');
  await f.t.run(ctx => ctx.db.delete('syncedBlocks', plan.sources[0].targetId!));
  await expect(f.review()).rejects.toThrow('unavailable');
  expect((await f.rows()).versions).toEqual(before.versions);
});

test('rollback restores an unpublished destination without reusing revision numbers', async () => {
  const f = await setup(); await f.apply();
  const before = await f.rows(), target = before.sources[0];
  const { withdraw } = await import('../../syncedBlocks/__tests__/fixture.test-support');
  await f.operator.mutation(withdraw, { id: target._id, expectedGeneration: target.generation });
  const imported = await f.apply();
  await f.operator.run(ctx => restoreSyncedTargets(ctx, imported.backups));
  const after = await f.rows(), restored = after.sources.find(s => s._id === target._id)!;
  expect(restored.publishedRevision).toBeUndefined(); expect(restored.lastRevision).toBeGreaterThan(target.lastRevision);
  expect(await f.read(target._id)).toBeNull();
  expect(after.jobs.find(j => j._id === restored.refreshJobId)?.capability).toBe('post.unpublish');
});

test('promoted editing locks survive import, require explicit unlock, and roll back with the prior head',async()=>{
 const f=await setup();await f.apply();
 f.input.sources.find(s=>s.key.endsWith(':child'))!.isLocked=true;
 const second=await f.apply(),child=second.bindings.find(b=>b.key.endsWith(':child'))!;
 expect((await f.rows()).sources.find(s=>s._id===child.id)!.isLocked).toBe(true);
 await expect(f.operator.mutation(save,{id:child.id,expectedGeneration:2,title:'Must remain locked',blocks:text})).rejects.toThrow('locked');
 await expect(f.review()).rejects.toThrow('SYNCED_LOCKED');
 await f.operator.run(ctx=>restoreSyncedTargets(ctx,second.backups));
 expect((await f.rows()).sources.find(s=>s._id===child.id)!.isLocked===true).toBe(false);
 const third=await f.apply(),head=(await f.rows()).sources.find(s=>s._id===child.id)!;
 await f.operator.mutation(ref<'mutation'>('syncedBlocks/content:unlockImported'),{id:child.id,expectedGeneration:head.generation});
 expect((await f.rows()).sources.find(s=>s._id===child.id)!.isLocked).toBe(false);
 expect(third.bindings.find(b=>b.key.endsWith(':child'))!.id).toBe(child.id);
});
