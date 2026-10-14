/**
 * Commerce Subscriptions — Offers CRUD (Wave 2).
 *
 * Manages the "Offer" (the sellable package — Starter / Growth / Scale /
 * custom). Offers are the consumer-facing thing; contracts reference an
 * offer via items.sourceOfferId, and the pricing card page renders offers
 * in the configured order.
 *
 * Immutability invariant (Rule #9 of the expert profile):
 *   Once ANY contract references an offer via `commerce_subscription_items.
 *   sourceOfferId`, the following fields become LOCKED:
 *     - recurringAmount
 *     - setupFeeAmount
 *     - currencyCode
 *     - templateId
 *     - minimumQuantity / maximumQuantity
 *   Features, visibility, title, description, excludedPlanFeatureIds,
 *   and availability flags remain editable.
 *
 * Plugin gate: every public handler starts with
 *   await requirePluginEnabled(ctx, "commerceSubscriptions")
 * Admin handlers additionally require the "manage_options" capability.
 * Wave 7 will swap in the fine-grained
 *   commerceSubscriptions.offers.manage
 * capability.
 */

import type { WithoutSystemFields } from "convex/server";
import { ConvexError, v } from "convex/values";

import type { Doc, Id } from "../_generated/dataModel";
import { mutation, query, type QueryCtx } from "../_generated/server";
import { requireCan } from "../helpers/permissions";
import { parseOptionalJsonObjectArgument } from "../helpers/jsonArgs";
import { requirePluginEnabled, isPluginEnabled } from "../helpers/plugins";
import {
  commerceSubscriptionOfferStatusValidator,
  commerceSubscriptionOfferSourceTypeValidator,
} from "../schema/commerceSubscriptions";
import { requireCommerceSubscriptionsEnabled } from "./helpers";
import { getDisplayableBenefitsForCodesHelper } from "../membership/helpers";
import { displayableBenefitValidator } from "../membership/validators";
import { actionPlan, choiceForOffer, planParam, type ActionPlan } from "../extensions/forms/planLinks";

import { commerceSubscriptionsDocs } from "../schema/commerceSubscriptions.docs.generated";
// ─── Shared shape validators ────────────────────────────────────────────────

const featureValidator = v.object({
  text: v.string(),
  highlighted: v.optional(v.boolean()),
  icon: v.optional(v.string()),
});

// ─── Immutability check ─────────────────────────────────────────────────────

const OFFER_ACTIVE_CONTRACT_STATUSES: Doc<"commerce_subscriptions">["status"][] = [
  "active",
  "trialing",
  "past_due",
  "paused",
];

/**
 * Returns true if any active-ish contract item still references this offer.
 * Used to gate price/interval/template mutations — see immutability rule above.
 */
async function hasActiveContractReferencingOffer(
  ctx: { db: QueryCtx["db"] },
  offerId: Id<"commerce_subscription_offers">,
): Promise<boolean> {
  const items = await ctx.db
    .query("commerce_subscription_items")
    .withIndex("by_source_offer", (q) => q.eq("sourceOfferId", offerId))
    .collect();

  for (const item of items) {
    const subscription = await ctx.db.get(item.subscriptionId);
    if (!subscription) continue;
    if (OFFER_ACTIVE_CONTRACT_STATUSES.includes(subscription.status)) {
      return true;
    }
  }
  return false;
}

// ─── Mutations ──────────────────────────────────────────────────────────────

/**
 * Create a new subscription offer (admin).
 *
 * Validates that `templateId` exists. All Wave 1 fields are supported:
 *   `features`, `pricingCardVisible`, `excludedPlanFeatureIds`.
 */
