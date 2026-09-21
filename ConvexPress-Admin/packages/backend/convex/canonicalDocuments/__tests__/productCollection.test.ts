import {syncProductSaleIndex} from "../../commerce/productSaleIndex";
import {insertWithMediaReferences,patchWithMediaReferences} from "../../media/attachmentGuard";
import {insertCountedReview,beginRatingRepair,advanceRatingRepair} from "../../commerceReviews/ratingIndex";
import { test, expect } from "bun:test";
import { convexTest } from "convex-test";
import schema from "../../schema";
import { readProductCollection } from "../productCollection";
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
test("all seven collection modes retain source selection, order and display disclosures", async()=>{
  const {t,ids}=await fixture();const p=ids.products;
  const read=(args:unknown,history?:string[])=>t.run(ctx=>readProductCollection(ctx,args,undefined,undefined,{now:150,recentlyViewedIds:history}));
  expect((await read({mode:"manual",productIds:[p[1],p[4],p[1],p[0]],count:3})).items.map(c=>c.id)).toEqual([p[1],p[0]]);
  expect((await read({mode:"manual"})).items).toEqual([]);
  expect((await read({mode:"category",categorySlug:"studio"})).items.map(c=>c.id)).toEqual([p[0]]);
  expect((await read({mode:"tag",tagSlug:"gift"})).items.map(c=>c.id)).toEqual([p[1]]);
  expect((await read({mode:"featured"})).items.map(c=>c.id)).toEqual([p[2]]);
  expect((await read({mode:"recent",count:2})).items.map(c=>c.id)).toEqual([p[3],p[2]]);
  const sale=await read({mode:"sale",showPrice:false});expect(sale.items.map(c=>c.id)).toEqual([p[3]]);expect(sale.items[0]?.pricing).toBeNull();
  expect((await read({mode:"recentlyViewed"},[p[0],p[4],p[2],p[0]])).items.map(c=>c.id)).toEqual([p[0],p[2]]);
  expect((await read({mode:"recentlyViewed"})).items).toEqual([]);
  const grouped=await read({productIds:[p[0]],showPrice:false,groups:[{productIds:[p[2],p[1]]},{productIds:[p[4]]}]});
  expect(grouped.groups.map(g=>g.items.map(c=>c.id))).toEqual([[p[2],p[1]],[]]);
  expect(JSON.stringify(grouped)).not.toContain("private-marker");expect(grouped.items[0]).toMatchObject({pricing:null,rating:null,cart:null});
});
test("sale windows and public default variants determine eligibility including free sales",async()=>{
  const {t,ids}=await fixture();const product=ids.products[3]!;
  const sale=(now:number)=>t.run(ctx=>readProductCollection(ctx,{mode:"sale"},undefined,undefined,{now}));
  expect((await sale(99)).items).toEqual([]);expect((await sale(200)).items[0]?.pricing?.salePrice?.amount).toBe(0);expect((await sale(201)).items).toEqual([]);
  await t.run(async ctx=>{
    await patchWithMediaReferences(ctx,"commerce_products",product,{productType:"variable"});
    await insertWithMediaReferences(ctx,"commerce_product_variants",{productId:product,title:"Hidden",optionSummary:"Hidden",price:{amount:1000,currencyCode:"USD"},salePrice:{amount:0,currencyCode:"USD"},status:"draft",isDefault:true,createdAt:1,updatedAt:1});
    await insertWithMediaReferences(ctx,"commerce_product_variants",{productId:product,title:"Visible",optionSummary:"Visible",price:{amount:2000,currencyCode:"USD"},status:"publish",isDefault:false,createdAt:1,updatedAt:1});
  });
  expect((await sale(150)).items).toEqual([]);
  const manual=await t.run(ctx=>readProductCollection(ctx,{productIds:[product],showAddToCart:true}));
  expect(manual.items[0]?.cart).toEqual({kind:"chooseOptions"});expect(manual.items[0]?.pricing?.price.amount).toBe(2000);
});
test("missing hidden and stale taxonomy coordinates cannot broaden product collections",async()=>{
  const {t,ids}=await fixture();
  await t.run(async ctx=>{
    await ctx.db.patch(ids.products[0]!,{categoryIds:[]}); // stale derived row
    await ctx.db.patch(ids.products[2]!,{isFeatured:false});
    await ctx.db.insert("commerce_product_discovery",{productId:ids.products[1]!,kind:"recent",key:"",createdAt:999});
    await ctx.db.patch(ids.tag,{isVisible:false});
    await ctx.db.insert("terms",{name:"Gift",slug:"gift",taxonomy:"post_tag",count:0,isDefault:false,createdAt:1,updatedAt:1});
  });
  expect((await t.run(ctx=>readProductCollection(ctx,{mode:"recent"}))).items.map(c=>c.id)).toEqual([ids.products[3],ids.products[2],ids.products[1],ids.products[0]]);
  for(const args of [{mode:"category",categorySlug:"studio"},{mode:"category",categorySlug:"missing"},{mode:"tag",tagSlug:"gift"},{mode:"featured"}])
    expect((await t.run(ctx=>readProductCollection(ctx,args))).items).toEqual([]);
  await t.run(async ctx=>{
    await ctx.db.patch(ids.products[0]!,{categoryIds:[ids.category]});
    const parent=await ctx.db.insert("commerce_product_categories",{name:"Hidden parent",slug:"hidden-parent",productCount:0,isVisible:false,createdAt:1,updatedAt:1});
    await ctx.db.patch(ids.category,{parentId:parent});
  });
  expect((await t.run(ctx=>readProductCollection(ctx,{mode:"category",categorySlug:"studio"}))).items).toEqual([]);
});
test("ratings use only approved reviews and cart availability accounts for active reservations",async()=>{
  const {t,ids}=await fixture();const product=ids.products[0]!;
  await t.run(async ctx=>{
    for(const [rating,status] of [[5,"approved"],[3,"approved"],[1,"pending"]] as const)
      await insertCountedReview(ctx,{productId:product,userId:ids.user,rating,status,isVerifiedPurchase:false,helpfulCount:0,content:"private-review",createdAt:1,updatedAt:1});
    await ctx.db.patch(product,{stockQuantity:0});
  });
  const args={productIds:[product],showRating:true,showAddToCart:true};
  const result=await t.run(ctx=>readProductCollection(ctx,args));expect(result.items[0]?.rating).toEqual({average:4,count:2});expect(result.items[0]?.cart).toBeNull();expect(JSON.stringify(result)).not.toContain("private-review");
  const reservation = await t.run(async ctx => {
    await ctx.db.patch(product, {stockQuantity: 1});
    const cartId = await ctx.db.insert("commerce_carts", {sessionToken:"collection-stock",status:"active",currencyCode:"USD",subtotalAmount:0,discountAmount:0,shippingAmount:0,taxAmount:0,totalAmount:0,itemCount:0,lastActiveAt:1,createdAt:1,updatedAt:1});
    const checkoutSessionId = await ctx.db.insert("commerce_checkout_sessions", {cartId,sessionToken:"collection-stock",status:"ready_for_review",currencyCode:"USD",subtotalAmount:0,discountAmount:0,shippingAmount:0,taxAmount:0,totalAmount:0,createdAt:1,updatedAt:1});
    return ctx.db.insert("commerce_stock_reservations", {checkoutSessionId,productId:product,quantity:1,status:"active",expiresAt:200,createdAt:1,updatedAt:1});
  });
  const budget = new RequestReadLedger();
  expect((await t.run(ctx=>readProductCollection(ctx,args,budget,undefined,{now:150}))).items[0]?.cart).toBeNull();
  expect((await t.run(ctx=>readProductCollection(ctx,args,undefined,undefined,{now:201}))).items[0]?.cart).toEqual({kind:"add",productId:product});
  await t.run(ctx=>ctx.db.patch(reservation,{expiresAt:Date.now()+3600000}));
  await t.run(ctx=>ctx.db.patch(product,{allowBackorders:true}));
  expect((await t.run(ctx=>readProductCollection(ctx,args))).items[0]?.cart).toEqual({kind:"add",productId:product});
  await t.run(ctx=>ctx.db.patch(ids.setting,{values:{commerceEnabled:true,membershipEnabled:false,commerceReviewsEnabled:false}}));
  expect((await t.run(ctx=>readProductCollection(ctx,args))).items[0]?.rating).toBeNull();
});
test("source authorization applies to history, manual groups and indexed modes after revocation",async()=>{
  const {t,ids}=await fixture();
  const grant = await t.run(async ctx=>{
    await ctx.db.patch(ids.setting,{values:{commerceEnabled:true,membershipEnabled:true}});
    const plan=await ctx.db.insert("membership_plans",{title:"Members",slug:"members",status:"active",grantMode:"manual",priority:1,createdAt:1,updatedAt:1});
    await ctx.db.insert("membership_restriction_rules",{resourceType:"product",resourceIdOrKey:ids.products[0]!,ruleMode:"allow_only",planIds:[plan],teaserMode:"excerpt",loginRequired:true,createdAt:1,updatedAt:1});
    return ctx.db.insert("membership_grants",{userId:ids.user,planId:plan,sourceType:"manual",status:"active",startsAt:1,createdAt:1,updatedAt:1});
  });
  const member=t.withIdentity({subject:ids.user,tokenIdentifier:`https://convexpress-admin.local|${ids.user}`});
  expect((await member.run(ctx=>readProductCollection(ctx,{productIds:[ids.products[0]]}))).items).toHaveLength(1);
  await t.run(ctx=>ctx.db.patch(grant,{status:"revoked"}));
  expect((await member.run(ctx=>readProductCollection(ctx,{productIds:[ids.products[0]]}))).items).toEqual([]);
  for(const args of [{productIds:[ids.products[0]],groups:[{productIds:[ids.products[0]]}]},{mode:"category",categorySlug:"studio"},{mode:"recentlyViewed"}]) {
    const result=await t.run(ctx=>readProductCollection(ctx,args,undefined,undefined,{recentlyViewedIds:[ids.products[0]!]}));expect(result.items).toEqual([]);expect(result.groups.flatMap(g=>g.items)).toEqual([]);
  }
  await t.run(ctx=>ctx.db.patch(ids.setting,{values:{commerceEnabled:false}}));
  await expect(t.run(ctx=>readProductCollection(ctx,{}))).rejects.toThrow();
});
test("invalid arguments and histories stop before reads; legacy index readiness and source budgets fail closed",async()=>{
  const {t,ids}=await fixture();const budget=new RequestReadLedger();
  await expect(t.run(ctx=>readProductCollection(ctx,{mode:"category"},budget))).rejects.toThrow();
  await expect(t.run(ctx=>readProductCollection(ctx,{},budget,undefined,{recentlyViewedIds:Array(49).fill(ids.products[0])}))).rejects.toThrow();expect(budget.queries).toBe(0);
  await t.run(ctx=>ctx.db.patch(ids.products[0]!,{collectionIndexVersion:undefined}));
  await expect(t.run(ctx=>readProductCollection(ctx,{mode:"recent"}))).rejects.toThrow("being indexed");
  await t.run(ctx=>ctx.db.patch(ids.products[0]!,{rawSourceMeta:"x".repeat(257*1024)}));
  await expect(t.run(ctx=>readProductCollection(ctx,{productIds:[ids.products[0]]},new RequestReadLedger(),new SourceByteLedger()))).rejects.toThrow("source document budget");
});

