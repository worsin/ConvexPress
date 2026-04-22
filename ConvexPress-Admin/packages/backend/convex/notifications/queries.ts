/**
 * Site Notification System - Public Queries
 *
 * Reactive queries for reading notification data:
 *
 *   - list: Paginated notifications for the current user (with cursor-based pagination)
 *   - unreadCount: Count of unread notifications for bell badge (capped at 100)
 *   - get: Single notification detail
 *   - getPreferences: All notification preferences for current user (merged with defaults)
 *   - getPreference: Single preference for a specific key
 *   - listAll: Admin view of all notifications (requires Administrator role)
 *
 * All queries require authentication. User queries verify ownership automatically
 * via getCurrentUser. The listAll admin query requires Administrator role.
 *
 * These are Convex reactive queries — clients subscribed via useQuery() receive
 * live updates when the underlying data changes. This is what makes the bell
 * badge and notification dropdown update in real-time.
 *
 * Usage:
 *   const { notifications, nextCursor, hasMore } = useQuery(
 *     api.notifications.queries.list,
 *     { limit: 20 }
 *   );
 *   const { count } = useQuery(api.notifications.queries.unreadCount, {});
 */

import { query } from "../_generated/server";
import { ConvexError } from "convex/values";
import {
  getCurrentUser,
  requireMinimumRoleLevel,
  getUserIdentifier,
} from "../helpers/permissions";
import {
  listArgs,
  unreadCountArgs,
  getArgs,
  getPreferencesArgs,
  getPreferenceArgs,
  listAllArgs,
  NOTIFICATION_TYPES,
  NOTIFICATION_CATEGORIES,
  type NotificationCategory,
  isValidNotificationKey,
} from "./validators";

// ─── list ────────────────────────────────────────────────────────────────────

/**
 * List notifications for the current authenticated user.
 *
 * Features:
 *   - Cursor-based pagination using createdAt timestamp
 *   - Filter by type (info/success/warning/error)
 *   - Filter to unread only
 *   - Excludes dismissed notifications
 *   - Sorted newest-first by default
 *
 * This is a reactive subscription — the dropdown and notification center
 * auto-update when new notifications arrive.
 */
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const list = query({
  args: listArgs,
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    // 1. Authenticate
    const user = await getCurrentUser(ctx);
    if (!user) {
      return { notifications: [], nextCursor: undefined, hasMore: false };
    }

    const userIdentifier = getUserIdentifier(user);
    const limit = Math.min(args.limit ?? 20, 100);
    const fetchLimit = limit + 1; // Fetch one extra to detect hasMore

    let notifications;

    // 2. Select index based on filters
    if (args.unreadOnly && !args.type) {
      // Optimized path: use by_user_unread index directly for unread-only
      // This avoids the 3x over-fetch since we filter at the index level
      notifications = await ctx.db
        .query("siteNotifications")
        .withIndex("by_user_unread", (q: ConvexQueryBuilder) =>
          q.eq("userId", userIdentifier).eq("readAt", undefined),
        )
        .order("desc")
        .take(fetchLimit * 2); // Only 2x for dismissed filtering
    } else if (args.type) {
      // Filter by notification visual type
      notifications = await ctx.db
        .query("siteNotifications")
        .withIndex("by_user_type", (q: ConvexQueryBuilder) =>
          q.eq("userId", userIdentifier).eq("type", args.type!),
        )
        .order("desc")
        .take(fetchLimit * 3);
    } else {
      // Default: chronological by createdAt
      notifications = await ctx.db
        .query("siteNotifications")
        .withIndex("by_user", (q: ConvexQueryBuilder) => q.eq("userId", userIdentifier))
        .order("desc")
        .take(fetchLimit * 3);
    }

    // 3. Apply post-filters
    // @ts-expect-error TS7006: Callback param loses contextual typing downstream of TS2589.
    let filtered = notifications.filter((n) => {
      // Exclude dismissed
      if (n.dismissedAt !== undefined) return false;

      // Unread only filter (already handled by index when unreadOnly && !type)
      if (args.unreadOnly && n.readAt !== undefined) return false;

      // Cursor-based pagination (older than cursor)
      if (args.cursor !== undefined && n.createdAt >= args.cursor) return false;

      return true;
    });

    // 4. Take the limit + 1 to detect hasMore
    filtered = filtered.slice(0, fetchLimit);

    // 5. Build response
    const hasMore = filtered.length > limit;
    const resultNotifications = filtered.slice(0, limit);

    const nextCursor =
      hasMore && resultNotifications.length > 0
        ? resultNotifications[resultNotifications.length - 1].createdAt
        : undefined;

    return {
      // @ts-expect-error TS7006: Callback param loses contextual typing downstream of TS2589.
      notifications: resultNotifications.map((n) => ({
        _id: n._id,
        userId: n.userId,
        notificationKey: n.notificationKey,
        eventCode: n.eventCode,
        type: n.type,
        title: n.title,
        message: n.message,
        icon: n.icon,
        actionUrl: n.actionUrl,
        actionLabel: n.actionLabel,
        readAt: n.readAt,
        groupKey: n.groupKey,
        groupCount: n.groupCount,
        actorId: n.actorId,
        actorName: n.actorName,
        actorAvatarUrl: n.actorAvatarUrl,
        persistent: n.persistent,
        createdAt: n.createdAt,
      })),
      nextCursor,
      hasMore,
    };
  },
});

