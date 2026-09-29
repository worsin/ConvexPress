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

test('scheduled announcements and expiry text follow the current clock without a new index write', async () => {
 const {t,ids}=await fixture();
 const now=Date.now();
 await t.run(ctx=>ctx.db.patch('posts',ids.post,{blocks:[
  {id:'live',name:'core/announcement-bar',version:1,attrs:{text:'Announcementneedle',schedule:{startsAt:new Date(now-60000).toISOString(),endsAt:new Date(now+60000).toISOString()}}},
  {id:'future',name:'core/announcement-bar',version:1,attrs:{text:'Futureneedle',schedule:{startsAt:new Date(now+60000).toISOString()}}},
  {id:'past',name:'core/countdown',version:1,attrs:{title:'Clockneedle',target:new Date(now-60000).toISOString(),expiredText:'Expiredneedle'}},
  {id:'unset',name:'core/countdown',version:1,attrs:{expiredText:'Unsetneedle'}},
 ]}));
 await t.mutation(upsert,{contentType:'page',contentId:ids.post,action:'upsert'});
 const find=(query:string)=>t.run(ctx=>readSearch(ctx,{query},scope,'host'));
 for(const q of ['Announcementneedle','Expiredneedle'])expect((await find(q)).items.map(x=>x.id)).toEqual([ids.post]);
 for(const q of ['Futureneedle','Unsetneedle'])expect((await find(q)).items).toEqual([]);
 await t.run(async ctx=>{const p=await ctx.db.get('posts',ids.post);const blocks=p!.blocks! as any[];blocks[0].attrs.schedule.endsAt=new Date(now-1000).toISOString();await ctx.db.patch('posts',ids.post,{blocks});});
 expect((await find('Announcementneedle')).items).toEqual([]);
});

test('account copy resolves the current visitor and hides the opposite authored alternative', async () => {
 const {t,ids}=await fixture();
 await t.run(ctx=>ctx.db.patch('posts',ids.post,{blocks:[{id:'account',name:'core/account-teaser',version:1,attrs:{signedOutText:'Guestaccountneedle',signedInText:'Memberaccountneedle'}}]}));
 await t.mutation(upsert,{contentType:'page',contentId:ids.post,action:'upsert'});
 const signed=t.withIdentity({subject:ids.user,issuer:'https://convexpress-admin.local'});
 expect((await t.run(ctx=>readSearch(ctx,{query:'Guestaccountneedle'},scope,'host'))).items.map(x=>x.id)).toEqual([ids.post]);
 expect((await t.run(ctx=>readSearch(ctx,{query:'Memberaccountneedle'},scope,'host'))).items).toEqual([]);
 expect((await signed.run(ctx=>readSearch(ctx,{query:'Memberaccountneedle'},scope,'host'))).items.map(x=>x.id)).toEqual([ids.post]);
 expect((await signed.run(ctx=>readSearch(ctx,{query:'Guestaccountneedle'},scope,'host'))).items).toEqual([]);
});

test('field guide search follows details, bounded items and the selected prose treatment', async () => {
 const {t,ids}=await fixture();
 const attrs={heading:'Guideneedle',body:'Read [Labelneedle](https://example.invalid/Hiddenhrefneedle).',showDetails:true,count:1,note:'Noteneedle',items:[{label:'Firstneedle',value:'Shownneedle'},{label:'Secondneedle',value:'Hiddenneedle'}]};
 await t.run(ctx=>ctx.db.patch('posts',ids.post,{blocks:[{id:'guide',name:'reference/field-guide',version:2,attrs}]}));
 await t.mutation(upsert,{contentType:'page',contentId:ids.post,action:'upsert'});
 const find=(query:string)=>t.run(ctx=>readSearch(ctx,{query},scope,'host'));
 for(const q of ['Guideneedle','Firstneedle','Shownneedle','Noteneedle'])expect((await find(q)).items.map(x=>x.id)).toEqual([ids.post]);
 // convex-test tokenizes only whitespace, unlike the real search index; inspect
 // exact current prose here and verify the Markdown label in installed acceptance.
 const current=await t.run(ctx=>createPublicSearchSourceReader(ctx)({contentType:'page',contentId:ids.post}));
 expect(current?.content).toContain('Labelneedle');expect(current?.content).not.toContain('Hiddenhrefneedle');
 for(const q of ['Secondneedle','Hiddenneedle','Hiddenhrefneedle'])expect((await find(q)).items).toEqual([]);
 await t.run(ctx=>ctx.db.patch('posts',ids.post,{blocks:[{id:'guide',name:'reference/field-guide',version:2,attrs:{...attrs,showDetails:false}}]}));
 expect((await find('Noteneedle')).items).toEqual([]);expect((await find('Guideneedle')).items.map(x=>x.id)).toEqual([ids.post]);
});

