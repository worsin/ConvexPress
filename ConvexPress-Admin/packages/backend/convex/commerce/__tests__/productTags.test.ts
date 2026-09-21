import {test,expect} from "bun:test";
import {convexTest} from "convex-test";
import schema from "../../schema";
import {normalizeProductTags,resolveProductTags,readProductTagAssignments,findVisibleProductTag} from "../productTags";
import {create,update,get} from "../products";
import {readProductDiscoveryCandidates} from "../productDiscovery";

async function fixture(){
 const t=convexTest({schema,modules:{
  "./convex/_generated/api.js":()=>import("../../_generated/api.js"),
  "./convex/_generated/server.js":()=>import("../../_generated/server.js"),
 }});
 const ids=await t.run(async ctx=>{
  const roleId=await ctx.db.insert("roles",{name:"Administrator",slug:"administrator",description:"Test",level:100,type:"internal",isDefault:false,isProtected:true,capabilities:["manage_options"],pageAccess:[],status:"active",createdAt:1,updatedAt:1});
  const user=await ctx.db.insert("users",{authSource:"local",email:"tags@example.invalid",emailVerified:true,status:"active",roleId,createdAt:1,updatedAt:1});
  const category=await ctx.db.insert("commerce_product_categories",{name:"Books",slug:"books",productCount:0,createdAt:1,updatedAt:1});
  await ctx.db.insert("settings",{section:"plugins",values:{commerceEnabled:true},updatedAt:1,updatedBy:user});
  return {user,category};
 });
 const admin=t.withIdentity({subject:ids.user,tokenIdentifier:`https://convexpress-admin.local|${ids.user}`});
 const add=(tagNames:string[])=>admin.run(ctx=>(create as any)._handler(ctx,{title:"Notebook",basePrice:{amount:2500,currencyCode:"USD"},categoryIds:[ids.category],status:"publish",tagNames}));
 return {t,admin,ids,add};
}
test("tag normalization preserves readable Unicode names and deduplicates canonical slugs",()=>{
 expect(normalizeProductTags([" Gifts ","gifts","文房具","  slow   mornings  "])).toEqual([{name:"Gifts",slug:"gifts"},{name:"文房具",slug:"文房具"},{name:"slow mornings",slug:"slow-mornings"}]);
 for(const names of [[""],["!!!"],["x".repeat(81)],Array(33).fill("tag")])expect(()=>normalizeProductTags(names)).toThrow();
});
test("validation happens before tag creation and unavailable terms cannot be silently recreated",async()=>{
 const {t}=await fixture();
 await expect(t.run(ctx=>resolveProductTags(ctx,["Valid","!!!"]))).rejects.toThrow("tag names");
 expect(await t.run(ctx=>ctx.db.query("commerce_product_tags").take(1))).toEqual([]);
 await t.run(ctx=>ctx.db.insert("commerce_product_tags",{name:"Hidden",slug:"hidden",isVisible:false,createdAt:1,updatedAt:1}));
 await expect(t.run(ctx=>resolveProductTags(ctx,["Hidden"]))).rejects.toThrow("unavailable");
 expect(await t.run(ctx=>findVisibleProductTag(ctx,"hidden"))).toBeNull();
});
test("registered authoring creates reusable tags, preserves omission and clears only the product assignment",async()=>{
 const {t,admin,add}=await fixture();
 const first=await add(["Gifts","gifts","文房具"]),second=await add(["Gifts"]);
 const one=await t.run(ctx=>ctx.db.get(first));const two=await t.run(ctx=>ctx.db.get(second));
 expect(one?.tagIds).toHaveLength(2);expect(two?.tagIds?.[0]).toBe(one?.tagIds?.[0]);
 const tagId=one!.tagIds![0]!;
 expect((await t.run(ctx=>readProductDiscoveryCandidates(ctx,"tag",tagId)))).toHaveLength(2);
 const detail=await admin.run(ctx=>(get as any)._handler(ctx,{productId:first}));
 expect(detail.tagNames).toEqual(["Gifts","文房具"]);expect(detail.missingTagIds).toEqual([]);
 await admin.run(ctx=>(update as any)._handler(ctx,{productId:first,title:"Still tagged"}));
 expect((await t.run(ctx=>ctx.db.get(first)))?.tagIds).toEqual(one?.tagIds);
 await admin.run(ctx=>(update as any)._handler(ctx,{productId:first,tagNames:[]}));
 expect((await t.run(ctx=>ctx.db.get(first)))?.tagIds).toEqual([]);
 expect((await t.run(ctx=>readProductDiscoveryCandidates(ctx,"tag",tagId))).map(e=>e.productId)).toEqual([second]);
 expect(await t.run(ctx=>ctx.db.get(tagId))).not.toBeNull();
});
test("tag assignment remains protected by product authoring permissions",async()=>{
 const {t,add}=await fixture();const id=await add([]);
 await expect(t.run(ctx=>(update as any)._handler(ctx,{productId:id,tagNames:["Unauthorized"]}))).rejects.toThrow();
 expect(await t.run(ctx=>findVisibleProductTag(ctx,"unauthorized"))).toBeNull();
});
test("missing assignments stay observable and survive unrelated product changes",async()=>{
 const {t,admin,add}=await fixture();const id=await add(["Missing"]);
 const product=await t.run(ctx=>ctx.db.get(id));const tagId=product!.tagIds![0]!;
 await t.run(ctx=>ctx.db.delete(tagId));
 expect(await t.run(ctx=>readProductTagAssignments(ctx,product!.tagIds))).toEqual({names:[],missingIds:[tagId]});
 const detail=await admin.run(ctx=>(get as any)._handler(ctx,{productId:id}));expect(detail.missingTagIds).toEqual([tagId]);
 await admin.run(ctx=>(update as any)._handler(ctx,{productId:id,title:"Keep missing reference"}));
 expect((await t.run(ctx=>ctx.db.get(id)))?.tagIds).toEqual([tagId]);
 await admin.run(ctx=>(update as any)._handler(ctx,{productId:id,tagNames:[]}));
 expect((await t.run(ctx=>ctx.db.get(id)))?.tagIds).toEqual([]);
});


test("product tag lookup never resolves an editorial tag with the same slug",async()=>{
 const {t}=await fixture();
 await t.run(ctx=>ctx.db.insert("terms",{name:"Blog gifts",slug:"gifts",taxonomy:"post_tag",count:0,isDefault:false,createdAt:1,updatedAt:1}));
 expect(await t.run(ctx=>findVisibleProductTag(ctx,"gifts"))).toBeNull();
 const ids=await t.run(ctx=>resolveProductTags(ctx,["Gifts"]));
 expect((await t.run(ctx=>findVisibleProductTag(ctx,"gifts")))?._id).toBe(ids[0]);
});
