/**
 * Site Notification System - Internal Functions
 *
 * Functions that are NOT callable from clients. Used for:
 *
 *   - send: Create a notification for a single user (checks preferences, handles grouping)
 *   - sendBulk: Send the same notification to multiple users
 *   - onEvent: Generic event handler invoked by the Event Dispatcher
 *   - cleanupExpired: Delete expired non-persistent notifications
 *   - cleanupBatch: Batch continuation for cleanup
 *   - bootstrapPreferences: Seed default preferences for a new user
 *
 * The `send` internal mutation is the ONLY way site notifications are created.
 * It is called by event handler functions (in this file) or by the `sendBulk`
 * function for admin-targeted notifications.
 *
 * The `onEvent` handler is the universal entry point from the Event Dispatcher.
 * It resolves recipients, builds notification content from templates, and
 * dispatches to `send` for each recipient.
 */

import { internalMutation } from "../_generated/server";
import { internal } from "../_generated/api";
import { emitEvent } from "../helpers/events";
import { interpolateTemplate } from "../helpers/notification";
import { getUserIdentifier } from "../helpers/permissions";
import {
  sendArgs,
  sendBulkArgs,
  onEventArgs,
  cleanupExpiredArgs,
  cleanupBatchArgs,
  markAllReadBatchArgs,
  bootstrapPreferencesArgs,
  sendTestNotificationArgs,
  NOTIFICATION_TYPES,
  NOTIFICATION_KEY_SET,
  EVENT_TO_NOTIFICATION_KEYS,
} from "./validators";

// ─── Constants ───────────────────────────────────────────────────────────────

/** 30 days in milliseconds (default expiry for non-persistent notifications) */
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

/** 5 minutes in milliseconds (grouping window) */
const GROUPING_WINDOW_MS = 5 * 60 * 1000;

/** Batch size for cleanup operations */
const CLEANUP_BATCH_SIZE = 100;

/** Rate limit: max notifications per user in the rate limit window */
const RATE_LIMIT_MAX = 50;

/** Rate limit window (5 minutes) */
const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000;

// ─── send ────────────────────────────────────────────────────────────────────

/**
 * Create a notification for a single user.
 *
 * This is the core internal function. It:
 *   1. Validates the notification key
 *   2. Validates input constraints (title length, message length, metadata size)
 *   3. Checks user preferences (if siteEnabled is false, skips)
 *   4. Handles grouping (merges with existing notification if same groupKey within 5 min)
 *   5. Calculates expiry (persistent = never, non-persistent = 30 days)
 *   6. Inserts the notification record
 *
 * Called by: onEvent handler, sendBulk, or direct internal calls
 * Never exposed to clients.
 */
