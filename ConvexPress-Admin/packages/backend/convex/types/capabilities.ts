/**
 * Role & Capability System - Capability Type Definitions
 *
 * Complete TypeScript type system for all 138 capabilities across 23 domains,
 * plus 10 meta-capabilities that resolve based on context (ownership, etc.).
 *
 * This is the single source of truth for capability strings used throughout
 * the SmithHarper CMS authorization layer.
 */

// ─── Post Capabilities (13) ─────────────────────────────────────────────────

type PostCapability =
  | "post.create"
  | "post.read"
  | "post.update"
  | "post.delete"
  | "post.publish"
  | "post.unpublish"
  | "post.schedule"
  | "post.trash"
  | "post.restore"
  | "post.duplicate"
  | "post.bulk_delete"
  | "post.bulk_publish"
  | "post.preview";

// ─── Page Capabilities (7) ──────────────────────────────────────────────────

type PageCapability =
  | "page.create"
  | "page.read"
  | "page.read_private"
  | "page.update"
  | "page.delete"
  | "page.publish"
  | "page.reorder"
  | "page.set_parent";

// ─── Media Capabilities (6) ─────────────────────────────────────────────────

type MediaCapability =
  | "media.read"
  | "media.upload"
  | "media.update"
  | "media.delete"
  | "media.crop"
  | "media.bulk_delete";

// ─── Taxonomy Capabilities (9) ──────────────────────────────────────────────

type TaxonomyCapability =
  | "taxonomy.create_category"
  | "taxonomy.update_category"
  | "taxonomy.delete_category"
  | "taxonomy.create_tag"
  | "taxonomy.update_tag"
  | "taxonomy.delete_tag"
  | "taxonomy.assign"
  | "taxonomy.unassign"
  | "taxonomy.merge";

// ─── Comment Capabilities (13) ──────────────────────────────────────────────

type CommentCapability =
  | "comment.create"
  | "comment.read"
  | "comment.update"
  | "comment.delete"
  | "comment.reply"
  | "comment.approve"
  | "comment.reject"
  | "comment.spam"
  | "comment.flag"
  | "comment.like"
  | "comment.bulk_approve"
  | "comment.bulk_delete"
  | "comment.bulk_spam";

// ─── Role Capabilities (6) ──────────────────────────────────────────────────

type RoleCapability =
  | "role.create"
  | "role.update"
  | "role.delete"
  | "role.assign"
  | "role.grant_capability"
  | "role.revoke_capability";

// ─── Profile Capabilities (6) ───────────────────────────────────────────────

type ProfileCapability =
  | "profile.view"
  | "profile.update"
  | "profile.upload_avatar"
  | "profile.deactivate"
  | "profile.delete_user"
  | "profile.bulk_delete";

// ─── Auth Capabilities (5) ──────────────────────────────────────────────────

type AuthCapability =
  | "auth.login"
  | "auth.logout"
  | "auth.oauth_login"
  | "auth.refresh_session"
  | "auth.verify_email";

// ─── Password Capabilities (3) ──────────────────────────────────────────────

type PasswordCapability =
  | "password.change"
  | "password.reset"
  | "password.request_reset";

// ─── Registration Capabilities (3) ──────────────────────────────────────────

type RegistrationCapability =
  | "registration.register"
  | "registration.invite"
  | "registration.resend_verification";

// ─── Dashboard Capabilities (4) ─────────────────────────────────────────────

type DashboardCapability =
  | "dashboard.view"
  | "dashboard.quick_draft"
  | "dashboard.dismiss_widget"
  | "dashboard.reorder_widgets";

// ─── Editor Capabilities (6) ────────────────────────────────────────────────

type EditorCapability =
  | "editor.add_block"
  | "editor.remove_block"
  | "editor.reorder_blocks"
  | "editor.save_draft"
  | "editor.save_reusable"
  | "editor.autosave";

// ─── Custom Field Capabilities (5) ──────────────────────────────────────────

type CustomFieldCapability =
  | "custom_field.create_group"
  | "custom_field.update_group"
  | "custom_field.delete_group"
  | "custom_field.set_value"
  | "custom_field.read_value";

// ─── Revision Capabilities (4) ──────────────────────────────────────────────

type RevisionCapability =
  | "revision.view"
  | "revision.compare"
  | "revision.restore"
  | "revision.delete";

// ─── SEO Capabilities (4) ───────────────────────────────────────────────────

type SEOCapability =
  | "seo.update_post"
  | "seo.update_global"
  | "seo.update_robots"
  | "seo.generate_sitemap";

// ─── Search Capabilities (2) ────────────────────────────────────────────────

type SearchCapability = "search.query" | "search.reindex";

