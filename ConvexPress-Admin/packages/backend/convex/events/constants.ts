/**
 * Event Dispatcher System - Constants
 *
 * All 105 event codes from the Airtable blueprint, organized by system.
 * Also includes system slugs, wildcard patterns, and retention policy values.
 *
 * Event code format: "{system}.{action}" (e.g., "post.created")
 *
 * These constants are the canonical reference for event codes. All systems
 * MUST use these constants when emitting events rather than inline strings.
 */

// ─── System Slugs ──────────────────────────────────────────────────────────

export const SYSTEM = {
  POST: "post",
  PAGE: "page",
  MEDIA: "media",
  TAXONOMY: "taxonomy",
  COMMENT: "comment",
  ROLE: "role",
  PROFILE: "profile",
  AUTH: "auth",
  PASSWORD: "password",
  REGISTRATION: "registration",
  DASHBOARD: "dashboard",
  EDITOR: "editor",
  CUSTOM_FIELD: "custom_field",
  REVISION: "revision",
  SEO: "seo",
  SEARCH: "search",
  MENU: "menu",
  SETTINGS: "settings",
  EMAIL: "email",
  NOTIFICATION: "notification",
  AUDIT: "audit",
  API: "api",
  EVENT: "event",
  ROUTING: "routing",
  FEED: "feed",
  SITEMAP: "sitemap",
  KB: "kb",
  TICKET: "ticket",
  SUPPORT: "support",
} as const;

export type SystemSlug = (typeof SYSTEM)[keyof typeof SYSTEM];

// ─── Event Codes (115 total) ───────────────────────────────────────────────

/** Post System events (10) */
export const POST_EVENTS = {
  CREATED: "post.created",
  UPDATED: "post.updated",
  DELETED: "post.deleted",
  PUBLISHED: "post.published",
  UNPUBLISHED: "post.unpublished",
  SCHEDULED: "post.scheduled",
  TRASHED: "post.trashed",
  RESTORED: "post.restored",
  DUPLICATED: "post.duplicated",
  STATUS_CHANGED: "post.status_changed",
} as const;

/** Page System events (8) */
export const PAGE_EVENTS = {
  CREATED: "page.created",
  UPDATED: "page.updated",
  DELETED: "page.deleted",
  PUBLISHED: "page.published",
  UNPUBLISHED: "page.unpublished",
  TRASHED: "page.trashed",
  RESTORED: "page.restored",
  REORDERED: "page.reordered",
} as const;

/** Media System events (4) */
export const MEDIA_EVENTS = {
  UPLOADED: "media.uploaded",
  UPDATED: "media.updated",
  DELETED: "media.deleted",
  /** @deprecated Not emitted as a separate event. Crop operations emit
   *  MEDIA_EVENTS.UPDATED with `editAction: "crop"` in the payload instead.
   *  Kept for backward compatibility with audit classification/descriptions. */
  CROPPED: "media.cropped",
} as const;

/** Taxonomy System events (8) */
export const TAXONOMY_EVENTS = {
  CATEGORY_CREATED: "taxonomy.category_created",
  CATEGORY_UPDATED: "taxonomy.category_updated",
  CATEGORY_DELETED: "taxonomy.category_deleted",
  TAG_CREATED: "taxonomy.tag_created",
  TAG_UPDATED: "taxonomy.tag_updated",
  TAG_DELETED: "taxonomy.tag_deleted",
  TERM_ASSIGNED: "taxonomy.term_assigned",
  MERGED: "taxonomy.merged",
} as const;

/** Comment System events (8) */
export const COMMENT_EVENTS = {
  CREATED: "comment.created",
  UPDATED: "comment.updated",
  DELETED: "comment.deleted",
  APPROVED: "comment.approved",
  REJECTED: "comment.rejected",
  SPAMMED: "comment.spammed",
  REPLIED: "comment.replied",
  FLAGGED: "comment.flagged",
} as const;

/** Role & Capability System events (6) */
export const ROLE_EVENTS = {
  CREATED: "role.created",
  UPDATED: "role.updated",
  DELETED: "role.deleted",
  ASSIGNED: "role.assigned",
  CAPABILITY_GRANTED: "role.capability_granted",
  CAPABILITY_REVOKED: "role.capability_revoked",
} as const;