export const createOffer = mutation({
  args: {
    title: v.string(),
    slug: v.string(),
    status: v.optional(commerceSubscriptionOfferStatusValidator),
    templateId: v.id("commerce_subscription_templates"),
    description: v.optional(v.string()),
    publicSummary: v.optional(v.string()),
    sourceType: commerceSubscriptionOfferSourceTypeValidator,
    productId: v.optional(v.id("commerce_products")),
    variantId: v.optional(v.id("commerce_product_variants")),
    bundleId: v.optional(v.id("commerce_bundles")),
    availableInCart: v.optional(v.boolean()),
    availableInDirectForms: v.optional(v.boolean()),
    availableForAdminProvisioning: v.optional(v.boolean()),
    createNewSubscription: v.optional(v.boolean()),
    allowAddToExistingSubscription: v.optional(v.boolean()),
    limitOnePerCustomer: v.optional(v.boolean()),
    currencyCode: v.string(),
    recurringAmount: v.number(),
    setupFeeAmount: v.optional(v.number()),
    trialDaysOverride: v.optional(v.number()),
    minimumQuantity: v.optional(v.number()),
    maximumQuantity: v.optional(v.number()),
    entitlementCodes: v.optional(v.array(v.string())),
    // Wave 1 extensions:
    features: v.optional(v.array(featureValidator)),
    pricingCardVisible: v.optional(v.boolean()),
    excludedPlanFeatureIds: v.optional(
      v.array(v.id("membership_plan_benefits")),
    ),
    /** Open-ended integrator metadata as a JSON object, JSON-encoded. */
    metadataJson: v.optional(v.string()),
  },
  returns: v.id("commerce_subscription_offers"),
  handler: async (ctx, args) => {
    await requirePluginEnabled(ctx, "commerceSubscriptions");
    await requireCommerceSubscriptionsEnabled(ctx);
    await requireCan(ctx, "manage_options");

    // Template must exist.
    const template = await ctx.db.get(args.templateId);
    if (!template) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Subscription template not found.",
      });
    }

    // Slug must be unique.
    const existingBySlug = await ctx.db
      .query("commerce_subscription_offers")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .first();
    if (existingBySlug) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: `An offer with slug "${args.slug}" already exists.`,
      });
    }

    const now = Date.now();
    return ctx.db.insert("commerce_subscription_offers", {
      title: args.title,
      slug: args.slug,
      status: args.status ?? "draft",
      templateId: args.templateId,
      description: args.description,
      publicSummary: args.publicSummary,
      sourceType: args.sourceType,
      productId: args.productId,
      variantId: args.variantId,
      bundleId: args.bundleId,
      availableInCart: args.availableInCart ?? true,
      availableInDirectForms: args.availableInDirectForms ?? true,
      availableForAdminProvisioning: args.availableForAdminProvisioning ?? true,
      createNewSubscription: args.createNewSubscription ?? true,
      allowAddToExistingSubscription:
        args.allowAddToExistingSubscription ?? false,
      limitOnePerCustomer: args.limitOnePerCustomer,
      currencyCode: args.currencyCode,
      recurringAmount: args.recurringAmount,
      setupFeeAmount: args.setupFeeAmount,
      trialDaysOverride: args.trialDaysOverride,
      minimumQuantity: args.minimumQuantity,
      maximumQuantity: args.maximumQuantity,
      entitlementCodes: args.entitlementCodes,
      features: args.features,
      pricingCardVisible: args.pricingCardVisible,
      excludedPlanFeatureIds: args.excludedPlanFeatureIds,
      metadata: parseOptionalJsonObjectArgument(args.metadataJson, "metadataJson"),
      createdAt: now,
      updatedAt: now,
    });
  },
});

/**
 * Update an existing subscription offer (admin).
 *
 * When ANY active-ish contract references this offer, the following fields
 * are IMMUTABLE and will throw IMMUTABLE_FIELD on attempted change:
 *   recurringAmount, setupFeeAmount, currencyCode, templateId,
 *   minimumQuantity, maximumQuantity.
 *
 * All other fields (including features, pricingCardVisible, title,
 * description, excludedPlanFeatureIds, availability flags, entitlementCodes)
 * remain editable.
 */