export const send = internalMutation({
  args: sendArgs,
  handler: async (ctx, args) => {
    const now = Date.now();

    // ─── 1. Validate notification key ──────────────────────────────────
    if (!NOTIFICATION_KEY_SET.has(args.notificationKey)) {
      console.warn(
        `[SiteNotification] Unknown notification key: ${args.notificationKey}. Skipping.`,
      );
      return null;
    }

    // ─── 2. Validate input constraints ─────────────────────────────────
    if (args.title.length > 200) {
      console.warn(
        `[SiteNotification] Title exceeds 200 chars for key ${args.notificationKey}. Truncating.`,
      );
    }
    const title = args.title.slice(0, 200);

    if (args.message.length > 1000) {
      console.warn(
        `[SiteNotification] Message exceeds 1000 chars for key ${args.notificationKey}. Truncating.`,
      );
    }
    const message = args.message.slice(0, 1000);

    // Validate metadata JSON and size if provided
    if (args.metadata) {
      try {
        JSON.parse(args.metadata);
      } catch {
        console.warn(
          `[SiteNotification] Invalid metadata JSON for key ${args.notificationKey}. Discarding metadata.`,
        );
      }
      if (args.metadata.length > 10240) {
        console.warn(
          `[SiteNotification] Metadata exceeds 10KB for key ${args.notificationKey}. Discarding.`,
        );
      }
    }
    const metadata =
      args.metadata &&
      args.metadata.length <= 10240
        ? (() => {
            try {
              JSON.parse(args.metadata!);
              return args.metadata;
            } catch {
              return undefined;
            }
          })()
        : undefined;

    // ─── 3. Check user preferences ─────────────────────────────────────
    const notificationConfig = NOTIFICATION_TYPES[args.notificationKey];
    const preference = await ctx.db
      .query("notificationPreferences")
      .withIndex("by_user_key", (q) =>
        q
          .eq("userId", args.userId)
          .eq("notificationKey", args.notificationKey),
      )
      .unique();

    // Determine if site delivery is enabled
    const siteEnabled =
      preference !== null
        ? preference.siteEnabled
        : notificationConfig?.defaultSiteEnabled ?? true;

    if (!siteEnabled) {
      // User has disabled this notification type. Skip.
      return null;
    }

    // ─── 3b. Rate limiting ──────────────────────────────────────────────
    // If a user receives > RATE_LIMIT_MAX notifications within the window,
    // group all subsequent ones into a single summary notification.
    const recentCutoff = now - RATE_LIMIT_WINDOW_MS;
    const recentNotifications = await ctx.db
      .query("siteNotifications")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .order("desc")
      .take(RATE_LIMIT_MAX + 1);

    const recentCount = recentNotifications.filter(
      (n) => n.createdAt > recentCutoff,
    ).length;

    if (recentCount >= RATE_LIMIT_MAX) {
      // Check if a rate-limit summary already exists in the window
      const existingSummary = await ctx.db
        .query("siteNotifications")
        .withIndex("by_group", (q) =>
          q.eq("userId", args.userId).eq("groupKey", `rate_limit:${args.userId}`),
        )
        .order("desc")
        .first();

      if (
        existingSummary &&
        existingSummary.readAt === undefined &&
        existingSummary.dismissedAt === undefined &&
        now - existingSummary.createdAt < RATE_LIMIT_WINDOW_MS
      ) {
        // Update existing summary
        const newCount = (existingSummary.groupCount ?? 1) + 1;
        await ctx.db.patch("siteNotifications", existingSummary._id, {
          groupCount: newCount,
          message: `You have ${newCount} new notifications. Notifications are arriving quickly.`,
          createdAt: now,
        });
        return existingSummary._id;
      }

      // Create a new rate-limit summary
      const summaryId = await ctx.db.insert("siteNotifications", {
        userId: args.userId,
        notificationKey: args.notificationKey,
        eventCode: "system.rate_limited",
        type: "info",
        title: "Multiple Notifications",
        message: "You have many new notifications. Notifications are arriving quickly.",
        icon: "Bell",
        readAt: undefined,
        dismissedAt: undefined,
        groupKey: `rate_limit:${args.userId}`,
        groupCount: 1,
        persistent: false,
        expiresAt: now + THIRTY_DAYS_MS,
        createdAt: now,
      });
      return summaryId;
    }

    // ─── 4. Handle grouping ────────────────────────────────────────────
    if (args.groupKey) {
      // Look for existing unread notification with same groupKey in the window
      const existingGrouped = await ctx.db
        .query("siteNotifications")
        .withIndex("by_group", (q) =>
          q.eq("userId", args.userId).eq("groupKey", args.groupKey!),
        )
        .order("desc")
        .first();

      if (
        existingGrouped &&
        existingGrouped.readAt === undefined &&
        existingGrouped.dismissedAt === undefined &&
        now - existingGrouped.createdAt < GROUPING_WINDOW_MS
      ) {
        // Merge: increment count, update message, bump createdAt
        const newCount = (existingGrouped.groupCount ?? 1) + 1;
        await ctx.db.patch("siteNotifications", existingGrouped._id, {
          groupCount: newCount,
          message: message,
          createdAt: now,
          // Keep the original title but update the message with count context
        });
        return existingGrouped._id;
      }
    }

    // ─── 5. Calculate expiry ───────────────────────────────────────────
    const isPersistent = args.persistent ?? notificationConfig?.persistent ?? false;
    const expiresAt = isPersistent ? undefined : now + THIRTY_DAYS_MS;

    // ─── 6. Insert notification record ─────────────────────────────────
    const notificationId = await ctx.db.insert("siteNotifications", {
      userId: args.userId,
      notificationKey: args.notificationKey,
      eventCode: args.eventCode,
      eventId: args.eventId,
      type: args.type,
      title,
      message,
      icon: args.icon,
      actionUrl: args.actionUrl?.slice(0, 500),
      actionLabel: args.actionLabel?.slice(0, 50),
      readAt: undefined,
      dismissedAt: undefined,
      groupKey: args.groupKey?.slice(0, 200),
      groupCount: args.groupKey ? 1 : undefined,
      actorId: args.actorId,
      actorName: args.actorName?.slice(0, 100),
      actorAvatarUrl: args.actorAvatarUrl?.slice(0, 500),
      metadata,
      persistent: isPersistent,
      expiresAt,
      createdAt: now,
    });

    // ─── 7. Emit notification.site_sent event ────────────────────────────
    // This event is consumed by the Audit Log System for record-keeping.
    // The circuit breaker in onEvent prevents notification.* events from
    // triggering more site notifications (infinite loop prevention).
    await emitEvent(ctx, "notification.site_sent", "notification", {
      userId: args.userId,
      type: args.type,
      message,
      notificationKey: args.notificationKey,
      notificationId,
    });

    return notificationId;
  },
});

