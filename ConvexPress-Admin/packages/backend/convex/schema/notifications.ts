/**
 * Site Notification System - Schema
 *
 * Two tables powering the real-time in-app notification system:
 *
 *   - siteNotifications: Per-user notifications delivered by the Event Dispatcher.
 *     Each row is one notification for one recipient. Supports read/unread tracking,
 *     soft-dismiss, grouping, persistent vs auto-expiring lifecycle, and actor context.
 *
 *   - notificationPreferences: Per-user, per-notification-key toggles controlling
 *     site delivery (bell/center) and toast delivery (Sonner popup) channels.
 *
 * Real-Time Behavior:
 *   Convex reactive subscriptions are the core value proposition. The `unreadCount`
 *   query powers the bell badge, and the `list` query powers the dropdown/center.
 *   Both auto-update instantly when notifications arrive, are read, or are dismissed.
 *   No custom sync logic needed — tab sync is built into Convex's reactive model.
 *
 * WordPress Equivalent:
 *   No direct equivalent. WordPress `admin_notices` are transient, session-scoped,
 *   and globally targeted. ConvexPress notifications are persistent, per-user,
 *   real-time, with full history and per-type preferences.
 *
 * Owned by the Site Notification System.
 */

import { defineTable } from "convex/server";
import { v } from "convex/values";

export const notificationTables = {
  // ─── Site Notifications ──────────────────────────────────────────────────────
  siteNotifications: defineTable({
    // --- Identity ---
    /** User identifier - the recipient */
    userId: v.string(),

    /** Notification type key (e.g., "post_published"). One of 30 defined keys. */
    notificationKey: v.string(),

    /** Source event code (e.g., "post.published") */
    eventCode: v.string(),

    /** Reference to the triggering event record */
    eventId: v.optional(v.id("events")),

    // --- Content ---
    /** Visual type: info (blue), success (green), warning (amber), error (red) */
    type: v.union(
      v.literal("info"),
      v.literal("success"),
      v.literal("warning"),
      v.literal("error"),
    ),

    /** Short title (max 200 chars, no HTML) */
    title: v.string(),

    /** Full message (max 1000 chars, templates resolved at creation time) */
    message: v.string(),

    /** Lucide icon name (e.g., "FileText", "Shield") */
    icon: v.optional(v.string()),

    // --- Navigation ---
    /** URL to navigate to when notification is clicked (max 500 chars) */
    actionUrl: v.optional(v.string()),

    /** Button/link label (max 50 chars, default "View") */
    actionLabel: v.optional(v.string()),

    // --- State ---
    /** Timestamp when marked as read (undefined = unread) */
    readAt: v.optional(v.number()),

    /** Timestamp when dismissed (hidden from feed) */
    dismissedAt: v.optional(v.number()),

    // --- Grouping ---
    /** Grouping key (e.g., "comment.created:post_123"), max 200 chars */
    groupKey: v.optional(v.string()),

    /** Count of grouped notifications (e.g., "3 new comments") */
    groupCount: v.optional(v.number()),

    // --- Actor Context ---
    /** User identifier of the person who triggered this */
    actorId: v.optional(v.string()),

    /** Display name of the actor (denormalized snapshot, max 100 chars) */
    actorName: v.optional(v.string()),

    /** Avatar URL of the actor (denormalized snapshot, max 500 chars) */
    actorAvatarUrl: v.optional(v.string()),

    /** JSON-serialized additional data (max 10KB) */
    metadata: v.optional(v.string()),

    // --- Lifecycle ---
    /** If true, does not auto-expire (requires explicit dismissal) */
    persistent: v.boolean(),

    /** Auto-delete timestamp (30 days for non-persistent, undefined for persistent) */
    expiresAt: v.optional(v.number()),

    // --- Timestamps ---
    /** When the notification was created (immutable) */
    createdAt: v.number(),
  })
    // User's notification feed (chronological, newest-first)
    .index("by_user", ["userId", "createdAt"])
    // Unread notifications for bell badge count
    .index("by_user_unread", ["userId", "readAt"])
    // Filter by notification visual type (info/success/warning/error)
    .index("by_user_type", ["userId", "type", "createdAt"])
    // Filter by notification kind key
    .index("by_user_key", ["userId", "notificationKey", "createdAt"])
    // Notification grouping (find existing to merge with)
    .index("by_group", ["userId", "groupKey", "createdAt"])
    // Retention cleanup of expired non-persistent notifications
    .index("by_expires", ["expiresAt"])
    // Admin listing of all notifications (newest-first, avoids full table scan)
    .index("by_createdAt", ["createdAt"]),

  // ─── Notification Preferences ────────────────────────────────────────────────
  notificationPreferences: defineTable({
    // --- Identity ---
    /** User identifier */
    userId: v.string(),

    /** Notification type key (e.g., "post_published") */
    notificationKey: v.string(),

    // --- Channels ---
    /** Show in notification bell/center */
    siteEnabled: v.boolean(),

    /** Show as Sonner toast popup */
    toastEnabled: v.boolean(),

    // --- Timestamps ---
    updatedAt: v.number(),
  })
    // All preferences for a user
    .index("by_user", ["userId"])
    // Specific preference lookup
    .index("by_user_key", ["userId", "notificationKey"]),
};
