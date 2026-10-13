/**
 * Commerce Subscriptions — Pricing Card Config (Wave 2).
 *
 * Singleton configuration document driving the `/pricing` page layout.
 * The site has ONE pricing page, so the underlying
 * `commerce_subscription_pricing_card_config` table is keyed on a
 * single `singletonKey = "main"` row.
 *
 * Config fields:
 *   - `orderedOfferIds`   Ordered list of offers to display (left →
 *                         right). Missing / archived offers are
 *                         filtered out downstream in the pricing page.
 *   - `featuredOfferId`   The offer to render with emphasis ("Most
 *                         popular"). Optional — when null/absent the UI
 *                         uses the middle card by convention.
 *   - `headline` /
 *     `subheadline`       Optional marketing copy on the page.
 *   - `templateKey`       Card layout template identifier. Wave 2 ships
 *                         a single "default" template; Wave 4 may add
 *                         variants (e.g. "compact", "tabbed").
 *
 * Operations:
 *   - `getPricingCardConfig`   Public (plugin-gated) read. Returns the
 *                              config or a sensible default when the
 *                              row does not exist yet. Does NOT insert
 *                              on read — read paths stay side-effect-
 *                              free.
 *   - `updatePricingCardConfig`Upsert — if the singleton row does not
 *                              exist, insert it; otherwise patch. Admin
 *                              only.
 *
 * Plugin gate: every public handler starts with
 *   `await requirePluginEnabled(ctx, "commerceSubscriptions")`
 * (Read query returns a default when the plugin is disabled so
 * consumers can still render a shell.)
 */

import { ConvexError, v, type Infer } from "convex/values";

import { mutation, query, type QueryCtx } from "../_generated/server";
import { commerceSubscriptionsDocs } from "../schema/commerceSubscriptions.docs.generated";
import { getCurrentUser } from "../helpers/auth";
import { requireCan } from "../helpers/permissions";
import { isPluginEnabled, requirePluginEnabled } from "../helpers/plugins";
import { requireCommerceSubscriptionsEnabled } from "./helpers";
import { patchDynamicWithMediaReferences } from "../media/attachmentGuard";


// ─── Constants ─────────────────────────────────────────────────────────────

const SINGLETON_KEY = "main";
const DEFAULT_TEMPLATE_KEY = "default";

/** Shape returned when the singleton row does not exist yet. */
const defaultPricingCardConfigValidator = v.object({
  _id: v.null(),
  singletonKey: v.string(),
  orderedOfferIds: v.array(v.id("commerce_subscription_offers")),
  featuredOfferId: v.optional(v.id("commerce_subscription_offers")),
  headline: v.optional(v.string()),
  subheadline: v.optional(v.string()),
  templateKey: v.string(),
  updatedAt: v.number(),
  updatedBy: v.null(),
});

/** Default config returned when the singleton row does not yet exist. */
function defaultConfig(): Infer<typeof defaultPricingCardConfigValidator> {
  return {
    _id: null,
    singletonKey: SINGLETON_KEY,
    orderedOfferIds: [],
    templateKey: DEFAULT_TEMPLATE_KEY,
    updatedAt: 0,
    updatedBy: null,
  };
}

// ─── Internal helpers ───────────────────────────────────────────────────────

async function getSingletonRow(ctx: { db: QueryCtx["db"] }) {
  return ctx.db
    .query("commerce_subscription_pricing_card_config")
    .withIndex("by_singleton", (q) => q.eq("singletonKey", SINGLETON_KEY))
    .unique();
}

// ─── Queries ────────────────────────────────────────────────────────────────

/**
 * Public read of the pricing card config. Plugin-gated — if the plugin
 * is disabled, returns the default shape (so consumer shells can still
 * render). Never inserts on read.
 *
 * No capability check: this feeds the public `/pricing` page and the
 * customer portal. Admin-only fields (there aren't any today) can be
 * added by splitting public/admin queries in Wave 4.
 */