// ─── sendBulk ────────────────────────────────────────────────────────────────

/**
 * Send the same notification to multiple users.
 *
 * Used for admin-targeted notifications (e.g., "New User Registered")
 * where one event should create one notification per admin.
 *
 * Delegates to `send` via scheduler for each user. This ensures:
 *   - No duplicated logic (preference checking, grouping, event emission)
 *   - Each send is isolated in its own mutation for error resilience
 *   - Any future changes to `send` automatically apply to bulk sends
 */
export const sendBulk = internalMutation({
  args: sendBulkArgs,
  handler: async (ctx, args) => {
    const { userIds, ...notificationArgs } = args;

    let scheduled = 0;

    for (const userId of userIds) {
      // Delegate to the internal send function via scheduler.
      // Each send runs in its own mutation, checking preferences
      // and handling grouping independently per user.
      await ctx.scheduler.runAfter(
        0,
        internal.notifications.internals.send,
        {
          userId,
          ...notificationArgs,
        },
      );
      scheduled++;
    }

    return {
      scheduled,
      total: userIds.length,
    };
  },
});

// ─── onEvent ─────────────────────────────────────────────────────────────────

/**
 * Generic event handler invoked by the Event Dispatcher.
 *
 * This is the universal entry point for all site notifications. When an event
 * fires, the Event Dispatcher calls this handler if a listener is registered.
 *
 * Flow:
 *   1. Load the event record
 *   2. Parse event payload
 *   3. Look up notification type config(s) for the event code
 *   4. For each matching notification type:
 *      a. Determine recipient(s) based on recipientType
 *      b. Resolve actor info (name, avatar) from users table
 *      c. Interpolate message template with payload variables
 *      d. Build notification and send to each recipient
 *
 * Circuit breaker: notification.* events are NEVER processed here
 * (prevents infinite loops where notification creation triggers more notifications).
 */