// ─── Menu Capabilities (8) ──────────────────────────────────────────────────

type MenuCapability =
  | "menu.create"
  | "menu.update"
  | "menu.delete"
  | "menu.add_item"
  | "menu.update_item"
  | "menu.delete_item"
  | "menu.reorder"
  | "menu.assign_location";

// ─── Settings Capabilities (9) ──────────────────────────────────────────────

type SettingsCapability =
  | "settings.update_general"
  | "settings.update_reading"
  | "settings.update_writing"
  | "settings.update_discussion"
  | "settings.update_permalinks"
  | "settings.update_privacy"
  | "settings.update_email"
  | "settings.export"
  | "settings.import";

// ─── Email Capabilities (4) ─────────────────────────────────────────────────

type EmailCapability =
  | "email.send"
  | "email.queue"
  | "email.retry"
  | "email.update_template";

// ─── Notification Capabilities (5) ──────────────────────────────────────────

type NotificationCapability =
  | "notification.send"
  | "notification.mark_read"
  | "notification.mark_all_read"
  | "notification.delete"
  | "notification.update_preferences";

// ─── Audit Capabilities (3) ─────────────────────────────────────────────────

type AuditCapability = "audit.view" | "audit.export" | "audit.clear";

// ─── API Capabilities (6) ───────────────────────────────────────────────────

type APICapability =
  | "api.create_key"
  | "api.revoke_key"
  | "api.create_webhook"
  | "api.update_webhook"
  | "api.delete_webhook"
  | "api.test_webhook";

// ─── Event Capabilities (3) ─────────────────────────────────────────────────

type EventCapability =
  | "event.emit"
  | "event.register_listener"
  | "event.remove_listener";

// ─── Routing Capabilities (3) ───────────────────────────────────────────────

type RoutingCapability =
  | "routing.view_redirects"
  | "routing.create_redirect"
  | "routing.update_redirect"
  | "routing.delete_redirect";

// ─── Meta Capabilities (10) ─────────────────────────────────────────────────
// These resolve dynamically based on context (resource ownership, etc.)

export type MetaCapability =
  | "post.edit" // Resolves to post.update (own) or post.update (any) based on ownership
  | "post.delete_one" // Resolves to post.delete (own) or post.delete (any)
  | "post.publish_one" // Resolves to post.publish based on ownership
  | "page.edit" // Resolves to page.update based on ownership
  | "media.edit" // Resolves to media.update based on ownership
  | "media.delete_one" // Resolves to media.delete based on ownership
  | "comment.edit" // Resolves to comment.update based on ownership
  | "comment.delete_one" // Resolves to comment.delete based on ownership
  | "seo.edit_post" // Resolves to seo.update_post
  | "custom_field.edit_value"; // Resolves to custom_field.set_value

// ─── Combined Capability Type ───────────────────────────────────────────────

/**
 * Union type of all 138 concrete capabilities across 23 domains.
 * Use this type for capability arrays on roles and for permission checks.
 */
export type Capability =
  | PostCapability
  | PageCapability
  | MediaCapability
  | TaxonomyCapability
  | CommentCapability
  | RoleCapability
  | ProfileCapability
  | AuthCapability
  | PasswordCapability
  | RegistrationCapability
  | DashboardCapability
  | EditorCapability
  | CustomFieldCapability
  | RevisionCapability
  | SEOCapability
  | SearchCapability
  | MenuCapability
  | SettingsCapability
  | EmailCapability
  | NotificationCapability
  | AuditCapability
  | APICapability
  | EventCapability
  | RoutingCapability;

/**
 * Any capability string that can be passed to permission checks.
 * Includes both concrete capabilities and meta-capabilities.
 */
export type AnyCapability = Capability | MetaCapability;

// ─── Runtime Constants ──────────────────────────────────────────────────────

/**
 * Complete array of all 138 valid capability strings.
 * Used for validation, seeding, and admin UI display.
 */
