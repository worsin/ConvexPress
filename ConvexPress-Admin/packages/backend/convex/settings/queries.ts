/**
 * Settings System - Public Queries
 *
 * Five queries for reading settings data:
 *
 *   - get: Raw document lookup by section (auth required)
 *   - getBySection: Merged defaults + stored values (auth required)
 *   - getAutoloaded: All autoloaded sections merged (PUBLIC - no auth)
 *   - getPublic: Curated public-safe values (PUBLIC - no auth)
 *   - exportAll: All sections for JSON export (auth required, needs settings.export)
 *
 * The getAutoloaded and getPublic queries are PUBLIC because they are
 * consumed by the website frontend (SSR and client-side respectively).
 * They do NOT require authentication.
 *
 * Usage:
 *   // Admin form
 *   const settings = useQuery(api.settings.queries.getBySection, { section: "general" });
 *
 *   // Website root layout (SSR)
 *   const autoloaded = useQuery(api.settings.queries.getAutoloaded);
 *
 *   // Website public context
 *   const publicSettings = useQuery(api.settings.queries.getPublic);
 */

import { query, type QueryCtx } from "../_generated/server";
import { requireCan, getCurrentUser } from "../helpers/permissions";
import { redactSettingSecrets } from "../helpers/settingsSecret";
import { getSectionArgs } from "./validators";
import {
  getDefaults,
  AUTOLOADED_SECTIONS,
  SECTION_NAMES,
  type SettingsSection,
} from "./defaults";

async function getMergedSettingsSection(
  ctx: QueryCtx,
  section: SettingsSection,
) {
  const defaults = getDefaults(section);
  const doc = await ctx.db
    .query("settings")
    .withIndex("by_section", (q) => q.eq("section", section))
    .unique();

  return doc ? { ...defaults, ...(doc.values as Record<string, unknown>) } : { ...defaults };
}

// ─── get ─────────────────────────────────────────────────────────────────────

/**
 * Raw document lookup by section.
 * Returns the stored document as-is, without merging defaults.
 * Returns null if no settings have been saved for this section.
 *
 * Auth required (any authenticated user - for admin access check at route level).
 */
export const get = query({
  args: getSectionArgs,
  handler: async (ctx, args) => {
    // Require authentication
    const user = await getCurrentUser(ctx);
    if (!user) return null;

    const doc = await ctx.db
      .query("settings")
      .withIndex("by_section", (q) => q.eq("section", args.section))
      .unique();

    if (!doc) return null;
    return {
      ...doc,
      values: redactSettingSecrets(doc.values as Record<string, any>),
    };
  },
});

// ─── getBySection ────────────────────────────────────────────────────────────

/**
 * Get merged settings for a section (defaults + stored overrides).
 * This is the primary query for admin settings forms.
 *
 * Returns an object with:
 *   - All settings values (defaults merged with stored)
 *   - _id: Document ID (if stored, for optimistic updates)
 *   - updatedAt: Last update timestamp (if stored)
 *   - updatedBy: User who last updated (if stored)
 *
 * Auth required.
 */
export const getBySection = query({
  args: getSectionArgs,
  handler: async (ctx, args) => {
    // Require authentication
    const user = await getCurrentUser(ctx);
    if (!user) return null;

    const section = args.section as SettingsSection;

    // Get defaults
    const defaults = getDefaults(section);

    // Get stored document
    const doc = await ctx.db
      .query("settings")
      .withIndex("by_section", (q) => q.eq("section", section))
      .unique();

    // Merge defaults with stored values
    const values = doc
      ? { ...defaults, ...(doc.values as Record<string, unknown>) }
      : { ...defaults };

    // Redact any field whose name suggests it's a secret. The admin UI
    // sees `__set__` as a sentinel and renders a masked display; the real
    // plaintext only leaves the backend via internal decryption helpers.
    const redacted = redactSettingSecrets(values);

    return {
      ...(redacted as any),
      _id: doc?._id ?? null,
      updatedAt: doc?.updatedAt ?? null,
      updatedBy: doc?.updatedBy ?? null,
    };
  },
});

