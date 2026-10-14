/**
 * Settings System - HTTP API Internal Functions
 *
 * These internal functions are used exclusively by HTTP actions (httpAction).
 * They are NOT client-callable, providing a security layer between the public
 * HTTP API and the database operations.
 *
 * This addresses security issue H-17: HTTP actions should use internal functions
 * instead of public API functions.
 *
 * Functions:
 *   getBySectionInternal - Get settings by section for HTTP API
 *   getPublicInternal    - Get public settings for HTTP API
 */

import { internalQuery } from "../_generated/server";
import { settingsRecord } from "../helpers/settingsReader";
import { v } from "convex/values";
import {
  getDefaults,
  isValidSection,
  AUTOLOADED_SECTIONS,
} from "./defaults";
import { readSectionWithMeta, sectionWithMetaValidator } from "./sectionValues";

/**
 * Internal version of getBySection for HTTP API.
 * No client-side auth - caller (HTTP handler) handles API key auth.
 * Secrets are returned as stored; the HTTP handler masks them.
 */
export const getBySectionInternal = internalQuery({
  args: {
    section: v.string(),
  },
  returns: sectionWithMetaValidator,
  handler: async (ctx, args) => {
    if (!isValidSection(args.section)) {
      throw new Error(`Unknown settings section: ${args.section}`);
    }
    return await readSectionWithMeta(ctx, args.section, { redact: false });
  },
});

/**
 * Internal version of getPublic for HTTP API.
 * No client-side auth - caller handles API key auth.
 */
function publicString(value: unknown): string | undefined { return typeof value === "string" ? value : undefined; }
function publicBoolean(value: unknown): boolean | undefined { return typeof value === "boolean" ? value : undefined; }
function publicNumber(value: unknown): number | undefined { return typeof value === "number" && Number.isFinite(value) ? value : undefined; }