export const ALL_CAPABILITIES: Capability[] = [
  // Posts (13)
  "post.create",
  "post.read",
  "post.update",
  "post.delete",
  "post.publish",
  "post.unpublish",
  "post.schedule",
  "post.trash",
  "post.restore",
  "post.duplicate",
  "post.bulk_delete",
  "post.bulk_publish",
  "post.preview",
  // Pages (8)
  "page.create",
  "page.read",
  "page.read_private",
  "page.update",
  "page.delete",
  "page.publish",
  "page.reorder",
  "page.set_parent",
  // Media (6)
  "media.read",
  "media.upload",
  "media.update",
  "media.delete",
  "media.crop",
  "media.bulk_delete",
  // Taxonomy (9)
  "taxonomy.create_category",
  "taxonomy.update_category",
  "taxonomy.delete_category",
  "taxonomy.create_tag",
  "taxonomy.update_tag",
  "taxonomy.delete_tag",
  "taxonomy.assign",
  "taxonomy.unassign",
  "taxonomy.merge",
  // Comments (13)
  "comment.create",
  "comment.read",
  "comment.update",
  "comment.delete",
  "comment.reply",
  "comment.approve",
  "comment.reject",
  "comment.spam",
  "comment.flag",
  "comment.like",
  "comment.bulk_approve",
  "comment.bulk_delete",
  "comment.bulk_spam",
  // Roles (6)
  "role.create",
  "role.update",
  "role.delete",
  "role.assign",
  "role.grant_capability",
  "role.revoke_capability",
  // Profile (6)
  "profile.view",
  "profile.update",
  "profile.upload_avatar",
  "profile.deactivate",
  "profile.delete_user",
  "profile.bulk_delete",
  // Auth (5)
  "auth.login",
  "auth.logout",
  "auth.oauth_login",
  "auth.refresh_session",
  "auth.verify_email",
  // Password (3)
  "password.change",
  "password.reset",
  "password.request_reset",
  // Registration (3)
  "registration.register",
  "registration.invite",
  "registration.resend_verification",
  // Dashboard (4)
  "dashboard.view",
  "dashboard.quick_draft",
  "dashboard.dismiss_widget",
  "dashboard.reorder_widgets",
  // Editor (6)
  "editor.add_block",
  "editor.remove_block",
  "editor.reorder_blocks",
  "editor.save_draft",
  "editor.save_reusable",
  "editor.autosave",
  // Custom Fields (5)
  "custom_field.create_group",
  "custom_field.update_group",
  "custom_field.delete_group",
  "custom_field.set_value",
  "custom_field.read_value",
  // Revisions (4)
  "revision.view",
  "revision.compare",
  "revision.restore",
  "revision.delete",
  // SEO (4)
  "seo.update_post",
  "seo.update_global",
  "seo.update_robots",
  "seo.generate_sitemap",
  // Search (2)
  "search.query",
  "search.reindex",
  // Menu (8)
  "menu.create",
  "menu.update",
  "menu.delete",
  "menu.add_item",
  "menu.update_item",
  "menu.delete_item",
  "menu.reorder",
  "menu.assign_location",
  // Settings (9)
  "settings.update_general",
  "settings.update_reading",
  "settings.update_writing",
  "settings.update_discussion",
  "settings.update_permalinks",
  "settings.update_privacy",
  "settings.update_email",
  "settings.export",
  "settings.import",
  // Email (4)
  "email.send",
  "email.queue",
  "email.retry",
  "email.update_template",
  // Notifications (5)
  "notification.send",
  "notification.mark_read",
  "notification.mark_all_read",
  "notification.delete",
  "notification.update_preferences",
  // Audit (3)
  "audit.view",
  "audit.export",
  "audit.clear",
  // API (6)
  "api.create_key",
  "api.revoke_key",
  "api.create_webhook",
  "api.update_webhook",
  "api.delete_webhook",
  "api.test_webhook",
  // Events (3)
  "event.emit",
  "event.register_listener",
  "event.remove_listener",
  // Routing (4)
  "routing.view_redirects",
  "routing.create_redirect",
  "routing.update_redirect",
  "routing.delete_redirect",
] as const;

/**
 * Set of all meta-capability strings for quick lookup.
 */
export const META_CAPABILITIES: Set<string> = new Set([
  "post.edit",
  "post.delete_one",
  "post.publish_one",
  "page.edit",
  "media.edit",
  "media.delete_one",
  "comment.edit",
  "comment.delete_one",
  "seo.edit_post",
  "custom_field.edit_value",
]);

/**
 * Map from meta-capability to the concrete capability it resolves to.
 * The permission system checks ownership before granting the concrete capability.
 */
export const META_TO_CONCRETE: Record<string, Capability> = {
  "post.edit": "post.update",
  "post.delete_one": "post.delete",
  "post.publish_one": "post.publish",
  "page.edit": "page.update",
  "media.edit": "media.update",
  "media.delete_one": "media.delete",
  "comment.edit": "comment.update",
  "comment.delete_one": "comment.delete",
  "seo.edit_post": "seo.update_post",
  "custom_field.edit_value": "custom_field.set_value",
};

/** Set of all valid capability strings for fast validation. */
const CAPABILITY_SET: Set<string> = new Set(ALL_CAPABILITIES);

/**
 * Validates whether a string is a recognized capability.
 * Checks against both concrete capabilities and meta-capabilities.
 */
export function isValidCapability(cap: string): cap is AnyCapability {
  return CAPABILITY_SET.has(cap) || META_CAPABILITIES.has(cap);
}

