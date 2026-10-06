import { afterEach, expect, setSystemTime, test } from "bun:test";
import { convexTest } from "convex-test";
import { makeFunctionReference } from "convex/server";
import schema from "../../schema";
import { loadAuthoringComposedRegistry } from "../../blockDefinitions/registry";
import { RequestReadLedger } from "../../helpers/requestReadLedger";
import { projectPublicBlocks } from "../publicBlocks";
import { resolveCanonicalPageData } from "../data";
import { collectCanonicalDisplayMediaIds } from "../foundation/documentContracts";
import { planCanonicalData, type ComposedDataContext } from "../foundation/planner";

const modules = {
  "./convex/_generated/api.js": () => import("../../_generated/api.js"),
  "./convex/_generated/server.js": () => import("../../_generated/server.js"),
  "./convex/blockDefinitions/drafts.ts": () => import("../../blockDefinitions/drafts"),
  "./convex/membership/policyReads.ts": () => import("../../membership/policyReads"),
};
const scope = { websiteKey: "composed-projection", instanceKey: "staging" };
const installation = { ...scope, deploymentOrigin: "https://composed-projection.convex.cloud" };
const policy = { enabledPlugins: [], capabilities: ["tree.children", "reference.targetResolution"], disabledBlocks: [] };
afterEach(() => setSystemTime());
function definition(slug: string) {
  return {
    spec: { name: `composed/${slug}`, title: slug, description: `Definition ${slug}`, category: "text", role: "content", version: 1,
      keywords: [], ai: { useFor: "Page card", avoid: "Navigation" },
      fields: [{ id: "title", type: "text", default: "Hello", max: 80 }, { id: "page", type: "reference", of: "page", allowEmpty: true, default: "" }, { id: "photo", type: "media", storage: "id" }],
      supports: { children: true, styles: false, layout: [], anchor: true, visibility: false },
      data: { resolver: "content.page", args: { page: "attrs.page" } }, preview: "{title}", examples: [{}] },
    composition: { version: 1, root: { el: "Stack", children: [{ el: "Heading", bind: "attrs.title" }, { el: "Slot", props: { name: "children" } }] } },
  };
}
async function fixture() {
  const t = convexTest({ schema, modules });
  const ids = await t.run(async ctx => {
    const roleId = await ctx.db.insert("roles", { name: "Author", slug: "author", description: "Fixture", level: 10, type: "internal", isDefault: false, isProtected: false, capabilities: ["blocks.compose", "post.create", "post.read", "post.update"], pageAccess: [], status: "active", createdAt: 1, updatedAt: 1 });
    const user = await ctx.db.insert("users", { authSource: "local", email: "projection@example.invalid", emailVerified: true, status: "active", roleId, createdAt: 1, updatedAt: 1 });
    await ctx.db.insert("settings", { section: "plugins", values: { membershipEnabled: true }, updatedAt: 1, updatedBy: user });
    const site = await ctx.db.insert("convexpress_siteIdentity", { ...installation, identityKey: "site-identity", environmentKind: "staging", managementOrigin: "https://controller.convex.cloud", siteOrigin: "https://composed-projection.convex.site", siteContractVersion: "1", schemaVersion: "1", engineVersion: "1", managementCapabilities: [], initializedAt: 1, updatedAt: 1 });
    const page = await ctx.db.insert("posts", { type: "page", title: "Visible page", slug: "visible-page", status: "publish", visibility: "public", authorId: user, commentStatus: "closed", createdAt: 1, updatedAt: 1 });
    return { user, site, page };
  });
  const author = t.withIdentity({ subject: ids.user, tokenIdentifier: `https://convexpress-admin.local|${ids.user}` });
  for (const slug of ["visible", "private"]) await author.mutation(makeFunctionReference("blockDefinitions/drafts:create"), { definitionJson: JSON.stringify(definition(slug)) });
  const tree = [
    { id: "visible", name: "composed/visible", version: 1, attrs: { title: "Visible card", page: ids.page, photo: "visible-photo" } },
    { id: "private", name: "composed/private", version: 1, attrs: { title: "PRIVATE_PARENT", page: "private-page", photo: "private-photo" }, children: [
      { id: "nested", name: "composed/visible", version: 1, attrs: { title: "PRIVATE_CHILD", page: "private-child-page", photo: "private-child-photo" } },
    ] },
  ];
  const snapshot = await author.run(async ctx => (await loadAuthoringComposedRegistry(ctx, tree)).snapshot);
  const composed: ComposedDataContext = { scope: installation, definitions: snapshot };
  const deny = (key: string) => t.run(ctx => ctx.db.insert("membership_restriction_rules", { resourceType: "block", resourceIdOrKey: key, ruleMode: "allow_only", planIds: [], loginRequired: true, teaserMode: "hide", createdAt: 1, updatedAt: 1 }));
  const read = () => t.run(ctx => projectPublicBlocks(ctx, tree, scope, policy, new RequestReadLedger(), { composed }));
  return { t, ids, tree, composed, deny, read, author };
}