// ─── getAutoloaded ───────────────────────────────────────────────────────────

/**
 * Get all autoloaded settings sections merged with defaults.
 * PUBLIC query - no auth required.
 *
 * Returns a record keyed by section name, each containing the merged values.
 * Autoloaded sections: general, reading, permalinks, discussion, privacy, header, footer.
 * Writing is NOT autoloaded (only needed when creating posts).
 *
 * This is the WordPress equivalent of `wp_load_alloptions()`.
 * Called once per SSR request at the root layout level.
 */
export const getAutoloaded = query({
  args: {},
  handler: async (ctx) => {
    const result: Record<string, Record<string, unknown>> = {};

    for (const section of AUTOLOADED_SECTIONS) {
      const defaults = getDefaults(section);

      const doc = await ctx.db
        .query("settings")
        .withIndex("by_section", (q) => q.eq("section", section))
        .unique();

      result[section] = doc
        ? { ...defaults, ...(doc.values as Record<string, unknown>) }
        : { ...defaults };
    }

    return result;
  },
});

// ─── getPublic ───────────────────────────────────────────────────────────────

/**
 * Get a curated subset of public-safe settings values.
 * PUBLIC query - no auth required.
 *
 * Returns only values that are safe to expose to the website frontend.
 * Excludes sensitive fields like adminEmail, moderationWordList, disallowedWordList.
 *
 * This powers the website SettingsProvider context.
 */
