/**
 * Entry reads through the real handlers (upstream PR 045): a completed
 * submission carries its confirmation token's hash and expiry, which the
 * admin entry list and entry detail must neither choke on (their return
 * validators rejected the extra fields, so the Entries screen crashed as
 * soon as one existed) nor send to the browser.
 */
import { describe, expect, test } from "bun:test";
import { convexTest } from "convex-test";
import { api } from "../../../_generated/api";
import schema from "../../../schema";

const modules = {
  "./convex/_generated/server.js": () => import("../../../_generated/server.js"),
  "./convex/_generated/api.js": () => import("../../../_generated/api.js"),
  "./convex/extensions/forms/queries.ts": () => import("../queries"),
};

async function fixture() {
  const t = convexTest({ schema, modules });
  const ids = await t.run(async (ctx) => {
    const roleId = await ctx.db.insert("roles", {
      name: "Administrator", slug: "administrator", description: "Test", level: 100, type: "internal", isDefault: false,
      isProtected: true, capabilities: ["manage_options", "form.view", "form.view_entries"], pageAccess: [], status: "active",
      createdAt: 1, updatedAt: 1,
    });
    const admin = await ctx.db.insert("users", {
      authSource: "local", email: "admin@example.invalid", emailVerified: true, status: "active", roleId, createdAt: 1, updatedAt: 1,
    });
    await ctx.db.insert("settings", { section: "plugins", values: { formsEnabled: true }, updatedAt: 1, updatedBy: admin });
    const groupId = await ctx.db.insert("fieldGroups", {
      title: "Signup", key: "signup", locationRules: [], position: "normal", style: "default", labelPlacement: "top",
      instructionPlacement: "label", isActive: true, menuOrder: 0, createdBy: admin, createdAt: 1, updatedAt: 1,
    });
    const field = (name: string, type: string, menuOrder: number) =>
      ctx.db.insert("fieldDefinitions", {
        groupId, label: name, name, key: `signup_${name}`, type, required: false, settings: "{}", menuOrder, createdAt: 1, updatedAt: 1,
      });
    await field("first_name", "text", 0);
    await field("last_name", "text", 1);
    await field("email", "email", 2);
    await field("practice", "text", 3);
    const formId = await ctx.db.insert("forms", {
      title: "Signup", slug: "signup", status: "published", settings: "{}", fieldGroupId: groupId, createdBy: admin, createdAt: 1, updatedAt: 1,
    });
    const submission = (createdAt: number, extra: Record<string, unknown> = {}) =>
      ctx.db.insert("form_submissions", {
        formId, status: "complete", read: false, starred: false, createdAt, updatedAt: createdAt, submittedAt: createdAt, completedAt: createdAt,
        ...extra,
      });
    const submissionId = await submission(10, { confirmationTokenHash: "c0ffee", confirmationExpiresAt: 600_010 });
    const answer = (entityId: string, name: string, value: string) =>
      ctx.db.insert("fieldValues", {
        entityType: "form_submission", entityId, fieldKey: `signup_${name}`, fieldName: name, value, updatedBy: "test", updatedAt: 1,
      });
    await answer(submissionId, "first_name", "Casey");
    await answer(submissionId, "last_name", "Quinn");
    await answer(submissionId, "email", "casey@example.invalid");
    // An entry with only an email, and one with only another answer.
    const emailOnly = await submission(20);
    await answer(emailOnly, "email", "robin@example.invalid");
    const practiceOnly = await submission(30);
    await answer(practiceOnly, "practice", "\"Northside Clinic\"");
    await submission(40);
    return { admin, formId, submissionId };
  });
  const admin = t.withIdentity({ subject: ids.admin, tokenIdentifier: `https://convexpress-admin.local|${ids.admin}` });
  return { t, ids, admin };
}

describe("entry reads", () => {
  test("the entry list returns a submission with a confirmation token, without the token's hash", async () => {
    const f = await fixture();
    const page = await f.admin.query(api.extensions.forms.queries.listSubmissions, {
      formId: f.ids.formId,
      paginationOpts: { numItems: 10, cursor: null },
    });
    // Newest first; each row says who it is from, from the answers.
    expect(page.page.map((row) => row.preview)).toEqual([
      { title: "No answers yet" },
      { title: "Northside Clinic" },
      { title: "robin@example.invalid" },
      { title: "Casey Quinn", detail: "casey@example.invalid" },
    ]);
    expect(page.page.map((row) => [row._id, row.status, row.read]).at(-1)).toEqual([f.ids.submissionId, "complete", false]);
    expect(JSON.stringify(page)).not.toContain("c0ffee");
    expect(JSON.stringify(page)).not.toContain("confirmation");

    const searched = await f.admin.query(api.extensions.forms.queries.listSubmissions, {
      formId: f.ids.formId,
      paginationOpts: { numItems: 10, cursor: null },
      read: false,
    });
    expect(searched.page).toHaveLength(4);
    expect(searched.page.at(-1)?.preview.title).toBe("Casey Quinn");
    expect(JSON.stringify(searched)).not.toContain("c0ffee");
  });

  test("the entry detail returns the submission without the token's hash", async () => {
    const f = await fixture();
    const detail = await f.admin.query(api.extensions.forms.queries.getSubmission, { id: f.ids.submissionId });
    expect(detail?.submission).toMatchObject({ _id: f.ids.submissionId, status: "complete", completedAt: 10 });
    expect(JSON.stringify(detail)).not.toContain("c0ffee");
  });
});
