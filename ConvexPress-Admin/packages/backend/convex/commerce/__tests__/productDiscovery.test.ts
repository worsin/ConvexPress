import {test,expect} from "bun:test";
import {convexTest} from "convex-test";
import schema from "../../schema";
import {insertWithMediaReferences,patchWithMediaReferences,replaceWithMediaReferences,deleteWithMediaReferences,insertDynamicWithMediaReferences,patchDynamicWithMediaReferences} from "../../media/attachmentGuard";
import {productDiscoveryIsReady,syncProductDiscovery,readProductDiscoveryCandidates} from "../productDiscovery";
import {rebuild} from "../productDiscoveryMaintenance";
import {RequestReadLedger} from "../../helpers/requestReadLedger";
const modules={
  "./convex/_generated/api.js":()=>import("../../_generated/api.js"),
  "./convex/_generated/server.js":()=>import("../../_generated/server.js"),
  "./convex/commerce/productDiscoveryMaintenance.ts":()=>import("../productDiscoveryMaintenance"),
};
async function fixture(){
 const t=convexTest({schema,modules});
 const ids=await t.run(async ctx=>({
  user:await ctx.db.insert("users",{authSource:"local",email:"discovery@example.invalid",emailVerified:true,status:"active",createdAt:1,updatedAt:1}),
  category:await ctx.db.insert("commerce_product_categories",{name:"Books",slug:"books",productCount:0,createdAt:1,updatedAt:1}),
 }));
 const product={title:"Notebook",slug:"notebook",status:"publish" as const,productType:"simple" as const,authorId:ids.user,categoryIds:[ids.category],galleryMediaIds:[],basePrice:{amount:2500,currencyCode:"USD"},trackInventory:false,allowBackorders:false,isVirtual:false,isDownloadable:false,createdAt:1,updatedAt:1};
 return {t,ids,product};
}
test("product index follows typed insert, category/featured edits, unpublish and deletion atomically",async()=>{
 const {t,product}=await fixture();
 const id=await t.run(ctx=>insertWithMediaReferences(ctx,"commerce_products",product));
 const entries=()=>t.run(ctx=>ctx.db.query("commerce_product_discovery").withIndex("by_product",q=>q.eq("productId",id)).take(67));
 expect((await entries()).map(e=>e.kind).sort()).toEqual(["category","recent"]);
 expect(await t.run(ctx=>productDiscoveryIsReady(ctx))).toBe(true);
 await t.run(ctx=>patchWithMediaReferences(ctx,"commerce_products",id,{categoryIds:[],isFeatured:true}));
 expect((await entries()).map(e=>e.kind).sort()).toEqual(["featured","recent"]);
 await t.run(ctx=>patchWithMediaReferences(ctx,"commerce_products",id,{status:"private"}));
 expect(await entries()).toEqual([]);
 await t.run(ctx=>replaceWithMediaReferences(ctx,"commerce_products",id,{...product,createdAt:9,isFeatured:true}));
 expect((await entries()).map(e=>e.createdAt)).toEqual([9,9,9]);
 await t.run(ctx=>deleteWithMediaReferences(ctx,"commerce_products",id));
 expect(await entries()).toEqual([]);
});
test("dynamic imports and patches maintain identical coordinates without trusting a supplied readiness stamp",async()=>{
 const {t,product}=await fixture();
 const raw=await t.run(ctx=>insertDynamicWithMediaReferences(ctx,"commerce_products",{...product,collectionIndexVersion:1,isFeatured:true}));
 await t.run(async ctx=>{
  const id=ctx.db.normalizeId("commerce_products",raw)!;
  expect(await ctx.db.query("commerce_product_discovery").withIndex("by_product",q=>q.eq("productId",id)).take(67)).toHaveLength(3);
  await patchDynamicWithMediaReferences(ctx,id,{isFeatured:false,categoryIds:[]});
  expect(await ctx.db.query("commerce_product_discovery").withIndex("by_product",q=>q.eq("productId",id)).take(67)).toHaveLength(1);
 });
});
test("index rebuild selects missing rows; retries and edits/deletion before rebuilding do not duplicate or skip",async()=>{
 const {t,product}=await fixture();
 const ids=await t.run(async ctx=>{
  const ids=[];for(let i=0;i<3;i++)ids.push(await ctx.db.insert("commerce_products",{...product,slug:`legacy-${i}`}));return ids;
 });
 expect(await t.run(ctx=>productDiscoveryIsReady(ctx))).toBe(false);
 await t.run(ctx=>patchWithMediaReferences(ctx,"commerce_products",ids[0]!,{isFeatured:true}));
 await t.run(ctx=>deleteWithMediaReferences(ctx,"commerce_products",ids[1]!));
 // Invoke the real registered handler inside a schema-backed transaction.
 const run=()=>t.run(ctx=>(rebuild as any)._handler(ctx,{}));
 expect(await run()).toEqual({processed:1,done:true});
 expect(await run()).toEqual({processed:0,done:true});
 const ledger=new RequestReadLedger();expect(await t.run(ctx=>productDiscoveryIsReady(ctx,ledger))).toBe(true);expect(ledger.queries).toBe(1);
 const entries=await t.run(ctx=>ctx.db.query("commerce_product_discovery").take(67));
 expect(entries).toHaveLength(5);expect(entries.filter(e=>e.productId===ids[0]&&e.kind==="featured")).toHaveLength(1);
});
test("invalid index coordinates roll back the product edit and preserve previous entries",async()=>{
 const {t,product}=await fixture();const id=await t.run(ctx=>insertWithMediaReferences(ctx,"commerce_products",product));
 const before=await t.run(ctx=>ctx.db.query("commerce_product_discovery").withIndex("by_product",q=>q.eq("productId",id)).take(67));
 await expect(t.run(ctx=>patchWithMediaReferences(ctx,"commerce_products",id,{createdAt:NaN}))).rejects.toThrow("creation date");
 expect((await t.run(ctx=>ctx.db.get(id)))?.createdAt).toBe(1);
 expect(await t.run(ctx=>ctx.db.query("commerce_product_discovery").withIndex("by_product",q=>q.eq("productId",id)).take(67))).toEqual(before);
});
test("reconciliation removes duplicate index rows and preserves stable row identities",async()=>{
 const {t,product}=await fixture();const id=await t.run(ctx=>insertWithMediaReferences(ctx,"commerce_products",product));
 const before=await t.run(ctx=>ctx.db.query("commerce_product_discovery").withIndex("by_product",q=>q.eq("productId",id)).take(67));
 await t.run(async ctx=>{
  await ctx.db.insert("commerce_product_discovery",{productId:id,kind:"recent",key:"",createdAt:1});
  await syncProductDiscovery(ctx,id,(await ctx.db.get(id))!);
 });
 expect(await t.run(ctx=>ctx.db.query("commerce_product_discovery").withIndex("by_product",q=>q.eq("productId",id)).take(67))).toEqual(before);
});


