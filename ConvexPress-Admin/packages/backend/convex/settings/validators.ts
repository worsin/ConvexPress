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
  v.literal("blocks"),
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
  // Commerce & Shipping sections
  v.literal("commerce.general"),
  v.literal("commerce.payments"),
  v.literal("commerce.subscriptions.counters"),
  v.literal("integrations.shipping"),
  v.literal("integrations.shipping.shipstation"),
  v.literal("integrations.shipping.ups"),
  v.literal("integrations.shipping.usps"),
  v.literal("integrations.shipping.fedex"),
  v.literal("integrations.shipping.dhl"),
  v.literal("integrations.clerk"),
  v.literal("integrations.google"),
  v.literal("analytics.ga4"),
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
  registrationMode: v.union(v.literal("invite_only"), v.literal("closed")),
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
  commerceEnabled: v.boolean(),
  commerceSubscriptionsEnabled: v.boolean(),
  commerceDigitalEnabled: v.boolean(),
  commerceReviewsEnabled: v.boolean(),
  commerceWishlistsEnabled: v.boolean(),
  commerceBundlesEnabled: v.boolean(),
  commerceReturnsEnabled: v.boolean(),
  membershipEnabled: v.boolean(),
  knowledgeBaseEnabled: v.boolean(),
  ticketsEnabled: v.boolean(),
  customFieldsEnabled: v.boolean(),
  recipesEnabled: v.boolean(),
  galleryEnabled: v.boolean(),
  lmsEnabled: v.boolean(),
  formsEnabled: v.boolean(),
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
 * Controls AI provider configuration: provider selection, API keys, model.
 */
export const aiValuesValidator = v.object({
  provider: v.union(
    v.literal("openrouter"),
    v.literal("anthropic"),
    v.literal("openai"),
  ),
  apiKey: v.string(),
  defaultModel: v.string(),
  pageGenerationModel: v.string(),
  blockEditingModel: v.string(),
  researchModel: v.string(),
  legacyContentModel: v.string(),
  imageApiKey: v.string(),
  imageModel: v.string(),
  tavilyApiKey: v.string(),
});

export const blockValuesValidator = v.object({
  disabledBlockNames: v.array(v.string()),
});

/**
 * Search settings value shape validator.
 * Controls Meilisearch connection: host URL and API key.
 */
