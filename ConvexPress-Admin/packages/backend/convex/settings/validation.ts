/**
 * Settings System - Server-Side Validation
 *
 * Per-section validation logic for settings values. Each section has
 * specific rules beyond simple type checking:
 *
 * - General: URL format, email format, valid timezone, valid role
 * - Reading: Cross-field validation (homepageId != postsPageId)
 * - Writing: Valid post format enum
 * - Discussion: Range checks (days, depth, chars), enum checks
 * - Permalinks: Custom structure must start with /, must contain %postname% or %post_id%
 * - Privacy: Boolean checks
 *
 * These validations run server-side in the updateSection mutation,
 * providing defense-in-depth beyond the client-side Zod schemas.
 */

import type { SettingsSection } from "./defaults";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ValidationError {
  field: string;
  message: string;
}

// ─── Valid Enums ──────────────────────────────────────────────────────────────

const VALID_ROLES = ["subscriber", "contributor", "author", "editor"];

const VALID_POST_FORMATS = [
  "standard",
  "aside",
  "gallery",
  "link",
  "image",
  "quote",
  "status",
  "video",
  "audio",
  "chat",
];

const VALID_PERMALINK_STRUCTURES = [
  "plain",
  "day_and_name",
  "month_and_name",
  "numeric",
  "post_name",
  "custom",
];

const VALID_AVATAR_RATINGS = ["G", "PG", "R", "X"];