/** User Profile System events (4) */
export const PROFILE_EVENTS = {
  UPDATED: "profile.updated",
  AVATAR_CHANGED: "profile.avatar_changed",
  DEACTIVATED: "profile.deactivated",
  DELETED: "profile.deleted",
} as const;

/** Auth System events (6) */
export const AUTH_EVENTS = {
  LOGIN: "auth.login",
  LOGOUT: "auth.logout",
  SESSION_REFRESHED: "auth.session_refreshed",
  OAUTH_COMPLETED: "auth.oauth_completed",
  EMAIL_VERIFIED: "auth.email_verified",
  LOGIN_FAILED: "auth.login_failed",
} as const;

/** Password System events (3) */
export const PASSWORD_EVENTS = {
  CHANGED: "password.changed",
  RESET_REQUESTED: "password.reset_requested",
  RESET_COMPLETED: "password.reset_completed",
} as const;

/** Registration System events (4) */
export const REGISTRATION_EVENTS = {
  REGISTERED: "registration.registered",
  EMAIL_VERIFIED: "registration.email_verified",
  USER_INVITED: "registration.user_invited",
  USER_REGISTERED: "registration.user_registered",
} as const;

/** Editor System events (2) */
export const EDITOR_EVENTS = {
  DRAFT_SAVED: "editor.draft_saved",
  AUTOSAVED: "editor.autosaved",
} as const;

/** Custom Field System events (6) */
export const CUSTOM_FIELD_EVENTS = {
  GROUP_CREATED: "custom_field.group_created",
  GROUP_UPDATED: "custom_field.group_updated",
  GROUP_DELETED: "custom_field.group_deleted",
  GROUP_ACTIVATED: "custom_field.group_activated",
  GROUP_DEACTIVATED: "custom_field.group_deactivated",
  VALUE_SET: "custom_field.value_set",
} as const;

/** Revision System events (2) */
export const REVISION_EVENTS = {
  CREATED: "revision.created",
  RESTORED: "revision.restored",
} as const;

/** SEO System events (2) */
export const SEO_EVENTS = {
  META_UPDATED: "seo.meta_updated",
  SITEMAP_GENERATED: "seo.sitemap_generated",
} as const;

/** Search System events (1) */
export const SEARCH_EVENTS = {
  REINDEX_COMPLETED: "search.reindex_completed",
} as const;

/** Menu System events (4) */
export const MENU_EVENTS = {
  CREATED: "menu.created",
  UPDATED: "menu.updated",
  DELETED: "menu.deleted",
  LOCATION_ASSIGNED: "menu.location_assigned",
} as const;

/** Settings System events (2) */
export const SETTINGS_EVENTS = {
  UPDATED: "settings.updated",
  PERMALINKS_CHANGED: "settings.permalinks_changed",
} as const;

/** Email System events (2) */
export const EMAIL_EVENTS = {
  SENT: "email.sent",
  FAILED: "email.failed",
} as const;

/** Notification System events (3) */
export const NOTIFICATION_EVENTS = {
  SENT: "notification.sent",
  EMAIL_SENT: "notification.email_sent",
  EMAIL_FAILED: "notification.email_failed",
} as const;

/** API System events (3) */
export const API_EVENTS = {
  KEY_CREATED: "api.key_created",
  KEY_REVOKED: "api.key_revoked",
  WEBHOOK_TRIGGERED: "api.webhook_triggered",
} as const;

/** Event Dispatcher System self-events (1) - for meta-monitoring */
export const EVENT_EVENTS = {
  LISTENER_FAILED: "event.listener_failed",
} as const;

/** Audit Log System events (2) */
export const AUDIT_EVENTS = {
  CLEARED: "audit.cleared",
  EXPORTED: "audit.exported",
} as const;

/** Dashboard System events (6) */
export const DASHBOARD_EVENTS = {
  VIEWED: "dashboard.viewed",
  QUICK_DRAFTED: "dashboard.quick_drafted",
  WIDGET_DISMISSED: "dashboard.widget_dismissed",
  WIDGET_RESTORED: "dashboard.widget_restored",
  WIDGETS_REORDERED: "dashboard.widgets_reordered",
  WELCOME_DISMISSED: "dashboard.welcome_dismissed",
} as const;