test("legacy ratings refuse incomplete aggregates and rebuild beyond the previous review cap",async()=>{
  const {t,ids}=await fixture();const productId=ids.products[0]!;
  const review=await t.run(ctx=>ctx.db.insert("commerce_review_items",{productId,userId:ids.user,rating:6,status:"approved",isVerifiedPurchase:false,helpfulCount:0,createdAt:1,updatedAt:1}));
  await expect(t.run(ctx=>readProductCollection(ctx,{productIds:[productId],showRating:true}))).rejects.toThrow("need repair");
  await t.run(async ctx=>{
    await ctx.db.patch(review,{rating:5});
    for(let i=0;i<256;i++) await ctx.db.insert("commerce_review_items",{productId,userId:ids.user,rating:5,status:"approved",isVerifiedPurchase:false,helpfulCount:0,createdAt:1,updatedAt:1});
  });
  await expect(t.run(ctx=>readProductCollection(ctx,{productIds:[productId],showRating:true}))).rejects.toThrow("no partial average");
  expect((await t.run(ctx=>readProductCollection(ctx,{productIds:[productId],showRating:false}))).items).toHaveLength(1);
  let task=await t.run(ctx=>beginRatingRepair(ctx,productId));
  while(task){const current=task;task=await t.run(ctx=>advanceRatingRepair(ctx,current));}
  const budget=new RequestReadLedger();
  const result=await t.run(ctx=>readProductCollection(ctx,{productIds:[productId],showRating:true},budget));
  expect(result.items[0]?.rating).toEqual({average:5,count:257});expect(budget.documents).toBeLessThan(20);
});

