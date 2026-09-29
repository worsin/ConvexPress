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
test("page search results use the Website page route for stored and fallback paths", async () => {
  const { t, ids } = await fixture();
  for (const [path, expected] of [
    ["/garden", "/page/garden"],
    ["/guides/garden", "/page/guides/garden"],
    [undefined, "/page/garden"],
    ["//outside.invalid", "/page/garden"],
    ["/bad\\path", "/page/garden"],
  ] as const) {
    await t.run(ctx => ctx.db.patch("posts", ids.post, { path }));
    const source = await t.run(ctx => createPublicSearchSourceReader(ctx)({ contentType: "page", contentId: ids.post }));
    expect(source?.url).toBe(expected);
    const block = await t.run(ctx => readSearch(ctx, { query: "Sunflowerneedle" }, scope, "host"));
    expect(block.items[0]?.href).toBe(expected);
    const ordinary = await t.query(ref<"query">("search/queries:search"), { q: "Sunflowerneedle" });
    expect(ordinary.results[0]?.url).toBe(expected);
  }
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

test("audience visibility filters current search text and stale candidates for active and inactive visitors", async () => {
  const { t, ids } = await fixture();
  const blocks = [
    { ...paragraph("intro", "Memberonlyneedle"), visibility: "signedIn" },
    { ...paragraph("guest", "Guestonlyneedle"), visibility: "signedOut" },
    { id: "parent", name: "core/section", version: 1, attrs: {}, visibility: "signedIn", children: [paragraph("nested", "Nestedmemberneedle")] },
  ];
  await t.run(ctx => ctx.db.patch("posts", ids.post, { blocks }));
  await t.mutation(upsert, { contentType: "page", contentId: ids.post, action: "upsert" });
  const member = t.withIdentity({ subject: ids.user, issuer: "https://convexpress-admin.local" });
  const search = (client: typeof t, query: string) => client.run(ctx => readSearch(ctx, { query }, scope, "host"));
  for (const word of ["Memberonlyneedle", "Nestedmemberneedle"]) {
    expect((await search(t, word)).items).toEqual([]);
    expect((await search(member, word)).items.map(row => row.id)).toEqual([ids.post]);
  }
  expect((await search(t, "Guestonlyneedle")).items.map(row => row.id)).toEqual([ids.post]);
  expect((await search(member, "Guestonlyneedle")).items).toEqual([]);
  await t.run(ctx => ctx.db.patch("users", ids.user, { status: "inactive" }));
  expect((await search(member, "Memberonlyneedle")).items).toEqual([]);
  expect((await search(member, "Guestonlyneedle")).items.map(row => row.id)).toEqual([ids.post]);
  // The index has not changed: current visibility remains the authority.
  await t.run(ctx => ctx.db.patch("posts", ids.post, { blocks: [{ ...paragraph("intro", "Memberonlyneedle"), visibility: "everyone" }] }));
  expect((await search(t, "Memberonlyneedle")).items.map(row => row.id)).toEqual([ids.post]);
});

async function editorialPages() {
  const { t, ids } = await fixture();
  const pages = await t.run(async ctx => {
    await ctx.db.patch("settings", ids.plugins, { values: { membershipEnabled: true } });
    const result = [];
    for (let page = 0; page < 10; page++) {
      const id = await ctx.db.insert("posts", { type: "page", title: `Scalebloom page ${page}`, slug: `scale-${page}`, status: "publish", visibility: "public", authorId: ids.user, commentStatus: "closed", blocksVersion: 2, blocks: Array.from({ length: 30 }, (_, n) => paragraph(`page-${page}-copy-${n}`, `Meadowbody ${page} paragraph ${n}`)), createdAt: 1, updatedAt: 1 });
      result.push(id);
    }
    return result;
  });
  for (const id of pages) await t.mutation(upsert, { contentType: "page", contentId: id, action: "upsert" });
  return { t, ids, pages };
}
test("title suggestions do not exhaust their budget projecting unrelated block bodies", async () => {
  const { t } = await editorialPages();
  const result = await t.query(ref<"query">("search/queries:suggest"), { q: "Scalebloom", limit: 10 });
  expect(result.suggestions).toHaveLength(10);
});
test("ordinary body search handles ten real editorial pages with thirty paragraphs each", async () => {
  const { t, pages } = await editorialPages();
  const result = await t.query(ref<"query">("search/queries:search"), { q: "Meadowbody", perPage: 20 });
  expect(new Set(result.results.map((item: { contentId: string }) => item.contentId))).toEqual(new Set(pages));
});
test("search block traverses the editorial corpus with bounded reads and no omissions", async () => {
  const { t, pages } = await editorialPages();
  const seen: string[] = []; let cursor: string | null = null, rounds = 0;
  do {
    const budget = new RequestReadLedger();
    const result = await t.run(ctx => readSearch(ctx, { query: "Meadowbody", pageSize: 5, cursor }, scope, "host", budget));
    expect(budget.queries).toBeLessThanOrEqual(budget.limits.queries);
    seen.push(...result.items.map(row => row.id)); cursor = result.nextCursor;
    if (++rounds > 20) throw Error("Search cursor failed to converge");
  } while (cursor);
  expect(seen).toHaveLength(pages.length); expect(new Set(seen)).toEqual(new Set(pages));
});

test("denied ancestors do not preload overflowing child policies and batches charge full raw bytes", async () => {
  const { t, ids } = await fixture();
  await t.run(async ctx => {
    await ctx.db.patch("settings", ids.plugins, { values: { membershipEnabled: true } });
    await ctx.db.patch("posts", ids.post, { blocks: [
      { id: "parent", name: "core/group", version: 1, attrs: {}, children: [paragraph("child", "Neverpublic")] },
      paragraph("public", "Publicgarden"),
    ] });
    const policy = { resourceType: "block" as const, ruleMode: "allow_only" as const, planIds: [], loginRequired: true, teaserMode: "hide" as const, createdAt: 1, updatedAt: 1 };
    await ctx.db.insert("membership_restriction_rules", { ...policy, resourceIdOrKey: "parent" });
    for (let i = 0; i < 257; i++) await ctx.db.insert("membership_restriction_rules", { ...policy, resourceIdOrKey: "child" });
    await ctx.db.insert("membership_restriction_rules", { ...policy, resourceIdOrKey: "public", customMessage: "x".repeat(30_000) });
  });
  // A hidden child's overflow must not poison an otherwise readable document.
  expect((await t.run(ctx => createPublicSearchSourceReader(ctx)({ contentType: "page", contentId: ids.post })))?.content).toBe("");
  await t.run(async ctx => {
    const publicPolicy = await ctx.db.query("membership_restriction_rules").withIndex("by_resource", q => q.eq("resourceType", "block").eq("resourceIdOrKey", "public")).unique();
    await ctx.db.delete("membership_restriction_rules", publicPolicy!._id);
  });
  expect((await t.run(ctx => createPublicSearchSourceReader(ctx)({ contentType: "page", contentId: ids.post })))?.content).toBe("Publicgarden");
  await t.run(async ctx => {
    const parent = await ctx.db.query("membership_restriction_rules").withIndex("by_resource", q => q.eq("resourceType", "block").eq("resourceIdOrKey", "parent")).unique();
    await ctx.db.patch("membership_restriction_rules", parent!._id, { customMessage: "x".repeat(30_000) });
  });
  const budget = new RequestReadLedger({ queries: 256, documents: 2048, bytes: 25_000, documentBytes: 512 * 1024 });
  await expect(t.run(ctx => createPublicSearchSourceReader(ctx, Date.now(), budget)({ contentType: "page", contentId: ids.post }))).rejects.toThrow("CANONICAL_READ_BUDGET");
});

test('referenced author withdrawal removes authored bio matches from stale search candidates', async () => {
  const {t,ids}=await fixture();
  await t.run(ctx=>ctx.db.patch('posts',ids.post,{blocks:[{id:'author',name:'core/author-bio',version:2,attrs:{userId:ids.user,name:'Authoredauthorneedle',bio:'Visible authored profile'}}]}));
  await t.mutation(upsert,{contentType:'page',contentId:ids.post,action:'upsert'});
  const read=()=>t.run(ctx=>readSearch(ctx,{query:'Authoredauthorneedle'},scope,'host'));
  expect((await read()).items.map(row=>row.id)).toEqual([ids.post]);
  await t.run(ctx=>ctx.db.patch('users',ids.user,{status:'inactive'}));
  expect((await read()).items).toEqual([]);
});

test('current-author search visibility follows the host author and withdraws stale authored matches',async()=>{
 const {t,ids}=await fixture();await t.run(ctx=>ctx.db.patch('posts',ids.post,{authorId:ids.user,blocks:[{id:'current',name:'core/author-bio',version:2,attrs:{useCurrentAuthor:true,name:'Currentauthorneedle'}}]}));
 await t.mutation(upsert,{contentType:'page',contentId:ids.post,action:'upsert'});const read=()=>t.run(ctx=>readSearch(ctx,{query:'Currentauthorneedle'},scope,'host'));
 expect((await read()).items.map(row=>row.id)).toEqual([ids.post]);await t.run(ctx=>ctx.db.patch('users',ids.user,{status:'inactive'}));expect((await read()).items).toEqual([]);
});

test("authored utility copy is searchable without private form settings or interactive status alternatives", async () => {
  const {t,ids}=await fixture();
  await t.run(ctx=>ctx.db.patch('settings',ids.plugins,{values:{membershipEnabled:false,formsEnabled:true}}));
  await t.run(ctx=>ctx.db.patch('posts',ids.post,{blocks:[
    {id:'contact',name:'core/contact-form',version:2,attrs:{eyebrow:'',heading:'Contactneedle',body:'Write about the [garden](https://example.invalid/Privatehrefneedle).',recipientEmail:'Privaterecipientneedle@example.invalid',successMessage:'Privatesuccessneedle'}},
    {id:'video',name:'core/hero-video',version:1,attrs:{title:'Filmneedle',subtitle:'A **studio** story.'}},
    {id:'clock',name:'core/countdown',version:1,attrs:{title:'Dateneedle',expiredText:'Notexpiredneedle'}},
  ]}));
  await t.mutation(upsert,{contentType:'page',contentId:ids.post,action:'upsert'});
  for(const query of ['Contactneedle','Filmneedle','Dateneedle'])expect((await t.run(ctx=>readSearch(ctx,{query},scope,'host'))).items.map(item=>item.id)).toEqual([ids.post]);
  for(const query of ['Privaterecipientneedle','Privatesuccessneedle','Privatehrefneedle','Notexpiredneedle'])expect((await t.run(ctx=>readSearch(ctx,{query},scope,'host'))).items).toEqual([]);
  await t.run(ctx=>ctx.db.patch('settings',ids.plugins,{values:{membershipEnabled:false,formsEnabled:false}}));
  expect((await t.run(ctx=>readSearch(ctx,{query:'Contactneedle'},scope,'host'))).items).toEqual([]);
  expect((await t.run(ctx=>readSearch(ctx,{query:'Filmneedle'},scope,'host'))).items.map(item=>item.id)).toEqual([ids.post]);
});

test("unavailable selected media cannot leave searchable prose for a document that refuses public rendering", async () => {
  const {t,ids}=await fixture();
  await t.run(ctx=>ctx.db.patch('posts',ids.post,{blocks:[{id:'hero',name:'core/hero',version:2,attrs:{title:'Unavailablemedianeedle',mediaId:'missing-media-id'}}]}));
  await t.mutation(upsert,{contentType:'page',contentId:ids.post,action:'upsert'});
  expect((await t.run(ctx=>readSearch(ctx,{query:'Unavailablemedianeedle'},scope,'host'))).items).toEqual([]);
});
