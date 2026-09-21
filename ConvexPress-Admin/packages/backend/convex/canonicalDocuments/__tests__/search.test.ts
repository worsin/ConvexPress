import {expect,test} from "bun:test";
import {convexTest} from "convex-test";
import schema from "../../schema";
import {readSearch} from "../search";
import {RequestReadLedger} from "../../helpers/requestReadLedger";
const modules={"./convex/search/candidates.ts":()=>import("../../search/candidates"),"./convex/_generated/api.js":()=>import("../../_generated/api.js"),"./convex/_generated/server.js":()=>import("../../_generated/server.js"),"./convex/membership/policyReads.ts":()=>import("../../membership/policyReads")};
const scope={websiteKey:"site",instanceKey:"staging"};
async function fixture(){
 const t=convexTest({schema,modules});
 const ids=await t.run(async ctx=>{
  const user=await ctx.db.insert("users",{authSource:"local",email:"author@example.invalid",emailVerified:true,status:"active",displayName:"Public author",createdAt:1,updatedAt:1});
  await ctx.db.insert("settings",{section:"plugins",values:{membershipEnabled:false},updatedAt:1,updatedBy:user});
  const ids=[];
  for(let i=0;i<11;i++){
   const title=i<5?`Orchid title ${i}`:`Body match ${i}`,content=i<2?"Other text":"Orchid body",visibility=i===10?"password":"public";
   const id=await ctx.db.insert("posts",{type:"post",title,slug:`story-${i}`,status:"publish",visibility,authorId:user,commentStatus:"closed",excerpt:`Current summary ${i}`,content,createdAt:1,updatedAt:1,publishedAt:1});
   await ctx.db.insert("searchIndex",{contentType:"post",contentId:id,title,content,excerpt:"STALE_SECRET",authorName:"PRIVATE_EMAIL",authorId:String(user),status:"publish",url:"/stale",createdAt:1,updatedAt:1,publishedAt:1,indexedAt:1});
   if(i<10)ids.push(id);
  }
  return ids;
 });return {t,ids};
}
test("title-only, body-only and overlapping matches traverse completely without duplicates",async()=>{
 const {t,ids}=await fixture();let cursor:string|null=null;const seen:string[]=[];let rounds=0;
 do{
  const budget=new RequestReadLedger();
  const result=await t.run(ctx=>readSearch(ctx,{query:"Orchid",pageSize:2,cursor},scope,"document",budget));
  expect(result.items.length).toBeLessThanOrEqual(2);expect(budget.documents).toBeLessThan(30);
  expect(JSON.stringify(result)).not.toContain("STALE_SECRET");expect(JSON.stringify(result)).not.toContain("PRIVATE_EMAIL");
  seen.push(...result.items.map(row=>row.id));cursor=result.nextCursor;
  if(++rounds>15)throw Error("Nonconvergent cursor");
 }while(cursor);
 expect(seen).toHaveLength(10);expect(new Set(seen)).toEqual(new Set(ids));expect(new Set(seen.slice(0,5))).toEqual(new Set(ids.slice(0,5)));
});
test("search cursors cannot change query, kinds, page size, document or installation",async()=>{
 const {t}=await fixture();const first=await t.run(ctx=>readSearch(ctx,{query:"Orchid",pageSize:2},scope,"document"));expect(first.nextCursor).not.toBeNull();
 for(const change of [{query:"Rose"},{kinds:["page"]},{pageSize:3}])await expect(t.run(ctx=>readSearch(ctx,{query:"Orchid",pageSize:2,cursor:first.nextCursor,...change},scope,"document"))).rejects.toThrow();
 await expect(t.run(ctx=>readSearch(ctx,{query:"Orchid",pageSize:2,cursor:first.nextCursor},{...scope,instanceKey:"other"},"document"))).rejects.toThrow();
 await expect(t.run(ctx=>readSearch(ctx,{query:"Orchid",pageSize:2,cursor:first.nextCursor},scope,"other-document"))).rejects.toThrow();
});
test("empty queries issue no reads and oversized queries and shared budget exhaustion refuse",async()=>{
 const {t}=await fixture();const budget=new RequestReadLedger();
 const result=await t.run(ctx=>readSearch(ctx,{query:""},scope,"document",budget));expect(result.state).toBe("idle");expect(budget.queries).toBe(0);
 for(const query of ["x".repeat(501),Array(17).fill("term").join(" ")])await expect(t.run(ctx=>readSearch(ctx,{query},scope,"document"))).rejects.toThrow();
 await expect(t.run(ctx=>readSearch(ctx,{query:"Orchid"},scope,"document",new RequestReadLedger({queries:1,documents:1,bytes:100,documentBytes:100})))).rejects.toThrow();
});


