import { canonicalPostBody } from "../../__tests__/canonicalPostFixture";
import {test,expect} from "bun:test";
import {convexTest} from "convex-test";
import {makeFunctionReference} from "convex/server";
import schema from "../../schema";
import {readDateArchiveGroups,readDateArchivePosts} from "../dateArchive";
import {RequestReadLedger} from "../../helpers/requestReadLedger";
import {archivePeriod,archiveHref} from "../foundation/archiveContracts";
const modules={"./convex/posts/queries.ts":()=>import("../../posts/queries"),"./convex/_generated/api.js":()=>import("../../_generated/api.js"),"./convex/_generated/server.js":()=>import("../../_generated/server.js"),"./convex/membership/policyReads.ts":()=>import("../../membership/policyReads"),"./convex/dateArchives.ts":()=>import("../../dateArchives")};
const scope={websiteKey:"archive",instanceKey:"stage"};
async function fixture(times:number[],zone="UTC") {
 const t=convexTest({schema,modules});const ids=await t.run(async ctx=>{
  const user=await ctx.db.insert("users",{authSource:"local",email:"archive@example.invalid",emailVerified:true,status:"active",createdAt:1,updatedAt:1});
  const general=await ctx.db.insert("settings",{section:"general",values:{timezone:zone},updatedAt:1,updatedBy:user});
  const plugins=await ctx.db.insert("settings",{section:"plugins",values:{membershipEnabled:false},updatedAt:1,updatedBy:user});
  await ctx.db.insert("convexpress_siteIdentity",{identityKey:"site-identity",...scope,environmentKind:"staging",deploymentOrigin:"https://archive.convex.cloud",managementOrigin:"https://archive.convex.site",siteOrigin:"https://archive.example.invalid",siteContractVersion:"1",schemaVersion:"1",engineVersion:"1",managementCapabilities:[],initializedAt:1,updatedAt:1});
  const posts=[];for(const [i,publishedAt] of times.entries())posts.push(await ctx.db.insert("posts",{type:"post",title:`Story ${i}`,slug:`story-${i}`,...canonicalPostBody("PRIVATE SOURCE BODY"),status:"publish",visibility:"public",authorId:user,commentStatus:"closed",publishedAt,createdAt:1,updatedAt:1}));return {user,general,plugins,posts};
 });return {t,ids,groups:(args:unknown={})=>t.run(ctx=>readDateArchiveGroups(ctx,args,scope,"current-page")),posts:(year:number,month:number|null,cursor:string|null=null,limit=2)=>t.run(ctx=>readDateArchivePosts(ctx,{year,month,cursor,limit},scope))};
}
const at=(date:string)=>Date.parse(date);
test("archive skips a busy period and returns each visible month and year once",async()=>{
 const times=[...Array.from({length:120},(_,i)=>at("2026-03-01T00:00:00Z")+i),at("2026-02-01T00:00:00Z"),at("2025-12-31T23:59:59Z")];
 const {t,groups}=await fixture(times),budget=new RequestReadLedger();
 const result=await t.run(ctx=>readDateArchiveGroups(ctx,{limit:48},scope,"current-page",budget));
 expect(result.items.map(item=>item.href)).toEqual([archiveHref(2026,3),archiveHref(2026,2),archiveHref(2025,12)]);expect(result.nextCursor).toBeNull();expect(budget.documents).toBeLessThan(30);
 const first=await groups({groupBy:"year",limit:1});expect(first.items.map(item=>item.year)).toEqual([2026]);
 const next=await groups({groupBy:"year",limit:1,cursor:first.nextCursor});expect(next.items.map(item=>item.year)).toEqual([2025]);
});
test("site time zone controls DST period boundaries and links",async()=>{
 const {groups,posts}=await fixture([at("2026-03-01T06:59:59Z"),at("2026-03-01T07:00:00Z"),at("2026-04-01T05:59:59Z"),at("2026-04-01T06:00:00Z")],"America/Denver");
 expect((await groups()).items.map(i=>i.month)).toEqual([4,3,2]);
 const march=await posts(2026,3);expect(march.items.map(i=>i.title)).toEqual(["Story 2","Story 1"]);
 expect(archivePeriod(2026,3,"America/Denver").endsAt-archivePeriod(2026,3,"America/Denver").startsAt).toBe(31*86400000-3600000);
 expect((await posts(2026,null,null,48)).items).toHaveLength(4);
});
test("private, password, draft, future and membership denied posts cannot reveal periods",async()=>{
 const {t,ids,groups}=await fixture([1,at("2026-02-01"),at("2026-03-01"),at("2026-04-01"),at("2026-05-01")]);
 await t.run(async ctx=>{
  await ctx.db.patch(ids.posts[0]!,{visibility:"private"});await ctx.db.patch(ids.posts[1]!,{visibility:"password"});await ctx.db.patch(ids.posts[2]!,{status:"draft"});await ctx.db.patch(ids.posts[3]!,{publishedAt:Date.now()+86400000});
  await ctx.db.patch(ids.plugins,{values:{membershipEnabled:true}});await ctx.db.insert("membership_restriction_rules",{resourceType:"route",resourceIdOrKey:"/blog/story-4",ruleMode:"allow_only",planIds:[],teaserMode:"hide",loginRequired:true,createdAt:1,updatedAt:1});
 });expect((await groups()).items).toEqual([]);
});
test("scan-only pages continue past denied candidates and scope/zone changes invalidate cursors",async()=>{
 const {t,ids,groups}=await fixture(Array.from({length:70},(_,i)=>at("2026-03-01")+i));
 await t.run(async ctx=>{await ctx.db.patch(ids.plugins,{values:{membershipEnabled:true}});for(let i=6;i<70;i++)await ctx.db.insert("membership_restriction_rules",{resourceType:"route",resourceIdOrKey:`/blog/story-${i}`,ruleMode:"allow_only",planIds:[],teaserMode:"hide",loginRequired:true,createdAt:1,updatedAt:1});});
 const first=await groups();expect(first.items).toEqual([]);expect(first.nextCursor).not.toBeNull();
 let cursor=first.nextCursor,found=false;for(let i=0;i<5&&cursor;i++){const page=await groups({cursor});found ||= page.items.length>0;cursor=page.nextCursor;}expect(found).toBe(true);
 await expect(t.run(ctx=>readDateArchiveGroups(ctx,{cursor:first.nextCursor},{...scope,instanceKey:"other"},"current-page"))).rejects.toThrow("another date selection");
 await t.run(ctx=>ctx.db.patch(ids.general,{values:{timezone:"America/Denver"}}));await expect(groups({cursor:first.nextCursor})).rejects.toThrow("another date selection");
});
test("period pages paginate all current accessible posts without private body fields",async()=>{
 const {ids,posts,t}=await fixture(Array.from({length:7},(_,i)=>at("2026-03-01")+i));
 const found:string[]=[];let cursor:string|null=null;
 do{const page=await posts(2026,3,cursor);expect(JSON.stringify(page)).not.toContain("PRIVATE SOURCE BODY");found.push(...page.items.map(i=>i.id));cursor=page.nextCursor;}while(cursor);
 expect(found).toEqual([...ids.posts].reverse());const first=await posts(2026,3);await t.run(ctx=>ctx.db.patch(ids.posts[4]!,{visibility:"private"}));
 const next=await posts(2026,3,first.nextCursor);expect(next.items.map(i=>i.id)).not.toContain(ids.posts[4]!);
 await expect(posts(2026,2,first.nextCursor)).rejects.toThrow();
 expect((await posts(2099,1)).items).toEqual([]);
});
test("registered archive checks environment and route access and rejects incomplete date filters",async()=>{
 const {t,ids}=await fixture([at("2026-03-01")]);const ref=makeFunctionReference<"query">("dateArchives:read");
 const first=await t.query(ref,{instanceKey:scope.instanceKey});expect(first.groups[0].href).toBe("/archive?year=2026&month=3");
 const march=await t.query(ref,{instanceKey:scope.instanceKey,year:2026,month:3});expect(march.items).toHaveLength(1);expect(march.viewerSubject).toBeNull();
 await expect(t.query(ref,{instanceKey:"wrong"})).rejects.toThrow();await expect(t.query(ref,{instanceKey:scope.instanceKey,month:3})).rejects.toThrow();
 await t.run(async ctx=>{await ctx.db.patch(ids.plugins,{values:{membershipEnabled:true}});await ctx.db.insert("membership_restriction_rules",{resourceType:"route",resourceIdOrKey:"/archive",ruleMode:"allow_only",planIds:[],teaserMode:"hide",loginRequired:true,createdAt:1,updatedAt:1});});
 expect(await t.query(ref,{instanceKey:scope.instanceKey,year:2026})).toBeNull();
});


test("legacy count query honors membership and site time zone instead of leaking protected totals",async()=>{
 const {t,ids}=await fixture([at("2026-03-01T06:59:59Z"),at("2026-03-01T07:00:00Z")],"America/Denver");
 const ref=makeFunctionReference<"query">("posts/queries:getDateArchiveGroups");
 expect(await t.query(ref,{})).toEqual([{year:2026,month:3,count:1},{year:2026,month:2,count:1}]);
 await t.run(async ctx=>{await ctx.db.patch(ids.plugins,{values:{membershipEnabled:true}});await ctx.db.insert("membership_restriction_rules",{resourceType:"route",resourceIdOrKey:"/blog/story-1",ruleMode:"allow_only",planIds:[],teaserMode:"hide",loginRequired:true,createdAt:1,updatedAt:1});});
 expect(await t.query(ref,{})).toEqual([{year:2026,month:2,count:1}]);
});
test("legacy count query refuses oversized scans instead of returning partial totals",async()=>{
 const {t}=await fixture(Array.from({length:300},(_,i)=>at("2026-03-01")+i));
 await expect(t.query(makeFunctionReference<"query">("posts/queries:getDateArchiveGroups"),{})).rejects.toThrow("safe read budget");
});
