/**
 * Pricing cards that lead into the signup form (upstream PR 033): each offer's
 * link carries the form's plan choice, the form lets that field be filled
 * from the link, the public pricing read exposes only public fields, and the
 * admin can pick only a form that sells subscriptions.
 */
import { describe, expect, test } from "bun:test";
import { convexTest } from "convex-test";
import { api } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import schema from "../../schema";

const modules = {
  "./convex/_generated/api.js": () => import("../../_generated/api.js"),
  "./convex/_generated/server.js": () => import("../../_generated/server.js"),
  "./convex/commerceSubscriptions/offers.ts": () => import("../offers"),
  "./convex/commerceSubscriptions/pricingCards.ts": () => import("../pricingCards"),
  "./convex/commerceSubscriptions/adminCatalog.ts": () => import("../adminCatalog"),
  "./convex/extensions/forms/queries.ts": () => import("../../extensions/forms/queries"),
  "./convex/extensions/forms/spam.ts": () => import("../../extensions/forms/spam"),
  "./convex/membership/policyReads.ts": () => import("../../membership/policyReads"),
};

async function fixture(options: { planFieldSettings?: Record<string, unknown>; withAction?: boolean } = {}) {
  const t = convexTest({ schema, modules });
  const ids = await t.run(async (ctx) => {
    const roleId = await ctx.db.insert("roles", {
      name: "Administrator", slug: "administrator", description: "Test", level: 100, type: "internal", isDefault: false,
      isProtected: true, capabilities: ["manage_options"], pageAccess: [], status: "active", createdAt: 1, updatedAt: 1,
    });
    const admin = await ctx.db.insert("users", {
      authSource: "local", email: "admin@example.invalid", displayName: "Avery Admin", emailVerified: true, status: "active",
      roleId, createdAt: 1, updatedAt: 1,
    });
    await ctx.db.insert("settings", {
      section: "plugins", values: { commerceEnabled: true, commerceSubscriptionsEnabled: true, formsEnabled: true }, updatedAt: 1,
      updatedBy: admin,
    });
    const templateId = await ctx.db.insert("commerce_subscription_templates", {
      title: "Monthly", slug: "monthly", status: "active", billingInterval: "month", billingIntervalCount: 1, pausable: false,
      cancelAtPeriodEndDefault: true, version: 1, createdAt: 1, updatedAt: 1,
    });
    const offer = (slug: string, amount: number) =>
      ctx.db.insert("commerce_subscription_offers", {
        title: slug[0]!.toUpperCase() + slug.slice(1), slug, status: "active", templateId, sourceType: "custom", availableInCart: false,
        availableInDirectForms: true, availableForAdminProvisioning: true, createNewSubscription: true,
        allowAddToExistingSubscription: false, currencyCode: "USD", recurringAmount: amount, entitlementCodes: ["portal"],
        description: "Internal: margin is thin on this one", publicSummary: `For ${slug} practices`, createdAt: amount, updatedAt: 1,
      });
    const launch = await offer("launch", 29_900);
    const growth = await offer("growth", 59_900);
    const legacy = await offer("legacy", 9_900);
    const group = await ctx.db.insert("fieldGroups", {
      title: "Signup", key: "signup", locationRules: [], position: "normal", style: "default", labelPlacement: "top",
      instructionPlacement: "label", isActive: true, menuOrder: 0, createdBy: admin, createdAt: 1, updatedAt: 1,
    });
    await ctx.db.insert("fieldDefinitions", {
      groupId: group, key: "signup_package", name: "package", label: "Package", type: "radio", required: true,
      settings: JSON.stringify({ choices: [{ value: "launch", label: "Launch" }, { value: "growth", label: "Growth" }], ...options.planFieldSettings }),
      menuOrder: 0, createdAt: 1, updatedAt: 1,
    });
    const form = await ctx.db.insert("forms", {
      title: "Signup", slug: "signup", status: "published", fieldGroupId: group, settings: "{}", createdBy: admin, createdAt: 1,
      updatedAt: 1,
    });
    if (options.withAction !== false) {
      await ctx.db.insert("form_actions", {
        formId: form, type: "subscription", label: "Subscribe", enabled: true, order: 0,
        config: JSON.stringify({
          offerMode: "fromField", offerFieldName: "signup_package", offerFieldMap: { launch, growth }, emailFieldName: "signup_email",
          accountPolicy: "require_existing",
        }),
      });
    }
    return { admin, launch, growth, legacy, form };
  });
  const admin = t.withIdentity({ subject: ids.admin, tokenIdentifier: `https://convexpress-admin.local|${ids.admin}` });
  const linkFor = async (offerId: Id<"commerce_subscription_offers">) =>
    (await t.query(api.commerceSubscriptions.offers.listOffersForPricing, {})).find((offer) => offer._id === offerId)?.signup;
  return { t, ids, admin, linkFor };
}

