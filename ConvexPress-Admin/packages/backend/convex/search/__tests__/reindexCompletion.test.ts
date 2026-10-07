import { expect, test } from "bun:test";
import { convexTest } from "convex-test";
import { makeFunctionReference as ref } from "convex/server";
import schema from "../../schema";
const modules = {
  "./convex/search/reindex.ts": () => import("../reindex"),
  "./convex/_generated/server.js": () => import("../../_generated/server.js"),
  "./convex/search/actions.ts": () => import("../actions"),
  "./convex/search/internals.ts": () => import("../internals"),
  "./convex/membership/policyReads.ts": () => import("../../membership/policyReads"),
};
async function fixture(count = 551) {
  const t = convexTest({ schema, modules });
  const ids = await t.run(async ctx => {
    const roleId = await ctx.db.insert("roles", { name: "Indexer", slug: "indexer", description: "Fixture", level: 80, type: "internal", status: "active", isDefault: false, isProtected: false, capabilities: ["search.reindex"], pageAccess: [], createdAt: 1, updatedAt: 1 });
    const userId = await ctx.db.insert("users", { email: "reindex-completion@example.invalid", emailVerified: true, authSource: "local", roleId, status: "active", createdAt: 1, updatedAt: 1 });
    const pages = [];
    for (let i=0;i<count;i++) pages.push(await ctx.db.insert("posts", { type: "page", title: `Page ${i}`, slug: `page-${i}`, content: `Searchable authored copy ${i}`, status: "publish", visibility: "public", commentStatus: "closed", authorId: userId, createdAt: i+1, updatedAt: i+1 }));
    return { userId, pages };
  });
  return { t, ids, client:t.withIdentity({subject:ids.userId,issuer:"https://convexpress-admin.local"}) };
}
async function finish(f: Awaited<ReturnType<typeof fixture>>, state: any, contentType?: string) {
  for(let i=0;state.status === "running" && i<100;i++) state=await f.client.action(ref("search/actions:reindex"),{jobId:state.jobId,...(contentType?{contentType}:{})});
  expect(state.status).toBe("completed");return state;
}
test("authenticated full page reindex reaches every record beyond the former 500-row cutoff", async () => {
  const f=await fixture();
  const first=await f.client.action(ref("search/actions:reindex"),{contentType:"page"});
  expect(first.status).toBe("running");expect(first.indexed.page).toBe(100);
  const result=await finish(f,first,"page");
  expect(result.indexed.page).toBe(551);
  expect(result.errors).toBe(0);
  const rows=await f.t.run(ctx=>ctx.db.query("searchIndex").withIndex("by_content",q=>q.eq("contentType","page")).collect());
  expect(new Set(rows.map(r=>r.contentId))).toEqual(new Set(f.ids.pages));
});
test("full cleanup reaches orphan entries beyond the former 500-row cutoff", async () => {
  const f=await fixture(0);
  await f.t.run(async ctx=>{for(let i=0;i<551;i++)await ctx.db.insert("searchIndex",{contentType:"page",contentId:`invalid-page-${i}`,title:"Orphan",content:"",excerpt:"",authorId:"",authorName:"",status:"publish",url:"/gone",indexedAt:1,createdAt:1,updatedAt:1});});
  const result=await finish(f,await f.client.action(ref("search/actions:reindex"),{contentType:"page"}),"page");
  expect(result.removed).toBe(551);
  expect(await f.t.run(ctx=>ctx.db.query("searchIndex").collect())).toEqual([]);
});
test("orphan maintenance cannot remove an active reindex coordination lock", async () => {
  const f=await fixture(0);
  expect(await f.t.mutation(ref("search/internals:acquireReindexLock"),{})).toBe(true);
  await f.t.mutation(ref("search/internals:cleanupOrphanedIndex"),{});
  expect(await f.t.mutation(ref("search/internals:acquireReindexLock"),{})).toBe(false);
});

