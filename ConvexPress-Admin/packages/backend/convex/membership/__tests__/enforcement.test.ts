import { expect, test, setSystemTime } from "bun:test";
import { convexTest } from "convex-test";
import { getFunctionName, makeFunctionReference } from "convex/server";
import schema from "../../schema";
import * as maintenance from "../internals";
import * as repairs from "../enrollmentRepairs";
import { queueMembershipEnrollmentRepair } from "../enrollmentRepairs";
import { membershipGrantIsCurrent } from "../../helpers/membershipAuthority";
const NOW = 1800000000000;
const modules = {
 "./convex/_generated/api.js":()=>import("../../_generated/api.js"),
 "./convex/_generated/server.js":()=>import("../../_generated/server.js"),
 "./convex/membership/policyReads.ts":()=>import("../policyReads"),
 "./convex/membership/internals.ts":()=>import("../internals"),
 "./convex/membership/enrollmentRepairs.ts":()=>import("../enrollmentRepairs"),
};
async function fixture(courses=2) {
 const t=convexTest({schema,modules}), scheduled:Array<{name:string;args:any;delay:number}>=[];
 // Actual registered handler bodies and real Convex transactions/indexes. Only
 // the clock/dispatch transport is controlled so lost jobs can be replayed.
 const withScheduler=(ctx:any)=>({...ctx,scheduler:{runAfter:async(delay:number,fn:any,args:any)=>{scheduled.push({name:getFunctionName(fn),args,delay});return "fixture-scheduled";}}});
 const call=(name:string,args:any={})=>t.run(ctx=>(name in repairs?(repairs as any)[name]:(maintenance as any)[name])._handler(withScheduler(ctx),args));
 const ids=await t.run(async ctx=>{
  const user=await ctx.db.insert("users",{authSource:"local",email:"maintenance@example.invalid",emailVerified:true,status:"active",createdAt:NOW,updatedAt:NOW});
  const plugin=await ctx.db.insert("settings",{section:"plugins",values:{lmsEnabled:true,membershipEnabled:true},updatedAt:NOW,updatedBy:user});
  const plan=await ctx.db.insert("membership_plans",{title:"Membership",slug:"membership",status:"active",grantMode:"manual",priority:1,createdAt:NOW,updatedAt:NOW});
  const enrollmentIds=[];const courseIds=[];const ruleIds=[];
  for(let n=0;n<courses;n++){
   const course=await ctx.db.insert("lms_courses",{title:`Course ${n}`,slug:`course-${n}`,status:"published",accessMode:"members",authorId:user,createdAt:NOW,updatedAt:NOW});courseIds.push(course);
   ruleIds.push(await ctx.db.insert("membership_restriction_rules",{resourceType:"course",resourceIdOrKey:String(course),ruleMode:"allow_only",planIds:[plan],teaserMode:"hide",loginRequired:true,createdAt:NOW,updatedAt:NOW}));
   enrollmentIds.push(await ctx.db.insert("lms_enrollments",{userId:user,courseId:course,source:"membership_plan",membershipPlanId:plan,enrolledAt:NOW-1000,status:"active",createdAt:NOW,updatedAt:NOW}));
  }
  return {user,plugin,plan,enrollmentIds,courseIds,ruleIds};
 });
 const grant=(patch:any={})=>t.run(ctx=>ctx.db.insert("membership_grants",{userId:ids.user,planId:ids.plan,sourceType:"manual",status:"active",startsAt:NOW-1000,endsAt:NOW,createdAt:NOW,updatedAt:NOW,...patch}));
 const jobs=()=>t.run(ctx=>ctx.db.query("membership_enrollment_repairs").collect());
 const drain=async()=>{for(let n=0;n<100;n++){const next=(await jobs())[0];if(!next)return;await call("advance",{jobId:next._id,version:next.version});}throw Error("Repair did not finish: "+JSON.stringify(await jobs()));};
 const enrollments=()=>t.run(ctx=>ctx.db.query("lms_enrollments").collect());
 return {t,ids,scheduled,call,grant,jobs,drain,enrollments,queue:()=>t.run(ctx=>queueMembershipEnrollmentRepair(withScheduler(ctx),ids.user,ids.plan)),work:(args:any)=>repairs.work._handler({runMutation:(fn:any,a:any)=>call(getFunctionName(fn).split(":")[1]!,a)} as any,args)};
}
async function timed(run:()=>Promise<void>){setSystemTime(NOW);try{await run();}finally{setSystemTime();}}

