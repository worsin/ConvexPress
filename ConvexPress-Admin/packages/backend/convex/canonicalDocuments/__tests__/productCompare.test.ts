import { test, expect } from "bun:test";
import { convexTest } from "convex-test";
import schema from "../../schema";
import { readProductCompare } from "../productCompare";
import { displayContext } from "../displayContext";
import { RequestReadLedger } from "../../helpers/requestReadLedger";
import type { ProductCompareArgs } from "../foundation/productCompareContracts";
const modules={"./convex/_generated/api.js":()=>import("../../_generated/api.js"),"./convex/_generated/server.js":()=>import("../../_generated/server.js"),"./convex/membership/policyReads.ts":()=>import("../../membership/policyReads")};
async function fixture() {
  const t=convexTest({schema,modules});
  const ids=await t.run(async ctx=>{
    const user=await ctx.db.insert("users",{authSource:"local",email:"compare@example.invalid",emailVerified:true,status:"active",createdAt:1,updatedAt:1});
    const setting=await ctx.db.insert("settings",{section:"plugins",values:{commerceEnabled:true,membershipEnabled:false},updatedAt:1,updatedBy:user});
    await ctx.db.insert("convexpress_siteIdentity",{identityKey:"site-identity",websiteKey:"compare",instanceKey:"staging",environmentKind:"staging",deploymentOrigin:"https://compare.convex.cloud",managementOrigin:"https://controller.convex.cloud",siteOrigin:"https://compare.convex.site",siteContractVersion:"1",schemaVersion:"2026.9.0",engineVersion:"1",managementCapabilities:[],initializedAt:1,updatedAt:1});
    const common={status:"publish" as const,authorId:user,categoryIds:[],galleryMediaIds:[],basePrice:{amount:9999,currencyCode:"USD"},trackInventory:false,allowBackorders:false,isVirtual:false,isDownloadable:false,createdAt:1,updatedAt:1,rawSourceMeta:"PRIVATE_COMPARISON_MARKER",productAttributes:{privateCost:1234}};
    const simple=await ctx.db.insert("commerce_products",{...common,title:"Field notebook",slug:"notebook",productType:"simple",sku:"NOTE-01",basePrice:{amount:2000,currencyCode:"USD"},salePrice:{amount:1500,currencyCode:"USD"},salePriceTo:200});
    const options=[{id:"color",name:"Color",values:[{id:"ink",label:"Ink"},{id:"clay",label:"Clay"},{id:"secret",label:"Secret prototype"}]}];
    const variable=await ctx.db.insert("commerce_products",{...common,title:"Studio bag",slug:"bag",productType:"variable",optionTypes:options});
    const hidden=await ctx.db.insert("commerce_products",{...common,title:"Secret product",slug:"hidden",productType:"simple",status:"draft"});
    const variants=[];
    for(const [color,amount,status,isDefault] of [["ink",3000,"publish",true],["clay",2000,undefined,false],["secret",1,"private",false]] as const)variants.push(await ctx.db.insert("commerce_product_variants",{productId:variable,title:color,optionSummary:color,price:{amount,currencyCode:"USD"},isDefault,...(status?{status}:{}),selections:[{optionTypeId:"color",optionTypeName:"Color",optionValueId:color,optionValueLabel:color,sortOrder:0}],createdAt:1,updatedAt:1,description:"PRIVATE_COMPARISON_MARKER"}));
    return {user,setting,simple,variable,hidden,variants,options};
  });
  const read=(args:Partial<ProductCompareArgs>={},budget?:RequestReadLedger,now=100)=>t.run(ctx=>readProductCompare(ctx,args,budget,undefined,now));
  return {t,ids,read};
}
test("comparison preserves selected order and computes the actual public variant price range",async()=>{
  const {ids,read}=await fixture(),budget=new RequestReadLedger();
  const result=await read({products:[ids.variable,ids.hidden,ids.simple,ids.variable]},budget);
  expect(result.items.map(item=>item.id)).toEqual([ids.variable,ids.simple]);
  expect(result.items.map(item=>item.price)).toEqual([{min:2000,max:3000,currencyCode:"USD"},{min:1500,max:1500,currencyCode:"USD"}]);
  expect(result.rows.find(row=>row.key==="option:color")?.cells).toEqual([["Ink","Clay"],null]);
  expect(result.rows.find(row=>row.key==="sku")?.cells).toEqual([null,["NOTE-01"]]);
  expect(budget.authorizationRecheckAt).toBe(201);
  for(const secret of ["Secret prototype","Secret product","PRIVATE_COMPARISON_MARKER","privateCost","authorId","stockQuantity"])expect(JSON.stringify(result)).not.toContain(secret);
});
test("explicit attributes are ordered and arbitrary metadata names never become property reads",async()=>{
  const {ids,read}=await fixture();
  const result=await read({products:[ids.simple,ids.variable],attributes:[" Color ","SKU","rawSourceMeta","color"]});
  expect(result.rows.map(row=>row.key)).toEqual(["option:color","sku","option:rawsourcemeta"]);
  expect(result.rows[2]!.cells).toEqual([null,null]);
  expect(await read({products:[]})).toEqual({items:[],rows:[]});
  expect(await read({products:["invalid",ids.hidden]})).toEqual({items:[],rows:[]});
});
test("publication, plugin and product/route membership are rechecked before disclosure",async()=>{
  const {t,ids,read}=await fixture();
  await t.run(ctx=>ctx.db.patch(ids.setting,{values:{commerceEnabled:true,membershipEnabled:true}}));
  for(const resourceType of ["product","route"] as const){
    const rule=await t.run(ctx=>ctx.db.insert("membership_restriction_rules",{resourceType,resourceIdOrKey:resourceType==="product"?ids.simple:"/products/notebook",ruleMode:"allow_only",planIds:[],teaserMode:"hide",loginRequired:true,createdAt:1,updatedAt:1}));
    expect((await read({products:[ids.simple,ids.variable]})).items.map(item=>item.id)).toEqual([ids.variable]);
    await t.run(ctx=>ctx.db.delete(rule));
  }
  await t.run(ctx=>ctx.db.patch(ids.simple,{publishedAt:200}));expect((await read({products:[ids.simple]})).items).toEqual([]);
  await t.run(ctx=>ctx.db.patch(ids.setting,{values:{commerceEnabled:false}}));await expect(read({products:[ids.variable]})).rejects.toThrow();
});
test("hidden-only, inactive and malformed option combinations cannot supply values or prices",async()=>{
  const {t,ids,read}=await fixture();
  await t.run(ctx=>ctx.db.patch(ids.variants[0]!,{selections:[]}));
  expect((await read({products:[ids.variable]})).items[0]?.price).toEqual({min:2000,max:2000,currencyCode:"USD"});
  await t.run(ctx=>ctx.db.patch(ids.variable,{optionTypes:ids.options.map(group=>({...group,values:group.values.map(value=>({...value,active:value.id!=="clay"}))}))}));
  expect((await read({products:[ids.variable]})).items).toEqual([]);
});
test("oversized catalogs, complete private source bytes and mixed currencies fail without partial results",async()=>{
  const {t,ids,read}=await fixture();
  await t.run(ctx=>ctx.db.patch(ids.variants[1]!,{price:{amount:2000,currencyCode:"EUR"}}));await expect(read({products:[ids.variable]})).rejects.toThrow("mixed variant currencies");
  await t.run(async ctx=>{await ctx.db.patch(ids.variants[1]!,{price:{amount:2000,currencyCode:"USD"}});const row=await ctx.db.get(ids.variants[0]!);if(!row)throw Error();const {_id,_creationTime,...copy}=row;for(let i=0;i<127;i++)await ctx.db.insert("commerce_product_variants",{...copy,isDefault:false});});
  await expect(read({products:[ids.variable]})).rejects.toThrow("bounded variant budget");
  await t.run(ctx=>ctx.db.patch(ids.simple,{rawSourceMeta:"x".repeat(270000)}));await expect(read({products:[ids.simple]})).rejects.toThrow("source document budget");
});
test("invalid request injection performs no reads and six small selected products fit the normal budget",async()=>{
  const {t,ids,read}=await fixture(),budget=new RequestReadLedger();
  await expect(t.run(ctx=>readProductCompare(ctx,{products:[ids.simple],viewerId:"forged"},budget))).rejects.toThrow();expect(budget.queries).toBe(0);
  const selected=await t.run(async ctx=>{const row=await ctx.db.get(ids.simple);if(!row)throw Error();const {_id,_creationTime,...copy}=row;const result=[ids.simple];for(let i=0;i<5;i++)result.push(await ctx.db.insert("commerce_products",{...copy,slug:`copy-${i}`}));return result;});
  expect((await read({products:selected})).items).toHaveLength(6);
});
test("editor policy includes the implemented repeated product reference and respects plugin disablement",async()=>{
  const {t,ids}=await fixture();
  expect((await t.run(ctx=>displayContext(ctx,new RequestReadLedger()))).policy.disabledBlocks).not.toContain("commerce/product-compare");
  await t.run(ctx=>ctx.db.patch(ids.setting,{values:{commerceEnabled:false}}));
  expect((await t.run(ctx=>displayContext(ctx,new RequestReadLedger()))).policy.disabledBlocks).toContain("commerce/product-compare");
});
