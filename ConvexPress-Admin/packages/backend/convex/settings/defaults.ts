/**
 * Settings System - Default Values
 *
 * All default value constants for the 6 settings sections. These are
 * the initial values used when no settings have been saved (fresh install).
 * The database only stores overrides -- defaults live here in code.
 *
 * When a section is queried, stored values are spread on top of these
 * defaults, so any field not explicitly saved falls back to its default.
 *
 * Usage:
 *   import { getDefaults, GENERAL_DEFAULTS } from "./defaults";
 *
 *   const defaults = getDefaults("general");
 *   const merged = { ...defaults, ...storedValues };
 */

// ─── Section Type ────────────────────────────────────────────────────────────

export type SettingsSection =
  | "general"
  | "reading"
  | "writing"
  | "discussion"
  | "permalinks"
  | "privacy"
  | "email"
  | "ai"
  | "search";

/**
 * Ordered array of all valid section names.
 */
export const SECTION_NAMES: SettingsSection[] = [
  "general",
  "reading",
  "writing",
  "discussion",
  "permalinks",
  "privacy",
  "email",
  "ai",
  "search",
];

/**
 * Sections that are autoloaded on every page request.
 * Writing settings are NOT autoloaded (only needed when creating posts).
 */
export const AUTOLOADED_SECTIONS: SettingsSection[] = [
  "general",
  "reading",
  "permalinks",
  "discussion",
  "privacy",
];

// ─── Section Value Types ─────────────────────────────────────────────────────

export interface GeneralSettings {
  siteTitle: string;
  tagline: string;
  siteUrl: string;
  homeUrl: string;
  adminEmail: string;
  membershipEnabled: boolean;
  defaultRole: string;
  siteLanguage: string;
  timezone: string;
  dateFormat: string;
  timeFormat: string;
  weekStartsOn: number;
  // Password notification settings (read by helpers/password.ts)
  sendPasswordResetEmail: boolean;
  sendPasswordChangedEmail: boolean;
  notifyAdminOnPasswordReset: boolean;
}

export interface ReadingSettings {
  homepageDisplays: "latest_posts" | "static_page";
  homepageId: string | null;
  postsPageId: string | null;
  postsPerPage: number;
  feedItemCount: number;
  feedContentDisplay: "full" | "summary";
  searchEngineVisibility: boolean;
}

export interface WritingSettings {
  defaultCategory: string | null;
  defaultPostFormat: string;
}

export interface DiscussionSettings {
  // Default article settings
  attemptNotifyLinkedBlogs: boolean;
  allowLinkNotifications: boolean;
  allowComments: boolean;

  // Other comment settings
  requireNameEmail: boolean;
  requireRegistration: boolean;
  autoCloseEnabled: boolean;
  autoCloseAfterDays: number;
  enableThreadedComments: boolean;
  threadedCommentsDepth: number;
  enablePaginatedComments: boolean;
  commentsPerPage: number;
  defaultCommentsPage: "newest" | "oldest";
  commentOrder: "asc" | "desc";

  // Email me whenever
  emailOnNewComment: boolean;
  emailOnHeldForModeration: boolean;

  // Before a comment appears
  manualApprovalRequired: boolean;
  previouslyApprovedRequired: boolean;

  // Comment moderation
  holdIfLinksExceed: number;
  moderationWordList: string;
  disallowedWordList: string;

  // Avatars
  showAvatars: boolean;
  avatarRating: "G" | "PG" | "R" | "X";
  defaultAvatar: string;
}

export interface PermalinkSettings {
  structure:
    | "plain"
    | "day_and_name"
    | "month_and_name"
    | "numeric"
    | "post_name"
    | "custom";
  customStructure: string;
  categoryBase: string;
  tagBase: string;
}

export interface PrivacySettings {
  privacyPolicyPageId: string | null;
  showPrivacyPolicyLink: boolean;
}

export interface AISettings {
  /** AI provider: "openrouter" or "anthropic" */
  provider: "openrouter" | "anthropic";
  /** API key for the selected provider */
  apiKey: string;
  /** Default model identifier */
  defaultModel: string;
  /** Tavily API key for research features */
  tavilyApiKey: string;
}

export interface EmailSettings {
  /** Whether the email system is enabled */
  enabled: boolean;
  /** Sender email address */
  fromAddress: string;
  /** Sender display name */
  fromName: string;
  /** Reply-to email address */
  replyTo: string;
  /** Max emails per minute */
  rateLimit: number;
  /** Max emails per 24 hours */
  dailyLimit: number;
  /** Minutes to batch non-immediate emails */
  batchWindow: number;
  /** URL base for unsubscribe links */
  unsubscribeUrl: string;
  /** Max retry attempts for failed sends */
  maxRetries: number;
  /** Delay in minutes between retries */
  retryDelay: number;
  /** Days to retain completed queue records */
  queueRetentionDays: number;
  /** Enable open/click tracking */
  trackingEnabled: boolean;
  /** Send weekly content digest */
  digestEnabled: boolean;
  /** Day of week for digest (0=Sun, 6=Sat) */
  digestDay: number;
  /** Hour (UTC) to send digest */
  digestHour: number;
  /** Include unsubscribe link in all emails */
  includeUnsubscribeLink: boolean;
}

