import { test, expect } from "bun:test";
import { convexTest } from "convex-test";
import schema from "../../schema";
import { api } from "../../_generated/api";
const modules={"./convex/_generated/api.js":()=>import("../../_generated/api.js"),"./convex/_generated/server.js":()=>import("../../_generated/server.js"),"./convex/commerce/products.ts":()=>import("../products")};
async function fixture(){
 const t=convexTest({schema,modules});
 const ids=await t.run(async ctx=>{
  const role=await ctx.db.insert("roles",{name:"Product manager",slug:"product-manager",description:"Test",level:10,type:"internal",isDefault:false,isProtected:false,capabilities:["manage_options"],pageAccess:[],status:"active",createdAt:1,updatedAt:1});
  const operator=await ctx.db.insert("users",{authSource:"local",email:"variants@example.invalid",emailVerified:true,status:"active",roleId:role,createdAt:1,updatedAt:1});
  const reader=await ctx.db.insert("users",{authSource:"local",email:"reader@example.invalid",emailVerified:true,status:"active",createdAt:1,updatedAt:1});
  await ctx.db.insert("settings",{section:"plugins",values:{commerceEnabled:true,membershipEnabled:false},updatedBy:operator,updatedAt:1});
  const product=await ctx.db.insert("commerce_products",{title:"Unreleased",slug:"unreleased",status:"draft",productType:"variable",authorId:operator,basePrice:{amount:100,currencyCode:"USD"},categoryIds:[],galleryMediaIds:[],trackInventory:false,allowBackorders:false,isVirtual:false,isDownloadable:false,optionTypes:[{id:"secret",name:"Private design",values:[{id:"prototype",label:"Prototype"}]}],createdAt:1,updatedAt:1});
  const variant=await ctx.db.insert("commerce_product_variants",{productId:product,title:"Private variant",optionSummary:"Prototype",status:"private",price:{amount:1,currencyCode:"USD"},isDefault:true,createdAt:1,updatedAt:1});
  return {role,operator,reader,product,variant};
 });
 const identity=(id:string)=>({subject:id,tokenIdentifier:`https://convexpress-admin.local|${id}`});
 return {t,ids,operator:t.withIdentity(identity(ids.operator)),reader:t.withIdentity(identity(ids.reader))};
}
test("registered authoring queries reject anonymous and unprivileged users before disclosing private options or variants",async()=>{
 const {t,ids,reader}=await fixture();
 for(const caller of [t,reader])for(const fn of [api.commerce.products.listVariants,api.commerce.products.listOptionTypes])await expect(caller.query(fn,{productId:ids.product})).rejects.toThrow();
});
test("product managers retain private authoring data and revocation removes access on the next read",async()=>{
 const {t,ids,operator}=await fixture();
 expect((await operator.query(api.commerce.products.listVariants,{productId:ids.product})).map(row=>row._id)).toEqual([ids.variant]);
 expect(await operator.query(api.commerce.products.listOptionTypes,{productId:ids.product})).toMatchObject([{name:"Private design"}]);
 await t.run(ctx=>ctx.db.patch(ids.role,{capabilities:[]}));
 for(const fn of [api.commerce.products.listVariants,api.commerce.products.listOptionTypes])await expect(operator.query(fn,{productId:ids.product})).rejects.toThrow();
});