export const updateOffer = mutation({
  args: {
    offerId: v.id("commerce_subscription_offers"),
    // Always-editable:
    title: v.optional(v.string()),
    slug: v.optional(v.string()),
    status: v.optional(commerceSubscriptionOfferStatusValidator),
    description: v.optional(v.string()),
    publicSummary: v.optional(v.string()),
    availableInCart: v.optional(v.boolean()),
    availableInDirectForms: v.optional(v.boolean()),
    availableForAdminProvisioning: v.optional(v.boolean()),
    createNewSubscription: v.optional(v.boolean()),
    allowAddToExistingSubscription: v.optional(v.boolean()),
    limitOnePerCustomer: v.optional(v.boolean()),
    /** Days of free trial; null clears it (the template's trial applies). */
    trialDaysOverride: v.optional(v.union(v.number(), v.null())),
    entitlementCodes: v.optional(v.array(v.string())),
    features: v.optional(v.array(featureValidator)),
    pricingCardVisible: v.optional(v.boolean()),
    excludedPlanFeatureIds: v.optional(
      v.array(v.id("membership_plan_benefits")),
    ),
    /** Replaces the stored metadata: a JSON object, JSON-encoded. */
    metadataJson: v.optional(v.string()),
    // Immutable-if-hot:
    templateId: v.optional(v.id("commerce_subscription_templates")),
    currencyCode: v.optional(v.string()),
    recurringAmount: v.optional(v.number()),
    setupFeeAmount: v.optional(v.number()),
    minimumQuantity: v.optional(v.number()),
    maximumQuantity: v.optional(v.number()),
  },
  returns: v.id("commerce_subscription_offers"),
  handler: async (ctx, args) => {
    await requirePluginEnabled(ctx, "commerceSubscriptions");
    await requireCommerceSubscriptionsEnabled(ctx);
    await requireCan(ctx, "manage_options");

    const existing = await ctx.db.get(args.offerId);
    if (!existing) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Offer not found.",
      });
    }

    const now = Date.now();
    const patch: Partial<WithoutSystemFields<Doc<"commerce_subscription_offers">>> = { updatedAt: now };

    // Collect proposed changes to immutable-if-hot fields.
    const immutableAttempted: string[] = [];
    const checkImmutable = <T,>(
      fieldName: string,
      newValue: T | undefined,
      oldValue: T | undefined,
    ) => {
      if (newValue !== undefined && newValue !== oldValue) {
        immutableAttempted.push(fieldName);
      }
    };
    checkImmutable("templateId", args.templateId, existing.templateId);
    checkImmutable("currencyCode", args.currencyCode, existing.currencyCode);
    checkImmutable(
      "recurringAmount",
      args.recurringAmount,
      existing.recurringAmount,
    );
    checkImmutable(
      "setupFeeAmount",
      args.setupFeeAmount,
      existing.setupFeeAmount,
    );
    checkImmutable(
      "minimumQuantity",
      args.minimumQuantity,
      existing.minimumQuantity,
    );
    checkImmutable(
      "maximumQuantity",
      args.maximumQuantity,
      existing.maximumQuantity,
    );

    if (immutableAttempted.length > 0) {
      const hotContract = await hasActiveContractReferencingOffer(
        ctx,
        args.offerId,
      );
      if (hotContract) {
        throw new ConvexError({
          code: "IMMUTABLE_FIELD",
          message: `Cannot modify [${immutableAttempted.join(", ")}] — this offer has active contracts. Archive and create a new offer instead.`,
          attemptedFields: immutableAttempted,
        });
      }
    }

    // If templateId is being changed (and allowed), validate the new template exists.
    if (args.templateId !== undefined && args.templateId !== existing.templateId) {
      const tmpl = await ctx.db.get(args.templateId);
      if (!tmpl) {
        throw new ConvexError({
          code: "NOT_FOUND",
          message: "Subscription template not found.",
        });
      }
      patch.templateId = args.templateId;
    }

    // If slug is being changed, enforce uniqueness.
    const newSlug = args.slug;
    if (newSlug !== undefined && newSlug !== existing.slug) {
      const existingBySlug = await ctx.db
        .query("commerce_subscription_offers")
        .withIndex("by_slug", (q) => q.eq("slug", newSlug))
        .first();
      if (existingBySlug && existingBySlug._id !== existing._id) {
        throw new ConvexError({
          code: "VALIDATION_ERROR",
          message: `An offer with slug "${args.slug}" already exists.`,
        });
      }
      patch.slug = args.slug;
    }

    // Everything else that was provided.
    if (args.title !== undefined) patch.title = args.title;
    if (args.status !== undefined) patch.status = args.status;
    if (args.description !== undefined) patch.description = args.description;
    if (args.publicSummary !== undefined) patch.publicSummary = args.publicSummary;
    if (args.availableInCart !== undefined) patch.availableInCart = args.availableInCart;
    if (args.availableInDirectForms !== undefined) patch.availableInDirectForms = args.availableInDirectForms;
    if (args.availableForAdminProvisioning !== undefined) patch.availableForAdminProvisioning = args.availableForAdminProvisioning;
    if (args.createNewSubscription !== undefined) patch.createNewSubscription = args.createNewSubscription;
    if (args.allowAddToExistingSubscription !== undefined) patch.allowAddToExistingSubscription = args.allowAddToExistingSubscription;
    if (args.limitOnePerCustomer !== undefined) patch.limitOnePerCustomer = args.limitOnePerCustomer;
    if (args.trialDaysOverride !== undefined) patch.trialDaysOverride = args.trialDaysOverride ?? undefined;
    if (args.entitlementCodes !== undefined) patch.entitlementCodes = args.entitlementCodes;
    if (args.features !== undefined) patch.features = args.features;
    if (args.pricingCardVisible !== undefined) patch.pricingCardVisible = args.pricingCardVisible;
    if (args.excludedPlanFeatureIds !== undefined) patch.excludedPlanFeatureIds = args.excludedPlanFeatureIds;
    if (args.currencyCode !== undefined) patch.currencyCode = args.currencyCode;
    if (args.recurringAmount !== undefined) patch.recurringAmount = args.recurringAmount;
    if (args.setupFeeAmount !== undefined) patch.setupFeeAmount = args.setupFeeAmount;
    if (args.minimumQuantity !== undefined) patch.minimumQuantity = args.minimumQuantity;
    if (args.maximumQuantity !== undefined) patch.maximumQuantity = args.maximumQuantity;
    if (args.metadataJson !== undefined) {
      patch.metadata = parseOptionalJsonObjectArgument(args.metadataJson, "metadataJson");
    }

    await ctx.db.patch("commerce_subscription_offers", args.offerId, patch);
    return args.offerId;
  },
});