/** Knowledge Base System events (8) */
export const KB_EVENTS = {
  ARTICLE_CREATED: "kb.article_created",
  ARTICLE_PUBLISHED: "kb.article_published",
  ARTICLE_UNPUBLISHED: "kb.article_unpublished",
  ARTICLE_UPDATED: "kb.article_updated",
  ARTICLE_ARCHIVED: "kb.article_archived",
  ARTICLE_DELETED: "kb.article_deleted",
  COMMENT_CREATED: "kb.comment_created",
  FEEDBACK_SUBMITTED: "kb.feedback_submitted",
} as const;

/** Ticket System events (8) */
export const TICKET_EVENTS = {
  CREATED: "ticket.created",
  REPLIED: "ticket.replied",
  ASSIGNED: "ticket.assigned",
  STATUS_CHANGED: "ticket.status_changed",
  PRIORITY_CHANGED: "ticket.priority_changed",
  RESOLVED: "ticket.resolved",
  CLOSED: "ticket.closed",
  RATED: "ticket.rated",
} as const;

/** Support Bridge System events (2) */
export const SUPPORT_EVENTS = {
  DEFLECTION_ATTEMPTED: "support.deflection_attempted",
  DEFLECTION_ESCALATED: "support.deflection_escalated",
} as const;

// ─── All Event Codes ───────────────────────────────────────────────────────

/**
 * Flat array of all 115 event code strings.
 * Used for validation and admin UI display.
 */
export const ALL_EVENT_CODES: string[] = [
  ...Object.values(POST_EVENTS),
  ...Object.values(PAGE_EVENTS),
  ...Object.values(MEDIA_EVENTS),
  ...Object.values(TAXONOMY_EVENTS),
  ...Object.values(COMMENT_EVENTS),
  ...Object.values(ROLE_EVENTS),
  ...Object.values(PROFILE_EVENTS),
  ...Object.values(AUTH_EVENTS),
  ...Object.values(PASSWORD_EVENTS),
  ...Object.values(REGISTRATION_EVENTS),
  ...Object.values(EDITOR_EVENTS),
  ...Object.values(CUSTOM_FIELD_EVENTS),
  ...Object.values(REVISION_EVENTS),
  ...Object.values(SEO_EVENTS),
  ...Object.values(SEARCH_EVENTS),
  ...Object.values(MENU_EVENTS),
  ...Object.values(SETTINGS_EVENTS),
  ...Object.values(EMAIL_EVENTS),
  ...Object.values(NOTIFICATION_EVENTS),
  ...Object.values(API_EVENTS),
  ...Object.values(EVENT_EVENTS),
  ...Object.values(AUDIT_EVENTS),
  ...Object.values(DASHBOARD_EVENTS),
  ...Object.values(KB_EVENTS),
  ...Object.values(TICKET_EVENTS),
  ...Object.values(SUPPORT_EVENTS),
];

/** Set for O(1) lookup of valid event codes. */
export const EVENT_CODE_SET: Set<string> = new Set(ALL_EVENT_CODES);

/**
 * Validate that a string is a recognized event code.
 */
export function isValidEventCode(code: string): boolean {
  return EVENT_CODE_SET.has(code);
}

// ─── Event Codes Grouped By System ─────────────────────────────────────────

/**
 * All event codes organized by system slug.
 * Useful for admin UI rendering and filtering.
 */
