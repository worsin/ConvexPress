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

import { readMergedSettingsSection as getMergedSettingsSection } from "./read";
import { ConvexError } from "convex/values";
import { query, type QueryCtx } from "../_generated/server";
import { requireCan, getCurrentUser, resolveUserRole } from "../helpers/permissions";
import { redactSettingSecrets } from "../helpers/settingsSecret";
import { getSectionArgs } from "./validators";
import {
  SECTION_NAMES,
  type SettingsSection,
} from "./defaults";
import { readAppearance, legacyShopProjection } from "./appearanceMigration";
import {
  anySectionValuesValidator,
  appearanceTemplateSettingsValidator,
  blockSettingsValidator,
  brandSettingsValidator,
  commerceAssistantSettingsValidator,
  commerceGeneralSettingsValidator,
  commerceLayoutSettingsValidator,
  dashboardSettingsValidator,
  discussionSettingsValidator,
  footerSettingsValidator,
  generalSettingsValidator,
  headerSettingsValidator,
  permalinkSettingsValidator,
  privacySettingsValidator,
  readingSettingsValidator,
  readSectionValues,
  readSectionWithMeta,
  readSettingsSection,
  sectionMeta,
  sectionWithMetaValidator,
  shippingIntegrationSettingsValidator,
} from "./sectionValues";
import type { Capability } from "../types/capabilities";

import { v, type Infer } from "convex/values";
import { settingsRecord } from "../helpers/settingsReader";
import { isSitePathOrBlank } from "./validation";
import { settingsDocs } from "../schema/settings.docs.generated";
const SECTION_READ_CAPABILITY_MAP: Partial<Record<SettingsSection, Capability>> = {
  email: "settings.update_email",
  media: "manage_options",
  analytics: "manage_options",
  ai: "manage_options",
  blocks: "manage_options",
  plugins: "manage_options",
  search: "manage_options",
  "kb.general": "manage_options",
  "kb.features": "manage_options",
  "kb.search": "manage_options",
  "ticket.general": "manage_options",
  "ticket.sla": "manage_options",
  "support.widget": "manage_options",
  "support.ai": "manage_options",
  "commerce.general": "manage_options",
  "commerce.payments": "manage_options",
  "commerce.assistant": "manage_options",
  "commerce.layout": "manage_options",
  "appearance.template": "manage_options",
  brand: "manage_options",
  "commerce.subscriptions.counters": "manage_options",
  "integrations.shipping": "manage_options",
  "integrations.shipping.shipstation": "manage_options",
  "integrations.shipping.ups": "manage_options",
  "integrations.shipping.usps": "manage_options",
  "integrations.shipping.fedex": "manage_options",
  "integrations.shipping.dhl": "manage_options",
  "integrations.clerk": "manage_options",
  "integrations.google": "manage_options",
  dashboard: "manage_options",
  "analytics.ga4": "manage_options",
};

async function requireSettingsReadAccess(ctx: QueryCtx, section: SettingsSection) {
  const capability = SECTION_READ_CAPABILITY_MAP[section];
  if (capability) {
    return await requireCan(ctx, capability);
  }

  // Unmapped sections are still operator surfaces: any internal role may read
  // them, website customers (Clerk identities) may not.
  const user = await getCurrentUser(ctx);
  if (!user || user.status !== "active") return null;
  if (user.authSource === "clerk") {
    throw new ConvexError({ code: "FORBIDDEN", message: "Insufficient permissions" });
  }
  // External accounts are operators only while they hold an internal role.
  if (user.authSource === "external" && (await resolveUserRole(ctx, user))?.type !== "internal") {
    throw new ConvexError({ code: "FORBIDDEN", message: "Insufficient permissions" });
  }
  return user;
}

// ─── get ─────────────────────────────────────────────────────────────────────

/**
 * Raw document lookup by section.
 * Returns the stored document as-is, without merging defaults.
 * Returns null if no settings have been saved for this section.
 *
 * Auth required. Sensitive operational sections require the same capability
 * needed to manage that settings surface.
 */
export const get = query({
  args: getSectionArgs,
  returns: v.union(v.null(), settingsDocs.settings),
  handler: async (ctx, args) => {
    const section = args.section as SettingsSection;
    const user = await requireSettingsReadAccess(ctx, section);
    if (!user) return null;

    const doc = await ctx.db
      .query("settings")
      .withIndex("by_section", (q) => q.eq("section", section))
      .unique();

    if (!doc) return null;
    return {
      ...doc,
      values: redactSettingSecrets(settingsRecord(doc.values)),
    };
  },
});