describe("pricing cards lead into the signup form", () => {
  test("each mapped plan links into the form with its choice; the form lets the plan field be filled from the link", async () => {
    const f = await fixture();
    expect(await f.linkFor(f.ids.launch)).toBeNull();
    await f.admin.mutation(api.commerceSubscriptions.pricingCards.updatePricingCardConfig, {
      orderedOfferIds: [f.ids.launch, f.ids.growth], signupFormId: f.ids.form,
    });
    expect(await f.linkFor(f.ids.launch)).toEqual({ formSlug: "signup", param: "plan", value: "launch" });
    expect(await f.linkFor(f.ids.growth)).toEqual({ formSlug: "signup", param: "plan", value: "growth" });
    // The form does not sell this offer, so its card keeps the plain signup page.
    expect(await f.linkFor(f.ids.legacy)).toBeNull();

    const form = await f.t.query(api.extensions.forms.queries.getBySlug, { slug: "signup" });
    const planField = form?.fields.find((field) => field.key === "signup_package");
    expect(JSON.parse(planField?.settings ?? "{}")).toMatchObject({ allowDynamicPopulation: true, paramName: "plan" });

    // Saving other pricing settings keeps the form; null clears it.
    await f.admin.mutation(api.commerceSubscriptions.pricingCards.updatePricingCardConfig, { orderedOfferIds: [f.ids.growth] });
    expect(await f.linkFor(f.ids.growth)).toEqual({ formSlug: "signup", param: "plan", value: "growth" });
    await f.admin.mutation(api.commerceSubscriptions.pricingCards.updatePricingCardConfig, { orderedOfferIds: [], signupFormId: null });
    expect(await f.linkFor(f.ids.growth)).toBeNull();
  });

  test("a plan field that opted out of links keeps its settings, and links open the form without a plan", async () => {
    const f = await fixture({ planFieldSettings: { allowDynamicPopulation: false } });
    await f.admin.mutation(api.commerceSubscriptions.pricingCards.updatePricingCardConfig, { orderedOfferIds: [], signupFormId: f.ids.form });
    expect(await f.linkFor(f.ids.launch)).toEqual({ formSlug: "signup" });
    const form = await f.t.query(api.extensions.forms.queries.getBySlug, { slug: "signup" });
    expect(JSON.parse(form?.fields[0]?.settings ?? "{}").allowDynamicPopulation).toBe(false);
    expect((await f.admin.query(api.commerceSubscriptions.adminCatalog.listSignupForms, {}))[0]).toMatchObject({
      slug: "signup", planMode: "fromField", planFieldLabel: "Package",
    });
  });

  test("the public pricing read carries public fields only", async () => {
    const f = await fixture();
    const offer = (await f.t.query(api.commerceSubscriptions.offers.listOffersForPricing, {})).find((row) => row.slug === "legacy");
    expect(offer).toMatchObject({ title: "Legacy", publicSummary: "For legacy practices", recurringAmount: 9_900 });
    for (const privateKey of ["description", "entitlementCodes", "metadata", "availableInCart", "availableForAdminProvisioning"]) {
      expect(Object.keys(offer ?? {})).not.toContain(privateKey);
    }
  });

  test("only a published form with a subscription action can be chosen", async () => {
    const f = await fixture({ withAction: false });
    await expect(
      f.admin.mutation(api.commerceSubscriptions.pricingCards.updatePricingCardConfig, { orderedOfferIds: [], signupFormId: f.ids.form }),
    ).rejects.toThrow("must be published and have a subscription action");
    expect(await f.admin.query(api.commerceSubscriptions.adminCatalog.listSignupForms, {})).toEqual([]);
  });

  test("the form's plan field carries each plan as customers see it, for plan cards", async () => {
    const f = await fixture();
    await f.t.run(async (ctx) => {
      await ctx.db.patch("commerce_subscription_offers", f.ids.growth, { features: [{ text: "Priority support", highlighted: true }], trialDaysOverride: 14 });
    });
    const form = await f.t.query(api.extensions.forms.queries.getBySlug, { slug: "signup" });
    const planOffers = form?.fields.find((field) => field.key === "signup_package")?.planOffers;
    expect(planOffers).toEqual([
      {
        value: "launch", title: "Launch", publicSummary: "For launch practices", currencyCode: "USD", recurringAmount: 29_900,
        billingInterval: "month", billingIntervalCount: 1, features: [],
      },
      {
        value: "growth", title: "Growth", publicSummary: "For growth practices", currencyCode: "USD", recurringAmount: 59_900,
        billingInterval: "month", billingIntervalCount: 1, trialDays: 14, features: [{ text: "Priority support", highlighted: true }],
      },
    ]);
    // An archived plan drops out of the cards (its choice stays a plain option).
    await f.t.run((ctx) => ctx.db.patch("commerce_subscription_offers", f.ids.growth, { status: "archived" }));
    const after = await f.t.query(api.extensions.forms.queries.getBySlug, { slug: "signup" });
    expect(after?.fields[0]?.planOffers?.map((offer) => offer.value)).toEqual(["launch"]);
  });
});

