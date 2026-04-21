// @ts-nocheck
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
 *
 * `@ts-nocheck` is set because generated API types may not be emitted yet
 * for new modules; Wave 7 removes it across all subscriptions backend
 * files in one pass (Rule #14).
 */

import { ConvexError, v } from "convex/values";

import { mutation, query } from "../_generated/server";
import { requireCan } from "../helpers/permissions";
import { requirePluginEnabled, isPluginEnabled } from "../helpers/plugins";
import {
  commerceSubscriptionOfferStatusValidator,
  commerceSubscriptionOfferSourceTypeValidator,
} from "../schema/commerceSubscriptions";
import { requireCommerceSubscriptionsEnabled } from "./helpers";

// ─── Shared shape validators ────────────────────────────────────────────────

const featureValidator = v.object({
  text: v.string(),
  highlighted: v.optional(v.boolean()),
  icon: v.optional(v.string()),
});

// ─── Immutability check ─────────────────────────────────────────────────────

type OfferActiveStatuses = "active" | "trialing" | "past_due" | "paused";
const OFFER_ACTIVE_CONTRACT_STATUSES: OfferActiveStatuses[] = [
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
  ctx: any,
  offerId: any,
): Promise<boolean> {
  const items = await ctx.db
    .query("commerce_subscription_items")
    .withIndex("by_source_offer", (q: any) => q.eq("sourceOfferId", offerId))
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
    metadata: v.optional(v.any()),
  },
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
      .withIndex("by_slug", (q: any) => q.eq("slug", args.slug))
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
      metadata: args.metadata,
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
    trialDaysOverride: v.optional(v.number()),
    entitlementCodes: v.optional(v.array(v.string())),
    features: v.optional(v.array(featureValidator)),
    pricingCardVisible: v.optional(v.boolean()),
    excludedPlanFeatureIds: v.optional(
      v.array(v.id("membership_plan_benefits")),
    ),
    metadata: v.optional(v.any()),
    // Immutable-if-hot:
    templateId: v.optional(v.id("commerce_subscription_templates")),
    currencyCode: v.optional(v.string()),
    recurringAmount: v.optional(v.number()),
    setupFeeAmount: v.optional(v.number()),
    minimumQuantity: v.optional(v.number()),
    maximumQuantity: v.optional(v.number()),
  },
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
    const patch: Record<string, unknown> = { updatedAt: now };

    // Collect proposed changes to immutable-if-hot fields.
    const immutableAttempted: string[] = [];
    const checkImmutable = (
      fieldName: string,
      newValue: any,
      oldValue: any,
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
    if (args.slug !== undefined && args.slug !== existing.slug) {
      const existingBySlug = await ctx.db
        .query("commerce_subscription_offers")
        .withIndex("by_slug", (q: any) => q.eq("slug", args.slug))
        .first();
      if (existingBySlug && existingBySlug._id !== existing._id) {
        throw new ConvexError({
          code: "VALIDATION_ERROR",
          message: `An offer with slug "${args.slug}" already exists.`,
        });
      }
      patch.slug = args.slug;
    }

    // Copy all other updatable fields if provided.
    const maybeFields: Array<keyof typeof args> = [
      "title",
      "status",
      "description",
      "publicSummary",
      "availableInCart",
      "availableInDirectForms",
      "availableForAdminProvisioning",
      "createNewSubscription",
      "allowAddToExistingSubscription",
      "trialDaysOverride",
      "entitlementCodes",
      "features",
      "pricingCardVisible",
      "excludedPlanFeatureIds",
      "metadata",
      "currencyCode",
      "recurringAmount",
      "setupFeeAmount",
      "minimumQuantity",
      "maximumQuantity",
    ];
    for (const field of maybeFields) {
      if (args[field] !== undefined) {
        (patch as any)[field] = args[field];
      }
    }

    await ctx.db.patch(args.offerId, patch);
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
    await ctx.db.patch(args.offerId, {
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
  handler: async (ctx, args) => {
    if (!(await isPluginEnabled(ctx, "commerceSubscriptions"))) return null;
    await requireCommerceSubscriptionsEnabled(ctx);
    await requireCan(ctx, "manage_options");

    let offers: any[];
    if (args.templateId) {
      offers = await ctx.db
        .query("commerce_subscription_offers")
        .withIndex("by_template", (q: any) =>
          q.eq("templateId", args.templateId),
        )
        .collect();
    } else if (args.status) {
      offers = await ctx.db
        .query("commerce_subscription_offers")
        .withIndex("by_status", (q: any) => q.eq("status", args.status))
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
          (o.title ?? "").toLowerCase().includes(needle) ||
          (o.slug ?? "").toLowerCase().includes(needle),
      );
    }

    return offers.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
  },
});

/**
 * Fetch a single offer by ID.
 */
export const getOffer = query({
  args: {
    offerId: v.id("commerce_subscription_offers"),
  },
  handler: async (ctx, args) => {
    if (!(await isPluginEnabled(ctx, "commerceSubscriptions"))) return null;
    await requireCommerceSubscriptionsEnabled(ctx);
    await requireCan(ctx, "manage_options");
    return ctx.db.get(args.offerId);
  },
});

/**
 * Public (no auth, no capability) query feeding the `/pricing` page.
 * Plugin-gated — disabled commerce subscriptions returns `[]`.
 *
 * Surfaces only offers with `status === "active"` AND
 * `pricingCardVisible !== false`. Treats absence of `pricingCardVisible`
 * as visible.
 *
 * Wave 6 will enrich this with linked-plan benefit features. Wave 2
 * returns raw offer rows — consumer can decide.
 */
export const listOffersForPricing = query({
  args: {},
  handler: async (ctx) => {
    if (!(await isPluginEnabled(ctx, "commerceSubscriptions"))) return [];

    const offers = await ctx.db
      .query("commerce_subscription_offers")
      .withIndex("by_status", (q: any) => q.eq("status", "active"))
      .collect();

    return offers
      .filter((o) => o.pricingCardVisible !== false)
      .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
  },
});