// ─── unreadCount ─────────────────────────────────────────────────────────────

/**
 * Get the count of unread, non-dismissed notifications for the current user.
 *
 * This is the most frequently subscribed query — it powers the bell badge.
 * Capped at 100 for performance (UI shows "99+" for > 99).
 *
 * Uses the by_user_unread index for efficient lookup.
 * Convex caches identical subscriptions: multiple tabs = single query evaluation.
 */
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const unreadCount = query({
  args: unreadCountArgs,
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx) => {
    // 1. Authenticate
    const user = await getCurrentUser(ctx);
    if (!user) {
      return { count: 0 };
    }

    // 2. Query unread notifications (readAt === undefined)
    const unread = await ctx.db
      .query("siteNotifications")
      .withIndex("by_user_unread", (q: ConvexQueryBuilder) =>
        q.eq("userId", getUserIdentifier(user)).eq("readAt", undefined),
      )
      .take(101); // Cap at 101 to detect > 100

    // 3. Filter out dismissed and count
    // @ts-expect-error TS7006: Callback param loses contextual typing downstream of TS2589.
    const count = unread.filter((n) => n.dismissedAt === undefined).length;

    // 4. Cap at 100
    return { count: Math.min(count, 100) };
  },
});

// ─── get ─────────────────────────────────────────────────────────────────────

/**
 * Get a single notification by ID.
 *
 * Verifies ownership: only the notification recipient can view it.
 * Returns full notification detail including parsed metadata.
 */
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const get = query({
  args: getArgs,
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
        message: "Cannot view another user's notification",
      });
    }

    // 4. Parse metadata if present
    let parsedMetadata: Record<string, unknown> | undefined;
    if (notification.metadata) {
      try {
        parsedMetadata = JSON.parse(notification.metadata);
      } catch {
        // Keep undefined if parsing fails
      }
    }

    return {
      _id: notification._id,
      userId: notification.userId,
      notificationKey: notification.notificationKey,
      eventCode: notification.eventCode,
      eventId: notification.eventId,
      type: notification.type,
      title: notification.title,
      message: notification.message,
      icon: notification.icon,
      actionUrl: notification.actionUrl,
      actionLabel: notification.actionLabel,
      readAt: notification.readAt,
      dismissedAt: notification.dismissedAt,
      groupKey: notification.groupKey,
      groupCount: notification.groupCount,
      actorId: notification.actorId,
      actorName: notification.actorName,
      actorAvatarUrl: notification.actorAvatarUrl,
      metadata: parsedMetadata,
      persistent: notification.persistent,
      expiresAt: notification.expiresAt,
      createdAt: notification.createdAt,
    };
  },
});

// ─── getPreferences ──────────────────────────────────────────────────────────

/**
 * Get all notification preferences for the current user.
 *
 * Merges saved preferences with NOTIFICATION_TYPES defaults to produce
 * a complete list. Types without explicit preferences use defaults.
 * Grouped by category for UI rendering.
 *
 * Returns array of preferences sorted by category display order.
 */
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const getPreferences = query({
  args: getPreferencesArgs,
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx) => {
    // 1. Authenticate
    const user = await getCurrentUser(ctx);
    if (!user) {
      return [];
    }

    // 2. Fetch all saved preferences for this user
    const savedPreferences = await ctx.db
      .query("notificationPreferences")
      .withIndex("by_user", (q: ConvexQueryBuilder) => q.eq("userId", getUserIdentifier(user)))
      .collect();

    // 3. Build a map of saved preferences by key
    const savedMap = new Map<
      string,
      { siteEnabled: boolean; toastEnabled: boolean }
    >();
    for (const pref of savedPreferences) {
      savedMap.set(pref.notificationKey, {
        siteEnabled: pref.siteEnabled,
        toastEnabled: pref.toastEnabled,
      });
    }

    // 4. Merge with NOTIFICATION_TYPES defaults
    const result: Array<{
      notificationKey: string;
      notificationName: string;
      category: NotificationCategory;
      type: string;
      icon: string;
      siteEnabled: boolean;
      toastEnabled: boolean;
    }> = [];

    for (const config of Object.values(NOTIFICATION_TYPES)) {
      const saved = savedMap.get(config.key);

      result.push({
        notificationKey: config.key,
        notificationName: config.name,
        category: config.category,
        type: config.type,
        icon: config.icon,
        siteEnabled: saved?.siteEnabled ?? config.defaultSiteEnabled,
        toastEnabled: saved?.toastEnabled ?? config.defaultToastEnabled,
      });
    }

    // 5. Sort by category display order, then by name within category
    const categoryOrder = new Map(
      NOTIFICATION_CATEGORIES.map((cat, idx) => [cat, idx]),
    );

    result.sort((a, b) => {
      const catA = categoryOrder.get(a.category) ?? 999;
      const catB = categoryOrder.get(b.category) ?? 999;
      if (catA !== catB) return catA - catB;
      return a.notificationName.localeCompare(b.notificationName);
    });

    return result;
  },
});

