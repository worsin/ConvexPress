/**
 * Managed records (upstream PR 073): a site's own code keeps some records in
 * shape — a signup form whose answers it parses, the plans it sells. Admin
 * edits are refused with a note saying where they're changed instead; the
 * site's code still writes them, and can hand a record back.
 */
import { expect, test } from "bun:test";
import { convexTest } from "convex-test";
import { api, internal } from "../../_generated/api";
import schema from "../../schema";

const modules = {
  "./convex/_generated/api.js": () => import("../../_generated/api.js"),
  "./convex/_generated/server.js": () => import("../../_generated/server.js"),
  "./convex/managedRecords/internals.ts": () => import("../internals"),
  "./convex/managedRecords/queries.ts": () => import("../queries"),
  "./convex/extensions/forms/mutations.ts": () => import("../../extensions/forms/mutations"),
  "./convex/extensions/forms/actions.ts": () => import("../../extensions/forms/actions"),
  "./convex/extensions/forms/confirmations.ts": () => import("../../extensions/forms/confirmations"),
  "./convex/customFields/mutations.ts": () => import("../../customFields/mutations"),
  "./convex/commerceSubscriptions/offers.ts": () => import("../../commerceSubscriptions/offers"),
  "./convex/commerceSubscriptions/mutations.ts": () => import("../../commerceSubscriptions/mutations"),
  "./convex/commerceSubscriptions/templates.ts": () => import("../../commerceSubscriptions/templates"),
};

const CAPABILITIES = [
  "manage_options", "form.update", "form.delete", "form.manage_actions", "form.manage_confirmations",
  "custom_field.update_group", "custom_field.delete_group", "custom_field.create_group",
];

async function fixture() {
  const t = convexTest({ schema, modules });
  const ids = await t.run(async (ctx) => {
    const roleId = await ctx.db.insert("roles", {
      name: "Administrator", slug: "administrator", description: "Fixture", level: 100, type: "internal", status: "active",
      isDefault: false, isProtected: true, capabilities: CAPABILITIES, pageAccess: [], createdAt: 1, updatedAt: 1,
    });
    const admin = await ctx.db.insert("users", { email: "admin@example.invalid", authSource: "local", status: "active", emailVerified: true, roleId, createdAt: 1, updatedAt: 1 });
    await ctx.db.insert("settings", { section: "plugins", values: { formsEnabled: true, commerceEnabled: true, commerceSubscriptionsEnabled: true }, updatedAt: 1, updatedBy: admin });
    const group = await ctx.db.insert("fieldGroups", {
      title: "Signup fields", key: "signup-fields", locationRules: [], position: "normal", style: "default", labelPlacement: "top",
      instructionPlacement: "label", isActive: true, menuOrder: 0, createdBy: admin, createdAt: 1, updatedAt: 1,
    });
    const field = await ctx.db.insert("fieldDefinitions", {
      groupId: group, key: "signup_npi", name: "npi", label: "Group NPI", type: "text", required: true, settings: "{}", menuOrder: 0, createdAt: 1, updatedAt: 1,
    });
    const form = await ctx.db.insert("forms", { title: "Signup", slug: "signup", status: "published", fieldGroupId: group, settings: "{}", createdBy: admin, createdAt: 1, updatedAt: 1 });
    const other = await ctx.db.insert("forms", { title: "Contact", slug: "contact", status: "published", settings: "{}", createdBy: admin, createdAt: 1, updatedAt: 1 });
    const template = await ctx.db.insert("commerce_subscription_templates", {
      title: "Monthly", slug: "monthly", status: "active", billingInterval: "month", billingIntervalCount: 1, pausable: false,
      cancelAtPeriodEndDefault: true, version: 1, createdAt: 1, updatedAt: 1,
    });
    const offer = await ctx.db.insert("commerce_subscription_offers", {
      title: "Practice", slug: "practice", status: "active", templateId: template, sourceType: "custom", availableInCart: false,
      availableInDirectForms: true, availableForAdminProvisioning: true, createNewSubscription: true, allowAddToExistingSubscription: false,
      currencyCode: "USD", recurringAmount: 29_900, entitlementCodes: ["doctor_portal"], createdAt: 1, updatedAt: 1,
    });
    return { admin, group, field, form, other, template, offer };
  });
  const admin = t.withIdentity({ subject: ids.admin, tokenIdentifier: `https://convexpress-admin.local|${ids.admin}` });
  const manage = async () => {
    const note = "Change it in the CaseMedix CRM under Billing.";
    for (const [tableName, recordId] of [
      ["form", ids.form], ["fieldGroup", ids.group], ["subscriptionOffer", ids.offer], ["subscriptionTemplate", ids.template],
    ] as const) {
      await t.mutation(internal.managedRecords.internals.setManaged, { tableName, recordId, system: "CaseMedix", note });
    }
  };
  return { t, ids, admin, manage };
}