export const EVENT_CODES_BY_SYSTEM: Record<string, readonly string[]> = {
  [SYSTEM.POST]: Object.values(POST_EVENTS),
  [SYSTEM.PAGE]: Object.values(PAGE_EVENTS),
  [SYSTEM.MEDIA]: Object.values(MEDIA_EVENTS),
  [SYSTEM.TAXONOMY]: Object.values(TAXONOMY_EVENTS),
  [SYSTEM.COMMENT]: Object.values(COMMENT_EVENTS),
  [SYSTEM.ROLE]: Object.values(ROLE_EVENTS),
  [SYSTEM.PROFILE]: Object.values(PROFILE_EVENTS),
  [SYSTEM.AUTH]: Object.values(AUTH_EVENTS),
  [SYSTEM.PASSWORD]: Object.values(PASSWORD_EVENTS),
  [SYSTEM.REGISTRATION]: Object.values(REGISTRATION_EVENTS),
  [SYSTEM.EDITOR]: Object.values(EDITOR_EVENTS),
  [SYSTEM.CUSTOM_FIELD]: Object.values(CUSTOM_FIELD_EVENTS),
  [SYSTEM.REVISION]: Object.values(REVISION_EVENTS),
  [SYSTEM.SEO]: Object.values(SEO_EVENTS),
  [SYSTEM.SEARCH]: Object.values(SEARCH_EVENTS),
  [SYSTEM.MENU]: Object.values(MENU_EVENTS),
  [SYSTEM.SETTINGS]: Object.values(SETTINGS_EVENTS),
  [SYSTEM.EMAIL]: Object.values(EMAIL_EVENTS),
  [SYSTEM.NOTIFICATION]: Object.values(NOTIFICATION_EVENTS),
  [SYSTEM.API]: Object.values(API_EVENTS),
  [SYSTEM.EVENT]: Object.values(EVENT_EVENTS),
  [SYSTEM.AUDIT]: Object.values(AUDIT_EVENTS),
  [SYSTEM.KB]: Object.values(KB_EVENTS),
  [SYSTEM.TICKET]: Object.values(TICKET_EVENTS),
  [SYSTEM.SUPPORT]: Object.values(SUPPORT_EVENTS),
};

// ─── Wildcard / Global Patterns ────────────────────────────────────────────

/**
 * Special listener event codes:
 *   - "*" matches ALL events (global listener)
 *   - "system.*" matches all events for a system (e.g., "post.*")
 */
export const WILDCARD_ALL = "*";
export const WILDCARD_SYSTEM_SUFFIX = ".*";

/**
 * Check if an event code pattern is a wildcard.
 */
export function isWildcard(pattern: string): boolean {
  return pattern === WILDCARD_ALL || pattern.endsWith(WILDCARD_SYSTEM_SUFFIX);
}

/**
 * Check if an event code matches a listener pattern.
 *
 * Matching rules:
 *   - "*" matches everything
 *   - "post.*" matches "post.created", "post.updated", etc.
 *   - "post.created" matches "post.created" (exact)
 */
export function matchesEventCode(
  eventCode: string,
  listenerPattern: string,
): boolean {
  // Global wildcard
  if (listenerPattern === WILDCARD_ALL) return true;

  // System wildcard (e.g., "post.*")
  if (listenerPattern.endsWith(WILDCARD_SYSTEM_SUFFIX)) {
    const systemPrefix = listenerPattern.slice(0, -2); // Remove ".*"
    return eventCode.startsWith(systemPrefix + ".");
  }

  // Exact match
  return eventCode === listenerPattern;
}

// ─── Retention Policy ──────────────────────────────────────────────────────

/**
 * Event retention durations in milliseconds.
 * Aligned with knowledge doc retention policy:
 *
 *   | Category              | Retention |
 *   |-----------------------|-----------|
 *   | Auth events           | 365 days  |
 *   | Deletion events       | 365 days  |
 *   | Role changes          | 365 days  |
 *   | Settings events       | 180 days  |
 *   | Content events        |  90 days  |
 *   | Comment events        |  90 days  |
 *   | All other events      |  90 days  |
 *   | Notification events   |  30 days  |
 *   | High-frequency noise  |   7 days  |
 */
export const RETENTION = {
  /** Critical security/compliance retention: 365 days */
  CRITICAL_MS: 365 * 24 * 60 * 60 * 1000,

  /** Configuration audit retention: 180 days */
  CONFIG_MS: 180 * 24 * 60 * 60 * 1000,

  /** Standard activity retention: 90 days (default) */
  DEFAULT_MS: 90 * 24 * 60 * 60 * 1000,

  /** Notification/operational data retention: 30 days */
  SHORT_MS: 30 * 24 * 60 * 60 * 1000,

  /** High-frequency noise retention (editor autosaves, session refreshes): 7 days */
  NOISE_MS: 7 * 24 * 60 * 60 * 1000,
} as const;

