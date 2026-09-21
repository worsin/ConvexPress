import {test,expect} from "bun:test";
import {convexTest} from "convex-test";
import {makeFunctionReference as ref} from "convex/server";
import schema from "../../schema";
import {parseShowcasePublication,showcaseFingerprint,SHOWCASE_META_PREFIX} from "../showcasePolicy";
const modules={"./convex/_generated/api.js":()=>import("../../_generated/api.js"),"./convex/_generated/server.js":()=>import("../../_generated/server.js"),"./convex/media/showcase.ts":()=>import("../showcase"),"./convex/media/queries.ts":()=>import("../queries")};
const approve=ref<"mutation">("media/showcase:approve"),revoke=ref<"mutation">("media/showcase:revoke"),get=ref<"query">("media/showcase:get");
export async function showcaseFixture(){
 const t=convexTest({schema,modules});
 const ids=await t.run(async ctx=>{
  const role=await ctx.db.insert("roles",{name:"Moderator",slug:"moderator",description:"Fixture",level:10,type:"internal",isDefault:false,isProtected:false,capabilities:["manage_options","media.read"],pageAccess:[],status:"active",createdAt:1,updatedAt:1});
  const user=await ctx.db.insert("users",{authSource:"local",email:"moderator@example.invalid",emailVerified:true,status:"active",roleId:role,createdAt:1,updatedAt:1});
  const customer=await ctx.db.insert("users",{authSource:"clerk",clerkUserId:"showcase-customer",email:"customer@example.invalid",emailVerified:true,status:"active",createdAt:1,updatedAt:1});
  const site=await ctx.db.insert("convexpress_siteIdentity",{identityKey:"site-identity",websiteKey:"showcase",instanceKey:"showcase-staging",environmentKind:"staging",deploymentOrigin:"https://showcase.convex.cloud",managementOrigin:"https://controller.convex.cloud",siteOrigin:"https://showcase.convex.site",siteContractVersion:"1",schemaVersion:"2026.9.0",engineVersion:"1",managementCapabilities:[],initializedAt:1,updatedAt:1});
  const media=await ctx.db.insert("media",{title:"Public image",fileName:"image.jpg",slug:"image",url:"https://images.example.invalid/image.jpg",mimeType:"image/jpeg",fileSize:100,mediaType:"image",status:"active",uploadedBy:user,createdAt:1,updatedAt:1});
  const tag=await ctx.db.insert("terms",{name:"In the wild",slug:"in-the-wild",taxonomy:"post_tag",count:0,isDefault:false,createdAt:1,updatedAt:1});
  return {role,user,customer,site,media,tag};
 });
 const operator=t.withIdentity({subject:ids.user,tokenIdentifier:`https://convexpress-admin.local|${ids.user}`});
 const customer=t.withIdentity({subject:"showcase-customer",tokenIdentifier:"https://clerk.example|showcase-customer"});
 const args={mediaId:ids.media,tagId:ids.tag,creditName:"Mara",creditUrl:"https://example.invalid/mara",altText:"A hand-thrown cup in morning light",caption:"A quiet morning",rightsBasis:"permission",permissionNote:"PRIVATE_PERMISSION_NOTE",expiresAt:null,expectedMediaUpdatedAt:1,expectedRevision:null};
 return {t,ids,operator,customer,args};
}
test("only an active authorized moderator can inspect, approve or revoke image permissions",async()=>{
 const {t,ids,operator,customer,args}=await showcaseFixture();
 for(const actor of [t,customer]){
  await expect(actor.mutation(approve,args)).rejects.toThrow();
  await expect(actor.query(get,{mediaId:ids.media,tagId:ids.tag})).rejects.toThrow();
  await expect(actor.mutation(revoke,{mediaId:ids.media,tagId:ids.tag,expectedRevision:null})).rejects.toThrow();
 }
 await operator.mutation(approve,args);expect((await operator.query(get,{mediaId:ids.media,tagId:ids.tag}))?.approved).toBe(true);
 await t.run(ctx=>ctx.db.patch("users",ids.user,{status:"banned"}));await expect(operator.mutation(approve,args)).rejects.toThrow();
});
test("approval is target-owned, invalidates after media edits and revocation keeps private evidence",async()=>{
 const {t,ids,operator,args}=await showcaseFixture();await operator.mutation(approve,args);
 expect(await operator.query(get,{mediaId:ids.media,tagId:ids.tag})).toMatchObject({approved:true,needsReview:false});
 await t.run(ctx=>ctx.db.patch("media",ids.media,{updatedAt:2,url:"https://images.example.invalid/replaced.jpg"}));
 expect((await operator.query(get,{mediaId:ids.media,tagId:ids.tag}))?.needsReview).toBe(true);await expect(operator.mutation(approve,args)).rejects.toThrow("image changed");
 await operator.mutation(approve,{...args,expectedMediaUpdatedAt:2,expectedRevision:1});
 await t.run(ctx=>ctx.db.patch("convexpress_siteIdentity",ids.site,{instanceKey:"another-instance"}));
 expect((await operator.query(get,{mediaId:ids.media,tagId:ids.tag}))?.needsReview).toBe(true);
 await operator.mutation(revoke,{mediaId:ids.media,tagId:ids.tag,expectedRevision:2});expect(await operator.query(get,{mediaId:ids.media,tagId:ids.tag})).toMatchObject({approved:false,permissionNote:"PRIVATE_PERMISSION_NOTE"});
});
test("permission evidence never appears in general media metadata or audit payloads",async()=>{
 const {t,ids,operator,args}=await showcaseFixture();await operator.mutation(approve,args);
 const media=await operator.query(ref("media/queries:get"),{mediaId:ids.media});expect(JSON.stringify(media)).not.toContain("PRIVATE_PERMISSION_NOTE");expect(media.meta).toEqual([]);
 const events=await t.run(ctx=>ctx.db.query("events").collect());expect(events.length).toBeGreaterThan(0);expect(JSON.stringify(events)).not.toContain("PRIVATE_PERMISSION_NOTE");
});
test("invalid inputs, expired grants, inactive media and categories cannot be approved",async()=>{
 const {t,ids,operator,args}=await showcaseFixture();
 for(const patch of [{permissionNote:""},{creditUrl:"javascript:alert(1)"},{creditUrl:"https://user:pass@example.invalid"},{expiresAt:Date.now()-1},{altText:""}])await expect(operator.mutation(approve,{...args,...patch})).rejects.toThrow();
 await t.run(ctx=>ctx.db.patch("terms",ids.tag,{taxonomy:"category"}));await expect(operator.mutation(approve,args)).rejects.toThrow("site tag");
 await t.run(ctx=>ctx.db.patch("terms",ids.tag,{taxonomy:"post_tag"}));await t.run(ctx=>ctx.db.patch("media",ids.media,{status:"trashed"}));await expect(operator.mutation(approve,args)).rejects.toThrow("active");
 expect(parseShowcasePublication('{"approved":true}')).toBeNull();expect(parseShowcasePublication("x".repeat(9000))).toBeNull();
});
test("approval upserts one tag pair, audits transitions, and paginates all site tags",async()=>{
 const {t,ids,operator,args}=await showcaseFixture();await operator.mutation(approve,args);await operator.mutation(approve,{...args,caption:"Revised caption",expectedRevision:1});
 const metadata=await t.run(ctx=>ctx.db.query("mediaMeta").collect());expect(metadata).toHaveLength(1);expect(metadata[0]?.key).toBe(SHOWCASE_META_PREFIX+ids.tag);
 const source=await t.run(ctx=>ctx.db.get("media",ids.media));expect(parseShowcasePublication(metadata[0]!.value)?.fingerprint).toBe(showcaseFingerprint(source!));
 await t.run(async ctx=>{for(let i=0;i<30;i++)await ctx.db.insert("terms",{name:`Tag ${i}`,slug:`tag-${i}`,taxonomy:"post_tag",count:0,isDefault:false,createdAt:1,updatedAt:1});});
 let cursor:string|null=null;const seen=new Set<string>();
 do{const result=await operator.query(ref("media/showcase:tags"),{paginationOpts:{numItems:10,cursor}});for(const tag of result.page)seen.add(tag.id);cursor=result.isDone?null:result.continueCursor;}while(cursor);
 expect(seen.size).toBe(31);
});

test("stale moderation forms cannot overwrite or revoke a newer approval",async()=>{const {operator,args,ids}=await showcaseFixture();await operator.mutation(approve,args);await expect(operator.mutation(approve,args)).rejects.toThrow("approval changed");await expect(operator.mutation(revoke,{mediaId:ids.media,tagId:ids.tag,expectedRevision:null})).rejects.toThrow("approval changed");expect((await operator.query(get,{mediaId:ids.media,tagId:ids.tag}))?.approved).toBe(true);});