// ─── getBySection ────────────────────────────────────────────────────────────

/**
 * Get merged settings for a section (defaults + stored overrides).
 * This is the primary query for admin settings forms.
 *
 * Returns an object with:
 *   - Every field the section declares, at its declared type (a stored value
 *     of the wrong type, or a missing one, reads as the default; fields the
 *     section does not declare are not returned)
 *   - _id: Document ID (if stored, for optimistic updates)
 *   - updatedAt: Last update timestamp (if stored)
 *   - updatedBy: User who last updated (if stored)
 *
 * Secret fields are masked with the "__set__" sentinel; the admin UI renders a
 * masked state and the plaintext only leaves the backend through internal
 * decryption helpers.
 *
 * Auth required. Sensitive operational sections require the same capability
 * needed to manage that settings surface.
 */
export const getBySection = query({
  args: getSectionArgs,
  returns: v.union(v.null(), sectionWithMetaValidator),
  handler: async (ctx, args) => {
    const section: SettingsSection = args.section;
    const user = await requireSettingsReadAccess(ctx, section);
    if (!user) return null;

    if (section === "appearance.template") {
      // The template section reads through the legacy-appearance projection.
      const { doc, values } = await readAppearance(ctx);
      return { ...readSectionValues(section, values), ...sectionMeta(doc) };
    }
    return await readSectionWithMeta(ctx, section, { redact: true });
  },
});

/**
 * Authenticated, non-secret projection used by the admin navigation. Lower
 * roles need to know whether an installed extension is enabled, but must not
 * receive the protected settings document that administrators edit.
 */
export const getPluginAvailability = query({
  args: {},
  returns: v.union(v.null(), v.record(v.string(), v.boolean())),
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user || user.status !== "active") return null;

    const values = await getMergedSettingsSection(ctx, "plugins");
    const flags: Record<string, boolean> = {};
    for (const [key, value] of Object.entries(values)) {
      if (/^[A-Za-z][A-Za-z0-9]*Enabled$/u.test(key) && typeof value === "boolean") flags[key] = value;
    }
    return flags;
  },
});

// ─── getAutoloaded ───────────────────────────────────────────────────────────

/** The autoloaded sections as getAutoloaded returns them. */
export const autoloadedSettingsValidator = v.object({
  general: generalSettingsValidator.omit("adminEmail"),
  reading: readingSettingsValidator,
  permalinks: permalinkSettingsValidator,
  discussion: discussionSettingsValidator.omit("moderationWordList", "disallowedWordList"),
  privacy: privacySettingsValidator,
  header: headerSettingsValidator,
  footer: footerSettingsValidator,
});

/**
 * Get all autoloaded settings sections merged with defaults.
 * PUBLIC query - no auth required.
 *
 * Returns each autoloaded section (general, reading, permalinks, discussion,
 * privacy, header, footer) at its declared type, without the operator-only
 * values getPublic also omits (adminEmail and the comment word lists).
 * Writing is NOT autoloaded (only needed when creating posts).
 *
 * This is the WordPress equivalent of `wp_load_alloptions()`.
 * Called once per SSR request at the root layout level.
 */
export const getAutoloaded = query({
  args: {},
  returns: autoloadedSettingsValidator,
  handler: async (ctx) => {
    const read = async <S extends SettingsSection>(section: S) => {
      const doc = await ctx.db
        .query("settings")
        .withIndex("by_section", (q) => q.eq("section", section))
        .unique();
      return readSectionValues(section, redactSettingSecrets(settingsRecord(doc?.values)));
    };

    // Public query: drop operator-only values (the same ones getPublic omits).
    const { adminEmail: _adminEmail, ...general } = await read("general");
    const {
      moderationWordList: _moderationWordList,
      disallowedWordList: _disallowedWordList,
      ...discussion
    } = await read("discussion");

    return {
      general,
      reading: await read("reading"),
      permalinks: await read("permalinks"),
      discussion,
      privacy: await read("privacy"),
      header: await read("header"),
      footer: await read("footer"),
    };
  },
});

// ─── getPublic ───────────────────────────────────────────────────────────────

const optionalText = (value: string | null | undefined): string | undefined => value ?? undefined;