test("real expiry handler bounds a large backlog, skips indefinite/future grants and atomically queues projection work",()=>timed(async()=>{
 const f=await fixture();
 for(let n=0;n<33;n++)await f.grant();
 const indefinite=await f.grant({endsAt:undefined});const future=await f.grant({endsAt:NOW+100000});
 const first=await f.call("expireGrants");expect(first.expiredCount).toBe(8);expect((await f.jobs()).length).toBe(1);
 expect(f.scheduled.some(x=>x.name==="membership/internals:expireGrants"&&x.delay===500)).toBe(true);
 for(let n=0;n<5;n++)await f.call("expireGrants");
 const grants=await f.t.run(ctx=>ctx.db.query("membership_grants").collect());expect(grants.filter(g=>g.status==="expired")).toHaveLength(33);
 expect(grants.find(g=>g._id===indefinite)!.status).toBe("active");expect(grants.find(g=>g._id===future)!.status).toBe("active");
 await f.drain();expect((await f.enrollments()).every(e=>e.status==="active")).toBe(true);
}));
test("byte budget stops large source rows; exact end and explicit grace boundaries never gain sweep-time grace",()=>timed(async()=>{
 const f=await fixture(0);await f.grant({metadata:{padding:"x".repeat(140*1024)}});await f.grant({metadata:{padding:"x".repeat(140*1024)}});
 expect((await f.call("expireGrants")).expiredCount).toBe(1);expect((await f.call("expireGrants")).expiredCount).toBe(1);
 const grace=await f.grant({graceEndsAt:NOW+1000});
 expect(membershipGrantIsCurrent({planId:f.ids.plan,status:"active",startsAt:NOW-1000,endsAt:NOW,graceEndsAt:NOW+1000},NOW)).toBe(true);
 expect((await f.call("expireGrants")).movedToGraceCount).toBe(1);
 setSystemTime(NOW+1000);expect((await f.call("expireGrants")).expiredCount).toBe(1);
 const row=await f.t.run(ctx=>ctx.db.get("membership_grants",grace));expect(row!.graceEndsAt).toBe(NOW+1000);expect(row!.status).toBe("expired");
 expect((await f.call("expireGrants")).expiredCount).toBe(0);
}));
test("projection processes one enrollment per transaction and duplicate/late jobs cannot repeat events",()=>timed(async()=>{
 const f=await fixture(3);await f.grant();await f.call("expireGrants");const job=(await f.jobs())[0]!;const args={jobId:job._id,version:job.version};
 await f.call("advance",args);expect((await f.enrollments()).filter(e=>e.status==="revoked")).toHaveLength(1);
 await f.call("advance",args);expect((await f.enrollments()).filter(e=>e.status==="revoked")).toHaveLength(1);
 await f.drain();expect((await f.enrollments()).every(e=>e.status==="revoked")).toBe(true);
 expect((await f.t.run(ctx=>ctx.db.query("events").collect())).length).toBe(3);expect(await f.jobs()).toHaveLength(0);
}));
test("retries use current replacement grants and current alternate-plan expiry, never stale status alone",()=>timed(async()=>{
 const f=await fixture(2);await f.grant();await f.call("expireGrants");
 const alternate=await f.t.run(async ctx=>{
  const plan=await ctx.db.insert("membership_plans",{title:"Alternate",slug:"alternate",status:"active",grantMode:"manual",priority:1,createdAt:NOW,updatedAt:NOW});
  for(const id of f.ids.ruleIds)await ctx.db.patch("membership_restriction_rules",id,{planIds:[f.ids.plan,plan]});return plan;
 });
 await f.grant({planId:alternate,endsAt:NOW+5000});await f.drain();
 for(const row of await f.enrollments()){expect(row.status).toBe("active");expect(row.membershipPlanId).toBe(alternate);expect(row.expiresAt).toBe(NOW+5000);}
 // A replacement on the original plan also supersedes a queued expiry decision.
 const own=await fixture(1);await own.grant();await own.call("expireGrants");await own.grant({endsAt:NOW+3000});await own.drain();expect((await own.enrollments())[0]!.expiresAt).toBe(NOW+3000);
}));
test("lost workers recover; coalesced work keeps progress; a deleted frontier does not restart the scan",()=>timed(async()=>{
 const f=await fixture(3);await f.grant();await f.call("expireGrants");const first=(await f.jobs())[0]!;
 await f.call("advance",{jobId:first._id,version:first.version});const progress=(await f.jobs())[0]!;expect(progress.afterId).not.toBeNull();
 await f.queue();const coalesced=(await f.jobs())[0]!;expect(coalesced.afterId).toBe(progress.afterId);expect(coalesced.restart).toBe(true);
 await f.t.run(ctx=>ctx.db.delete("lms_enrollments",progress.afterId as any));
 setSystemTime(NOW+60001);await f.call("recover");const recovered=(await f.jobs())[0]!;expect(recovered.version).toBe(progress.version+1);
 await f.call("advance",{jobId:progress._id,version:progress.version});expect((await f.jobs())[0]!.version).toBe(recovered.version);
 await f.drain();expect((await f.enrollments()).every(e=>e.status==="revoked")).toBe(true);
}));
test("failed projection rolls back enrollment writes and records bounded retry state in a separate transaction",()=>timed(async()=>{
 const f=await fixture(1);await f.grant();await f.t.run(ctx=>ctx.db.patch("lms_enrollments",f.ids.enrollmentIds[0]!,{sourceRef:"x".repeat(110000)}));await f.call("expireGrants");const job=(await f.jobs())[0]!;
 await f.work({jobId:job._id,version:job.version});const failed=(await f.jobs())[0]!;
 expect(failed.attempts).toBe(1);expect(failed.lastError).toContain("failed");expect(failed.nextRetryAt).toBe(NOW+60000);expect((await f.enrollments())[0]!.status).toBe("active");expect(await f.t.run(ctx=>ctx.db.query("events").collect())).toHaveLength(0);
 await f.t.run(ctx=>ctx.db.patch("lms_enrollments",f.ids.enrollmentIds[0]!,{sourceRef:undefined}));await f.drain();expect((await f.enrollments())[0]!.status).toBe("revoked");
}));
test("disabled plugins preserve repair jobs for recovery and never mutate enrollment projections",()=>timed(async()=>{
 const f=await fixture(1);await f.grant();await f.call("expireGrants");await f.t.run(ctx=>ctx.db.patch("settings",f.ids.plugin,{values:{membershipEnabled:false,lmsEnabled:true}}));
 const job=(await f.jobs())[0]!;await f.call("advance",{jobId:job._id,version:job.version});expect((await f.enrollments())[0]!.status).toBe("active");expect(await f.jobs()).toHaveLength(1);expect((await f.call("expireGrants")).expiredCount).toBe(0);
 await f.t.run(ctx=>ctx.db.patch("settings",f.ids.plugin,{values:{membershipEnabled:true,lmsEnabled:true}}));await f.drain();expect((await f.enrollments())[0]!.status).toBe("revoked");
}));
test("actual log retention uses bounded indexed deletes, preserves boundary rows, and honors keep forever",()=>timed(async()=>{
 const f=await fixture(0),cutoff=NOW-30*86400000;
 await f.t.run(async ctx=>{for(let n=0;n<35;n++)await ctx.db.insert("membership_access_log",{resourceType:"course",resourceIdOrKey:"fixture",allowed:false,matchingPlanIds:[],createdAt:cutoff-1});await ctx.db.insert("membership_access_log",{resourceType:"course",resourceIdOrKey:"boundary",allowed:true,matchingPlanIds:[],createdAt:cutoff});});
 expect((await f.call("trimAccessLog")).deleted).toBe(32);expect((await f.call("trimAccessLog")).deleted).toBe(3);expect((await f.call("trimAccessLog")).deleted).toBe(0);
 await f.t.run(ctx=>ctx.db.insert("settings",{section:"membership.general",values:{accessLogRetentionDays:0},updatedBy:f.ids.user,updatedAt:NOW}));
 expect((await f.call("trimAccessLog")).skipped).toBe("keep_forever");expect(await f.t.run(ctx=>ctx.db.query("membership_access_log").collect())).toHaveLength(1);
}));