export const getPublicInternal = internalQuery({
  args: {},
  returns: v.object({
    siteTitle: v.optional(v.string()),
    tagline: v.optional(v.string()),
    siteUrl: v.optional(v.string()),
    homeUrl: v.optional(v.string()),
    membershipEnabled: v.optional(v.boolean()),
    siteLanguage: v.optional(v.string()),
    timezone: v.optional(v.string()),
    dateFormat: v.optional(v.string()),
    timeFormat: v.optional(v.string()),
    weekStartsOn: v.optional(v.number()),
    homepageDisplays: v.optional(v.string()),
    homepageId: v.optional(v.string()),
    postsPageId: v.optional(v.string()),
    postsPerPage: v.optional(v.number()),
    feedItemCount: v.optional(v.number()),
    feedContentDisplay: v.optional(v.string()),
    searchEngineVisibility: v.optional(v.boolean()),
    allowComments: v.optional(v.boolean()),
    requireNameEmail: v.optional(v.boolean()),
    requireRegistration: v.optional(v.boolean()),
    enableThreadedComments: v.optional(v.boolean()),
    threadedCommentsDepth: v.optional(v.number()),
    commentOrder: v.optional(v.string()),
    showAvatars: v.optional(v.boolean()),
    avatarRating: v.optional(v.string()),
    defaultAvatar: v.optional(v.string()),
    permalinkStructure: v.optional(v.string()),
    categoryBase: v.optional(v.string()),
    tagBase: v.optional(v.string()),
    privacyPolicyPageId: v.optional(v.string()),
    showPrivacyPolicyLink: v.optional(v.boolean()),
    plugins: v.object({
      commerceEnabled: v.optional(v.boolean()),
      commerceStorefrontEnabled: v.optional(v.boolean()),
      commerceSubscriptionsEnabled: v.optional(v.boolean()),
      commerceDigitalEnabled: v.optional(v.boolean()),
      commerceReviewsEnabled: v.optional(v.boolean()),
      commerceWishlistsEnabled: v.optional(v.boolean()),
      commerceBundlesEnabled: v.optional(v.boolean()),
      commerceReturnsEnabled: v.optional(v.boolean()),
      membershipEnabled: v.optional(v.boolean()),
      knowledgeBaseEnabled: v.optional(v.boolean()),
      ticketsEnabled: v.optional(v.boolean()),
      customFieldsEnabled: v.optional(v.boolean()),
      recipesEnabled: v.optional(v.boolean()),
      galleryEnabled: v.optional(v.boolean()),
      formsEnabled: v.optional(v.boolean()),
    }),
  }),
  handler: async (ctx) => {
    // Fetch all autoloaded sections
    const sections: Record<string, Record<string, unknown>> = {};

    for (const section of AUTOLOADED_SECTIONS) {
      const defaults = getDefaults(section);

      const doc = await ctx.db
        .query("settings")
        .withIndex("by_section", (q) => q.eq("section", section))
        .unique();

      sections[section] = doc
        ? { ...defaults, ...(doc.values as Record<string, unknown>) }
        : { ...defaults };
    }

    // Build the public-safe result by picking specific values
    const general = sections.general ?? {};
    const reading = sections.reading ?? {};
    const discussion = sections.discussion ?? {};
    const permalinks = sections.permalinks ?? {};
    const privacy = sections.privacy ?? {};
    const pluginsDefaults = getDefaults("plugins");
    const pluginsDoc = await ctx.db
      .query("settings")
      .withIndex("by_section", (q) => q.eq("section", "plugins"))
      .unique();
    const plugins = pluginsDoc
      ? { ...pluginsDefaults, ...settingsRecord(pluginsDoc.values) }
      : { ...pluginsDefaults };

    return {
      // General (excluding adminEmail)
      siteTitle: publicString(general.siteTitle),
      tagline: publicString(general.tagline),
      siteUrl: publicString(general.siteUrl),
      homeUrl: publicString(general.homeUrl),
      membershipEnabled: publicBoolean(general.membershipEnabled),
      siteLanguage: publicString(general.siteLanguage),
      timezone: publicString(general.timezone),
      dateFormat: publicString(general.dateFormat),
      timeFormat: publicString(general.timeFormat),
      weekStartsOn: publicNumber(general.weekStartsOn),

      // Reading
      homepageDisplays: publicString(reading.homepageDisplays),
      homepageId: publicString(reading.homepageId),
      postsPageId: publicString(reading.postsPageId),
      postsPerPage: publicNumber(reading.postsPerPage),
      feedItemCount: publicNumber(reading.feedItemCount),
      feedContentDisplay: publicString(reading.feedContentDisplay),
      searchEngineVisibility: publicBoolean(reading.searchEngineVisibility),

      // Discussion (excluding word lists)
      allowComments: publicBoolean(discussion.allowComments),
      requireNameEmail: publicBoolean(discussion.requireNameEmail),
      requireRegistration: publicBoolean(discussion.requireRegistration),
      enableThreadedComments: publicBoolean(discussion.enableThreadedComments),
      threadedCommentsDepth: publicNumber(discussion.threadedCommentsDepth),
      commentOrder: publicString(discussion.commentOrder),
      showAvatars: publicBoolean(discussion.showAvatars),
      avatarRating: publicString(discussion.avatarRating),
      defaultAvatar: publicString(discussion.defaultAvatar),

      // Permalinks
      permalinkStructure: publicString(permalinks.structure),
      categoryBase: publicString(permalinks.categoryBase),
      tagBase: publicString(permalinks.tagBase),

      // Privacy
      privacyPolicyPageId: publicString(privacy.privacyPolicyPageId),
      showPrivacyPolicyLink: publicBoolean(privacy.showPrivacyPolicyLink),

      // Public plugin flags. These are feature visibility controls, not secrets.
      plugins: {
        commerceEnabled: publicBoolean(plugins.commerceEnabled),
        commerceStorefrontEnabled: publicBoolean(plugins.commerceStorefrontEnabled),
        commerceSubscriptionsEnabled: publicBoolean(plugins.commerceSubscriptionsEnabled),
        commerceDigitalEnabled: publicBoolean(plugins.commerceDigitalEnabled),
        commerceReviewsEnabled: publicBoolean(plugins.commerceReviewsEnabled),
        commerceWishlistsEnabled: publicBoolean(plugins.commerceWishlistsEnabled),
        commerceBundlesEnabled: publicBoolean(plugins.commerceBundlesEnabled),
        commerceReturnsEnabled: publicBoolean(plugins.commerceReturnsEnabled),
        membershipEnabled: publicBoolean(plugins.membershipEnabled),
        knowledgeBaseEnabled: publicBoolean(plugins.knowledgeBaseEnabled),
        ticketsEnabled: publicBoolean(plugins.ticketsEnabled),
        customFieldsEnabled: publicBoolean(plugins.customFieldsEnabled),
        recipesEnabled: publicBoolean(plugins.recipesEnabled),
        galleryEnabled: publicBoolean(plugins.galleryEnabled),
        formsEnabled: publicBoolean(plugins.formsEnabled),
      },
    };
  },
});
