import {test,expect,afterEach} from "bun:test";
import {convexTest} from "convex-test";
import schema from "../../schema";
import {readCategoryTiles} from "../categoryTiles";
import {recordCatalogWrite} from "../../commerce/catalogRevision";
import {MEDIA_REVERSE_EPOCH_VARIABLE} from "../../media/reverseIndexVersion";
import {RequestReadLedger} from "../../helpers/requestReadLedger";
const originalKey=process.env.AUTH_PRIVATE_KEY, originalEpoch=process.env[MEDIA_REVERSE_EPOCH_VARIABLE];
afterEach(()=>{if(originalKey===undefined)delete process.env.AUTH_PRIVATE_KEY;else process.env.AUTH_PRIVATE_KEY=originalKey;if(originalEpoch===undefined)delete process.env[MEDIA_REVERSE_EPOCH_VARIABLE];else process.env[MEDIA_REVERSE_EPOCH_VARIABLE]=originalEpoch;});
const context={scope:{websiteKey:"tiles:site",instanceKey:"tiles_staging"},documentId:"test-document"};
const modules={"./convex/_generated/api.js":()=>import("../../_generated/api.js"),"./convex/_generated/server.js":()=>import("../../_generated/server.js"),"./convex/membership/policyReads.ts":()=>import("../../membership/policyReads")};
async function fixture(){
 const t=convexTest({schema,modules});
 process.env.AUTH_PRIVATE_KEY="synthetic-catalog-signing-key-".repeat(4);
 process.env[MEDIA_REVERSE_EPOCH_VARIABLE]="mi_ready_catalog_test_generation";
 const ids=await t.run(async ctx=>{
  const user=await ctx.db.insert("users",{authSource:"local",email:"tiles@example.invalid",emailVerified:true,status:"active",createdAt:1,updatedAt:1});
  await ctx.db.insert("settings",{section:"plugins",values:{commerceEnabled:true,membershipEnabled:true},updatedBy:user,updatedAt:1});
  await ctx.db.insert("convexpress_siteIdentity",{identityKey:"site-identity",...context.scope,environmentKind:"staging",deploymentOrigin:"https://test.convex.cloud",managementOrigin:"https://test.convex.site",siteOrigin:"https://test.invalid",siteContractVersion:"1",schemaVersion:"1",engineVersion:"1",managementCapabilities:[],initializedAt:1,updatedAt:1});
  const make=(name:string,extra:object={})=>ctx.db.insert("commerce_product_categories",{name,slug:name.toLowerCase(),description:`About ${name}`,productCount:999,totalProductCount:999,isVisible:true,sortOrder:1,createdAt:1,updatedAt:1,...extra});
  const root=await make("Home"),child=await make("Field",{parentId:root,sortOrder:2}),hidden=await make("Hidden",{isVisible:false}),hiddenChild=await make("Secret",{parentId:hidden,path:[],sortOrder:3});
  const product=(slug:string,extra:object={})=>ctx.db.insert("commerce_products",{title:slug,slug,status:"publish",productType:"simple",authorId:user,basePrice:{amount:100,currencyCode:"USD"},categoryIds:[root,child],galleryMediaIds:[],trackInventory:false,allowBackorders:false,isVirtual:true,isDownloadable:false,createdAt:1,updatedAt:1,...extra});
  const visible=await product("visible"),restricted=await product("restricted");await product("future",{publishedAt:1000});
  await product("hidden",{categoryIds:[hiddenChild]});await product("no-variant",{productType:"variable"});await product("draft",{status:"draft"});
  await ctx.db.insert("membership_restriction_rules",{resourceType:"product",resourceIdOrKey:restricted,ruleMode:"deny_if_missing",planIds:[],teaserMode:"hide",loginRequired:true,createdAt:1,updatedAt:1});
  return {user,root,child,visible};
 });
 return {t,ids,read:(args:object={})=>t.run(ctx=>readCategoryTiles(ctx,args,undefined,undefined,100,context))};
}
test("counts use eligible unique descendants instead of cached totals",async()=>{
 const {read}=await fixture();const result=await read();expect(result.items.map(c=>[c.slug,c.productCount])).toEqual([["home",1],["field",1]]);expect(result.items.every(c=>c.description===null)).toBe(true);expect(JSON.stringify(result)).not.toContain("999");
});
test("manual order and disclosures are preserved; missing/hidden selections never broaden",async()=>{
 const {read}=await fixture();const result=await read({categorySlugs:[" FIELD ","home","field"],showCounts:false,showDescriptions:true});
 expect(result.items.map(c=>c.slug)).toEqual(["field","home"]);expect(result.items.map(c=>c.description)).toEqual(["About Field","About Home"]);expect(result.items.every(c=>c.productCount===null)).toBe(true);
 for(const categorySlugs of [[""],["missing"],["secret"],["hidden"]])expect((await read({categorySlugs})).items).toEqual([]);
});
test("category ancestry, destination restrictions and publication changes are rechecked",async()=>{
 const {t,ids,read}=await fixture();await t.run(ctx=>ctx.db.patch(ids.root,{isVisible:false}));expect((await read()).items).toEqual([]);
 await t.run(async ctx=>{await ctx.db.patch(ids.root,{isVisible:true});await ctx.db.patch(ids.visible,{status:"draft"});});expect((await read()).items.map(c=>c.productCount)).toEqual([0,0]);
 await t.run(ctx=>ctx.db.insert("membership_restriction_rules",{resourceType:"route",resourceIdOrKey:"/categories/home",ruleMode:"deny_if_missing",planIds:[],teaserMode:"hide",loginRequired:true,createdAt:1,updatedAt:1}));expect((await read()).items.map(c=>c.slug)).toEqual(["field"]);
});
test("invalid input fails before reads and counts-off avoids product scans",async()=>{
 const {t,ids}=await fixture();const budget=new RequestReadLedger();await expect(t.run(ctx=>readCategoryTiles(ctx,{count:1.5},budget))).rejects.toThrow();expect(budget.queries).toBe(0);
 await t.run(ctx=>ctx.db.patch(ids.visible,{rawSourceMeta:"x".repeat(257*1024)}));expect((await t.run(ctx=>readCategoryTiles(ctx,{categorySlugs:["home"],showCounts:false}))).items).toHaveLength(1);await expect(t.run(ctx=>readCategoryTiles(ctx,{categorySlugs:["home"]}))).rejects.toThrow("source document budget");
});