test("custom block projection filters ancestors before exposing definitions, media or dynamic page references", async () => {
  const f = await fixture(); await f.deny("private");
  const result = await f.read();
  expect(result.blocks.map(node => node.id)).toEqual(["visible"]);
  expect(result.authoringTree).toHaveLength(2);
  expect(result.composed?.definitions.definitions.map(value => value.name)).toEqual(["composed/visible"]);
  expect(collectCanonicalDisplayMediaIds(result.resolverTree, result.composed)).toEqual(["visible-photo"]);
  const plan = planCanonicalData(result.resolverTree, scope, policy, {}, result.composed);
  expect(plan.jobs).toHaveLength(1);
  const data = await f.t.run(ctx => resolveCanonicalPageData(ctx, result.resolverTree, scope, policy, new RequestReadLedger(), undefined, {}, undefined, [], result.composed));
  expect(data.definitionsDigest).toBe(plan.definitionsDigest);
  expect(JSON.stringify(data)).toContain("Visible page");
  const publicOutput = JSON.stringify({ blocks: result.blocks, composed: result.composed, data });
  for (const secret of ["PRIVATE", "composed/private", "private-photo", "private-page", "private-child"]) expect(publicOutput).not.toContain(secret);
  expect(f.composed.definitions.definitions).toHaveLength(2);
  await f.deny("composed/visible");
  const hidden = await f.read();
  expect(hidden.blocks).toEqual([]); expect(hidden.resolverTree).toEqual([]); expect(hidden.composed).toBeUndefined();
  expect(collectCanonicalDisplayMediaIds(hidden.resolverTree, hidden.composed)).toEqual([]);
});

test("custom projection refuses all foreign installation axes and never exceeds the shared read budget", async () => {
  const f = await fixture();
  for (const key of ["websiteKey", "instanceKey", "deploymentOrigin"] as const) {
    const foreign = { ...installation, [key]: key === "deploymentOrigin" ? "https://foreign.convex.cloud" : "foreign" };
    const composed = { scope: foreign, definitions: { ...f.composed.definitions, scope: foreign } };
    await expect(f.t.run(ctx => projectPublicBlocks(ctx, f.tree, scope, policy, new RequestReadLedger(), { composed }))).rejects.toThrow("another site installation");
  }
  await expect(f.t.run(ctx => projectPublicBlocks(ctx, f.tree, { ...scope, websiteKey: "foreign" }, policy, new RequestReadLedger(), { composed: f.composed }))).rejects.toThrow("another site installation");
  const queries = await f.t.run(async ctx => { const budget = new RequestReadLedger(); await projectPublicBlocks(ctx, f.tree, scope, policy, budget, { composed: f.composed }); return budget.queries; });
  await expect(f.t.run(ctx => projectPublicBlocks(ctx, f.tree, scope, policy, new RequestReadLedger({ queries: queries - 1, documents: 2048, bytes: 8 * 1024 * 1024, documentBytes: 512 * 1024 }), { composed: f.composed }))).rejects.toThrow("safe read budget");
  await f.t.run(ctx => ctx.db.patch("convexpress_siteIdentity", f.ids.site, { deploymentOrigin: "https://changed.convex.cloud" }));
  await expect(f.read()).rejects.toThrow("another site installation");
});

test("hidden custom definitions do not bypass authoring policy or leak unused snapshots", async () => {
  const f = await fixture(); await f.deny("private");
  const disabled = { ...policy, disabledBlocks: ["composed/private"] };
  expect((await f.t.run(ctx => projectPublicBlocks(ctx, f.tree, scope, disabled, new RequestReadLedger(), { composed: f.composed }))).blocks).toHaveLength(1);
  await expect(f.t.run(ctx => projectPublicBlocks(ctx, f.tree, scope, disabled, new RequestReadLedger(), { composed: f.composed, validateAuthoringPolicy: true }))).rejects.toThrow("disabled");
  await expect(f.t.run(ctx => projectPublicBlocks(ctx, f.tree.slice(0, 1), scope, policy, new RequestReadLedger(), { composed: f.composed }))).rejects.toThrow("exactly the authored definitions");
  await expect(f.t.run(ctx => projectPublicBlocks(ctx, f.tree, scope, { ...policy, disabledBlocks: ["composed/visible"] }, new RequestReadLedger(), { composed: f.composed }))).rejects.toThrow("disabled");
  const mixed = [...f.tree, { id: "reused", name: "core/synced", version: 1, attrs: { syncedBlock: "unread-source", revisionPolicy: "latest" } }];
  const unavailable = await f.t.run(ctx => projectPublicBlocks(ctx, mixed, scope, policy, new RequestReadLedger(), { composed: f.composed }));
  expect(unavailable.synced?.selections[0]?.target).toBeNull();
  expect(unavailable.synced?.revisions).toEqual([]);
});