test("omitted future products and hidden sale prices still schedule a collection eligibility recheck",async()=>{
  const {t,ids}=await fixture();
  const saleBudget=new RequestReadLedger();
  expect((await t.run(ctx=>readProductCollection(ctx,{mode:"sale",showPrice:false},saleBudget,undefined,{now:99}))).items).toEqual([]);
  expect(saleBudget.authorizationRecheckAt).toBe(100);
  const expiryBudget=new RequestReadLedger();
  await t.run(ctx=>readProductCollection(ctx,{mode:"sale",showPrice:false},expiryBudget,undefined,{now:150}));
  expect(expiryBudget.authorizationRecheckAt).toBe(201);
  await t.run(ctx=>ctx.db.patch(ids.products[0]!,{publishedAt:500}));
  const publicationBudget=new RequestReadLedger();
  expect((await t.run(ctx=>readProductCollection(ctx,{productIds:[ids.products[0]]},publicationBudget,undefined,{now:150}))).items).toEqual([]);
  expect(publicationBudget.authorizationRecheckAt).toBe(500);
});

test("multiple collection resolutions compose without consuming Convex transaction pagination", async () => {
  const {t, ids} = await fixture();
  await t.run(async ctx => {
    const {_id, _creationTime, ...product} = (await ctx.db.get(ids.products[0]!))!;
    for (let i = 0; i < 40; i++) await insertWithMediaReferences(ctx, "commerce_products", {
      ...product, slug: `future-${i}`, createdAt: 10 + i, publishedAt: 500, categoryIds: [],
    });
  });
  await t.run(async ctx => {
    // A resolver embedded in a document must leave pagination available for its
    // caller. convex-test does not enforce the deployed transaction restriction.
    const guard = (query: any): any => new Proxy(query, { get(target, key) {
      if (key === "paginate") return () => { throw new Error("Collection consumed transaction pagination"); };
      const value = Reflect.get(target, key);
      if (typeof value !== "function") return value;
      return (...args: any[]) => {
        const result = value.apply(target, args);
        return ["withIndex", "order", "filter"].includes(String(key)) ? guard(result) : result;
      };
    }});
    const db = new Proxy(ctx.db, { get(target, key) {
      if (key === "query") return (...args: any[]) => guard((target.query as any)(...args));
      const value = Reflect.get(target, key);
      return typeof value === "function" ? value.bind(target) : value;
    }});
    const read = (args: unknown) => readProductCollection({...ctx, db}, args, undefined, undefined, {now: 150});
    // More than the former 32-row page must be inspected before a visible card.
    expect((await read({mode: "recent", count: 1})).items.map(c => c.id)).toEqual([ids.products[3]]);
    expect((await read({mode: "tag", tagSlug: "gift"})).items.map(c => c.id)).toEqual([ids.products[1]]);
    expect((await read({mode: "category", categorySlug: "studio"})).items.map(c => c.id)).toEqual([ids.products[0]]);
    expect((await read({mode: "recent", count: 1})).items.map(c => c.id)).toEqual([ids.products[3]]);
  });
});

