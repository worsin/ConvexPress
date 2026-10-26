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
 *   - `contentPageId`     A page whose content surrounds the plans: the
 *                         plans follow its opening section, and its title
 *                         and excerpt describe /pricing. Public readers see
 *                         it only while the page is published for everyone
 *                         (`getPricingContentPage`).
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

import type { Doc, Id } from "../_generated/dataModel";
import { internalMutation, mutation, query, type MutationCtx, type QueryCtx } from "../_generated/server";
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
  signupFormId: v.optional(v.id("forms")),
  contentPageId: v.optional(v.id("posts")),
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

/** A page that can carry the pricing page's content: a canonical page, not in the trash. */
async function requireContentPage(ctx: { db: QueryCtx["db"] }, pageId: Id<"posts">): Promise<Doc<"posts">> {
  const page = await ctx.db.get(pageId);
  if (!page || page.type !== "page" || page.status === "trash" || page.status === "auto-draft" || page.blocksVersion !== 2) {
    throw new ConvexError({
      code: "VALIDATION_ERROR",
      message: "The pricing page content must be an existing block-editor page.",
    });
  }
  return page;
}

/** Published for everyone: anything else stays off the public pricing page. */
function isPublicContentPage(page: Doc<"posts">): boolean {
  return page.type === "page" && page.status === "publish" && page.visibility === "public" && page.blocksVersion === 2;
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

/**
 * The page shown with the plans on /pricing, while it is published for
 * everyone; null otherwise. Its body is read like any page's (with its own
 * access rules), so this returns only what the route needs to load it.
 */
export const getPricingContentPage = query({
  args: {},
  returns: v.union(
    v.null(),
    v.object({ _id: v.id("posts"), title: v.string(), excerpt: v.optional(v.string()), blocksVersion: v.literal(2) }),
  ),
  handler: async (ctx) => {
    if (!(await isPluginEnabled(ctx, "commerceSubscriptions"))) return null;
    const row = await getSingletonRow(ctx);
    const page = row?.contentPageId ? await ctx.db.get(row.contentPageId) : null;
    if (!page || !isPublicContentPage(page)) return null;
    return { _id: page._id, title: page.title, ...(page.excerpt ? { excerpt: page.excerpt } : {}), blocksVersion: 2 as const };
  },
});

/** Pages an administrator can choose as the pricing page's content (block-editor pages, newest first). */
export const listPricingContentPages = query({
  args: {},
  returns: v.array(v.object({ _id: v.id("posts"), title: v.string(), slug: v.string(), status: v.string(), isPublic: v.boolean() })),
  handler: async (ctx) => {
    await requireCan(ctx, "manage_options");
    const pages: { _id: Id<"posts">; title: string; slug: string; status: string; isPublic: boolean }[] = [];
    for (const status of ["publish", "future", "draft", "pending", "private"] as const) {
      const rows = await ctx.db
        .query("posts")
        .withIndex("by_type_status", (q) => q.eq("type", "page").eq("status", status))
        .order("desc")
        .take(200);
      for (const row of rows) {
        if (row.blocksVersion === 2) pages.push({ _id: row._id, title: row.title, slug: row.slug, status: row.status, isPublic: isPublicContentPage(row) });
      }
    }
    return pages.slice(0, 200);
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
    /** The signup form cards link into; null clears it, absent keeps it. */
    signupFormId: v.optional(v.union(v.id("forms"), v.null())),
    /** The page whose content surrounds the plans; null clears it, absent keeps it. */
    contentPageId: v.optional(v.union(v.id("posts"), v.null())),
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

    if (args.signupFormId) {
      const form = await ctx.db.get(args.signupFormId);
      const subscription = form
        ? (
            await ctx.db
              .query("form_actions")
              .withIndex("by_form_enabled", (q) => q.eq("formId", form._id).eq("enabled", true))
              .collect()
          ).find((action) => action.type === "subscription")
        : undefined;
      if (!form || form.status !== "published" || !subscription) {
        throw new ConvexError({
          code: "VALIDATION_ERROR",
          message: "The signup form must be published and have a subscription action.",
        });
      }
    }

    if (args.contentPageId) await requireContentPage(ctx, args.contentPageId);

    const now = Date.now();
    const existing = await getSingletonRow(ctx);
    const signupFormId = args.signupFormId === undefined ? existing?.signupFormId : (args.signupFormId ?? undefined);
    const contentPageId = args.contentPageId === undefined ? existing?.contentPageId : (args.contentPageId ?? undefined);

    if (!existing) {
      await ctx.db.insert("commerce_subscription_pricing_card_config", {
        singletonKey: SINGLETON_KEY,
        orderedOfferIds: args.orderedOfferIds,
        featuredOfferId: args.featuredOfferId,
        headline: args.headline,
        subheadline: args.subheadline,
        templateKey,
        signupFormId,
        contentPageId,
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
        signupFormId,
        contentPageId,
        updatedAt: now,
        updatedBy: currentUser._id,
      });
    }

    return { success: true };
  },
});

/**
 * Site setup: choose (or clear) the pricing page's content page, as the named
 * actor. Keeps every other pricing setting; creates the settings on first use.
 */
export const setContentPage = internalMutation({
  args: { pageId: v.union(v.id("posts"), v.null()), actorId: v.id("users") },
  returns: v.null(),
  handler: async (ctx: MutationCtx, { pageId, actorId }) => {
    if (pageId) await requireContentPage(ctx, pageId);
    const existing = await getSingletonRow(ctx);
    const now = Date.now();
    if (existing) {
      await patchDynamicWithMediaReferences(ctx, existing._id, { contentPageId: pageId ?? undefined, updatedAt: now, updatedBy: actorId });
    } else {
      await ctx.db.insert("commerce_subscription_pricing_card_config", {
        singletonKey: SINGLETON_KEY,
        orderedOfferIds: [],
        templateKey: DEFAULT_TEMPLATE_KEY,
        ...(pageId ? { contentPageId: pageId } : {}),
        updatedAt: now,
        updatedBy: actorId,
      });
    }
    return null;
  },
});
