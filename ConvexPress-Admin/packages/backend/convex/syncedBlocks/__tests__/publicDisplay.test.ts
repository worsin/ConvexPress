import { expect, test, setSystemTime } from "bun:test";
import { fixture, create, reference } from "./fixture.test-support";
import { projectPublicBlocks } from "../../canonicalDocuments/publicBlocks";
import { resolvePublishedOccurrences } from "../occurrences";
import { resolveSyncedDisplay } from "../../canonicalDocuments/foundation/syncedDisplay";
import { RequestReadLedger } from "../../helpers/requestReadLedger";

const scope = { websiteKey: "synced", instanceKey: "staging" };
// Explicit test policy: normal displayContext still disables core/synced until
// its renderer and authoring integration are complete.
const policy = { enabledPlugins: [], capabilities: ["tree.children", "reference.targetResolution"], disabledBlocks: [] };
async function setup() {
  const f = await fixture();
  const blocks = ["public", "conditional", "secret"].map(id => ({ id, name: "core/paragraph", version: 2, attrs: { body: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: id === "secret" ? "PRIVATE_SOURCE_TEXT" : id }] }] } } }));
  const { id } = await f.operator.mutation(create, { title: "Shared composition", blocks });
  await f.release(id, 1, 1);
  const placements = ["first", "second"].map(key => ({ ...reference(id)[0]!, id: key }));
  const plan = await f.t.run(async ctx => ({ roots: (await resolvePublishedOccurrences(ctx, placements, new RequestReadLedger())).roots }));
  await f.t.run(ctx => ctx.db.insert("settings", { section: "plugins", values: { membershipEnabled: true }, updatedAt: 1, updatedBy: f.ids.user }));
  const deny = (key: string) => f.t.run(ctx => ctx.db.insert("membership_restriction_rules", { resourceType: "block", resourceIdOrKey: key, ruleMode: "allow_only", planIds: [], loginRequired: true, teaserMode: "hide", createdAt: 1, updatedAt: 1 }));
  const read = () => f.t.run(ctx => projectPublicBlocks(ctx, placements, scope, policy, new RequestReadLedger()));
  return { ...f, sourceId: id, placements, plan, deny, read };
}

test("published reusable display applies authored, placement and ancestor rules without serializing hidden-only content", async () => {
  const f = await setup();
  await f.deny("secret");
  await f.deny(f.plan.roots[1]!.children[1]!.id);
  const result = await f.read();
  expect(result.synced).toBeDefined();
  const decoded = resolveSyncedDisplay(result.synced, result.blocks, scope);
  expect(decoded.roots[0]!.children.map(node => node.node.id)).toEqual(["public", "conditional"]);
  expect(decoded.roots[1]!.children.map(node => node.node.id)).toEqual(["public"]);
  expect(JSON.stringify({ blocks: result.blocks, synced: result.synced })).not.toContain("PRIVATE_SOURCE_TEXT");
  expect(result.authoringTree).toHaveLength(6);
  expect(result.resolverTree).toHaveLength(3);
  await f.deny("first");
  const onlySecond = await f.read();
  expect(onlySecond.blocks.map(node => node.id)).toEqual(["second"]);
  expect(JSON.stringify(onlySecond.synced)).not.toContain("conditional");
  await f.deny("core/synced");
  expect(await f.read()).toMatchObject({ blocks: [], resolverTree: [] });
  expect((await f.read()).synced).toBeUndefined();
});