test("committed steps replay without duplicate counts and an expired worker cannot alter its successor", async () => {
  const f=await fixture(3),begin=ref("search/reindex:begin"),step=ref("search/reindex:step"),finish=ref("search/reindex:finishChunk");
  const args={newJobId:"operation-1",leaseId:"worker-1",contentType:"page"};
  const initial=await f.client.mutation(begin,args);
  await expect(f.client.mutation(begin,{...args,leaseId:"worker-2"})).rejects.toMatchObject({data:{code:"ALREADY_RUNNING"}});
  const first=await f.client.mutation(step,{jobId:initial.jobId,leaseId:"worker-1",sequence:0});
  expect(first.indexed.page).toBe(1);
  expect(await f.client.mutation(step,{jobId:initial.jobId,leaseId:"worker-1",sequence:0})).toEqual(first);
  await f.t.run(async ctx=>{const state=(await ctx.db.query("searchReindexState").collect())[0];await ctx.db.patch("searchReindexState",state._id,{leaseUntil:0});});
  const resumed=await f.client.mutation(begin,{...args,jobId:initial.jobId,leaseId:"worker-2"});
  expect(resumed.sequence).toBe(first.sequence);
  for(const operation of [step,finish]) await expect(f.client.mutation(operation,{jobId:initial.jobId,leaseId:"worker-1",sequence:first.sequence,...(operation===finish?{failed:false}:{})})).rejects.toMatchObject({data:{code:"REINDEX_LEASE_LOST"}});
  const second=await f.client.mutation(step,{jobId:initial.jobId,leaseId:"worker-2",sequence:first.sequence});
  expect(second.indexed.page).toBe(2);
  await f.client.mutation(finish,{jobId:initial.jobId,leaseId:"worker-2",sequence:second.sequence,failed:false});
  const completed=await f.client.action(ref("search/actions:reindex"),{jobId:initial.jobId,contentType:"page"});
  expect(completed.status).toBe("completed");expect(completed.indexed.page).toBe(3);
  expect(await f.client.action(ref("search/actions:reindex"),{jobId:initial.jobId,contentType:"page"})).toEqual(completed);
});

test("a failed document aborts its transaction and resumes at the same position after repair", async () => {
  const f=await fixture(2);
  await f.t.run(ctx=>ctx.db.patch("posts",f.ids.pages[0],{contentMode:"blocks",blocksVersion:2,blocksRevision:1,blocks:[{id:"bad",name:"core/missing",version:1,attrs:{}}]}));
  const failed=await f.client.action(ref("search/actions:reindex"),{contentType:"page"});
  expect(failed.failure).toEqual({contentType:"page",contentId:f.ids.pages[0]});expect(failed.status).toBe("failed");expect(failed.errors).toBe(1);expect(failed.indexed.page).toBe(0);
  expect(await f.t.run(ctx=>ctx.db.query("searchIndex").collect())).toEqual([]);
  const saved=await f.t.run(ctx=>ctx.db.query("searchReindexState").collect());expect(saved[0].sequence).toBe(0);expect(saved[0].cursor).toBeNull();
  await f.t.run(ctx=>ctx.db.patch("posts",f.ids.pages[0],{contentMode:undefined,blocksVersion:undefined,blocksRevision:undefined,blocks:undefined}));
  const completed=await f.client.action(ref("search/actions:reindex"),{contentType:"page",jobId:failed.jobId});
  expect(completed.status).toBe("completed");expect(completed.errors).toBe(0);expect(completed.failedAttempts).toBe(1);expect(completed.indexed.page).toBe(2);
});

test("current permission is required for each step and a different requested scope cannot replace unfinished progress", async () => {
  const f=await fixture(2),begin=ref("search/reindex:begin"),step=ref("search/reindex:step");
  const state=await f.client.mutation(begin,{newJobId:"authority-job",leaseId:"worker",contentType:"page"});
  await expect(f.client.mutation(begin,{newJobId:"another",leaseId:"other",contentType:"post"})).rejects.toMatchObject({data:{code:"ALREADY_RUNNING"}});
  await f.t.run(ctx=>ctx.db.patch("users",f.ids.userId,{status:"inactive"}));
  await expect(f.client.mutation(step,{jobId:state.jobId,leaseId:"worker",sequence:0})).rejects.toMatchObject({data:{code:"FORBIDDEN"}});
  expect(await f.t.run(ctx=>ctx.db.query("searchIndex").collect())).toEqual([]);
});

test("all-content reindex includes events and orphan maintenance preserves their valid source IDs", async () => {
  const f=await fixture(0);
  const event=await f.t.run(ctx=>ctx.db.insert("extension_events",{title:"Workshop",slug:"workshop",description:"Studio workshop",startsAt:Date.now()+86400000,endsAt:Date.now()+90000000,timeZone:"UTC",venue:"Studio",venueAddress:"",status:"published",rsvp:{mode:"guests",capacity:null,closesAt:null},createdBy:f.ids.userId,createdAt:1,updatedAt:1}));
  const result=await f.client.action(ref("search/actions:reindex"),{});
  expect(result.status).toBe("completed");expect(result.indexed.event).toBe(1);expect(result.removed).toBe(0);
  await f.t.mutation(ref("search/internals:cleanupOrphanedIndex"),{});
  const rows=await f.t.run(ctx=>ctx.db.query("searchIndex").collect());expect(rows.map(r=>r.contentId)).toEqual([event]);
});

