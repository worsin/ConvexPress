import { expect, test } from "bun:test";
import { fixture, create, save, review, publish, withdraw, get, text, reference } from "./fixture.test-support";

test("drafts stay private, publication pins immutable content, and saving leaves live content unchanged", async () => {
  const { operator, read, release, t } = await fixture();
  const first = await operator.mutation(create, { title: "Shared footer", blocks: text });
  expect(await read(first.id)).toBeNull();
  await release(first.id, 1, 1);
  expect((await read(first.id))?.revision).toBe(1);
  const next = await operator.mutation(save, { id: first.id, expectedGeneration: 2, title: "New footer", blocks: text });
  expect(next.revision).toBe(2);
  expect((await read(first.id))?.title).toBe("Shared footer");
  expect(await read(first.id, 2)).toBeNull();
  await release(first.id, 3, 2);
  expect((await read(first.id))?.title).toBe("New footer");
  expect((await read(first.id, 1))?.title).toBe("Shared footer");
  expect(await t.run(ctx => ctx.db.query("syncedBlockRevisions").withIndex("by_source_revision", q => q.eq("syncedBlockId", first.id)).take(10))).toHaveLength(2);
});

test("current capability and exact installation ownership protect every authoring endpoint", async () => {
  const { operator, customer, t, ids } = await fixture();
  await expect(t.mutation(create, { title: "Denied", blocks: text })).rejects.toThrow();
  await expect(customer.mutation(create, { title: "Denied", blocks: text })).rejects.toThrow();
  const { id } = await operator.mutation(create, { title: "Private", blocks: text });
  for (const actor of [customer, t]) {
    await expect(actor.query(get, { id })).rejects.toThrow();
    await expect(actor.query(review, { id, expectedGeneration: 1, revision: 1 })).rejects.toThrow();
    await expect(actor.mutation(save, { id, expectedGeneration: 1, title: "Denied", blocks: text })).rejects.toThrow();
    await expect(actor.mutation(publish, { id, expectedGeneration: 1, revision: 1, reviewDigest: "a".repeat(64) })).rejects.toThrow();
    await expect(actor.mutation(withdraw, { id, expectedGeneration: 1 })).rejects.toThrow();
  }
  await t.run(ctx => ctx.db.patch("convexpress_siteIdentity", ids.site, { deploymentOrigin: "https://other.convex.cloud" }));
  await expect(operator.query(get, { id })).rejects.toThrow();
  await expect(operator.mutation(save, { id, expectedGeneration: 1, title: "Wrong origin", blocks: text })).rejects.toThrow();
  await t.run(async ctx => { await ctx.db.patch("convexpress_siteIdentity", ids.site, { deploymentOrigin: "https://synced.convex.cloud" }); await ctx.db.patch("roles", ids.role, { capabilities: ["post.create", "post.read", "post.update"] }); });
  await expect(operator.query(review, { id, expectedGeneration: 1, revision: 1 })).rejects.toThrow();
  expect((await operator.query(get, { id })).title).toBe("Private");
});

test("stale writes and publication review changes are refused without altering the source", async () => {
  const { operator, release, read } = await fixture();
  const leaf = await operator.mutation(create, { title: "Leaf", blocks: text });
  await release(leaf.id, 1, 1);
  const parent = await operator.mutation(create, { title: "Parent", blocks: reference(leaf.id) });
  const checked = await operator.query(review, { id: parent.id, expectedGeneration: 1, revision: 1 });
  await operator.mutation(save, { id: leaf.id, expectedGeneration: 2, title: "Changed leaf", blocks: text });
  await release(leaf.id, 3, 2);
  await expect(operator.mutation(publish, { id: parent.id, expectedGeneration: 1, revision: 1, reviewDigest: checked.digest })).rejects.toThrow("Review");
  expect(await read(parent.id)).toBeNull();
  await release(parent.id, 1, 1);
  await expect(operator.mutation(save, { id: parent.id, expectedGeneration: 1, title: "Lost write", blocks: text })).rejects.toThrow();
  expect((await operator.query(get, { id: parent.id })).generation).toBe(2);
});