test('manual collection bodies follow mode, per-panel count and current price disclosure',async()=>{
 const {t,ids}=await fixture();await t.run(ctx=>ctx.db.patch('settings',ids.plugins,{values:{commerceEnabled:true,membershipEnabled:false}}));
 const attrs={heading:'Collectionneedle',count:1,showPrice:false,products:[{title:'Firstcardneedle',price:'Privatepriceneedle'},{title:'Overflowcardneedle'}],groups:[{label:'Group',products:[{title:'Groupcardneedle'},{title:'Groupoverflowneedle'}]}]};
 const write=(patch:Record<string,unknown>)=>t.run(ctx=>ctx.db.patch('posts',ids.post,{blocks:[{id:'collection',name:'blocks/product-collection',version:2,attrs:{...attrs,...patch}}]}));
 await write({});await t.mutation(upsert,{contentType:'page',contentId:ids.post,action:'upsert'});
 const find=(query:string)=>t.run(ctx=>readSearch(ctx,{query},scope,'host'));
 for(const q of ['Collectionneedle','Firstcardneedle','Groupcardneedle'])expect((await find(q)).items.map(x=>x.id)).toEqual([ids.post]);
 for(const q of ['Overflowcardneedle','Groupoverflowneedle','Privatepriceneedle'])expect((await find(q)).items).toEqual([]);
 await write({showPrice:true});expect((await find('Privatepriceneedle')).items.map(x=>x.id)).toEqual([ids.post]);
 await write({productIds:['missing-product']});expect((await find('Firstcardneedle')).items).toEqual([]);expect((await find('Groupcardneedle')).items.map(x=>x.id)).toEqual([ids.post]);
 await write({mode:'featured',groups:[]});expect((await find('Firstcardneedle')).items).toEqual([]);expect((await find('Groupcardneedle')).items).toEqual([]);
});

test('audio body matches require a currently supported selected recording',async()=>{
 const {t,ids}=await fixture();
 const media=await t.run(ctx=>ctx.db.insert('media',{fileName:'recording.wav',slug:'recording',mediaType:'audio',mimeType:'audio/wav',fileSize:12,url:'https://example.invalid/recording.wav',title:'Recording',status:'active',uploadedBy:ids.user,createdAt:1,updatedAt:1}));
 const write=(selected:boolean)=>t.run(ctx=>ctx.db.patch('posts',ids.post,{blocks:[{id:'audio',name:'core/audio',version:1,attrs:{title:'Audioneedle',...(selected?{media:{id:media}}:{})}}]}));
 await write(true);await t.mutation(upsert,{contentType:'page',contentId:ids.post,action:'upsert'});
 const find=()=>t.run(ctx=>readSearch(ctx,{query:'Audioneedle'},scope,'host'));
 expect((await find()).items.map(x=>x.id)).toEqual([ids.post]);
 await write(false);expect((await find()).items).toEqual([]);await write(true);
 await t.run(ctx=>ctx.db.patch('media',media,{mimeType:'image/png'}));expect((await find()).items).toEqual([]);
});

test('timed matches and hidden future alternatives carry bounded refresh leases on both search surfaces',async()=>{
 const{t,ids}=await fixture(),boundary=Date.now()+15000;
 await t.run(ctx=>ctx.db.patch('posts',ids.post,{blocks:[{id:'timed',name:'core/announcement-bar',version:1,attrs:{text:'Timedleaseneedle',schedule:{endsAt:new Date(boundary).toISOString()}}},{id:'future',name:'core/countdown',version:1,attrs:{target:new Date(boundary).toISOString(),expiredText:'Futureleaseneedle'}}]}));
 await t.mutation(upsert,{contentType:'page',contentId:ids.post,action:'upsert'});
 for(const q of ['Timedleaseneedle','Futureleaseneedle']){
  const result=await t.query(ref<'query'>('search/queries:search'),{q,refreshKey:'owned-test'});
  expect(result.displayLease.expiresAt).toBe(boundary);expect(result.displayLease.evaluatedAt).toBeLessThan(boundary);expect(result.results.length).toBe(q==='Timedleaseneedle'?1:0);
  const budget=new RequestReadLedger();await t.run(ctx=>readSearch(ctx,{query:q},scope,'host',budget));expect(budget.authorizationRecheckAt).toBe(boundary);
 }
 await expect(t.query(ref<'query'>('search/queries:search'),{q:'Timedleaseneedle',refreshKey:'../bad'})).rejects.toThrow();
});