test("admin edits of a managed record are refused, with who manages it and where it's changed", async () => {
  const f = await fixture();
  await f.manage();
  const managed = /managed by CaseMedix, so it can't be changed here\. Change it in the CaseMedix CRM under Billing\./;
  const refused = [
    () => f.admin.mutation(api.extensions.forms.mutations.update, { id: f.ids.form, title: "Renamed" }),
    () => f.admin.mutation(api.extensions.forms.mutations.unpublish, { id: f.ids.form }),
    () => f.admin.mutation(api.extensions.forms.mutations.remove, { id: f.ids.form }),
    () => f.admin.mutation(api.extensions.forms.confirmations.createConfirmation, { formId: f.ids.form, name: "Thanks", type: "message", content: "Thanks" }),
    () => f.admin.mutation(api.customFields.mutations.updateField, { fieldId: f.ids.field, label: "NPI" }),
    () => f.admin.mutation(api.customFields.mutations.deleteField, { fieldId: f.ids.field }),
    () => f.admin.mutation(api.commerceSubscriptions.offers.updateOffer, { offerId: f.ids.offer, title: "Cheaper" }),
    () => f.admin.mutation(api.commerceSubscriptions.offers.archiveOffer, { offerId: f.ids.offer }),
    () => f.admin.mutation(api.commerceSubscriptions.mutations.updateTemplate, { templateId: f.ids.template, title: "Weekly" }),
    () => f.admin.mutation(api.commerceSubscriptions.templates.archiveTemplate, { templateId: f.ids.template }),
  ];
  for (const attempt of refused) await expect(attempt()).rejects.toThrow(managed);

  // Records the site doesn't manage stay the admins'.
  await f.admin.mutation(api.extensions.forms.mutations.update, { id: f.ids.other, title: "Contact us" });
  const state = await f.t.run(async (ctx) => ({
    form: await ctx.db.get("forms", f.ids.form),
    other: await ctx.db.get("forms", f.ids.other),
    field: await ctx.db.get("fieldDefinitions", f.ids.field),
    offer: await ctx.db.get("commerce_subscription_offers", f.ids.offer),
  }));
  expect(state).toMatchObject({ form: { title: "Signup", status: "published" }, other: { title: "Contact us" }, field: { label: "Group NPI" }, offer: { title: "Practice", status: "active" } });
});

test("the admin's editors can show the note, and the site can hand a record back", async () => {
  const f = await fixture();
  expect(await f.admin.query(api.managedRecords.queries.forRecord, { tableName: "form", recordId: f.ids.form })).toBeNull();
  await f.manage();
  expect(await f.admin.query(api.managedRecords.queries.forRecord, { tableName: "form", recordId: f.ids.form })).toEqual({
    system: "CaseMedix",
    note: "Change it in the CaseMedix CRM under Billing.",
  });
  expect(await f.t.mutation(internal.managedRecords.internals.setManaged, { tableName: "form", recordId: f.ids.form, system: "CaseMedix", note: "Change it in the CaseMedix CRM under Billing." })).toEqual({ changed: false });
  await expect(f.t.query(api.managedRecords.queries.forRecord, { tableName: "form", recordId: f.ids.form })).rejects.toThrow(/Sign in/);

  expect(await f.t.mutation(internal.managedRecords.internals.clearManaged, { tableName: "form", recordId: f.ids.form })).toEqual({ changed: true });
  await f.admin.mutation(api.extensions.forms.mutations.update, { id: f.ids.form, title: "Renamed" });
  expect((await f.t.run(async (ctx) => ctx.db.get("forms", f.ids.form)))?.title).toBe("Renamed");
});
