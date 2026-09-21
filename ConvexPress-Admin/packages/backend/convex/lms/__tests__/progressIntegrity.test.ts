import { expect, test, setSystemTime } from "bun:test";
import { convexTest } from "convex-test";
import { makeFunctionReference } from "convex/server";
import schema from "../../schema";
import { completionPercent, summarizeCourseProgress } from "../progress/summary";
import { canUserAccessCourse } from "../access";
import { RequestReadLedger } from "../../helpers/requestReadLedger";
const modules = {
  "./convex/_generated/api.js": () => import("../../_generated/api.js"),
  "./convex/_generated/server.js": () => import("../../_generated/server.js"),
  "./convex/membership/policyReads.ts": () => import("../../membership/policyReads"),
  "./convex/lms/progress/mutations.ts": () => import("../progress/mutations"),
  "./convex/lms/progress/queries.ts": () => import("../progress/queries"),
};
const ref = (path: string) => makeFunctionReference<any, any, any>(path);
const NOW = 1800000000000;
async function fixture(count = 3, completed = 1) {
  const t = convexTest({ schema, modules });
  const ids = await t.run(async ctx => {
    const role = await ctx.db.insert("roles", { name: "Learner", slug: "learner", description: "Fixture", level: 20, type: "customer", isDefault: true, isProtected: false, capabilities: [], pageAccess: [], status: "active", createdAt: 1, updatedAt: 1 });
    const user = await ctx.db.insert("users", { authSource: "local", email: "progress@example.invalid", emailVerified: true, roleId: role, status: "active", createdAt: 1, updatedAt: 1 });
    const other = await ctx.db.insert("users", { authSource: "local", email: "other-progress@example.invalid", emailVerified: true, roleId: role, status: "active", createdAt: 1, updatedAt: 1 });
    await ctx.db.insert("settings", { section: "plugins", values: { lmsEnabled: true, membershipEnabled: true }, updatedBy: user, updatedAt: 1 });
    const certificate = await ctx.db.insert("lms_certificates", { title: "Course certificate", templateDoc: {}, orientation: "landscape", isActive: true, createdBy: user, createdAt: 1, updatedAt: 1 });
    const course = await ctx.db.insert("lms_courses", { title: "Progress course", slug: "progress-course", status: "published", accessMode: "open", progressionMode: "free_form", certificateId: certificate, authorId: user, createdAt: 1, updatedAt: 1 });
    const topic = await ctx.db.insert("lms_nodes", { courseId: course, kind: "topic", title: "Practice", position: 0, createdAt: 1, updatedAt: 1 });
    const lessons = [];
    for (let i = 0; i < count; i++) {
      const nodeId = await ctx.db.insert("lms_nodes", { courseId: course, parentId: topic, kind: "lesson", title: `Lesson ${i}`, position: i, createdAt: 1, updatedAt: 1 });
      lessons.push(nodeId);
      if (i < completed) await ctx.db.insert("lms_progress", { userId: user, courseId: course, nodeId, completed: true, completedAt: 1 });
    }
    return { user, other, role, course, topic, lessons, certificate };
  });
  const client = t.withIdentity({ subject: String(ids.user), issuer: "https://convexpress-admin.local", tokenIdentifier: `https://convexpress-admin.local|${ids.user}` });
  return { t, ids, client, summary: () => client.query(ref("lms/progress/queries:getCourseProgress"), { courseId: ids.course }) };
}

test("display percentages reserve 100 exclusively for every unique lesson", () => {
  expect(completionPercent(199, 200)).toBe(99);
  expect(completionPercent(999, 1000)).toBe(99);
  expect(completionPercent(200, 200)).toBe(100);
  expect(completionPercent(0, 0)).toBe(0);
  expect(() => completionPercent(2, 1)).toThrow();
  const nodes = [{ _id: "a", courseId: "course", kind: "lesson", position: 0, title: "Root" }, { _id: "b", courseId: "course", kind: "lesson", position: 1, title: "Next" }];
  const progress = [{ userId: "user", courseId: "course", nodeId: "a", completed: true }];
  const summary = summarizeCourseProgress("course", "user", nodes, [...progress, ...progress, { ...progress[0], nodeId: "deleted" }, { ...progress[0], userId: "other", nodeId: "b" }, { ...progress[0], courseId: "foreign", nodeId: "b" }]);
  expect(summary).toMatchObject({ total: 2, completedCount: 1, percent: 50, completedNodeIds: ["a"], nextNodeId: "b" });
});

