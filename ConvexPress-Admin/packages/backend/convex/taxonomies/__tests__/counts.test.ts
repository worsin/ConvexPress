import { expect, test } from "bun:test";
import { convexTest } from "convex-test";
import schema from "../../schema";
import { insertTermRelationship, deleteTermRelationship } from "../../helpers/postDiscovery";
import { beginTermCountRepair, advanceTermCountRepair, type TermCountTask } from "../../helpers/termCounts";
import { patchWithMediaReferences, replaceWithMediaReferences, deleteWithMediaReferences, patchDynamicWithMediaReferences } from "../../media/attachmentGuard";
const modules = {
  "./convex/_generated/server.js": () => import("../../_generated/server.js"),
  "./convex/_generated/api.js": () => import("../../_generated/api.js"),
};
const termData = (name: string) => ({name, slug:name, taxonomy:"category" as const, count:999, isDefault:false, createdAt:1, updatedAt:1});
const account = {email:"count@example.invalid", emailVerified:true, authSource:"local" as const, status:"active" as const, displayName:"Count", createdAt:1, updatedAt:1};
const article = (authorId:any, overrides = {}) => ({authorId, title:"Post", slug:"post", type:"post" as const, status:"publish" as const, visibility:"private" as const, commentStatus:"closed" as const, createdAt:1, updatedAt:1, ...overrides});
async function drain(t: ReturnType<typeof convexTest>, task: TermCountTask | undefined) {
  let pages=0;
  while(task) { if(++pages>100)throw new Error("Count repair failed to converge"); const current=task; task=await t.run(ctx=>advanceTermCountRepair(ctx,current)); }
  return pages;
}
async function repair(t: ReturnType<typeof convexTest>, termId:any) {
  return drain(t, await t.run(ctx=>beginTermCountRepair(ctx,termId,true)));
}
test("published post assignment, deduplication, removal and source lifecycle maintain editorial counts atomically", async()=>{
  const t=convexTest({schema,modules});
  const {term,post}=await t.run(async ctx=>({term:await ctx.db.insert("terms",termData("journal")),post:await ctx.db.insert("posts",article(await ctx.db.insert("users",account)))}));
  await repair(t,term);
  const count=()=>t.run(ctx=>ctx.db.get(term));
  const relation=await t.run(ctx=>insertTermRelationship(ctx,{termId:term,postId:post}));
  expect(await count()).toMatchObject({count:1,countReady:true});
  expect(await t.run(ctx=>insertTermRelationship(ctx,{termId:term,postId:post}))).toBe(relation);
  expect(await count()).toMatchObject({count:1,countReady:true});
  await t.run(ctx=>patchWithMediaReferences(ctx,"posts",post,{status:"draft"}));
  expect(await count()).toMatchObject({count:0,countReady:true});
  await t.run(ctx=>patchWithMediaReferences(ctx,"posts",post,{status:"publish",visibility:"password"}));
  expect(await count()).toMatchObject({count:1,countReady:true});
  await t.run(async ctx=>{const p=(await ctx.db.get(post))!; const {_id,_creationTime,...fields}=p; await replaceWithMediaReferences(ctx,"posts",post,{...fields,type:"page"});});
  expect(await count()).toMatchObject({count:0,countReady:true});
  await t.run(ctx=>patchWithMediaReferences(ctx,"posts",post,{type:"post"}));
  await expect(t.run(async ctx=>{await deleteTermRelationship(ctx,relation); throw new Error("Rollback");})).rejects.toThrow("Rollback");
  expect(await count()).toMatchObject({count:1,countReady:true});
  await t.run(ctx=>deleteTermRelationship(ctx,relation));
  expect(await count()).toMatchObject({count:0,countReady:true});
  const rel2=await t.run(ctx=>insertTermRelationship(ctx,{termId:term,postId:post}));
  await t.run(ctx=>deleteWithMediaReferences(ctx,"posts",post));
  expect(await count()).toMatchObject({count:0,countReady:true});
  await t.run(ctx=>deleteTermRelationship(ctx,rel2));
  expect(await count()).toMatchObject({count:0,countReady:true});
});
test("bounded repair deduplicates across pages, restarts concurrent scans and ignores obsolete continuations",async()=>{
  const t=convexTest({schema,modules});
  const {term,posts}=await t.run(async ctx=>{
    const term=await ctx.db.insert("terms",termData("legacy")); const author=await ctx.db.insert("users",account); const posts=[];
    for(let i=0;i<22;i++){
      const post=await ctx.db.insert("posts",article(author,{content:"x".repeat(40_000)}));posts.push(post);
      for(let j=0;j<9;j++)await ctx.db.insert("termRelationships",{termId:term,postId:post});
    }
    const draft=await ctx.db.insert("posts",article(author,{status:"draft"}));
    await ctx.db.insert("termRelationships",{termId:term,postId:draft});
    const page=await ctx.db.insert("posts",article(author,{type:"page"}));
    await ctx.db.insert("termRelationships",{termId:term,postId:page});
    return {term,posts};
  });
  const first=(await t.run(ctx=>beginTermCountRepair(ctx,term)))!;
  expect(await t.run(ctx=>ctx.db.get(term))).toMatchObject({countReady:false});
  const next=await t.run(ctx=>advanceTermCountRepair(ctx,first)); expect(next).toBeDefined();
  expect(await t.run(ctx=>advanceTermCountRepair(ctx,first))).toBeNull();
  await t.run(ctx=>patchWithMediaReferences(ctx,"posts",posts[0]!,{status:"draft"}));
  const restart=(await t.run(ctx=>advanceTermCountRepair(ctx,next!)))!;
  expect(restart.generation).not.toBe(first.generation); expect(restart.cursor).toBeNull();
  expect(await t.run(ctx=>advanceTermCountRepair(ctx,next!))).toBeNull();
  expect(await drain(t,restart)).toBeGreaterThan(20);
  expect(await t.run(ctx=>ctx.db.get(term))).toMatchObject({countReady:true,count:21});
  const duplicates=await t.run(ctx=>ctx.db.query("termRelationships").withIndex("by_post_term",q=>q.eq("postId",posts[1]!).eq("termId",term)).take(10));
  for(const rel of duplicates)await t.run(ctx=>deleteTermRelationship(ctx,rel._id));
  expect(await t.run(ctx=>ctx.db.get(term))).toMatchObject({countReady:true,count:20});
});
test("dynamic import moves invalidate both terms and restored generations cannot publish stale counts",async()=>{
  const t=convexTest({schema,modules});
  const {a,b,post}=await t.run(async ctx=>({a:await ctx.db.insert("terms",termData("a")),b:await ctx.db.insert("terms",termData("b")),post:await ctx.db.insert("posts",article(await ctx.db.insert("users",account)))}));
  await repair(t,a);await repair(t,b);
  const rel=await t.run(ctx=>insertTermRelationship(ctx,{termId:a,postId:post}));
  await t.run(ctx=>patchDynamicWithMediaReferences(ctx,rel,{termId:b}));
  expect(await t.run(ctx=>ctx.db.get(a))).toMatchObject({countReady:false});
  expect(await t.run(ctx=>ctx.db.get(b))).toMatchObject({countReady:false});
  await repair(t,a);await repair(t,b);
  expect(await t.run(ctx=>ctx.db.get(a))).toMatchObject({count:0,countReady:true});
  expect(await t.run(ctx=>ctx.db.get(b))).toMatchObject({count:1,countReady:true});
  const old=(await t.run(ctx=>beginTermCountRepair(ctx,b,true)))!;
  await t.run(ctx=>ctx.db.patch("terms",b,{countReady:undefined,countState:undefined,count:12345}));
  const fresh=(await t.run(ctx=>beginTermCountRepair(ctx,b)))!;
  expect(await t.run(ctx=>advanceTermCountRepair(ctx,old))).toBeNull();
  await drain(t,fresh);
  expect(await t.run(ctx=>ctx.db.get(b))).toMatchObject({count:1,countReady:true});
  const deleted=(await t.run(ctx=>beginTermCountRepair(ctx,b,true)))!;
  await t.run(ctx=>ctx.db.delete("terms",b));
  expect(await t.run(ctx=>advanceTermCountRepair(ctx,deleted))).toBeNull();
});