test("body-only queries return their first matches immediately and independent search blocks can share a page",async()=>{
 const {t,ids}=await fixture();const [body,mixed]=await t.run(async ctx=>[await readSearch(ctx,{query:"Other",pageSize:12},scope,"document"),await readSearch(ctx,{query:"Orchid",pageSize:2},scope,"document")]);
 expect(new Set(body.items.map(row=>row.id))).toEqual(new Set(ids.slice(0,2)));expect(body.cursor).toBeNull();expect(body.nextCursor).toBeNull();expect(mixed.items).toHaveLength(2);
});

test("event publishing, edits and archival update search and current event authority is enforced",async()=>{
 const {t}=await fixture();
 const eventId=await t.run(async ctx=>{
  const settings=await ctx.db.query("settings").first();await ctx.db.patch("settings",settings!._id,{values:{membershipEnabled:false,eventsEnabled:true}});
  const event=await ctx.db.insert("extension_events",{title:"Orchid workshop",slug:"orchid-workshop",description:"A practical session",startsAt:Date.now()+60000,endsAt:Date.now()+3600000,timeZone:"UTC",venue:"Glasshouse",venueAddress:"Test location",status:"published",createdBy:settings!.updatedBy,createdAt:1,updatedAt:1});
  const {syncEventSearch}=await import("../../search/events");await syncEventSearch(ctx,event);return event;
 });
 const args={query:"orchid",kinds:["event"],pageSize:12};
 const result=await t.run(ctx=>readSearch(ctx,args,scope,"document"));expect(result.items).toHaveLength(1);expect(result.items[0]).toMatchObject({id:eventId,kind:"event",title:"Orchid workshop",href:"/events/orchid-workshop"});
 await t.run(async ctx=>{await ctx.db.patch("extension_events",eventId,{title:"Updated workshop",description:"Fresh event summary"});});
 const current=await t.run(ctx=>readSearch(ctx,args,scope,"document"));expect(current.items[0]?.title).toBe("Updated workshop");expect(current.items[0]?.excerpt).toBe("Fresh event summary");
 await t.run(async ctx=>{await ctx.db.patch("extension_events",eventId,{status:"archived"});const {syncEventSearch}=await import("../../search/events");await syncEventSearch(ctx,eventId);});
 expect((await t.run(ctx=>readSearch(ctx,args,scope,"document"))).items).toEqual([]);
});


test("hidden candidates fill visible pages through bounded batches instead of one empty page per candidate",async()=>{
 const {t,ids}=await fixture();
 await t.run(async ctx=>{
  for(const id of ids){await ctx.db.patch("posts",id,{visibility:"password"});}
  const author=(await ctx.db.query("users").first())!;
  for(let i=0;i<40;i++){
   const post=await ctx.db.insert("posts",{type:"post",title:"Orchid",slug:`batch-${i}`,status:"publish",visibility:i<36?"password":"public",authorId:author._id,commentStatus:"closed",content:"",excerpt:"Current",createdAt:1,updatedAt:1});
   await ctx.db.insert("searchIndex",{contentType:"post",contentId:post,title:"Orchid",content:"",excerpt:"",authorId:String(author._id),authorName:"",status:"publish",url:"/unused",createdAt:1,updatedAt:1,indexedAt:1});
  }
 });
 const first=await t.run(ctx=>readSearch(ctx,{query:"Orchid",pageSize:2},scope,"document"));
 expect(first.items).toHaveLength(2);
 const second=await t.run(ctx=>readSearch(ctx,{query:"Orchid",pageSize:2,cursor:first.nextCursor},scope,"document"));
 expect(second.items).toHaveLength(2);
 expect(new Set([...first.items,...second.items].map(item=>item.id)).size).toBe(4);
});


test("partial batches reject changed ranking and recheck changed source visibility",async()=>{
 const {t,ids}=await fixture();
 const first=await t.run(ctx=>readSearch(ctx,{query:"Orchid",pageSize:2},scope,"document"));
 const cursor=JSON.parse(first.nextCursor!);expect(cursor.offset).toBe(2);expect(cursor.batch).toHaveLength(64);
 await t.run(ctx=>ctx.db.patch("posts",ids[2],{visibility:"password"}));
 const next=await t.run(ctx=>readSearch(ctx,{query:"Orchid",pageSize:2,cursor:first.nextCursor},scope,"document"));
 expect(next.items).toHaveLength(2);expect(next.items.map(row=>row.id)).not.toContain(ids[2]);
 await t.run(async ctx=>{const index=await ctx.db.query("searchIndex").withIndex("by_content",q=>q.eq("contentType","post").eq("contentId",ids[0])).first();await ctx.db.delete("searchIndex",index!._id);});
 await expect(t.run(ctx=>readSearch(ctx,{query:"Orchid",pageSize:2,cursor:first.nextCursor},scope,"document"))).rejects.toThrow("Search results changed");
});
