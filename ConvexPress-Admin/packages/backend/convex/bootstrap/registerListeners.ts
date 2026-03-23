/**
 * Event Dispatcher System - Listener Bootstrap
 *
 * One-time (idempotent) registration of all system event listeners.
 * Each downstream system that needs to react to events registers its
 * handlers here. The bootstrap uses an upsert pattern: if a listener
 * with the same eventCode + name already exists and is active, it is
 * skipped. This makes the function safe to call multiple times.
 *
 * Handler Types:
 *   - "internal": Convex internalMutation (writes to DB)
 *   - "action":   Convex internalAction (external API calls like Resend)
 *   - "scheduled": Delayed execution
 *
 * Priority Conventions:
 *   1-9:   Critical system handlers (security alerts)
 *   10:    Default priority for most handlers
 *   20-30: Secondary effects (subscriber emails after author email)
 *   50-80: Low-priority handlers (analytics, search indexing)
 *   99:    Audit log (always runs last)
 *
 * Usage:
 *   Call this internalMutation once during initial deployment or after
 *   adding new systems. It is idempotent and safe to re-run.
 *
 *   From Convex dashboard: Run internal function bootstrap.registerListeners.run
 *   From code: ctx.scheduler.runAfter(0, internal.bootstrap.registerListeners.run, {});
 */

import { internalMutation } from "../_generated/server";

// ─── Listener Definitions ─────────────────────────────────────────────────

/**
 * Each listener definition follows this shape. These are NOT Convex
 * validator args -- they are plain objects used to construct the
 * eventListeners records.
 */
interface ListenerDef {
  eventCode: string;
  name: string;
  handlerModule: string;
  handlerFunction: string;
  handlerType: "internal" | "action" | "scheduled";
  priority: number;
  maxRetries: number;
  retryDelayMs: number;
  retryBackoff: "linear" | "exponential";
  system: string;
  description: string;
  filterCondition?: string;
}

/**
 * Complete listener registry for all downstream systems.
 *
 * Organized by system. Each system owns its listener registrations.
 */