/**
 * Validates whether a string is a concrete (non-meta) capability.
 */
export function isConcreteCapability(cap: string): cap is Capability {
  return CAPABILITY_SET.has(cap);
}

/**
 * Validates whether a string is a meta-capability.
 */
export function isMetaCapability(cap: string): cap is MetaCapability {
  return META_CAPABILITIES.has(cap);
}

// ─── Capability Domain Grouping ─────────────────────────────────────────────

/**
 * Capabilities grouped by domain, useful for admin UI rendering.
 */
export const CAPABILITY_DOMAINS: Record<string, Capability[]> = {
  Posts: [
    "post.create",
    "post.read",
    "post.update",
    "post.delete",
    "post.publish",
    "post.unpublish",
    "post.schedule",
    "post.trash",
    "post.restore",
    "post.duplicate",
    "post.bulk_delete",
    "post.bulk_publish",
    "post.preview",
  ],
  Pages: [
    "page.create",
    "page.read",
    "page.read_private",
    "page.update",
    "page.delete",
    "page.publish",
    "page.reorder",
    "page.set_parent",
  ],
  Media: [
    "media.read",
    "media.upload",
    "media.update",
    "media.delete",
    "media.crop",
    "media.bulk_delete",
  ],
  Taxonomy: [
    "taxonomy.create_category",
    "taxonomy.update_category",
    "taxonomy.delete_category",
    "taxonomy.create_tag",
    "taxonomy.update_tag",
    "taxonomy.delete_tag",
    "taxonomy.assign",
    "taxonomy.unassign",
    "taxonomy.merge",
  ],
  Comments: [
    "comment.create",
    "comment.read",
    "comment.update",
    "comment.delete",
    "comment.reply",
    "comment.approve",
    "comment.reject",
    "comment.spam",
    "comment.flag",
    "comment.like",
    "comment.bulk_approve",
    "comment.bulk_delete",
    "comment.bulk_spam",
  ],
  Roles: [
    "role.create",
    "role.update",
    "role.delete",
    "role.assign",
    "role.grant_capability",
    "role.revoke_capability",
  ],
  Profile: [
    "profile.view",
    "profile.update",
    "profile.upload_avatar",
    "profile.deactivate",
    "profile.delete_user",
    "profile.bulk_delete",
  ],
  Auth: [
    "auth.login",
    "auth.logout",
    "auth.oauth_login",
    "auth.refresh_session",
    "auth.verify_email",
  ],
  Password: ["password.change", "password.reset", "password.request_reset"],
  Registration: [
    "registration.register",
    "registration.invite",
    "registration.resend_verification",
  ],
  Dashboard: [
    "dashboard.view",
    "dashboard.quick_draft",
    "dashboard.dismiss_widget",
    "dashboard.reorder_widgets",
  ],
  Editor: [
    "editor.add_block",
    "editor.remove_block",
    "editor.reorder_blocks",
    "editor.save_draft",
    "editor.save_reusable",
    "editor.autosave",
  ],
  "Custom Fields": [
    "custom_field.create_group",
    "custom_field.update_group",
    "custom_field.delete_group",
    "custom_field.set_value",
    "custom_field.read_value",
  ],
  Revisions: [
    "revision.view",
    "revision.compare",
    "revision.restore",
    "revision.delete",
  ],
  SEO: [
    "seo.update_post",
    "seo.update_global",
    "seo.update_robots",
    "seo.generate_sitemap",
  ],
  Search: ["search.query", "search.reindex"],
  Menus: [
    "menu.create",
    "menu.update",
    "menu.delete",
    "menu.add_item",
    "menu.update_item",
    "menu.delete_item",
    "menu.reorder",
    "menu.assign_location",
  ],
  Settings: [
    "settings.update_general",
    "settings.update_reading",
    "settings.update_writing",
    "settings.update_discussion",
    "settings.update_permalinks",
    "settings.update_privacy",
    "settings.update_email",
    "settings.export",
    "settings.import",
  ],
  Email: ["email.send", "email.queue", "email.retry", "email.update_template"],
  Notifications: [
    "notification.send",
    "notification.mark_read",
    "notification.mark_all_read",
    "notification.delete",
    "notification.update_preferences",
  ],
  Audit: ["audit.view", "audit.export", "audit.clear"],
  API: [
    "api.create_key",
    "api.revoke_key",
    "api.create_webhook",
    "api.update_webhook",
    "api.delete_webhook",
    "api.test_webhook",
  ],
  Events: ["event.emit", "event.register_listener", "event.remove_listener"],
  Routing: [
    "routing.view_redirects",
    "routing.create_redirect",
    "routing.update_redirect",
    "routing.delete_redirect",
  ],
};