const VALID_AVATARS = [
  "mystery",
  "blank",
  "gravatar_default",
  "identicon",
  "wavatar",
  "monsterid",
  "retro",
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isString(v: unknown): v is string {
  return typeof v === "string";
}

function isNumber(v: unknown): v is number {
  return typeof v === "number" && !isNaN(v);
}

function isBoolean(v: unknown): v is boolean {
  return typeof v === "boolean";
}

function isValidEmail(v: string): boolean {
  // Basic email validation (not exhaustive - server-side sanity check)
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

function isValidUrl(v: string): boolean {
  if (v.length === 0) return true; // Allow empty (auto-detect)
  try {
    new URL(v);
    return true;
  } catch {
    return false;
  }
}

function intInRange(v: unknown, min: number, max: number): boolean {
  return isNumber(v) && Number.isInteger(v) && v >= min && v <= max;
}

// ─── Per-Section Validators ───────────────────────────────────────────────────

function validateGeneral(values: Record<string, unknown>): ValidationError[] {
  const errors: ValidationError[] = [];

  // siteTitle: required, 1-200 chars
  if (!isString(values.siteTitle) || values.siteTitle.trim().length === 0) {
    errors.push({ field: "siteTitle", message: "Site title is required." });
  } else if (values.siteTitle.length > 200) {
    errors.push({ field: "siteTitle", message: "Site title must be 200 characters or less." });
  }

  // tagline: optional, max 500
  if (values.tagline !== undefined && isString(values.tagline) && values.tagline.length > 500) {
    errors.push({ field: "tagline", message: "Tagline must be 500 characters or less." });
  }

  // siteUrl: valid URL
  if (isString(values.siteUrl) && !isValidUrl(values.siteUrl)) {
    errors.push({ field: "siteUrl", message: "Site URL must be a valid URL." });
  }

  // homeUrl: valid URL
  if (isString(values.homeUrl) && !isValidUrl(values.homeUrl)) {
    errors.push({ field: "homeUrl", message: "Home URL must be a valid URL." });
  }

  // adminEmail: valid email (or empty)
  if (isString(values.adminEmail) && values.adminEmail.length > 0 && !isValidEmail(values.adminEmail)) {
    errors.push({ field: "adminEmail", message: "Administration email must be a valid email address." });
  }

  // membershipEnabled: boolean
  if (values.membershipEnabled !== undefined && !isBoolean(values.membershipEnabled)) {
    errors.push({ field: "membershipEnabled", message: "Membership must be a boolean." });
  }

  // defaultRole: valid role
  if (isString(values.defaultRole) && !VALID_ROLES.includes(values.defaultRole)) {
    errors.push({ field: "defaultRole", message: `Default role must be one of: ${VALID_ROLES.join(", ")}.` });
  }

  // weekStartsOn: 0-6
  if (values.weekStartsOn !== undefined && !intInRange(values.weekStartsOn, 0, 6)) {
    errors.push({ field: "weekStartsOn", message: "Week starts on must be 0-6." });
  }

  // Boolean password settings
  for (const f of ["sendPasswordResetEmail", "sendPasswordChangedEmail", "notifyAdminOnPasswordReset"]) {
    if (values[f] !== undefined && !isBoolean(values[f])) {
      errors.push({ field: f, message: `${f} must be a boolean.` });
    }
  }

  return errors;
}

function validateReading(values: Record<string, unknown>): ValidationError[] {
  const errors: ValidationError[] = [];

  // homepageDisplays enum
  if (!isString(values.homepageDisplays) || !["latest_posts", "static_page"].includes(values.homepageDisplays)) {
    errors.push({ field: "homepageDisplays", message: "Homepage display must be 'latest_posts' or 'static_page'." });
  }

  // If static_page, homepageId is required
  if (values.homepageDisplays === "static_page") {
    if (!values.homepageId || !isString(values.homepageId)) {
      errors.push({ field: "homepageId", message: "Homepage must be selected when using static page display." });
    }
  }

  // Cross-field: homepageId != postsPageId
  if (
    values.homepageId &&
    values.postsPageId &&
    isString(values.homepageId) &&
    isString(values.postsPageId) &&
    values.homepageId === values.postsPageId
  ) {
    errors.push({ field: "postsPageId", message: "Posts page cannot be the same as the homepage." });
  }

  // postsPerPage: 1-100
  if (!intInRange(values.postsPerPage, 1, 100)) {
    errors.push({ field: "postsPerPage", message: "Posts per page must be 1-100." });
  }

  // feedItemCount: 1-100
  if (!intInRange(values.feedItemCount, 1, 100)) {
    errors.push({ field: "feedItemCount", message: "Feed item count must be 1-100." });
  }

  // feedContentDisplay enum
  if (!isString(values.feedContentDisplay) || !["full", "summary"].includes(values.feedContentDisplay)) {
    errors.push({ field: "feedContentDisplay", message: "Feed content display must be 'full' or 'summary'." });
  }

  // searchEngineVisibility: boolean
  if (values.searchEngineVisibility !== undefined && !isBoolean(values.searchEngineVisibility)) {
    errors.push({ field: "searchEngineVisibility", message: "Search engine visibility must be a boolean." });
  }

  return errors;
}

function validateWriting(values: Record<string, unknown>): ValidationError[] {
  const errors: ValidationError[] = [];

  // defaultPostFormat: valid enum
  if (isString(values.defaultPostFormat) && !VALID_POST_FORMATS.includes(values.defaultPostFormat)) {
    errors.push({ field: "defaultPostFormat", message: `Default post format must be one of: ${VALID_POST_FORMATS.join(", ")}.` });
  }

  return errors;
}

function validateDiscussion(values: Record<string, unknown>): ValidationError[] {
  const errors: ValidationError[] = [];

  // Boolean fields
  const booleanFields = [
    "attemptNotifyLinkedBlogs",
    "allowLinkNotifications",
    "allowComments",
    "requireNameEmail",
    "requireRegistration",
    "autoCloseEnabled",
    "enableThreadedComments",
    "enablePaginatedComments",
    "emailOnNewComment",
    "emailOnHeldForModeration",
    "manualApprovalRequired",
    "previouslyApprovedRequired",
    "showAvatars",
  ];
  for (const f of booleanFields) {
    if (values[f] !== undefined && !isBoolean(values[f])) {
      errors.push({ field: f, message: `${f} must be a boolean.` });
    }
  }

  // autoCloseAfterDays: 1-365
  if (values.autoCloseAfterDays !== undefined && !intInRange(values.autoCloseAfterDays, 1, 365)) {
    errors.push({ field: "autoCloseAfterDays", message: "Auto-close days must be 1-365." });
  }

  // threadedCommentsDepth: 1-10
  if (values.threadedCommentsDepth !== undefined && !intInRange(values.threadedCommentsDepth, 1, 10)) {
    errors.push({ field: "threadedCommentsDepth", message: "Threaded comments depth must be 1-10." });
  }

  // commentsPerPage: 1-200
  if (values.commentsPerPage !== undefined && !intInRange(values.commentsPerPage, 1, 200)) {
    errors.push({ field: "commentsPerPage", message: "Comments per page must be 1-200." });
  }

  // holdIfLinksExceed: 0-100
  if (values.holdIfLinksExceed !== undefined && !intInRange(values.holdIfLinksExceed, 0, 100)) {
    errors.push({ field: "holdIfLinksExceed", message: "Hold if links exceed must be 0-100." });
  }

  // defaultCommentsPage enum
  if (values.defaultCommentsPage !== undefined &&
    (!isString(values.defaultCommentsPage) || !["newest", "oldest"].includes(values.defaultCommentsPage))) {
    errors.push({ field: "defaultCommentsPage", message: "Default comments page must be 'newest' or 'oldest'." });
  }

  // commentOrder enum
  if (values.commentOrder !== undefined &&
    (!isString(values.commentOrder) || !["asc", "desc"].includes(values.commentOrder))) {
    errors.push({ field: "commentOrder", message: "Comment order must be 'asc' or 'desc'." });
  }

  // moderationWordList: max 50k
  if (isString(values.moderationWordList) && values.moderationWordList.length > 50000) {
    errors.push({ field: "moderationWordList", message: "Moderation word list must be 50,000 characters or less." });
  }

  // disallowedWordList: max 50k
  if (isString(values.disallowedWordList) && values.disallowedWordList.length > 50000) {
    errors.push({ field: "disallowedWordList", message: "Disallowed word list must be 50,000 characters or less." });
  }

  // avatarRating enum
  if (values.avatarRating !== undefined &&
    (!isString(values.avatarRating) || !VALID_AVATAR_RATINGS.includes(values.avatarRating))) {
    errors.push({ field: "avatarRating", message: `Avatar rating must be one of: ${VALID_AVATAR_RATINGS.join(", ")}.` });
  }

  // defaultAvatar enum
  if (values.defaultAvatar !== undefined &&
    (!isString(values.defaultAvatar) || !VALID_AVATARS.includes(values.defaultAvatar))) {
    errors.push({ field: "defaultAvatar", message: `Default avatar must be one of: ${VALID_AVATARS.join(", ")}.` });
  }

  return errors;
}

function validatePermalinks(values: Record<string, unknown>): ValidationError[] {
  const errors: ValidationError[] = [];

  // structure: valid enum
  if (!isString(values.structure) || !VALID_PERMALINK_STRUCTURES.includes(values.structure)) {
    errors.push({ field: "structure", message: `Permalink structure must be one of: ${VALID_PERMALINK_STRUCTURES.join(", ")}.` });
  }

  // customStructure: when structure is "custom"
  if (values.structure === "custom") {
    if (!isString(values.customStructure) || values.customStructure.trim().length === 0) {
      errors.push({ field: "customStructure", message: "Custom structure is required when using custom permalink structure." });
    } else {
      // Must start with /
      if (!values.customStructure.startsWith("/")) {
        errors.push({ field: "customStructure", message: "Custom structure must start with '/'." });
      }
      // Must contain %postname% or %post_id%
      if (
        !values.customStructure.includes("%postname%") &&
        !values.customStructure.includes("%post_id%")
      ) {
        errors.push({ field: "customStructure", message: "Custom structure must contain %postname% or %post_id%." });
      }
    }
  }

  // categoryBase: alphanumeric + hyphens, max 100
  if (isString(values.categoryBase)) {
    if (values.categoryBase.length > 100) {
      errors.push({ field: "categoryBase", message: "Category base must be 100 characters or less." });
    }
    if (values.categoryBase.length > 0 && !/^[a-zA-Z0-9-]+$/.test(values.categoryBase)) {
      errors.push({ field: "categoryBase", message: "Category base must contain only letters, numbers, and hyphens." });
    }
  }

  // tagBase: alphanumeric + hyphens, max 100
  if (isString(values.tagBase)) {
    if (values.tagBase.length > 100) {
      errors.push({ field: "tagBase", message: "Tag base must be 100 characters or less." });
    }
    if (values.tagBase.length > 0 && !/^[a-zA-Z0-9-]+$/.test(values.tagBase)) {
      errors.push({ field: "tagBase", message: "Tag base must contain only letters, numbers, and hyphens." });
    }
  }

  return errors;
}

function validatePrivacy(values: Record<string, unknown>): ValidationError[] {
  const errors: ValidationError[] = [];

  // showPrivacyPolicyLink: boolean
  if (values.showPrivacyPolicyLink !== undefined && !isBoolean(values.showPrivacyPolicyLink)) {
    errors.push({ field: "showPrivacyPolicyLink", message: "Show privacy policy link must be a boolean." });
  }

  return errors;
}

function validateEmail(values: Record<string, unknown>): ValidationError[] {
  const errors: ValidationError[] = [];

  // enabled: boolean
  if (values.enabled !== undefined && !isBoolean(values.enabled)) {
    errors.push({ field: "enabled", message: "Enabled must be a boolean." });
  }

  // fromAddress: valid email
  if (isString(values.fromAddress) && values.fromAddress.length > 0 && !isValidEmail(values.fromAddress)) {
    errors.push({ field: "fromAddress", message: "From address must be a valid email." });
  }

  // fromName: max 200
  if (isString(values.fromName) && values.fromName.length > 200) {
    errors.push({ field: "fromName", message: "From name must be 200 characters or less." });
  }

  // replyTo: valid email
  if (isString(values.replyTo) && values.replyTo.length > 0 && !isValidEmail(values.replyTo)) {
    errors.push({ field: "replyTo", message: "Reply-to must be a valid email." });
  }

  // rateLimit: 1-1000
  if (values.rateLimit !== undefined && !intInRange(values.rateLimit, 1, 1000)) {
    errors.push({ field: "rateLimit", message: "Rate limit must be 1-1000 emails per minute." });
  }

  // dailyLimit: 1-100000
  if (values.dailyLimit !== undefined && !intInRange(values.dailyLimit, 1, 100000)) {
    errors.push({ field: "dailyLimit", message: "Daily limit must be 1-100,000." });
  }

  // batchWindow: 1-60
  if (values.batchWindow !== undefined && !intInRange(values.batchWindow, 1, 60)) {
    errors.push({ field: "batchWindow", message: "Batch window must be 1-60 minutes." });
  }

  // maxRetries: 0-10
  if (values.maxRetries !== undefined && !intInRange(values.maxRetries, 0, 10)) {
    errors.push({ field: "maxRetries", message: "Max retries must be 0-10." });
  }

  // retryDelay: 1-60
  if (values.retryDelay !== undefined && !intInRange(values.retryDelay, 1, 60)) {
    errors.push({ field: "retryDelay", message: "Retry delay must be 1-60 minutes." });
  }

  // queueRetentionDays: 1-365
  if (values.queueRetentionDays !== undefined && !intInRange(values.queueRetentionDays, 1, 365)) {
    errors.push({ field: "queueRetentionDays", message: "Queue retention must be 1-365 days." });
  }

  // Boolean fields
  for (const f of ["trackingEnabled", "digestEnabled", "includeUnsubscribeLink"]) {
    if (values[f] !== undefined && !isBoolean(values[f])) {
      errors.push({ field: f, message: `${f} must be a boolean.` });
    }
  }

  // digestDay: 0-6
  if (values.digestDay !== undefined && !intInRange(values.digestDay, 0, 6)) {
    errors.push({ field: "digestDay", message: "Digest day must be 0-6 (Sunday-Saturday)." });
  }

  // digestHour: 0-23
  if (values.digestHour !== undefined && !intInRange(values.digestHour, 0, 23)) {
    errors.push({ field: "digestHour", message: "Digest hour must be 0-23." });
  }

  return errors;
}

function validateAI(values: Record<string, unknown>): ValidationError[] {
  const errors: ValidationError[] = [];

  // provider: must be "openrouter" or "anthropic"
  if (values.provider !== undefined &&
    (!isString(values.provider) || !["openrouter", "anthropic"].includes(values.provider))) {
    errors.push({ field: "provider", message: "Provider must be 'openrouter' or 'anthropic'." });
  }

  // apiKey: string, max 500
  if (values.apiKey !== undefined && isString(values.apiKey) && values.apiKey.length > 500) {
    errors.push({ field: "apiKey", message: "API key must be 500 characters or less." });
  }

  // defaultModel: string, max 200
  if (values.defaultModel !== undefined && isString(values.defaultModel) && values.defaultModel.length > 200) {
    errors.push({ field: "defaultModel", message: "Default model must be 200 characters or less." });
  }

  // tavilyApiKey: string, max 500
  if (values.tavilyApiKey !== undefined && isString(values.tavilyApiKey) && values.tavilyApiKey.length > 500) {
    errors.push({ field: "tavilyApiKey", message: "Tavily API key must be 500 characters or less." });
  }

  return errors;
}

function validateSearch(values: Record<string, unknown>): ValidationError[] {
  const errors: ValidationError[] = [];

  // meilisearchHost: valid URL or empty
  if (isString(values.meilisearchHost) && values.meilisearchHost.length > 0) {
    if (!isValidUrl(values.meilisearchHost)) {
      errors.push({ field: "meilisearchHost", message: "Meilisearch host must be a valid URL." });
    }
    if (values.meilisearchHost.length > 500) {
      errors.push({ field: "meilisearchHost", message: "Meilisearch host must be 500 characters or less." });
    }
  }

  // meilisearchApiKey: string, max 500
  if (values.meilisearchApiKey !== undefined && isString(values.meilisearchApiKey) && values.meilisearchApiKey.length > 500) {
    errors.push({ field: "meilisearchApiKey", message: "Meilisearch API key must be 500 characters or less." });
  }

  return errors;
}

// ─── Main Validator ───────────────────────────────────────────────────────────

/**
 * Validate settings values for a specific section.
 * Returns an array of validation errors (empty = valid).
 */
export function validateSectionValues(
  section: SettingsSection,
  values: Record<string, unknown>,
): ValidationError[] {
  switch (section) {
    case "general":
      return validateGeneral(values);
    case "reading":
      return validateReading(values);
    case "writing":
      return validateWriting(values);
    case "discussion":
      return validateDiscussion(values);
    case "permalinks":
      return validatePermalinks(values);
    case "privacy":
      return validatePrivacy(values);
    case "email":
      return validateEmail(values);
    case "ai":
      return validateAI(values);
    case "search":
      return validateSearch(values);
    default:
      return [];
  }
}