test("reusable projection shares bounded reads, refuses mismatched scope and retains wrapper policy", async () => {
  const f = await setup();
  const queries = await f.t.run(async ctx => {
    const ledger = new RequestReadLedger();
    await projectPublicBlocks(ctx, f.placements, scope, policy, ledger);
    return ledger.queries;
  });
  await expect(f.t.run(ctx => projectPublicBlocks(ctx, f.placements, scope, policy, new RequestReadLedger({ queries: queries - 1, documents: 2048, bytes: 8 * 1024 * 1024, documentBytes: 512 * 1024 })))).rejects.toThrow("safe read budget");
  await expect(f.t.run(ctx => projectPublicBlocks(ctx, f.placements, { ...scope, websiteKey: "foreign" }, policy, new RequestReadLedger()))).rejects.toThrow("another website environment");
  await expect(f.t.run(ctx => projectPublicBlocks(ctx, f.placements, scope, { ...policy, disabledBlocks: ["core/synced"] }, new RequestReadLedger()))).rejects.toThrow("disabled");
  for (const key of ["websiteKey", "instanceKey", "deploymentOrigin"] as const) {
    const prior = await f.t.run(async ctx => {
      const source = (await ctx.db.get("syncedBlocks", f.sourceId))!;
      await ctx.db.patch("syncedBlocks", f.sourceId, { [key]: key === "deploymentOrigin" ? "https://foreign.convex.cloud" : "foreign" });
      return source[key];
    });
    expect((await f.read()).resolverTree).toEqual([]);
    await f.t.run(ctx => ctx.db.patch("syncedBlocks", f.sourceId, { [key]: prior }));
  }
});

test("reusable placement membership expiry is carried into the shared public authorization lease", async () => {
  const f = await setup(), now = Date.now();
  await f.t.run(async ctx => {
    const plan = await ctx.db.insert("membership_plans", { title: "Studio", slug: "studio", status: "active", grantMode: "manual", priority: 1, createdAt: now, updatedAt: now });
    await ctx.db.insert("membership_grants", { userId: f.ids.user, planId: plan, status: "active", startsAt: now - 1000, endsAt: now + 1000, sourceType: "manual", createdAt: now, updatedAt: now });
    await ctx.db.insert("membership_restriction_rules", { resourceType: "block", resourceIdOrKey: f.plan.roots[0]!.children[1]!.id, ruleMode: "allow_only", planIds: [plan], loginRequired: true, teaserMode: "hide", createdAt: now, updatedAt: now });
  });
  const read = () => f.operator.run(async ctx => {
    const budget = new RequestReadLedger();
    const result = await projectPublicBlocks(ctx, f.placements, scope, policy, budget);
    return { ids: result.resolverTree.map(node => node.id), deadline: budget.authorizationRecheckAt };
  });
  try {
    setSystemTime(now);
    expect(await read()).toMatchObject({ deadline: now + 1000 });
    expect((await read()).ids).toContain(f.plan.roots[0]!.children[1]!.id);
    setSystemTime(now + 1000);
    expect((await read()).ids).not.toContain(f.plan.roots[0]!.children[1]!.id);
    expect((await read()).ids).toContain(f.plan.roots[1]!.children[1]!.id);
  } finally { setSystemTime(); }
});

test("audience rules filter reusable bodies and placement ancestors before public serialization", async () => {
  const f = await fixture();
  const blocks = ["everyone", "signedIn", "signedOut"].map(visibility => ({ id: visibility, name: "core/paragraph", version: 2, visibility, attrs: { body: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: visibility + "_SOURCE_COPY" }] }] } } }));
  const { id } = await f.operator.mutation(create, { title: "Audience-aware source", blocks });
  await f.release(id, 1, 1);
  const placements = [{ ...reference(id)[0]!, id: "shared" }, { ...reference(id)[0]!, id: "guest-only", visibility: "signedOut" }];
  const read = (client = f.t) => client.run(ctx => projectPublicBlocks(ctx, placements, scope, policy, new RequestReadLedger()));
  const anonymous = await read(), member = await read(f.operator);
  expect(anonymous.blocks.map(node => node.id)).toEqual(["shared", "guest-only"]);
  expect(member.blocks.map(node => node.id)).toEqual(["shared"]);
  expect(JSON.stringify({ blocks: anonymous.blocks, synced: anonymous.synced })).not.toContain("signedIn_SOURCE_COPY");
  expect(JSON.stringify({ blocks: member.blocks, synced: member.synced })).not.toContain("signedOut_SOURCE_COPY");
  expect(anonymous.resolverTree).toHaveLength(4);
  expect(member.resolverTree).toHaveLength(2);
});