// ─── getPreference ───────────────────────────────────────────────────────────

/**
 * Get a single notification preference for a specific key.
 *
 * If no saved preference exists, returns the default from NOTIFICATION_TYPES.
 * Returns null if the key is not a known notification type.
 */
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const getPreference = query({
  args: getPreferenceArgs,
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    // 1. Authenticate
    const user = await getCurrentUser(ctx);
    if (!user) {
      return null;
    }

    // 2. Validate notification key
    if (!isValidNotificationKey(args.notificationKey)) {
      return null;
    }

    // 3. Look up saved preference
    const saved = await ctx.db
      .query("notificationPreferences")
      .withIndex("by_user_key", (q: ConvexQueryBuilder) =>
        q
          .eq("userId", getUserIdentifier(user))
          .eq("notificationKey", args.notificationKey),
      )
      .unique();

    // 4. Get type config for defaults
    const config = NOTIFICATION_TYPES[args.notificationKey];
    if (!config) return null;

    return {
      notificationKey: args.notificationKey,
      notificationName: config.name,
      category: config.category,
      siteEnabled: saved?.siteEnabled ?? config.defaultSiteEnabled,
      toastEnabled: saved?.toastEnabled ?? config.defaultToastEnabled,
    };
  },
});

// ─── listAll ─────────────────────────────────────────────────────────────────

/**
 * Admin view: list all notifications across all users.
 *
 * Requires Administrator role (level 100).
 * Supports filtering by userId, type, and notificationKey.
 * Cursor-based pagination using createdAt timestamp.
 *
 * Used for the /admin/settings/notifications monitoring view.
 */
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const listAll = query({
  args: listAllArgs,
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    // 1. Require administrator access (role level 100)
    await requireMinimumRoleLevel(ctx, 100);

    const limit = Math.min(args.limit ?? 50, 200);
    const fetchLimit = limit + 1;

    // 2. Query with appropriate index
    let notifications;

    if (args.userId && args.notificationKey) {
      notifications = await ctx.db
        .query("siteNotifications")
        .withIndex("by_user_key", (q: ConvexQueryBuilder) =>
          q
            .eq("userId", args.userId!)
            .eq("notificationKey", args.notificationKey!),
        )
        .order("desc")
        .take(fetchLimit * 2);
    } else if (args.userId && args.type) {
      notifications = await ctx.db
        .query("siteNotifications")
        .withIndex("by_user_type", (q: ConvexQueryBuilder) =>
          q.eq("userId", args.userId!).eq("type", args.type!),
        )
        .order("desc")
        .take(fetchLimit * 2);
    } else if (args.userId) {
      notifications = await ctx.db
        .query("siteNotifications")
        .withIndex("by_user", (q: ConvexQueryBuilder) => q.eq("userId", args.userId!))
        .order("desc")
        .take(fetchLimit * 2);
    } else {
      // No userId filter -- use by_createdAt index for efficient listing
      notifications = await ctx.db
        .query("siteNotifications")
        .withIndex("by_createdAt")
        .order("desc")
        .take(fetchLimit * 2);
    }

    // 3. Apply cursor and post-filters
    let filtered = notifications;

    if (args.cursor !== undefined) {
      // @ts-expect-error TS7006: Callback param loses contextual typing downstream of TS2589.
      filtered = filtered.filter((n) => n.createdAt < args.cursor!);
    }

    if (args.type && !args.userId) {
      // @ts-expect-error TS7006: Callback param loses contextual typing downstream of TS2589.
      filtered = filtered.filter((n) => n.type === args.type);
    }

    if (args.notificationKey && !args.userId) {
      filtered = filtered.filter(
        // @ts-expect-error TS7006: Callback param loses contextual typing downstream of TS2589.
        (n) => n.notificationKey === args.notificationKey,
      );
    }

    filtered = filtered.slice(0, fetchLimit);

    // 4. Build response
    const hasMore = filtered.length > limit;
    const resultNotifications = filtered.slice(0, limit);

    const nextCursor =
      hasMore && resultNotifications.length > 0
        ? resultNotifications[resultNotifications.length - 1].createdAt
        : undefined;

    return {
      // @ts-expect-error TS7006: Callback param loses contextual typing downstream of TS2589.
      notifications: resultNotifications.map((n) => ({
        _id: n._id,
        userId: n.userId,
        notificationKey: n.notificationKey,
        eventCode: n.eventCode,
        type: n.type,
        title: n.title,
        message: n.message,
        readAt: n.readAt,
        dismissedAt: n.dismissedAt,
        groupCount: n.groupCount,
        actorName: n.actorName,
        persistent: n.persistent,
        createdAt: n.createdAt,
      })),
      nextCursor,
      hasMore,
    };
  },
});
