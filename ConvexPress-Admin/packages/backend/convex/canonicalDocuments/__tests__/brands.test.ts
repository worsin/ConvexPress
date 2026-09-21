import { test, expect } from "bun:test";
import { convexTest } from "convex-test";
import { makeFunctionReference } from "convex/server";
import schema from "../../schema";
import { readBrands } from "../brands";
import { RequestReadLedger } from "../../helpers/requestReadLedger";
const modules={"./convex/_generated/api.js":()=>import("../../_generated/api.js"),"./convex/_generated/server.js":()=>import("../../_generated/server.js"),"./convex/commerce/brandCatalog.ts":()=>import("../../commerce/brandCatalog"),"./convex/membership/policyReads.ts":()=>import("../../membership/policyReads")};
const page=makeFunctionReference<"query">("commerce/brandCatalog:page");
async function fixture(){
  const t=convexTest({schema,modules});
  const ids=await t.run(async ctx=>{
    const user=await ctx.db.insert("users",{authSource:"local",email:"brand-reader@example.invalid",emailVerified:true,status:"active",createdAt:1,updatedAt:1});
    const plugins=await ctx.db.insert("settings",{section:"plugins",values:{commerceEnabled:true,membershipEnabled:false},updatedAt:1,updatedBy:user});
    const brand=await ctx.db.insert("commerce_product_brands",{name:"Aster",slug:"aster",description:"Considered objects",status:"publish",sortOrder:2,createdAt:1,updatedAt:1});
    const other=await ctx.db.insert("commerce_product_brands",{name:"Other",slug:"other",description:"Another maker",status:"publish",sortOrder:1,createdAt:1,updatedAt:1});
    const product=await ctx.db.insert("commerce_products",{title:"Field notebook",slug:"field-notebook",brandId:brand,status:"publish",productType:"simple",authorId:user,basePrice:{amount:2400,currencyCode:"USD"},categoryIds:[],galleryMediaIds:[],trackInventory:true,stockQuantity:48,allowBackorders:false,isVirtual:false,isDownloadable:false,createdAt:1,updatedAt:1,rawSourceMeta:"PRIVATE PROVIDER DATA"});
    return {user,plugins,brand,other,product};
  });return {t,ids};
}
test("brand list uses published indexed order, limit and exact safe public fields",async()=>{
  const {t,ids}=await fixture();
  await t.run(async ctx=>{for(let i=0;i<250;i++)await ctx.db.insert("commerce_product_brands",{name:"Private",slug:`private-${i}`,description:"private",status:"draft",sortOrder:-1,createdAt:1,updatedAt:1});});
  expect(await t.run(ctx=>readBrands(ctx,{limit:1}))).toEqual({items:[{id:ids.other,name:"Other",slug:"other",description:"Another maker",href:"/brands/other",logo:null}]});
  const list=await t.run(ctx=>readBrands(ctx,{}));expect(list.items.map(b=>b.id)).toEqual([ids.other,ids.brand]);
  await t.run(ctx=>ctx.db.patch(ids.other,{status:"archived"}));expect((await t.run(ctx=>readBrands(ctx,{}))).items.map(b=>b.id)).toEqual([ids.brand]);
});
test("brand logos require current active image media and full source budget accounting",async()=>{
  const {t,ids}=await fixture();const media=await t.run(async ctx=>{const id=await ctx.db.insert("media",{title:"Logo",slug:"logo",fileName:"logo.png",mimeType:"image/png",mediaType:"image",fileSize:40,url:"https://images.example.invalid/logo.png",status:"active",uploadedBy:ids.user,createdAt:1,updatedAt:1,altText:"Aster mark"});await ctx.db.patch(ids.brand,{logoMediaId:id});return id;});
  expect((await t.run(ctx=>readBrands(ctx,{}))).items.find(b=>b.id===ids.brand)?.logo).toEqual({src:"https://images.example.invalid/logo.png",alt:"Aster mark"});
  await t.run(ctx=>ctx.db.patch(media,{status:"trashed"}));expect((await t.run(ctx=>readBrands(ctx,{}))).items.find(b=>b.id===ids.brand)?.logo).toBeNull();
  await t.run(ctx=>ctx.db.patch(media,{status:"active",url:"javascript:alert(1)"}));await expect(t.run(ctx=>readBrands(ctx,{}))).rejects.toThrow();
  const budget=new RequestReadLedger({queries:0,documents:50,bytes:10000,documentBytes:10000});await expect(t.run(ctx=>readBrands(ctx,{},budget))).rejects.toThrow("safe read budget");
  await expect(t.run(ctx=>readBrands(ctx,{limit:49}))).rejects.toThrow();
});
test("plugin and brand/shop route restrictions withdraw both logos and public catalog",async()=>{
  const {t,ids}=await fixture();
  await t.run(ctx=>ctx.db.patch(ids.plugins,{values:{commerceEnabled:true,membershipEnabled:true}}));
  const rule=await t.run(ctx=>ctx.db.insert("membership_restriction_rules",{resourceType:"route",resourceIdOrKey:"/brands/aster",ruleMode:"allow_only",planIds:[],loginRequired:true,teaserMode:"hide",createdAt:1,updatedAt:1}));
  expect((await t.run(ctx=>readBrands(ctx,{}))).items.map(b=>b.id)).toEqual([ids.other]);expect((await t.query(page,{slug:"aster"})).brand).toBeNull();
  await t.run(ctx=>ctx.db.patch(rule,{resourceIdOrKey:"/shop"}));expect(await t.run(ctx=>readBrands(ctx,{}))).toEqual({items:[]});expect((await t.query(page,{slug:"other"})).brand).toBeNull();
  await t.run(ctx=>ctx.db.delete(rule));expect((await t.query(page,{slug:"aster"})).page).toHaveLength(1);
  await t.run(ctx=>ctx.db.patch(ids.plugins,{values:{commerceEnabled:false}}));expect((await t.query(page,{slug:"aster"})).brand).toBeNull();expect(await t.run(ctx=>readBrands(ctx,{}))).toEqual({items:[]});
});
test("indexed brand pages traverse beyond hidden prefixes and never include another brand or private DTO fields",async()=>{
  const {t,ids}=await fixture();
  const publicIds=await t.run(async ctx=>{
    const base=(await ctx.db.get(ids.product))!;const {_id,_creationTime,...data}=base;const result=[ids.product];
    for(let i=0;i<25;i++)result.push(await ctx.db.insert("commerce_products",{...data,title:`Object ${i}`,slug:`object-${i}`}));
    for(let i=0;i<25;i++)await ctx.db.insert("commerce_products",{...data,title:`Future ${i}`,slug:`future-${i}`,publishedAt:Date.now()+3600000});
    for(let i=0;i<50;i++)await ctx.db.insert("commerce_products",{...data,title:`Other ${i}`,slug:`other-${i}`,brandId:ids.other});
    return result;
  });
  const first=await t.query(page,{slug:"aster"});expect(first.page).toEqual([]);expect(first.isDone).toBe(false);expect(first.recheckAt).toBeGreaterThan(Date.now());
  const seen:string[]=[];let cursor:string|null=null,rounds=0;
  do{const result=await t.query(page,{slug:"aster",cursor});expect(result.page.length).toBeLessThanOrEqual(12);expect(JSON.stringify(result)).not.toContain("PRIVATE");expect(JSON.stringify(result)).not.toContain("stockQuantity");seen.push(...result.page.map((p:{id:string})=>p.id));rounds++;if(result.isDone)break;expect(result.continueCursor).not.toBe(cursor);cursor=result.continueCursor;expect(rounds).toBeLessThan(12);}while(true);
  expect(new Set(seen).size).toBe(publicIds.length);expect([...seen].sort()).toEqual([...publicIds].sort());
});
test("catalog rechecks product gates and published brand status on every page request",async()=>{
  const {t,ids}=await fixture();await t.run(ctx=>ctx.db.patch(ids.plugins,{values:{commerceEnabled:true,membershipEnabled:true}}));
  const rule=await t.run(ctx=>ctx.db.insert("membership_restriction_rules",{resourceType:"product",resourceIdOrKey:ids.product,ruleMode:"allow_only",planIds:[],loginRequired:true,teaserMode:"hide",createdAt:1,updatedAt:1}));
  expect((await t.query(page,{slug:"aster"})).page).toEqual([]);
  await t.run(ctx=>ctx.db.delete(rule));expect((await t.query(page,{slug:"aster"})).page).toHaveLength(1);
  await t.run(ctx=>ctx.db.patch(ids.brand,{status:"draft"}));expect((await t.query(page,{slug:"aster"})).brand).toBeNull();
  expect((await t.query(page,{slug:"unknown"})).brand).toBeNull();
  for(const args of [{slug:"../aster"},{slug:"aster",refresh:-1},{slug:"aster",cursor:"x".repeat(8193)}])await expect(t.query(page,args)).rejects.toThrow("Invalid brand catalog request");
});