export const getPublic = query({
  args: {},
  handler: async (ctx) => {
    // Fetch all autoloaded sections
    const sections: Record<string, Record<string, unknown>> = {};

    for (const section of AUTOLOADED_SECTIONS) {
      sections[section] = await getMergedSettingsSection(ctx, section);
    }

    // Build the public-safe result by picking specific values
    const general = sections.general ?? {};
    const reading = sections.reading ?? {};
    const discussion = sections.discussion ?? {};
    const permalinks = sections.permalinks ?? {};
    const privacy = sections.privacy ?? {};
    const header = sections.header ?? {};
    const footer = sections.footer ?? {};
    const plugins = await getMergedSettingsSection(ctx, "plugins");
    const commerce = await getMergedSettingsSection(ctx, "commerce.general");
    const shipping = await getMergedSettingsSection(ctx, "integrations.shipping");

    return {
      // General (excluding adminEmail)
      siteTitle: general.siteTitle,
      tagline: general.tagline,
      siteUrl: general.siteUrl,
      homeUrl: general.homeUrl,
      membershipEnabled: general.membershipEnabled,
      siteLanguage: general.siteLanguage,
      timezone: general.timezone,
      dateFormat: general.dateFormat,
      timeFormat: general.timeFormat,
      weekStartsOn: general.weekStartsOn,

      // Reading
      homepageDisplays: reading.homepageDisplays,
      homepageId: reading.homepageId,
      postsPageId: reading.postsPageId,
      postsPerPage: reading.postsPerPage,
      feedItemCount: reading.feedItemCount,
      feedContentDisplay: reading.feedContentDisplay,
      searchEngineVisibility: reading.searchEngineVisibility,

      // Discussion (excluding word lists)
      allowComments: discussion.allowComments,
      requireNameEmail: discussion.requireNameEmail,
      requireRegistration: discussion.requireRegistration,
      enableThreadedComments: discussion.enableThreadedComments,
      threadedCommentsDepth: discussion.threadedCommentsDepth,
      commentOrder: discussion.commentOrder,
      showAvatars: discussion.showAvatars,
      avatarRating: discussion.avatarRating,
      defaultAvatar: discussion.defaultAvatar,

      // Permalinks
      permalinkStructure: permalinks.structure,
      categoryBase: permalinks.categoryBase,
      tagBase: permalinks.tagBase,

      // Privacy
      privacyPolicyPageId: privacy.privacyPolicyPageId,
      showPrivacyPolicyLink: privacy.showPrivacyPolicyLink,

      // Website Appearance - Header config (all fields are safe for public)
      headerConfig: header,

      // Website Appearance - Footer config (all fields are safe for public)
      footerConfig: footer,

      // Public plugin flags. These are feature visibility controls, not secrets.
      plugins: {
        commerceEnabled: plugins.commerceEnabled,
        commerceSubscriptionsEnabled: plugins.commerceSubscriptionsEnabled,
        commerceDigitalEnabled: plugins.commerceDigitalEnabled,
        commerceReviewsEnabled: plugins.commerceReviewsEnabled,
        commerceWishlistsEnabled: plugins.commerceWishlistsEnabled,
        commerceBundlesEnabled: plugins.commerceBundlesEnabled,
        commerceReturnsEnabled: plugins.commerceReturnsEnabled,
        membershipEnabled: plugins.membershipEnabled,
        knowledgeBaseEnabled: plugins.knowledgeBaseEnabled,
        ticketsEnabled: plugins.ticketsEnabled,
        customFieldsEnabled: plugins.customFieldsEnabled,
        recipesEnabled: plugins.recipesEnabled,
        galleryEnabled: plugins.galleryEnabled,
      },

      // Commerce runtime settings used by the public cart and checkout UI.
      commerceConfig: {
        storeName: commerce.storeName,
        storeEmail: commerce.storeEmail,
        currencyCode: commerce.currencyCode,
        currencySymbol: commerce.currencySymbol,
        pricesIncludeTax: commerce.pricesIncludeTax,
        taxRateBasis: commerce.taxRateBasis,
        defaultCountryCode: commerce.defaultCountryCode,
        defaultState: commerce.defaultState,
        checkoutRequiresPhone: commerce.checkoutRequiresPhone,
        allowGuestCheckout: commerce.allowGuestCheckout,
        shippingEnabled: commerce.shippingEnabled,
        shippingMethods: commerce.shippingMethods,
        paymentMethods: commerce.paymentMethods,
        preferredProvider: shipping.preferredProvider,
        liveRatesEnabled: shipping.liveRatesEnabled,
        fallbackToManualRates: shipping.fallbackToManualRates,
        fallbackMessage: shipping.fallbackMessage,
        cheapestBadgeLabel: shipping.cheapestBadgeLabel,
        fastestBadgeLabel: shipping.fastestBadgeLabel,
        bestOptionBadgeLabel: shipping.bestOptionBadgeLabel,
      },
    };
  },
});

// ─── exportAll ───────────────────────────────────────────────────────────────

/**
 * Export all settings sections as a JSON-compatible object.
 * Auth required - needs settings.export capability (Administrator only).
 *
 * Returns the standard export format:
 *   {
 *     version: "1.0",
 *     exportedAt: ISO 8601 string,
 *     exportedBy: admin email,
 *     settings: { [section]: values }
 *   }
 */
export const exportAll = query({
  args: {},
  handler: async (ctx) => {
    // Require settings.export capability
    const user = await requireCan(ctx, "settings.export");

    const settings: Record<string, Record<string, unknown>> = {};

    for (const section of SECTION_NAMES) {
      const defaults = getDefaults(section);

      const doc = await ctx.db
        .query("settings")
        .withIndex("by_section", (q) => q.eq("section", section))
        .unique();

      const merged = doc
        ? { ...defaults, ...(doc.values as Record<string, unknown>) }
        : { ...defaults };
      // Exports include secrets as redacted sentinels — never plaintext.
      // Operators re-enter keys on a restored install.
      settings[section] = redactSettingSecrets(merged as any) as any;
    }

    return {
      version: "1.0",
      // Use Date.now() (deterministic within a Convex transaction) instead of
      // new Date().toISOString() which is non-deterministic and can interfere
      // with Convex query caching. The client can format this as needed.
      exportedAt: Date.now(),
      exportedBy: user.email,
      settings,
    };
  },
});
