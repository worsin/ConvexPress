import { test, expect } from "bun:test";
import { convexTest } from "convex-test";
import schema from "../../schema";
import { readReviews } from "../reviews";
import { RequestReadLedger } from "../../helpers/requestReadLedger";
import { SourceByteLedger } from "../sourceBudget";
import { insertCountedReview, beginRatingRepair } from "../../commerceReviews/ratingIndex";
import type { ReviewsArgs } from "../foundation/reviewsContracts";
import { displayContext } from "../displayContext";
const modules={"./convex/_generated/api.js":()=>import("../../_generated/api.js"),"./convex/_generated/server.js":()=>import("../../_generated/server.js"),"./convex/membership/policyReads.ts":()=>import("../../membership/policyReads")};
const scope={websiteKey:"reviews",instanceKey:"staging"};
async function fixture() {
  const t=convexTest({schema,modules});
  const ids=await t.run(async ctx=>{
    const user=await ctx.db.insert("users",{authSource:"local",email:"reviews@example.invalid",displayName:"A reader",emailVerified:true,status:"active",createdAt:1,updatedAt:1});
    const settings=await ctx.db.insert("settings",{section:"plugins",values:{commerceEnabled:true,commerceReviewsEnabled:true,membershipEnabled:false},updatedAt:1,updatedBy:user});
    const products=[];
    for(let i=0;i<3;i++)products.push(await ctx.db.insert("commerce_products",{title:`Product ${i}`,slug:`product-${i}`,status:i===2?"draft":"publish",productType:"simple",authorId:user,categoryIds:[],galleryMediaIds:[],basePrice:{amount:100,currencyCode:"USD"},trackInventory:false,allowBackorders:false,isVirtual:true,isDownloadable:false,createdAt:1,updatedAt:1,rawSourceMeta:"private-marker"}));
    const reviews=[];
    for(let i=0;i<9;i++)reviews.push(await insertCountedReview(ctx,{productId:products[i%3]!,userId:user,rating:i%5+1,title:`Review ${i}`,content:`Body ${i}`,status:i===0?"pending":"approved",isVerifiedPurchase:i===1,helpfulCount:0,rejectionReason:"private-marker",moderatedBy:user,createdAt:i+1,updatedAt:1}));
    return {user,settings,products,reviews};
  });
  const read=(args:Partial<ReviewsArgs>={},s=scope,documentId="current-page",budget?:RequestReadLedger,sources?:SourceByteLedger)=>t.run(ctx=>readReviews(ctx,args,s,documentId,budget,sources,1000));
  return {t,ids,read};
}
test("site reviews filter inaccessible products and compute only the displayed-page summary",async()=>{
  const {read,ids}=await fixture(),result=await read({limit:3});
  expect(result.items.map(item=>item.id)).toEqual([ids.reviews[7],ids.reviews[6],ids.reviews[4]]);
  expect(result.summary).toMatchObject({scope:"page",count:3,average:10/3});
  expect(result.nextCursor).not.toBeNull();expect(JSON.stringify(result)).not.toContain("private-marker");
  for(const item of result.items)for(const field of ["userId","orderId","moderatedBy","rejectionReason","email"])expect(item).not.toHaveProperty(field);
});
test("selected-product summary counts all its approved reviews across filters, with explicit pending repair",async()=>{
  const {t,ids,read}=await fixture(),product=ids.products[1]!;
  const result=await read({source:"product",product,minRating:4,limit:1});
  expect(result.items.map(item=>item.id)).toEqual([ids.reviews[4]]);
  expect(result.summary).toMatchObject({scope:"product",count:3,average:10/3});
  await t.run(ctx=>beginRatingRepair(ctx,product,true));
  expect((await read({source:"product",product})).summary).toBeNull();
  expect((await read({source:"product",product:""})).availability).toBe("unavailable");
  expect((await read({source:"product",product:ids.products[2]})).items).toEqual([]);
});
test("sparse pages advance across more than64 hidden reviews, then preserve exact page boundaries",async()=>{
  const {t,ids,read}=await fixture();
  await t.run(async ctx=>{for(let i=0;i<70;i++)await insertCountedReview(ctx,{productId:ids.products[2]!,userId:ids.user,rating:5,status:"approved",isVerifiedPurchase:false,helpfulCount:0,createdAt:100+i,updatedAt:1});});
  const first=await read({limit:2});expect(first.items).toHaveLength(0);expect(first.nextCursor).not.toBeNull();expect(first.summary?.count).toBe(0);
  let cursor=first.nextCursor;const idsSeen:string[]=[];
  for(let page=0;page<10&&cursor;page++){const result=await read({limit:2,cursor});idsSeen.push(...result.items.map(item=>item.id));cursor=result.nextCursor;}
  expect(cursor).toBeNull();expect(new Set(idsSeen).size).toBe(5);expect(idsSeen).toHaveLength(5);
});
test("cursor binding refuses selection, filter, document and environment changes",async()=>{
  const {read,ids}=await fixture(),first=await read({limit:1}),cursor=first.nextCursor!;
  for(const args of [{limit:2,cursor},{limit:1,minRating:4,cursor},{source:"product" as const,product:ids.products[0],limit:1,cursor}])await expect(read(args)).rejects.toThrow("another selection");
  await expect(read({limit:1,cursor},{...scope,instanceKey:"production"})).rejects.toThrow("another selection");
  await expect(read({limit:1,cursor},scope,"other-page")).rejects.toThrow("another selection");
});
test("publication and both membership paths are checked again after pagination",async()=>{
  const {t,ids,read}=await fixture();
  await t.run(ctx=>ctx.db.patch(ids.settings,{values:{commerceEnabled:true,commerceReviewsEnabled:true,membershipEnabled:true}}));
  for(const resourceType of ["product","route"] as const){
    const rule=await t.run(ctx=>ctx.db.insert("membership_restriction_rules",{resourceType,resourceIdOrKey:resourceType==="product"?String(ids.products[1]):"/products/product-1",ruleMode:"allow_only",planIds:[],teaserMode:"hide",loginRequired:true,createdAt:1,updatedAt:1}));
    expect((await read()).items.every(item=>item.product.id!==ids.products[1])).toBe(true);
    expect((await read({source:"product",product:ids.products[1]})).availability).toBe("unavailable");
    await t.run(ctx=>ctx.db.delete(rule));
  }
  const first=await read({limit:1});
  await t.run(ctx=>ctx.db.patch(ids.products[1]!,{publishedAt:2000}));
  expect((await read({limit:1,cursor:first.nextCursor})).items.every(item=>item.product.id!==ids.products[1])).toBe(true);
  await t.run(ctx=>ctx.db.patch(ids.settings,{values:{commerceEnabled:true,commerceReviewsEnabled:false}}));
  expect((await read()).availability).toBe("unavailable");
});
test("source budgets include full private review documents and invalid arguments read nothing",async()=>{
  const {t,ids,read}=await fixture(),budget=new RequestReadLedger();
  await expect(read({limit:49},scope,"page",budget)).rejects.toThrow();expect(budget.queries).toBe(0);
  await t.run(ctx=>ctx.db.patch(ids.reviews[7]!,{rejectionReason:"x".repeat(129*1024)}));
  await expect(read()).rejects.toThrow("source document budget");
});

test("editor installation policy exposes Reviews only while both required plugins are enabled", async () => {
  const { t, ids } = await fixture();
  await t.run(ctx => ctx.db.insert("convexpress_siteIdentity", {
    identityKey: "site-identity", websiteKey: scope.websiteKey, instanceKey: scope.instanceKey,
    environmentKind: "staging", deploymentOrigin: "https://reviews.convex.cloud",
    managementOrigin: "https://controller.convex.cloud", siteOrigin: "https://reviews.convex.site",
    siteContractVersion: "1", schemaVersion: "2026.9.0", engineVersion: "1",
    managementCapabilities: [], initializedAt: 1, updatedAt: 1,
  }));
  const policy = () => t.run(ctx => displayContext(ctx, new RequestReadLedger()));
  expect((await policy()).policy.disabledBlocks).not.toContain("core/reviews");
  for (const values of [{ commerceEnabled: true, commerceReviewsEnabled: false }, { commerceEnabled: false, commerceReviewsEnabled: true }]) {
    await t.run(ctx => ctx.db.patch(ids.settings, { values }));
    expect((await policy()).policy.disabledBlocks).toContain("core/reviews");
  }
});