/**
 * Soft-delete: archive an offer. Existing contracts are untouched — they
 * keep their pricing snapshot. Archived offers are hidden from the pricing
 * card loader and listing queries (unless filtered explicitly).
 */
export const archiveOffer = mutation({
  args: {
    offerId: v.id("commerce_subscription_offers"),
  },
  returns: v.object({ success: v.boolean() }),
  handler: async (ctx, args) => {
    await requirePluginEnabled(ctx, "commerceSubscriptions");
    await requireCommerceSubscriptionsEnabled(ctx);
    await requireCan(ctx, "manage_options");

    const existing = await ctx.db.get(args.offerId);
    if (!existing) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Offer not found.",
      });
    }

    const now = Date.now();
    await ctx.db.patch("commerce_subscription_offers", args.offerId, {
      status: "archived",
      updatedAt: now,
    });
    return { success: true };
  },
});

// ─── Queries ────────────────────────────────────────────────────────────────

/**
 * Admin listing. Filter by template, status, or search string.
 */
export const listOffers = query({
  args: {
    templateId: v.optional(v.id("commerce_subscription_templates")),
    status: v.optional(commerceSubscriptionOfferStatusValidator),
    search: v.optional(v.string()),
  },
  returns: v.union(v.null(), v.array(commerceSubscriptionsDocs.commerce_subscription_offers)),
  handler: async (ctx, args) => {
    if (!(await isPluginEnabled(ctx, "commerceSubscriptions"))) return null;
    await requireCommerceSubscriptionsEnabled(ctx);
    await requireCan(ctx, "manage_options");

    let offers: Doc<"commerce_subscription_offers">[];
    const { templateId, status } = args;
    if (templateId) {
      offers = await ctx.db
        .query("commerce_subscription_offers")
        .withIndex("by_template", (q) => q.eq("templateId", templateId))
        .collect();
    } else if (status) {
      offers = await ctx.db
        .query("commerce_subscription_offers")
        .withIndex("by_status", (q) => q.eq("status", status))
        .collect();
    } else {
      offers = await ctx.db.query("commerce_subscription_offers").collect();
    }

    // Post-filter for cross-criteria and search.
    if (args.status) {
      offers = offers.filter((o) => o.status === args.status);
    }
    if (args.search && args.search.trim().length > 0) {
      const needle = args.search.trim().toLowerCase();
      offers = offers.filter(
        (o) =>
          o.title.toLowerCase().includes(needle) ||
          o.slug.toLowerCase().includes(needle),
      );
    }

    return offers.sort((a, b) => b.createdAt - a.createdAt);
  },
});

