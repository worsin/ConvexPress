/**
 * A draft keeps every valid answer. One mistyped answer used to make the whole
 * autosave fail ("Couldn't save — we'll retry", forever); now that answer is
 * held back (not written; its last valid value stays) and reported, and the
 * rest saves. A final submission still refuses invalid answers.
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

async function fixture() {
  const t = convexTest({ schema, modules });
  const ids = await t.run(async (ctx) => {
    const user = await ctx.db.insert("users", {
      email: "owner@example.invalid", authSource: "local", status: "active", emailVerified: true, createdAt: 1, updatedAt: 1,
    });
    await ctx.db.insert("settings", { section: "plugins", values: { formsEnabled: true }, updatedAt: 1, updatedBy: user });
    const group = await ctx.db.insert("fieldGroups", {
      title: "Fields", key: "held-back", locationRules: [], position: "normal", style: "default", labelPlacement: "top",
      instructionPlacement: "label", isActive: true, menuOrder: 0, createdBy: user, createdAt: 1, updatedAt: 1,
    });
    const field = (key: string, label: string, type: string, settings: Record<string, unknown> = {}) =>
      ctx.db.insert("fieldDefinitions", {
        groupId: group, key, name: key, label, type, required: true, settings: JSON.stringify(settings), menuOrder: 0, createdAt: 1, updatedAt: 1,
      });
    await field("practice", "Practice", "text");
    await field("npi", "Group NPI", "text", { format: "us-npi" });
    await field("site", "Website", "url");
    const form = await ctx.db.insert("forms", {
      title: "Signup", slug: "signup", status: "published", fieldGroupId: group, settings: "{}", createdBy: user, createdAt: 1, updatedAt: 1,
    });
    return { form };
  });
  const stored = (submissionId: string) =>
    t.run(async (ctx) =>
      Object.fromEntries(
        (await ctx.db.query("fieldValues").collect())
          .filter((row) => row.entityId === submissionId)
          .map((row) => [row.fieldKey, row.value]),
      ),
    );
  return { t, ids, stored };
}

test("a draft saves the valid answers and holds back the invalid ones, keeping their last valid value", async () => {
  const f = await fixture();
  const first = await f.t.mutation(api.extensions.forms.mutations.submit, {
    formId: f.ids.form,
    isComplete: false,
    values: [{ fieldKey: "practice", value: "Summit Spine" }, { fieldKey: "npi", value: "1234567893" }],
  });
  expect(first.heldBack).toBeUndefined();

  const second = await f.t.mutation(api.extensions.forms.mutations.submit, {
    formId: f.ids.form,
    isComplete: false,
    resumeToken: first.resumeToken,
    values: [
      { fieldKey: "practice", value: "Summit Spine & Rehab" },
      { fieldKey: "npi", value: "1234567890" },
      { fieldKey: "site", value: "summit spine" },
    ],
  });
  expect(second.submissionId).toBe(first.submissionId);
  expect(second.heldBack?.map((entry) => [entry.fieldKey, entry.label])).toEqual([["npi", "Group NPI"], ["site", "Website"]]);
  expect(await f.stored(second.submissionId)).toEqual({ practice: "Summit Spine & Rehab", npi: "1234567893" });
});

test("a final submission still refuses an invalid answer", async () => {
  const f = await fixture();
  await expect(
    f.t.mutation(api.extensions.forms.mutations.submit, {
      formId: f.ids.form,
      isComplete: true,
      startedAt: Date.now() - 10_000,
      values: [
        { fieldKey: "practice", value: "Summit Spine" },
        { fieldKey: "npi", value: "1234567890" },
        { fieldKey: "site", value: "https://summitspine.com" },
      ],
    }),
  ).rejects.toThrow("One or more fields are invalid.");
});