/** The public settings projection as getPublic returns it. */
export const publicSettingsValidator = v.object({
  siteTitle: v.string(),
  tagline: v.string(),
  siteUrl: v.string(),
  homeUrl: v.string(),
  logoUrl: v.optional(v.string()),
  siteLogo: v.optional(v.string()),
  membershipEnabled: v.boolean(),
  /** Where people without an account start; blank means /register. */
  signUpPath: v.string(),
  siteLanguage: v.string(),
  timezone: v.string(),
  dateFormat: v.string(),
  timeFormat: v.string(),
  weekStartsOn: v.number(),
  homepageDisplays: readingSettingsValidator.fields.homepageDisplays,
  homepageId: v.optional(v.string()),
  postsPageId: v.optional(v.string()),
  postsPerPage: v.number(),
  feedItemCount: v.number(),
  feedContentDisplay: readingSettingsValidator.fields.feedContentDisplay,
  searchEngineVisibility: v.boolean(),
  allowComments: v.boolean(),
  requireNameEmail: v.boolean(),
  requireRegistration: v.boolean(),
  enableThreadedComments: v.boolean(),
  threadedCommentsDepth: v.number(),
  commentOrder: discussionSettingsValidator.fields.commentOrder,
  showAvatars: v.boolean(),
  avatarRating: discussionSettingsValidator.fields.avatarRating,
  defaultAvatar: v.string(),
  permalinkStructure: permalinkSettingsValidator.fields.structure,
  categoryBase: v.string(),
  tagBase: v.string(),
  privacyPolicyPageId: v.optional(v.string()),
  showPrivacyPolicyLink: v.boolean(),
  headerConfig: headerSettingsValidator,
  footerConfig: footerSettingsValidator,
  colorPalette: v.array(v.object({ slug: v.string(), color: v.string() })),
  plugins: v.record(v.string(), v.boolean()),
  dashboardConfig: dashboardSettingsValidator,
  blocksConfig: blockSettingsValidator,
  commerceConfig: v.object({
    storeName: v.string(),
    storeEmail: v.string(),
    currencyCode: v.string(),
    currencySymbol: v.string(),
    pricesIncludeTax: v.boolean(),
    taxRateBasis: commerceGeneralSettingsValidator.fields.taxRateBasis,
    defaultCountryCode: v.string(),
    defaultState: v.string(),
    checkoutRequiresPhone: v.boolean(),
    allowGuestCheckout: v.boolean(),
    shippingEnabled: v.boolean(),
    shippingMethods: commerceGeneralSettingsValidator.fields.shippingMethods,
    paymentMethods: commerceGeneralSettingsValidator.fields.paymentMethods,
    preferredProvider: shippingIntegrationSettingsValidator.fields.preferredProvider,
    liveRatesEnabled: v.boolean(),
    fallbackToManualRates: v.boolean(),
    fallbackMessage: v.string(),
    cheapestBadgeLabel: v.string(),
    fastestBadgeLabel: v.string(),
    bestOptionBadgeLabel: v.string(),
  }),
  assistantConfig: commerceAssistantSettingsValidator,
  layoutConfig: commerceLayoutSettingsValidator,
  templateConfig: appearanceTemplateSettingsValidator,
  brandConfig: brandSettingsValidator.pick("typography", "density", "radius", "industry", "logoUrl", "faviconUrl"),
});

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
  returns: publicSettingsValidator,
  handler: async (ctx) => {
    const { values: general } = await readSettingsSection(ctx, "general");
    const { values: reading } = await readSettingsSection(ctx, "reading");
    const { values: discussion } = await readSettingsSection(ctx, "discussion");
    const { values: permalinks } = await readSettingsSection(ctx, "permalinks");
    const { values: privacy } = await readSettingsSection(ctx, "privacy");
    const { values: header } = await readSettingsSection(ctx, "header");
    const { values: footer } = await readSettingsSection(ctx, "footer");
    const { values: commerce } = await readSettingsSection(ctx, "commerce.general");
    const { values: assistant } = await readSettingsSection(ctx, "commerce.assistant");
    const { values: brand } = await readSettingsSection(ctx, "brand");
    const { values: shipping } = await readSettingsSection(ctx, "integrations.shipping");
    const { values: blocks } = await readSettingsSection(ctx, "blocks");
    const { values: dashboard } = await readSettingsSection(ctx, "dashboard");
    const template = readSectionValues("appearance.template", (await readAppearance(ctx)).values);
    const layout = readSectionValues("commerce.layout", legacyShopProjection(template));

    // Public plugin flags. These are feature visibility controls, not
    // secrets. Every stored or default `<id>Enabled` boolean is projected so
    // new extensions reach the website without editing this file.
    const plugins = await getMergedSettingsSection(ctx, "plugins");
    const publicPlugins: Record<string, boolean> = {};
    for (const [key, value] of Object.entries(plugins)) {
      if (/^[A-Za-z][A-Za-z0-9]*Enabled$/u.test(key) && typeof value === "boolean") publicPlugins[key] = value;
    }

    // Compatibility palette follows the effective template, including migrated custom tokens.
    const colorPalette: Array<{ slug: string; color: string }> = [];
    for (const [slug, color] of Object.entries(template.settings[template.active]?.colors ?? {})) {
      if (typeof color === "string") colorPalette.push({ slug, color });
    }

    return {
      // General (excluding adminEmail)
      siteTitle: general.siteTitle,
      tagline: general.tagline,
      siteUrl: general.siteUrl,
      homeUrl: general.homeUrl,
      logoUrl: general.logoUrl,
      siteLogo: general.siteLogo,
      membershipEnabled: general.membershipEnabled,
      signUpPath: isSitePathOrBlank(general.signUpPath) ? general.signUpPath : "",
      siteLanguage: general.siteLanguage,
      timezone: general.timezone,
      dateFormat: general.dateFormat,
      timeFormat: general.timeFormat,
      weekStartsOn: general.weekStartsOn,

      // Reading
      homepageDisplays: reading.homepageDisplays,
      homepageId: optionalText(reading.homepageId),
      postsPageId: optionalText(reading.postsPageId),
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
      privacyPolicyPageId: optionalText(privacy.privacyPolicyPageId),
      showPrivacyPolicyLink: privacy.showPrivacyPolicyLink,

      // Website Appearance - Header config (all fields are safe for public)
      headerConfig: header,

      // Website Appearance - Footer config (all fields are safe for public)
      footerConfig: footer,

      colorPalette,

      plugins: publicPlugins,

      // Customer dashboard shell configuration (Dashboard extension).
      dashboardConfig: dashboard,

      // Block editor runtime config. Public so the front-end renderer can
      // suppress blocks that have been disabled in admin settings.
      blocksConfig: { disabledBlockNames: blocks.disabledBlockNames },

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

      // Shopping assistant rail. No secrets live in this section; the model
      // key stays in Settings > AI.
      assistantConfig: assistant,

      // Storefront layout presets (Settings › Shop layouts).
      layoutConfig: layout,

      // Active template pack + per-surface overrides/variants (Appearance › Templates).
      templateConfig: template,

      // Public brand inputs the storefront renders from (fonts, radius, density, logo, browser icon).
      brandConfig: {
        typography: brand.typography,
        density: brand.density,
        radius: brand.radius,
        industry: brand.industry,
        logoUrl: brand.logoUrl,
        faviconUrl: brand.faviconUrl,
      },
    };
  },
});