/**
 * Fetch a single offer by ID.
 */
export const getOffer = query({
  args: {
    offerId: v.id("commerce_subscription_offers"),
  },
  returns: v.union(v.null(), commerceSubscriptionsDocs.commerce_subscription_offers),
  handler: async (ctx, args) => {
    if (!(await isPluginEnabled(ctx, "commerceSubscriptions"))) return null;
    await requireCommerceSubscriptionsEnabled(ctx);
    await requireCan(ctx, "manage_options");
    return ctx.db.get(args.offerId);
  },
});

/**
 * Where a pricing card's button leads: into the site's signup form (the one
 * the pricing config names) with this plan chosen, or null for the plain
 * `/signup/<offer>` page. Read from the form's `subscription` action, so a
 * plan field remap or a fixed-offer form is honoured.
 */
const pricingSignupValidator = v.union(
  v.null(),
  v.object({ formSlug: v.string(), param: v.optional(v.string()), value: v.optional(v.string()) }),
);

type PricingSignupForm = { slug: string; plan: ActionPlan; param: string | null };

async function pricingSignupForm(ctx: { db: QueryCtx["db"] }): Promise<PricingSignupForm | null> {
  const config = await ctx.db
    .query("commerce_subscription_pricing_card_config")
    .withIndex("by_singleton", (q) => q.eq("singletonKey", "main"))
    .unique();
  const formId = config?.signupFormId;
  if (!formId) return null;
  const form = await ctx.db.get(formId);
  if (!form || form.status !== "published") return null;
  const actions = await ctx.db
    .query("form_actions")
    .withIndex("by_form_enabled", (q) => q.eq("formId", form._id).eq("enabled", true))
    .collect();
  for (const action of actions) {
    if (action.type !== "subscription") continue;
    const plan = actionPlan(action.config);
    if (!plan) continue;
    if (plan.mode === "fixed") return { slug: form.slug, plan, param: null };
    const groupId = form.fieldGroupId;
    const field = groupId
      ? (
          await ctx.db
            .query("fieldDefinitions")
            .withIndex("by_group", (q) => q.eq("groupId", groupId))
            .collect()
        ).find((definition) => definition.key === plan.fieldKey)
      : undefined;
    return { slug: form.slug, plan, param: field ? planParam(field.settings) : null };
  }
  return null;
}

