import { expect, test } from "bun:test";
import { convexTest } from "convex-test";
import { makeFunctionReference } from "convex/server";
import schema from "../../schema";
import { readKnowledgeSearch } from "../../canonicalDocuments/knowledgeBase";
import { createPublicKbAccess } from "../publicAccess";
import { RequestReadLedger } from "../../helpers/requestReadLedger";
const modules = {
  "./convex/_generated/api.js": () => import("../../_generated/api.js"),
  "./convex/_generated/server.js": () => import("../../_generated/server.js"),
  "./convex/membership/policyReads.ts": () => import("../../membership/policyReads"),
  "./convex/kb/search.ts": () => import("../search"),
  "./convex/kb/categories.ts": () => import("../categories"),
  "./convex/kb/queries.ts": () => import("../queries"),
};
const search = makeFunctionReference<"query">("kb/search:search");
const detail = makeFunctionReference<"query">("kb/queries:getBySlug");
async function fixture() {
  const t = convexTest({ schema, modules });
  const ids = await t.run(async ctx => {
    const user = await ctx.db.insert("users", {authSource:"local", email:"PRIVATE_EMAIL@example.invalid",emailVerified:true,status:"active",createdAt:1,updatedAt:1});
    const setting = await ctx.db.insert("settings", {section:"plugins",values:{knowledgeBaseEnabled:true,membershipEnabled:true},updatedBy:user,updatedAt:1});
    const category = await ctx.db.insert("kb_categories", {name:"Getting started",slug:"start",order:0,isActive:true,isPublished:true,articleCount:2,createdAt:1,updatedAt:1});
    const article = await ctx.db.insert("kb_articles", {title:"Setup guide",slug:"setup",excerpt:"A quick guide",content:'{"type":"doc","content":[]}',contentPlainText:"setup a website",status:"published",authorId:user,contributors:[],categoryId:category,keywords:["PRIVATE_KEYWORD"],viewCount:1,uniqueViewCount:1,helpfulVotes:0,notHelpfulVotes:0,readingTimeMinutes:2,version:1,isFeatured:false,sortOrder:0,meilisearchSynced:false,ragSynced:false,createdAt:1,updatedAt:1});
    const related = await ctx.db.insert("kb_articles", {...(await ctx.db.get(article))!,_id:undefined,_creationTime:undefined,title:"Second guide",slug:"second",status:"draft"} as never);
    await ctx.db.insert("kb_relatedArticles",{sourceArticleId:article,relatedArticleId:related,relationType:"related",createdAt:1});
    return {user,setting,category,article,related};
  });
  return {t,ids,search:()=>t.query(search,{query:"setup"}),detail:()=>t.query(detail,{slug:"setup"})};
}
test("public search exposes summaries and article detail excludes private author/editorial fields",async()=>{
  const f=await fixture();const result=await f.search();expect(result.results).toHaveLength(1);expect(result.total).toBe(1);
  for(const field of ["contentPlainText","content","contributors","keywords","authorId"]) expect(result.results[0]).not.toHaveProperty(field);
  const article=await f.detail();expect(article.contentPlainText).toBe("setup a website");expect(article.author.displayName).toBe("Author");expect(article.relatedArticles).toEqual([]);
  for(const secret of ["PRIVATE_EMAIL","PRIVATE_KEYWORD","contributors","authorId","ragSynced"])expect(JSON.stringify(article)).not.toContain(secret);
});
test("unpublished, deleted categories and draft articles do not leak through search or direct reads",async()=>{
  const f=await fixture();
  await f.t.run(ctx=>ctx.db.patch(f.ids.category,{isPublished:false}));expect((await f.search()).results).toEqual([]);expect(await f.detail()).toBeNull();
  await f.t.run(ctx=>ctx.db.delete(f.ids.category));expect((await f.search()).results).toEqual([]);expect(await f.detail()).toBeNull();
  await f.t.run(ctx=>ctx.db.patch(f.ids.article,{categoryId:undefined}));expect((await f.search()).results).toHaveLength(1);expect((await f.detail()).category).toBeNull();
  await f.t.run(ctx=>ctx.db.patch(f.ids.article,{status:"draft"}));expect((await f.search()).results).toEqual([]);expect(await f.detail()).toBeNull();
});
test("route restrictions apply to search, article routes and help/category routes",async()=>{
  for(const path of ["/help","/help/start","/help/start/setup"]) {
    const f=await fixture();await f.t.run(ctx=>ctx.db.insert("membership_restriction_rules",{resourceType:"route",resourceIdOrKey:path,ruleMode:"allow_only",planIds:[],loginRequired:true,teaserMode:"hide",createdAt:1,updatedAt:1}));
    expect((await f.search())?.results??[]).toEqual([]);expect(await f.detail()).toBeNull();
  }
  const f=await fixture();await f.t.run(ctx=>ctx.db.insert("membership_restriction_rules",{resourceType:"route",resourceIdOrKey:"/help/search",ruleMode:"allow_only",planIds:[],loginRequired:true,teaserMode:"hide",createdAt:1,updatedAt:1}));expect(await f.search()).toBeNull();expect(await f.detail()).not.toBeNull();
});
test("disabled plugin and invalid search sizes fail before content disclosure",async()=>{
  const f=await fixture();expect(await f.t.query(search,{query:"   "})).toEqual({results:[],total:0});
  for(const limit of [-1,0,1.5,101])await expect(f.t.query(search,{query:"setup",limit})).rejects.toThrow("INVALID_SEARCH");
  await expect(f.t.query(search,{query:"x".repeat(501)})).rejects.toThrow("INVALID_SEARCH");
  await f.t.run(ctx=>ctx.db.patch(f.ids.setting,{values:{knowledgeBaseEnabled:false}}));expect(await f.search()).toBeNull();expect(await f.detail()).toBeNull();
});
test("public access caches category and route policy reads only for its own query",async()=>{
  const f=await fixture();await f.t.run(async ctx=>{
    const budget=new RequestReadLedger();const access=createPublicKbAccess(ctx,budget);const article=(await ctx.db.get(f.ids.article))!;
    expect(await access.article(article)).not.toBeNull();const counts={queries:budget.queries,documents:budget.documents};
    for(let i=0;i<50;i++)expect(await access.article(article)).not.toBeNull();
    expect({queries:budget.queries,documents:budget.documents}).toEqual(counts);
  });
});

