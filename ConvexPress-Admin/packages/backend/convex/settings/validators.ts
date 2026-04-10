/**
 * Settings System - Convex Validators
 *
 * Per-section Convex validators for use in mutations and queries.
 * These enforce type safety at the Convex argument level.
 *
 * Note: The schema uses `v.any()` for the `values` field because
 * each section has a different shape. These validators are used
 * at the mutation handler level for runtime validation.
 */

import { v } from "convex/values";

// ─── Section Validator ───────────────────────────────────────────────────────

/**
 * Validator for the section field. Used in both queries and mutations.
 */
export const sectionValidator = v.union(
  v.literal("general"),
  v.literal("reading"),
  v.literal("writing"),
  v.literal("discussion"),
  v.literal("permalinks"),
  v.literal("privacy"),
  v.literal("email"),
  v.literal("media"),
  v.literal("analytics"),
  v.literal("ai"),
  v.literal("plugins"),
  v.literal("search"),
  // Knowledge Base System sections
  v.literal("kb.general"),
  v.literal("kb.features"),
  v.literal("kb.search"),
  // Ticket System sections
  v.literal("ticket.general"),
  v.literal("ticket.sla"),
  // Support Bridge System sections
  v.literal("support.widget"),
  v.literal("support.ai"),
  // Website Appearance sections
  v.literal("layout"),
  v.literal("header"),
  v.literal("footer"),
);

// ─── Per-Section Value Validators ────────────────────────────────────────────

/**
 * General settings value shape validator.
 */
export const generalValuesValidator = v.object({
  siteTitle: v.string(),
  tagline: v.string(),
  siteUrl: v.string(),
  homeUrl: v.string(),
  adminEmail: v.string(),
  membershipEnabled: v.boolean(),
  defaultRole: v.string(),
  siteLanguage: v.string(),
  timezone: v.string(),
  dateFormat: v.string(),
  timeFormat: v.string(),
  weekStartsOn: v.number(),
  // Password notification settings (read by helpers/password.ts)
  sendPasswordResetEmail: v.boolean(),
  sendPasswordChangedEmail: v.boolean(),
  notifyAdminOnPasswordReset: v.boolean(),
});

/**
 * Reading settings value shape validator.
 */
export const readingValuesValidator = v.object({
  homepageDisplays: v.union(
    v.literal("latest_posts"),
    v.literal("static_page"),
  ),
  homepageId: v.union(v.string(), v.null()),
  postsPageId: v.union(v.string(), v.null()),
  postsPerPage: v.number(),
  feedItemCount: v.number(),
  feedContentDisplay: v.union(v.literal("full"), v.literal("summary")),
  searchEngineVisibility: v.boolean(),
});

/**
 * Writing settings value shape validator.
 */
export const writingValuesValidator = v.object({
  defaultCategory: v.union(v.string(), v.null()),
  defaultPostFormat: v.string(),
});

/**
 * Discussion settings value shape validator.
 */
export const discussionValuesValidator = v.object({
  // Default article settings
  attemptNotifyLinkedBlogs: v.boolean(),
  allowLinkNotifications: v.boolean(),
  allowComments: v.boolean(),

  // Other comment settings
  requireNameEmail: v.boolean(),
  requireRegistration: v.boolean(),
  autoCloseEnabled: v.boolean(),
  autoCloseAfterDays: v.number(),
  enableThreadedComments: v.boolean(),
  threadedCommentsDepth: v.number(),
  enablePaginatedComments: v.boolean(),
  commentsPerPage: v.number(),
  defaultCommentsPage: v.union(v.literal("newest"), v.literal("oldest")),
  commentOrder: v.union(v.literal("asc"), v.literal("desc")),

  // Email me whenever
  emailOnNewComment: v.boolean(),
  emailOnHeldForModeration: v.boolean(),

  // Before a comment appears
  manualApprovalRequired: v.boolean(),
  previouslyApprovedRequired: v.boolean(),

  // Comment moderation
  holdIfLinksExceed: v.number(),
  moderationWordList: v.string(),
  disallowedWordList: v.string(),

  // Avatars
  showAvatars: v.boolean(),
  avatarRating: v.union(
    v.literal("G"),
    v.literal("PG"),
    v.literal("R"),
    v.literal("X"),
  ),
  defaultAvatar: v.string(),
});