export const onEvent = internalMutation({
  args: onEventArgs,
  handler: async (ctx, args) => {
    // ─── 1. Load event record ──────────────────────────────────────────
    const event = await ctx.db.get("events", args.eventId);
    if (!event) {
      console.warn(
        `[SiteNotification] Event ${args.eventId} not found. Skipping.`,
      );
      return;
    }

    // ─── Circuit breaker: skip notification.* events ───────────────────
    if (event.code.startsWith("notification.")) {
      return;
    }

    // ─── 2. Parse event payload ────────────────────────────────────────
    let payload: Record<string, unknown> = {};
    try {
      payload = JSON.parse(event.payload);
    } catch {
      console.warn(
        `[SiteNotification] Failed to parse payload for event ${event.code}. Using empty payload.`,
      );
    }

    // ─── 3. Look up notification type config(s) ────────────────────────
    const notificationKeys = EVENT_TO_NOTIFICATION_KEYS[event.code];
    if (!notificationKeys || notificationKeys.length === 0) {
      // No notification types defined for this event code
      return;
    }

    // ─── 4. Resolve actor info ─────────────────────────────────────────
    let actorName: string | undefined;
    let actorAvatarUrl: string | undefined;

    if (event.actorId) {
      // Try multiple lookup strategies for the actor
      let actorUser = await ctx.db
        .query("users")
        .withIndex("by_workosUserId", (q) =>
          q.eq("workosUserId", event.actorId!),
        )
        .unique();

      if (!actorUser) {
        actorUser = await ctx.db
          .query("users")
          .withIndex("by_clerkUserId", (q) =>
            q.eq("clerkUserId", event.actorId!),
          )
          .unique();
      }

      if (!actorUser) {
        try {
          actorUser = await ctx.db.get(event.actorId as any);
        } catch {
          // Invalid ID format
        }
      }

      if (actorUser) {
        actorName =
          actorUser.displayName ??
          [actorUser.firstName, actorUser.lastName]
            .filter(Boolean)
            .join(" ") ??
          actorUser.email;
        actorAvatarUrl =
          actorUser.avatarUrl ?? actorUser.profilePictureUrl;
      } else {
        actorName = "Deleted User";
      }
    }

    // ─── 5. Process each notification type ─────────────────────────────
    for (const notificationKey of notificationKeys) {
      const config = NOTIFICATION_TYPES[notificationKey];
      if (!config) continue;

      // ─── Determine recipients ────────────────────────────────────────
      const recipientIds: string[] = [];

      if (config.recipientType === "admin") {
        // All administrators
        const adminRole = await ctx.db
          .query("roles")
          .withIndex("by_slug", (q) => q.eq("slug", "administrator"))
          .unique();

        if (adminRole) {
          const admins = await ctx.db
            .query("users")
            .withIndex("by_roleId", (q) => q.eq("roleId", adminRole._id))
            .take(50); // Cap at 50 admins

          for (const admin of admins) {
            if (admin.status === "active") {
              recipientIds.push(getUserIdentifier(admin));
            }
          }
        }
      } else if (config.recipientType === "employee") {
        // Specific user from event payload (post author, uploader, etc.)
        const userId =
          (payload.authorWorkosId as string) ??
          (payload.authorId as string) ??
          (payload.uploadedByWorkosId as string) ??
          (payload.userId as string);

        if (userId) {
          recipientIds.push(userId);
        }
      } else if (config.recipientType === "customer") {
        // Specific affected user from event payload
        const userId =
          (payload.targetWorkosId as string) ??
          (payload.targetUserId as string) ??
          (payload.commentAuthorWorkosId as string) ??
          (payload.userId as string);

        if (userId) {
          recipientIds.push(userId);
        }
      }

      if (recipientIds.length === 0) {
        console.warn(
          `[SiteNotification] No recipients resolved for ${notificationKey} (event: ${event.code}).`,
        );
        continue;
      }

      // ─── Suppress self-notifications for info/success ────────────────
      // Don't notify a user about their own actions (for info/success types)
      const filteredRecipients =
        config.type === "info" || config.type === "success"
          ? recipientIds.filter((id) => id !== event.actorId)
          : recipientIds;

      if (filteredRecipients.length === 0) continue;

      // ─── Interpolate templates ───────────────────────────────────────
      const title = interpolateTemplate(config.name, payload);
      const message = interpolateTemplate(
        config.messageTemplate,
        payload,
      );
      const actionUrl = config.actionUrlTemplate
        ? interpolateTemplate(config.actionUrlTemplate, payload)
        : undefined;
      const groupKey = config.groupKeyTemplate
        ? interpolateTemplate(config.groupKeyTemplate, payload)
        : undefined;

      // ─── Send to each recipient ──────────────────────────────────────
      for (const recipientId of filteredRecipients) {
        // Use ctx.scheduler to call the internal send function
        // This keeps each send in its own mutation for better error isolation
        await ctx.scheduler.runAfter(
          0,
          internal.notifications.internals.send,
          {
            userId: recipientId,
            notificationKey,
            eventCode: event.code,
            eventId: args.eventId,
            type: config.type,
            title,
            message,
            icon: config.icon,
            actionUrl,
            actionLabel: config.actionLabel,
            actorId: event.actorId,
            actorName,
            actorAvatarUrl,
            metadata: event.payload, // Pass the raw event payload as metadata
            persistent: config.persistent,
            groupKey,
          },
        );
      }
    }
  },
});

// ─── markAllReadBatch ─────────────────────────────────────────────────────────

/**
 * Internal batch continuation for markAllRead.
 *
 * Called by the public markAllRead mutation when there are more than 100
 * unread notifications. Continues processing in batches of 100 without
 * requiring auth context (userId is passed explicitly).
 */
export const markAllReadBatch = internalMutation({
  args: markAllReadBatchArgs,
  handler: async (ctx, args) => {
    const now = Date.now();

    const unreadNotifications = await ctx.db
      .query("siteNotifications")
      .withIndex("by_user_unread", (q) =>
        q.eq("userId", args.userId).eq("readAt", undefined),
      )
      .take(100);

    let toMark = unreadNotifications.filter(
      (n) => n.dismissedAt === undefined,
    );

    if (args.beforeTimestamp !== undefined) {
      toMark = toMark.filter(
        (n) => n.createdAt <= args.beforeTimestamp!,
      );
    }

    for (const notification of toMark) {
      await ctx.db.patch("siteNotifications", notification._id, { readAt: now });
    }

    // Continue if there may be more
    if (unreadNotifications.length === 100) {
      await ctx.scheduler.runAfter(
        0,
        internal.notifications.internals.markAllReadBatch,
        {
          userId: args.userId,
          beforeTimestamp: args.beforeTimestamp,
        },
      );
    }
  },
});

// ─── cleanupExpired ──────────────────────────────────────────────────────────

