/**
 * Role & Capability System - Capability Type Definitions
 *
 * Complete TypeScript type system for concrete capabilities across system
 * domains, plus meta-capabilities that resolve based on context.
 *
 * This is the single source of truth for capability strings used throughout
 * the ConvexPress authorization layer.
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

// ─── Analytics Capabilities (2) ─────────────────────────────────────────────

type AnalyticsCapability =
  | "analytics.view"
  | "analytics.manage";

// ─── KB Capabilities (13) ───────────────────────────────────────────────────

type KBCapability =
  | "kb.view"
  | "kb.create"
  | "kb.edit"
  | "kb.editOwn"
  | "kb.delete"
  | "kb.publish"
  | "kb.manageCategories"
  | "kb.manageTags"
  | "kb.manageCollections"
  | "kb.manageWorkflows"
  | "kb.manageTemplates"
  | "kb.moderateComments"
  | "kb.viewAnalytics";

// ─── LMS Capabilities (12) ──────────────────────────────────────────────────

type LMSCapability =
  | "lms.course.view"
  | "lms.course.create"
  | "lms.course.edit"
  | "lms.course.publish"
  | "lms.course.delete"
  | "lms.lesson.edit"
  | "lms.lesson.delete"
  | "lms.builder.manage"
  | "lms.ai.generate"
  | "lms.enroll.manage"
  | "lms.certificate.manage"
  | "lms.settings.manage";

// ─── Ticket Capabilities (10) ────────────────────────────────────────────────

type TicketCapability =
  | "ticket.view"
  | "ticket.viewAll"
  | "ticket.respond"
  | "ticket.assign"
  | "ticket.updateStatus"
  | "ticket.updatePriority"
  | "ticket.close"
  | "ticket.manageCannedResponses"
  | "ticket.viewAnalytics"
  | "ticket.viewInternalNotes";

// ─── Form Capabilities (14) ─────────────────────────────────────────────────

type FormCapability =
  | "form.view"
  | "form.create"
  | "form.update"
  | "form.delete"
  | "form.duplicate"
  | "form.view_entries"
  | "form.edit_entry"
  | "form.delete_entry"
  | "form.manage_notifications"
  | "form.manage_confirmations"
  | "form.manage_actions"
  | "form.view_analytics"
  | "form.export_entries"
  | "form.manage_security";

// ─── Commerce Returns Capabilities (5) ──────────────────────────────────────

type CommerceReturnsCapability =
  | "commerce.returns.view"
  | "commerce.returns.review"
  | "commerce.returns.receive"
  | "commerce.returns.refund"
  | "commerce.returns.manage";

// ─── Commerce Bundles Capabilities (4) ──────────────────────────────────────

type CommerceBundlesCapability =
  | "commerce.bundles.view"
  | "commerce.bundles.create"
  | "commerce.bundles.edit"
  | "commerce.bundles.delete";

// ─── Commerce Reviews Capabilities (3) ──────────────────────────────────────

type CommerceReviewsCapability =
  | "commerce.reviews.view"
  | "commerce.reviews.moderate"
  | "commerce.reviews.delete";

// ─── Commerce Wishlists Capabilities (2) ────────────────────────────────────

type CommerceWishlistsCapability =
  | "commerce.wishlists.view"
  | "commerce.wishlists.manage";

// ─── Commerce Tax Capabilities (Wave 12.4) ──────────────────────────────────

type CommerceTaxCapability =
  | "commerce.tax.view"
  | "commerce.tax.manage"
  | "commerce.customers.tax_exempt";

// ─── Commerce Discount Capabilities (Wave 12.4) ─────────────────────────────

type CommerceDiscountCapability =
  | "commerce.discount.view"
  | "commerce.discount.create"
  | "commerce.discount.update"
  | "commerce.discount.delete"
  | "commerce.discount.apply";

// ─── Settings Management Capability (1) ─────────────────────────────────────
// WordPress-standard "manage_options" used by admin-only settings operations.

type SettingsManageCapability = "manage_options";

// ─── Shipping Capabilities ──────────────────────────────────────────────────
// Covers the shipping subsystem (PRDs A1–D3). Uses the resource-namespace
// dot convention to match the rest of the capability system.

type ShippingCapability =
  // Zones (PRD A1)
  | "shipping.zones.manage"
  | "shipping.zones.read"
  // Classes (PRD A2)
  | "shipping.classes.manage"
  | "shipping.classes.read"
  // Packages (PRD A3)
  | "shipping.packages.manage"
  | "shipping.packages.read"
  // Ship-From Locations (PRD A4)
  | "shipping.locations.manage"
  | "shipping.locations.read"
  // Address Validation (PRD A5)
  | "shipping.address_validation.manage"
  | "shipping.address_validation.read"
  // Rules Engine (PRD A6)
  | "shipping.rules.manage"
  | "shipping.rules.read"
  // Rate Pipeline Diagnostics (PRD A7)
  | "shipping.diagnostics.view"
  | "shipping.test_rates.run"
  // Methods (PRDs B1–B10)
  | "shipping.methods.manage"
  | "shipping.methods.read"
  | "shipping.methods.preview"
  | "shipping.methods.test"
  | "shipping.methods.quote"
  // Providers (PRDs C1–C5)
  | "shipping.providers.manage"
  | "shipping.providers.read"
  | "shipping.providers.test"
  // Labels (PRD D1)
  | "shipping.labels.purchase"
  | "shipping.labels.void"
  | "shipping.labels.reprint"
  | "shipping.labels.batch"
  | "shipping.labels.read"
  // Tracking (PRD D2)
  | "shipping.tracking.view"
  | "shipping.tracking.sync"
  // Manifests (PRD D3)
  | "shipping.manifests.view"
  | "shipping.manifests.close"
  | "shipping.manifests.reprint";

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
 * Union type of all concrete capabilities.
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
  | RoutingCapability
  | AnalyticsCapability
  | KBCapability
  | LMSCapability
  | TicketCapability
  | FormCapability
  | CommerceReturnsCapability
  | CommerceBundlesCapability
  | CommerceReviewsCapability
  | CommerceWishlistsCapability
  | CommerceTaxCapability
  | CommerceDiscountCapability
  | SettingsManageCapability
  | ShippingCapability;

/**
 * Any capability string that can be passed to permission checks.
 * Includes both concrete capabilities and meta-capabilities.
 */