/**
 * Permalink settings value shape validator.
 */
export const permalinkValuesValidator = v.object({
  structure: v.union(
    v.literal("plain"),
    v.literal("day_and_name"),
    v.literal("month_and_name"),
    v.literal("numeric"),
    v.literal("post_name"),
    v.literal("custom"),
  ),
  customStructure: v.string(),
  categoryBase: v.string(),
  tagBase: v.string(),
});

export const pluginsValuesValidator = v.object({
  knowledgeBaseEnabled: v.boolean(),
  ticketsEnabled: v.boolean(),
});

/**
 * Privacy settings value shape validator.
 */
export const privacyValuesValidator = v.object({
  privacyPolicyPageId: v.union(v.string(), v.null()),
  showPrivacyPolicyLink: v.boolean(),
});

/**
 * Email settings value shape validator.
 * Controls email system behaviour: sender identity, rate limits,
 * retry policy, queue retention, digest scheduling, and tracking.
 */
export const emailValuesValidator = v.object({
  enabled: v.boolean(),
  fromAddress: v.string(),
  fromName: v.string(),
  replyTo: v.string(),
  rateLimit: v.number(),
  dailyLimit: v.number(),
  batchWindow: v.number(),
  unsubscribeUrl: v.string(),
  maxRetries: v.number(),
  retryDelay: v.number(),
  queueRetentionDays: v.number(),
  trackingEnabled: v.boolean(),
  digestEnabled: v.boolean(),
  digestDay: v.number(),
  digestHour: v.number(),
  includeUnsubscribeLink: v.boolean(),
});

/**
 * AI settings value shape validator.
 * Controls AI provider configuration: provider selection and model.
 *
 * API keys are now stored in encrypted service_secrets (not in settings).
 * The apiKey and tavilyApiKey fields are kept as optional for backward
 * compatibility during migration -- new saves will not include them.
 */
export const aiValuesValidator = v.object({
  provider: v.union(v.literal("openrouter"), v.literal("anthropic")),
  defaultModel: v.string(),
  apiKey: v.optional(v.string()),
  tavilyApiKey: v.optional(v.string()),
});

/**
 * Search settings value shape validator.
 * Controls Meilisearch connection: host URL.
 *
 * The meilisearchApiKey is now stored in encrypted service_secrets.
 * Kept as optional for backward compatibility during migration.
 */
export const searchValuesValidator = v.object({
  meilisearchHost: v.string(),
  meilisearchApiKey: v.optional(v.string()),
});

// ─── Layout Assignment Value Validator ───────────────────────────────────────

/**
 * Layout assignment settings value shape validator.
 * Maps content types to their assigned layout template IDs.
 */
export const layoutAssignmentValuesValidator = v.object({
  blogPostLayout: v.string(),
  pageLayout: v.string(),
  blogIndexLayout: v.string(),
  categoryArchiveLayout: v.string(),
  tagArchiveLayout: v.string(),
  authorArchiveLayout: v.string(),
  searchResultsLayout: v.string(),
  kbArticleLayout: v.string(),
});

/**
 * Header settings value validator.
 * Uses v.any() because the nested object structure is complex.
 */
export const headerValuesValidator = v.any();

/**
 * Footer settings value validator.
 * Uses v.any() because the nested object structure is complex.
 */
export const footerValuesValidator = v.any();

// ─── Argument Validators ─────────────────────────────────────────────────────

/**
 * Args for the updateSection mutation.
 */
export const updateSectionArgs = {
  section: sectionValidator,
  values: v.any(),
};

/**
 * Args for the importAll mutation.
 */
export const importAllArgs = {
  data: v.any(),
};

/**
 * Args for the getBySection / get queries.
 */
export const getSectionArgs = {
  section: sectionValidator,
};

/**
 * Args for the internal getInternal query.
 */
export const getInternalArgs = {
  section: v.string(),
};