export interface SearchSettings {
  /** Meilisearch host URL (e.g., http://localhost:7700 or cloud URL) */
  meilisearchHost: string;
  /** Meilisearch API key for authentication */
  meilisearchApiKey: string;
}

// ─── Default Values ──────────────────────────────────────────────────────────

export const GENERAL_DEFAULTS: GeneralSettings = {
  siteTitle: "My Site",
  tagline: "Just another ConvexPress site",
  siteUrl: "",
  homeUrl: "",
  adminEmail: "",
  membershipEnabled: false,
  defaultRole: "subscriber",
  siteLanguage: "en-US",
  timezone: "America/New_York",
  dateFormat: "MMMM d, yyyy",
  timeFormat: "h:mm a",
  weekStartsOn: 0,
  // Password notification defaults (must match PASSWORD_SETTINGS_DEFAULTS in password/validators.ts)
  sendPasswordResetEmail: false,
  sendPasswordChangedEmail: true,
  notifyAdminOnPasswordReset: false,
};

export const READING_DEFAULTS: ReadingSettings = {
  homepageDisplays: "latest_posts",
  homepageId: null,
  postsPageId: null,
  postsPerPage: 10,
  feedItemCount: 10,
  feedContentDisplay: "full",
  searchEngineVisibility: true,
};

export const WRITING_DEFAULTS: WritingSettings = {
  defaultCategory: null,
  defaultPostFormat: "standard",
};

export const DISCUSSION_DEFAULTS: DiscussionSettings = {
  attemptNotifyLinkedBlogs: true,
  allowLinkNotifications: true,
  allowComments: true,
  requireNameEmail: true,
  requireRegistration: false,
  autoCloseEnabled: false,
  autoCloseAfterDays: 14,
  enableThreadedComments: true,
  threadedCommentsDepth: 5,
  enablePaginatedComments: false,
  commentsPerPage: 50,
  defaultCommentsPage: "newest",
  commentOrder: "asc",
  emailOnNewComment: true,
  emailOnHeldForModeration: true,
  manualApprovalRequired: false,
  previouslyApprovedRequired: true,
  holdIfLinksExceed: 2,
  moderationWordList: "",
  disallowedWordList: "",
  showAvatars: true,
  avatarRating: "G",
  defaultAvatar: "mystery",
};

export const PERMALINK_DEFAULTS: PermalinkSettings = {
  structure: "post_name",
  customStructure: "",
  categoryBase: "category",
  tagBase: "tag",
};

export const PRIVACY_DEFAULTS: PrivacySettings = {
  privacyPolicyPageId: null,
  showPrivacyPolicyLink: true,
};

export const AI_DEFAULTS: AISettings = {
  provider: "openrouter",
  apiKey: "",
  defaultModel: "anthropic/claude-sonnet-4-20250514",
  tavilyApiKey: "",
};

export const EMAIL_DEFAULTS: EmailSettings = {
  enabled: true,
  fromAddress: "noreply@convexpress.com",
  fromName: "ConvexPress",
  replyTo: "support@convexpress.com",
  rateLimit: 50,
  dailyLimit: 1000,
  batchWindow: 15,
  unsubscribeUrl: "/dashboard/settings",
  maxRetries: 3,
  retryDelay: 5,
  queueRetentionDays: 30,
  trackingEnabled: false,
  digestEnabled: true,
  digestDay: 1,
  digestHour: 8,
  includeUnsubscribeLink: true,
};

export const SEARCH_DEFAULTS: SearchSettings = {
  meilisearchHost: "",
  meilisearchApiKey: "",
};

// ─── Defaults Map ────────────────────────────────────────────────────────────

const DEFAULTS_MAP: Record<SettingsSection, object> = {
  general: GENERAL_DEFAULTS,
  reading: READING_DEFAULTS,
  writing: WRITING_DEFAULTS,
  discussion: DISCUSSION_DEFAULTS,
  permalinks: PERMALINK_DEFAULTS,
  privacy: PRIVACY_DEFAULTS,
  email: EMAIL_DEFAULTS,
  ai: AI_DEFAULTS,
  search: SEARCH_DEFAULTS,
};

/**
 * Get the default values for a given settings section.
 *
 * @param section - The settings section name
 * @returns A fresh copy of the default values for that section
 */
export function getDefaults(section: SettingsSection): Record<string, unknown> {
  const defaults = DEFAULTS_MAP[section];
  if (!defaults) {
    throw new Error(`Unknown settings section: ${section}`);
  }
  // Return a shallow copy to prevent mutation of the constant
  return { ...(defaults as Record<string, unknown>) };
}

/**
 * Check if a string is a valid settings section name.
 */
export function isValidSection(section: string): section is SettingsSection {
  return SECTION_NAMES.includes(section as SettingsSection);
}
