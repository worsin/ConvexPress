import { expect, test } from "bun:test";
import { convexTest } from "convex-test";
import schema from "../../schema";
import { readLearnerCounts, insertCountedProgress, patchCountedProgress, deleteCountedProgress } from "../progress/counts";
import { recoverProgressCounts, rebuildLearnerCount } from "../progress/countRecovery";
import { insertWithMediaReferences, deleteWithMediaReferences, patchWithMediaReferences, insertDynamicWithMediaReferences, patchDynamicWithMediaReferences, deleteDynamicWithMediaReferences } from "../../media/attachmentGuard";
import { RequestReadLedger } from "../../helpers/requestReadLedger";
const modules={"./convex/_generated/api.js":()=>import("../../_generated/api.js"),"./convex/_generated/server.js":()=>import("../../_generated/server.js")};
async function fixture(total=3){
 const t=convexTest({schema,modules});
 const ids=await t.run(async ctx=>{
  const user=await ctx.db.insert("users",{authSource:"local",email:"count@example.invalid",emailVerified:true,status:"active",createdAt:1,updatedAt:1});
  const other=await ctx.db.insert("users",{authSource:"local",email:"other@example.invalid",emailVerified:true,status:"active",createdAt:1,updatedAt:1});
  const course=await insertWithMediaReferences(ctx,"lms_courses",{title:"Learning",slug:"learning",status:"published",authorId:user,createdAt:1,updatedAt:1});
  const foreign=await insertWithMediaReferences(ctx,"lms_courses",{title:"Foreign",slug:"foreign",status:"published",authorId:user,createdAt:1,updatedAt:1});
  return {user,other,course,foreign,lessons:[] as any[]};
 });
 for(let base=0;base<total;base+=50)ids.lessons.push(...await t.run(async ctx=>{
  const list=[];for(let i=base;i<Math.min(total,base+50);i++)list.push(await insertWithMediaReferences(ctx,"lms_nodes",{courseId:ids.course,kind:"lesson",title:"Lesson "+i,position:i,createdAt:1,updatedAt:1}));return list;
 }));
 const source=(i=0,completed=true)=>({userId:ids.user,courseId:ids.course,nodeId:ids.lessons[i],completed});
 const read=()=>t.run(ctx=>readLearnerCounts(ctx,ids.user,ids.course));
 const recover=async()=>{for(let i=0;i<2000;i++){if((await t.run(recoverProgressCounts)).done)return;}throw Error("Recovery did not converge");};
 return{t,ids,source,read,recover};
}
test("normal writes maintain unique completion counts across duplicates, identity moves and final deletion",async()=>{
 const f=await fixture();
 const a=await f.t.run(ctx=>insertCountedProgress(ctx,f.source()));
 const b=await f.t.run(ctx=>insertDynamicWithMediaReferences(ctx,"lms_progress",{...f.source(),progressCountVersion:1}));
 expect(await f.read()).toEqual({state:"ready",completed:1,total:3,percent:33});
 await f.t.run(ctx=>patchDynamicWithMediaReferences(ctx,b,{completed:false}));
 expect(await f.read()).toMatchObject({completed:1});
 await f.t.run(ctx=>patchCountedProgress(ctx,a,{nodeId:f.ids.lessons[1]}));
 expect(await f.read()).toMatchObject({completed:1});
 await f.t.run(ctx=>deleteCountedProgress(ctx,a));
 expect(await f.read()).toMatchObject({completed:0});
 await f.t.run(ctx=>patchDynamicWithMediaReferences(ctx,b,{completed:true,userId:f.ids.other}));
 expect(await f.read()).toMatchObject({completed:0});
 expect(await f.t.run(ctx=>readLearnerCounts(ctx,f.ids.other,f.ids.course))).toMatchObject({completed:1});
 await f.t.run(ctx=>deleteDynamicWithMediaReferences(ctx,b));
 expect(await f.t.run(ctx=>readLearnerCounts(ctx,f.ids.other,f.ids.course))).toMatchObject({completed:0});
});
test("bounded import recovery deduplicates across cursor pages and rejects foreign-course and deleted nodes",async()=>{
 const f=await fixture(5);
 await f.t.run(async ctx=>{
  for(let i=0;i<29;i++)await ctx.db.insert("lms_progress",f.source(0));
  await ctx.db.insert("lms_progress",f.source(1));
  await ctx.db.insert("lms_progress",f.source(2));
  await ctx.db.insert("lms_progress",{...f.source(3),courseId:f.ids.foreign});
  await ctx.db.insert("lms_progress",{...f.source(4),userId:f.ids.other});
 });
 await f.t.run(ctx=>deleteWithMediaReferences(ctx,"lms_nodes",f.ids.lessons[2]));
 expect(await f.read()).toEqual({state:"preparing"});
 await f.recover();
 expect(await f.read()).toEqual({state:"ready",completed:2,total:4,percent:50});
 expect(await f.t.run(ctx=>readLearnerCounts(ctx,f.ids.user,f.ids.foreign))).toMatchObject({completed:0,total:0,percent:0});
});
test("curriculum changes invalidate ready counts immediately and recovery omits moved lessons",async()=>{
 const f=await fixture();await f.t.run(ctx=>insertCountedProgress(ctx,f.source()));
 expect(await f.read()).toMatchObject({completed:1});
 await f.t.run(ctx=>patchWithMediaReferences(ctx,"lms_nodes",f.ids.lessons[0],{courseId:f.ids.foreign}));
 expect(await f.read()).toEqual({state:"preparing"});
 await f.recover();
 expect(await f.read()).toEqual({state:"ready",completed:0,total:2,percent:0});
});
test("a source edit during a multi-batch rebuild restarts its revision instead of combining snapshots",async()=>{
 const f=await fixture(12);
 const rows=await f.t.run(async ctx=>{const rows=[];for(let i=0;i<12;i++)rows.push(await ctx.db.insert("lms_progress",f.source(i)));return rows;});
 for(let i=0;i<2;i++)await f.t.run(recoverProgressCounts);
 const counter=await f.t.run(ctx=>ctx.db.query("lms_progress_counts").withIndex("by_user_course",q=>q.eq("userId",f.ids.user).eq("courseId",f.ids.course)).unique());
 expect(counter?.state).toBe("pending");
 await f.t.run(ctx=>patchCountedProgress(ctx,rows[0],{completed:false}));
 await f.recover();
 expect(await f.read()).toEqual({state:"ready",completed:11,total:12,percent:92});
 await f.t.run(ctx=>rebuildLearnerCount(ctx,counter!._id));
 expect(await f.read()).toMatchObject({completed:11});
});
test("a thousand-lesson ready summary has fixed read cost and heartbeat metadata cannot restart recovery",async()=>{
 const f=await fixture(1000);
 const row=await f.t.run(ctx=>insertCountedProgress(ctx,f.source()));
 const ledger=new RequestReadLedger({queries:4,documents:2,bytes:2048,documentBytes:1024});
 expect(await f.t.run(ctx=>readLearnerCounts(ctx,f.ids.user,f.ids.course,ledger))).toEqual({state:"ready",completed:1,total:1000,percent:0});
 expect(ledger.documents).toBe(2);
 const before=await f.t.run(ctx=>ctx.db.query("lms_progress_counts").first());
 await f.t.run(ctx=>patchCountedProgress(ctx,row,{lastSeenAt:123,timeSpentSec:50}));
 expect(await f.t.run(ctx=>ctx.db.query("lms_progress_counts").first())).toEqual(before);
});