/**
 * Event codes that get CRITICAL retention (365 days).
 * Auth events, deletion events, and role changes.
 */
const CRITICAL_RETENTION_CODES: Set<string> = new Set([
  // Auth events (security audit trail)
  AUTH_EVENTS.LOGIN,
  AUTH_EVENTS.LOGOUT,
  AUTH_EVENTS.LOGIN_FAILED,
  AUTH_EVENTS.EMAIL_VERIFIED,
  AUTH_EVENTS.OAUTH_COMPLETED,
  // Password events (security)
  PASSWORD_EVENTS.CHANGED,
  PASSWORD_EVENTS.RESET_REQUESTED,
  PASSWORD_EVENTS.RESET_COMPLETED,
  // Role changes (access control audit)
  ROLE_EVENTS.CREATED,
  ROLE_EVENTS.UPDATED,
  ROLE_EVENTS.DELETED,
  ROLE_EVENTS.ASSIGNED,
  ROLE_EVENTS.CAPABILITY_GRANTED,
  ROLE_EVENTS.CAPABILITY_REVOKED,
  // Deletion events (compliance/recovery)
  POST_EVENTS.DELETED,
  PAGE_EVENTS.DELETED,
  MEDIA_EVENTS.DELETED,
  COMMENT_EVENTS.DELETED,
  TAXONOMY_EVENTS.CATEGORY_DELETED,
  TAXONOMY_EVENTS.TAG_DELETED,
  PROFILE_EVENTS.DEACTIVATED,
  PROFILE_EVENTS.DELETED,
  MENU_EVENTS.DELETED,
  API_EVENTS.KEY_REVOKED,
  // Audit events (compliance)
  AUDIT_EVENTS.CLEARED,
  AUDIT_EVENTS.EXPORTED,
]);

/**
 * Event codes that get CONFIG retention (180 days).
 * Settings and configuration changes.
 */
const CONFIG_RETENTION_CODES: Set<string> = new Set([
  SETTINGS_EVENTS.UPDATED,
  SETTINGS_EVENTS.PERMALINKS_CHANGED,
  API_EVENTS.KEY_CREATED,
]);

/**
 * Event codes that get SHORT retention (30 days).
 * Notification/operational data.
 */
const SHORT_RETENTION_CODES: Set<string> = new Set([
  NOTIFICATION_EVENTS.SENT,
  NOTIFICATION_EVENTS.EMAIL_SENT,
  NOTIFICATION_EVENTS.EMAIL_FAILED,
  EMAIL_EVENTS.SENT,
  EMAIL_EVENTS.FAILED,
]);

/**
 * Event codes that get NOISE retention (7 days).
 * Very high frequency, low value events.
 */
const NOISE_RETENTION_CODES: Set<string> = new Set([
  AUTH_EVENTS.SESSION_REFRESHED,
  EDITOR_EVENTS.AUTOSAVED,
  EDITOR_EVENTS.DRAFT_SAVED,
]);

/**
 * Get the retention duration for an event code.
 *
 * Lookup order (first match wins):
 *   1. Noise tier (7 days) - high-frequency noise
 *   2. Critical tier (365 days) - security/compliance
 *   3. Config tier (180 days) - settings/configuration
 *   4. Short tier (30 days) - notifications/operational
 *   5. Default tier (90 days) - standard content/activity
 */
export function getRetentionMs(eventCode: string): number {
  if (NOISE_RETENTION_CODES.has(eventCode)) return RETENTION.NOISE_MS;
  if (CRITICAL_RETENTION_CODES.has(eventCode)) return RETENTION.CRITICAL_MS;
  if (CONFIG_RETENTION_CODES.has(eventCode)) return RETENTION.CONFIG_MS;
  if (SHORT_RETENTION_CODES.has(eventCode)) return RETENTION.SHORT_MS;
  return RETENTION.DEFAULT_MS;
}

// ─── Default Listener Settings ─────────────────────────────────────────────

export const LISTENER_DEFAULTS = {
  PRIORITY: 10,
  MAX_RETRIES: 3,
  RETRY_DELAY_MS: 1000,
  RETRY_BACKOFF: "exponential" as const,
} as const;