/**
 * Delete expired non-persistent notifications.
 *
 * Queries the by_expires index for notifications with expiresAt < now.
 * Deletes in batches of 100. Schedules continuation if more remain.
 *
 * This function is meant to be called by a daily cron job.
 * Does NOT emit events to avoid recursion.
 */
export const cleanupExpired = internalMutation({
  args: cleanupExpiredArgs,
  handler: async (ctx) => {
    const now = Date.now();

    const expiredNotifications = await ctx.db
      .query("siteNotifications")
      .withIndex("by_expires", (q) => q.lt("expiresAt", now))
      .take(CLEANUP_BATCH_SIZE);

    if (expiredNotifications.length === 0) return;

    // Delete batch
    for (const notification of expiredNotifications) {
      await ctx.db.delete("siteNotifications", notification._id);
    }

    // Schedule continuation if there may be more
    if (expiredNotifications.length === CLEANUP_BATCH_SIZE) {
      await ctx.scheduler.runAfter(
        0,
        internal.notifications.internals.cleanupBatch,
        { deletedSoFar: expiredNotifications.length },
      );
    }
  },
});

// ─── cleanupBatch ────────────────────────────────────────────────────────────

/**
 * Batch continuation for cleanup of expired notifications.
 *
 * Scheduled by cleanupExpired when more than CLEANUP_BATCH_SIZE
 * entries need to be cleaned up. Continues until no more expired
 * entries remain.
 */
export const cleanupBatch = internalMutation({
  args: cleanupBatchArgs,
  handler: async (ctx, args) => {
    const now = Date.now();

    const expiredNotifications = await ctx.db
      .query("siteNotifications")
      .withIndex("by_expires", (q) => q.lt("expiresAt", now))
      .take(CLEANUP_BATCH_SIZE);

    if (expiredNotifications.length === 0) return;

    for (const notification of expiredNotifications) {
      await ctx.db.delete("siteNotifications", notification._id);
    }

    const totalDeleted = args.deletedSoFar + expiredNotifications.length;

    if (expiredNotifications.length === CLEANUP_BATCH_SIZE) {
      await ctx.scheduler.runAfter(
        0,
        internal.notifications.internals.cleanupBatch,
        { deletedSoFar: totalDeleted },
      );
    }
  },
});

// ─── bootstrapPreferences ────────────────────────────────────────────────────

/**
 * Seed default notification preferences for a new user.
 *
 * Called when a user registers. Creates preference records for all 30
 * notification types with their default values from NOTIFICATION_TYPES.
 *
 * This ensures every user has a complete set of preferences that they
 * can later customize.
 */
export const bootstrapPreferences = internalMutation({
  args: bootstrapPreferencesArgs,
  handler: async (ctx, args) => {
    const now = Date.now();

    // Check if preferences already exist (idempotent)
    const existing = await ctx.db
      .query("notificationPreferences")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();

    if (existing) {
      // Preferences already bootstrapped for this user
      return;
    }

    // Create a preference record for each notification type
    for (const config of Object.values(NOTIFICATION_TYPES)) {
      await ctx.db.insert("notificationPreferences", {
        userId: args.userId,
        notificationKey: config.key,
        siteEnabled: config.defaultSiteEnabled,
        toastEnabled: config.defaultToastEnabled,
        updatedAt: now,
      });
    }
  },
});

// ─── sendTestNotification ─────────────────────────────────────────────────────

/**
 * Send a real test notification to the requesting admin user.
 *
 * Creates a real notification record via the internal `send` function
 * so it flows through the full pipeline (preferences, grouping, etc.)
 * and appears in the bell immediately.
 *
 * Requires Administrator role.
 */
export const sendTestNotification = internalMutation({
  args: sendTestNotificationArgs,
  handler: async (ctx, args) => {
    const now = Date.now();

    // Create a real test notification via the send pipeline
    const notificationId = await ctx.db.insert("siteNotifications", {
      userId: args.userId,
      notificationKey: "settings_updated",
      eventCode: "test.notification",
      type: "info",
      title: "Test Notification",
      message:
        "This is a test notification to verify delivery is working correctly. It was triggered manually from Notification Settings.",
      icon: "Bell",
      actionUrl: "/admin/settings/notifications",
      actionLabel: "View Settings",
      readAt: undefined,
      dismissedAt: undefined,
      groupKey: undefined,
      groupCount: undefined,
      actorId: args.userId,
      actorName: args.actorName,
      actorAvatarUrl: undefined,
      metadata: undefined,
      persistent: false,
      expiresAt: now + 30 * 24 * 60 * 60 * 1000, // 30 days
      createdAt: now,
    });

    return notificationId;
  },
});