test('promoted Library composition keeps its visible authored prose searchable', async () => {
  const {t,ids}=await fixture();
  await t.run(ctx=>ctx.db.patch('posts',ids.post,{blocks:[{id:'studio',name:'blocks/studio-services',version:1,attrs:{headline:'Promotedheadingneedle',services:[{title:'Promotedserviceneedle',description:'Promoteddescriptionneedle'}]}}]}));
  await t.mutation(upsert,{contentType:'page',contentId:ids.post,action:'upsert'});
  for(const query of ['Promotedheadingneedle','Promotedserviceneedle','Promoteddescriptionneedle']){
    expect((await t.query(ref<'query'>('search/queries:search'),{q:query})).results.map(r=>r.contentId)).toEqual([ids.post]);
    expect((await t.run(ctx=>readSearch(ctx,{query},scope,'host'))).items.map(r=>r.id)).toEqual([ids.post]);
  }
});
test('custom HTML searches sanitized visible text with decoded entities and excludes removed content',async()=>{
  const {t,ids}=await fixture();
  const html='<h2>Htmlheadingneedle</h2><p>Visible<strong>joinedneedle</strong> &amp; &#x45;ntityneedle <a href="https://example.invalid/Hiddenhrefneedle" title="Hiddenattributeneedle">Htmllabelneedle</a></p><script>Hiddenscriptneedle</script><style>Hiddenstylename</style><textarea>Hiddentextareaneedle</textarea><p hidden>Unhiddenneedle</p>';
  await t.run(ctx=>ctx.db.patch('posts',ids.post,{blocks:[{id:'html',name:'core/custom-html',version:1,attrs:{html}}]}));await t.mutation(upsert,{contentType:'page',contentId:ids.post,action:'upsert'});
  for(const query of ['Htmlheadingneedle','Visiblejoinedneedle','Entityneedle','Htmllabelneedle','Unhiddenneedle'])expect((await t.query(ref<'query'>('search/queries:search'),{q:query})).results.map(r=>r.contentId)).toEqual([ids.post]);
  for(const query of ['Hiddenhrefneedle','Hiddenattributeneedle','Hiddenscriptneedle','Hiddenstylename','Hiddentextareaneedle'])expect((await t.query(ref<'query'>('search/queries:search'),{q:query})).results).toEqual([]);
});