test("collection candidate bound accepts the final allowed card and refuses an incomplete overflow", async () => {
  const {t, ids} = await fixture();
  await t.run(async ctx => {
    const {_id, _creationTime, ...product} = (await ctx.db.get(ids.products[0]!))!;
    for (let i = 0; i < 159; i++) await insertWithMediaReferences(ctx, "commerce_products", {
      ...product, slug: `future-${i}`, createdAt: 10 + i, publishedAt: 500, categoryIds: [],
    });
  });
  const read = () => t.run(ctx => readProductCollection(ctx, {mode: "recent", count: 1}, undefined, undefined, {now: 150}));
  expect((await read()).items.map(c => c.id)).toEqual([ids.products[3]]);
  await t.run(async ctx => {
    const {_id, _creationTime, ...product} = (await ctx.db.get(ids.products[0]!))!;
    await insertWithMediaReferences(ctx, "commerce_products", {...product, slug: "overflow", createdAt: 200, publishedAt: 500});
  });
  await expect(read()).rejects.toThrow("bounded scan");
});

test("sale countdown reads all 48 requested public discounts without admitting draft or future sales", async () => {
  const {t,ids}=await fixture();
  await t.run(async ctx => {
    for(let i=0;i<50;i++) {
      const id=await ctx.db.insert("commerce_products",{title:`Sale ${i}`,slug:`sale-${i}`,status:i===49?"draft":"publish",productType:"simple",authorId:ids.user,categoryIds:[],tagIds:[],galleryMediaIds:[],basePrice:{amount:2400,currencyCode:"USD"},salePrice:{amount:1800,currencyCode:"USD"},salePriceFrom:i===48?300:100,salePriceTo:200,trackInventory:false,allowBackorders:false,isVirtual:true,isDownloadable:false,createdAt:10+i,updatedAt:1,publishedAt:1});
      await syncProductSaleIndex(ctx,id);
    }
  });
  const result=await t.run(ctx=>readProductCollection(ctx,{mode:"sale",count:48},undefined,undefined,{now:150}));
  expect(result.items).toHaveLength(48);
  expect(result.items.every(item=>item.pricing!==null && item.pricing.salePrice!==null && item.pricing.salePrice.amount < item.pricing.price.amount)).toBe(true);
  expect(result.items.some(item=>item.title==="Sale 48"||item.title==="Sale 49")).toBe(false);
  expect((await t.run(ctx=>readProductCollection(ctx,{mode:"sale",count:48},undefined,undefined,{now:201}))).items).toEqual([]);
  await t.run(ctx=>ctx.db.patch(ids.setting,{values:{commerceEnabled:true,membershipEnabled:true}}));
  const read=()=>t.run(ctx=>readProductCollection(ctx,{mode:"sale",count:48},undefined,undefined,{now:150}));
  expect((await read()).items).toHaveLength(48);
  const restricted=result.items[0]!;
  const rule=await t.run(ctx=>ctx.db.insert("membership_restriction_rules",{resourceType:"route",resourceIdOrKey:restricted.href,ruleMode:"allow_only",planIds:[],teaserMode:"hide",loginRequired:true,createdAt:1,updatedAt:1}));
  expect((await read()).items.some(item=>item.id===restricted.id)).toBe(false);
  await t.run(ctx=>ctx.db.patch(rule,{resourceIdOrKey:"/products/*"}));
  expect((await read()).items).toEqual([]);
  await t.run(ctx=>ctx.db.delete(rule));
  expect((await read()).items).toHaveLength(48);
});