test("large catalogs complete bounded signed chunks with unique descendant counts",async()=>{
 const {t,ids,read}=await fixture();
 await t.run(async ctx=>{const source=(await ctx.db.get(ids.visible))!;const {_id,_creationTime,...fields}=source;for(let i=0;i<205;i++)await ctx.db.insert("commerce_products",{...fields,slug:`extra-${i}`});});
 let result=await read();let chunks=1;
 expect(result.state).toBe("counting");expect(result.items.every(item=>item.productCount===null)).toBe(true);
 while(result.nextCursor){const budget=new RequestReadLedger();const cursor=result.nextCursor;result=await t.run(ctx=>readCategoryTiles(ctx,{cursor},budget,undefined,100,context));expect(budget.queries).toBeLessThan(256);expect(++chunks).toBeLessThan(20);}
 expect(chunks).toBeGreaterThan(3);expect(result.state).toBe("ready");expect(result.items.map(item=>item.productCount)).toEqual([206,206]);
 expect((await read({showCounts:false})).state).toBe("ready");
});
test("discovery crosses hidden category windows without exposing a partial selection",async()=>{
 const {t,read}=await fixture();
 await t.run(async ctx=>{for(let i=0;i<180;i++)await ctx.db.insert("commerce_product_categories",{name:`Hidden ${i}`,slug:`hidden-${i}`,isVisible:false,sortOrder:0,productCount:0,totalProductCount:0,createdAt:1,updatedAt:1});});
 let result=await read({showCounts:false});let chunks=1;
 expect(result.state).toBe("discovering");expect(result.items).toEqual([]);
 while(result.nextCursor){result=await read({showCounts:false,cursor:result.nextCursor});expect(++chunks).toBeLessThan(10);}
 expect(result.items.map(item=>item.slug)).toEqual(["home","field"]);
});
test("tampering refuses and changed source, policy, viewer, selection, epoch or time restarts",async()=>{
 const {t,ids,read}=await fixture();
 await t.run(async ctx=>{const source=(await ctx.db.get(ids.visible))!;const {_id,_creationTime,...fields}=source;for(let i=0;i<180;i++)await ctx.db.insert("commerce_products",{...fields,slug:`extra-${i}`});});
 const first=await read();const cursor=first.nextCursor!;
 await expect(read({cursor:cursor.replace('"counts":[','"counts":[999,')})).rejects.toThrow("Invalid catalog continuation");
 const state=(token:string)=>JSON.parse(token.slice(65));
 const initial=state(cursor);
 const checkRestart=async(args:object={},now=100,readContext=context,client=t)=>{
  const result=await client.run(ctx=>readCategoryTiles(ctx,{cursor,...args},undefined,undefined,now,readContext));
  const current=state(result.nextCursor!);expect(current.startedAt).toBe(now);expect(current.counts[0]).toBeLessThanOrEqual(initial.counts[0]+1);return result;
 };
 await checkRestart({categorySlugs:["home"]});
 await checkRestart({},100,{...context,documentId:"another-document"});
 await checkRestart({},100,context,t.withIdentity({subject:"different-viewer",issuer:"https://clerk.invalid"}));
 await checkRestart({},1000); // The previously excluded future product has now published.
 process.env[MEDIA_REVERSE_EPOCH_VARIABLE]="mi_ready_other_test_generation";await checkRestart();
 process.env[MEDIA_REVERSE_EPOCH_VARIABLE]="mi_ready_catalog_test_generation";
 await t.run(ctx=>recordCatalogWrite(ctx,"commerce_products","patch",{status:"draft"}));await checkRestart();
 await t.run(ctx=>recordCatalogWrite(ctx,"membership_restriction_rules","patch",{loginRequired:true}));await checkRestart();
 await expect(checkRestart({},100,{...context,scope:{...context.scope,instanceKey:"elsewhere"}})).rejects.toThrow("another installation");
});
test("category images require active image media and safe destinations",async()=>{
 const {t,ids,read}=await fixture();
 const image=await t.run(async ctx=>{const id=await ctx.db.insert("media",{title:"Category",fileName:"category.jpg",slug:"category-image",url:"https://images.example.invalid/category.jpg",mimeType:"image/jpeg",fileSize:1,mediaType:"image",status:"active",uploadedBy:ids.user,createdAt:1,updatedAt:1,altText:"A collection"});await ctx.db.patch(ids.root,{thumbnailMediaId:id});return id;});
 const args={categorySlugs:["home"],showCounts:false};
 expect((await read(args)).items[0]?.image?.alt).toBe("A collection");
 await t.run(ctx=>ctx.db.patch(image,{status:"trashed"}));expect((await read(args)).items[0]?.image).toBeNull();
 await t.run(ctx=>ctx.db.patch(image,{status:"active",url:"javascript:alert(1)"}));await expect(read(args)).rejects.toThrow();
});