const LISTENER_DEFINITIONS: ListenerDef[] = [
  // ═══════════════════════════════════════════════════════════════════════════
  // AUDIT LOG SYSTEM
  // Global wildcard listener that records ALL events as audit entries.
  // Priority 99 = always runs last, after all other handlers complete.
  // ═══════════════════════════════════════════════════════════════════════════
  {
    eventCode: "*",
    name: "Audit Log: Record all events",
    handlerModule: "auditLogs/internals",
    handlerFunction: "createEntry",
    handlerType: "internal",
    priority: 99,
    maxRetries: 3,
    retryDelayMs: 2000,
    retryBackoff: "exponential",
    system: "audit",
    description:
      "Global wildcard listener that creates an audit entry for every event in the system.",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // SITE NOTIFICATION SYSTEM
  // Universal event handler that resolves notification types from config,
  // determines recipients, and creates site notifications.
  // Uses system wildcards to capture all events from relevant systems.
  // ═══════════════════════════════════════════════════════════════════════════
  {
    eventCode: "post.*",
    name: "Site Notification: Post events",
    handlerModule: "notifications/internals",
    handlerFunction: "onEvent",
    handlerType: "internal",
    priority: 10,
    maxRetries: 3,
    retryDelayMs: 1000,
    retryBackoff: "exponential",
    system: "notification",
    description:
      "Creates site notifications for post lifecycle events (published, scheduled, trashed, restored).",
  },
  {
    eventCode: "comment.*",
    name: "Site Notification: Comment events",
    handlerModule: "notifications/internals",
    handlerFunction: "onEvent",
    handlerType: "internal",
    priority: 10,
    maxRetries: 3,
    retryDelayMs: 1000,
    retryBackoff: "exponential",
    system: "notification",
    description:
      "Creates site notifications for comment events (new, approved, rejected, replied, flagged).",
  },
  {
    eventCode: "media.*",
    name: "Site Notification: Media events",
    handlerModule: "notifications/internals",
    handlerFunction: "onEvent",
    handlerType: "internal",
    priority: 10,
    maxRetries: 3,
    retryDelayMs: 1000,
    retryBackoff: "exponential",
    system: "notification",
    description:
      "Creates site notifications for media upload and deletion events.",
  },
  {
    eventCode: "revision.*",
    name: "Site Notification: Revision events",
    handlerModule: "notifications/internals",
    handlerFunction: "onEvent",
    handlerType: "internal",
    priority: 10,
    maxRetries: 3,
    retryDelayMs: 1000,
    retryBackoff: "exponential",
    system: "notification",
    description:
      "Creates site notifications for revision creation and restoration.",
  },
  {
    eventCode: "registration.*",
    name: "Site Notification: Registration events",
    handlerModule: "notifications/internals",
    handlerFunction: "onEvent",
    handlerType: "internal",
    priority: 10,
    maxRetries: 3,
    retryDelayMs: 1000,
    retryBackoff: "exponential",
    system: "notification",
    description:
      "Creates site notifications for new user registrations and invitations.",
  },
  {
    eventCode: "auth.*",
    name: "Site Notification: Auth events",
    handlerModule: "notifications/internals",
    handlerFunction: "onEvent",
    handlerType: "internal",
    priority: 10,
    maxRetries: 3,
    retryDelayMs: 1000,
    retryBackoff: "exponential",
    system: "notification",
    description:
      "Creates site notifications for login events (new location, failed login alerts).",
  },
  {
    eventCode: "password.*",
    name: "Site Notification: Password events",
    handlerModule: "notifications/internals",
    handlerFunction: "onEvent",
    handlerType: "internal",
    priority: 10,
    maxRetries: 3,
    retryDelayMs: 1000,
    retryBackoff: "exponential",
    system: "notification",
    description:
      "Creates site notifications for password change confirmations.",
  },
  {
    eventCode: "profile.*",
    name: "Site Notification: Profile events",
    handlerModule: "notifications/internals",
    handlerFunction: "onEvent",
    handlerType: "internal",
    priority: 10,
    maxRetries: 3,
    retryDelayMs: 1000,
    retryBackoff: "exponential",
    system: "notification",
    description:
      "Creates site notifications for profile updates and avatar changes.",
  },
  {
    eventCode: "role.assigned",
    name: "Site Notification: Role assigned",
    handlerModule: "notifications/internals",
    handlerFunction: "onEvent",
    handlerType: "internal",
    priority: 10,
    maxRetries: 3,
    retryDelayMs: 1000,
    retryBackoff: "exponential",
    system: "notification",
    description:
      "Creates a site notification when a user's role is changed.",
  },
  {
    eventCode: "menu.*",
    name: "Site Notification: Menu events",
    handlerModule: "notifications/internals",
    handlerFunction: "onEvent",
    handlerType: "internal",
    priority: 10,
    maxRetries: 3,
    retryDelayMs: 1000,
    retryBackoff: "exponential",
    system: "notification",
    description:
      "Creates site notifications for menu updates and location assignments.",
  },
  {
    eventCode: "settings.*",
    name: "Site Notification: Settings events",
    handlerModule: "notifications/internals",
    handlerFunction: "onEvent",
    handlerType: "internal",
    priority: 10,
    maxRetries: 3,
    retryDelayMs: 1000,
    retryBackoff: "exponential",
    system: "notification",
    description:
      "Creates site notifications for settings changes and permalink updates.",
  },
  {
    eventCode: "seo.*",
    name: "Site Notification: SEO events",
    handlerModule: "notifications/internals",
    handlerFunction: "onEvent",
    handlerType: "internal",
    priority: 10,
    maxRetries: 3,
    retryDelayMs: 1000,
    retryBackoff: "exponential",
    system: "notification",
    description:
      "Creates site notifications for SEO updates and sitemap generation.",
  },
  {
    eventCode: "api.*",
    name: "Site Notification: API events",
    handlerModule: "notifications/internals",
    handlerFunction: "onEvent",
    handlerType: "internal",
    priority: 10,
    maxRetries: 3,
    retryDelayMs: 1000,
    retryBackoff: "exponential",
    system: "notification",
    description:
      "Creates site notifications for API key creation and webhook failures.",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // EMAIL NOTIFICATION SYSTEM
  // Individual handlers for specific event codes that trigger transactional
  // emails via Resend. Priority 20 = runs after site notifications.
  // ═══════════════════════════════════════════════════════════════════════════
  {
    eventCode: "registration.user_registered",
    name: "Email: Welcome + Verification + Admin Alert",
    handlerModule: "emails/internals",
    handlerFunction: "onUserRegistered",
    handlerType: "internal",
    priority: 20,
    maxRetries: 3,
    retryDelayMs: 2000,
    retryBackoff: "exponential",
    system: "email",
    description:
      "Sends welcome email, email verification, and admin new-user notification.",
  },
  {
    eventCode: "registration.user_invited",
    name: "Email: User Invitation",
    handlerModule: "emails/internals",
    handlerFunction: "onUserInvited",
    handlerType: "internal",
    priority: 20,
    maxRetries: 3,
    retryDelayMs: 2000,
    retryBackoff: "exponential",
    system: "email",
    description: "Sends invitation email to newly invited users.",
  },
  {
    eventCode: "auth.login",
    name: "Email: New Device Login Alert",
    handlerModule: "emails/internals",
    handlerFunction: "onLoggedIn",
    handlerType: "internal",
    priority: 5,
    maxRetries: 3,
    retryDelayMs: 1000,
    retryBackoff: "exponential",
    system: "email",
    description:
      "Sends new-device login alert email (security-critical, priority 5).",
    filterCondition: JSON.stringify({ isNewDevice: "true" }),
  },
  {
    eventCode: "auth.login_failed",
    name: "Email: Failed Login Attempts Alert",
    handlerModule: "emails/internals",
    handlerFunction: "onLoginFailed",
    handlerType: "internal",
    priority: 5,
    maxRetries: 3,
    retryDelayMs: 1000,
    retryBackoff: "exponential",
    system: "email",
    description:
      "Sends admin alert when multiple failed login attempts are detected.",
  },
  {
    eventCode: "password.reset_requested",
    name: "Email: Password Reset Link",
    handlerModule: "emails/internals",
    handlerFunction: "onPasswordResetRequested",
    handlerType: "internal",
    priority: 5,
    maxRetries: 3,
    retryDelayMs: 1000,
    retryBackoff: "exponential",
    system: "email",
    description:
      "Sends password reset link email (security-critical, priority 5).",
  },
  {
    eventCode: "password.changed",
    name: "Email: Password Changed Confirmation",
    handlerModule: "emails/internals",
    handlerFunction: "onPasswordChanged",
    handlerType: "internal",
    priority: 5,
    maxRetries: 3,
    retryDelayMs: 1000,
    retryBackoff: "exponential",
    system: "email",
    description:
      "Sends password changed confirmation email (security-critical).",
  },
  {
    eventCode: "password.reset_completed",
    name: "Email: Password Reset Completed Confirmation",
    handlerModule: "emails/internals",
    handlerFunction: "onPasswordChanged",
    handlerType: "internal",
    priority: 5,
    maxRetries: 3,
    retryDelayMs: 1000,
    retryBackoff: "exponential",
    system: "email",
    description:
      "Sends password changed confirmation email when a reset is completed (reuses onPasswordChanged handler). Per PRD Edge Case #9.",
  },
  {
    eventCode: "post.published",
    name: "Email: Post Published Notifications",
    handlerModule: "emails/internals",
    handlerFunction: "onPostPublished",
    handlerType: "internal",
    priority: 20,
    maxRetries: 3,
    retryDelayMs: 2000,
    retryBackoff: "exponential",
    system: "email",
    description:
      "Sends author notification and subscriber notifications when a post is published.",
  },
  {
    eventCode: "post.scheduled",
    name: "Email: Post Scheduled Reminder",
    handlerModule: "emails/internals",
    handlerFunction: "onPostScheduled",
    handlerType: "internal",
    priority: 20,
    maxRetries: 3,
    retryDelayMs: 2000,
    retryBackoff: "exponential",
    system: "email",
    description: "Sends schedule reminder email to the post author.",
  },
  {
    eventCode: "comment.created",
    name: "Email: New Comment on Post",
    handlerModule: "emails/internals",
    handlerFunction: "onCommentCreated",
    handlerType: "internal",
    priority: 20,
    maxRetries: 3,
    retryDelayMs: 2000,
    retryBackoff: "exponential",
    system: "email",
    description:
      "Sends new-comment email to post author and moderation email to admins.",
  },
  {
    eventCode: "comment.approved",
    name: "Email: Comment Approved",
    handlerModule: "emails/internals",
    handlerFunction: "onCommentApproved",
    handlerType: "internal",
    priority: 20,
    maxRetries: 3,
    retryDelayMs: 2000,
    retryBackoff: "exponential",
    system: "email",
    description: "Sends comment approval notification to the commenter.",
  },
  {
    eventCode: "comment.replied",
    name: "Email: Comment Reply",
    handlerModule: "emails/internals",
    handlerFunction: "onCommentReplied",
    handlerType: "internal",
    priority: 20,
    maxRetries: 3,
    retryDelayMs: 2000,
    retryBackoff: "exponential",
    system: "email",
    description:
      "Sends reply notification to the parent comment author.",
  },
  {
    eventCode: "role.assigned",
    name: "Email: Role Changed",
    handlerModule: "emails/internals",
    handlerFunction: "onRoleAssigned",
    handlerType: "internal",
    priority: 20,
    maxRetries: 3,
    retryDelayMs: 2000,
    retryBackoff: "exponential",
    system: "email",
    description: "Sends role-changed notification to the affected user.",
  },
  {
    eventCode: "revision.restored",
    name: "Email: Revision Restored Alert",
    handlerModule: "emails/internals",
    handlerFunction: "onRevisionRestored",
    handlerType: "internal",
    priority: 20,
    maxRetries: 3,
    retryDelayMs: 2000,
    retryBackoff: "exponential",
    system: "email",
    description:
      "Sends revision-restored alert to editors/authors.",
  },
  {
    eventCode: "media.uploaded",
    name: "Email: Media Storage Warning",
    handlerModule: "emails/internals",
    handlerFunction: "onMediaUploaded",
    handlerType: "internal",
    priority: 30,
    maxRetries: 3,
    retryDelayMs: 5000,
    retryBackoff: "exponential",
    system: "email",
    description:
      "Sends storage warning email to admins when usage exceeds 80%.",
    filterCondition: JSON.stringify({ storageWarning: true }),
  },
  {
    eventCode: "settings.updated",
    name: "Email: Settings Changed Alert",
    handlerModule: "emails/internals",
    handlerFunction: "onSettingsUpdated",
    handlerType: "internal",
    priority: 30,
    maxRetries: 3,
    retryDelayMs: 2000,
    retryBackoff: "exponential",
    system: "email",
    description:
      "Sends settings-changed alert to other administrators.",
  },
  {
    eventCode: "seo.sitemap_generated",
    name: "Email: Sitemap Generated",
    handlerModule: "emails/internals",
    handlerFunction: "onSitemapGenerated",
    handlerType: "internal",
    priority: 30,
    maxRetries: 3,
    retryDelayMs: 2000,
    retryBackoff: "exponential",
    system: "email",
    description: "Sends sitemap generation notification to admins.",
  },
  {
    eventCode: "api.webhook_triggered",
    name: "Email: Webhook Failure Alert",
    handlerModule: "emails/internals",
    handlerFunction: "onWebhookTriggered",
    handlerType: "internal",
    priority: 5,
    maxRetries: 3,
    retryDelayMs: 1000,
    retryBackoff: "exponential",
    system: "email",
    description:
      "Sends webhook failure alert to admins (only for failed webhooks).",
  },
  {
    eventCode: "profile.deactivated",
    name: "Email: Account Deactivated",
    handlerModule: "emails/internals",
    handlerFunction: "onProfileDeactivated",
    handlerType: "internal",
    priority: 20,
    maxRetries: 3,
    retryDelayMs: 2000,
    retryBackoff: "exponential",
    system: "email",
    description:
      "Sends account-deactivated confirmation email to the user.",
  },
  {
    eventCode: "profile.deleted",
    name: "Email: User Deletion Confirmation",
    handlerModule: "emails/internals",
    handlerFunction: "onProfileDeleted",
    handlerType: "internal",
    priority: 20,
    maxRetries: 3,
    retryDelayMs: 2000,
    retryBackoff: "exponential",
    system: "email",
    description:
      "Sends account-deletion confirmation email to the user.",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // MENU SYSTEM
  // Listens for content deletion and page publication events to:
  //   - Mark orphaned menu items when linked content is deleted
  //   - Auto-add new pages to menus with autoAddPages enabled
  // Priority 10 = runs alongside other primary handlers.
  // ═══════════════════════════════════════════════════════════════════════════

  // --- Content deletion → orphan menu items ---
  {
    eventCode: "page.deleted",
    name: "Menu: Orphan items on page delete",
    handlerModule: "menus/internals",
    handlerFunction: "handleContentDeleted",
    handlerType: "internal",
    priority: 10,
    maxRetries: 3,
    retryDelayMs: 2000,
    retryBackoff: "exponential",
    system: "menu",
    description:
      "Marks menu items referencing a deleted page as orphaned (isOrphaned: true).",
  },
  {
    eventCode: "post.deleted",
    name: "Menu: Orphan items on post delete",
    handlerModule: "menus/internals",
    handlerFunction: "handleContentDeleted",
    handlerType: "internal",
    priority: 10,
    maxRetries: 3,
    retryDelayMs: 2000,
    retryBackoff: "exponential",
    system: "menu",
    description:
      "Marks menu items referencing a deleted post as orphaned (isOrphaned: true).",
  },
  {
    eventCode: "taxonomy.category_deleted",
    name: "Menu: Orphan items on category delete",
    handlerModule: "menus/internals",
    handlerFunction: "handleContentDeleted",
    handlerType: "internal",
    priority: 10,
    maxRetries: 3,
    retryDelayMs: 2000,
    retryBackoff: "exponential",
    system: "menu",
    description:
      "Marks menu items referencing a deleted category as orphaned (isOrphaned: true).",
  },
  {
    eventCode: "taxonomy.tag_deleted",
    name: "Menu: Orphan items on tag delete",
    handlerModule: "menus/internals",
    handlerFunction: "handleContentDeleted",
    handlerType: "internal",
    priority: 10,
    maxRetries: 3,
    retryDelayMs: 2000,
    retryBackoff: "exponential",
    system: "menu",
    description:
      "Marks menu items referencing a deleted tag as orphaned (isOrphaned: true).",
  },

  // --- Page published → auto-add to menus ---
  {
    eventCode: "page.published",
    name: "Menu: Auto-add page to menus",
    handlerModule: "menus/internals",
    handlerFunction: "autoAddPageToMenus",
    handlerType: "internal",
    priority: 10,
    maxRetries: 3,
    retryDelayMs: 2000,
    retryBackoff: "exponential",
    system: "menu",
    description:
      "Automatically adds a newly published top-level page to menus with autoAddPages enabled.",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // SITEMAP SYSTEM
  // Listens for content changes and marks relevant sitemap types as stale,
  // triggering debounced regeneration. Priority 70 = runs after notifications
  // and emails but before audit.
  // ═══════════════════════════════════════════════════════════════════════════

  // --- Post events → mark posts/categories/tags/authors stale ---
  {
    eventCode: "post.published",
    name: "Sitemap: Post published",
    handlerModule: "sitemaps/subscribers",
    handlerFunction: "onPostPublished",
    handlerType: "internal",
    priority: 70,
    maxRetries: 2,
    retryDelayMs: 5000,
    retryBackoff: "exponential",
    system: "sitemap",
    description:
      "Marks posts, categories, tags, and authors sitemaps stale when a post is published.",
  },
  {
    eventCode: "post.unpublished",
    name: "Sitemap: Post unpublished",
    handlerModule: "sitemaps/subscribers",
    handlerFunction: "onPostUnpublished",
    handlerType: "internal",
    priority: 70,
    maxRetries: 2,
    retryDelayMs: 5000,
    retryBackoff: "exponential",
    system: "sitemap",
    description:
      "Marks posts, categories, tags, and authors sitemaps stale when a post is unpublished.",
  },
  {
    eventCode: "post.updated",
    name: "Sitemap: Post updated",
    handlerModule: "sitemaps/subscribers",
    handlerFunction: "onPostUpdated",
    handlerType: "internal",
    priority: 70,
    maxRetries: 2,
    retryDelayMs: 5000,
    retryBackoff: "exponential",
    system: "sitemap",
    description:
      "Marks posts sitemap stale when a published post is updated (slug/title may have changed).",
  },
  {
    eventCode: "post.trashed",
    name: "Sitemap: Post trashed",
    handlerModule: "sitemaps/subscribers",
    handlerFunction: "onPostTrashed",
    handlerType: "internal",
    priority: 70,
    maxRetries: 2,
    retryDelayMs: 5000,
    retryBackoff: "exponential",
    system: "sitemap",
    description:
      "Marks posts, categories, tags, and authors sitemaps stale when a post is trashed.",
  },
  {
    eventCode: "post.restored",
    name: "Sitemap: Post restored",
    handlerModule: "sitemaps/subscribers",
    handlerFunction: "onPostRestored",
    handlerType: "internal",
    priority: 70,
    maxRetries: 2,
    retryDelayMs: 5000,
    retryBackoff: "exponential",
    system: "sitemap",
    description:
      "Marks posts, categories, tags, and authors sitemaps stale when a post is restored from trash.",
  },
  {
    eventCode: "post.deleted",
    name: "Sitemap: Post deleted",
    handlerModule: "sitemaps/subscribers",
    handlerFunction: "onPostDeleted",
    handlerType: "internal",
    priority: 70,
    maxRetries: 2,
    retryDelayMs: 5000,
    retryBackoff: "exponential",
    system: "sitemap",
    description:
      "Marks posts sitemap stale when a post is permanently deleted.",
  },

  // --- Page events → mark pages stale ---
  {
    eventCode: "page.published",
    name: "Sitemap: Page published",
    handlerModule: "sitemaps/subscribers",
    handlerFunction: "onPagePublished",
    handlerType: "internal",
    priority: 70,
    maxRetries: 2,
    retryDelayMs: 5000,
    retryBackoff: "exponential",
    system: "sitemap",
    description:
      "Marks pages sitemap stale when a page is published.",
  },
  {
    eventCode: "page.unpublished",
    name: "Sitemap: Page unpublished",
    handlerModule: "sitemaps/subscribers",
    handlerFunction: "onPageUnpublished",
    handlerType: "internal",
    priority: 70,
    maxRetries: 2,
    retryDelayMs: 5000,
    retryBackoff: "exponential",
    system: "sitemap",
    description:
      "Marks pages sitemap stale when a page is unpublished.",
  },
  {
    eventCode: "page.updated",
    name: "Sitemap: Page updated",
    handlerModule: "sitemaps/subscribers",
    handlerFunction: "onPageUpdated",
    handlerType: "internal",
    priority: 70,
    maxRetries: 2,
    retryDelayMs: 5000,
    retryBackoff: "exponential",
    system: "sitemap",
    description:
      "Marks pages sitemap stale when a page is updated.",
  },
  {
    eventCode: "page.trashed",
    name: "Sitemap: Page trashed",
    handlerModule: "sitemaps/subscribers",
    handlerFunction: "onPageTrashed",
    handlerType: "internal",
    priority: 70,
    maxRetries: 2,
    retryDelayMs: 5000,
    retryBackoff: "exponential",
    system: "sitemap",
    description:
      "Marks pages sitemap stale when a page is trashed.",
  },
  {
    eventCode: "page.deleted",
    name: "Sitemap: Page deleted",
    handlerModule: "sitemaps/subscribers",
    handlerFunction: "onPageDeleted",
    handlerType: "internal",
    priority: 70,
    maxRetries: 2,
    retryDelayMs: 5000,
    retryBackoff: "exponential",
    system: "sitemap",
    description:
      "Marks pages sitemap stale when a page is permanently deleted.",
  },

  // --- Taxonomy events → mark categories or tags stale ---
  {
    eventCode: "taxonomy.category_created",
    name: "Sitemap: Category created",
    handlerModule: "sitemaps/subscribers",
    handlerFunction: "onTaxonomyCategoryCreated",
    handlerType: "internal",
    priority: 70,
    maxRetries: 2,
    retryDelayMs: 5000,
    retryBackoff: "exponential",
    system: "sitemap",
    description:
      "Marks categories sitemap stale when a new category is created.",
  },
  {
    eventCode: "taxonomy.category_deleted",
    name: "Sitemap: Category deleted",
    handlerModule: "sitemaps/subscribers",
    handlerFunction: "onTaxonomyCategoryDeleted",
    handlerType: "internal",
    priority: 70,
    maxRetries: 2,
    retryDelayMs: 5000,
    retryBackoff: "exponential",
    system: "sitemap",
    description:
      "Marks categories sitemap stale when a category is deleted.",
  },
  {
    eventCode: "taxonomy.tag_created",
    name: "Sitemap: Tag created",
    handlerModule: "sitemaps/subscribers",
    handlerFunction: "onTaxonomyTagCreated",
    handlerType: "internal",
    priority: 70,
    maxRetries: 2,
    retryDelayMs: 5000,
    retryBackoff: "exponential",
    system: "sitemap",
    description:
      "Marks tags sitemap stale when a new tag is created.",
  },
  {
    eventCode: "taxonomy.tag_deleted",
    name: "Sitemap: Tag deleted",
    handlerModule: "sitemaps/subscribers",
    handlerFunction: "onTaxonomyTagDeleted",
    handlerType: "internal",
    priority: 70,
    maxRetries: 2,
    retryDelayMs: 5000,
    retryBackoff: "exponential",
    system: "sitemap",
    description:
      "Marks tags sitemap stale when a tag is deleted.",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // ROUTING SYSTEM
  // Listens for slug changes, content publication, and permalink structure
  // changes to auto-manage redirects and clear 404 entries.
  // Priority 50 = runs after notifications/emails but before sitemap/audit.
  // ═══════════════════════════════════════════════════════════════════════════

  // --- Slug changed → auto-create 301 redirect from old URL to new URL ---
  {
    eventCode: "post.updated",
    name: "Routing: Post slug changed",
    handlerModule: "routing/eventHandlers",
    handlerFunction: "onSlugChanged",
    handlerType: "internal",
    priority: 50,
    maxRetries: 3,
    retryDelayMs: 2000,
    retryBackoff: "exponential",
    system: "routing",
    description:
      "Auto-creates a 301 redirect when a post slug changes (old URL → new URL). No-ops if slug unchanged.",
  },
  {
    eventCode: "page.updated",
    name: "Routing: Page slug changed",
    handlerModule: "routing/eventHandlers",
    handlerFunction: "onSlugChanged",
    handlerType: "internal",
    priority: 50,
    maxRetries: 3,
    retryDelayMs: 2000,
    retryBackoff: "exponential",
    system: "routing",
    description:
      "Auto-creates a 301 redirect when a page slug changes (old URL → new URL). No-ops if slug unchanged.",
  },

  // --- Content published → clear 404 entry for the published URL ---
  {
    eventCode: "post.published",
    name: "Routing: Post published (clear 404)",
    handlerModule: "routing/eventHandlers",
    handlerFunction: "onContentPublished",
    handlerType: "internal",
    priority: 50,
    maxRetries: 2,
    retryDelayMs: 2000,
    retryBackoff: "exponential",
    system: "routing",
    description:
      "Clears any 404 log entry for a post URL when the post is published.",
  },
  {
    eventCode: "page.published",
    name: "Routing: Page published (clear 404)",
    handlerModule: "routing/eventHandlers",
    handlerFunction: "onContentPublished",
    handlerType: "internal",
    priority: 50,
    maxRetries: 2,
    retryDelayMs: 2000,
    retryBackoff: "exponential",
    system: "routing",
    description:
      "Clears any 404 log entry for a page URL when the page is published.",
  },

  // --- Permalink structure changed → batch-create redirects for all posts ---
  {
    eventCode: "settings.permalinks_changed",
    name: "Routing: Permalinks changed (batch redirects)",
    handlerModule: "routing/eventHandlers",
    handlerFunction: "onPermalinksChanged",
    handlerType: "action",
    priority: 50,
    maxRetries: 2,
    retryDelayMs: 5000,
    retryBackoff: "exponential",
    system: "routing",
    description:
      "Batch-creates 301 redirects from old URLs to new URLs when the permalink structure changes.",
  },
];

// ─── Bootstrap Function ───────────────────────────────────────────────────

/**
 * Register all event listeners for the system.
 *
 * This is an idempotent operation. For each listener definition:
 *   1. Check if an active listener with the same eventCode + name exists
 *   2. If exists and active: skip (already registered)
 *   3. If exists but inactive: reactivate and update fields
 *   4. If not found: insert new listener record
 *
 * Safe to call multiple times. Will not create duplicates.
 */
export const run = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    let created = 0;
    let reactivated = 0;
    let skipped = 0;

    for (const def of LISTENER_DEFINITIONS) {
      // Check for existing listener with same eventCode + name
      const existingListeners = await ctx.db
        .query("eventListeners")
        .withIndex("by_event_code", (q) =>
          q.eq("eventCode", def.eventCode),
        )
        .collect();

      const existing = existingListeners.find((l) => l.name === def.name);

      if (existing) {
        if (existing.isActive) {
          // Already registered and active. Update handler details in case they changed.
          await ctx.db.patch("eventListeners", existing._id, {
            handlerModule: def.handlerModule,
            handlerFunction: def.handlerFunction,
            handlerType: def.handlerType,
            priority: def.priority,
            maxRetries: def.maxRetries,
            retryDelayMs: def.retryDelayMs,
            retryBackoff: def.retryBackoff,
            filterCondition: def.filterCondition,
            description: def.description,
            updatedAt: now,
          });
          skipped++;
        } else {
          // Exists but deactivated. Reactivate with latest config.
          await ctx.db.patch("eventListeners", existing._id, {
            isActive: true,
            handlerModule: def.handlerModule,
            handlerFunction: def.handlerFunction,
            handlerType: def.handlerType,
            priority: def.priority,
            maxRetries: def.maxRetries,
            retryDelayMs: def.retryDelayMs,
            retryBackoff: def.retryBackoff,
            filterCondition: def.filterCondition,
            description: def.description,
            updatedAt: now,
          });
          reactivated++;
        }
      } else {
        // New listener - insert
        await ctx.db.insert("eventListeners", {
          eventCode: def.eventCode,
          name: def.name,
          handlerModule: def.handlerModule,
          handlerFunction: def.handlerFunction,
          handlerType: def.handlerType,
          priority: def.priority,
          isActive: true,
          maxRetries: def.maxRetries,
          retryDelayMs: def.retryDelayMs,
          retryBackoff: def.retryBackoff,
          filterCondition: def.filterCondition,
          system: def.system,
          description: def.description,
          createdAt: now,
          updatedAt: now,
        });
        created++;
      }
    }

    return {
      total: LISTENER_DEFINITIONS.length,
      created,
      reactivated,
      skipped,
    };
  },
});
