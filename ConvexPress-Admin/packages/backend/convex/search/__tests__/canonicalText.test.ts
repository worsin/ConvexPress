import { expect, test } from "bun:test";
import { convexTest } from "convex-test";
import { makeFunctionReference as ref } from "convex/server";
import schema from "../../schema";
import { createPublicSearchSourceReader } from "../publicSource";
import { readSearch } from "../../canonicalDocuments/search";
import { RequestReadLedger } from "../../helpers/requestReadLedger";
const modules = {
  "./convex/_generated/server.js": () => import("../../_generated/server.js"),
  "./convex/search/internals.ts": () => import("../internals"),
  "./convex/search/queries.ts": () => import("../queries"),
  "./convex/search/candidates.ts": () => import("../candidates"),
  "./convex/membership/policyReads.ts": () => import("../../membership/policyReads"),
};
const scope = { websiteKey: "body-search", instanceKey: "staging" };
const paragraph = (id: string, text: string) => ({ id, name: "core/paragraph" as const, version: 2, attrs: { body: { type: "doc" as const, content: [{ type: "paragraph" as const, content: [{ type: "text" as const, text }] }] } } });
const upsert = ref<"mutation">("search/internals:onContentChanged");
async function fixture() {
  const t = convexTest({ schema, modules });
  const ids = await t.run(async ctx => {
    const user = await ctx.db.insert("users", { email: "search-author@example.invalid", authSource: "local", emailVerified: true, status: "active", createdAt: 1, updatedAt: 1 });
    await ctx.db.insert("convexpress_siteIdentity", { ...scope, identityKey: "site-identity", environmentKind: "staging", deploymentOrigin: "https://search.convex.cloud", managementOrigin: "https://controller.convex.cloud", siteOrigin: "https://search.convex.site", siteContractVersion: "1", schemaVersion: "1", engineVersion: "1", managementCapabilities: [], initializedAt: 1, updatedAt: 1 });
    const plugins = await ctx.db.insert("settings", { section: "plugins", values: { membershipEnabled: false }, updatedAt: 1, updatedBy: user });
    await ctx.db.insert("settings", { section: "appearance.template", values: { active: "core", overrides: {}, variants: {}, settings: {} }, legacyAppearanceMigration: { version: 2, migratedAt: 1 }, updatedAt: 1, updatedBy: user });
    const post = await ctx.db.insert("posts", { type: "page", title: "A garden", slug: "garden", path: "/garden", status: "publish", visibility: "public", authorId: user, commentStatus: "closed", content: "Hiddenlegacyneedle", blocksVersion: 2, blocks: [paragraph("intro", "Sunflowerneedle garden")], createdAt: 1, updatedAt: 1 });
    return { user, plugins, post };
  });
  await t.mutation(upsert, { contentType: "page", contentId: ids.post, action: "upsert" });
  return { t, ids };
}
test("canonical body indexing finds current editorial text through public and block search", async () => {
  const { t, ids } = await fixture();
  const index = await t.run(ctx => ctx.db.query("searchIndex").first());
  expect(index?.content).toBe("Sunflowerneedle garden");
  const source = await t.run(ctx => createPublicSearchSourceReader(ctx)({ contentType: "page", contentId: ids.post }));
  expect(source?.content).toBe("Sunflowerneedle garden");
  const block = await t.run(ctx => readSearch(ctx, { query: "Sunflowerneedle" }, scope, "host"));
  expect(block.items.map(item => item.id)).toEqual([ids.post]);
  const ordinary = await t.query(ref<"query">("search/queries:search"), { q: "Sunflowerneedle" });
  expect(JSON.stringify(ordinary)).toContain(ids.post);
  await t.run(ctx => ctx.db.patch("posts", ids.post, { blocks: [paragraph("intro", "Different garden")] }));
  expect((await t.run(ctx => readSearch(ctx, { query: "Sunflowerneedle" }, scope, "host"))).items).toEqual([]);
});
test("membership-restricted ancestors prune whole subtrees while entitled readers retain the body", async () => {
  const { t, ids } = await fixture();
  await t.run(ctx => ctx.db.patch("posts", ids.post, { blocks: [
    { id: "private-group", name: "core/group", version: 1, attrs: {}, children: [paragraph("private", "Memberneedle")] },
    paragraph("public", "Guestneedle"),
  ] }));
  await t.mutation(upsert, { contentType: "page", contentId: ids.post, action: "upsert" });
  await t.run(async ctx => {
    await ctx.db.patch("settings", ids.plugins, { values: { membershipEnabled: true } });
    await ctx.db.insert("membership_restriction_rules", { resourceType: "block", resourceIdOrKey: "private-group", ruleMode: "allow_only", planIds: [], loginRequired: true, teaserMode: "hide", createdAt: 1, updatedAt: 1 });
  });
  const read = (client: typeof t) => client.run(ctx => createPublicSearchSourceReader(ctx)({ contentType: "page", contentId: ids.post }));
  expect((await read(t))?.content).toBe("Guestneedle");
  const signedIn = t.withIdentity({ subject: ids.user, issuer: "https://convexpress-admin.local" });
  expect((await read(signedIn))?.content).toBe("Memberneedle Guestneedle");
  expect((await t.run(ctx => readSearch(ctx, { query: "Memberneedle" }, scope, "host"))).items).toEqual([]);
  expect((await signedIn.run(ctx => readSearch(ctx, { query: "Memberneedle" }, scope, "host"))).items.map(row => row.id)).toEqual([ids.post]);
});
test("disabled ancestors, protected pages and read limits cannot expose indexed block bodies", async () => {
  const { t, ids } = await fixture();
  await t.run(ctx => ctx.db.insert("settings", { section: "blocks", values: { disabledBlockNames: ["core/paragraph"] }, updatedAt: 1, updatedBy: ids.user }));
  expect((await t.run(ctx => readSearch(ctx, { query: "Sunflowerneedle" }, scope, "host"))).items).toEqual([]);
  await t.run(ctx => ctx.db.patch("posts", ids.post, { visibility: "password", password: "private" }));
  expect(await t.run(ctx => createPublicSearchSourceReader(ctx)({ contentType: "page", contentId: ids.post }))).toBeNull();
  await expect(t.run(ctx => createPublicSearchSourceReader(ctx, Date.now(), new RequestReadLedger({ queries: 1, documents: 1, bytes: 1, documentBytes: 1 }))({ contentType: "page", contentId: ids.post }))).rejects.toThrow();
});

