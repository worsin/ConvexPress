import { expect, test, setSystemTime } from "bun:test";
import { convexTest } from "convex-test";
import { makeFunctionReference } from "convex/server";
import schema from "../../schema";
const modules = {
 "./convex/_generated/api.js": () => import("../../_generated/api.js"),
 "./convex/_generated/server.js": () => import("../../_generated/server.js"),
 "./convex/membership/policyReads.ts": () => import("../../membership/policyReads"),
 "./convex/lms/lessons/queries.ts": () => import("../lessons/queries"),
 "./convex/lms/enrollment/queries.ts": () => import("../enrollment/queries"),
 "./convex/lms/progress/mutations.ts": () => import("../progress/mutations"),
};
const ref = (path: string) => makeFunctionReference<any, any, any>(path);
const NOW = 1800000000000;
async function fixture() {
 const t = convexTest({ schema, modules });
 const ids = await t.run(async ctx => {
  const role = await ctx.db.insert("roles", { name:"Subscriber",slug:"subscriber",description:"Fixture",level:20,type:"customer",isDefault:true,isProtected:false,capabilities:[],pageAccess:[],status:"active",createdAt:NOW,updatedAt:NOW });
  const user = await ctx.db.insert("users", { authSource:"local",email:"member-expiry@example.invalid",emailVerified:true,roleId:role,status:"active",createdAt:NOW,updatedAt:NOW });
  const plugin = await ctx.db.insert("settings", { section:"plugins",values:{membershipEnabled:true,lmsEnabled:true},updatedAt:NOW,updatedBy:user });
  const course = await ctx.db.insert("lms_courses", { title:"Timed member course",slug:"timed-member-course",status:"published",accessMode:"members",authorId:user,createdAt:NOW,updatedAt:NOW });
  const lesson = await ctx.db.insert("lms_nodes", { courseId:course,kind:"lesson",title:"Protected lesson",position:1,bodyDoc:{type:"doc",content:[{type:"paragraph",content:[{type:"text",text:"MEMBER_ONLY_BODY"}]}]},createdAt:NOW,updatedAt:NOW });
  const plan = await ctx.db.insert("membership_plans", { title:"Member",slug:"member",status:"active",grantMode:"manual",priority:1,createdAt:NOW,updatedAt:NOW });
  const rule = await ctx.db.insert("membership_restriction_rules", { resourceType:"course",resourceIdOrKey:String(course),ruleMode:"allow_only",planIds:[plan],teaserMode:"hide",loginRequired:true,createdAt:NOW,updatedAt:NOW });
  const grant = await ctx.db.insert("membership_grants", { userId:user,planId:plan,sourceType:"manual",status:"active",startsAt:NOW-1000,endsAt:NOW+5000,createdAt:NOW,updatedAt:NOW });
  // Deliberately stale/infinite projection: only current grants can authorize it.
  const enrollment = await ctx.db.insert("lms_enrollments", { userId:user,courseId:course,source:"membership_plan",membershipPlanId:plan,enrolledAt:NOW-1000,status:"active",createdAt:NOW,updatedAt:NOW });
  return { user,plugin,course,lesson,plan,rule,grant,enrollment };
 });
 const client = t.withIdentity({ subject:String(ids.user),issuer:"https://convexpress-admin.local",tokenIdentifier:`https://convexpress-admin.local|${ids.user}` });
 return { t,ids,client,
  access:()=>client.query(ref("lms/enrollment/queries:canAccessCourse"),{courseId:ids.course}),
  lesson:()=>client.query(ref("lms/lessons/queries:getLessonForPlayer"),{nodeId:ids.lesson}),
 };
}
test("actual course and lesson queries deny expired grants before enrollment maintenance writes",async()=>{
 setSystemTime(NOW);
 try {
  const f=await fixture();expect((await f.access()).allowed).toBe(true);expect((await f.lesson()).bodyText).toBe("MEMBER_ONLY_BODY");
  setSystemTime(NOW+5000);expect((await f.access()).allowed).toBe(false);expect(await f.lesson()).toBeNull();
  await expect(f.client.mutation(ref("lms/progress/mutations:markComplete"),{nodeId:f.ids.lesson})).rejects.toThrow();
  const state=await f.t.run(async ctx=>({grant:await ctx.db.get("membership_grants",f.ids.grant),enrollment:await ctx.db.get("lms_enrollments",f.ids.enrollment),progress:await ctx.db.query("lms_progress").collect()}));
  expect(state.grant!.status).toBe("active");expect(state.enrollment!.status).toBe("active");expect(state.progress).toHaveLength(0);
 } finally {setSystemTime();}
});
test("future, revoked, deleted, expired-grace, archived-plan and disabled authority cannot use stale enrollments",async()=>{
 setSystemTime(NOW);
 try {
  for(const scenario of ["future","revoked","deleted","grace","plan","plan_missing","plugin","rule","rule_changed","user"] as const){
   const f=await fixture();await f.t.run(async ctx=>{
    if(scenario==="future")await ctx.db.patch("membership_grants",f.ids.grant,{startsAt:NOW+10000});
    if(scenario==="revoked")await ctx.db.patch("membership_grants",f.ids.grant,{revokedAt:NOW});
    if(scenario==="deleted")await ctx.db.delete("membership_grants",f.ids.grant);
    if(scenario==="grace")await ctx.db.patch("membership_grants",f.ids.grant,{status:"grace",graceEndsAt:NOW});
    if(scenario==="plan")await ctx.db.patch("membership_plans",f.ids.plan,{status:"archived"});
    if(scenario==="plan_missing")await ctx.db.delete("membership_plans",f.ids.plan);
    if(scenario==="rule_changed")await ctx.db.patch("membership_restriction_rules",f.ids.rule,{requiredCapabilities:["fixture.no_access"]});
    if(scenario==="plugin")await ctx.db.patch("settings",f.ids.plugin,{values:{lmsEnabled:true,membershipEnabled:false}});
    if(scenario==="rule")await ctx.db.delete("membership_restriction_rules",f.ids.rule);
    if(scenario==="user")await ctx.db.patch("users",f.ids.user,{status:"inactive"});
   });
   expect({scenario,allowed:(await f.access()).allowed}).toEqual({scenario,allowed:false});expect({scenario,lesson:await f.lesson()}).toEqual({scenario,lesson:null});
  }
 } finally {setSystemTime();}
});
test("current grace and a replacement grant on the same plan retain valid member access",async()=>{
 setSystemTime(NOW);
 try {
  const f=await fixture();await f.t.run(ctx=>ctx.db.patch("membership_grants",f.ids.grant,{status:"grace",endsAt:NOW-1,graceEndsAt:NOW+1000}));
  expect((await f.lesson()).bodyText).toBe("MEMBER_ONLY_BODY");setSystemTime(NOW+1000);expect(await f.lesson()).toBeNull();
  await f.t.run(ctx=>ctx.db.insert("membership_grants",{userId:f.ids.user,planId:f.ids.plan,sourceType:"manual",status:"active",startsAt:NOW+1000,endsAt:NOW+3000,createdAt:NOW,updatedAt:NOW}));
  expect((await f.lesson()).bodyText).toBe("MEMBER_ONLY_BODY");
 } finally {setSystemTime();}
});
test("independent manual and purchased enrollments survive membership expiry",async()=>{
 setSystemTime(NOW);
 try {
  for(const source of ["manual","purchase"] as const){const f=await fixture();await f.t.run(async ctx=>{
   await ctx.db.patch("membership_grants",f.ids.grant,{status:"revoked",revokedAt:NOW});await ctx.db.patch("lms_enrollments",f.ids.enrollment,{source,membershipPlanId:undefined});
  });expect((await f.access()).allowed).toBe(true);expect((await f.lesson()).bodyText).toBe("MEMBER_ONLY_BODY");}
 } finally {setSystemTime();}
});

test("oversized membership policy refuses the lesson instead of bypassing through active enrollment",async()=>{
 setSystemTime(NOW);
 try {
  const f=await fixture();await f.t.run(async ctx=>{
   for(let n=0;n<257;n++)await ctx.db.insert("membership_grants",{userId:f.ids.user,planId:f.ids.plan,sourceType:"manual",status:"active",startsAt:NOW-1,createdAt:NOW,updatedAt:NOW});
  });
  await expect(f.lesson()).rejects.toThrow("safe read budget");
 } finally {setSystemTime();}
});
