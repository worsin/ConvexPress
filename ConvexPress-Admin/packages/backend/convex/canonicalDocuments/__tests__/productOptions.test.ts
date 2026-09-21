import { test, expect } from "bun:test";
import { convexTest } from "convex-test";
import schema from "../../schema";
import { readProductOptions } from "../productOptions";
import { RequestReadLedger } from "../../helpers/requestReadLedger";
const modules={"./convex/_generated/api.js":()=>import("../../_generated/api.js"),"./convex/_generated/server.js":()=>import("../../_generated/server.js"),"./convex/membership/policyReads.ts":()=>import("../../membership/policyReads")};
async function fixture(){
 const t=convexTest({schema,modules});const ids=await t.run(async ctx=>{
  const user=await ctx.db.insert("users",{authSource:"local",email:"options@example.invalid",emailVerified:true,status:"active",createdAt:1,updatedAt:1});
  const settings=await ctx.db.insert("settings",{section:"plugins",values:{commerceEnabled:true,membershipEnabled:false},updatedAt:1,updatedBy:user});
  const optionTypes=[{id:"color",name:"Color",privateNote:"private-option-marker",values:[{id:"ink",label:"Ink"},{id:"chalk",label:"Chalk"},{id:"secret",label:"Unreleased"}]},{id:"size",name:"Size",values:[{id:"small",label:"Small"},{id:"large",label:"Large"}]}];
  const product=await ctx.db.insert("commerce_products",{title:"Studio shirt",slug:"studio-shirt",status:"publish",productType:"variable",authorId:user,categoryIds:[],galleryMediaIds:[],basePrice:{amount:4500,currencyCode:"USD"},trackInventory:false,allowBackorders:false,isVirtual:false,isDownloadable:false,createdAt:1,updatedAt:1,publishedAt:1,rawSourceMeta:"private-product-marker",optionTypes});
  const variant=async(color:string,size:string,status?:"publish"|"draft"|"private")=>ctx.db.insert("commerce_product_variants",{productId:product,title:color+size,optionSummary:color+size,price:{amount:4500,currencyCode:"USD"},isDefault:color==="ink",...(status?{status}:{}),sku:"private-sku-marker",stockQuantity:993,selections:[{optionTypeId:"color",optionTypeName:"Color",optionValueId:color,optionValueLabel:color,sortOrder:0},{optionTypeId:"size",optionTypeName:"Size",optionValueId:size,optionValueLabel:size,sortOrder:1}],createdAt:1,updatedAt:1});
  const ink=await variant("ink","small","publish");const chalk=await variant("chalk","large");await variant("secret","large","draft");await variant("secret","small","private");return {user,settings,product,ink,chalk,optionTypes};
 });return {t,ids};
}
test("product options expose only complete public and legacy-public choices in authored order",async()=>{
 const {t,ids}=await fixture();const data=await t.run(ctx=>readProductOptions(ctx,{product:ids.product},undefined,undefined,100));
 expect(data.groups).toEqual([{id:"color",name:"Color",values:[{id:"ink",label:"Ink"},{id:"chalk",label:"Chalk"}]},{id:"size",name:"Size",values:[{id:"small",label:"Small"},{id:"large",label:"Large"}]}]);expect(data.product?.id).toBe(ids.product);expect(data.product?.pricing).toBeNull();
 for(const secret of ["Unreleased","private-","sku","stockQuantity","993","authorId"])expect(JSON.stringify(data)).not.toContain(secret);
 for(const attribute of ["Color","color"," COLOR "])expect((await t.run(ctx=>readProductOptions(ctx,{product:ids.product,attribute}))).groups).toEqual([data.groups[0]!]);
 expect((await t.run(ctx=>readProductOptions(ctx,{product:ids.product,attribute:"missing"}))).groups).toEqual([]);
});
test("unselected, invalid, hidden and future products never broaden selection",async()=>{
 const {t,ids}=await fixture();for(const product of [undefined,"invalid"])expect(await t.run(ctx=>readProductOptions(ctx,{product}))).toEqual({product:null,groups:[]});
 for(const patch of [{status:"draft" as const},{status:"private" as const},{status:"publish" as const,publishedAt:200}]){await t.run(ctx=>ctx.db.patch(ids.product,patch));expect(await t.run(ctx=>readProductOptions(ctx,{product:ids.product},undefined,undefined,100))).toEqual({product:null,groups:[]});}
 await t.run(ctx=>ctx.db.patch(ids.settings,{values:{commerceEnabled:false}}));await expect(t.run(ctx=>readProductOptions(ctx,{product:ids.product}))).rejects.toThrow();
});
test("malformed combinations and hidden-only variants do not disclose option choices",async()=>{
 const {t,ids}=await fixture();await t.run(async ctx=>{await ctx.db.patch(ids.ink,{selections:[]});await ctx.db.patch(ids.chalk,{status:"private"});});expect((await t.run(ctx=>readProductOptions(ctx,{product:ids.product}))).groups).toEqual([]);
 await t.run(ctx=>ctx.db.patch(ids.ink,{status:"draft"}));expect(await t.run(ctx=>readProductOptions(ctx,{product:ids.product}))).toEqual({product:null,groups:[]});
});
test("reader rejects oversized catalogs, source records and request injection without partial options",async()=>{
 const {t,ids}=await fixture();const budget=new RequestReadLedger();await expect(t.run(ctx=>readProductOptions(ctx,{product:ids.product,viewerId:"forged"},budget))).rejects.toThrow();expect(budget.queries).toBe(0);
 await t.run(async ctx=>{const source=await ctx.db.get(ids.ink);if(!source)throw Error("fixture");const {_id,_creationTime,...data}=source;for(let i=0;i<127;i++)await ctx.db.insert("commerce_product_variants",{...data,isDefault:false});});await expect(t.run(ctx=>readProductOptions(ctx,{product:ids.product}))).rejects.toThrow("bounded variant budget");
 await t.run(ctx=>ctx.db.patch(ids.product,{description:"x".repeat(270000)}));await expect(t.run(ctx=>readProductOptions(ctx,{product:ids.product}))).rejects.toThrow("source document budget");
});
test("ambiguous attribute names and duplicate identities fail closed",async()=>{
 const {t,ids}=await fixture();await t.run(ctx=>ctx.db.patch(ids.product,{optionTypes:ids.optionTypes.map(g=>({...g,name:"Choice"}))}));await expect(t.run(ctx=>readProductOptions(ctx,{product:ids.product,attribute:"Choice"}))).rejects.toThrow("ambiguous");
 await t.run(ctx=>ctx.db.patch(ids.product,{optionTypes:[{id:"a",name:"A",values:[]},{id:"a",name:"A",values:[]}]}));await expect(t.run(ctx=>readProductOptions(ctx,{product:ids.product}))).rejects.toThrow("duplicate");
});
test("current membership and route policies remove choices after revocation",async()=>{
 const {t,ids}=await fixture();const grant=await t.run(async ctx=>{
  await ctx.db.patch(ids.settings,{values:{commerceEnabled:true,membershipEnabled:true}});
  const plan=await ctx.db.insert("membership_plans",{title:"Members",slug:"members",status:"active",grantMode:"manual",priority:1,createdAt:1,updatedAt:1});
  await ctx.db.insert("membership_restriction_rules",{resourceType:"product",resourceIdOrKey:ids.product,ruleMode:"allow_only",planIds:[plan],teaserMode:"excerpt",loginRequired:true,createdAt:1,updatedAt:1});
  return ctx.db.insert("membership_grants",{userId:ids.user,planId:plan,sourceType:"manual",status:"active",startsAt:1,createdAt:1,updatedAt:1});
 });
 const member=t.withIdentity({subject:ids.user,tokenIdentifier:`https://convexpress-admin.local|${ids.user}`});
 expect((await member.run(ctx=>readProductOptions(ctx,{product:ids.product}))).groups).toHaveLength(2);
 expect(await t.run(ctx=>readProductOptions(ctx,{product:ids.product}))).toEqual({product:null,groups:[]});
 await t.run(ctx=>ctx.db.patch(grant,{status:"revoked"}));expect(await member.run(ctx=>readProductOptions(ctx,{product:ids.product}))).toEqual({product:null,groups:[]});
 await t.run(async ctx=>{await ctx.db.patch(grant,{status:"active"});const routePlan=await ctx.db.insert("membership_plans",{title:"Route members",slug:"route-members",status:"active",grantMode:"manual",priority:2,createdAt:1,updatedAt:1});await ctx.db.insert("membership_restriction_rules",{resourceType:"route",resourceIdOrKey:"/products/studio-shirt",ruleMode:"allow_only",planIds:[routePlan],teaserMode:"hide",loginRequired:false,createdAt:1,updatedAt:1});});
 expect(await member.run(ctx=>readProductOptions(ctx,{product:ids.product}))).toEqual({product:null,groups:[]});
});

test("inactive values are excluded and configured option order is retained",async()=>{
 const {t,ids}=await fixture();await t.run(ctx=>ctx.db.patch(ids.product,{optionTypes:ids.optionTypes.map((group,index)=>({...group,sortOrder:1-index,values:group.values.map((value,i)=>({...value,active:value.id!=="chalk",sortOrder:10-i}))}))}));
 const data=await t.run(ctx=>readProductOptions(ctx,{product:ids.product}));expect(data.groups.map(group=>group.id)).toEqual(["size","color"]);expect(data.groups[0]!.values.map(value=>value.id)).toEqual(["small"]);expect(data.groups[1]!.values.map(value=>value.id)).toEqual(["ink"]);
});
