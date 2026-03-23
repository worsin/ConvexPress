/**
 * Site Notification System - Helper Functions
 *
 * Cross-system helpers for working with notifications:
 *
 *   - resolveNotificationRecipients: Resolve recipient type to user WorkOS IDs
 *   - shouldDeliver: Check user preferences before creating a notification
 *   - buildNotificationFromEvent: Map event data to notification fields
 *   - interpolateTemplate: Replace {variable} placeholders in templates
 *
 * These helpers are used by the notification internals and can be used by
 * other systems that need to interact with the notification system.
 *
 * Usage:
 *   import { resolveNotificationRecipients, shouldDeliver } from "../helpers/notification";
 */

import type { QueryCtx, MutationCtx } from "../_generated/server";
import {
  NOTIFICATION_TYPES,
  type NotificationTypeConfig,
} from "../notifications/validators";
import { getUserIdentifier } from "./permissions";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface NotificationRecipient {
  /** User identifier string (workosUserId, clerkUserId, or Convex _id) */
  userId: string;
  displayName?: string;
}

export interface NotificationBuildResult {
  title: string;
  message: string;
  type: "info" | "success" | "warning" | "error";
  icon?: string;
  actionUrl?: string;
  actionLabel?: string;
  groupKey?: string;
  persistent: boolean;
}

// ─── resolveNotificationRecipients ───────────────────────────────────────────

/**
 * Resolve a recipient type to a list of WorkOS user IDs.
 *
 * @param ctx - Query or mutation context
 * @param recipientType - "admin", "employee", or "customer"
 * @param payload - Event payload containing user references
 * @returns Array of WorkOS user IDs
 */
export async function resolveNotificationRecipients(
  ctx: QueryCtx | MutationCtx,
  recipientType: "admin" | "employee" | "customer",
  payload: Record<string, unknown>,
): Promise<string[]> {
  if (recipientType === "admin") {
    // All active administrators
    const adminRole = await ctx.db
      .query("roles")
      .withIndex("by_slug", (q) => q.eq("slug", "administrator"))
      .unique();

    if (!adminRole) return [];

    const admins = await ctx.db
      .query("users")
      .withIndex("by_roleId", (q) => q.eq("roleId", adminRole._id))
      .take(50);

    return admins
      .filter((u) => u.status === "active")
      .map((u) => getUserIdentifier(u));
  }

  if (recipientType === "employee") {
    // Specific user from payload (post author, uploader, etc.)
    const userId =
      (payload.authorWorkosId as string) ??
      (payload.authorId as string) ??
      (payload.uploadedByWorkosId as string) ??
      (payload.userId as string);

    return userId ? [userId] : [];
  }

  if (recipientType === "customer") {
    // Specific affected user from payload
    const userId =
      (payload.targetWorkosId as string) ??
      (payload.targetUserId as string) ??
      (payload.commentAuthorWorkosId as string) ??
      (payload.userId as string);

    return userId ? [userId] : [];
  }

  return [];
}

// ─── shouldDeliver ───────────────────────────────────────────────────────────

/**
 * Check if a notification should be delivered to a user based on their preferences.
 *
 * @param ctx - Query or mutation context
 * @param userId - WorkOS user ID of the recipient
 * @param notificationKey - The notification type key
 * @returns Object with siteEnabled and toastEnabled booleans
 */
export async function shouldDeliver(
  ctx: QueryCtx | MutationCtx,
  userId: string,
  notificationKey: string,
): Promise<{ siteEnabled: boolean; toastEnabled: boolean }> {
  // Look up saved preference
  const preference = await ctx.db
    .query("notificationPreferences")
    .withIndex("by_user_key", (q) =>
      q.eq("userId", userId).eq("notificationKey", notificationKey),
    )
    .unique();

  if (preference) {
    return {
      siteEnabled: preference.siteEnabled,
      toastEnabled: preference.toastEnabled,
    };
  }

  // Fall back to defaults from NOTIFICATION_TYPES
  const config = NOTIFICATION_TYPES[notificationKey];
  if (config) {
    return {
      siteEnabled: config.defaultSiteEnabled,
      toastEnabled: config.defaultToastEnabled,
    };
  }

  // Unknown key: default to enabled
  return { siteEnabled: true, toastEnabled: true };
}

// ─── buildNotificationFromEvent ──────────────────────────────────────────────

/**
 * Build notification fields from event data using the notification type config.
 *
 * Interpolates template variables with values from the event payload.
 * Returns all fields needed to create a notification record.
 *
 * @param eventCode - The event code (e.g., "post.published")
 * @param notificationKey - The notification type key
 * @param payload - Parsed event payload
 * @returns NotificationBuildResult or null if config not found
 */
export function buildNotificationFromEvent(
  eventCode: string,
  notificationKey: string,
  payload: Record<string, unknown>,
): NotificationBuildResult | null {
  const config = NOTIFICATION_TYPES[notificationKey];
  if (!config) return null;

  return {
    title: config.name,
    message: interpolateTemplate(config.messageTemplate, payload),
    type: config.type,
    icon: config.icon,
    actionUrl: config.actionUrlTemplate
      ? interpolateTemplate(config.actionUrlTemplate, payload)
      : undefined,
    actionLabel: config.actionLabel,
    groupKey: config.groupKeyTemplate
      ? interpolateTemplate(config.groupKeyTemplate, payload)
      : undefined,
    persistent: config.persistent,
  };
}

// ─── interpolateTemplate ─────────────────────────────────────────────────────

/**
 * Replace {variableName} placeholders in a template string with payload values.
 *
 * Unknown variables are left as-is (e.g., "{unknown}" stays as "{unknown}").
 * Values are converted to strings via String().
 *
 * @param template - Template string with {variable} placeholders
 * @param payload - Object with values to interpolate
 * @returns Interpolated string
 */
export function interpolateTemplate(
  template: string,
  payload: Record<string, unknown>,
): string {
  return template.replace(/\{(\w+)\}/g, (match, key) => {
    const value = payload[key];
    if (value !== undefined && value !== null) {
      return String(value);
    }
    return match;
  });
}

// ─── getNotificationConfig ───────────────────────────────────────────────────

/**
 * Get the notification type configuration for a given key.
 *
 * @param notificationKey - The notification type key
 * @returns NotificationTypeConfig or undefined if not found
 */
export function getNotificationConfig(
  notificationKey: string,
): NotificationTypeConfig | undefined {
  return NOTIFICATION_TYPES[notificationKey];
}
