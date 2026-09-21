import {test,expect} from "bun:test";
import {convexTest} from "convex-test";
import {makeFunctionReference} from "convex/server";
import schema from "../../schema";
import {insertTermRelationship} from "../../helpers/postDiscovery";
const archive=makeFunctionReference<"query">("categoryArchives:read");
const children=makeFunctionReference<"query">("categoryArchives:children");
const modules={"./convex/_generated/api.js":()=>import("../../_generated/api.js"),"./convex/_generated/server.js":()=>import("../../_generated/server.js"),"./convex/categoryArchives.ts":()=>import("../../categoryArchives"),"./convex/membership/policyReads.ts":()=>import("../../membership/policyReads")};
async function fixture(){
 const t=convexTest({schema,modules});
 const ids=await t.run(async ctx=>{
  await ctx.db.insert("convexpress_siteIdentity",{identityKey:"site-identity",websiteKey:"fixture",instanceKey:"stage",environmentKind:"staging",deploymentOrigin:"https://fixture.convex.cloud",managementOrigin:"https://fixture.convex.site",siteOrigin:"https://fixture.invalid",siteContractVersion:"1",schemaVersion:"1",engineVersion:"1",managementCapabilities:[],initializedAt:1,updatedAt:1});
  const author=await ctx.db.insert("users",{email:"writer@example.invalid",emailVerified:true,status:"active",authSource:"local",createdAt:1,updatedAt:1});
  await ctx.db.insert("settings",{section:"plugins",values:{membershipEnabled:true},updatedAt:1,updatedBy:author});
  await ctx.db.insert("settings",{section:"reading",values:{postsPerPage:1},updatedAt:1,updatedBy:author});
  const term={taxonomy:"category" as const,count:123456,isDefault:false,createdAt:1,updatedAt:1,createdBy:"PRIVATE_OWNER"};
  const parent=await ctx.db.insert("terms",{...term,name:"Studio",slug:"studio"});
  const category=await ctx.db.insert("terms",{...term,name:"Materials",slug:"materials",parentId:parent,description:"Our materials"});
  const childIds=[];
  for(let i=0;i<65;i++)childIds.push(await ctx.db.insert("terms",{...term,name:`Child ${String(i).padStart(3,"0")}`,slug:`child-${i}`,parentId:category}));
  for(let i=0;i<3;i++){
   const post=await ctx.db.insert("posts",{type:"post",title:`Story ${i}`,slug:`story-${i}`,status:"publish",visibility:i===2?"private":"public",publishedAt:100+i,authorId:author,commentStatus:"closed",createdAt:1,updatedAt:1});
   await insertTermRelationship(ctx,{postId:post,termId:category});
  }
  await ctx.db.insert("membership_restriction_rules",{resourceType:"route",resourceIdOrKey:"/category/child-0",ruleMode:"allow_only",planIds:[],loginRequired:true,teaserMode:"hide",createdAt:1,updatedAt:1});
  return {parent,category,childIds};
 });return {t,ids};
}
test("category archive uses current public cards, closed metadata and route-checked ancestors",async()=>{
 const{t,ids}=await fixture();
 const first=await t.query(archive,{slug:"materials",instanceKey:"stage"});
 expect(first.category.name).toBe("Materials");expect(first.ancestors.map((a:any)=>a.name)).toEqual(["Studio"]);expect(first.items.map((p:any)=>p.title)).toEqual(["Story 1"]);
 const next=await t.query(archive,{slug:"materials",instanceKey:"stage",cursor:first.nextCursor});expect(next.items.map((p:any)=>p.title)).toEqual(["Story 0"]);
 expect(JSON.stringify(first)).not.toContain("PRIVATE_OWNER");expect(JSON.stringify(first)).not.toContain("123456");
 await t.run(ctx=>ctx.db.insert("membership_restriction_rules",{resourceType:"route",resourceIdOrKey:"/category/studio",ruleMode:"allow_only",planIds:[],loginRequired:true,teaserMode:"hide",createdAt:1,updatedAt:1}));
 expect((await t.query(archive,{slug:"materials",instanceKey:"stage"})).ancestors).toEqual([]);
 await expect(t.query(archive,{slug:"materials",instanceKey:"production"})).rejects.toThrow("SCOPE_MISMATCH");
});
test("child pages traverse all permitted siblings without exposing denied labels or cached counts",async()=>{
 const{t}=await fixture();let cursor:string|undefined;const names:string[]=[];
 for(let i=0;i<20;i++){
  const page=await t.query(children,{slug:"materials",instanceKey:"stage",...(cursor?{cursor}:{})});
  expect(page.items.length).toBeLessThanOrEqual(20);expect(JSON.stringify(page)).not.toContain("Child 000");expect(JSON.stringify(page)).not.toContain("PRIVATE_OWNER");expect(JSON.stringify(page)).not.toContain("123456");
  names.push(...page.items.map((c:any)=>c.name));cursor=page.nextCursor??undefined;if(!cursor)break;
 }
 expect(cursor).toBeUndefined();expect(names).toEqual(Array.from({length:64},(_,i)=>`Child ${String(i+1).padStart(3,"0")}`));
});
test("deleted or moved child cursors restart; scope tampering and broken hierarchy refuse",async()=>{
 const{t,ids}=await fixture();const first=await t.query(children,{slug:"materials",instanceKey:"stage"});
 await expect(t.query(children,{slug:"studio",instanceKey:"stage",cursor:first.nextCursor})).rejects.toThrow("CATEGORY_CURSOR_SCOPE");
 const continuation=JSON.parse(first.nextCursor);
 await t.run(ctx=>ctx.db.delete("terms",continuation.termId));
 expect((await t.query(children,{slug:"materials",instanceKey:"stage",cursor:first.nextCursor})).resetRequired).toBe(true);
 await t.run(ctx=>ctx.db.patch("terms",ids.parent,{parentId:ids.category}));
 await expect(t.query(archive,{slug:"materials",instanceKey:"stage"})).rejects.toThrow("CATEGORY_HIERARCHY");
});


test("category route revocation denies both archive and child pages; renamed continuation restarts",async()=>{
 const{t}=await fixture();const first=await t.query(children,{slug:"materials",instanceKey:"stage"});
 const cursor=JSON.parse(first.nextCursor);
 await t.run(ctx=>ctx.db.patch("terms",cursor.termId,{name:"Renamed child"}));
 expect((await t.query(children,{slug:"materials",instanceKey:"stage",cursor:first.nextCursor})).resetRequired).toBe(true);
 await t.run(ctx=>ctx.db.insert("membership_restriction_rules",{resourceType:"route",resourceIdOrKey:"/category/materials",ruleMode:"allow_only",planIds:[],loginRequired:true,teaserMode:"hide",createdAt:1,updatedAt:1}));
 for(const endpoint of [archive,children])expect(await t.query(endpoint,{slug:"materials",instanceKey:"stage"})).toBeNull();
});