const searchPage=makeFunctionReference<"query">("kb/search:searchPage");
test("ranked search pagination advances past hidden pages and binds continuation to the search and category",async()=>{
 const f=await fixture();await f.t.run(async ctx=>{
  const original=(await ctx.db.get(f.ids.article))!;const {_id,_creationTime,...article}=original;
  const hidden=await ctx.db.insert("kb_categories",{name:"Private category",slug:"private-category",order:1,isActive:true,isPublished:false,articleCount:45,createdAt:1,updatedAt:1});
  for(let i=0;i<45;i++)await ctx.db.insert("kb_articles",{...article,title:`Private guide ${i}`,slug:`private-${i}`,categoryId:hidden});
 });
 let cursor:string|null=null;const ids:string[]=[];let pages=0,emptyContinuation=false;
 do{const result=await f.t.query(searchPage,{query:"setup",paginationOpts:{numItems:10,cursor}});expect(result.page.length).toBeLessThanOrEqual(10);ids.push(...result.page.map((a:any)=>a._id));
  if(!result.isDone&&result.page.length===0)emptyContinuation=true;
  if(!result.isDone){await expect(f.t.query(searchPage,{query:"different",paginationOpts:{numItems:10,cursor:result.continueCursor}})).rejects.toThrow("INVALID_SEARCH_CURSOR");await expect(f.t.query(searchPage,{query:"setup",categorySlug:"start",paginationOpts:{numItems:10,cursor:result.continueCursor}})).rejects.toThrow("INVALID_SEARCH_CURSOR");}
  cursor=result.isDone?null:result.continueCursor;if(++pages>10)throw Error("Search pagination did not converge");
 }while(cursor);
 expect(ids).toEqual([f.ids.article]);expect(emptyContinuation).toBe(true);expect(pages).toBeGreaterThan(1);
 const selected=await f.t.query(searchPage,{query:"setup",categorySlug:"start",paginationOpts:{numItems:10,cursor:null}});expect(selected.page.map((a:any)=>a._id)).toEqual([f.ids.article]);expect(selected.isDone).toBe(true);
 await f.t.run(ctx=>ctx.db.patch(f.ids.category,{isPublished:false}));expect((await f.t.query(searchPage,{query:"setup",categorySlug:"start",paginationOpts:{numItems:10,cursor:null}})).page).toEqual([]);
});


test("canonical help suggestions enforce plugin, category and route access without exposing article bodies", async () => {
  const f = await fixture();
  const read = (category?: string) => f.t.run(ctx => readKnowledgeSearch(ctx, category ? { category } : {}));
  const result = await read(f.ids.category);
  expect(result.category).toEqual({ id: f.ids.category, name: "Getting started", slug: "start" });
  expect(result.articles.map(article => article.href)).toEqual(["/help/start/setup"]);
  for (const field of ["content", "contentPlainText", "authorId", "keywords", "contributors"])
    expect(result.articles[0]).not.toHaveProperty(field);
  expect(await read("missing-category")).toEqual({ available: false, category: null, articles: [] });
  for (const path of ["/help", "/help/search", "/help/start", "/help/start/setup"]) {
    const rule = await f.t.run(ctx => ctx.db.insert("membership_restriction_rules", {
      resourceType: "route", resourceIdOrKey: path, ruleMode: "allow_only", planIds: [],
      loginRequired: true, teaserMode: "hide", createdAt: 1, updatedAt: 1,
    }));
    expect((await read(f.ids.category)).articles).toEqual([]);
    await f.t.run(ctx => ctx.db.delete(rule));
  }
  await f.t.run(ctx => ctx.db.patch(f.ids.category, { isPublished: false }));
  expect(await read(f.ids.category)).toEqual({ available: false, category: null, articles: [] });
  expect((await read()).articles).toEqual([]);
  await f.t.run(ctx => ctx.db.delete(f.ids.category));
  expect(await read(f.ids.category)).toEqual({ available: false, category: null, articles: [] });
  await f.t.run(ctx => ctx.db.patch(f.ids.setting, { values: { knowledgeBaseEnabled: false } }));
  expect(await read()).toEqual({ available: false, category: null, articles: [] });
});

