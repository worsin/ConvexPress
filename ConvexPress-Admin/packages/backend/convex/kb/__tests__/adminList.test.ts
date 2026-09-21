import { expect, test } from "bun:test";
import { convexTest } from "convex-test";
import { makeFunctionReference as ref } from "convex/server";
import schema from "../../schema";
import type { Id } from "../../_generated/dataModel";
const modules = {
  "./convex/_generated/api.js": () => import("../../_generated/api.js"),
  "./convex/_generated/server.js": () => import("../../_generated/server.js"),
  "./convex/kb/queries.ts": () => import("../queries"),
};
const list = ref<"query">("kb/queries:list");
async function fixture() {
  const t = convexTest({ schema, modules });
  const ids = await t.run(async ctx => {
    const role = await ctx.db.insert("roles", { name:"KB reader",slug:"kb-reader",description:"Fixture",level:10,type:"internal",status:"active",isDefault:false,isProtected:false,pageAccess:[],capabilities:["kb.view"],createdAt:1,updatedAt:1 });
    const user = await ctx.db.insert("users", {authSource:"local",email:"reader@example.invalid",emailVerified:true,status:"active",roleId:role,createdAt:1,updatedAt:1});
    const other = await ctx.db.insert("users", {authSource:"local",email:"other@example.invalid",emailVerified:true,status:"active",createdAt:1,updatedAt:1});
    await ctx.db.insert("settings", {section:"plugins",values:{knowledgeBaseEnabled:true},updatedBy:user,updatedAt:1});
    const categories = await Promise.all(["selected", "other"].map(slug => ctx.db.insert("kb_categories", {name:slug,slug,order:0,isActive:true,isPublished:true,articleCount:0,createdAt:1,updatedAt:1})));
    const articles: Id<"kb_articles">[] = [];
    for (let i=0;i<47;i++) articles.push(await ctx.db.insert("kb_articles", { title:`Compass guide ${i}`,slug:`compass-${i}`,excerpt:"Summary",content:"PRIVATE_DRAFT_BODY",contentPlainText:"compass guide",status:i%3===0?"published":"draft",authorId:i%2===0?user:other,categoryId:categories[i%2],contributors:[],keywords:[],viewCount:0,uniqueViewCount:0,helpfulVotes:0,notHelpfulVotes:0,readingTimeMinutes:1,version:1,isFeatured:false,sortOrder:0,meilisearchSynced:false,ragSynced:false,createdAt:i+1,updatedAt:i+1 }));
    return {role,user,other,categories,articles};
  });
  return {t,ids,client:t.withIdentity({subject:ids.user,issuer:"https://convexpress-admin.local"})};
}
test("admin list denies anonymous, missing KB capability and inactive identities", async()=>{
  const f=await fixture(),args={paginationOpts:{numItems:10,cursor:null}};
  await expect(f.t.query(list,args)).rejects.toThrow();
  await f.t.run(ctx=>ctx.db.patch(f.ids.role,{capabilities:[]}));
  await expect(f.client.query(list,args)).rejects.toThrow();
  await f.t.run(async ctx=>{await ctx.db.patch(f.ids.role,{capabilities:["kb.view"]});await ctx.db.patch(f.ids.user,{status:"inactive"});});
  await expect(f.client.query(list,args)).rejects.toThrow();
});
test("admin full-text search pages through every result without duplicates",async()=>{
  const f=await fixture();let cursor:string|null=null;const ids:string[]=[];let pages=0;
  do {
    const result=await f.client.query(list,{search:"compass",paginationOpts:{numItems:10,cursor}});
    expect(result.page.length).toBeLessThanOrEqual(10);
    ids.push(...result.page.map((a:{_id:string})=>a._id));
    cursor=result.isDone?null:result.continueCursor;if(++pages>10)throw Error("Pagination did not converge");
  }while(cursor);
  expect(ids.length).toBe(47);expect(new Set(ids).size).toBe(47);expect(pages).toBeGreaterThan(1);
});
test("combined status/category/author filters apply in both list and search",async()=>{
  const f=await fixture();
  for(const search of [undefined,"compass"]){
    const result=await f.client.query(list,{search,status:"draft",categoryId:f.ids.categories[0],authorId:f.ids.user,paginationOpts:{numItems:100,cursor:null}});
    expect(result.page.length).toBe(16);
    for(const article of result.page){expect(article.status).toBe("draft");expect(article.categoryId).toBe(f.ids.categories[0]);expect(article.authorId).toBe(f.ids.user);}
    const other=await f.client.query(list,{search,status:"draft",categoryId:f.ids.categories[1],paginationOpts:{numItems:100,cursor:null}});
    expect(other.page.length).toBe(15);for(const article of other.page)expect(article.categoryId).toBe(f.ids.categories[1]);
  }
});
test("admin list rejects unbounded page sizes and overlong searches",async()=>{
  const f=await fixture();for(const numItems of [0,-1,1.5,101])await expect(f.client.query(list,{paginationOpts:{numItems,cursor:null}})).rejects.toThrow();
  await expect(f.client.query(list,{search:"x".repeat(501),paginationOpts:{numItems:10,cursor:null}})).rejects.toThrow();
});
