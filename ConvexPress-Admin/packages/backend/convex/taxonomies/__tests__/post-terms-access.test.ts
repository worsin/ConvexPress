import {test,expect} from "bun:test";
import {convexTest} from "convex-test";
import {makeFunctionReference} from "convex/server";
import schema from "../../schema";
const endpoint=makeFunctionReference<"query">("taxonomies/queries:getByPost");
const modules={"./convex/_generated/api.js":()=>import("../../_generated/api.js"),"./convex/_generated/server.js":()=>import("../../_generated/server.js"),"./convex/taxonomies/queries.ts":()=>import("../queries"),"./convex/membership/policyReads.ts":()=>import("../../membership/policyReads")};
async function fixture(){
 const t=convexTest({schema,modules});
 const ids=await t.run(async ctx=>{
  const roleId=await ctx.db.insert("roles",{name:"Author",slug:"author",description:"Fixture",level:60,type:"internal",status:"active",isDefault:false,isProtected:false,capabilities:["post.update"],pageAccess:[],createdAt:1,updatedAt:1});
  const author=await ctx.db.insert("users",{email:"author@example.invalid",emailVerified:true,status:"active",authSource:"local",roleId,createdAt:1,updatedAt:1});
  const customer=await ctx.db.insert("users",{email:"customer@example.invalid",emailVerified:true,status:"active",authSource:"clerk",clerkUserId:"customer",createdAt:1,updatedAt:1});
  await ctx.db.insert("settings",{section:"plugins",values:{membershipEnabled:false},updatedAt:1,updatedBy:author});
  const tag=await ctx.db.insert("terms",{name:"Unannounced product",slug:"unannounced",taxonomy:"post_tag",count:999999,isDefault:false,description:"Private editorial metadata",createdBy:"PRIVATE_CREATOR",wpTermId:12345,createdAt:1,updatedAt:1});
  const post=await ctx.db.insert("posts",{type:"post",title:"Draft",slug:"draft",status:"draft",visibility:"public",publishedAt:1,authorId:author,commentStatus:"closed",createdAt:1,updatedAt:1});
  await ctx.db.insert("termRelationships",{postId:post,termId:tag});
  return {author,customer,tag,post};
 });
 return {t,ids,author:t.withIdentity({issuer:"https://convexpress-admin.local",subject:ids.author}),customer:t.withIdentity({issuer:"https://clerk.fixture.invalid",subject:"customer"})};
}
test("anonymous and customer callers cannot inspect draft, private, password, future or deleted post terms",async()=>{
 const{t,ids,customer}=await fixture();
 for(const patch of [{status:"draft" as const},{status:"publish" as const,visibility:"private" as const},{visibility:"password" as const},{visibility:"public" as const,publishedAt:Date.now()+86400000}]){
  await t.run(ctx=>ctx.db.patch("posts",ids.post,patch));
  for(const caller of [t,customer])expect(await caller.query(endpoint,{postId:ids.post})).toEqual({categories:[],tags:[]});
 }
 await t.run(ctx=>ctx.db.delete("posts",ids.post));expect(await t.query(endpoint,{postId:ids.post})).toEqual({categories:[],tags:[]});
});
test("an author retains own draft labels while public responses are closed and deduplicated",async()=>{
 const{t,ids,author}=await fixture();
 const expected={categories:[],tags:[{_id:ids.tag,name:"Unannounced product",slug:"unannounced"}]};
 expect(await author.query(endpoint,{postId:ids.post})).toEqual(expected);
 await t.run(async ctx=>{await ctx.db.patch("posts",ids.post,{status:"publish"});await ctx.db.insert("termRelationships",{postId:ids.post,termId:ids.tag});});
 expect(await t.query(endpoint,{postId:ids.post})).toEqual(expected);
 await t.run(ctx=>ctx.db.patch("users",ids.author,{status:"inactive"}));
 await t.run(ctx=>ctx.db.patch("posts",ids.post,{status:"draft"}));
 expect(await author.query(endpoint,{postId:ids.post})).toEqual({categories:[],tags:[]});
});
test("post and destination route membership revocation suppress taxonomy labels",async()=>{
 const{t,ids}=await fixture();
 await t.run(async ctx=>{
  await ctx.db.patch("posts",ids.post,{status:"publish"});
  const settings=await ctx.db.query("settings").withIndex("by_section",q=>q.eq("section","plugins")).unique();await ctx.db.patch("settings",settings!._id,{values:{membershipEnabled:true}});
  await ctx.db.insert("membership_restriction_rules",{resourceType:"route",resourceIdOrKey:"/tag/unannounced",ruleMode:"allow_only",planIds:[],loginRequired:true,teaserMode:"hide",createdAt:1,updatedAt:1});
 });
 expect(await t.query(endpoint,{postId:ids.post})).toEqual({categories:[],tags:[]});
 await t.run(async ctx=>{
  const rule=await ctx.db.query("membership_restriction_rules").first();await ctx.db.patch("membership_restriction_rules",rule!._id,{resourceType:"post",resourceIdOrKey:ids.post});
 });
 expect(await t.query(endpoint,{postId:ids.post})).toEqual({categories:[],tags:[]});
});


test("author capability does not reveal another owner's draft labels",async()=>{
 const{t,ids,author}=await fixture();
 await t.run(ctx=>ctx.db.patch("posts",ids.post,{authorId:ids.customer}));
 expect(await author.query(endpoint,{postId:ids.post})).toEqual({categories:[],tags:[]});
});