test("a dropped step acknowledgement recovers the committed sequence without double counting", async () => {
  const f=await fixture(3);
  const { _reindexInternal }=await import("../actions");
  let dropped=false;
  const handler=(_reindexInternal as unknown as {_handler(ctx:unknown,args:unknown):Promise<any>})._handler;
  const result=await handler({runQuery:(name:any,args:any)=>f.client.query(name,args),runMutation:async(name:any,args:any)=>{
    const response=await f.client.mutation(name,args);
    if(!dropped&&"sequence" in args&&!('failed' in args)){dropped=true;throw Error("Simulated response loss after commit");}
    return response;
  }},{contentType:"page"});
  expect(dropped).toBe(true);expect(result.status).toBe("completed");expect(result.indexed.page).toBe(3);expect(result.failedAttempts).toBe(0);
});

test("scheduled orphan maintenance continues beyond its first bounded page", async () => {
  const f=await fixture(0);
  await f.t.run(async ctx=>{for(let i=0;i<251;i++)await ctx.db.insert("searchIndex",{contentType:"page",contentId:`missing-${i}`,title:"",content:"",excerpt:"",authorId:"",authorName:"",status:"publish",url:"",indexedAt:1,createdAt:1,updatedAt:1});});
  const first=await f.t.mutation(ref("search/internals:cleanupOrphanedIndex"),{});
  expect(first).toEqual({removed:100,isDone:false});
  for (let i=0;i<100;i++) {
    await new Promise(resolve=>setTimeout(resolve,1));
    await f.t.finishInProgressScheduledFunctions();
    const scheduled=await f.t.run(ctx=>ctx.db.system.query("_scheduled_functions").collect());
    expect(scheduled.filter(row=>row.state.kind==="failed")).toHaveLength(0);
    if(scheduled.length && scheduled.every(row=>row.state.kind==="success")) break;
    if(i===99) throw Error("Scheduled orphan continuation did not complete");
  }
  expect(await f.t.run(ctx=>ctx.db.query("searchIndex").collect())).toEqual([]);
});

test("a changed installed source contract requires an explicit restart instead of reusing its cursor", async () => {
 const f=await fixture(2),begin=ref("search/reindex:begin");
 const state=await f.client.mutation(begin,{newJobId:"old-sources",leaseId:"old-worker",contentType:"page"});
 await f.t.run(async ctx=>{const row=(await ctx.db.query("searchReindexState").collect())[0];await ctx.db.patch("searchReindexState",row._id,{sourceKey:"retired-contract",leaseUntil:0});});
 expect((await f.client.query(ref("search/reindex:current"),{})).needsRestart).toBe(true);
 await expect(f.client.mutation(begin,{jobId:state.jobId,newJobId:"unused",leaseId:"next",contentType:"page"})).rejects.toMatchObject({data:{code:"REINDEX_SOURCES_CHANGED"}});
 const fresh=await f.client.mutation(begin,{newJobId:"current-sources",leaseId:"new-worker",contentType:"page"});
 expect(fresh.jobId).toBe("current-sources");expect(fresh.sequence).toBe(0);expect(fresh.needsRestart).toBe(false);
});

test("a source read failure cannot be swallowed as successful reindex progress", async () => {
  const f=await fixture(1);
  const state=await f.client.mutation(ref("search/reindex:begin"),{newJobId:"read-failure",leaseId:"worker",contentType:"page"});
  const {step}=await import("../reindex");
  const handler=(step as unknown as {_handler(ctx:unknown,args:unknown):Promise<any>})._handler;
  await expect(f.client.run(async ctx=>handler({...ctx,db:new Proxy(ctx.db,{get(target,key){
    if(key==='get')return async(table:string,id:string)=>{if(table==='posts'&&id===f.ids.pages[0])throw Error('Synthetic database read failure');return target.get(table as any,id as any);};
    const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value;
  }})},{jobId:state.jobId,leaseId:"worker",sequence:0}))).rejects.toMatchObject({data:{code:"REINDEX_ITEM_FAILED"}});
  const current=await f.client.query(ref("search/reindex:current"),{});
  expect(current.sequence).toBe(0);expect(current.processed).toBe(0);
});

test("taxonomy read failure aborts rather than publishing an incomplete post index", async () => {
 const f=await fixture(1);
 await f.t.run(ctx=>ctx.db.patch('posts',f.ids.pages[0],{type:'post'}));
 const {reindexContent}=await import('../internals');
 await expect(f.client.run(ctx=>reindexContent({...ctx,db:new Proxy(ctx.db,{get(target,key){
  if(key==='query')return (table:string)=>{if(table==='termRelationships')throw Error('Synthetic taxonomy read failure');return target.query(table as any);};
  const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value;
 }})},'post',f.ids.pages[0]))).rejects.toThrow('Synthetic taxonomy read failure');
 expect(await f.t.run(ctx=>ctx.db.query('searchIndex').collect())).toEqual([]);
});
