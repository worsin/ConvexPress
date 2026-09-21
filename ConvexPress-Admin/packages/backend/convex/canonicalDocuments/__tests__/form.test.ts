import { beginFormCountRepair, advanceFormCountRepair } from "../../helpers/formSubmissionCounts";
import { test, expect } from "bun:test";
import { convexTest } from "convex-test";
import { makeFunctionReference } from "convex/server";
import schema from "../../schema";
import { readForm } from "../form";
import { RequestReadLedger } from "../../helpers/requestReadLedger";
const modules = {
  "./convex/_generated/api.js": () => import("../../_generated/api.js"),
  "./convex/_generated/server.js": () => import("../../_generated/server.js"),
  "./convex/membership/policyReads.ts": () => import("../../membership/policyReads"),
  "./convex/extensions/forms/queries.ts": () => import("../../extensions/forms/queries"),
  "./convex/extensions/forms/mutations.ts": () => import("../../extensions/forms/mutations"),
};
async function fixture() {
  const t = convexTest({ schema, modules });
  const ids = await t.run(async ctx => {
    const user = await ctx.db.insert("users", { authSource: "local", email: "private-owner@example.invalid", emailVerified: true, status: "active", createdAt: 1, updatedAt: 1 });
    const plugins = await ctx.db.insert("settings", { section: "plugins", values: { formsEnabled: true, membershipEnabled: false }, updatedAt: 1, updatedBy: user });
    const group = await ctx.db.insert("fieldGroups", { title: "Private group title", key: "form", description: "Private group notes", locationRules: [], position: "normal", style: "default", labelPlacement: "top", instructionPlacement: "label", isActive: true, menuOrder: 0, createdBy: user, createdAt: 1, updatedAt: 1 });
    const form = await ctx.db.insert("forms", { title: "Visit the studio", slug: "studio", status: "published", settings: '{"notificationRefs":["private-ref"]}', fieldGroupId: group, createdBy: user, createdAt: 1, updatedAt: 1 });
    const field = await ctx.db.insert("fieldDefinitions", { groupId: group, label: "Your email", name: "email", key: "email", type: "email", required: true, settings: "{}", menuOrder: 0, createdAt: 1, updatedAt: 1 });
    return { user, plugins, group, form, field };
  });
  return { t, ids };
}
test("form resolver projects the live public definition, schedule and quota without administrative metadata", async () => {
  const { t, ids } = await fixture();
  const result = await t.run(ctx => readForm(ctx, { form: ids.form }));
  expect(result.form?.fields.map(field => field.label)).toEqual(["Your email"]);
  expect(result.form?.settings).toBe("{}");
  expect(JSON.stringify(result)).not.toContain("private");
  expect(JSON.stringify(result)).not.toContain("createdBy");
  expect(result.form?.security.honeypotEnabled).toBe(true);
  const start = Date.now() + 60_000;
  await t.run(ctx => ctx.db.patch("forms", ids.form, { settings: JSON.stringify({ scheduleStart: start }) }));
  const scheduled = await t.run(ctx => readForm(ctx, { form: ids.form }));
  expect(scheduled.form?.availability.code).toBe("FORM_NOT_OPEN");
  expect(scheduled.nextChangeAt).toBe(start);
  await t.run(async ctx => {
    await ctx.db.patch("forms", ids.form, { settings: '{"entryLimit":1}' });
    await ctx.db.insert("form_submissions", { formId: ids.form, status: "complete", meta: "private answer metadata", createdAt: 1, updatedAt: 1 });
  });
  let countTask = await t.run(ctx => beginFormCountRepair(ctx, ids.form));
  while (countTask) countTask = await t.run(ctx => advanceFormCountRepair(ctx, countTask!));
  expect((await t.run(ctx => readForm(ctx, { form: ids.form }))).form?.availability.code).toBe("ENTRY_LIMIT_REACHED");
});
test("disabled, unpublished, malformed and route-restricted forms expose no fields; restricted direct submissions write nothing", async () => {
  const { t, ids } = await fixture();
  expect((await t.run(ctx => readForm(ctx, { form: "invalid" }))).form).toBeNull();
  await t.run(ctx => ctx.db.patch("forms", ids.form, { status: "draft" }));
  expect((await t.run(ctx => readForm(ctx, { form: ids.form }))).form).toBeNull();
  await t.run(async ctx => {
    await ctx.db.patch("forms", ids.form, { status: "published" });
    await ctx.db.patch("settings", ids.plugins, { values: { formsEnabled: false, membershipEnabled: false } });
  });
  expect((await t.run(ctx => readForm(ctx, { form: ids.form }))).form).toBeNull();
  await t.run(async ctx => {
    await ctx.db.patch("settings", ids.plugins, { values: { formsEnabled: true, membershipEnabled: true } });
    await ctx.db.insert("membership_restriction_rules", { resourceType: "route", resourceIdOrKey: "/forms/studio", ruleMode: "allow_only", planIds: [], teaserMode: "excerpt", loginRequired: true, createdAt: 1, updatedAt: 1 });
  });
  expect((await t.run(ctx => readForm(ctx, { form: ids.form }))).form).toBeNull();
  expect(await t.query(makeFunctionReference("extensions/forms/queries:getBySlug"), { slug: "studio" })).toBeNull();
  await expect(t.mutation(makeFunctionReference("extensions/forms/mutations:submit"), { formId: ids.form, values: [], isComplete: true })).rejects.toThrow("not available to your account");
  expect(await t.run(ctx => ctx.db.query("form_submissions").collect())).toEqual([]);
});
test("form source reads honor the document budget and never silently truncate required fields", async () => {
  const { t, ids } = await fixture();
  const budget = new RequestReadLedger({ queries: 3, documents: 50, bytes: 100_000, documentBytes: 50_000 });
  await expect(t.run(ctx => readForm(ctx, { form: ids.form }, budget))).rejects.toThrow("safe read budget");
  expect(budget.queries).toBe(3);
  await t.run(ctx => ctx.db.patch("fieldDefinitions", ids.field, { instructions: "a".repeat(8001) }));
  await expect(t.run(ctx => readForm(ctx, { form: ids.form }))).rejects.toThrow();
});