test("recent history honors 48 ordered candidates and rechecks draft and membership changes", async () => {
  const {t,ids}=await fixture();
  const history=await t.run(async ctx=>{
    const result=[];
    for(let i=0;i<48;i++)result.push(await ctx.db.insert("commerce_products",{title:`History ${i}`,slug:`history-${i}`,status:"publish",productType:"simple",authorId:ids.user,categoryIds:[],tagIds:[],galleryMediaIds:[],basePrice:{amount:2400,currencyCode:"USD"},trackInventory:false,allowBackorders:false,isVirtual:true,isDownloadable:false,createdAt:10+i,updatedAt:1,publishedAt:1}));
    await ctx.db.patch(ids.setting,{values:{commerceEnabled:true,membershipEnabled:true}});
    return result.reverse();
  });
  const read=(recentlyViewedIds=history)=>t.run(ctx=>readProductCollection(ctx,{mode:"recentlyViewed",count:48},undefined,undefined,{now:150,recentlyViewedIds}));
  expect((await read()).items.map(item=>item.id)).toEqual(history);
  expect((await read([])).items).toEqual([]);
  expect((await read([history[1]!,history[0]!,history[1]!])).items.map(item=>item.id)).toEqual([history[1]!,history[0]!]);
  await t.run(ctx=>ctx.db.patch(history[0]!,{status:"draft"}));
  expect((await read()).items.map(item=>item.id)).toEqual(history.slice(1));
  const rule=await t.run(ctx=>ctx.db.insert("membership_restriction_rules",{resourceType:"route",resourceIdOrKey:"/products/history-46",ruleMode:"allow_only",planIds:[],teaserMode:"hide",loginRequired:true,createdAt:1,updatedAt:1}));
  expect((await read()).items.map(item=>item.id)).toEqual(history.slice(2));
  await t.run(ctx=>ctx.db.patch(rule,{resourceIdOrKey:"/products/*"}));
  expect((await read()).items).toEqual([]);
});
