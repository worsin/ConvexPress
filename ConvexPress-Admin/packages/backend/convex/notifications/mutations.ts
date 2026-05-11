/**
 * Site Notification System - Public Mutations
 *
 * User-facing mutations for managing notifications:
 *
 *   - markRead: Mark a single notification as read (owner only)
 *   - markAllRead: Mark all unread notifications as read (owner only)
 *   - dismiss: Soft-dismiss a notification (owner only)
 *   - dismissAll: Dismiss all read notifications (owner only)
 *   - updatePreferences: Update per-key notification preferences (owner only)
 *   - bulkUpdatePreferences: Batch update multiple preferences (owner only)
 *
 * NOTE: There is NO public "send" mutation. Notifications are created
 * exclusively by internal functions called from the Event Dispatcher.
 * Users can only read, dismiss, and configure their own notifications.
 *
 * Authorization pattern: All mutations verify ownership by checking that
 * the notification's userId matches the authenticated user's identifier.
 *
 * Usage:
 *   const markRead = useMutation(api.notifications.mutations.markRead);
 *   await markRead({ notificationId: id });
 */

import { mutation } from "../_generated/server";
import { internal } from "../_generated/api";
import { ConvexError } from "convex/values";
import { getCurrentUser, requireMinimumRoleLevel, getUserIdentifier } from "../helpers/permissions";
import {
  markReadArgs,
  markAllReadArgs,
  dismissArgs,
  dismissAllArgs,
  updatePreferencesArgs,
  isValidNotificationKey,
} from "./validators";

// ─── markRead ────────────────────────────────────────────────────────────────

/**
 * Mark a single notification as read.
 *
 * Idempotent: if already read, returns silently.
 * Ownership: verifies notification belongs to authenticated user.
 */
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const markRead = mutation({
  args: markReadArgs,
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    // 1. Authenticate
    const user = await getCurrentUser(ctx);
    if (!user) {
      throw new ConvexError({
        code: "UNAUTHORIZED",
        message: "Authentication required",
      });
    }

    // 2. Fetch notification
    const notification = await ctx.db.get("siteNotifications", args.notificationId);
    if (!notification) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Notification not found",
      });
    }

    // 3. Verify ownership
    if (notification.userId !== getUserIdentifier(user)) {
      throw new ConvexError({
        code: "FORBIDDEN",
        message: "Cannot modify another user's notification",
      });
    }

    // 4. Idempotent: skip if already read
    if (notification.readAt !== undefined) {
      return;
    }

    // 5. Mark as read
    await ctx.db.patch("siteNotifications", args.notificationId, {
      readAt: Date.now(),
    });
  },
});

// ─── markAllRead ─────────────────────────────────────────────────────────────

/**
 * Mark all of the current user's notifications as read.
 *
 * Optionally filters to notifications created before a given timestamp.
 * Processes in batches of 100 to avoid Convex mutation size limits.
 *
 * Returns: { count: number } -- number of notifications marked as read.
 */
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const markAllRead = mutation({
  args: markAllReadArgs,
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    // 1. Authenticate
    const user = await getCurrentUser(ctx);
    if (!user) {
      throw new ConvexError({
        code: "UNAUTHORIZED",
        message: "Authentication required",
      });
    }

    const now = Date.now();
    const userIdentifier = getUserIdentifier(user);

    // 2. Query unread notifications for this user
    // Using by_user_unread index where readAt is undefined
    const unreadNotifications = await ctx.db
      .query("siteNotifications")
      .withIndex("by_user_unread", (q: ConvexQueryBuilder) =>
        q.eq("userId", userIdentifier).eq("readAt", undefined),
      )
      .take(100); // Process in batches of 100

    // 3. Filter by beforeTimestamp if provided, and exclude dismissed
    let toMark = unreadNotifications.filter(
      // @ts-expect-error TS7006: Callback param loses contextual typing downstream of TS2589.
      (n) => n.dismissedAt === undefined,
    );

    if (args.beforeTimestamp !== undefined) {
      toMark = toMark.filter(
        // @ts-expect-error TS7006: Callback param loses contextual typing downstream of TS2589.
        (n) => n.createdAt <= args.beforeTimestamp!,
      );
    }

    // 4. Batch-update
    for (const notification of toMark) {
      await ctx.db.patch("siteNotifications", notification._id, { readAt: now });
    }

    // 5. Schedule continuation if we hit the batch limit (may have more)
    if (unreadNotifications.length === 100) {
      await ctx.scheduler.runAfter(
        0,
        internal.notifications.internals.markAllReadBatch,
        {
          userId: userIdentifier,
          beforeTimestamp: args.beforeTimestamp,
        },
      );
    }

    return { count: toMark.length };
  },
});

// ─── dismiss ─────────────────────────────────────────────────────────────────

