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
  | "media"
  | "analytics"
  | "ai"
  | "plugins"
  | "search"
  // Knowledge Base System sections
  | "kb.general"
  | "kb.features"
  | "kb.search"
  // Ticket System sections
  | "ticket.general"
  | "ticket.sla"
  // Support Bridge System sections
  | "support.widget"
  | "support.ai"
  // Website Appearance sections
  | "layout"
  | "header"
  | "footer";

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
  "media",
  "analytics",
  "ai",
  "plugins",
  "search",
  // Knowledge Base System sections
  "kb.general",
  "kb.features",
  "kb.search",
  // Ticket System sections
  "ticket.general",
  "ticket.sla",
  // Support Bridge System sections
  "support.widget",
  "support.ai",
  // Website Appearance sections
  "layout",
  "header",
  "footer",
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

export interface PluginsSettings {
  knowledgeBaseEnabled: boolean;
  ticketsEnabled: boolean;
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
  /** Resend API key for sending emails */
  resendApiKey: string;
  /** Resend webhook signing secret */
  webhookSecret: string;
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

// ─── Media Settings Types ───────────────────────────────────────────────────

export interface MediaSettings {
  /** Maximum file upload size in bytes (default: 50MB) */
  maxUploadSize: number;
  /** WordPress-standard thumbnail dimensions */
  thumbnailWidth: number;
  thumbnailHeight: number;
  thumbnailCrop: boolean;
  mediumWidth: number;
  mediumMaxHeight: number;
  mediumLargeWidth: number;
  mediumLargeMaxHeight: number;
  largeWidth: number;
  largeMaxHeight: number;
}

// ─── Analytics Settings Types ───────────────────────────────────────────────

export interface AnalyticsSettings {
  /** Master switch for built-in analytics tracking */
  trackingEnabled: boolean;
  /** Honor the browser Do Not Track header */
  respectDoNotTrack: boolean;
  /** Days to keep raw tracking events before purging */
  retentionDays: number;
}

// ─── Knowledge Base Settings Types ───────────────────────────────────────────

export interface KbGeneralSettings {
  siteName: string;
  siteDescription: string;
  homepageLayout: "categories" | "search" | "featured";
  articlesPerPage: number;
}

export interface KbFeaturesSettings {
  commentsEnabled: boolean;
  bookmarksEnabled: boolean;
  progressTrackingEnabled: boolean;
  ratingsEnabled: boolean;
  relatedArticlesEnabled: boolean;
}

export interface KbSearchSettings {
  meilisearchEnabled: boolean;
  meilisearchUrl: string;
  meilisearchApiKey: string;
  ragEnabled: boolean;
  ragProvider: "openai" | "anthropic";
  ragApiKey: string;
  ragModel: string;
}

// ─── Ticket Settings Types ────────────────────────────────────────────────────

export interface TicketGeneralSettings {
  /** Array of available ticket categories */
  categories: Array<{ value: string; label: string }>;
  /** Default priority for new tickets */
  defaultPriority: "low" | "medium" | "high" | "urgent";
  /** Days to auto-close resolved tickets (0 = disabled) */
  autoCloseAfterDays: number;
}

export interface TicketSlaSettings {
  /** First response SLA target in minutes */
  firstResponseTarget: number;
  /** Resolution SLA target in minutes */
  resolutionTarget: number;
}

// ─── Layout Assignment Settings Types ────────────────────────────────────────

export interface LayoutAssignmentSettings {
  blogPostLayout: string;
  pageLayout: string;
  blogIndexLayout: string;
  categoryArchiveLayout: string;
  tagArchiveLayout: string;
  authorArchiveLayout: string;
  searchResultsLayout: string;
  kbArticleLayout: string;
}

// ─── Header Settings Types ──────────────────────────────────────────────────

export interface HeaderSettings {
  layout: {
    style: "standard" | "centered" | "split";
    sticky: "always" | "scroll-up" | "none";
    background: "solid" | "transparent" | "glass";
    height: "compact" | "normal" | "tall";
    bottomBorder: "subtle" | "bold" | "none" | "shadow";
  };
  topBar: {
    enabled: boolean;
    leftContent: "contact" | "announcement" | "social" | "none";
    rightContent: "contact" | "announcement" | "social" | "none";
    email: string;
    phone: string;
    announcementText: string;
  };
  logo: {
    enabled: boolean;
    showImage: boolean;
    showTitle: boolean;
    showTagline: boolean;
    size: "small" | "medium" | "large";
  };
  navigation: {
    enabled: boolean;
    menuSource: "primary" | "secondary" | "custom";
    style: "inline" | "pills" | "underline";
    dropdownStyle: "flyout" | "mega";
  };
  search: {
    enabled: boolean;
    variant: "inline" | "icon" | "expandable";
    placeholder: string;
  };
  cta: {
    enabled: boolean;
    label: string;
    url: string;
    style: "filled" | "outline" | "ghost";
  };
  userMenu: {
    enabled: boolean;
    guestDisplay: "login-register" | "login-only" | "hidden";
    loggedInDisplay: "avatar-dropdown" | "name-dropdown" | "avatar-only";
    dropdownPreset: "dashboard-profile-logout" | "profile-settings-logout" | "custom";
  };
  darkModeToggle: {
    enabled: boolean;
    variant: "icon" | "switch";
  };
  mobileMenu: {
    variant: "drawer" | "fullscreen" | "dropdown";
    drawerSide: "left" | "right";
  };
}

// ─── Footer Settings Types ──────────────────────────────────────────────────

export interface FooterSettings {
  layout: {
    columns: "1" | "2" | "3" | "4" | "centered" | "minimal";
    background: "dark" | "match-site" | "accent" | "image";
    backgroundImageId: string | null;
    topBorder: "subtle" | "bold" | "accent" | "none";
    padding: "compact" | "normal" | "spacious";
  };
  branding: {
    enabled: boolean;
    showLogo: boolean;
    showDescription: boolean;
    description: string;
    showSocial: boolean;
  };
  navColumns: {
    enabled: boolean;
    columns: Array<{
      heading: string;
      menuSource: "footer-1" | "footer-2" | "footer-3" | "auto-pages" | "custom";
    }>;
  };
  newsletter: {
    enabled: boolean;
    heading: string;
    subtext: string;
    buttonText: string;
  };
  contactInfo: {
    enabled: boolean;
    address: string;
    phone: string;
    email: string;
  };
  bottomBar: {
    enabled: boolean;
    copyrightText: string;
    legalLinks: "privacy-terms" | "privacy-only" | "custom" | "none";
    poweredBy: boolean;
  };
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
  resendApiKey: "",
  webhookSecret: "",
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

// ─── Media Defaults ─────────────────────────────────────────────────────────

export const MEDIA_DEFAULTS: MediaSettings = {
  maxUploadSize: 50 * 1024 * 1024, // 50MB
  thumbnailWidth: 150,
  thumbnailHeight: 150,
  thumbnailCrop: true,
  mediumWidth: 300,
  mediumMaxHeight: 0, // 0 = proportional
  mediumLargeWidth: 768,
  mediumLargeMaxHeight: 0,
  largeWidth: 1024,
  largeMaxHeight: 0,
};

// ─── Analytics Defaults ─────────────────────────────────────────────────────

export const ANALYTICS_DEFAULTS: AnalyticsSettings = {
  trackingEnabled: true,
  respectDoNotTrack: true,
  retentionDays: 90,
};

// ─── Knowledge Base Defaults ──────────────────────────────────────────────────

export const KB_GENERAL_DEFAULTS: KbGeneralSettings = {
  siteName: "Help Center",
  siteDescription: "Find answers to your questions",
  homepageLayout: "categories",
  articlesPerPage: 20,
};

export const KB_FEATURES_DEFAULTS: KbFeaturesSettings = {
  commentsEnabled: true,
  bookmarksEnabled: true,
  progressTrackingEnabled: true,
  ratingsEnabled: true,
  relatedArticlesEnabled: true,
};

export const KB_SEARCH_DEFAULTS: KbSearchSettings = {
  meilisearchEnabled: false,
  meilisearchUrl: "",
  meilisearchApiKey: "",
  ragEnabled: false,
  ragProvider: "openai",
  ragApiKey: "",
  ragModel: "",
};

// ─── Ticket Defaults ──────────────────────────────────────────────────────────

export const TICKET_GENERAL_DEFAULTS: TicketGeneralSettings = {
  categories: [
    { value: "billing", label: "Billing" },
    { value: "technical", label: "Technical" },
    { value: "account", label: "Account" },
    { value: "featureRequest", label: "Feature Request" },
    { value: "general", label: "General" },
    { value: "other", label: "Other" },
  ],
  defaultPriority: "medium",
  autoCloseAfterDays: 14,
};

export const TICKET_SLA_DEFAULTS: TicketSlaSettings = {
  firstResponseTarget: 240, // 4 hours in minutes
  resolutionTarget: 2880, // 48 hours in minutes
};

export const PLUGINS_DEFAULTS: PluginsSettings = {
  knowledgeBaseEnabled: true,
  ticketsEnabled: true,
};

// ─── Layout Assignment Defaults ─────────────────────────────────────────────

export const LAYOUT_ASSIGNMENT_DEFAULTS: LayoutAssignmentSettings = {
  blogPostLayout: "",
  pageLayout: "",
  blogIndexLayout: "",
  categoryArchiveLayout: "",
  tagArchiveLayout: "",
  authorArchiveLayout: "",
  searchResultsLayout: "",
  kbArticleLayout: "",
};

// ─── Header Defaults ────────────────────────────────────────────────────────

export const HEADER_DEFAULTS: HeaderSettings = {
  layout: { style: "standard", sticky: "always", background: "solid", height: "normal", bottomBorder: "subtle" },
  topBar: { enabled: false, leftContent: "contact", rightContent: "social", email: "", phone: "", announcementText: "" },
  logo: { enabled: true, showImage: true, showTitle: true, showTagline: false, size: "medium" },
  navigation: { enabled: true, menuSource: "primary", style: "inline", dropdownStyle: "flyout" },
  search: { enabled: true, variant: "inline", placeholder: "Search..." },
  cta: { enabled: false, label: "Get Started", url: "/register", style: "filled" },
  userMenu: { enabled: true, guestDisplay: "login-register", loggedInDisplay: "avatar-dropdown", dropdownPreset: "dashboard-profile-logout" },
  darkModeToggle: { enabled: true, variant: "icon" },
  mobileMenu: { variant: "drawer", drawerSide: "right" },
};

// ─── Footer Defaults ────────────────────────────────────────────────────────

export const FOOTER_DEFAULTS: FooterSettings = {
  layout: { columns: "4", background: "dark", backgroundImageId: null, topBorder: "subtle", padding: "normal" },
  branding: { enabled: true, showLogo: true, showDescription: true, description: "", showSocial: true },
  navColumns: { enabled: true, columns: [{ heading: "Company", menuSource: "footer-1" }, { heading: "Resources", menuSource: "footer-2" }] },
  newsletter: { enabled: true, heading: "Stay Updated", subtext: "Get the latest posts delivered to your inbox.", buttonText: "Subscribe" },
  contactInfo: { enabled: false, address: "", phone: "", email: "" },
  bottomBar: { enabled: true, copyrightText: "", legalLinks: "privacy-terms", poweredBy: true },
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
  media: MEDIA_DEFAULTS,
  analytics: ANALYTICS_DEFAULTS,
  ai: AI_DEFAULTS,
  plugins: PLUGINS_DEFAULTS,
  search: SEARCH_DEFAULTS,
  // Knowledge Base System sections
  "kb.general": KB_GENERAL_DEFAULTS,
  "kb.features": KB_FEATURES_DEFAULTS,
  "kb.search": KB_SEARCH_DEFAULTS,
  // Ticket System sections
  "ticket.general": TICKET_GENERAL_DEFAULTS,
  "ticket.sla": TICKET_SLA_DEFAULTS,
  // Website Appearance sections
  layout: LAYOUT_ASSIGNMENT_DEFAULTS,
  header: HEADER_DEFAULTS,
  footer: FOOTER_DEFAULTS,
  // Support Bridge System sections
  "support.widget": {
    enabled: true,
    widgetTitle: "Support",
    widgetSubtitle: "How can we help you today?",
    widgetColor: "#3b82f6",
    showKbSearch: true,
    showTicketHistory: true,
    aiEnabled: false,
    escalationButtonLabel: "Contact Support",
  },
  "support.ai": {
    aiProvider: null,
    aiApiKey: "",
    aiModel: "",
    meilisearchEnabled: false,
    meilisearchUrl: "",
    meilisearchApiKey: "",
    ragEnabled: false,
  },
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
