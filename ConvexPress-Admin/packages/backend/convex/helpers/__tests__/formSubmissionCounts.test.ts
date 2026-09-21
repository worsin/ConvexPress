import {test,expect} from "bun:test";
import {convexTest} from "convex-test";
import {makeFunctionReference} from "convex/server";
import schema from "../../schema";
import {beginFormCountRepair,advanceFormCountRepair,initializeEmptyFormCount,insertCountedFormSubmission,patchCountedFormSubmission,deleteCountedFormSubmission,readCompletedFormCount,FORM_COUNT_PAGE_ROWS,type FormCountTask} from "../formSubmissionCounts";
import {readForm} from "../../canonicalDocuments/form";
import {RequestReadLedger} from "../requestReadLedger";
import {insertDynamicWithMediaReferences,patchDynamicWithMediaReferences,deleteDynamicWithMediaReferences} from "../../media/attachmentGuard";
const modules={
 "./convex/extensions/forms/spam.ts":()=>import("../../extensions/forms/spam"),
 "./convex/_generated/api.js":()=>import("../../_generated/api.js"),
 "./convex/_generated/server.js":()=>import("../../_generated/server.js"),
 "./convex/extensions/forms/mutations.ts":()=>import("../../extensions/forms/mutations"),
 "./convex/extensions/forms/queries.ts":()=>import("../../extensions/forms/queries"),
 "./convex/extensions/forms/counts.ts":()=>import("../../extensions/forms/counts"),
 "./convex/membership/policyReads.ts":()=>import("../../membership/policyReads"),
};
async function fixture(count=0){
 const t=convexTest({schema,modules});
 const ids=await t.run(async ctx=>{
  const user=await ctx.db.insert("users",{authSource:"local",email:"count-fixture@example.invalid",emailVerified:true,status:"active",createdAt:1,updatedAt:1});
  await ctx.db.insert("settings",{section:"plugins",values:{formsEnabled:true,membershipEnabled:false},updatedAt:1,updatedBy:user});
  const form=await ctx.db.insert("forms",{title:"Count fixture",slug:"count-fixture",status:"published",settings:"{}",createdBy:user,createdAt:1,updatedAt:1});
  const entries=[];
  for(let i=0;i<count;i++)entries.push(await ctx.db.insert("form_submissions",{formId:form,status:i%3===0?"partial":"complete",createdAt:i,updatedAt:i}));
  return {user,form,entries};
 });return {t,ids};
}
async function finish(t:ReturnType<typeof convexTest>,task:FormCountTask|null){let pages=0;while(task){task=await t.run(ctx=>advanceFormCountRepair(ctx,task!));if(++pages>1000)throw Error("Repair failed to converge");}return pages;}
async function truth(f:Awaited<ReturnType<typeof fixture>>){return f.t.run(async ctx=>({actual:(await ctx.db.query("form_submissions").withIndex("by_form_status",q=>q.eq("formId",f.ids.form).eq("status","complete")).collect()).length,count:await readCompletedFormCount(ctx,f.ids.form)}));}
test("large legacy forms rebuild in bounded pages and public quota checks use a constant-size read",async()=>{
 const f=await fixture(420);await f.t.run(ctx=>ctx.db.patch("forms",f.ids.form,{settings:'{"entryLimit":500}'}));
 expect((await f.t.run(ctx=>readForm(ctx,{form:f.ids.form}))).form?.availability.code).toBe("FORM_PREPARING");
 const task=await f.t.run(ctx=>beginFormCountRepair(ctx,f.ids.form));
 expect(await finish(f.t,task)).toBeGreaterThan(Math.floor(420/FORM_COUNT_PAGE_ROWS));
 expect(await truth(f)).toEqual({actual:280,count:280});
 // A result already containing >256 completed entries must fit the canonical
 // request ledger: no source-row scan is needed for the quota anymore.
 expect((await f.t.run(ctx=>readForm(ctx,{form:f.ids.form},new RequestReadLedger()))).form?.availability.open).toBe(true);
 await f.t.run(ctx=>ctx.db.patch("forms",f.ids.form,{settings:'{"entryLimit":280}'}));
 expect((await f.t.run(ctx=>readForm(ctx,{form:f.ids.form}))).form?.availability.code).toBe("ENTRY_LIMIT_REACHED");
});
test("repair accounts for writes before/after its frontier and fixed horizon without restarting",async()=>{
 const f=await fixture(90);let task=await f.t.run(ctx=>beginFormCountRepair(ctx,f.ids.form));const generation=task!.generation;
 task=await f.t.run(ctx=>advanceFormCountRepair(ctx,task!));expect(task!.generation).toBe(generation);
 await f.t.run(async ctx=>{
  await patchCountedFormSubmission(ctx,f.ids.entries[0],{status:"complete"});
  await deleteCountedFormSubmission(ctx,f.ids.entries[1]);
  await patchCountedFormSubmission(ctx,f.ids.entries[60],{status:"complete"});
  await deleteCountedFormSubmission(ctx,f.ids.entries[61]);
  const future=await insertCountedFormSubmission(ctx,{formId:f.ids.form,status:"complete",createdAt:1,updatedAt:1});
  await patchCountedFormSubmission(ctx,future,{status:"spam"});
  await insertCountedFormSubmission(ctx,{formId:f.ids.form,status:"complete",createdAt:1,updatedAt:1});
 });
 const stale=task!;task=await f.t.run(ctx=>advanceFormCountRepair(ctx,stale));
 expect(await f.t.run(ctx=>advanceFormCountRepair(ctx,stale))).toBeNull();
 await finish(f.t,task);const final=await truth(f);expect(final.count).toBe(final.actual);expect(final.count).toBe(61);
});
test("fresh, transferred, imported, patched and deleted submissions maintain exact transactional counts",async()=>{
 const f=await fixture();await f.t.run(ctx=>initializeEmptyFormCount(ctx,f.ids.form));
 const other=await f.t.run(async ctx=>{const form=await ctx.db.insert("forms",{title:"Other",slug:"other",status:"published",settings:"{}",createdBy:f.ids.user,createdAt:1,updatedAt:1});await initializeEmptyFormCount(ctx,form);return form;});
 await f.t.run(async ctx=>{
  const id=await insertCountedFormSubmission(ctx,{formId:f.ids.form,status:"partial",createdAt:1,updatedAt:1});
  await patchCountedFormSubmission(ctx,id,{status:"complete"});await patchCountedFormSubmission(ctx,id,{status:"complete"});
  expect(await readCompletedFormCount(ctx,f.ids.form)).toBe(1);
  await patchCountedFormSubmission(ctx,id,{formId:other});expect(await readCompletedFormCount(ctx,f.ids.form)).toBe(0);expect(await readCompletedFormCount(ctx,other)).toBe(1);
  await deleteCountedFormSubmission(ctx,id);expect(await readCompletedFormCount(ctx,other)).toBe(0);
  const imported=await insertDynamicWithMediaReferences(ctx,"form_submissions",{formId:f.ids.form,status:"complete",createdAt:1,updatedAt:1});
  expect(await readCompletedFormCount(ctx,f.ids.form)).toBe(1);
  await patchDynamicWithMediaReferences(ctx,imported,{status:"deleted"});expect(await readCompletedFormCount(ctx,f.ids.form)).toBe(0);
  await patchDynamicWithMediaReferences(ctx,imported,{status:"complete"});await deleteDynamicWithMediaReferences(ctx,imported);expect(await readCompletedFormCount(ctx,f.ids.form)).toBe(0);
 });
});
test("old generation jobs cannot overwrite a forced repair, and a deleted form cleans its state",async()=>{
 const f=await fixture(70);const old=await f.t.run(ctx=>beginFormCountRepair(ctx,f.ids.form));const fresh=await f.t.run(ctx=>beginFormCountRepair(ctx,f.ids.form,true));
 expect(await f.t.run(ctx=>advanceFormCountRepair(ctx,old!))).toBeNull();await finish(f.t,fresh);expect((await truth(f)).count).toBe(46);
 const again=await f.t.run(ctx=>beginFormCountRepair(ctx,f.ids.form,true));await f.t.run(ctx=>ctx.db.delete("forms",f.ids.form));
 expect(await f.t.run(ctx=>advanceFormCountRepair(ctx,again!))).toBeNull();expect(await f.t.run(ctx=>ctx.db.query("formSubmissionCounts").collect())).toEqual([]);
});
test("the actual public submit endpoint atomically enforces the final slot",async()=>{
 const f=await fixture();await f.t.run(async ctx=>{await initializeEmptyFormCount(ctx,f.ids.form);await ctx.db.patch("forms",f.ids.form,{settings:'{"entryLimit":1}'});});
 const ref=makeFunctionReference<"mutation">("extensions/forms/mutations:submit");
 const args={formId:f.ids.form,values:[],isComplete:true,startedAt:Date.now()-10_000,honeypot:""};
 const results=await Promise.allSettled([f.t.mutation(ref,args),f.t.mutation(ref,args)]);
 expect(results.map(result=>result.status==="fulfilled"?"fulfilled":String(result.reason))).toContain("fulfilled");
 expect(results.filter(result=>result.status==="fulfilled")).toHaveLength(1);
 expect(results.filter(result=>result.status==="rejected")).toHaveLength(1);
 expect(String((results.find(result=>result.status==="rejected") as PromiseRejectedResult).reason)).toContain("entry limit");
 expect(await truth(f)).toEqual({actual:1,count:1});
 const shown=await f.t.query(makeFunctionReference<"query">("extensions/forms/queries:getBySlug"),{slug:"count-fixture"});
 expect((shown as any).availability.code).toBe("ENTRY_LIMIT_REACHED");
});

test("repair observes a byte budget and resumes when the row at its frontier was deleted",async()=>{
 const f=await fixture(40);await f.t.run(async ctx=>{for(const id of f.ids.entries)await ctx.db.patch("form_submissions",id,{meta:"x".repeat(200_000)});});
 let task=await f.t.run(ctx=>beginFormCountRepair(ctx,f.ids.form));task=await f.t.run(ctx=>advanceFormCountRepair(ctx,task!));
 const frontier=task!.afterId!;expect(f.ids.entries.indexOf(frontier as any)).toBeLessThan(4);
 await f.t.run(ctx=>deleteCountedFormSubmission(ctx,frontier as any));await finish(f.t,task);
 const final=await truth(f);expect(final.count).toBe(final.actual);
});

test("an exactly full final page finishes without counting its endpoint twice",async()=>{
 for(const size of [32,64]){
  const f=await fixture(size);await f.t.run(async ctx=>{for(const id of f.ids.entries)await ctx.db.patch("form_submissions",id,{status:"complete"});});
  const task=await f.t.run(ctx=>beginFormCountRepair(ctx,f.ids.form));await finish(f.t,task);
  expect(await truth(f)).toEqual({actual:size,count:size});
 }
});
