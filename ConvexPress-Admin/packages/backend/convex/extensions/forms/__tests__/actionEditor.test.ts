/**
 * The form action editor's backend (upstream PR 039): what the editor offers
 * (fields with their choices, sellable plans with prices, the form's account
 * setting), the save-time checks that refuse a checkout action naming plans or
 * fields that don't exist, the optional email field, and removing conditions.
 */
import { describe, expect, test } from "bun:test";
import { convexTest } from "convex-test";
import { api } from "../../../_generated/api";
import schema from "../../../schema";

const modules = {
  "./convex/_generated/server.js": () => import("../../../_generated/server.js"),
  "./convex/_generated/api.js": () => import("../../../_generated/api.js"),
  "./convex/extensions/forms/actions.ts": () => import("../actions"),
};

async function fixture(settings: Record<string, unknown> = {}) {
  const t = convexTest({ schema, modules });
  const ids = await t.run(async (ctx) => {
    const roleId = await ctx.db.insert("roles", {
      name: "Administrator", slug: "administrator", description: "Test", level: 100, type: "internal", isDefault: false,
      isProtected: true, capabilities: ["manage_options", "form.manage_actions"], pageAccess: [], status: "active", createdAt: 1, updatedAt: 1,
    });
    const admin = await ctx.db.insert("users", {
      authSource: "local", email: "admin@example.invalid", emailVerified: true, status: "active", roleId, createdAt: 1, updatedAt: 1,
    });
    await ctx.db.insert("settings", {
      section: "plugins", values: { formsEnabled: true, customFieldsEnabled: true, commerceEnabled: true, commerceSubscriptionsEnabled: true },
      updatedAt: 1, updatedBy: admin,
    });
    const group = await ctx.db.insert("fieldGroups", {
      title: "Signup", key: "signup", locationRules: [], position: "normal", style: "default", labelPlacement: "top",
      instructionPlacement: "label", isActive: true, menuOrder: 0, createdBy: admin, createdAt: 1, updatedAt: 1,
    });
    const field = (key: string, type: string, menuOrder: number, fieldSettings: Record<string, unknown> = {}) =>
      ctx.db.insert("fieldDefinitions", {
        groupId: group, label: key === "plan" ? "Package" : key === "email" ? "Your email" : "Promo code", name: key, key, type,
        required: false, settings: JSON.stringify(fieldSettings), menuOrder, createdAt: 1, updatedAt: 1,
      });
    await field("email", "email", 1);
    await field("plan", "radio", 0, { choices: [{ value: "launch", label: "Launch" }, { value: "growth", label: "Growth" }, { value: "custom" }] });
    await field("promo", "text", 2);
    const formId = await ctx.db.insert("forms", {
      title: "Signup", slug: "signup", status: "published", settings: JSON.stringify(settings), fieldGroupId: group, createdBy: admin,
      createdAt: 1, updatedAt: 1,
    });
    const template = await ctx.db.insert("commerce_subscription_templates", {
      title: "Monthly", slug: "monthly", status: "active", billingInterval: "month", billingIntervalCount: 1, trialDays: 7, pausable: true,
      cancelAtPeriodEndDefault: true, version: 1, createdAt: 1, updatedAt: 1,
    });
    const offer = (title: string, amount: number, status: "active" | "draft" | "archived") =>
      ctx.db.insert("commerce_subscription_offers", {
        title, slug: title.toLowerCase(), status, templateId: template, sourceType: "custom", availableInCart: false,
        availableInDirectForms: true, availableForAdminProvisioning: true, createNewSubscription: true, allowAddToExistingSubscription: false,
        currencyCode: "USD", recurringAmount: amount, createdAt: 1, updatedAt: 1,
      });
    const growth = await offer("Growth", 59_900, "active");
    const launch = await offer("Launch", 29_900, "active");
    const retired = await offer("Retired", 9_900, "archived");
    return { admin, formId, launch, growth, retired };
  });
  const admin = t.withIdentity({ subject: ids.admin, tokenIdentifier: `https://convexpress-admin.local|${ids.admin}` });
  return { t, ids, admin };
}

const subscription = (config: Record<string, unknown>) => JSON.stringify({ accountPolicy: "require_existing", couponMode: "none", ...config });