test("canonical help suggestions read a bounded indexed window as the article library grows", async () => {
  const f = await fixture();
  await f.t.run(async ctx => {
    const { _id, _creationTime, ...article } = (await ctx.db.get(f.ids.article))!;
    for (let i = 0; i < 1000; i++) await ctx.db.insert("kb_articles", {
      ...article, title: `Guide ${i}`, slug: `guide-${i}`, viewCount: i + 10,
    });
  });
  await f.t.run(async ctx => {
    const budget = new RequestReadLedger();
    const result = await readKnowledgeSearch(ctx, { category: f.ids.category }, budget);
    expect(result.articles.map(article => article.title)).toEqual(
      [999, 998, 997, 996, 995, 994].map(i => `Guide ${i}`),
    );
    expect(budget.documents).toBeLessThan(50);
    expect(budget.queries).toBeLessThan(40);
    expect(budget.bytes).toBeLessThan(100000);
  });
  await f.t.run(async ctx => {
    const budget = new RequestReadLedger({ queries: 256, documents: 5, bytes: 8 * 1024 * 1024, documentBytes: 512 * 1024 });
    await expect(readKnowledgeSearch(ctx, {}, budget)).rejects.toThrow("safe read budget");
  });
});


test("all public help feeds obey current access and return summaries with correct category links", async () => {
  const f = await fixture();
  await f.t.run(ctx => ctx.db.patch(f.ids.article, { isFeatured: true, publishedAt: 1 }));
  const feeds = ["getPopular", "getRecent", "getFeatured"];
  const read = (name: string) => f.t.query(makeFunctionReference<"query">(`kb/queries:${name}`), { limit: 6 });
  const list = () => f.t.query(makeFunctionReference<"query">("kb/queries:listPublished"), {
    categoryId: f.ids.category, paginationOpts: { numItems: 10, cursor: null },
  });
  for (const name of feeds) {
    const articles = await read(name);
    expect(articles.map((a: any) => a._id)).toEqual([f.ids.article]);
    expect(articles[0].categorySlug).toBe("start");
    for (const secret of ["PRIVATE_EMAIL", "PRIVATE_KEYWORD", "contentPlainText", "contributors", "authorId"])
      expect(JSON.stringify(articles)).not.toContain(secret);
    for (const limit of [-1, 0, 1.5, 101]) await expect(f.t.query(makeFunctionReference<"query">(`kb/queries:${name}`), { limit })).rejects.toThrow("INVALID_LIMIT");
  }
  expect((await list()).page[0]).not.toHaveProperty("content");
  const categoryCalls = ["listPublished", "getHierarchy", "getBySlug"];
  const categoryRead = (name: string) => f.t.query(makeFunctionReference<"query">(`kb/categories:${name}`), name === "getBySlug" ? { slug: "start" } : {});
  for (const path of ["/help/start/setup", "/help/start", "/help"]) {
    const rule = await f.t.run(ctx => ctx.db.insert("membership_restriction_rules", {
      resourceType: "route", resourceIdOrKey: path, ruleMode: "allow_only", planIds: [], loginRequired: true,
      teaserMode: "hide", createdAt: 1, updatedAt: 1,
    }));
    for (const name of feeds) expect((await read(name)) ?? []).toEqual([]);
    expect((await list()).page).toEqual([]);
    if (path !== "/help/start/setup") for (const name of categoryCalls)
      expect(JSON.stringify(await categoryRead(name))).not.toContain("Getting started");
    await f.t.run(ctx => ctx.db.delete(rule));
  }
  await f.t.run(ctx => ctx.db.patch(f.ids.category, { isPublished: false }));
  for (const name of feeds) expect(await read(name)).toEqual([]);
  expect((await list()).page).toEqual([]);
  for (const name of categoryCalls) expect(JSON.stringify(await categoryRead(name))).not.toContain("Getting started");
});

test("popular and recent help feeds rank across the library rather than sorting an insertion-order sample", async () => {
  const f = await fixture();
  const winner = await f.t.run(async ctx => {
    const { _id, _creationTime, ...article } = (await ctx.db.get(f.ids.article))!;
    for (let i = 0; i < 80; i++) await ctx.db.insert("kb_articles", { ...article, slug: `old-${i}`, viewCount: 2, publishedAt: 2 });
    return ctx.db.insert("kb_articles", { ...article, title: "Newest and most useful", slug: "winner", viewCount: 1000, publishedAt: 1000 });
  });
  for (const name of ["getPopular", "getRecent"]) {
    const result = await f.t.query(makeFunctionReference<"query">(`kb/queries:${name}`), { limit: 1 });
    expect(result.map((a: any) => a._id)).toEqual([winner]);
  }
});