test("a restored cursorless job rebuilds its horizon and finishes against current enrollments",()=>timed(async()=>{
 const f=await fixture(2);await f.grant();await f.call("expireGrants");const job=(await f.jobs())[0]!;
 await f.t.run(ctx=>ctx.db.patch("membership_enrollment_repairs",job._id,{version:job.version+1,afterTime:null,afterId:null,horizonTime:null,horizonId:null,restart:true,attempts:0,nextRetryAt:0}));
 await f.call("recover");await f.drain();expect(await f.jobs()).toHaveLength(0);expect((await f.enrollments()).every(e=>e.status==="revoked")).toBe(true);
}));

test("registered expiry and real scheduled actions drain enrollment repair end to end",()=>timed(async()=>{
 const f=await fixture(2);await f.grant();
 await f.t.mutation(makeFunctionReference<"mutation",Record<string,never>>("membership/internals:expireGrants"),{});
 // convex-test's finishAllScheduledFunctions expects synchronous fake-timer
 // advancement. Bun uses real timers here: await dispatch, then inspect the
 // actual scheduler records so an idle gap cannot masquerade as completion.
 for(let n=0;n<100;n++){
  await new Promise(resolve=>setTimeout(resolve,1));
  await f.t.finishInProgressScheduledFunctions();
  const scheduled=await f.t.run(ctx=>ctx.db.system.query("_scheduled_functions").collect());
  expect(scheduled.filter(row=>row.state.kind==="failed")).toHaveLength(0);
  if(scheduled.length && scheduled.every(row=>row.state.kind==="success"))break;
  if(n===99)throw Error("Scheduled repair did not finish: "+JSON.stringify(scheduled));
 }
 expect(await f.jobs()).toHaveLength(0);expect((await f.enrollments()).every(e=>e.status==="revoked")).toBe(true);
 expect(await f.t.run(ctx=>ctx.db.query("events").collect())).toHaveLength(2);
}));