describe("action editor setup", () => {
  test("lists the form's fields with their choices, the sellable plans by price, and the account setting", async () => {
    const f = await fixture({ requireAccountToSubmit: true });
    const setup = await f.admin.query(api.extensions.forms.actions.actionEditorSetup, { formId: f.ids.formId });
    expect(setup?.account).toBe("at_end");
    expect(setup?.fields.map((field) => field.key)).toEqual(["plan", "email", "promo"]);
    expect(setup?.fields[0]?.choices).toEqual([
      { value: "launch", label: "Launch" },
      { value: "growth", label: "Growth" },
      { value: "custom", label: "custom" },
    ]);
    // Archived plans aren't offered; cheapest first; trial from the template.
    expect(setup?.offers.map((offer) => [offer.title, offer.recurringAmount, offer.trialDays, offer.billingInterval])).toEqual([
      ["Launch", 29_900, 7, "month"],
      ["Growth", 59_900, 7, "month"],
    ]);

    const open = await fixture();
    expect((await open.admin.query(api.extensions.forms.actions.actionEditorSetup, { formId: open.ids.formId }))?.account).toBe("none");
    const locked = await fixture({ requireLogin: true, requireAccountToSubmit: true });
    expect((await locked.admin.query(api.extensions.forms.actions.actionEditorSetup, { formId: locked.ids.formId }))?.account).toBe("required");
  });
});

describe("saving a checkout action", () => {
  test("refuses plans and fields that don't exist for this form, saying which", async () => {
    const f = await fixture();
    const save = (config: Record<string, unknown>) =>
      f.admin.mutation(api.extensions.forms.actions.createAction, {
        formId: f.ids.formId, type: "subscription", label: "Start subscription", config: subscription(config),
      });
    await expect(save({ offerMode: "fixed", offerId: f.ids.retired })).rejects.toThrow("Choose a plan that exists and isn't archived.");
    await expect(save({ offerMode: "fixed", offerId: "not-an-offer" })).rejects.toThrow("Choose a plan that exists and isn't archived.");
    await expect(save({ offerMode: "fromField", offerFieldName: "nope" })).rejects.toThrow("The plan field isn't on this form.");
    await expect(
      save({ offerMode: "fromField", offerFieldName: "plan", offerFieldMap: { launch: f.ids.launch, growth: f.ids.retired } }),
    ).rejects.toThrow(/choice .*growth.* leads to a plan that doesn't exist or is archived/);
    await expect(save({ offerMode: "fixed", offerId: f.ids.launch, emailFieldName: "phone" })).rejects.toThrow("The email field isn't on this form.");
    await expect(save({ offerMode: "fixed", offerId: f.ids.launch, couponMode: "fromField", couponFieldName: "missing" })).rejects.toThrow(
      "The coupon field isn't on this form.",
    );
  });

  test("the email field is optional for signed-in buyers and required for buyers identified by email", async () => {
    const f = await fixture({ requireAccountToSubmit: true });
    const saved = await f.admin.mutation(api.extensions.forms.actions.createAction, {
      formId: f.ids.formId, type: "subscription", label: "Start subscription",
      config: subscription({ offerMode: "fromField", offerFieldName: "plan", offerFieldMap: { launch: f.ids.launch, growth: f.ids.growth } }),
    });
    expect(saved?.label).toBe("Start subscription");
    await expect(
      f.admin.mutation(api.extensions.forms.actions.createAction, {
        formId: f.ids.formId, type: "subscription", label: "Guest checkout",
        config: subscription({ offerMode: "fixed", offerId: f.ids.launch, accountPolicy: "create_on_website" }),
      }),
    ).rejects.toThrow("Choose the email field");
  });

  test("conditions can be removed, so the action always runs again", async () => {
    const f = await fixture();
    const created = await f.admin.mutation(api.extensions.forms.actions.createAction, {
      formId: f.ids.formId, type: "subscription", label: "Start subscription",
      config: subscription({ offerMode: "fixed", offerId: f.ids.launch }),
      conditionalLogic: JSON.stringify({ action: "show", logic: "and", rules: [{ field: "plan", operator: "==", value: "launch" }] }),
    });
    if (!created) throw new Error("not created");
    expect(created.conditionalLogic).toBeDefined();
    const cleared = await f.admin.mutation(api.extensions.forms.actions.updateAction, { actionId: created._id, conditionalLogic: null });
    expect(cleared?.conditionalLogic).toBeUndefined();
  });
});
