import {syncProductSaleIndex} from "../../commerce/productSaleIndex";
import {insertWithMediaReferences,patchWithMediaReferences} from "../../media/attachmentGuard";
import {insertCountedReview,beginRatingRepair,advanceRatingRepair} from "../../commerceReviews/ratingIndex";
import { test, expect } from "bun:test";
import { convexTest } from "convex-test";
import schema from "../../schema";
import { readProductShowcase } from "../productShowcase";
import { syncProductDiscovery } from "../../commerce/productDiscovery";
import { RequestReadLedger } from "../../helpers/requestReadLedger";
import { SourceByteLedger } from "../sourceBudget";
const modules = {
  "./convex/_generated/api.js": () => import("../../_generated/api.js"),
  "./convex/_generated/server.js": () => import("../../_generated/server.js"),
  "./convex/membership/policyReads.ts": () => import("../../membership/policyReads"),
};
async function fixture() {
  const t = convexTest({ schema, modules });
  const ids = await t.run(async ctx => {
    const user = await ctx.db.insert("users", { authSource:"local",email:"collection@example.invalid",emailVerified:true,status:"active",createdAt:1,updatedAt:1 });
    const setting = await ctx.db.insert("settings", { section:"plugins",values:{commerceEnabled:true,membershipEnabled:false,commerceReviewsEnabled:true},updatedAt:1,updatedBy:user });
    const category = await ctx.db.insert("commerce_product_categories", { name:"Studio",slug:"studio",productCount:0,isVisible:true,createdAt:1,updatedAt:1 });
    const tag = await ctx.db.insert("commerce_product_tags", { name:"Gift",slug:"gift",isVisible:true,createdAt:1,updatedAt:1 });
    const products = [];
    for (let i=0;i<5;i++) {
      const id=await ctx.db.insert("commerce_products", { title:`Product ${i}`,slug:`product-${i}`,status:i===4?"draft":"publish",productType:"simple",authorId:user,
        categoryIds:i===0?[category]:[],tagIds:i===1?[tag]:[],isFeatured:i===2,collectionIndexVersion:1,galleryMediaIds:[],
        basePrice:{amount:1000,currencyCode:"USD"},...(i===3?{salePrice:{amount:0,currencyCode:"USD"},salePriceFrom:100,salePriceTo:200}:{}),
        trackInventory:true,stockQuantity:10,allowBackorders:false,isVirtual:true,isDownloadable:false,createdAt:i+1,updatedAt:1,publishedAt:1,rawSourceMeta:"private-marker" });
      await syncProductDiscovery(ctx,id,await ctx.db.get(id)); await syncProductSaleIndex(ctx,id); products.push(id);
    }
    return {user,setting,category,tag,products};
  });
  return {t,ids};
}
test("showcase preserves saved slug order, skips missing/draft/duplicates and never broadens an empty selection",async()=>{
 const {t,ids}=await fixture();
 const read=(args:unknown)=>t.run(ctx=>readProductShowcase(ctx,args,undefined,undefined,150));
 expect((await read({source:"slugs",productSlugs:["product-2","missing","product-4","product-2","product-0"]})).items.map(c=>c.id)).toEqual([ids.products[2],ids.products[0]]);
 expect((await read({source:"slugs",productSlugs:[]})).items).toEqual([]);
 expect((await read({source:"newest",count:2})).items.map(c=>c.slug)).toEqual(["product-3","product-2"]);
 expect((await read({source:"category",categorySlug:"studio"})).items.map(c=>c.slug)).toEqual(["product-0"]);
 expect((await read({source:"sale"})).items.map(c=>c.slug)).toEqual(["product-3"]);
 const result=await read({source:"slugs",productSlugs:["product-0"],showAddToCart:false});
 expect(result.items[0]).toMatchObject({stock:"instock",cart:null,rating:null,pricing:{price:{amount:1000}}});
 expect(JSON.stringify(result)).not.toContain("private-marker");
});
test("showcase rechecks membership, publication, category visibility and sale times",async()=>{
 const {t,ids}=await fixture();
 const read=(args:unknown,now=150)=>t.run(ctx=>readProductShowcase(ctx,args,undefined,undefined,now));
 await t.run(async ctx=>{
  await ctx.db.patch(ids.setting,{values:{commerceEnabled:true,membershipEnabled:true}});
  await ctx.db.insert("membership_restriction_rules",{resourceType:"route",resourceIdOrKey:"/products/product-0",ruleMode:"allow_only",planIds:[],teaserMode:"hide",loginRequired:true,createdAt:1,updatedAt:1});
 });
 expect((await read({source:"slugs",productSlugs:["product-0","product-1"]})).items.map(c=>c.slug)).toEqual(["product-1"]);
 await t.run(ctx=>ctx.db.patch(ids.products[1]!,{status:"draft"}));
 expect((await read({source:"slugs",productSlugs:["product-1"]})).items).toEqual([]);
 await t.run(ctx=>ctx.db.patch(ids.category,{isVisible:false}));
 expect((await read({source:"category",categorySlug:"studio"})).items).toEqual([]);
 expect((await read({source:"sale"},99)).items).toEqual([]);
 expect((await read({source:"sale"},150)).items[0]?.pricing?.salePrice?.amount).toBe(0);
 expect((await read({source:"sale"},201)).items).toEqual([]);
});
test("stock labels respect reservations and backorders even when purchase controls are hidden",async()=>{
 const {t,ids}=await fixture();const product=ids.products[0]!;
 await t.run(async ctx=>{
  await ctx.db.patch(product,{stockQuantity:1});
  const cartId=await ctx.db.insert("commerce_carts",{sessionToken:"showcase-stock",status:"active",currencyCode:"USD",subtotalAmount:0,discountAmount:0,shippingAmount:0,taxAmount:0,totalAmount:0,itemCount:0,lastActiveAt:1,createdAt:1,updatedAt:1});
  const checkoutSessionId=await ctx.db.insert("commerce_checkout_sessions",{cartId,sessionToken:"showcase-stock",status:"ready_for_review",currencyCode:"USD",subtotalAmount:0,discountAmount:0,shippingAmount:0,taxAmount:0,totalAmount:0,createdAt:1,updatedAt:1});
  await ctx.db.insert("commerce_stock_reservations",{checkoutSessionId,productId:product,quantity:1,status:"active",expiresAt:200,createdAt:1,updatedAt:1});
 });
 const budget=new RequestReadLedger();
 const read=(showAddToCart=true,now=150)=>t.run(ctx=>readProductShowcase(ctx,{source:"slugs",productSlugs:["product-0"],showAddToCart},budget,undefined,now));
 expect((await read()).items[0]).toMatchObject({stock:"outofstock",cart:null});
 expect(budget.authorizationRecheckAt).toBe(200);
 expect((await read(false)).items[0]).toMatchObject({stock:"outofstock",cart:null});
 expect((await read(true,200)).items[0]).toMatchObject({stock:"instock",cart:{kind:"add",productId:product}});
 await t.run(ctx=>ctx.db.patch(product,{allowBackorders:true}));
 expect((await read()).items[0]).toMatchObject({stock:"onbackorder",cart:{kind:"add"}});
});
test("variable and external products do not pretend to have simple-product availability",async()=>{
 const {t,ids}=await fixture();
 await t.run(async ctx=>{
  await patchWithMediaReferences(ctx,"commerce_products",ids.products[0]!,{productType:"variable"});
  await insertWithMediaReferences(ctx,"commerce_product_variants",{productId:ids.products[0]!,title:"Option",optionSummary:"Option",price:{amount:2000,currencyCode:"USD"},status:"publish",isDefault:true,createdAt:1,updatedAt:1});
  await ctx.db.patch(ids.products[1]!,{productType:"external"});
 });
 const result=await t.run(ctx=>readProductShowcase(ctx,{source:"slugs",productSlugs:["product-0","product-1"]},undefined,undefined,150));
 expect(result.items[0]).toMatchObject({stock:"options",cart:{kind:"chooseOptions"}});
 expect(result.items[1]).toMatchObject({stock:"external",cart:null});
});
test("invalid selections refuse before reads and full source documents are budgeted",async()=>{
 const {t,ids}=await fixture();const budget=new RequestReadLedger();
 for(const args of [{source:"category"},{count:1.5},{count:25},{productSlugs:Array(25).fill("product-0")},{source:"slugs",viewerId:"forged"}])await expect(t.run(ctx=>readProductShowcase(ctx,args,budget))).rejects.toThrow();
 expect(budget.queries).toBe(0);
 await t.run(ctx=>ctx.db.patch(ids.products[0]!,{rawSourceMeta:"x".repeat(257*1024)}));
 await expect(t.run(ctx=>readProductShowcase(ctx,{source:"slugs",productSlugs:["product-0"]}))).rejects.toThrow("source document budget");
});