function signupFor(target: PricingSignupForm | null, offerId: Id<"commerce_subscription_offers">) {
  if (!target) return null;
  if (target.plan.mode === "fixed") return target.plan.offerId === offerId ? { formSlug: target.slug } : null;
  const mapped = Object.values(target.plan.offerByChoice);
  // A form that maps its choices sells only the offers it maps.
  if (mapped.length > 0 && !mapped.includes(offerId)) return null;
  const value = choiceForOffer(target.plan, offerId);
  return target.param ? { formSlug: target.slug, param: target.param, value } : { formSlug: target.slug };
}

/**
 * Public read for pricing cards: active offers shown on the pricing page, as
 * customers see them. Only public fields: the internal note, entitlement
 * codes, integration metadata and sales-channel switches stay private.
 *
 * Per offer, beyond the offer's public fields:
 *   planBenefits:         displayable membership benefits (minus exclusions)
 *   billingInterval / billingIntervalCount / templateTrialDays: from the
 *                         template, so a card can render "/ month" and the
 *                         trial (`trialDaysOverride` still wins)
 *   signup:               where the card's button leads (see above)
 */
export const listOffersForPricing = query({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("commerce_subscription_offers"),
      title: v.string(),
      slug: v.string(),
      publicSummary: v.optional(v.string()),
      currencyCode: v.string(),
      recurringAmount: v.number(),
      setupFeeAmount: v.optional(v.number()),
      trialDaysOverride: v.optional(v.number()),
      features: v.optional(v.array(featureValidator)),
      planBenefits: v.array(displayableBenefitValidator),
      billingInterval: v.union(
        v.null(),
        commerceSubscriptionsDocs.commerce_subscription_templates.fields.billingInterval,
      ),
      billingIntervalCount: v.union(v.null(), v.number()),
      templateTrialDays: v.union(v.null(), v.number()),
      signup: pricingSignupValidator,
      /** Set when the offer sells a shop product (plan changes stay within it). */
      productId: v.optional(v.id("commerce_products")),
      createdAt: v.number(),
    }),
  ),
  handler: async (ctx) => {
    if (!(await isPluginEnabled(ctx, "commerceSubscriptions"))) return [];

    const offers = await ctx.db
      .query("commerce_subscription_offers")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .collect();
    const visible = offers.filter((o) => o.pricingCardVisible !== false).sort((a, b) => b.createdAt - a.createdAt);

    const templateMap = new Map<string, Doc<"commerce_subscription_templates">>();
    for (const templateId of new Set(visible.map((o) => o.templateId))) {
      const template = await ctx.db.get(templateId);
      if (template) templateMap.set(String(templateId), template);
    }
    const signupTarget = await pricingSignupForm(ctx);

    const rows = [];
    for (const offer of visible) {
      const excluded: string[] = offer.excludedPlanFeatureIds ?? [];
      const planBenefits = (await getDisplayableBenefitsForCodesHelper(ctx, offer.entitlementCodes ?? [])).filter(
        (benefit) => !excluded.includes(benefit._id),
      );
      const template = templateMap.get(String(offer.templateId));
      rows.push({
        _id: offer._id,
        title: offer.title,
        slug: offer.slug,
        publicSummary: offer.publicSummary,
        currencyCode: offer.currencyCode,
        recurringAmount: offer.recurringAmount,
        setupFeeAmount: offer.setupFeeAmount,
        trialDaysOverride: offer.trialDaysOverride,
        features: offer.features,
        planBenefits,
        billingInterval: template?.billingInterval ?? null,
        billingIntervalCount: template?.billingIntervalCount ?? null,
        templateTrialDays: template?.trialDays ?? null,
        signup: signupFor(signupTarget, offer._id),
        productId: offer.productId,
        createdAt: offer.createdAt,
      });
    }
    return rows;
  },
});