test("custom membership expiry updates the shared authorization lease and removes the complete subtree", async () => {
  const f = await fixture(), now = 10000;
  await f.t.run(async ctx => {
    const plan = await ctx.db.insert("membership_plans", { title: "Studio", slug: "studio", status: "active", grantMode: "manual", priority: 1, createdAt: 1, updatedAt: 1 });
    await ctx.db.insert("membership_grants", { userId: f.ids.user, planId: plan, status: "active", startsAt: 1, endsAt: now + 1000, sourceType: "manual", createdAt: 1, updatedAt: 1 });
    await ctx.db.insert("membership_restriction_rules", { resourceType: "block", resourceIdOrKey: "private", ruleMode: "allow_only", planIds: [plan], loginRequired: true, teaserMode: "hide", createdAt: 1, updatedAt: 1 });
  });
  const read = () => f.author.run(async ctx => { const budget = new RequestReadLedger(); const value = await projectPublicBlocks(ctx, f.tree, scope, policy, budget, { composed: f.composed }); return { value, deadline: budget.authorizationRecheckAt }; });
  setSystemTime(now); expect((await read()).value.blocks).toHaveLength(2); expect((await read()).deadline).toBe(now + 1000);
  setSystemTime(now + 1000); const expired = await read(); expect(expired.value.blocks).toHaveLength(1); expect(expired.value.composed?.definitions.definitions).toHaveLength(1); expect(expired.deadline).toBeNull();
});

test("custom definitions and published reusable children retain scoped bindings and redaction", async () => {
  const f = await fixture();
  const { syncedContentDigest } = await import("../foundation/syncedContent");
  const { resolveSyncedDisplay } = await import("../foundation/syncedDisplay");
  const blocks = [{ id: "shared", name: "core/paragraph", version: 2, attrs: {} }];
  const sourceId = await f.t.run(async ctx => {
    const id = await ctx.db.insert("syncedBlocks", { ...installation, title: "Shared", generation: 2, lastRevision: 1, publishedRevision: 1, createdBy: f.ids.user, updatedBy: f.ids.user, createdAt: 1, updatedAt: 1 });
    await ctx.db.insert("syncedBlockRevisions", { syncedBlockId: id, revision: 1, title: "Shared", blocks, digest: syncedContentDigest("Shared", blocks), createdBy: f.ids.user, createdAt: 1, publishedAt: 1 });
    return id;
  });
  const reference = { id: "reusable", name: "core/synced", version: 1, attrs: { syncedBlock: sourceId, revisionPolicy: "pinned", revision: 1 } };
  const tree = [{ ...f.tree[0], children: [reference] }, f.tree[1]];
  const read = () => f.t.run(ctx => projectPublicBlocks(ctx, tree, scope, policy, new RequestReadLedger(), { composed: f.composed }));
  await f.deny("private");
  const result = await read();
  expect(result.blocks.map(n => n.id)).toEqual(["visible"]);
  expect(result.composed?.definitions.definitions.map(d => d.name)).toEqual(["composed/visible"]);
  expect(result.synced?.revisions).toHaveLength(1);
  const display = resolveSyncedDisplay(result.synced, result.blocks, scope, result.composed);
  expect(display.resolverTree).toEqual(result.resolverTree);
  expect(display.resolverTree[0]?.children?.[0]?.id.startsWith("synced_")).toBe(true);
  expect(planCanonicalData(display.resolverTree, scope, policy, {}, result.composed).jobs).toHaveLength(1);
  expect(JSON.stringify(result.blocks)).not.toContain("PRIVATE");
  expect(() => resolveSyncedDisplay(result.synced, result.blocks, scope)).toThrow();
  await f.deny("shared");
  const hidden = await read();
  expect(hidden.synced?.revisions[0]?.blocks).toEqual([]);
  expect(hidden.resolverTree[0]?.children ?? []).toEqual([]);
  await f.deny("visible");
  const allHidden = await read();
  expect(allHidden.blocks).toEqual([]);expect(allHidden.composed).toBeUndefined();expect(allHidden.synced).toBeUndefined();
});
