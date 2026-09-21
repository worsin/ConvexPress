import { test, expect } from "bun:test";
import { convexTest } from "convex-test";
import schema from "../../schema";
import { readAlbum } from "../album";
import { RequestReadLedger } from "../../helpers/requestReadLedger";
const modules = {"./convex/_generated/api.js":()=>import("../../_generated/api.js"),"./convex/_generated/server.js":()=>import("../../_generated/server.js"),"./convex/membership/policyReads.ts":()=>import("../../membership/policyReads")};
const scope={websiteKey:"album-site",instanceKey:"staging"};
async function fixture(count=3) {
  const t=convexTest({schema,modules});
  const ids=await t.run(async ctx=>{
    const user=await ctx.db.insert("users",{authSource:"local",email:"album@example.invalid",emailVerified:true,status:"active",createdAt:1,updatedAt:1});
    const setting=await ctx.db.insert("settings",{section:"plugins",values:{galleryEnabled:true,membershipEnabled:false},updatedAt:1,updatedBy:user});
    const album=await ctx.db.insert("gallery_albums",{title:"Along the coast",slug:"along-the-coast",description:"A quiet journey.",status:"publish",visibility:"public",authorId:user,categoryIds:[],layoutPreset:"grid",columnsDesktop:3,columnsTablet:2,columnsMobile:1,lightboxEnabled:true,captionsEnabled:true,downloadEnabled:false,itemCount:count,publishedAt:1,createdAt:1,updatedAt:1});
    const mediaIds=[], itemIds=[];
    for(let i=0;i<count;i++) {
      const media=await ctx.db.insert("media",{title:`Photo ${i}`,fileName:`photo-${i}.jpg`,slug:`photo-${i}`,mimeType:"image/jpeg",fileSize:100,mediaType:"image",url:`https://images.example.invalid/photo-${i}.jpg`,altText:`Coast ${i}`,status:"active",uploadedBy:user,createdAt:1,updatedAt:1});
      mediaIds.push(media);
      itemIds.push(await ctx.db.insert("gallery_albumItems",{albumId:album,mediaId:media,sortOrder:i,caption:`Coastal moment ${i}`,createdAt:1,updatedAt:1}));
    }
    return {user,setting,album,mediaIds,itemIds};
  });
  const read=(cursor:string|null=null)=>t.run(ctx=>readAlbum(ctx,{album:ids.album,cursor},scope,"page-1"));
  return {t,ids,read};
}
test("album returns ordered public images without account or storage metadata",async()=>{
  const {read,ids}=await fixture();const result=await read();
  expect(result.album).toMatchObject({id:ids.album,href:"/gallery/along-the-coast",downloadEnabled:false});
  expect(result.items.map(i=>i.caption)).toEqual(["Coastal moment 0","Coastal moment 1","Coastal moment 2"]);
  expect(result.nextCursor).toBeNull();
  for(const field of ["authorId","uploadedBy","storageId","itemCount","categoryIds","sortOrder"])expect(JSON.stringify(result)).not.toContain(field);
});
test("private, unpublished, future, wrong-table and disabled albums reveal no media",async()=>{
  const {t,ids,read}=await fixture();
  for(const patch of [{status:"draft"},{status:"private"},{status:"trash"},{status:"publish",visibility:"private"}] as const){await t.run(ctx=>ctx.db.patch(ids.album,patch));expect((await read()).album).toBeNull();expect((await read()).items).toEqual([]);}
  await t.run(ctx=>ctx.db.patch(ids.album,{status:"publish",visibility:"public",publishedAt:200}));
  const budget=new RequestReadLedger();expect((await t.run(ctx=>readAlbum(ctx,{album:ids.album},scope,"page-1",budget,undefined,100))).album).toBeNull();expect(budget.authorizationRecheckAt).toBe(200);
  await t.run(ctx=>ctx.db.patch(ids.album,{publishedAt:1}));await t.run(ctx=>ctx.db.patch(ids.setting,{values:{galleryEnabled:false}}));expect((await read()).album).toBeNull();
  expect((await t.run(ctx=>readAlbum(ctx,{album:ids.user},scope,"page-1"))).album).toBeNull();
});
test("both gallery route policies are enforced including subsequent pages",async()=>{
  const {t,ids,read}=await fixture(14);const cursor=(await read()).nextCursor!;
  await t.run(ctx=>ctx.db.patch(ids.setting,{values:{galleryEnabled:true,membershipEnabled:true}}));
  for(const route of ["/gallery","/gallery/along-the-coast"]){
    const rule=await t.run(ctx=>ctx.db.insert("membership_restriction_rules",{resourceType:"route",resourceIdOrKey:route,ruleMode:"allow_only",planIds:[],teaserMode:"hide",loginRequired:true,createdAt:1,updatedAt:1}));
    expect((await read(cursor))).toEqual({album:null,items:[],cursor,nextCursor:null});
    await t.run(ctx=>ctx.db.delete(rule));
  }
});
test("continuations reach every image exactly once including after 24 hidden uploads",async()=>{
  const {t,ids,read}=await fixture(53);
  await t.run(async ctx=>{for(const id of ids.mediaIds.slice(0,24))await ctx.db.patch(id,{status:"trashed"});});
  const first=await read();expect(first.items).toHaveLength(0);expect(first.nextCursor).not.toBeNull();
  const found:string[]=[];let cursor=first.nextCursor;let pages=0;
  do {const page=await read(cursor);found.push(...page.items.map(i=>i.id));cursor=page.nextCursor;pages++;expect(pages).toBeLessThan(6);}while(cursor);
  expect(found).toEqual(ids.itemIds.slice(24));expect(new Set(found).size).toBe(29);
});
test("cursor identity cannot cross sites, documents or albums",async()=>{
  const {t,ids,read}=await fixture(14);const cursor=(await read()).nextCursor!;
  for(const [s,document,album] of [[{...scope,instanceKey:"production"},"page-1",ids.album],[scope,"page-2",ids.album],[scope,"page-1",ids.user]] as const)
    await expect(t.run(ctx=>readAlbum(ctx,{album,cursor},s,document))).rejects.toThrow("another album, document or environment");
  await expect(read("not-json")).rejects.toThrow("Invalid album cursor");
});
test("media type, caption visibility, unsafe URLs and source sizes are checked",async()=>{
  const {t,ids,read}=await fixture();
  await t.run(async ctx=>{await ctx.db.patch(ids.mediaIds[0]!,{mimeType:"application/pdf"});await ctx.db.patch(ids.mediaIds[1]!,{status:"processing"});await ctx.db.patch(ids.album,{captionsEnabled:false});});
  expect((await read()).items).toHaveLength(1);expect((await read()).items[0]?.caption).toBeNull();
  await t.run(ctx=>ctx.db.patch(ids.itemIds[2]!,{linkUrl:"javascript:alert(1)"}));await expect(read()).rejects.toThrow();
  await t.run(ctx=>ctx.db.patch(ids.itemIds[2]!,{linkUrl:undefined,caption:"x".repeat(20000)}));await expect(read()).rejects.toThrow("source document budget");
});