test("indexed category pages exclude unrelated products without scanning their source documents",async()=>{
 const {t,ids,product}=await fixture();
 const selected=await t.run(async ctx=>{
  for(let i=0;i<150;i++)await insertWithMediaReferences(ctx,"commerce_products",{...product,slug:`unrelated-${i}`,categoryIds:[],createdAt:i+10});
  const selected=[];
  for(let i=0;i<3;i++)selected.push(await insertWithMediaReferences(ctx,"commerce_products",{...product,slug:`selected-${i}`,createdAt:i+1}));
  return selected;
 });
 const ledger=new RequestReadLedger();
 const rows=await t.run(ctx=>readProductDiscoveryCandidates(ctx,"category",ids.category,ledger));
 expect(rows.map(row=>row.productId)).toEqual([selected[2],selected[1],selected[0]]);
 expect(ledger.queries).toBe(2);expect(ledger.documents).toBe(3);
});

test("incomplete legacy backfill refuses collection discovery instead of showing a partial catalog",async()=>{
 const {t,product}=await fixture();
 await t.run(async ctx=>{
  await insertWithMediaReferences(ctx,"commerce_products",{...product,isFeatured:true});
  await ctx.db.insert("commerce_products",{...product,slug:"not-indexed"});
 });
 await expect(t.run(ctx=>readProductDiscoveryCandidates(ctx,"featured",""))).rejects.toThrow("being indexed");
});


import {write as writePromotion} from "../../contentPromotion/shared";
import {create as createProduct,update as updateProduct} from "../products";

test("promotion insert and update refresh product selection coordinates",async()=>{
 const {t,product}=await fixture();
 const raw=await t.run(ctx=>writePromotion(ctx,"product",null,{...product,isFeatured:true}));
 await t.run(async ctx=>{
  const id=ctx.db.normalizeId("commerce_products",raw)!;
  expect(await ctx.db.query("commerce_product_discovery").withIndex("by_product",q=>q.eq("productId",id)).take(67)).toHaveLength(3);
  await writePromotion(ctx,"product",raw,{categoryIds:[],isFeatured:false});
  expect(await ctx.db.query("commerce_product_discovery").withIndex("by_product",q=>q.eq("productId",id)).take(67)).toHaveLength(1);
 });
});

test("registered product authoring persists featured, preserves omission and supports explicit clearing",async()=>{
 const {t,ids}=await fixture();
 await t.run(async ctx=>{
  const roleId=await ctx.db.insert("roles",{name:"Administrator",slug:"administrator",description:"Test role",level:100,type:"internal",isDefault:false,isProtected:true,capabilities:["manage_options"],pageAccess:[],status:"active",createdAt:1,updatedAt:1});
  await ctx.db.patch("users",ids.user,{roleId});
  await ctx.db.insert("settings",{section:"plugins",values:{commerceEnabled:true},updatedAt:1,updatedBy:ids.user});
 });
 const admin=t.withIdentity({subject:ids.user,tokenIdentifier:`https://convexpress-admin.local|${ids.user}`});
 const id=await admin.run(ctx=>(createProduct as any)._handler(ctx,{title:"Featured notebook",basePrice:{amount:2500,currencyCode:"USD"},categoryIds:[ids.category],status:"publish",isFeatured:true}));
 expect((await t.run(ctx=>ctx.db.get(id)))?.isFeatured).toBe(true);
 await admin.run(ctx=>(updateProduct as any)._handler(ctx,{productId:id,title:"Still featured"}));
 expect((await t.run(ctx=>ctx.db.get(id)))?.isFeatured).toBe(true);
 await admin.run(ctx=>(updateProduct as any)._handler(ctx,{productId:id,isFeatured:false}));
 expect((await t.run(ctx=>ctx.db.get(id)))?.isFeatured).toBe(false);
 expect((await t.run(ctx=>readProductDiscoveryCandidates(ctx,"featured","")))).toEqual([]);
 await expect(t.run(ctx=>(updateProduct as any)._handler(ctx,{productId:id,isFeatured:true}))).rejects.toThrow();
});