// ─── exportAll ───────────────────────────────────────────────────────────────

/** The settings export format as exportAll returns it. */
export const settingsExportValidator = v.object({
  version: v.literal("1.0"),
  exportedAt: v.number(),
  exportedBy: v.string(),
  settings: v.record(v.string(), anySectionValuesValidator),
});

/**
 * Export all settings sections as a JSON-compatible object.
 * Auth required - needs settings.export capability (Administrator only).
 *
 * Returns the standard export format:
 *   {
 *     version: "1.0",
 *     exportedAt: Unix timestamp (ms),
 *     exportedBy: admin email,
 *     settings: { [section]: values }
 *   }
 *
 * Each section is exported at its declared type (see getBySection).
 */
export const exportAll = query({
  args: {},
  returns: settingsExportValidator,
  handler: async (ctx) => {
    // Require settings.export capability
    const user = await requireCan(ctx, "settings.export");

    const settings: Record<string, Infer<typeof anySectionValuesValidator>> = {};

    for (const section of SECTION_NAMES) {
      const doc = await ctx.db
        .query("settings")
        .withIndex("by_section", (q) => q.eq("section", section))
        .unique();

      // Exports include secrets as redacted sentinels — never plaintext.
      // Operators re-enter keys on a restored install.
      settings[section] = readSectionValues(section, redactSettingSecrets(settingsRecord(doc?.values)));
    }

    return {
      version: "1.0" as const,
      // Use Date.now() (deterministic within a Convex transaction) instead of
      // new Date().toISOString() which is non-deterministic and can interfere
      // with Convex query caching. The client can format this as needed.
      exportedAt: Date.now(),
      exportedBy: user.email,
      settings,
    };
  },
});
