import { expect, test } from "bun:test";
import { fixture, create, save, withdraw, text, reference } from "./fixture.test-support";
import { RequestReadLedger } from "../../helpers/requestReadLedger";
import { resolvePublishedOccurrences } from "../occurrences";
import type { QueryCtx } from "../../_generated/server";
async function inspect(ctx: QueryCtx, tree: unknown, budget: RequestReadLedger) {
  const { byId: _internalIndex, ...projection } = await resolvePublishedOccurrences(ctx, tree, budget);
  return projection;
}

// These calls stand in for an already-authorized document service, not a new
// anonymous endpoint. Registered source authority is covered in content/options.
test("the database adapter shares one ledger and one published source read across repeated placements", async () => {
  const f = await fixture();
  const { id } = await f.operator.mutation(create, { title: "Reusable", blocks: text });await f.release(id, 1, 1);
  const tree = [{ ...reference(id)[0]!, id: "first" }, { ...reference(id)[0]!, id: "second" }];
  const budget = new RequestReadLedger({ queries: 3, documents: 20, bytes: 1024 * 1024, documentBytes: 512 * 1024 });
  const plan = await f.t.run(ctx => inspect(ctx, tree, budget));
  expect(budget.queries).toBe(3);expect(budget.documents).toBe(3);
  expect(plan.resolution.revisions).toHaveLength(1);expect(plan.resolverTree).toHaveLength(2);
  expect(plan.resolverTree[0]!.id).not.toBe(plan.resolverTree[1]!.id);
  const limited = new RequestReadLedger({ queries: 2, documents: 20, bytes: 1024 * 1024, documentBytes: 512 * 1024 });
  await expect(f.t.run(ctx => inspect(ctx, tree, limited))).rejects.toThrow();expect(limited.queries).toBe(2);
});

test("latest rechecks the pointer each request while exact published pins survive draft updates and republishing", async () => {
  const f = await fixture();const { id } = await f.operator.mutation(create, { title: "Version 1", blocks: text });await f.release(id, 1, 1);
  const tree = [{ ...reference(id, 1)[0]!, id: "pin" }, { ...reference(id)[0]!, id: "live" }];
  const read = () => f.t.run(ctx => inspect(ctx, tree, new RequestReadLedger()));
  const before = await read();await f.operator.mutation(save, { id, expectedGeneration: 2, title: "Version 2", blocks: text });
  expect((await read()).digest).toBe(before.digest);
  await f.release(id, 3, 2);const published = await read();
  expect(published.roots.map(node => node.reference?.revision)).toEqual([1, 2]);expect(published.digest).not.toBe(before.digest);
  expect(published.resolverTree.map(node => node.id)).toEqual(before.resolverTree.map(node => node.id));
  await f.operator.mutation(withdraw, { id, expectedGeneration: 4 });
  const removed = await read();expect(removed.roots.map(node => node.reference)).toEqual([null, null]);expect(removed.resolverTree).toEqual([]);
});

test("foreign installation data and unpublished drafts never materialize as reusable children", async () => {
  const f = await fixture();const { id } = await f.operator.mutation(create, { title: "Draft", blocks: text });
  const read = () => f.t.run(ctx => inspect(ctx, reference(id), new RequestReadLedger()));
  expect((await read()).resolverTree).toEqual([]);await f.release(id, 1, 1);expect((await read()).resolverTree).toHaveLength(1);
  for (const key of ["websiteKey", "instanceKey", "deploymentOrigin"] as const) {
    const prior = await f.t.run(async ctx => { const row = (await ctx.db.get("syncedBlocks", id))!;await ctx.db.patch("syncedBlocks", id, { [key]: key === "deploymentOrigin" ? "https://foreign.convex.cloud" : "foreign" });return row[key]; });
    expect((await read()).resolverTree).toEqual([]);
    await f.t.run(ctx => ctx.db.patch("syncedBlocks", id, { [key]: prior }));
  }
});