test("registered jobs rebuild more than one batch and recover a lost continuation", async()=>{
  const {getFunctionName}=await import("convex/server");
  const jobs=await import("../counts");
  const t=convexTest({schema,modules});
  const terms=await t.run(async ctx=>{
    const author=await ctx.db.insert("users",account), result=[];
    for(let i=0;i<19;i++){
      const term=await ctx.db.insert("terms",termData(`term-${i}`));result.push(term);
      const post=await ctx.db.insert("posts",article(author));
      await ctx.db.insert("termRelationships",{postId:post,termId:term});
    }
    return result;
  });
  const queue: {name:string,args:any}[]=[];
  async function invoke(name:string,args:any){
    await t.run(ctx=>(jobs[name as keyof typeof jobs] as any)._handler({...ctx,scheduler:{runAfter:async(_delay:number,ref:any,args:any)=>{queue.push({name:getFunctionName(ref).split(":")[1]!,args});return "scheduled";}}},args));
  }
  await invoke("all",{});
  expect(queue.filter(job=>job.name==="page").length).toBe(8);
  let ran=0;
  while(queue.length){if(++ran>100)throw new Error("Unbounded job chain");const job=queue.shift()!;await invoke(job.name,job.args);}
  for(const term of terms)expect(await t.run(ctx=>ctx.db.get(term))).toMatchObject({count:1,countReady:true});
  const lost=(await t.run(ctx=>beginTermCountRepair(ctx,terms[0]!,true)))!;
  await t.run(async ctx=>{const term=(await ctx.db.get(terms[0]!))!;await ctx.db.patch("terms",term._id,{countState:{...term.countState!,updatedAt:Date.now()-61_000}});});
  await invoke("sweep",{});
  expect(queue).toEqual([{name:"page",args:lost}]);
  await invoke(queue[0]!.name,queue.shift()!.args);
  expect(await t.run(ctx=>ctx.db.get(terms[0]!))).toMatchObject({count:1,countReady:true});
});