test("registered completion cannot award a course or certificate at 199 of 200 lessons", async () => {
  const f = await fixture(200, 198);
  const result = await f.client.mutation(ref("lms/progress/mutations:markComplete"), { nodeId: f.ids.lessons[198] });
  expect(result).toEqual({ percent: 99, completed: 199, total: 200 });
  expect(await f.summary()).toMatchObject({ percent: 99, completedCount: 199, total: 200 });
  expect(await f.t.run(ctx => ctx.db.query("lms_course_completions").collect())).toEqual([]);
  expect(await f.t.run(ctx => ctx.db.query("lms_certificate_issues").collect())).toEqual([]);
  // Certificate rendering has its own acceptance; this final step checks completion authority.
  await f.t.run(ctx => ctx.db.patch(f.ids.course, { certificateId: undefined }));
  expect(await f.client.mutation(ref("lms/progress/mutations:markComplete"), { nodeId: f.ids.lessons[199] })).toEqual({ percent: 100, completed: 200, total: 200 });
  expect(await f.t.run(ctx => ctx.db.query("lms_course_completions").collect())).toHaveLength(1);
});

test("duplicate imported progress never increases completion credit and query/mutation agree", async () => {
  const f = await fixture(3, 1);
  await f.t.run(async ctx => {
    for (let i = 0; i < 4; i++) await ctx.db.insert("lms_progress", { userId: f.ids.user, courseId: f.ids.course, nodeId: f.ids.lessons[0], completed: true });
  });
  const result = await f.client.mutation(ref("lms/progress/mutations:markComplete"), { nodeId: f.ids.lessons[1] });
  expect(result).toEqual({ percent: 67, completed: 2, total: 3 });
  expect(await f.summary()).toMatchObject({ percent: 67, completedCount: 2, total: 3 });
  expect(await f.t.run(ctx => ctx.db.query("lms_course_completions").collect())).toEqual([]);
  expect(await f.client.mutation(ref("lms/progress/mutations:markIncomplete"), {nodeId:f.ids.lessons[0]})).toEqual({percent:33,completed:1,total:3});
  expect(await f.summary()).toMatchObject({percent:33,completedCount:1});
});

test("inactive and banned tokens cannot read their progress even on an open course", async () => {
  const f = await fixture();
  expect((await f.summary()).completedCount).toBe(1);
  await expect(f.client.query(ref("lms/progress/queries:getCourseProgress"), {courseId:f.ids.course,userId:f.ids.other})).rejects.toThrow();
  for (const status of ["inactive", "banned"] as const) {
    await f.t.run(ctx => ctx.db.patch(f.ids.user, { status }));
    expect(await f.summary()).toMatchObject({ total: 0, completedCount: 0, completedNodeIds: [] });
    expect(await f.client.query(ref("lms/progress/queries:getNodeProgress"), { nodeId: f.ids.lessons[0] })).toBeNull();
  }
});

test("staff progress inspection never exposes inactive learners on open courses", async () => {
  const f = await fixture();
  await f.t.run(async ctx => {
    await ctx.db.patch(f.ids.role, {capabilities:["lms.enroll.manage"]});
    await ctx.db.patch(f.ids.other, {status:"inactive"});
  });
  expect(await f.client.query(ref("lms/progress/queries:canComplete"), {nodeId:f.ids.lessons[0],userId:f.ids.other})).toMatchObject({allowed:false,reason:"inactive_user"});
  expect(await f.client.query(ref("lms/progress/queries:getNodeProgress"), {nodeId:f.ids.lessons[0],userId:f.ids.other})).toBeNull();
  expect(await f.client.query(ref("lms/progress/queries:getCourseProgress"), {courseId:f.ids.course,userId:f.ids.other})).toMatchObject({total:0,completedCount:0});
});

