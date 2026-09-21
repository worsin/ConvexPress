import {test,expect} from "bun:test";
import {convexTest} from "convex-test";
import schema from "../../schema";
import {readRecipe} from "../recipe";
import {RequestReadLedger} from "../../helpers/requestReadLedger";
import {SourceByteLedger} from "../sourceBudget";
const modules={"./convex/_generated/api.js":()=>import("../../_generated/api.js"),"./convex/_generated/server.js":()=>import("../../_generated/server.js"),"./convex/membership/policyReads.ts":()=>import("../../membership/policyReads")};
async function fixture(){
 const t=convexTest({schema,modules});
 const ids=await t.run(async ctx=>{
  const user=await ctx.db.insert("users",{authSource:"local",email:"recipe@example.invalid",emailVerified:true,status:"active",createdAt:1,updatedAt:1});
  const setting=await ctx.db.insert("settings",{section:"plugins",values:{recipesEnabled:true,membershipEnabled:false},updatedAt:1,updatedBy:user});
  const recipe=await ctx.db.insert("recipes",{title:"Sunday beans",slug:"sunday-beans",status:"publish",authorId:user,categoryIds:[],ingredients:["2 cups beans","Water"],instructions:["Soak the beans.","Simmer until tender."],prepMinutes:0,cookMinutes:120,servings:"4",aiExtractedFromScan:true,scannedText:"PRIVATE SCAN",isFeatured:false,publishedAt:1,createdAt:1,updatedAt:1});
  return {user,setting,recipe};
 });return {t,ids};
}
test("recipe retains ordered public content and omits internal scan and account data",async()=>{
 const {t,ids}=await fixture();const result=await t.run(ctx=>readRecipe(ctx,{recipe:ids.recipe}));
 expect(result.recipe).toMatchObject({id:ids.recipe,title:"Sunday beans",href:"/recipes/sunday-beans",prepMinutes:0,cookMinutes:120,totalMinutes:null,ingredients:["2 cups beans","Water"],instructions:["Soak the beans.","Simmer until tender."],image:null});
 for(const field of ["PRIVATE SCAN","scannedText","authorId","aiExtractedFromScan","categoryIds"])expect(JSON.stringify(result)).not.toContain(field);
});
test("missing, wrong-table, draft, trash, disabled and future recipes reveal no content or fallback",async()=>{
 const {t,ids}=await fixture();const read=(args:unknown)=>t.run(ctx=>readRecipe(ctx,args,undefined,undefined,100));
 expect(await read({})).toEqual({recipe:null});expect(await read({recipe:ids.user})).toEqual({recipe:null});
 for(const status of ["draft","trash"] as const){await t.run(ctx=>ctx.db.patch(ids.recipe,{status}));expect(await read({recipe:ids.recipe})).toEqual({recipe:null});}
 await t.run(ctx=>ctx.db.patch(ids.recipe,{status:"publish",publishedAt:200}));const budget=new RequestReadLedger();expect(await t.run(ctx=>readRecipe(ctx,{recipe:ids.recipe},budget,undefined,100))).toEqual({recipe:null});expect(budget.authorizationRecheckAt).toBe(200);
 await t.run(ctx=>ctx.db.patch(ids.recipe,{publishedAt:1}));await t.run(ctx=>ctx.db.patch(ids.setting,{values:{recipesEnabled:false}}));expect(await read({recipe:ids.recipe})).toEqual({recipe:null});
});
test("collection and detail membership routes are checked before exposing recipes",async()=>{
 const {t,ids}=await fixture();await t.run(ctx=>ctx.db.patch(ids.setting,{values:{recipesEnabled:true,membershipEnabled:true}}));
 for(const route of ["/recipes","/recipes/sunday-beans"]){
  const rule=await t.run(ctx=>ctx.db.insert("membership_restriction_rules",{resourceType:"route",resourceIdOrKey:route,ruleMode:"allow_only",planIds:[],teaserMode:"hide",loginRequired:true,createdAt:1,updatedAt:1}));
  expect(await t.run(ctx=>readRecipe(ctx,{recipe:ids.recipe}))).toEqual({recipe:null});
  await t.run(ctx=>ctx.db.delete(rule));expect((await t.run(ctx=>readRecipe(ctx,{recipe:ids.recipe}))).recipe?.id).toBe(ids.recipe);
 }
});
test("invalid timing and oversized source documents fail without truncating content",async()=>{
 const {t,ids}=await fixture();await t.run(ctx=>ctx.db.patch(ids.recipe,{prepMinutes:-1}));await expect(t.run(ctx=>readRecipe(ctx,{recipe:ids.recipe}))).rejects.toThrow();
 await t.run(ctx=>ctx.db.patch(ids.recipe,{prepMinutes:1,scannedText:"x".repeat(270000)}));await expect(t.run(ctx=>readRecipe(ctx,{recipe:ids.recipe}))).rejects.toThrow("source document budget");
 const sources=new SourceByteLedger();sources.usedBytes=2*1024*1024;await expect(t.run(ctx=>readRecipe(ctx,{recipe:ids.recipe},undefined,sources))).rejects.toThrow("Source budget exhausted");
});

test("recipe image projection excludes trashed and non-image assets and refuses unsafe URLs",async()=>{
 const {t,ids}=await fixture();const media=await t.run(async ctx=>{
  const media=await ctx.db.insert("media",{title:"Beans",fileName:"beans.png",slug:"beans",mimeType:"image/png",fileSize:100,mediaType:"image",url:"https://images.example.invalid/beans.png",altText:"A bowl of beans",status:"active",uploadedBy:ids.user,createdAt:1,updatedAt:1});
  await ctx.db.patch(ids.recipe,{featuredImageId:media});return media;
 });const read=()=>t.run(ctx=>readRecipe(ctx,{recipe:ids.recipe}));expect((await read()).recipe?.image).toMatchObject({src:"https://images.example.invalid/beans.png",alt:"A bowl of beans"});
 for(const status of ["trashed","failed","processing"] as const){await t.run(ctx=>ctx.db.patch(media,{status}));expect((await read()).recipe?.image).toBeNull();}
 await t.run(ctx=>ctx.db.patch(media,{status:"active",mimeType:"application/pdf"}));expect((await read()).recipe?.image).toBeNull();
 await t.run(ctx=>ctx.db.patch(media,{mimeType:"image/png",url:"javascript:alert(1)"}));await expect(read()).rejects.toThrow();
});
