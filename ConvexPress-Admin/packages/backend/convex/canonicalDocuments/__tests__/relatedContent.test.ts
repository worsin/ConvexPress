import { test, expect } from "bun:test";
import { convexTest } from "convex-test";
import schema from "../../schema";
import { readRelatedContent } from "../relatedContent";
import { RequestReadLedger } from "../../helpers/requestReadLedger";
import type { RelatedArgs } from "../foundation/relatedContracts";
const modules={"./convex/_generated/api.js":()=>import("../../_generated/api.js"),"./convex/_generated/server.js":()=>import("../../_generated/server.js"),"./convex/membership/policyReads.ts":()=>import("../../membership/policyReads")};
const scope={websiteKey:"related-site",instanceKey:"staging"};
async function fixture(count=6,type:"post"|"page"="post") {
  const t=convexTest({schema,modules});
  const ids=await t.run(async ctx=>{
    const user=await ctx.db.insert("users",{authSource:"local",email:"related@example.invalid",emailVerified:true,status:"active",createdAt:1,updatedAt:1});
    const settings=await ctx.db.insert("settings",{section:"plugins",values:{membershipEnabled:false},updatedAt:1,updatedBy:user});
    const term=await ctx.db.insert("terms",{name:"Field notes",slug:"field-notes",taxonomy:"category",count:count,isDefault:false,createdAt:1,updatedAt:1});
    const post={type,title:"Current story",slug:"current",status:"publish",visibility:"public",authorId:user,commentStatus:"closed",publishedAt:500,createdAt:1,updatedAt:1} as const;
    const source=await ctx.db.insert("posts",post);
    const sourceRelation=await ctx.db.insert("termRelationships",{postId:source,termId:term});
    const candidates=[];
    for(let i=0;i<count;i++) {
      const id=await ctx.db.insert("posts",{...post,title:`Story ${i}`,slug:`story-${i}`,excerpt:`Excerpt ${i}`,publishedAt:100+i});
      await ctx.db.insert("termRelationships",{postId:id,termId:term});candidates.push(id);
    }
    return {source,term,user,settings,candidates,sourceRelation};
  });
  const read=(args:Partial<RelatedArgs>={},s=scope,budget?:RequestReadLedger)=>t.run(async ctx=>{
    const source=await ctx.db.get(ids.source);if(!source)throw Error("Source absent");
    return readRelatedContent(ctx,{type,limit:3,...args},s,source,budget,undefined,1000);
  });
  return {t,ids,read};
}
test("related posts share topics, exclude themselves and expose only card fields",async()=>{
  const {ids,read}=await fixture();const page=await read();
  expect(page.items.map(item=>item.id)).toEqual(ids.candidates.slice(-3).reverse());
  expect(page.items[0]?.href).toBe("/blog/story-5");expect(page.nextCursor).not.toBeNull();
  expect(JSON.stringify(page)).not.toContain("authorId");expect(JSON.stringify(page)).not.toContain("content");
  const next=await read({cursor:page.nextCursor});expect(next.items.map(item=>item.id)).toEqual(ids.candidates.slice(0,3).reverse());expect(next.nextCursor).toBeNull();
});
test("unrelated, unpublished, password, private and future items are excluded",async()=>{
  const {t,ids,read}=await fixture();
  await t.run(async ctx=>{
    await ctx.db.patch(ids.candidates[0]!,{status:"draft"});await ctx.db.patch(ids.candidates[1]!,{visibility:"password",password:"never-disclose"});
    await ctx.db.patch(ids.candidates[2]!,{visibility:"private"});await ctx.db.patch(ids.candidates[3]!,{publishedAt:2000});
    const rel=await ctx.db.query("termRelationships").withIndex("by_post",q=>q.eq("postId",ids.candidates[4]!)).first();await ctx.db.delete(rel!._id);
  });
  expect((await read({limit:48})).items.map(item=>item.id)).toEqual([ids.candidates[5]!]);
  await t.run(ctx=>ctx.db.delete(ids.term));expect((await read()).items).toEqual([]);
});
test("page siblings use canonical nested routes without falling back to unrelated posts",async()=>{
  const {t,ids,read}=await fixture(3,"page");
  await t.run(async ctx=>{
    await ctx.db.delete(ids.sourceRelation);
    await ctx.db.patch(ids.candidates[0]!,{path:"/guides/getting-started"});
    await ctx.db.patch(ids.candidates[1]!,{parentId:ids.source});
  });
  const result=await read();expect(result.items.map(item=>item.id)).toEqual([ids.candidates[2]!,ids.candidates[0]!]);
  expect(result.items[1]?.href).toBe("/page/guides/getting-started");expect((await read({type:"post"})).items).toEqual([]);
});
test("every page rechecks membership policy and current relationships",async()=>{
  const {t,ids,read}=await fixture();const first=await read();
  await t.run(async ctx=>{
    await ctx.db.patch(ids.settings,{values:{membershipEnabled:true}});
    await ctx.db.insert("membership_restriction_rules",{resourceType:"route",resourceIdOrKey:"/blog/story-2",ruleMode:"allow_only",planIds:[],teaserMode:"hide",loginRequired:true,createdAt:1,updatedAt:1});
    const rel=await ctx.db.query("termRelationships").withIndex("by_post",q=>q.eq("postId",ids.candidates[1]!)).first();await ctx.db.delete(rel!._id);
  });
  expect((await read({cursor:first.nextCursor})).items.map(item=>item.id)).toEqual([ids.candidates[0]!]);
  await t.run(ctx=>ctx.db.delete(ids.sourceRelation));await expect(read({cursor:first.nextCursor})).rejects.toThrow("another document");
});
test("bounded scans retain continuation through a long unrelated section",async()=>{
  const {t,ids,read}=await fixture(72);
  await t.run(async ctx=>{for(const id of ids.candidates.slice(8)) {const rel=await ctx.db.query("termRelationships").withIndex("by_post",q=>q.eq("postId",id)).first();await ctx.db.delete(rel!._id);}});
  const ledger=new RequestReadLedger();const first=await read({},scope,ledger);expect(first.items).toEqual([]);expect(first.nextCursor).not.toBeNull();expect(ledger.queries).toBeLessThan(256);
  let cursor=first.nextCursor;const found:string[]=[];let pages=0;
  do {const next=await read({cursor});found.push(...next.items.map(item=>item.id));cursor=next.nextCursor;expect(++pages).toBeLessThan(6);}while(cursor);
  expect(found).toEqual(ids.candidates.slice(0,8).reverse());
});
test("cursor cannot change scope, saved type, limit, topics, or table",async()=>{
  const {t,ids,read}=await fixture();const cursor=(await read()).nextCursor!;
  for(const args of [{type:"page" as const},{limit:4}])await expect(read({...args,cursor})).rejects.toThrow("another document");
  await expect(read({cursor},{...scope,instanceKey:"production"})).rejects.toThrow("another document");
  await expect(read({cursor:"junk"})).rejects.toThrow("Invalid related");
  const malformed=JSON.parse(cursor);malformed.after[2]=ids.user;await expect(read({cursor:JSON.stringify(malformed)})).rejects.toThrow("another document");
  await t.run(ctx=>ctx.db.delete(ids.term));await expect(read({cursor})).rejects.toThrow("another document");
});
test("large classifications fail explicitly and inactive media are never projected",async()=>{
  const {t,ids,read}=await fixture(1);
  const media=await t.run(async ctx=>{
    const media=await ctx.db.insert("media",{title:"Private upload",fileName:"image.jpg",slug:"image",mimeType:"image/jpeg",fileSize:100,mediaType:"image",url:"https://images.example.invalid/image.jpg",status:"processing",uploadedBy:ids.user,createdAt:1,updatedAt:1});
    await ctx.db.patch(ids.candidates[0]!,{featuredImageId:media,excerpt:"🪴".repeat(300)});return media;
  });
  expect((await read()).items[0]?.image).toBeNull();expect((await read()).items[0]!.excerpt!.length).toBeLessThanOrEqual(320);
  await t.run(ctx=>ctx.db.patch(media,{status:"active"}));expect((await read()).items[0]?.image?.src).toBe("https://images.example.invalid/image.jpg");
  await t.run(async ctx=>{for(let i=0;i<65;i++)await ctx.db.insert("termRelationships",{postId:ids.source,termId:ids.term});});
  await expect(read()).rejects.toThrow("64 topic relationships");
});
