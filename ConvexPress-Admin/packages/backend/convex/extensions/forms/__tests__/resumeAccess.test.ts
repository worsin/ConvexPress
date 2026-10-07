import { expect, test, setSystemTime } from "bun:test";
import { convexTest } from "convex-test";
import { makeFunctionReference } from "convex/server";
import schema from "../../../schema";
import { DEFAULT_RESUME_TTL_MS } from "../queries";

const modules = {
  "./convex/_generated/api.js": () => import("../../../_generated/api.js"),
  "./convex/_generated/server.js": () => import("../../../_generated/server.js"),
  "./convex/extensions/forms/mutations.ts": () => import("../mutations"),
  "./convex/extensions/forms/queries.ts": () => import("../queries"),
  "./convex/extensions/forms/spam.ts": () => import("../spam"),
  "./convex/membership/policyReads.ts": () => import("../../../membership/policyReads"),
};
const ref = (name: string) => makeFunctionReference<any, any, any>(`extensions/forms/${name}`);
async function fixture(settings = {}) {
  const t = convexTest({ schema, modules });
  const ids = await t.run(async ctx => {
    const user = await ctx.db.insert("users", { email: "resume@example.invalid", authSource: "local", status: "active", emailVerified: true, createdAt: 1, updatedAt: 1 });
    const plugin = await ctx.db.insert("settings", { section: "plugins", values: { formsEnabled: true, membershipEnabled: true }, updatedAt: 1, updatedBy: user });
    const group = await ctx.db.insert("fieldGroups", { title: "Fields", key: "resume-fixture", locationRules: [], position: "normal", style: "default", labelPlacement: "top", instructionPlacement: "label", isActive: true, menuOrder: 0, createdBy: user, createdAt: 1, updatedAt: 1 });
    await ctx.db.insert("fieldDefinitions", { groupId: group, key: "note", name: "note", label: "Note", type: "text", required: true, settings: "{}", menuOrder: 0, createdAt: 1, updatedAt: 1 });
    const form = await ctx.db.insert("forms", { title: "Resume", slug: "resume", status: "published", fieldGroupId: group, settings: JSON.stringify(settings), createdBy: user, createdAt: 1, updatedAt: 1 });
    return { form, user, plugin };
  });
  const account = t.withIdentity({ subject: ids.user, tokenIdentifier: `https://convexpress-admin.local|${ids.user}` });
  const submit = (client = t, extra = {}) => client.mutation(ref("mutations:submit"), { formId: ids.form, values: [{ fieldKey: "note", value: "Private draft answer" }], isComplete: false, ...extra });
  const resume = (token: string, client = t) => client.query(ref("queries:resume"), { token });
  const snapshot = () => t.run(async ctx => ({ submissions: await ctx.db.query("form_submissions").collect(), answers: await ctx.db.query("fieldValues").collect() }));
  return { t, ids, account, submit, resume, snapshot };
}

test("an anonymous draft can resume and complete once using the server-issued token", async () => {
  const f = await fixture(), draft = await f.submit();
  expect((await f.resume(draft.resumeToken)).values).toEqual({ note: "Private draft answer" });
  const done = await f.submit(f.t, { resumeToken: draft.resumeToken, isComplete: true, startedAt: Date.now() - 10000 });
  expect(done.submissionId).toBe(draft.submissionId);
  expect(await f.resume(draft.resumeToken)).toBeNull();
  await expect(f.submit(f.t, { resumeToken: draft.resumeToken })).rejects.toThrow();
  expect((await f.snapshot()).submissions).toHaveLength(1);
});

for (const isComplete of [false, true]) test(`an expired draft cannot be ${isComplete ? "completed" : "updated"} with a fresh mount timestamp`, async () => {
  const f = await fixture(), draft = await f.submit(), before = await f.snapshot();
  try {
    setSystemTime(before.submissions[0].submittedAt! + DEFAULT_RESUME_TTL_MS + 1);
    expect(await f.resume(draft.resumeToken)).toEqual({ status: "expired" });
    await expect(f.submit(f.t, { resumeToken: draft.resumeToken, isComplete, startedAt: Date.now() - 10000, values: [{ fieldKey: "note", value: "Must not replace expired answer" }] })).rejects.toThrow();
    expect(await f.snapshot()).toEqual(before);
  } finally { setSystemTime(); }
});

test("adding a form-route login restriction revokes anonymous resume reads and writes", async () => {
  const f = await fixture(), draft = await f.submit(), before = await f.snapshot();
  await f.t.run(ctx => ctx.db.insert("membership_restriction_rules", { resourceType: "route", resourceIdOrKey: "/forms/resume", ruleMode: "allow_only", planIds: [], loginRequired: true, teaserMode: "hide", createdAt: 1, updatedAt: 1 }));
  expect(await f.t.query(ref("queries:getBySlug"), { slug: "resume" })).toBeNull();
  expect(await f.resume(draft.resumeToken)).toBeNull();
  await expect(f.submit(f.t, { resumeToken: draft.resumeToken })).rejects.toThrow();
  expect(await f.snapshot()).toEqual(before);
  expect((await f.resume(draft.resumeToken, f.account)).values.note).toBe("Private draft answer");
});

test("login-required draft reads require a current active account", async () => {
  const f = await fixture({ requireLogin: true }), draft = await f.submit(f.account);
  expect((await f.resume(draft.resumeToken, f.account)).values.note).toBe("Private draft answer");
  expect(await f.resume(draft.resumeToken)).toBeNull();
  await f.t.run(ctx => ctx.db.patch("users", f.ids.user, { status: "inactive" }));
  expect(await f.resume(draft.resumeToken, f.account)).toBeNull();
});

test("a stale identity for a deactivated account cannot write a login-required draft", async () => {
  const f = await fixture({ loginRequired: true }), draft = await f.submit(f.account), before = await f.snapshot();
  await f.t.run(ctx => ctx.db.patch("users", f.ids.user, { status: "inactive" }));
  await expect(f.submit(f.account, { resumeToken: draft.resumeToken })).rejects.toThrow();
  expect(await f.snapshot()).toEqual(before);
});
