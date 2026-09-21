import { expect, test } from "bun:test";
import { convexTest } from "convex-test";
import { makeFunctionReference } from "convex/server";
import schema from "../../schema";

const modules = {
  "./convex/_generated/api.js": () => import("../../_generated/api.js"),
  "./convex/_generated/server.js": () => import("../../_generated/server.js"),
  "./convex/membership/policyReads.ts": () => import("../../membership/policyReads"),
  "./convex/recipes/queries.ts": () => import("../queries"),
};
const endpoint = (name: string) => makeFunctionReference<"query">(`recipes/queries:${name}`);
async function fixture() {
  const t = convexTest({ schema, modules });
  const ids = await t.run(async ctx => {
    const role = await ctx.db.insert("roles", { name:"Author",slug:"author",description:"Test",level:60,type:"internal",status:"active",isDefault:false,isProtected:false,capabilities:["post.create","post.update"],pageAccess:[],createdAt:1,updatedAt:1 });
    const user = await ctx.db.insert("users", { authSource:"local",email:"recipe@example.invalid",emailVerified:true,status:"active",roleId:role,createdAt:1,updatedAt:1 });
    const settings = await ctx.db.insert("settings", { section:"plugins",values:{recipesEnabled:true,membershipEnabled:true},updatedAt:1,updatedBy:user });
    const category = await ctx.db.insert("recipe_categories", { name:"Sunday",slug:"sunday",description:"Slow cooking",recipeCount:99,createdAt:1,updatedAt:1 });
    const recipe = await ctx.db.insert("recipes", { title:"Sunday beans",slug:"sunday-beans",status:"publish",authorId:user,categoryIds:[category],ingredients:["Beans","Water"],instructions:["Simmer."],scannedText:"PRIVATE SCAN",aiExtractedFromScan:true,isFeatured:false,publishedAt:1,createdAt:1,updatedAt:1 });
    return { user, settings, category, recipe };
  });
  return { t, ids };
}
test("registered public recipe endpoints omit scan, account and internal category fields", async () => {
  const { t, ids } = await fixture();
  const detail = await t.query(endpoint("getBySlug"), { slug:"sunday-beans" });
  const list = await t.query(endpoint("listPublished"), {});
  expect(detail).toMatchObject({ _id:ids.recipe, title:"Sunday beans", ingredients:["Beans","Water"] });
  expect(list.recipes).toHaveLength(1);
  for (const result of [detail, list, await t.query(endpoint("getCategoryBySlug"), {slug:"sunday"})]) {
    for (const field of ["PRIVATE SCAN", "scannedText", "scanMediaId", "authorId", "aiExtractedFromScan", "recipeCount", "createdAt", "updatedAt"]) expect(JSON.stringify(result)).not.toContain(field);
  }
});
test("public list, detail and categories obey collection and exact route policies", async () => {
  const { t } = await fixture();
  for (const route of ["/recipes", "/recipes/sunday-beans", "/recipes/category/sunday"]) {
    const rule = await t.run(ctx => ctx.db.insert("membership_restriction_rules", {resourceType:"route",resourceIdOrKey:route,ruleMode:"allow_only",planIds:[],teaserMode:"hide",loginRequired:true,createdAt:1,updatedAt:1}));
    const detail = await t.query(endpoint("getBySlug"), {slug:"sunday-beans"});
    const list = await t.query(endpoint("listPublished"), {});
    const category = await t.query(endpoint("getCategoryBySlug"), {slug:"sunday"});
    if (route === "/recipes" || route === "/recipes/sunday-beans") {
      expect(detail).toBeNull(); expect(list.recipes).toEqual([]); expect(list.total).toBe(0);
    }
    if (route !== "/recipes/sunday-beans") {
      expect(category).toBeNull();
      expect((await t.query(endpoint("listPublished"), {categorySlug:"sunday"})).recipes).toEqual([]);
    }
    if (route === "/recipes/category/sunday") expect(detail.categories).toEqual([]);
    await t.run(ctx => ctx.db.delete(rule));
    expect((await t.query(endpoint("getBySlug"), {slug:"sunday-beans"}))._id).toBeTruthy();
  }
});
test("future, draft, trash and disabled recipe content remains private", async () => {
  const { t, ids } = await fixture();
  for (const patch of [{status:"draft" as const},{status:"trash" as const},{status:"publish" as const,publishedAt:Date.now()+600000}]) {
    await t.run(ctx => ctx.db.patch(ids.recipe, patch));
    expect(await t.query(endpoint("getBySlug"), {slug:"sunday-beans"})).toBeNull();
    expect((await t.query(endpoint("listPublished"), {})).recipes).toEqual([]);
  }
  await t.run(ctx => ctx.db.patch(ids.settings,{values:{recipesEnabled:false,membershipEnabled:true}}));
  expect(await t.query(endpoint("getBySlug"), {slug:"sunday-beans"})).toBeNull();
  expect(await t.query(endpoint("listPublished"), {})).toBeNull();
});
test("editor category counts require editorial capability; public callers cannot enumerate them", async () => {
  const { t, ids } = await fixture();
  expect(await t.query(endpoint("listCategories"), {})).toEqual([]);
  const editor = t.withIdentity({issuer:"https://convexpress-admin.local",subject:ids.user});
  expect((await editor.query(endpoint("listCategories"), {}))[0].recipeCount).toBe(99);
  await t.run(ctx => ctx.db.patch(ids.user,{status:"inactive"}));
  expect(await editor.query(endpoint("listCategories"), {})).toEqual([]);
});
test("authorized viewers retain restricted recipes and disabled membership restores public access", async () => {
  const { t, ids } = await fixture();
  await t.run(ctx => ctx.db.insert("membership_restriction_rules", {resourceType:"route",resourceIdOrKey:"/recipes/*",ruleMode:"allow_only",planIds:[],teaserMode:"hide",loginRequired:true,createdAt:1,updatedAt:1}));
  expect(await t.query(endpoint("getBySlug"), {slug:"sunday-beans"})).toBeNull();
  const editor = t.withIdentity({issuer:"https://convexpress-admin.local",subject:ids.user});
  expect((await editor.query(endpoint("getBySlug"), {slug:"sunday-beans"}))._id).toBe(ids.recipe);
  expect((await editor.query(endpoint("listPublished"), {})).recipes).toHaveLength(1);
  await t.run(ctx => ctx.db.patch(ids.settings,{values:{recipesEnabled:true,membershipEnabled:false}}));
  expect((await t.query(endpoint("getBySlug"), {slug:"sunday-beans"}))._id).toBe(ids.recipe);
});
test("public recipes expose only active image references and never scan originals", async () => {
  const { t, ids } = await fixture();
  const image = await t.run(async ctx => {
    const image = await ctx.db.insert("media",{title:"Beans",fileName:"beans.png",slug:"beans",mimeType:"image/png",fileSize:100,mediaType:"image",url:"https://images.example.invalid/beans.png",status:"active",uploadedBy:ids.user,createdAt:1,updatedAt:1});
    await ctx.db.patch(ids.recipe,{featuredImageId:image,scanMediaId:image}); return image;
  });
  const read = () => t.query(endpoint("getBySlug"), {slug:"sunday-beans"});
  expect((await read()).featuredImageId).toBe(image);
  expect((await read()).scanMediaId).toBeUndefined();
  for (const status of ["processing", "failed", "trashed"] as const) {
    await t.run(ctx => ctx.db.patch(image,{status}));
    expect((await read()).featuredImageId).toBeUndefined();
  }
  await t.run(ctx => ctx.db.patch(image,{status:"active",mimeType:"application/pdf"}));
  expect((await read()).featuredImageId).toBeUndefined();
});
test("archive indexes publication and refuses overflow rather than reporting a partial total", async () => {
  const { t, ids } = await fixture();
  await t.run(async ctx => {
    const original = await ctx.db.get(ids.recipe); if (!original) throw Error("Missing fixture");
    const { _id, _creationTime, ...fields } = original;
    for (let i=0; i<1001; i++) await ctx.db.insert("recipes",{...fields,slug:`draft-${i}`,status:"draft"});
  });
  expect((await t.query(endpoint("listPublished"), {})).total).toBe(1);
  await t.run(async ctx => {
    const drafts = await ctx.db.query("recipes").withIndex("by_status",q=>q.eq("status","draft")).take(1001);
    for (const draft of drafts) await ctx.db.patch(draft._id,{status:"publish"});
  });
  await expect(t.query(endpoint("listPublished"), {})).rejects.toThrow("numbered-page read limit");
});