/**
 * Soft-dismiss a notification (hides it from the feed).
 *
 * Sets `dismissedAt` timestamp. Does NOT hard-delete -- hard deletion
 * is reserved for the retention cleanup cron to preserve audit trail.
 *
 * Idempotent: if already dismissed, returns silently.
 */
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const dismiss = mutation({
  args: dismissArgs,
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    // 1. Authenticate
    const user = await getCurrentUser(ctx);
    if (!user) {
      throw new ConvexError({
        code: "UNAUTHORIZED",
        message: "Authentication required",
      });
    }

    // 2. Fetch notification
    const notification = await ctx.db.get("siteNotifications", args.notificationId);
    if (!notification) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Notification not found",
      });
    }

    // 3. Verify ownership
    if (notification.userId !== getUserIdentifier(user)) {
      throw new ConvexError({
        code: "FORBIDDEN",
        message: "Cannot modify another user's notification",
      });
    }

    // 4. Idempotent: skip if already dismissed
    if (notification.dismissedAt !== undefined) {
      return;
    }

    // 5. Soft-dismiss
    await ctx.db.patch("siteNotifications", args.notificationId, {
      dismissedAt: Date.now(),
    });
  },
});

// ─── dismissAll ──────────────────────────────────────────────────────────────

/**
 * Dismiss all read notifications for the current user.
 *
 * Only dismisses notifications that have been read (readAt !== undefined)
 * and not already dismissed. This is the "clear all" action.
 *
 * Returns: { count: number } -- number of notifications dismissed.
 */
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const dismissAll = mutation({
  args: dismissAllArgs,
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx) => {
    // 1. Authenticate
    const user = await getCurrentUser(ctx);
    if (!user) {
      throw new ConvexError({
        code: "UNAUTHORIZED",
        message: "Authentication required",
      });
    }

    const now = Date.now();
    const userIdentifier = getUserIdentifier(user);

    // 2. Query all notifications for this user
    const notifications = await ctx.db
      .query("siteNotifications")
      .withIndex("by_user", (q: ConvexQueryBuilder) => q.eq("userId", userIdentifier))
      .take(100);

    // 3. Filter to read, non-dismissed
    const toDismiss = notifications.filter(
      // @ts-expect-error TS7006: Callback param loses contextual typing downstream of TS2589.
      (n) => n.readAt !== undefined && n.dismissedAt === undefined,
    );

    // 4. Batch-dismiss
    for (const notification of toDismiss) {
      await ctx.db.patch("siteNotifications", notification._id, { dismissedAt: now });
    }

    return { count: toDismiss.length };
  },
});

// ─── updatePreferences ───────────────────────────────────────────────────────

/**
 * Update notification preferences for one or more notification keys.
 *
 * Upserts: if a preference record exists, updates it; if not, creates it.
 * Validates that each notification key is a known key.
 * Array length capped at 50 to prevent abuse.
 *
 * Returns: { count: number } -- number of preferences updated/created.
 */
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const updatePreferences = mutation({
  args: updatePreferencesArgs,
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    // 1. Authenticate
    const user = await getCurrentUser(ctx);
    if (!user) {
      throw new ConvexError({
        code: "UNAUTHORIZED",
        message: "Authentication required",
      });
    }

    // 2. Validate array length
    if (args.preferences.length > 50) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: "Cannot update more than 50 preferences at once",
      });
    }

    const now = Date.now();
    const userIdentifier = getUserIdentifier(user);
    let count = 0;

    // 3. Process each preference
    for (const pref of args.preferences) {
      // Validate notification key
      if (!isValidNotificationKey(pref.notificationKey)) {
        throw new ConvexError({
          code: "VALIDATION_ERROR",
          message: `Unknown notification key: ${pref.notificationKey}`,
        });
      }

      // Check for existing preference
      const existing = await ctx.db
        .query("notificationPreferences")
        .withIndex("by_user_key", (q: ConvexQueryBuilder) =>
          q
            .eq("userId", userIdentifier)
            .eq("notificationKey", pref.notificationKey),
        )
        .unique();

      if (existing) {
        // Update existing
        await ctx.db.patch("notificationPreferences", existing._id, {
          siteEnabled: pref.siteEnabled,
          toastEnabled: pref.toastEnabled,
          updatedAt: now,
        });
      } else {
        // Create new
        await ctx.db.insert("notificationPreferences", {
          userId: userIdentifier,
          notificationKey: pref.notificationKey,
          siteEnabled: pref.siteEnabled,
          toastEnabled: pref.toastEnabled,
          updatedAt: now,
        });
      }

      count++;
    }

    return { count };
  },
});

// ─── sendTestNotification ────────────────────────────────────────────────────

/**
 * Send a real test notification to the current admin user.
 *
 * This creates a real notification record in the database, which will
 * appear in the bell and trigger a toast. This replaces the client-side
 * setTimeout simulation that was previously used.
 *
 * Requires Administrator role (level 100).
 */
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const sendTestNotification = mutation({
  args: {},
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx) => {
    // 1. Require administrator
    const user = await requireMinimumRoleLevel(ctx, 100);

    // 2. Build actor name
    const actorName =
      user.displayName ??
      [user.firstName, user.lastName].filter(Boolean).join(" ") ??
      user.email;

    // 3. Dispatch to internal function via scheduler
    await ctx.scheduler.runAfter(
      0,
      internal.notifications.internals.sendTestNotification,
      {
        userId: getUserIdentifier(user),
        actorName,
      },
    );
  },
});