export type AnyCapability = Capability | MetaCapability;

// ─── Runtime Constants ──────────────────────────────────────────────────────

/**
 * Complete array of all valid concrete capability strings.
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
  // Analytics (2)
  "analytics.view",
  "analytics.manage",
  // KB (13)
  "kb.view",
  "kb.create",
  "kb.edit",
  "kb.editOwn",
  "kb.delete",
  "kb.publish",
  "kb.manageCategories",
  "kb.manageTags",
  "kb.manageCollections",
  "kb.manageWorkflows",
  "kb.manageTemplates",
  "kb.moderateComments",
  "kb.viewAnalytics",
  // LMS (12)
  "lms.course.view",
  "lms.course.create",
  "lms.course.edit",
  "lms.course.publish",
  "lms.course.delete",
  "lms.lesson.edit",
  "lms.lesson.delete",
  "lms.builder.manage",
  "lms.ai.generate",
  "lms.enroll.manage",
  "lms.certificate.manage",
  "lms.settings.manage",
  // Tickets (10)
  "ticket.view",
  "ticket.viewAll",
  "ticket.respond",
  "ticket.assign",
  "ticket.updateStatus",
  "ticket.updatePriority",
  "ticket.close",
  "ticket.manageCannedResponses",
  "ticket.viewAnalytics",
  "ticket.viewInternalNotes",
  // Forms (14)
  "form.view",
  "form.create",
  "form.update",
  "form.delete",
  "form.duplicate",
  "form.view_entries",
  "form.edit_entry",
  "form.delete_entry",
  "form.manage_notifications",
  "form.manage_confirmations",
  "form.manage_actions",
  "form.view_analytics",
  "form.export_entries",
  "form.manage_security",
  // Commerce Returns (5)
  "commerce.returns.view",
  "commerce.returns.review",
  "commerce.returns.receive",
  "commerce.returns.refund",
  "commerce.returns.manage",
  // Commerce Bundles (4)
  "commerce.bundles.view",
  "commerce.bundles.create",
  "commerce.bundles.edit",
  "commerce.bundles.delete",
  // Commerce Reviews (3)
  "commerce.reviews.view",
  "commerce.reviews.moderate",
  "commerce.reviews.delete",
  // Commerce Wishlists (2)
  "commerce.wishlists.view",
  "commerce.wishlists.manage",
  // Commerce Tax (Wave 12.4) (3)
  "commerce.tax.view",
  "commerce.tax.manage",
  "commerce.customers.tax_exempt",
  // Commerce Discount (Wave 12.4) (5)
  "commerce.discount.view",
  "commerce.discount.create",
  "commerce.discount.update",
  "commerce.discount.delete",
  "commerce.discount.apply",
  // Settings Management (1)
  "manage_options",
  // Shipping (34) — PRDs A1–D3
  "shipping.zones.manage",
  "shipping.zones.read",
  "shipping.classes.manage",
  "shipping.classes.read",
  "shipping.packages.manage",
  "shipping.packages.read",
  "shipping.locations.manage",
  "shipping.locations.read",
  "shipping.address_validation.manage",
  "shipping.address_validation.read",
  "shipping.rules.manage",
  "shipping.rules.read",
  "shipping.diagnostics.view",
  "shipping.test_rates.run",
  "shipping.methods.manage",
  "shipping.methods.read",
  "shipping.methods.preview",
  "shipping.methods.test",
  "shipping.methods.quote",
  "shipping.providers.manage",
  "shipping.providers.read",
  "shipping.providers.test",
  "shipping.labels.purchase",
  "shipping.labels.void",
  "shipping.labels.reprint",
  "shipping.labels.batch",
  "shipping.labels.read",
  "shipping.tracking.view",
  "shipping.tracking.sync",
  "shipping.manifests.view",
  "shipping.manifests.close",
  "shipping.manifests.reprint",
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
  Analytics: ["analytics.view", "analytics.manage"],
  "Knowledge Base": [
    "kb.view",
    "kb.create",
    "kb.edit",
    "kb.editOwn",
    "kb.delete",
    "kb.publish",
    "kb.manageCategories",
    "kb.manageTags",
    "kb.manageCollections",
    "kb.manageWorkflows",
    "kb.manageTemplates",
    "kb.moderateComments",
    "kb.viewAnalytics",
  ],
  LMS: [
    "lms.course.view",
    "lms.course.create",
    "lms.course.edit",
    "lms.course.publish",
    "lms.course.delete",
    "lms.lesson.edit",
    "lms.lesson.delete",
    "lms.builder.manage",
    "lms.ai.generate",
    "lms.enroll.manage",
    "lms.certificate.manage",
    "lms.settings.manage",
  ],
  Tickets: [
    "ticket.view",
    "ticket.viewAll",
    "ticket.respond",
    "ticket.assign",
    "ticket.updateStatus",
    "ticket.updatePriority",
    "ticket.close",
    "ticket.manageCannedResponses",
    "ticket.viewAnalytics",
    "ticket.viewInternalNotes",
  ],
  Forms: [
    "form.view",
    "form.create",
    "form.update",
    "form.delete",
    "form.duplicate",
    "form.view_entries",
    "form.edit_entry",
    "form.delete_entry",
    "form.manage_notifications",
    "form.manage_confirmations",
    "form.manage_actions",
    "form.view_analytics",
    "form.export_entries",
    "form.manage_security",
  ],
  "Commerce Bundles": [
    "commerce.bundles.view",
    "commerce.bundles.create",
    "commerce.bundles.edit",
    "commerce.bundles.delete",
  ],
  "Commerce Wishlists": [
    "commerce.wishlists.view",
    "commerce.wishlists.manage",
  ],
  "Settings Management": ["manage_options"],
};