export const searchValuesValidator = v.object({
  meilisearchHost: v.string(),
  meilisearchApiKey: v.string(),
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

export const headerValuesValidator = v.object({
  layout: v.optional(v.object({
    style: v.optional(v.union(v.literal("standard"), v.literal("centered"), v.literal("split"))),
    sticky: v.optional(v.union(v.literal("always"), v.literal("scroll-up"), v.literal("none"))),
    background: v.optional(v.union(v.literal("solid"), v.literal("transparent"), v.literal("glass"))),
    height: v.optional(v.union(v.literal("compact"), v.literal("normal"), v.literal("tall"))),
    bottomBorder: v.optional(v.union(v.literal("none"), v.literal("subtle"), v.literal("bold"), v.literal("shadow"))),
  })),
  topBar: v.optional(v.object({
    enabled: v.optional(v.boolean()),
    leftContent: v.optional(v.union(v.literal("none"), v.literal("contact"), v.literal("announcement"), v.literal("social"))),
    rightContent: v.optional(v.union(v.literal("none"), v.literal("contact"), v.literal("announcement"), v.literal("social"))),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    announcementText: v.optional(v.string()),
  })),
  logo: v.optional(v.object({
    enabled: v.optional(v.boolean()),
    showImage: v.optional(v.boolean()),
    showTitle: v.optional(v.boolean()),
    showTagline: v.optional(v.boolean()),
    size: v.optional(v.union(v.literal("small"), v.literal("medium"), v.literal("large"))),
  })),
  navigation: v.optional(v.object({
    enabled: v.optional(v.boolean()),
    menuSource: v.optional(v.string()),
    customLocation: v.optional(v.string()),
    style: v.optional(v.union(v.literal("inline"), v.literal("pills"), v.literal("underline"))),
    dropdownStyle: v.optional(v.union(v.literal("flyout"), v.literal("mega"))),
  })),
  search: v.optional(v.object({
    enabled: v.optional(v.boolean()),
    variant: v.optional(v.union(v.literal("inline"), v.literal("icon"), v.literal("expandable"))),
    placeholder: v.optional(v.string()),
  })),
  cta: v.optional(v.object({
    enabled: v.optional(v.boolean()),
    label: v.optional(v.string()),
    url: v.optional(v.string()),
    style: v.optional(v.union(v.literal("filled"), v.literal("outline"), v.literal("ghost"))),
  })),
  userMenu: v.optional(v.object({
    enabled: v.optional(v.boolean()),
    guestDisplay: v.optional(v.union(v.literal("login-register"), v.literal("login-only"), v.literal("hidden"))),
    loggedInDisplay: v.optional(v.union(v.literal("avatar-dropdown"), v.literal("name-dropdown"), v.literal("avatar-only"))),
    dropdownPreset: v.optional(v.string()),
  })),
  darkModeToggle: v.optional(v.object({
    enabled: v.optional(v.boolean()),
    variant: v.optional(v.union(v.literal("icon"), v.literal("switch"), v.literal("text"))),
  })),
  mobileMenu: v.optional(v.object({
    variant: v.optional(v.union(v.literal("drawer"), v.literal("fullscreen"), v.literal("dropdown"))),
    drawerSide: v.optional(v.union(v.literal("left"), v.literal("right"))),
  })),
});

export const footerRowCellValidator = v.object({
  id: v.string(),
  width: v.optional(v.number()),
  alignment: v.optional(v.union(v.literal("left"), v.literal("center"), v.literal("right"))),
  cell: v.any(),
});

export const footerValuesValidator = v.object({
  rows: v.optional(v.array(v.object({
    id: v.string(),
    heading: v.optional(v.string()),
    background: v.union(v.literal("default"), v.literal("muted"), v.literal("accent"), v.literal("contrast"), v.literal("transparent")),
    padding: v.union(v.literal("none"), v.literal("compact"), v.literal("normal"), v.literal("spacious")),
    container: v.union(v.literal("narrow"), v.literal("default"), v.literal("wide"), v.literal("full")),
    alignment: v.optional(v.union(v.literal("left"), v.literal("center"), v.literal("right"))),
    topBorder: v.optional(v.union(v.literal("none"), v.literal("subtle"), v.literal("bold"), v.literal("accent"))),
    columns: v.array(footerRowCellValidator),
  }))),
  layout: v.optional(v.object({
    columns: v.optional(v.string()),
    background: v.optional(v.union(v.literal("dark"), v.literal("match-site"), v.literal("accent"), v.literal("image"))),
    backgroundImageId: v.optional(v.union(v.string(), v.null())),
    topBorder: v.optional(v.union(v.literal("none"), v.literal("subtle"), v.literal("bold"), v.literal("accent"))),
    padding: v.optional(v.union(v.literal("compact"), v.literal("normal"), v.literal("spacious"))),
  })),
  branding: v.optional(v.object({
    enabled: v.optional(v.boolean()),
    showLogo: v.optional(v.boolean()),
    showDescription: v.optional(v.boolean()),
    description: v.optional(v.string()),
    showSocial: v.optional(v.boolean()),
  })),
  navColumns: v.optional(v.object({
    enabled: v.optional(v.boolean()),
    columns: v.optional(v.array(v.object({
      heading: v.string(),
      menuSource: v.string(),
    }))),
  })),
  newsletter: v.optional(v.object({
    enabled: v.optional(v.boolean()),
    heading: v.optional(v.string()),
    subtext: v.optional(v.string()),
    buttonText: v.optional(v.string()),
  })),
  contactInfo: v.optional(v.object({
    enabled: v.optional(v.boolean()),
    address: v.optional(v.string()),
    phone: v.optional(v.string()),
    email: v.optional(v.string()),
  })),
  bottomBar: v.optional(v.object({
    enabled: v.optional(v.boolean()),
    copyrightText: v.optional(v.string()),
    legalLinks: v.optional(v.string()),
    poweredBy: v.optional(v.boolean()),
  })),
});

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