for (const key of ["intro", "core/paragraph"]) test(`current block membership rule ${key} removes stale search matches immediately`, async () => {
  const { t, ids } = await fixture();
  await t.run(async ctx => {
    await ctx.db.patch("settings", ids.plugins, { values: { membershipEnabled: true } });
    await ctx.db.insert("membership_restriction_rules", { resourceType: "block", resourceIdOrKey: key, ruleMode: "allow_only", planIds: [], loginRequired: true, teaserMode: "hide", createdAt: 1, updatedAt: 1 });
  });
  expect((await t.run(ctx => readSearch(ctx, { query: "Sunflowerneedle" }, scope, "host"))).items).toEqual([]);
  const member = t.withIdentity({ subject: ids.user, issuer: "https://convexpress-admin.local" });
  expect((await member.run(ctx => readSearch(ctx, { query: "Sunflowerneedle" }, scope, "host"))).items.map(row => row.id)).toEqual([ids.post]);
  await t.run(ctx => ctx.db.patch("users", ids.user, { status: "inactive" }));
  expect((await member.run(ctx => readSearch(ctx, { query: "Sunflowerneedle" }, scope, "host"))).items).toEqual([]);
});

test("unsupported visibility on persisted content fails closed without matching its stale index", async () => {
  const { t, ids } = await fixture();
  await t.run(ctx => ctx.db.patch("posts", ids.post, { blocks: [{ ...paragraph("intro", "Sunflowerneedle"), visibility: "signedIn" }] }));
  expect((await t.run(ctx => readSearch(ctx, { query: "Sunflowerneedle" }, scope, "host"))).items).toEqual([]);
  await expect(t.mutation(upsert, { contentType: "page", contentId: ids.post, action: "upsert" })).rejects.toThrow("Visibility filtering");
});
