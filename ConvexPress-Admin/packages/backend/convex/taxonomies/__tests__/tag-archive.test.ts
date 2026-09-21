import {test,expect} from "bun:test";
import {convexTest} from "convex-test";
import {makeFunctionReference} from "convex/server";
import schema from "../../schema";
import {insertTermRelationship} from "../../helpers/postDiscovery";
const modules={"./convex/_generated/api.js":()=>import("../../_generated/api.js"),"./convex/_generated/server.js":()=>import("../../_generated/server.js"),"./convex/taxonomyArchives.ts":()=>import("../../taxonomyArchives"),"./convex/membership/policyReads.ts":()=>import("../../membership/policyReads")};
const endpoint=makeFunctionReference<"query">("taxonomyArchives:tag");
async function fixture(){
 const t=convexTest({schema,modules});
 const ids=await t.run(async ctx=>{
  await ctx.db.insert("convexpress_siteIdentity",{identityKey:"site-identity",websiteKey:"fixture",instanceKey:"stage",environmentKind:"staging",deploymentOrigin:"https://fixture.convex.cloud",managementOrigin:"https://fixture.convex.site",siteOrigin:"https://fixture.invalid",siteContractVersion:"1",schemaVersion:"1",engineVersion:"1",managementCapabilities:[],initializedAt:1,updatedAt:1});
  const user=await ctx.db.insert("users",{authSource:"local",email:"author@example.invalid",emailVerified:true,status:"active",displayName:"Writer",createdAt:1,updatedAt:1});
  await ctx.db.insert("settings",{section:"plugins",values:{membershipEnabled:false},updatedAt:1,updatedBy:user});
  await ctx.db.insert("settings",{section:"reading",values:{postsPerPage:2},updatedAt:1,updatedBy:user});
  const tag=await ctx.db.insert("terms",{name:"Making",slug:"making",taxonomy:"post_tag",count:999999,description:"Studio stories",isDefault:false,createdAt:1,updatedAt:1,createdBy:"PRIVATE_OWNER",wpTermId:876543});
  const posts=[];
  for(let i=0;i<5;i++){
   const id=await ctx.db.insert("posts",{type:"post",title:`Story ${i}`,slug:`story-${i}`,content:"PRIVATE_BODY",pagePrompt:"PRIVATE_PROMPT",status:"publish",visibility:i===4?"private":"public",publishedAt:100+i,authorId:user,commentStatus:"closed",createdAt:1,updatedAt:1});
   await insertTermRelationship(ctx,{postId:id,termId:tag});posts.push(id);
  }
  for(let i=0;i<300;i++)await ctx.db.insert("posts",{type:"post",title:`Unrelated ${i}`,slug:`other-${i}`,status:"publish",visibility:"public",publishedAt:1000+i,authorId:user,commentStatus:"closed",createdAt:1,updatedAt:1});
  return{user,tag,posts};
 });return{t,ids};
}
test("registered archive uses bounded indexed pages and returns no cached counts, source bodies or private term fields",async()=>{
 const{t}=await fixture();let cursor:string|undefined;const titles:string[]=[];
 for(let page=0;page<6;page++){
  const result=await t.query(endpoint,{slug:"making",instanceKey:"stage",...(cursor?{cursor}:{})});
  expect(result.items.length).toBeLessThanOrEqual(2);titles.push(...result.items.map((item:any)=>item.title));
  for(const secret of ["PRIVATE_BODY","PRIVATE_PROMPT","PRIVATE_OWNER","999999","876543","Unrelated"])expect(JSON.stringify(result)).not.toContain(secret);
  cursor=result.nextCursor??undefined;if(!cursor)break;
 }
 expect(cursor).toBeUndefined();expect(titles).toEqual(["Story 3","Story 2","Story 1","Story 0"]);
});
test("archive enforces current route membership, installation and malformed input",async()=>{
 const{t,ids}=await fixture();
 await expect(t.query(endpoint,{slug:"making",instanceKey:"other"})).rejects.toThrow("SCOPE_MISMATCH");
 expect(await t.query(endpoint,{slug:"missing",instanceKey:"stage"})).toBeNull();
 await expect(t.query(endpoint,{slug:"making",instanceKey:"stage",cursor:"x".repeat(4097)})).rejects.toThrow();
 await t.run(async ctx=>{
  const settings=await ctx.db.query("settings").withIndex("by_section",q=>q.eq("section","plugins")).unique();await ctx.db.patch("settings",settings!._id,{values:{membershipEnabled:true}});
  const plan=await ctx.db.insert("membership_plans",{title:"Members",slug:"members",status:"active",grantMode:"manual",priority:1,createdAt:1,updatedAt:1});
  await ctx.db.insert("membership_restriction_rules",{resourceType:"route",resourceIdOrKey:"/tag/making",ruleMode:"allow_only",planIds:[plan],teaserMode:"excerpt",loginRequired:true,createdAt:1,updatedAt:1});
 });
 expect(await t.query(endpoint,{slug:"making",instanceKey:"stage"})).toBeNull();
});
test("changed page-size preferences offer a restart; private-only tags disclose no metadata",async()=>{
 const{t,ids}=await fixture();const first=await t.query(endpoint,{slug:"making",instanceKey:"stage"});
 await t.run(async ctx=>{const setting=await ctx.db.query("settings").withIndex("by_section",q=>q.eq("section","reading")).unique();await ctx.db.patch("settings",setting!._id,{values:{postsPerPage:3}});});
 const changed=await t.query(endpoint,{slug:"making",instanceKey:"stage",cursor:first.nextCursor});expect(changed.resetRequired).toBe(true);expect(changed.tag).toBeNull();expect(changed.items).toEqual([]);
 await t.run(async ctx=>{for(const id of ids.posts)await ctx.db.patch("posts",id,{visibility:"private"});});
 const privateOnly=await t.query(endpoint,{slug:"making",instanceKey:"stage"});expect(privateOnly.tag).toBeNull();expect(privateOnly.items).toEqual([]);expect(JSON.stringify(privateOnly)).not.toContain("Studio stories");
});

