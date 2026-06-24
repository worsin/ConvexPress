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
import { OBSOLETE_EMAIL_LISTENERS } from "../emails/registry";
import {
  NOTIFICATION_ENGINE_LISTENER_DEFINITIONS,
  isLegacyNotificationListenerDefinition,
} from "../notificationEngine/registry";

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

function makeSearchListener(
  eventCode: string,
  name: string,
  handlerFunction: string,
  description: string,
): ListenerDef {
  return {
    eventCode,
    name,
    handlerModule: "search/eventHandlers",
    handlerFunction,
    handlerType: "internal",
    priority: 80,
    maxRetries: 3,
    retryDelayMs: 2000,
    retryBackoff: "exponential",
    system: "search",
    description,
  };
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
  {
    eventCode: "ticket.replied",
    name: "Email: Ticket Reply Notifications",
    handlerModule: "emails/internals",
    handlerFunction: "onTicketReplied",
    handlerType: "internal",
    priority: 20,
    maxRetries: 3,
    retryDelayMs: 2000,
    retryBackoff: "exponential",
    system: "email",
    description:
      "Routes ticket reply notifications to the ticket owner or assigned agent.",
  },
  {
    eventCode: "ticket.assigned",
    name: "Email: Ticket Assigned",
    handlerModule: "emails/internals",
    handlerFunction: "onTicketAssigned",
    handlerType: "internal",
    priority: 20,
    maxRetries: 3,
    retryDelayMs: 2000,
    retryBackoff: "exponential",
    system: "email",
    description: "Sends a notification when a ticket is assigned to an agent.",
  },
  {
    eventCode: "ticket.resolved",
    name: "Email: Ticket Resolved",
    handlerModule: "emails/internals",
    handlerFunction: "onTicketResolved",
    handlerType: "internal",
    priority: 20,
    maxRetries: 3,
    retryDelayMs: 2000,
    retryBackoff: "exponential",
    system: "email",
    description: "Sends a resolution confirmation to the ticket owner.",
  },
  {
    eventCode: "kb.workflow_step_ready",
    name: "Email: KB Workflow Step Ready",
    handlerModule: "emails/internals",
    handlerFunction: "onKbWorkflowStepReady",
    handlerType: "internal",
    priority: 20,
    maxRetries: 3,
    retryDelayMs: 2000,
    retryBackoff: "exponential",
    system: "email",
    description: "Sends review-step notifications for KB workflows.",
  },
  {
    eventCode: "kb.workflow_approved",
    name: "Email: KB Workflow Approved",
    handlerModule: "emails/internals",
    handlerFunction: "onKbWorkflowApproved",
    handlerType: "internal",
    priority: 20,
    maxRetries: 3,
    retryDelayMs: 2000,
    retryBackoff: "exponential",
    system: "email",
    description: "Sends approval notifications for KB workflows.",
  },
  {
    eventCode: "kb.workflow_rejected",
    name: "Email: KB Workflow Rejected",
    handlerModule: "emails/internals",
    handlerFunction: "onKbWorkflowRejected",
    handlerType: "internal",
    priority: 20,
    maxRetries: 3,
    retryDelayMs: 2000,
    retryBackoff: "exponential",
    system: "email",
    description: "Sends rejection notifications for KB workflows.",
  },
  {
    eventCode: "kb.comment_created",
    name: "Email: KB Comment Notification",
    handlerModule: "emails/internals",
    handlerFunction: "onKbCommentCreated",
    handlerType: "internal",
    priority: 20,
    maxRetries: 3,
    retryDelayMs: 2000,
    retryBackoff: "exponential",
    system: "email",
    description: "Sends author or moderator notifications for KB comments.",
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

  // --- LMS course events -> mark courses stale ---
  {
    eventCode: "lms.course_published",
    name: "Sitemap: LMS course published",
    handlerModule: "sitemaps/subscribers",
    handlerFunction: "onLmsCourseChanged",
    handlerType: "internal",
    priority: 70,
    maxRetries: 2,
    retryDelayMs: 5000,
    retryBackoff: "exponential",
    system: "sitemap",
    description:
      "Marks courses sitemap stale when an LMS course is published.",
  },
  {
    eventCode: "lms.course_unpublished",
    name: "Sitemap: LMS course unpublished",
    handlerModule: "sitemaps/subscribers",
    handlerFunction: "onLmsCourseChanged",
    handlerType: "internal",
    priority: 70,
    maxRetries: 2,
    retryDelayMs: 5000,
    retryBackoff: "exponential",
    system: "sitemap",
    description:
      "Marks courses sitemap stale when an LMS course is unpublished.",
  },
  {
    eventCode: "lms.course_updated",
    name: "Sitemap: LMS course updated",
    handlerModule: "sitemaps/subscribers",
    handlerFunction: "onLmsCourseChanged",
    handlerType: "internal",
    priority: 70,
    maxRetries: 2,
    retryDelayMs: 5000,
    retryBackoff: "exponential",
    system: "sitemap",
    description:
      "Marks courses sitemap stale when an LMS course URL or content changes.",
  },
  {
    eventCode: "lms.course_archived",
    name: "Sitemap: LMS course archived",
    handlerModule: "sitemaps/subscribers",
    handlerFunction: "onLmsCourseChanged",
    handlerType: "internal",
    priority: 70,
    maxRetries: 2,
    retryDelayMs: 5000,
    retryBackoff: "exponential",
    system: "sitemap",
    description:
      "Marks courses sitemap stale when an LMS course is archived.",
  },
  {
    eventCode: "lms.course_restored",
    name: "Sitemap: LMS course restored",
    handlerModule: "sitemaps/subscribers",
    handlerFunction: "onLmsCourseChanged",
    handlerType: "internal",
    priority: 70,
    maxRetries: 2,
    retryDelayMs: 5000,
    retryBackoff: "exponential",
    system: "sitemap",
    description:
      "Marks courses sitemap stale when an LMS course is restored.",
  },
  {
    eventCode: "lms.course_deleted",
    name: "Sitemap: LMS course deleted",
    handlerModule: "sitemaps/subscribers",
    handlerFunction: "onLmsCourseChanged",
    handlerType: "internal",
    priority: 70,
    maxRetries: 2,
    retryDelayMs: 5000,
    retryBackoff: "exponential",
    system: "sitemap",
    description:
      "Marks courses sitemap stale when an LMS course is deleted.",
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
  // SEARCH SYSTEM
  // Incrementally upserts or removes search index rows after content changes.
  // Priority 80 = runs after routing/sitemap freshness work but before audit.
  // ═══════════════════════════════════════════════════════════════════════════
  makeSearchListener(
    "post.created",
    "Search: Post created",
    "onPostOrPageChanged",
    "Upserts a post search index row when a post is created.",
  ),
  makeSearchListener(
    "post.updated",
    "Search: Post updated",
    "onPostOrPageChanged",
    "Reindexes a post when searchable content changes.",
  ),
  makeSearchListener(
    "post.published",
    "Search: Post published",
    "onPostOrPageChanged",
    "Updates a post search index row when it is published.",
  ),
  makeSearchListener(
    "post.unpublished",
    "Search: Post unpublished",
    "onPostOrPageChanged",
    "Updates a post search index row when it leaves public status.",
  ),
  makeSearchListener(
    "post.scheduled",
    "Search: Post scheduled",
    "onPostOrPageChanged",
    "Updates a post search index row when it is scheduled.",
  ),
  makeSearchListener(
    "post.trashed",
    "Search: Post trashed",
    "onPostOrPageChanged",
    "Updates a post search index row when it is trashed.",
  ),
  makeSearchListener(
    "post.restored",
    "Search: Post restored",
    "onPostOrPageChanged",
    "Updates a post search index row when it is restored.",
  ),
  makeSearchListener(
    "post.duplicated",
    "Search: Post duplicated",
    "onPostOrPageChanged",
    "Upserts a post search index row when a post is duplicated.",
  ),
  makeSearchListener(
    "post.deleted",
    "Search: Post deleted",
    "onPostOrPageDeleted",
    "Removes a post from the search index when it is deleted.",
  ),
  makeSearchListener(
    "page.created",
    "Search: Page created",
    "onPostOrPageChanged",
    "Upserts a page search index row when a page is created.",
  ),
  makeSearchListener(
    "page.updated",
    "Search: Page updated",
    "onPostOrPageChanged",
    "Reindexes a page when searchable content changes.",
  ),
  makeSearchListener(
    "page.published",
    "Search: Page published",
    "onPostOrPageChanged",
    "Updates a page search index row when it is published.",
  ),
  makeSearchListener(
    "page.trashed",
    "Search: Page trashed",
    "onPostOrPageChanged",
    "Updates a page search index row when it is trashed.",
  ),
  makeSearchListener(
    "page.restored",
    "Search: Page restored",
    "onPostOrPageChanged",
    "Updates a page search index row when it is restored.",
  ),
  makeSearchListener(
    "page.deleted",
    "Search: Page deleted",
    "onPostOrPageDeleted",
    "Removes a page from the search index when it is deleted.",
  ),
  makeSearchListener(
    "media.uploaded",
    "Search: Media uploaded",
    "onMediaChanged",
    "Upserts a media search index row when media is uploaded.",
  ),
  makeSearchListener(
    "media.updated",
    "Search: Media updated",
    "onMediaChanged",
    "Reindexes media when searchable metadata changes.",
  ),
  makeSearchListener(
    "media.deleted",
    "Search: Media deleted",
    "onMediaDeleted",
    "Removes media from the search index when it is deleted.",
  ),
  makeSearchListener(
    "comment.created",
    "Search: Comment created",
    "onCommentChanged",
    "Upserts an approved comment search index row when a comment is created.",
  ),
  makeSearchListener(
    "comment.updated",
    "Search: Comment updated",
    "onCommentChanged",
    "Reindexes a comment when searchable content changes.",
  ),
  makeSearchListener(
    "comment.approved",
    "Search: Comment approved",
    "onCommentChanged",
    "Upserts a comment search index row when a comment is approved.",
  ),
  makeSearchListener(
    "comment.rejected",
    "Search: Comment rejected",
    "onCommentChanged",
    "Updates the search index when a comment is rejected.",
  ),
  makeSearchListener(
    "comment.deleted",
    "Search: Comment deleted",
    "onCommentRemoved",
    "Removes a comment from the search index when it is deleted.",
  ),
  makeSearchListener(
    "comment.spammed",
    "Search: Comment spammed",
    "onCommentRemoved",
    "Removes a comment from the search index when it is marked spam.",
  ),
  makeSearchListener(
    "taxonomy.term_assigned",
    "Search: Taxonomy term assigned",
    "onTaxonomyTermPostChanged",
    "Reindexes a post when taxonomy terms are assigned.",
  ),
  makeSearchListener(
    "taxonomy.category_updated",
    "Search: Category updated",
    "onTaxonomyTermUpdated",
    "Reindexes posts using a renamed category.",
  ),
  makeSearchListener(
    "taxonomy.tag_updated",
    "Search: Tag updated",
    "onTaxonomyTermUpdated",
    "Reindexes posts using a renamed tag.",
  ),

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

  // ═══════════════════════════════════════════════════════════════════════════
  // COMMERCE SUBSCRIPTIONS — lifecycle emails (Wave 10.2)
  // Each event code has its own dedicated handler that builds the variable
  // bag from the subscription + user + offer docs and queues a Resend email.
  // ═══════════════════════════════════════════════════════════════════════════
  {
    eventCode: "commerce.subscription_created",
    name: "Email: Subscription Welcome",
    handlerModule: "commerceSubscriptions/emails",
    handlerFunction: "onSubscriptionCreated",
    handlerType: "internal",
    priority: 20,
    maxRetries: 3,
    retryDelayMs: 2000,
    retryBackoff: "exponential",
    system: "email",
    description:
      "Sends welcome email when a subscription is first activated.",
  },
  {
    eventCode: "commerce.subscription_renewed",
    name: "Email: Subscription Renewed",
    handlerModule: "commerceSubscriptions/emails",
    handlerFunction: "onSubscriptionRenewed",
    handlerType: "internal",
    priority: 20,
    maxRetries: 3,
    retryDelayMs: 2000,
    retryBackoff: "exponential",
    system: "email",
    description:
      "Sends renewal confirmation when a recurring charge succeeds.",
  },
  {
    eventCode: "commerce.subscription_past_due",
    name: "Email: Subscription Payment Failed",
    handlerModule: "commerceSubscriptions/emails",
    handlerFunction: "onSubscriptionPastDue",
    handlerType: "internal",
    priority: 20,
    maxRetries: 3,
    retryDelayMs: 2000,
    retryBackoff: "exponential",
    system: "email",
    description:
      "Sends payment-failed email and retry schedule notice.",
  },
  {
    eventCode: "commerce.subscription_trial_ending",
    name: "Email: Subscription Trial Ending",
    handlerModule: "commerceSubscriptions/emails",
    handlerFunction: "onSubscriptionTrialEnding",
    handlerType: "internal",
    priority: 20,
    maxRetries: 3,
    retryDelayMs: 2000,
    retryBackoff: "exponential",
    system: "email",
    description:
      "Sends trial-ending warning ~3 days before trial converts to paid.",
  },
  {
    eventCode: "commerce.subscription_cancelled",
    name: "Email: Subscription Cancelled",
    handlerModule: "commerceSubscriptions/emails",
    handlerFunction: "onSubscriptionCancelled",
    handlerType: "internal",
    priority: 20,
    maxRetries: 3,
    retryDelayMs: 2000,
    retryBackoff: "exponential",
    system: "email",
    description:
      "Sends confirmation email when a subscription is cancelled.",
  },
  {
    eventCode: "commerce.subscription_paused",
    name: "Email: Subscription Paused",
    handlerModule: "commerceSubscriptions/emails",
    handlerFunction: "onSubscriptionPaused",
    handlerType: "internal",
    priority: 20,
    maxRetries: 3,
    retryDelayMs: 2000,
    retryBackoff: "exponential",
    system: "email",
    description:
      "Sends confirmation email when a subscription is paused.",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // FORMS EXTENSION — Form Notification System (v2 scanner-discovered)
  // One handler (`dispatch`) bound to each of the three form trigger events.
  // It resolves + sends each form's configured notifications (email + site).
  // handlerType "action" because dispatch is an internalAction (fans out to
  // sub-mutations for per-row delivery isolation). priority 20 = alongside
  // other email handlers, after site notifications/audit.
  // NOTE: new listeners require a `bootstrap.registerListeners.run` after deploy.
  // ═══════════════════════════════════════════════════════════════════════════
  {
    eventCode: "form.submitted",
    name: "Form Notifications: Submitted",
    handlerModule: "extensions/forms/notifications",
    handlerFunction: "dispatch",
    handlerType: "action",
    priority: 20,
    maxRetries: 3,
    retryDelayMs: 2000,
    retryBackoff: "exponential",
    system: "forms",
    description:
      "Resolves + sends configured form notifications on submission.",
  },
  {
    eventCode: "form.progress_saved",
    name: "Form Notifications: Progress Saved",
    handlerModule: "extensions/forms/notifications",
    handlerFunction: "dispatch",
    handlerType: "action",
    priority: 20,
    maxRetries: 3,
    retryDelayMs: 2000,
    retryBackoff: "exponential",
    system: "forms",
    description:
      "Resolves + sends configured form notifications when progress is saved (resume emails).",
  },
  {
    eventCode: "form.action_failed",
    name: "Form Notifications: Action Failed",
    handlerModule: "extensions/forms/notifications",
    handlerFunction: "dispatch",
    handlerType: "action",
    priority: 20,
    maxRetries: 3,
    retryDelayMs: 2000,
    retryBackoff: "exponential",
    system: "forms",
    description:
      "Resolves + sends configured form notifications when a post-submit action fails.",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // FORMS EXTENSION — Form Actions & Feeds System (v2 scanner-discovered)
  // `runActions` (internalMutation) loads enabled form actions on submission,
  // evaluates conditional logic, and enqueues an isolated per-action dispatch.
  // handlerType "internal" because runActions is an internalMutation (a mutation
  // cannot runAction, so it only schedules; dispatchAction does the I/O).
  // priority 30 = runs after notifications/site/audit for this event.
  // NOTE: new listeners require a `bootstrap.registerListeners.run` after deploy.
  // ═══════════════════════════════════════════════════════════════════════════
  {
    eventCode: "form.submitted",
    name: "Forms: Run post-submit actions",
    handlerModule: "extensions/forms/actions",
    handlerFunction: "runActions",
    handlerType: "internal",
    priority: 30,
    maxRetries: 3,
    retryDelayMs: 2000,
    retryBackoff: "exponential",
    system: "forms",
    description:
      "Loads enabled form actions, evaluates conditional logic, and enqueues isolated per-action dispatch.",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // FORMS ANALYTICS — Form Analytics & Export System (v2 scanner-discovered)
  // Increments the `completed` funnel counter on form.submitted (isComplete
  // only). priority 50 = analytics tier (after notifications/email).
  // NOTE: new listeners require a `bootstrap.registerListeners.run` after deploy.
  // ═══════════════════════════════════════════════════════════════════════════
  {
    eventCode: "form.submitted",
    name: "Forms Analytics: Increment completed funnel stage",
    handlerModule: "extensions/forms/analytics",
    handlerFunction: "onFormSubmitted",
    handlerType: "internal",
    priority: 50,
    maxRetries: 3,
    retryDelayMs: 2000,
    retryBackoff: "exponential",
    system: "forms",
    description:
      "Increments form_funnel_stats 'completed' on form.submitted when isComplete:true.",
  },
];

const EFFECTIVE_LISTENER_DEFINITIONS: ListenerDef[] = [
  ...LISTENER_DEFINITIONS.filter(
    (definition) => !isLegacyNotificationListenerDefinition(definition),
  ),
  ...NOTIFICATION_ENGINE_LISTENER_DEFINITIONS,
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
export async function registerListenerDefinitions(ctx: any, now = Date.now()) {
  const totalDefinitions = EFFECTIVE_LISTENER_DEFINITIONS.length as number;
  let created = 0;
  let reactivated = 0;
  let skipped = 0;

  for (const def of EFFECTIVE_LISTENER_DEFINITIONS) {
    const existingListeners = await ctx.db
      .query("eventListeners")
      .withIndex("by_event_code", (q: ConvexQueryBuilder) =>
        q.eq("eventCode", def.eventCode),
      )
      .collect();

    // @ts-expect-error TS7006: Callback param loses contextual typing downstream of TS2589.
    const existing = existingListeners.find((l) => l.name === def.name);

    if (existing) {
      if (existing.isActive) {
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

  let deactivated = 0;
  for (const legacy of OBSOLETE_EMAIL_LISTENERS) {
    const existing = await ctx.db
      .query("eventListeners")
      .withIndex("by_event_code", (q: ConvexQueryBuilder) =>
        q.eq("eventCode", legacy.eventCode),
      )
      .collect();

    for (const listener of existing) {
      if (listener.name !== legacy.name || !listener.isActive) continue;
      await ctx.db.patch("eventListeners", listener._id, {
        isActive: false,
        updatedAt: now,
      });
      deactivated++;
    }
  }

  const activeListeners = await ctx.db
    .query("eventListeners")
    .withIndex("by_active", (q: ConvexQueryBuilder) => q.eq("isActive", true))
    .collect();

  for (const listener of activeListeners) {
    if (!isLegacyNotificationListenerDefinition(listener)) continue;

    await ctx.db.patch("eventListeners", listener._id, {
      isActive: false,
      updatedAt: now,
    });
    deactivated++;
  }

  return {
    total: totalDefinitions,
    created,
    reactivated,
    skipped,
    deactivated,
  };
}

const runConfig: any = {
  args: {},
  handler: async (ctx: any) => {
    return await registerListenerDefinitions(ctx);
  },
};

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const run = internalMutation(runConfig);