test('assistant authored copy follows current public host settings without indexing private controls',async()=>{
 const{t,ids}=await fixture();await t.run(async ctx=>{await ctx.db.patch('settings',ids.plugins,{values:{commerceEnabled:true}});await ctx.db.patch('posts',ids.post,{blocks:[{id:'assistant',name:'commerce/assistant-band',version:1,attrs:{eyebrow:'Assistantbrowneedle',heading:'Assistantheadingneedle',body:'A [story](https://example.invalid/Assistanthrefneedle)',prompts:['Assistantquestionneedle'],ctaLabel:'Assistantcontrolneedle',ctaUrl:'/products'}}]});});
 await t.mutation(upsert,{contentType:'page',contentId:ids.post,action:'upsert'});
 const query=(q:string)=>t.query(ref<'query'>('search/queries:search'),{q});
 expect((await query('Assistantheadingneedle')).results.map(x=>x.contentId)).toEqual([ids.post]);expect((await query('Assistantquestionneedle')).results.map(x=>x.contentId)).toEqual([ids.post]);
 for(const q of ['Assistanthrefneedle','Assistantcontrolneedle'])expect((await query(q)).results).toEqual([]);
 const setting=await t.run(ctx=>ctx.db.insert('settings',{section:'commerce.assistant',values:{enabled:false},updatedAt:1,updatedBy:ids.user}));expect((await query('Assistantheadingneedle')).results).toEqual([]);
 await t.run(ctx=>ctx.db.patch('settings',setting,{values:{enabled:true,routes:{catalog:false}}}));expect((await query('Assistantquestionneedle')).results).toEqual([]);
 await t.run(ctx=>ctx.db.patch('settings',setting,{values:{enabled:true,routes:{catalog:true}}}));expect((await query('Assistantheadingneedle')).results.map(x=>x.contentId)).toEqual([ids.post]);
});
test('iframe fallback headings and map addresses are searchable without link destinations',async()=>{
 const{t,ids}=await fixture();await t.run(ctx=>ctx.db.patch('posts',ids.post,{blocks:[{id:'embed',name:'core/iframe',version:1,attrs:{url:{label:'Framefallbackneedle',href:'https://www.youtube.com/watch?v=dQw4w9WgXcQ'}}},{id:'map',name:'core/map',version:1,attrs:{address:'Mapaddressneedle'}}]}));await t.mutation(upsert,{contentType:'page',contentId:ids.post,action:'upsert'});
 for(const q of ['Framefallbackneedle','Mapaddressneedle'])expect((await t.query(ref<'query'>('search/queries:search'),{q})).results.map(x=>x.contentId)).toEqual([ids.post]);
 await t.run(ctx=>ctx.db.patch('posts',ids.post,{blocks:[{id:'embed',name:'core/iframe',version:1,attrs:{title:'Missingframeneedle'}}]}));await t.mutation(upsert,{contentType:'page',contentId:ids.post,action:'upsert'});expect((await t.query(ref<'query'>('search/queries:search'),{q:'Missingframeneedle'})).results).toEqual([]);
});
test('unsupported embed and direct video sources cannot leave other body matches from an unrenderable document',async()=>{
 const{t,ids}=await fixture();for(const [name,attrs]of [['core/embed',{url:'https://unapproved.invalid/player',caption:'Embedcaptionneedle'}],['core/iframe',{url:{href:'https://unapproved.invalid/player',label:'Frameheadingneedle'}}],['core/script-embed',{provider:'youtube',resourceId:'invalid'}],['core/video',{url:{href:'https://example.invalid/player',label:'Videoariaonlyneedle'}}]] as const){
  await t.run(ctx=>ctx.db.patch('posts',ids.post,{blocks:[paragraph('copy','Visiblebodyneedle'),{id:'invalid',name,version:name==='core/embed'?2:1,attrs}]}));await t.mutation(upsert,{contentType:'page',contentId:ids.post,action:'upsert'});expect((await t.query(ref<'query'>('search/queries:search'),{q:'Visiblebodyneedle'})).results).toEqual([]);
 }
});
test('poll question and options use the current published ballot, not invalid or disabled alternatives',async()=>{
 const{t,ids}=await fixture();const attrs={question:'Pollquestionneedle',options:[{key:'one',label:'Pollfirstneedle'},{key:'two',label:'Pollsecondneedle'}],showResults:false,responsePolicy:'signedIn'};
 await t.run(async ctx=>{await ctx.db.patch('settings',ids.plugins,{values:{formsEnabled:true}});await ctx.db.patch('posts',ids.post,{blocks:[{id:'poll',name:'core/poll',version:1,attrs}]});});await t.mutation(upsert,{contentType:'page',contentId:ids.post,action:'upsert'});
 for(const q of ['Pollquestionneedle','Pollfirstneedle']){expect((await t.query(ref<'query'>('search/queries:search'),{q})).results.map(x=>x.contentId)).toEqual([ids.post]);expect((await t.run(ctx=>readSearch(ctx,{query:q},scope,'host'))).items.map(x=>x.id)).toEqual([ids.post]);}
 await t.run(ctx=>ctx.db.patch('posts',ids.post,{blocks:[{id:'poll',name:'core/poll',version:1,attrs:{...attrs,question:''}}]}));expect((await t.query(ref<'query'>('search/queries:search'),{q:'Pollfirstneedle'})).results).toEqual([]);
 await t.run(async ctx=>{await ctx.db.patch('posts',ids.post,{blocks:[{id:'poll',name:'core/poll',version:1,attrs}]});await ctx.db.patch('settings',ids.plugins,{values:{formsEnabled:false}});});expect((await t.query(ref<'query'>('search/queries:search'),{q:'Pollquestionneedle'})).results).toEqual([]);
});
