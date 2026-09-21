import { test, expect } from "bun:test";
import { convexTest } from "convex-test";
import schema from "../../schema";
import { resolveBundleSelectionSnapshot, applyBundlePricing, getResolvedComponentUnitPrice } from "../runtime";
const modules={"./convex/_generated/api.js":()=>import("../../_generated/api.js"),"./convex/_generated/server.js":()=>import("../../_generated/server.js")};
async function fixture(){
 const t=convexTest({schema,modules});
 const ids=await t.run(async ctx=>{
  const user=await ctx.db.insert("users",{authSource:"local",email:"bundle-integrity@example.invalid",emailVerified:true,status:"active",createdAt:1,updatedAt:1});
  const product=await ctx.db.insert("commerce_products",{title:"Notebook",slug:"notebook",status:"publish",productType:"simple",authorId:user,basePrice:{amount:2000,currencyCode:"USD"},salePrice:{amount:1000,currencyCode:"USD"},salePriceFrom:100,salePriceTo:200,categoryIds:[],galleryMediaIds:[],trackInventory:false,allowBackorders:false,isVirtual:false,isDownloadable:false,createdAt:1,updatedAt:1});
  const bundle=await ctx.db.insert("commerce_bundles",{name:"Study kit",slug:"study-kit",images:[],bundleType:"fixed",pricingType:"component_sum",status:"active",purchaseCount:0,createdAt:1,updatedAt:1});
  const component=await ctx.db.insert("commerce_bundle_components",{bundleId:bundle,productId:product,quantity:2,isRequired:true,sortOrder:0,createdAt:1,updatedAt:1});
  const other=await ctx.db.insert("commerce_bundle_components",{bundleId:bundle,productId:product,quantity:1,isRequired:false,sortOrder:1,createdAt:1,updatedAt:1});
  return {product,bundle,component,other};
 });
 const read=(selections?:{componentId:typeof ids.component;quantity:number}[],now=201)=>t.run(async ctx=>{
  const bundle=await ctx.db.get(ids.bundle),component=await ctx.db.get(ids.component);if(!bundle||!component)throw Error('Fixture missing');
  return resolveBundleSelectionSnapshot(ctx,{bundle,components:[component],selections,now});
 });
 return {t,ids,read};
}
test("bundle pricing uses the shared sale window and inclusive end boundary",async()=>{
 const {read}=await fixture();
 expect((await read(undefined,99)).regularPriceAmount).toBe(4000);
 expect((await read(undefined,100)).regularPriceAmount).toBe(2000);
 expect((await read(undefined,200)).regularPriceAmount).toBe(2000);
 expect((await read(undefined,201)).regularPriceAmount).toBe(4000);
});
test("selection identities must be unique and belong to the exact component set",async()=>{
 const {ids,read}=await fixture();
 await expect(read([{componentId:ids.other,quantity:1}])).rejects.toThrow();
 await expect(read([{componentId:ids.component,quantity:2},{componentId:ids.component,quantity:3}])).rejects.toThrow();
});
test("fixed bundle quantities cannot be edited and all quantities are safe positive integers",async()=>{
 const {t,ids,read}=await fixture();
 await expect(read([{componentId:ids.component,quantity:1}])).rejects.toThrow();
 expect((await read([{componentId:ids.component,quantity:2}])).totalItems).toBe(2);
 await t.run(ctx=>ctx.db.patch(ids.bundle,{bundleType:"mix_and_match"}));
 for(const quantity of [0,-1,.5,Number.MAX_SAFE_INTEGER+1])await expect(read([{componentId:ids.component,quantity}])).rejects.toThrow();
 expect((await read([{componentId:ids.component,quantity:3}])).totalItems).toBe(3);
});
test("negative, fractional, overflowing and over-discounted money is rejected",()=>{
 for(const amount of [-1,.5,Infinity,Number.MAX_SAFE_INTEGER+1]){
  expect(()=>getResolvedComponentUnitPrice({priceOverride:amount},2000)).toThrow();
  expect(()=>applyBundlePricing({pricingType:"fixed",fixedPrice:amount},2000)).toThrow();
 }
 for(const percent of [-1,101,NaN]){
  expect(()=>getResolvedComponentUnitPrice({discountPercent:percent},2000)).toThrow();
  expect(()=>applyBundlePricing({pricingType:"percent_off",discountPercent:percent},2000)).toThrow();
 }
 expect(applyBundlePricing({pricingType:"amount_off",discountAmount:3000},2000)).toBe(0);
});
test("line arithmetic refuses unsafe totals and selected variant currencies must match the product",async()=>{
 const {t,ids,read}=await fixture();
 await t.run(ctx=>ctx.db.patch(ids.product,{basePrice:{amount:Number.MAX_SAFE_INTEGER,currencyCode:"USD"}}));await expect(read()).rejects.toThrow();
 await t.run(async ctx=>{
  await ctx.db.patch(ids.product,{basePrice:{amount:2000,currencyCode:"USD"},productType:"variable"});
  const variant=await ctx.db.insert("commerce_product_variants",{productId:ids.product,title:"Other currency",optionSummary:"Other",price:{amount:1000,currencyCode:"EUR"},isDefault:true,status:"publish",createdAt:1,updatedAt:1});
  await ctx.db.patch(ids.component,{variantId:variant});
 });await expect(read()).rejects.toThrow();
});
