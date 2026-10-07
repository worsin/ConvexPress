import { test, expect } from "bun:test";
import { convexTest } from "convex-test";
import { makeFunctionReference } from "convex/server";
import schema from "../../schema";
const modules = {"./convex/_generated/api.js":()=>import("../../_generated/api.js"),"./convex/_generated/server.js":()=>import("../../_generated/server.js"),"./convex/membership/policyReads.ts":()=>import("../../membership/policyReads"),"./convex/gallery/queries.ts":()=>import("../queries")};
const endpoint = (name:string) => makeFunctionReference<"query">(`gallery/queries:${name}`);
async function fixture(count=3) {
  const t=convexTest({schema,modules});
  const ids=await t.run(async ctx=>{
    const user=await ctx.db.insert("users",{authSource:"local",email:"album@example.invalid",emailVerified:true,status:"active",createdAt:1,updatedAt:1});
    const setting=await ctx.db.insert("settings",{section:"plugins",values:{galleryEnabled:true,membershipEnabled:true},updatedAt:1,updatedBy:user});
    const album=await ctx.db.insert("gallery_albums",{title:"Along the coast",slug:"along-the-coast",description:"A quiet journey.",status:"publish",visibility:"public",authorId:user,categoryIds:[],layoutPreset:"grid",columnsDesktop:3,columnsTablet:2,columnsMobile:1,lightboxEnabled:true,captionsEnabled:true,downloadEnabled:false,itemCount:count,publishedAt:1,createdAt:1,updatedAt:1});
    const mediaIds=[], itemIds=[];
    for(let i=0;i<count;i++) {
      const media=await ctx.db.insert("media",{title:`Photo ${i}`,fileName:`photo-${i}.jpg`,slug:`photo-${i}`,mimeType:"image/jpeg",fileSize:100,mediaType:"image",url:`https://images.example.invalid/photo-${i}.jpg`,altText:`Coast ${i}`,status:"active",uploadedBy:user,createdAt:1,updatedAt:1});
      mediaIds.push(media);
      itemIds.push(await ctx.db.insert("gallery_albumItems",{albumId:album,mediaId:media,sortOrder:i,caption:`Coastal moment ${i}`,createdAt:1,updatedAt:1}));
    }
    return {user,setting,album,mediaIds,itemIds};
  });
  return {t,ids};
}

async function expectHidden(t: Awaited<ReturnType<typeof fixture>>["t"], albumId:string) {
  expect(await t.query(endpoint("getBySlug"),{slug:"along-the-coast"})).toBeNull();
  expect(await t.query(endpoint("getEmbed"),{albumId})).toBeNull();
  expect(await t.query(endpoint("getEmbed"),{slug:"along-the-coast"})).toBeNull();
  const list = await t.query(endpoint("listPublished"),{});
  expect(list.albums).toEqual([]); expect(list.total).toBe(0);
}
test("public album detail, embeds and archive enforce collection and destination policy, then recover", async()=>{
  const {t,ids}=await fixture();
  for(const route of ["/gallery","/gallery/along-the-coast","/gallery/*"]) {
    const rule=await t.run(ctx=>ctx.db.insert("membership_restriction_rules",{resourceType:"route",resourceIdOrKey:route,ruleMode:"allow_only",planIds:[],teaserMode:"hide",loginRequired:true,createdAt:1,updatedAt:1}));
    await expectHidden(t,ids.album);
    const viewer=t.withIdentity({issuer:"https://convexpress-admin.local",subject:ids.user});
    expect((await viewer.query(endpoint("getBySlug"),{slug:"along-the-coast"}))._id).toBe(ids.album);
    expect((await viewer.query(endpoint("getEmbed"),{albumId:ids.album})).items).toHaveLength(3);
    expect((await viewer.query(endpoint("listPublished"),{})).total).toBe(1);
    await t.run(ctx=>ctx.db.delete(rule));
    expect((await t.query(endpoint("getBySlug"),{slug:"along-the-coast"})).items).toHaveLength(3);
  }
});
test("unpublished, private and future albums stay out of every public album read",async()=>{
  const {t,ids}=await fixture();
  for(const patch of [{status:"draft"},{status:"trash"},{status:"publish",visibility:"private"},{visibility:"public",publishedAt:Date.now()+600000}] as const){
    await t.run(ctx=>ctx.db.patch(ids.album,patch)); await expectHidden(t,ids.album);
  }
  await t.run(ctx=>ctx.db.patch(ids.album,{publishedAt:1}));
  await t.run(ctx=>ctx.db.patch(ids.setting,{values:{galleryEnabled:false,membershipEnabled:true}}));
  expect(await t.query(endpoint("getBySlug"),{slug:"along-the-coast"})).toBeNull();
  expect(await t.query(endpoint("getEmbed"),{albumId:ids.album})).toBeNull();
  expect(await t.query(endpoint("listPublished"),{})).toBeNull();
});
test("disabling membership restores public albums without overriding publication rules",async()=>{
 const {t,ids}=await fixture();
 await t.run(ctx=>ctx.db.insert("membership_restriction_rules",{resourceType:"route",resourceIdOrKey:"/gallery",ruleMode:"allow_only",planIds:[],teaserMode:"hide",loginRequired:true,createdAt:1,updatedAt:1}));
 await expectHidden(t,ids.album);
 await t.run(ctx=>ctx.db.patch(ids.setting,{values:{galleryEnabled:true,membershipEnabled:false}}));
 expect((await t.query(endpoint("listPublished"),{})).total).toBe(1);
 expect((await t.query(endpoint("getEmbed"),{albumId:ids.album})).items).toHaveLength(3);
});
