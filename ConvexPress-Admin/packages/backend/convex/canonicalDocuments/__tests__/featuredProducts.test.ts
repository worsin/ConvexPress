import { test, expect } from "bun:test";
import { convexTest } from "convex-test";
import schema from "../../schema";
import { readFeaturedProducts, readPublicCardVariant, createPublicProductCardProjector } from "../featuredProducts";
import { RequestReadLedger } from "../../helpers/requestReadLedger";
import { SourceByteLedger } from "../sourceBudget";
const modules = {
  "./convex/_generated/api.js": () => import("../../_generated/api.js"),
  "./convex/_generated/server.js": () => import("../../_generated/server.js"),
  "./convex/membership/policyReads.ts": () => import("../../membership/policyReads"),
};
async function fixture() {
  const t = convexTest({schema, modules});
  const ids = await t.run(async ctx => {
    const user = await ctx.db.insert("users", {authSource:"local",email:"reader@example.invalid",emailVerified:true,status:"active",displayName:"Reader",createdAt:1,updatedAt:1});
    const setting = await ctx.db.insert("settings",{section:"plugins",values:{commerceEnabled:true,membershipEnabled:false},updatedAt:1,updatedBy:user});
    const add = (title:string,createdAt:number,status:"publish"|"draft"="publish") => ctx.db.insert("commerce_products",{
      title,slug:title.toLowerCase(),createdAt,updatedAt:createdAt,publishedAt:createdAt,status,productType:"simple",authorId:user,
      basePrice:{amount:2500,currencyCode:"USD"},salePrice:{amount:0,currencyCode:"USD"},salePriceFrom:0,
      categoryIds:[],galleryMediaIds:[],trackInventory:true,stockQuantity:10,allowBackorders:false,isVirtual:true,isDownloadable:false,
      description:"Private full source",rawSourceMeta:"Private import metadata",excerpt:"Public summary",
    });
    const old = await add("Old",1), recent = await add("Recent",2), draft = await add("Draft",3), future = await add("Future",Date.now()+3600000);
    await ctx.db.patch("commerce_products",draft,{status:"draft"});
    return {user,setting,old,recent,draft,future};
  });
  return {t,ids};
}
test("latest products omit drafts/future sources and expose only explicit card fields",async()=>{
  const {t,ids}=await fixture();const result=await t.run(ctx=>readFeaturedProducts(ctx,{}));
  expect(result.items.map(p=>p.id)).toEqual([ids.recent,ids.old]);
  expect(result.items[0]?.pricing?.salePrice?.amount).toBe(0);
  expect(JSON.stringify(result)).not.toContain("Private");expect(JSON.stringify(result)).not.toContain("reader@example");
});
test("hand-picked order is preserved; missing, wrong-table and empty references cannot broaden to latest",async()=>{
  const {t,ids}=await fixture();
  expect((await t.run(ctx=>readFeaturedProducts(ctx,{productIds:[ids.old,ids.old,ids.user,ids.draft,ids.recent],count:2}))).items.map(p=>p.id)).toEqual([ids.old,ids.recent]);
  for (const productIds of [[""],["not-an-id"],[ids.user],[ids.draft]]) expect((await t.run(ctx=>readFeaturedProducts(ctx,{productIds}))).items).toEqual([]);
  expect((await t.run(ctx=>readFeaturedProducts(ctx,{productIds:[ids.old],showPrice:false}))).items[0]?.pricing).toBeNull();
});
test("indexed public variant selection ignores hidden defaults regardless of their number",async()=>{
  const {t,ids}=await fixture();
  const visible=await t.run(async ctx=>{
    await ctx.db.patch("commerce_products",ids.recent,{productType:"variable"});
    for(let i=0;i<300;i++) await ctx.db.insert("commerce_product_variants",{productId:ids.recent,title:"Hidden",optionSummary:"Hidden",price:{amount:1,currencyCode:"USD"},status:"draft",isDefault:true,createdAt:1,updatedAt:1});
    return ctx.db.insert("commerce_product_variants",{productId:ids.recent,title:"Visible",optionSummary:"Visible",price:{amount:4200,currencyCode:"USD"},salePrice:{amount:0,currencyCode:"USD"},status:"publish",isDefault:false,createdAt:1,updatedAt:1});
  });
  const budget=new RequestReadLedger();const variant=await t.run(ctx=>readPublicCardVariant(ctx,ids.recent,budget,new SourceByteLedger()));
  expect(variant?._id).toBe(visible);expect(budget.queries).toBe(4);expect(budget.documents).toBe(1);
  expect((await t.run(ctx=>readFeaturedProducts(ctx,{productIds:[ids.recent]}))).items[0]?.pricing?.price.amount).toBe(4200);
  await t.run(ctx=>ctx.db.patch("commerce_product_variants",visible,{status:"private"}));
  expect((await t.run(ctx=>readFeaturedProducts(ctx,{productIds:[ids.recent]}))).items).toEqual([]);
});
test("legacy variants without status retain public visibility and deterministic default precedence",async()=>{
  const {t,ids}=await fixture();
  const first=await t.run(ctx=>ctx.db.insert("commerce_product_variants",{productId:ids.old,title:"Legacy",optionSummary:"Legacy",price:{amount:100,currencyCode:"USD"},isDefault:true,createdAt:1,updatedAt:1}));
  await t.run(ctx=>ctx.db.insert("commerce_product_variants",{productId:ids.old,title:"New",optionSummary:"New",price:{amount:200,currencyCode:"USD"},status:"publish",isDefault:true,createdAt:2,updatedAt:2}));
  expect((await t.run(ctx=>readPublicCardVariant(ctx,ids.old,new RequestReadLedger(),new SourceByteLedger())))?._id).toBe(first);
});
test("product and route restrictions hide cards; membership revocation removes them",async()=>{
  const {t,ids}=await fixture();
  const grant=await t.run(async ctx=>{
    await ctx.db.patch("settings",ids.setting,{values:{commerceEnabled:true,membershipEnabled:true}});
    const plan=await ctx.db.insert("membership_plans",{title:"Members",slug:"members",status:"active",grantMode:"manual",priority:1,createdAt:1,updatedAt:1});
    for(const target of [{resourceType:"product",resourceIdOrKey:ids.recent},{resourceType:"route",resourceIdOrKey:"/products/old"}])
      await ctx.db.insert("membership_restriction_rules",{...target,ruleMode:"allow_only",planIds:[plan],teaserMode:"excerpt",loginRequired:true,createdAt:1,updatedAt:1});
    return ctx.db.insert("membership_grants",{userId:ids.user,planId:plan,sourceType:"manual",status:"active",startsAt:1,createdAt:1,updatedAt:1});
  });
  expect((await t.run(ctx=>readFeaturedProducts(ctx,{}))).items).toEqual([]);
  const member=t.withIdentity({subject:ids.user,tokenIdentifier:`https://convexpress-admin.local|${ids.user}`});
  expect((await member.run(ctx=>readFeaturedProducts(ctx,{}))).items).toHaveLength(2);
  await t.run(ctx=>ctx.db.patch("membership_grants",grant,{status:"revoked"}));
  expect((await member.run(ctx=>readFeaturedProducts(ctx,{}))).items).toEqual([]);
});
test("invalid args fail before reads; disabled commerce and oversized full source data refuse",async()=>{
  const {t,ids}=await fixture();const budget=new RequestReadLedger();
  await expect(t.run(ctx=>readFeaturedProducts(ctx,{count:1.1},budget))).rejects.toThrow();expect(budget.queries).toBe(0);
  await t.run(ctx=>ctx.db.patch("commerce_products",ids.recent,{rawSourceMeta:"x".repeat(257*1024)}));
  await expect(t.run(ctx=>readFeaturedProducts(ctx,{productIds:[ids.recent]}))).rejects.toThrow("source document budget");
  await t.run(ctx=>ctx.db.patch("settings",ids.setting,{values:{commerceEnabled:false}}));
  await expect(t.run(ctx=>readFeaturedProducts(ctx,{productIds:[ids.old]}))).rejects.toThrow("disabled");
});
test("only active image media is projected; unsafe URLs refuse rather than reaching markup",async()=>{
  const {t,ids}=await fixture();const media=await t.run(async ctx=>{
    const id=await ctx.db.insert("media",{title:"Image",fileName:"image.jpg",slug:"image",url:"https://images.example.invalid/image.jpg",mimeType:"image/jpeg",fileSize:42,mediaType:"image",status:"active",uploadedBy:ids.user,createdAt:1,updatedAt:1,altText:"Object"});
    await ctx.db.patch("commerce_products",ids.recent,{featuredMediaId:id});return id;
  });
  expect((await t.run(ctx=>readFeaturedProducts(ctx,{productIds:[ids.recent]}))).items[0]?.image?.alt).toBe("Object");
  await t.run(ctx=>ctx.db.patch("media",media,{status:"trashed"}));
  expect((await t.run(ctx=>readFeaturedProducts(ctx,{productIds:[ids.recent]}))).items[0]?.image).toBeNull();
  await t.run(ctx=>ctx.db.patch("media",media,{status:"active",url:"javascript:alert(1)"}));
  await expect(t.run(ctx=>readFeaturedProducts(ctx,{productIds:[ids.recent]}))).rejects.toThrow();
});


test("shared collection projector retains privacy and visibility for caller-selected documents",async()=>{
  const {t,ids}=await fixture();
  const cards=await t.run(async ctx=>{
    const project=await createPublicProductCardProjector(ctx,false,new RequestReadLedger(),new SourceByteLedger());
    return Promise.all([ids.old,ids.draft,ids.future].map(async id=>project(await ctx.db.get(id))));
  });
  expect(cards[0]).toMatchObject({id:ids.old,pricing:null});
  expect(cards.slice(1)).toEqual([null,null]);
  expect(JSON.stringify(cards)).not.toContain("Private");
  await t.run(ctx=>ctx.db.patch("settings",ids.setting,{values:{commerceEnabled:false}}));
  await expect(t.run(ctx=>createPublicProductCardProjector(ctx,true,new RequestReadLedger(),new SourceByteLedger()))).rejects.toThrow("disabled");
});
