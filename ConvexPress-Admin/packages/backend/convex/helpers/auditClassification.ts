/**
 * Audit Log System - Severity & Object Type Classification
 *
 * Maps event codes to severity levels and system slugs to object types.
 * This is the core business logic that determines how each event is
 * classified in the audit trail.
 *
 * Severity Levels (5):
 *   - critical: Security breaches, unauthorized access, permanent data loss
 *   - high: Role changes, settings updates, deletions of important content
 *   - medium: Publishing, registration, password changes, content status changes
 *   - low: Content edits, uploads, taxonomy operations, moderate changes
 *   - informational: Logins, logouts, routine system events
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export type AuditSeverity =
  | "critical"
  | "high"
  | "medium"
  | "low"
  | "informational";

export type AuditObjectType =
  | "post"
  | "page"
  | "comment"
  | "media"
  | "user"
  | "role"
  | "taxonomy"
  | "menu"
  | "settings"
  | "seo"
  | "api"
  | "notification"
  | "system";

// ─── Severity Map ───────────────────────────────────────────────────────────

/**
 * Maps every known event code to its severity level.
 * Event codes not in this map default to "informational".
 */
export const SEVERITY_MAP: Record<string, AuditSeverity> = {
  // ── Critical ──────────────────────────────────────────────────────────
  "auth.login_failed": "critical",
  "profile.deactivated": "critical",
  "profile.deleted": "critical",
  "role.capability_granted": "critical",
  "role.capability_revoked": "critical",

  // ── High ──────────────────────────────────────────────────────────────
  "role.assigned": "high",
  "role.created": "high",
  "role.updated": "high",
  "role.deleted": "high",
  "settings.updated": "high",
  "settings.permalinks_changed": "high",
  "post.deleted": "high",
  "page.deleted": "high",
  "comment.deleted": "high",
  "media.deleted": "high",
  "api.key_created": "high",
  "api.key_revoked": "high",
  "registration.user_invited": "high",

  // ── Medium ────────────────────────────────────────────────────────────
  "post.published": "medium",
  "post.unpublished": "medium",
  "post.trashed": "medium",
  "post.restored": "medium",
  "post.status_changed": "medium",
  "post.duplicated": "medium",
  "page.published": "medium",
  "page.unpublished": "medium",
  "page.trashed": "medium",
  "page.restored": "medium",
  "page.reordered": "medium",
  "registration.registered": "medium",
  "registration.email_verified": "medium",
  "registration.user_registered": "medium",
  "password.changed": "medium",
  "password.reset_requested": "medium",
  "password.reset_completed": "medium",
  "revision.restored": "medium",
  "api.webhook_triggered": "medium",
  "audit.cleared": "medium",
  "audit.exported": "medium",

  // ── Low ───────────────────────────────────────────────────────────────
  "post.created": "low",
  "post.updated": "low",
  "post.scheduled": "low",
  "page.created": "low",
  "page.updated": "low",
  "comment.created": "low",
  "comment.updated": "low",
  "comment.approved": "low",
  "comment.rejected": "low",
  "comment.flagged": "low",
  "comment.spammed": "low",
  "comment.replied": "low",
  "media.uploaded": "low",
  "media.updated": "low",
  "media.cropped": "low",
  "taxonomy.category_created": "low",
  "taxonomy.category_updated": "low",
  "taxonomy.category_deleted": "low",
  "taxonomy.tag_created": "low",
  "taxonomy.tag_updated": "low",
  "taxonomy.tag_deleted": "low",
  "taxonomy.term_assigned": "low",
  "taxonomy.merged": "low",
  "menu.created": "low",
  "menu.updated": "low",
  "menu.deleted": "low",
  "menu.location_assigned": "low",
  "profile.updated": "low",
  "profile.avatar_changed": "low",
  "revision.created": "low",
  "seo.meta_updated": "low",
  "seo.sitemap_generated": "low",
  "custom_field.group_created": "low",
  "custom_field.group_updated": "low",
  "custom_field.group_deleted": "low",
  "custom_field.group_activated": "low",
  "custom_field.group_deactivated": "low",
  "custom_field.value_set": "low",
  "editor.draft_saved": "low",

  // ── Informational ─────────────────────────────────────────────────────
  "auth.login": "informational",
  "auth.logout": "informational",
  "auth.session_refreshed": "informational",
  "auth.oauth_completed": "informational",
  "auth.email_verified": "informational",
  "email.sent": "informational",
  "email.failed": "informational",
  "notification.sent": "informational",
  "notification.email_sent": "informational",
  "notification.email_failed": "informational",
  "search.reindex_completed": "informational",
  "editor.autosaved": "informational",
  "event.listener_failed": "informational",
  "dashboard.viewed": "informational",
  "dashboard.quick_drafted": "informational",
  "dashboard.widget_dismissed": "informational",
  "dashboard.widget_restored": "informational",
  "dashboard.widgets_reordered": "informational",
  "dashboard.welcome_dismissed": "informational",
};

/**
 * Get the severity level for an event code.
 * Returns "informational" for unrecognized event codes.
 */
export function getSeverity(eventCode: string): AuditSeverity {
  return SEVERITY_MAP[eventCode] ?? "informational";
}

// ─── System to Object Type Map ──────────────────────────────────────────────

/**
 * Maps system slugs to the primary object type they affect.
 * Used to derive the objectType field for audit entries.
 */
export const SYSTEM_TO_OBJECT_TYPE: Record<string, AuditObjectType> = {
  post: "post",
  page: "page",
  comment: "comment",
  media: "media",
  auth: "user",
  registration: "user",
  profile: "user",
  role: "role",
  taxonomy: "taxonomy",
  menu: "menu",
  settings: "settings",
  seo: "seo",
  api: "api",
  notification: "notification",
  password: "user",
  revision: "post",
  editor: "post",
  custom_field: "post",
  search: "system",
  event: "system",
  audit: "system",
  dashboard: "system",
  routing: "system",
  feed: "system",
  sitemap: "system",
  email: "notification",
};

/**
 * Get the object type for a system slug.
 * Returns "system" for unrecognized system slugs.
 */
export function getObjectType(system: string): AuditObjectType {
  return SYSTEM_TO_OBJECT_TYPE[system] ?? "system";
}