test("membership enrollment leases retain grant deadlines and the caller's shared read budget", async () => {
  setSystemTime(NOW);
  try {
    const f = await fixture();
    await f.t.run(async ctx => {
      await ctx.db.patch(f.ids.course, {accessMode:"members"});
      const plan=await ctx.db.insert("membership_plans",{title:"Learning",slug:"learning",status:"active",grantMode:"manual",priority:1,createdAt:1,updatedAt:1});
      await ctx.db.insert("membership_restriction_rules",{resourceType:"course",resourceIdOrKey:f.ids.course,ruleMode:"allow_only",planIds:[plan],teaserMode:"hide",loginRequired:true,createdAt:1,updatedAt:1});
      await ctx.db.insert("membership_grants",{userId:f.ids.user,planId:plan,sourceType:"manual",status:"active",startsAt:NOW-1000,endsAt:NOW+3000,createdAt:1,updatedAt:1});
      await ctx.db.insert("lms_enrollments",{userId:f.ids.user,courseId:f.ids.course,source:"membership_plan",membershipPlanId:plan,status:"active",enrolledAt:NOW-1000,createdAt:1,updatedAt:1});
    });
    const budget=new RequestReadLedger();
    expect((await f.client.run(ctx=>canUserAccessCourse(ctx,{courseId:f.ids.course},budget))).allowed).toBe(true);
    expect(budget.authorizationRecheckAt).toBe(NOW+3000);
    const tiny=new RequestReadLedger({queries:1,documents:2,bytes:10000,documentBytes:10000});
    await expect(f.client.run(ctx=>canUserAccessCourse(ctx,{courseId:f.ids.course},tiny))).rejects.toThrow("safe read budget");
    setSystemTime(NOW+3000);
    expect((await f.client.run(ctx=>canUserAccessCourse(ctx,{courseId:f.ids.course},new RequestReadLedger()))).allowed).toBe(false);
  } finally {setSystemTime();}
});

test("learner access deadlines feed the caller's authorization lease and deny at the exact endpoint", async () => {
  setSystemTime(NOW);
  try {
    const f = await fixture();
    await f.t.run(ctx => ctx.db.patch(f.ids.course, { accessMode: "buy", endDate: NOW + 9000 }));
    await f.t.run(ctx => ctx.db.insert("lms_enrollments", { userId: f.ids.user, courseId: f.ids.course, source: "manual", status: "active", enrolledAt: NOW, expiresAt: NOW + 5000, createdAt: NOW, updatedAt: NOW }));
    const budget = new RequestReadLedger();
    expect((await f.client.run(ctx => canUserAccessCourse(ctx, { courseId: f.ids.course }, budget))).allowed).toBe(true);
    expect(budget.authorizationRecheckAt).toBe(NOW + 5000);
    setSystemTime(NOW + 5000);
    expect((await f.client.run(ctx => canUserAccessCourse(ctx, { courseId: f.ids.course }))).allowed).toBe(false);
    await f.t.run(ctx => ctx.db.patch(f.ids.course, { accessMode: "open" }));
    setSystemTime(NOW + 9000);
    expect(await f.client.run(ctx => canUserAccessCourse(ctx, { courseId: f.ids.course }))).toMatchObject({ allowed: false, reason: "ended" });
  } finally { setSystemTime(); }
});

test("completion and undo never reuse or modify a foreign-course progress row for the same lesson", async () => {
  const f = await fixture(3, 0);
  const foreign = await f.t.run(async ctx => {
    const course = await ctx.db.insert("lms_courses", {title:"Foreign",slug:"foreign-progress",status:"published",accessMode:"open",progressionMode:"free_form",authorId:f.ids.user,createdAt:1,updatedAt:1});
    return await ctx.db.insert("lms_progress", {userId:f.ids.user,courseId:course,nodeId:f.ids.lessons[0],completed:true,completedAt:1});
  });
  expect(await f.client.mutation(ref("lms/progress/mutations:markComplete"), {nodeId:f.ids.lessons[0]})).toEqual({percent:33,completed:1,total:3});
  expect(await f.client.mutation(ref("lms/progress/mutations:markIncomplete"), {nodeId:f.ids.lessons[0]})).toEqual({percent:0,completed:0,total:3});
  expect(await f.t.run(ctx=>ctx.db.get(foreign))).toMatchObject({completed:true,completedAt:1});
});