export const getPricingCardConfig = query({
  args: {},
  returns: v.union(
    commerceSubscriptionsDocs.commerce_subscription_pricing_card_config,
    defaultPricingCardConfigValidator,
  ),
  handler: async (ctx) => {
    if (!(await isPluginEnabled(ctx, "commerceSubscriptions"))) {
      return defaultConfig();
    }

    const row = await getSingletonRow(ctx);
    if (!row) {
      return defaultConfig();
    }
    return row;
  },
});

// ─── Mutations ──────────────────────────────────────────────────────────────

/**
 * Admin upsert of the pricing card config. Creates the singleton row
 * on first call, otherwise patches in-place.
 *
 * Validation:
 *   - `orderedOfferIds`: every id must reference an existing
 *     `commerce_subscription_offers` row. Duplicates are rejected.
 *   - `featuredOfferId`: if set, must appear in `orderedOfferIds`.
 *     (UI can tolerate missing, but we keep the config invariant clean.)
 *   - `templateKey`: Wave 2 accepts only "default". Wave 4 relaxes this.
 */
export const updatePricingCardConfig = mutation({
  args: {
    orderedOfferIds: v.array(v.id("commerce_subscription_offers")),
    featuredOfferId: v.optional(v.id("commerce_subscription_offers")),
    headline: v.optional(v.string()),
    subheadline: v.optional(v.string()),
    templateKey: v.optional(v.string()),
  },
  returns: v.object({ success: v.boolean() }),
  handler: async (ctx, args) => {
    await requirePluginEnabled(ctx, "commerceSubscriptions");
    await requireCommerceSubscriptionsEnabled(ctx);
    await requireCan(ctx, "manage_options");

    const currentUser = await getCurrentUser(ctx);
    if (!currentUser) {
      throw new ConvexError({
        code: "UNAUTHORIZED",
        message: "Authentication required.",
      });
    }

    // Dedupe check on orderedOfferIds.
    const seen = new Set<string>();
    for (const offerId of args.orderedOfferIds) {
      const asKey = String(offerId);
      if (seen.has(asKey)) {
        throw new ConvexError({
          code: "VALIDATION_ERROR",
          message: "orderedOfferIds contains duplicates.",
        });
      }
      seen.add(asKey);
    }

    // Each offer must exist.
    for (const offerId of args.orderedOfferIds) {
      const offer = await ctx.db.get(offerId);
      if (!offer) {
        throw new ConvexError({
          code: "NOT_FOUND",
          message: `Offer ${String(offerId)} referenced in orderedOfferIds does not exist.`,
        });
      }
    }

    // featuredOfferId must be in the ordered list.
    if (args.featuredOfferId) {
      const isInList = args.orderedOfferIds.some(
        (id) => id === args.featuredOfferId,
      );
      if (!isInList) {
        throw new ConvexError({
          code: "VALIDATION_ERROR",
          message:
            "featuredOfferId must also appear in orderedOfferIds.",
        });
      }
    }

    // Wave 2: accept only the default template key.
    const templateKey = args.templateKey ?? DEFAULT_TEMPLATE_KEY;
    if (templateKey !== DEFAULT_TEMPLATE_KEY) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: `templateKey "${templateKey}" is not supported. Wave 2 ships only "default".`,
      });
    }

    const now = Date.now();
    const existing = await getSingletonRow(ctx);

    if (!existing) {
      await ctx.db.insert("commerce_subscription_pricing_card_config", {
        singletonKey: SINGLETON_KEY,
        orderedOfferIds: args.orderedOfferIds,
        featuredOfferId: args.featuredOfferId,
        headline: args.headline,
        subheadline: args.subheadline,
        templateKey,
        updatedAt: now,
        updatedBy: currentUser._id,
      });
    } else {
      await patchDynamicWithMediaReferences(ctx, existing._id, {
        orderedOfferIds: args.orderedOfferIds,
        featuredOfferId: args.featuredOfferId,
        headline: args.headline,
        subheadline: args.subheadline,
        templateKey,
        updatedAt: now,
        updatedBy: currentUser._id,
      });
    }

    return { success: true };
  },
});