test("more than ten thousand inaccessible imported relationships cannot hide later accessible posts",async()=>{
 const{t,ids}=await fixture();
 await t.run(async ctx=>{
  for(let i=0;i<10010;i++)await ctx.db.insert("termRelationships",{postId:ids.posts[4]!,termId:ids.tag,discoveryReady:true,discoveryEligible:true,discoveryPublishedAt:10000+i,discoveryAuthorId:ids.user});
 });
 let cursor:string|undefined;let pages=0;const titles:string[]=[];
 do {
  const result=await t.query(endpoint,{slug:"making",instanceKey:"stage",...(cursor?{cursor}:{})});
  titles.push(...result.items.map((item:any)=>item.title));
  if(!result.items.length)expect(result.tag).toBeNull();
  cursor=result.nextCursor??undefined;
  if(++pages>160)throw Error("Archive cursor did not converge");
 }while(cursor);
 expect(pages).toBeGreaterThan(100);expect(titles).toEqual(["Story 3","Story 2","Story 1","Story 0"]);
},15000);


test("archive accepts the full Reading Settings range and still bounds each read",async()=>{
 const{t}=await fixture();
 for(const postsPerPage of [49,100]){
  await t.run(async ctx=>{const setting=await ctx.db.query("settings").withIndex("by_section",q=>q.eq("section","reading")).unique();await ctx.db.patch("settings",setting!._id,{values:{postsPerPage}});});
  const result=await t.query(endpoint,{slug:"making",instanceKey:"stage"});
  expect(result.items.map((item:any)=>item.title)).toEqual(["Story 3","Story 2","Story 1","Story 0"]);
  expect(result.nextCursor).toBeNull();
 }
});


test("large archive preferences preserve bounded continuation through every accessible story",async()=>{
 const{t,ids}=await fixture();
 await t.run(async ctx=>{
  const setting=await ctx.db.query("settings").withIndex("by_section",q=>q.eq("section","reading")).unique();await ctx.db.patch("settings",setting!._id,{values:{postsPerPage:100}});
  for(let i=0;i<110;i++){
   const id=await ctx.db.insert("posts",{type:"post",title:`Archive ${i}`,slug:`archive-${i}`,status:"publish",visibility:"public",publishedAt:2000+i,authorId:ids.user,commentStatus:"closed",createdAt:1,updatedAt:1});
   await insertTermRelationship(ctx,{postId:id,termId:ids.tag});
  }
 });
 let cursor:string|undefined;const seen=new Set<string>();let largest=0;
 for(let i=0;i<10;i++){
  const result=await t.query(endpoint,{slug:"making",instanceKey:"stage",...(cursor?{cursor}:{})});
  largest=Math.max(largest,result.items.length);expect(result.items.length).toBeLessThanOrEqual(100);
  for(const item of result.items){expect(seen.has(item.id)).toBe(false);seen.add(item.id);}
  cursor=result.nextCursor??undefined;if(!cursor)break;
 }
 expect(cursor).toBeUndefined();expect(seen.size).toBe(114);expect(largest).toBeGreaterThan(0);expect(largest).toBeLessThan(100);
});