test("repeated maintenance triggers share one job and canceled or stale generations cannot fork it", async()=>{
 const {queueProgressRecovery,runProgressRecoveryStep}=await import("../progress/countMaintenance");
 const f=await fixture();
 try {
 for(let i=0;i<10;i++)await f.t.run(queueProgressRecovery);
 const first=await f.t.run(ctx=>ctx.db.query("lms_progress_maintenance").unique());
 expect(first?.generation).toBe(1);expect(first?.scheduledJobId).toBeDefined();
 const jobs=await f.t.run(ctx=>ctx.db.system.query("_scheduled_functions").collect());
 expect(jobs.filter(j=>j.state.kind==="pending")).toHaveLength(1);
 await f.t.run(ctx=>ctx.scheduler.cancel(first!.scheduledJobId!));
 await f.t.run(queueProgressRecovery);
 const second=await f.t.run(ctx=>ctx.db.query("lms_progress_maintenance").unique());
 expect(second?.generation).toBe(2);expect(second?.scheduledJobId).not.toBe(first?.scheduledJobId);
 expect(await f.t.run(ctx=>runProgressRecoveryStep(ctx,1))).toEqual({processed:0,done:false});
 expect(await f.t.run(ctx=>ctx.db.query("lms_progress_maintenance").unique())).toEqual(second);
 } finally {
  // This fixture tests queue ownership, not executing recovery. Do not leave a
  // scheduled callback to run after its fixture and contaminate the next test.
  await f.t.run(async ctx=>{
   for(const job of await ctx.db.system.query("_scheduled_functions").collect()){
    if(job.state.kind==="pending")await ctx.scheduler.cancel(job._id);
   }
  });
 }
});
