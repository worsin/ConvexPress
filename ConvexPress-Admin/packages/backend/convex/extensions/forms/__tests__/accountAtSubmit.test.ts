/**
 * Forms that ask for an account at the end (`requireAccountToSubmit`,
 * upstream PR 032): anyone can open and fill the form and save drafts; only
 * the final submit needs an active account, which then owns the draft. The
 * public read says so, and exposes only the settings the website renders.
 */
import { expect, test } from "bun:test";
import { convexTest } from "convex-test";
import { api } from "../../../_generated/api";
import schema from "../../../schema";

const modules = {
  "./convex/_generated/api.js": () => import("../../../_generated/api.js"),
  "./convex/_generated/server.js": () => import("../../../_generated/server.js"),
  "./convex/extensions/forms/mutations.ts": () => import("../mutations"),
  "./convex/extensions/forms/queries.ts": () => import("../queries"),
  "./convex/extensions/forms/spam.ts": () => import("../spam"),
  "./convex/membership/policyReads.ts": () => import("../../../membership/policyReads"),
};

async function fixture(settings: Record<string, unknown>) {
  const t = convexTest({ schema, modules });
  const ids = await t.run(async (ctx) => {
    const user = await ctx.db.insert("users", {
      email: "new-customer@example.invalid", authSource: "local", status: "active", emailVerified: true, createdAt: 1, updatedAt: 1,
    });
    await ctx.db.insert("settings", { section: "plugins", values: { formsEnabled: true }, updatedAt: 1, updatedBy: user });
    const group = await ctx.db.insert("fieldGroups", {
      title: "Fields", key: "account-at-submit", locationRules: [], position: "normal", style: "default", labelPlacement: "top",
      instructionPlacement: "label", isActive: true, menuOrder: 0, createdBy: user, createdAt: 1, updatedAt: 1,
    });
    await ctx.db.insert("fieldDefinitions", {
      groupId: group, key: "practice", name: "practice", label: "Practice", type: "text", required: true, settings: "{}", menuOrder: 0,
      createdAt: 1, updatedAt: 1,
    });
    const form = await ctx.db.insert("forms", {
      title: "Signup", slug: "signup", status: "published", fieldGroupId: group, settings: JSON.stringify(settings), createdBy: user,
      createdAt: 1, updatedAt: 1,
    });
    return { form, user };
  });
  const account = t.withIdentity({ subject: ids.user, tokenIdentifier: `https://convexpress-admin.local|${ids.user}` });
  const values = [{ fieldKey: "practice", value: "Quinn Chiropractic" }];
  return { t, ids, account, values };
}

test("signed out, a visitor fills and saves the form; finishing needs an account, which then owns the draft", async () => {
  const f = await fixture({ requireAccountToSubmit: true, notificationRefs: ["private-ref"], confirmationRef: "private" });

  const publicForm = await f.t.query(api.extensions.forms.queries.getBySlug, { slug: "signup" });
  expect(publicForm?.availability).toMatchObject({ open: true, loginRequired: false, accountRequiredToSubmit: true });
  expect(JSON.parse(publicForm?.settings ?? "{}")).toEqual({ requireAccountToSubmit: true });

  const draft = await f.t.mutation(api.extensions.forms.mutations.submit, { formId: f.ids.form, values: f.values, isComplete: false });
  expect(draft.resumeToken).toBeTruthy();

  await expect(
    f.t.mutation(api.extensions.forms.mutations.submit, {
      formId: f.ids.form, values: f.values, isComplete: true, resumeToken: draft.resumeToken, startedAt: Date.now() - 10_000,
    }),
  ).rejects.toThrow("Create an account or sign in to finish.");

  const done = await f.account.mutation(api.extensions.forms.mutations.submit, {
    formId: f.ids.form, values: f.values, isComplete: true, resumeToken: draft.resumeToken, startedAt: Date.now() - 10_000,
  });
  expect(done.submissionId).toBe(draft.submissionId);
  const submission = await f.t.run((ctx) => ctx.db.get(draft.submissionId));
  expect(submission).toMatchObject({ status: "complete", userId: f.ids.user });
});

test("an inactive account cannot finish, and login-required forms keep requiring sign-in up front", async () => {
  const f = await fixture({ requireAccountToSubmit: true });
  await f.t.run((ctx) => ctx.db.patch("users", f.ids.user, { status: "inactive" }));
  await expect(
    f.account.mutation(api.extensions.forms.mutations.submit, {
      formId: f.ids.form, values: f.values, isComplete: true, startedAt: Date.now() - 10_000,
    }),
  ).rejects.toThrow("Create an account or sign in to finish.");

  const strict = await fixture({ requireLogin: true, requireAccountToSubmit: true });
  const publicForm = await strict.t.query(api.extensions.forms.queries.getBySlug, { slug: "signup" });
  expect(publicForm?.availability).toMatchObject({ loginRequired: true, accountRequiredToSubmit: false });
  await expect(
    strict.t.mutation(api.extensions.forms.mutations.submit, { formId: strict.ids.form, values: strict.values, isComplete: false }),
  ).rejects.toThrow("Please sign in to submit this form.");
});