test("withdrawal hides all published revisions; republishing restores the reviewed selection", async () => {
  const { operator, read, release } = await fixture();
  const { id } = await operator.mutation(create, { title: "Shared", blocks: text });
  await release(id, 1, 1);
  await operator.mutation(withdraw, { id, expectedGeneration: 2 });
  expect(await read(id)).toBeNull();
  expect(await read(id, 1)).toBeNull();
  await release(id, 3, 1);
  expect((await read(id))?.revision).toBe(1);
});

test("publication simulates the new pointer to catch direct and indirect latest-reference cycles", async () => {
  const { operator, release, read } = await fixture();
  const a = await operator.mutation(create, { title: "A", blocks: text });
  await release(a.id, 1, 1);
  const b = await operator.mutation(create, { title: "B", blocks: reference(a.id) });
  await release(b.id, 1, 1);
  await operator.mutation(save, { id: a.id, expectedGeneration: 2, title: "A", blocks: reference(b.id) });
  await expect(operator.query(review, { id: a.id, expectedGeneration: 3, revision: 2 })).rejects.toThrow("circular");
  expect((await read(a.id))?.revision).toBe(1);
  await operator.mutation(save, { id: a.id, expectedGeneration: 3, title: "A", blocks: reference(a.id) });
  await expect(operator.query(review, { id: a.id, expectedGeneration: 4, revision: 3 })).rejects.toThrow("circular");
});

test("invalid trees and title bounds refuse atomically; identical saves do not create revisions", async () => {
  const { operator, t } = await fixture();
  for (const title of ["", " ", "a".repeat(513)]) await expect(operator.mutation(create, { title, blocks: text })).rejects.toThrow();
  await expect(operator.mutation(create, { title: "Invalid", blocks: [{ id: "bad", name: "users/read", version: 1, attrs: {} }] })).rejects.toThrow();
  expect(await t.run(ctx => ctx.db.query("syncedBlocks").take(10))).toHaveLength(0);
  const { id } = await operator.mutation(create, { title: "Stable", blocks: text });
  expect(await operator.mutation(save, { id, expectedGeneration: 1, title: "Stable", blocks: text })).toMatchObject({ generation: 1, revision: 1, changed: false });
});

test("authors cannot inspect or replace another author's drafts without Editor-level authority", async () => {
  const { t, operator, ids } = await fixture();
  const { id } = await operator.mutation(create, { title: "Owner draft", blocks: text });
  const otherId = await t.run(ctx => ctx.db.insert("users", { authSource: "local", email: "other@example.invalid", emailVerified: true, status: "active", roleId: ids.role, createdAt: 1, updatedAt: 1 }));
  const other = t.withIdentity({ subject: otherId, tokenIdentifier: `https://convexpress-admin.local|${otherId}` });
  await expect(other.query(get, { id })).rejects.toThrow();
  await expect(other.mutation(save, { id, expectedGeneration: 1, title: "Overwrite", blocks: text })).rejects.toThrow();
  await expect(other.query(review, { id, expectedGeneration: 1, revision: 1 })).rejects.toThrow();
  await expect(other.mutation(withdraw, { id, expectedGeneration: 1 })).rejects.toThrow();
  await t.run(ctx => ctx.db.patch("roles", ids.role, { capabilities: ["post.create", "post.read", "post.update", "post.publish", "post.unpublish"], level: 80 }));
  expect((await other.query(get, { id })).title).toBe("Owner draft");
  expect((await other.mutation(save, { id, expectedGeneration: 1, title: "Reviewed edit", blocks: text })).revision).toBe(2);
});

test("republishing after withdrawal can restore a finite chain of previously published older revisions", async () => {
  const { operator, release, read } = await fixture();
  const { id } = await operator.mutation(create, { title: "Original", blocks: text });
  await release(id, 1, 1);
  await operator.mutation(save, { id, expectedGeneration: 2, title: "Extended", blocks: reference(id, 1) });
  await release(id, 3, 2);
  await operator.mutation(withdraw, { id, expectedGeneration: 4 });
  expect(await read(id)).toBeNull();
  await release(id, 5, 2);
  expect((await read(id))?.revision).toBe(2);
});
