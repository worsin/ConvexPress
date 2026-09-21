import { expect, test, setSystemTime } from "bun:test";
import { convexTest } from "convex-test";
import { makeFunctionReference } from "convex/server";
import schema from "../../../schema";
const modules = {
  "./convex/_generated/api.js": () => import("../../../_generated/api.js"),
  "./convex/_generated/server.js": () => import("../../../_generated/server.js"),
  "./convex/extensions/forms/mutations.ts": () => import("../mutations"),
  "./convex/extensions/forms/confirmations.ts": () => import("../confirmations"),
  "./convex/extensions/forms/spam.ts": () => import("../spam"),
  "./convex/membership/policyReads.ts": () => import("../../../membership/policyReads"),
};
const ref = (name: string) => makeFunctionReference<any, any, any>(`extensions/forms/${name}`);
async function fixture() {
  const t = convexTest({ schema, modules });
  const ids = await t.run(async ctx => {
    const user = await ctx.db.insert("users", { email: "fixture@example.invalid", authSource: "local", status: "active", emailVerified: true, createdAt: 1, updatedAt: 1 });
    const plugin = await ctx.db.insert("settings", { section: "plugins", values: { formsEnabled: true, membershipEnabled: false }, updatedAt: 1, updatedBy: user });
    const group = await ctx.db.insert("fieldGroups", { title: "Fields", key: "fixture", locationRules: [], position: "normal", style: "default", labelPlacement: "top", instructionPlacement: "label", isActive: true, menuOrder: 0, createdBy: user, createdAt: 1, updatedAt: 1 });
    await ctx.db.insert("fieldDefinitions", { groupId: group, key: "email", name: "email", label: "Email", type: "email", required: true, settings: "{}", menuOrder: 0, createdAt: 1, updatedAt: 1 });
    const form = await ctx.db.insert("forms", { title: "Contact", slug: "contact", status: "published", fieldGroupId: group, settings: "{}", createdBy: user, createdAt: 1, updatedAt: 1 });
    await ctx.db.insert("form_confirmations", { formId: form, name: "Thanks", type: "message", content: "Thanks {field:email}", isDefault: true, order: 0, createdBy: user, updatedBy: user, createdAt: 1, updatedAt: 1 });
    return { form, user, plugin };
  });
  const submit = () => t.mutation(ref("mutations:submit"), { formId: ids.form, values: [{ fieldKey: "email", value: "visitor@example.invalid" }], isComplete: true, startedAt: Date.now() - 10000, honeypot: "" });
  const resolve = (submission: { submissionId: string; confirmationToken?: string }, extra: Record<string, unknown> = {}) => t.query(ref("confirmations:resolveConfirmation"), { formId: ids.form, submissionId: submission.submissionId, confirmationToken: submission.confirmationToken, ...extra });
  return { t, ids, submit, resolve };
}
test("a submission ID alone must not disclose answers through confirmation merge tags", async () => {
  const f = await fixture(), receipt = await f.submit();
  await expect(f.resolve({ submissionId: receipt.submissionId })).rejects.toThrow();
});

test("the real submitting caller receives a short-lived confirmation proof stored only as a hash", async () => {
  const f = await fixture(), receipt = await f.submit();
  expect(receipt.confirmationToken).toMatch(/^confirm_[a-f0-9]{64}$/);
  const stored = await f.t.run(ctx => ctx.db.get("form_submissions", receipt.submissionId));
  expect(stored!.confirmationTokenHash).not.toBe(receipt.confirmationToken);
  expect(stored!.confirmationTokenHash).toMatch(/^[a-f0-9]{64}$/);
  const result = await f.resolve(receipt);
  expect(result.renderedMessage).toContain("visitor@example.invalid");
  await expect(f.resolve({ submissionId: receipt.submissionId, confirmationToken: `confirm_${"0".repeat(64)}` })).rejects.toThrow();
  await expect(f.resolve({ submissionId: receipt.submissionId, confirmationToken: "x".repeat(10000) })).rejects.toThrow();
  try { setSystemTime(stored!.confirmationExpiresAt!); await expect(f.resolve(receipt)).rejects.toThrow(); }
  finally { setSystemTime(); }
});

test("confirmation proof cannot cross forms, submissions, current publication or completion state", async () => {
  const f = await fixture(), first = await f.submit(), second = await f.submit();
  await expect(f.resolve({ submissionId: second.submissionId, confirmationToken: first.confirmationToken })).rejects.toThrow();
  const other = await f.t.run(async ctx => { const form = await ctx.db.get("forms", f.ids.form); const { _id, _creationTime, ...value } = form!; return ctx.db.insert("forms", { ...value, slug: "other" }); });
  await expect(f.resolve(first, { formId: other })).rejects.toThrow();
  await f.t.run(ctx => ctx.db.patch("forms", f.ids.form, { status: "draft" }));
  await expect(f.resolve(first)).rejects.toThrow();
  await f.t.run(ctx => ctx.db.patch("forms", f.ids.form, { status: "published" }));
  await f.t.run(ctx => ctx.db.patch("form_submissions", first.submissionId, { status: "deleted" }));
  await expect(f.resolve(first)).rejects.toThrow();
});
