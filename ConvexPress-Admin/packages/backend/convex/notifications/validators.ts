/**
 * Site Notification System - Shared Validators
 *
 * Convex argument validators used by queries, mutations, and internal functions.
 * Also defines the 30 notification keys as constants and the notification type
 * configuration registry (NOTIFICATION_TYPES).
 *
 * The notification keys map 1:1 with CMS events. Each has:
 *   - key: Snake_case identifier
 *   - name: Human-readable display name
 *   - category: UI grouping category
 *   - eventCode: Source event code
 *   - type: Visual type (info/success/warning/error)
 *   - recipientType: Who receives it (admin/employee/customer)
 *   - persistent: Whether it auto-expires
 *   - defaultSiteEnabled/defaultToastEnabled: Default preference values
 *   - icon: Lucide icon name
 *   - messageTemplate: Template with {variable} placeholders
 *   - actionUrlTemplate: URL template (optional)
 *   - actionLabel: Button label (optional)
 *   - groupKeyTemplate: Grouping key template (optional)
 */

import { v } from "convex/values";

// ─── Notification Type Validator ─────────────────────────────────────────────

/**
 * Validator for the 4 visual notification types.
 */
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const notificationTypeValidator = v.union(
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  v.literal("info"),
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  v.literal("success"),
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  v.literal("warning"),
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  v.literal("error"),
);

// ─── 30 Notification Keys ────────────────────────────────────────────────────

/**
 * All 30 notification key constants.
 * These are snake_case identifiers for each notification kind.
 */
export const NOTIFICATION_KEYS = {
  // Content (4)
  POST_PUBLISHED: "post_published",
  POST_SCHEDULED: "post_scheduled",
  POST_TRASHED: "post_trashed",
  POST_RESTORED: "post_restored",

  // Revisions (2)
  REVISION_CREATED: "revision_created",
  REVISION_RESTORED: "revision_restored",

  // Comments (6)
  NEW_COMMENT: "new_comment",
  PENDING_COMMENTS: "pending_comments",
  COMMENT_APPROVED: "comment_approved",
  COMMENT_REJECTED: "comment_rejected",
  COMMENT_REPLY: "comment_reply",
  COMMENT_FLAGGED: "comment_flagged",

  // Media (2)
  MEDIA_UPLOADED: "media_uploaded",
  MEDIA_DELETED: "media_deleted",

  // Users (2)
  NEW_USER_REGISTERED: "new_user_registered",
  USER_INVITED: "user_invited",

  // Security (4)
  LOGIN_NEW_LOCATION: "login_new_location",
  FAILED_LOGIN_ALERT: "failed_login_alert",
  PASSWORD_CHANGED: "password_changed",

  // Account (3)
  PROFILE_UPDATED: "profile_updated",
  AVATAR_CHANGED: "avatar_changed",
  ROLE_CHANGED: "role_changed",

  // System (2)
  MENU_UPDATED: "menu_updated",
  MENU_LOCATION_ASSIGNED: "menu_location_assigned",

  // Settings (2)
  SETTINGS_UPDATED: "settings_updated",
  PERMALINK_CHANGED: "permalink_changed",

  // Discovery (2)
  SEO_UPDATED: "seo_updated",
  SITEMAP_REGENERATED: "sitemap_regenerated",

  // Developer (2)
  API_KEY_CREATED: "api_key_created",
  WEBHOOK_FAILED: "webhook_failed",
} as const;

export type NotificationKey =
  (typeof NOTIFICATION_KEYS)[keyof typeof NOTIFICATION_KEYS];

/** Set of all valid notification keys for O(1) validation. */
export const NOTIFICATION_KEY_SET: Set<string> = new Set(
  Object.values(NOTIFICATION_KEYS),
);

/**
 * Validate that a string is a known notification key.
 */
export function isValidNotificationKey(key: string): boolean {
  return NOTIFICATION_KEY_SET.has(key);
}

// ─── Notification Categories ─────────────────────────────────────────────────

/**
 * Categories for UI grouping, in display order.
 */
export const NOTIFICATION_CATEGORIES = [
  "Content",
  "Comments",
  "Media",
  "Users",
  "Security",
  "Account",
  "System",
  "Discovery",
  "Developer",
] as const;

export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];

// ─── Notification Type Configuration ─────────────────────────────────────────

export interface NotificationTypeConfig {
  key: string;
  name: string;
  category: NotificationCategory;
  eventCode: string;
  type: "info" | "success" | "warning" | "error";
  recipientType: "admin" | "employee" | "customer";
  persistent: boolean;
  defaultSiteEnabled: boolean;
  defaultToastEnabled: boolean;
  icon: string;
  messageTemplate: string;
  actionUrlTemplate?: string;
  actionLabel?: string;
  groupKeyTemplate?: string;
}

/**
 * Complete registry of all 30 notification types.
 *
 * Each entry defines how a notification is built from an event:
 *   - messageTemplate: Variables like {postTitle}, {actorName} are interpolated at creation time
 *   - actionUrlTemplate: Variables like {postId} are interpolated at creation time
 *   - groupKeyTemplate: Variables like {postId} are interpolated; used to merge rapid-fire notifications
 */
export const NOTIFICATION_TYPES: Record<string, NotificationTypeConfig> = {
  // ─── Content ─────────────────────────────────────────────────────────────
  [NOTIFICATION_KEYS.POST_PUBLISHED]: {
    key: NOTIFICATION_KEYS.POST_PUBLISHED,
    name: "Post Published",
    category: "Content",
    eventCode: "post.published",
    type: "success",
    recipientType: "employee",
    persistent: false,
    defaultSiteEnabled: true,
    defaultToastEnabled: true,
    icon: "FileText",
    messageTemplate: 'Your post "{postTitle}" has been published.',
    actionUrlTemplate: "/admin/posts/{postId}/edit",
    actionLabel: "View Post",
  },
  [NOTIFICATION_KEYS.POST_SCHEDULED]: {
    key: NOTIFICATION_KEYS.POST_SCHEDULED,
    name: "Post Scheduled",
    category: "Content",
    eventCode: "post.scheduled",
    type: "info",
    recipientType: "employee",
    persistent: true,
    defaultSiteEnabled: true,
    defaultToastEnabled: true,
    icon: "Clock",
    messageTemplate: 'Your post "{postTitle}" is scheduled for publication.',
    actionUrlTemplate: "/admin/posts/{postId}/edit",
    actionLabel: "View Post",
  },
  [NOTIFICATION_KEYS.POST_TRASHED]: {
    key: NOTIFICATION_KEYS.POST_TRASHED,
    name: "Post Trashed",
    category: "Content",
    eventCode: "post.trashed",
    type: "warning",
    recipientType: "employee",
    persistent: false,
    defaultSiteEnabled: true,
    defaultToastEnabled: true,
    icon: "Trash2",
    messageTemplate: 'Your post "{postTitle}" was moved to trash.',
    actionUrlTemplate: "/admin/posts?status=trash",
    actionLabel: "View Trash",
  },
  [NOTIFICATION_KEYS.POST_RESTORED]: {
    key: NOTIFICATION_KEYS.POST_RESTORED,
    name: "Post Restored",
    category: "Content",
    eventCode: "post.restored",
    type: "success",
    recipientType: "employee",
    persistent: false,
    defaultSiteEnabled: true,
    defaultToastEnabled: true,
    icon: "RotateCcw",
    messageTemplate: 'Your post "{postTitle}" has been restored from trash.',
    actionUrlTemplate: "/admin/posts/{postId}/edit",
    actionLabel: "View Post",
  },

  // ─── Revisions ───────────────────────────────────────────────────────────
  [NOTIFICATION_KEYS.REVISION_CREATED]: {
    key: NOTIFICATION_KEYS.REVISION_CREATED,
    name: "Revision Created",
    category: "Content",
    eventCode: "revision.created",
    type: "info",
    recipientType: "employee",
    persistent: false,
    defaultSiteEnabled: true,
    defaultToastEnabled: false,
    icon: "History",
    messageTemplate:
      '{actorName} created a new revision for "{postTitle}".',
    actionUrlTemplate: "/admin/posts/{postId}/edit",
    actionLabel: "View Post",
    groupKeyTemplate: "revision.created:{postId}",
  },
  [NOTIFICATION_KEYS.REVISION_RESTORED]: {
    key: NOTIFICATION_KEYS.REVISION_RESTORED,
    name: "Revision Restored",
    category: "Content",
    eventCode: "revision.restored",
    type: "warning",
    recipientType: "employee",
    persistent: true,
    defaultSiteEnabled: true,
    defaultToastEnabled: true,
    icon: "History",
    messageTemplate:
      '{actorName} restored an older revision for "{postTitle}".',
    actionUrlTemplate: "/admin/posts/{postId}/edit",
    actionLabel: "View Post",
  },

  // ─── Comments ────────────────────────────────────────────────────────────
  [NOTIFICATION_KEYS.NEW_COMMENT]: {
    key: NOTIFICATION_KEYS.NEW_COMMENT,
    name: "New Comment",
    category: "Comments",
    eventCode: "comment.created",
    type: "info",
    recipientType: "employee",
    persistent: true,
    defaultSiteEnabled: true,
    defaultToastEnabled: true,
    icon: "MessageSquare",
    messageTemplate:
      '{actorName} commented on your post "{postTitle}".',
    actionUrlTemplate: "/admin/comments?post={postId}",
    actionLabel: "View Comment",
    groupKeyTemplate: "comment.created:{postId}",
  },
  [NOTIFICATION_KEYS.PENDING_COMMENTS]: {
    key: NOTIFICATION_KEYS.PENDING_COMMENTS,
    name: "Pending Comments",
    category: "Comments",
    eventCode: "comment.created",
    type: "info",
    recipientType: "admin",
    persistent: true,
    defaultSiteEnabled: true,
    defaultToastEnabled: true,
    icon: "MessageSquareDashed",
    messageTemplate: "A new comment is awaiting moderation.",
    actionUrlTemplate: "/admin/comments?status=pending",
    actionLabel: "Moderate",
    groupKeyTemplate: "comment.pending:global",
  },
  [NOTIFICATION_KEYS.COMMENT_APPROVED]: {
    key: NOTIFICATION_KEYS.COMMENT_APPROVED,
    name: "Comment Approved",
    category: "Comments",
    eventCode: "comment.approved",
    type: "success",
    recipientType: "customer",
    persistent: false,
    defaultSiteEnabled: true,
    defaultToastEnabled: true,
    icon: "CheckCircle",
    messageTemplate:
      'Your comment on "{postTitle}" has been approved.',
    actionUrlTemplate: "/posts/{postSlug}#comment-{commentId}",
    actionLabel: "View Comment",
  },
  [NOTIFICATION_KEYS.COMMENT_REJECTED]: {
    key: NOTIFICATION_KEYS.COMMENT_REJECTED,
    name: "Comment Rejected",
    category: "Comments",
    eventCode: "comment.rejected",
    type: "warning",
    recipientType: "customer",
    persistent: false,
    defaultSiteEnabled: true,
    defaultToastEnabled: false,
    icon: "XCircle",
    messageTemplate:
      'Your comment on "{postTitle}" was not approved.',
  },
  [NOTIFICATION_KEYS.COMMENT_REPLY]: {
    key: NOTIFICATION_KEYS.COMMENT_REPLY,
    name: "Comment Reply",
    category: "Comments",
    eventCode: "comment.replied",
    type: "info",
    recipientType: "customer",
    persistent: true,
    defaultSiteEnabled: true,
    defaultToastEnabled: true,
    icon: "Reply",
    messageTemplate:
      '{actorName} replied to your comment on "{postTitle}".',
    actionUrlTemplate: "/posts/{postSlug}#comment-{commentId}",
    actionLabel: "View Reply",
    groupKeyTemplate: "comment.replied:{parentCommentId}",
  },
  [NOTIFICATION_KEYS.COMMENT_FLAGGED]: {
    key: NOTIFICATION_KEYS.COMMENT_FLAGGED,
    name: "Comment Flagged",
    category: "Comments",
    eventCode: "comment.flagged",
    type: "warning",
    recipientType: "admin",
    persistent: true,
    defaultSiteEnabled: true,
    defaultToastEnabled: true,
    icon: "Flag",
    messageTemplate: "A comment has been flagged for review.",
    actionUrlTemplate: "/admin/comments?status=flagged",
    actionLabel: "Review",
    groupKeyTemplate: "comment.flagged:global",
  },

  // ─── Media ───────────────────────────────────────────────────────────────
  [NOTIFICATION_KEYS.MEDIA_UPLOADED]: {
    key: NOTIFICATION_KEYS.MEDIA_UPLOADED,
    name: "Media Uploaded",
    category: "Media",
    eventCode: "media.uploaded",
    type: "success",
    recipientType: "employee",
    persistent: false,
    defaultSiteEnabled: true,
    defaultToastEnabled: false,
    icon: "Upload",
    messageTemplate: 'File "{fileName}" has been uploaded.',
    actionUrlTemplate: "/admin/media/{mediaId}",
    actionLabel: "View Media",
    groupKeyTemplate: "media.uploaded:{userId}",
  },
  [NOTIFICATION_KEYS.MEDIA_DELETED]: {
    key: NOTIFICATION_KEYS.MEDIA_DELETED,
    name: "Media Deleted",
    category: "Media",
    eventCode: "media.deleted",
    type: "info",
    recipientType: "employee",
    persistent: false,
    defaultSiteEnabled: true,
    defaultToastEnabled: false,
    icon: "Trash2",
    messageTemplate: 'File "{fileName}" has been deleted.',
    groupKeyTemplate: "media.deleted:{userId}",
  },

  // ─── Users ───────────────────────────────────────────────────────────────
  [NOTIFICATION_KEYS.NEW_USER_REGISTERED]: {
    key: NOTIFICATION_KEYS.NEW_USER_REGISTERED,
    name: "New User Registered",
    category: "Users",
    eventCode: "registration.user_registered",
    type: "info",
    recipientType: "admin",
    persistent: false,
    defaultSiteEnabled: true,
    defaultToastEnabled: true,
    icon: "UserPlus",
    messageTemplate: "{userName} has registered a new account.",
    actionUrlTemplate: "/admin/users/{userId}",
    actionLabel: "View User",
    groupKeyTemplate: "registration.user_registered:global",
  },
  [NOTIFICATION_KEYS.USER_INVITED]: {
    key: NOTIFICATION_KEYS.USER_INVITED,
    name: "User Invited",
    category: "Users",
    eventCode: "registration.user_invited",
    type: "success",
    recipientType: "admin",
    persistent: false,
    defaultSiteEnabled: true,
    defaultToastEnabled: false,
    icon: "Mail",
    messageTemplate: "An invitation has been sent to {email}.",
  },

  // ─── Security ────────────────────────────────────────────────────────────
  [NOTIFICATION_KEYS.LOGIN_NEW_LOCATION]: {
    key: NOTIFICATION_KEYS.LOGIN_NEW_LOCATION,
    name: "Login from New Location",
    category: "Security",
    eventCode: "auth.login",
    type: "warning",
    recipientType: "customer",
    persistent: true,
    defaultSiteEnabled: true,
    defaultToastEnabled: true,
    icon: "MapPin",
    messageTemplate:
      "A new login was detected from {location}.",
  },
  [NOTIFICATION_KEYS.FAILED_LOGIN_ALERT]: {
    key: NOTIFICATION_KEYS.FAILED_LOGIN_ALERT,
    name: "Failed Login Alert",
    category: "Security",
    eventCode: "auth.login_failed",
    type: "error",
    recipientType: "customer",
    persistent: true,
    defaultSiteEnabled: true,
    defaultToastEnabled: true,
    icon: "ShieldAlert",
    messageTemplate:
      "Multiple failed login attempts detected for your account.",
    groupKeyTemplate: "auth.login_failed:{email}",
  },
  [NOTIFICATION_KEYS.PASSWORD_CHANGED]: {
    key: NOTIFICATION_KEYS.PASSWORD_CHANGED,
    name: "Password Changed",
    category: "Security",
    eventCode: "password.changed",
    type: "success",
    recipientType: "customer",
    persistent: false,
    defaultSiteEnabled: true,
    defaultToastEnabled: true,
    icon: "KeyRound",
    messageTemplate: "Your password has been changed successfully.",
  },

  // ─── Account ─────────────────────────────────────────────────────────────
  [NOTIFICATION_KEYS.PROFILE_UPDATED]: {
    key: NOTIFICATION_KEYS.PROFILE_UPDATED,
    name: "Profile Updated",
    category: "Account",
    eventCode: "profile.updated",
    type: "success",
    recipientType: "customer",
    persistent: false,
    defaultSiteEnabled: true,
    defaultToastEnabled: false,
    icon: "User",
    messageTemplate: "Your profile has been updated.",
    actionUrlTemplate: "/dashboard/profile",
    actionLabel: "View Profile",
  },
  [NOTIFICATION_KEYS.AVATAR_CHANGED]: {
    key: NOTIFICATION_KEYS.AVATAR_CHANGED,
    name: "Avatar Changed",
    category: "Account",
    eventCode: "profile.avatar_changed",
    type: "success",
    recipientType: "customer",
    persistent: false,
    defaultSiteEnabled: true,
    defaultToastEnabled: false,
    icon: "Image",
    messageTemplate: "Your avatar has been updated.",
    actionUrlTemplate: "/dashboard/profile",
    actionLabel: "View Profile",
  },
  [NOTIFICATION_KEYS.ROLE_CHANGED]: {
    key: NOTIFICATION_KEYS.ROLE_CHANGED,
    name: "Role Changed",
    category: "Account",
    eventCode: "role.assigned",
    type: "info",
    recipientType: "customer",
    persistent: true,
    defaultSiteEnabled: true,
    defaultToastEnabled: true,
    icon: "Shield",
    messageTemplate:
      "Your role has been changed to {roleName}.",
  },

  // ─── System ──────────────────────────────────────────────────────────────
  [NOTIFICATION_KEYS.MENU_UPDATED]: {
    key: NOTIFICATION_KEYS.MENU_UPDATED,
    name: "Menu Updated",
    category: "System",
    eventCode: "menu.updated",
    type: "success",
    recipientType: "admin",
    persistent: false,
    defaultSiteEnabled: true,
    defaultToastEnabled: false,
    icon: "Menu",
    messageTemplate: 'Menu "{menuName}" has been updated.',
    actionUrlTemplate: "/admin/menus/{menuId}",
    actionLabel: "View Menu",
    groupKeyTemplate: "menu.updated:{menuId}",
  },
  [NOTIFICATION_KEYS.MENU_LOCATION_ASSIGNED]: {
    key: NOTIFICATION_KEYS.MENU_LOCATION_ASSIGNED,
    name: "Menu Location Assigned",
    category: "System",
    eventCode: "menu.location_assigned",
    type: "info",
    recipientType: "admin",
    persistent: false,
    defaultSiteEnabled: true,
    defaultToastEnabled: false,
    icon: "MapPin",
    messageTemplate:
      'Menu "{menuName}" assigned to {locationName}.',
  },
  [NOTIFICATION_KEYS.SETTINGS_UPDATED]: {
    key: NOTIFICATION_KEYS.SETTINGS_UPDATED,
    name: "Settings Updated",
    category: "System",
    eventCode: "settings.updated",
    type: "info",
    recipientType: "admin",
    persistent: false,
    defaultSiteEnabled: true,
    defaultToastEnabled: true,
    icon: "Settings",
    messageTemplate: "{settingsGroup} settings have been updated.",
    groupKeyTemplate: "settings.updated:global",
  },
  [NOTIFICATION_KEYS.PERMALINK_CHANGED]: {
    key: NOTIFICATION_KEYS.PERMALINK_CHANGED,
    name: "Permalink Changed",
    category: "System",
    eventCode: "settings.permalinks_changed",
    type: "warning",
    recipientType: "admin",
    persistent: true,
    defaultSiteEnabled: true,
    defaultToastEnabled: true,
    icon: "Link",
    messageTemplate:
      "Permalink structure has been changed. This may affect existing URLs.",
  },

  // ─── Discovery ───────────────────────────────────────────────────────────
  [NOTIFICATION_KEYS.SEO_UPDATED]: {
    key: NOTIFICATION_KEYS.SEO_UPDATED,
    name: "SEO Updated",
    category: "Discovery",
    eventCode: "seo.meta_updated",
    type: "info",
    recipientType: "employee",
    persistent: false,
    defaultSiteEnabled: true,
    defaultToastEnabled: false,
    icon: "Search",
    messageTemplate: 'SEO settings updated for "{postTitle}".',
    actionUrlTemplate: "/admin/posts/{postId}/edit",
    actionLabel: "View Post",
    groupKeyTemplate: "seo.meta_updated:{postId}",
  },
  [NOTIFICATION_KEYS.SITEMAP_REGENERATED]: {
    key: NOTIFICATION_KEYS.SITEMAP_REGENERATED,
    name: "Sitemap Regenerated",
    category: "Discovery",
    eventCode: "seo.sitemap_generated",
    type: "success",
    recipientType: "admin",
    persistent: false,
    defaultSiteEnabled: true,
    defaultToastEnabled: false,
    icon: "Globe",
    messageTemplate: "The sitemap has been regenerated successfully.",
  },

  // ─── Developer ───────────────────────────────────────────────────────────
  [NOTIFICATION_KEYS.API_KEY_CREATED]: {
    key: NOTIFICATION_KEYS.API_KEY_CREATED,
    name: "API Key Created",
    category: "Developer",
    eventCode: "api.key_created",
    type: "info",
    recipientType: "admin",
    persistent: true,
    defaultSiteEnabled: true,
    defaultToastEnabled: true,
    icon: "Key",
    messageTemplate: 'A new API key "{keyName}" has been created.',
  },
  [NOTIFICATION_KEYS.WEBHOOK_FAILED]: {
    key: NOTIFICATION_KEYS.WEBHOOK_FAILED,
    name: "Webhook Failed",
    category: "Developer",
    eventCode: "api.webhook_triggered",
    type: "error",
    recipientType: "admin",
    persistent: true,
    defaultSiteEnabled: true,
    defaultToastEnabled: true,
    icon: "AlertTriangle",
    messageTemplate:
      'Webhook delivery to "{endpointUrl}" failed.',
    actionUrlTemplate: "/admin/settings/api",
    actionLabel: "View Webhooks",
    groupKeyTemplate: "api.webhook_triggered:{endpointId}",
  },
};

// ─── Event Code to Notification Key Mapping ──────────────────────────────────

/**
 * Maps event codes to the notification keys they trigger.
 * Some event codes trigger multiple notification keys (e.g., comment.created
 * triggers both new_comment for the post author and pending_comments for admins).
 */
export const EVENT_TO_NOTIFICATION_KEYS: Record<string, string[]> = {};

// Build the reverse mapping
for (const config of Object.values(NOTIFICATION_TYPES)) {
  if (!EVENT_TO_NOTIFICATION_KEYS[config.eventCode]) {
    EVENT_TO_NOTIFICATION_KEYS[config.eventCode] = [];
  }
  EVENT_TO_NOTIFICATION_KEYS[config.eventCode].push(config.key);
}

// ─── Query Argument Validators ───────────────────────────────────────────────

/**
 * Args for the list query (paginated user notifications).
 */
export const listArgs = {
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  type: v.optional(notificationTypeValidator),
  unreadOnly: v.optional(v.boolean()),
  limit: v.optional(v.number()),
  cursor: v.optional(v.number()),
};

/**
 * Args for the unreadCount query.
 */
export const unreadCountArgs = {};

/**
 * Args for the get query (single notification by ID).
 */
export const getArgs = {
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  notificationId: v.id("siteNotifications"),
};

/**
 * Args for the getPreferences query.
 */
export const getPreferencesArgs = {};

/**
 * Args for the getPreference query (single key).
 */
export const getPreferenceArgs = {
  notificationKey: v.string(),
};

/**
 * Args for the listAll query (admin view).
 */
export const listAllArgs = {
  userId: v.optional(v.string()),
  type: v.optional(notificationTypeValidator),
  notificationKey: v.optional(v.string()),
  limit: v.optional(v.number()),
  cursor: v.optional(v.number()),
};

// ─── Mutation Argument Validators ────────────────────────────────────────────

/**
 * Args for markRead mutation.
 */
export const markReadArgs = {
  notificationId: v.id("siteNotifications"),
};

/**
 * Args for markAllRead mutation.
 */
export const markAllReadArgs = {
  beforeTimestamp: v.optional(v.number()),
};

/**
 * Args for dismiss mutation.
 */
export const dismissArgs = {
  notificationId: v.id("siteNotifications"),
};

/**
 * Args for dismissAll mutation (dismiss all read notifications).
 */
export const dismissAllArgs = {};

/**
 * Args for updatePreferences mutation.
 */
export const updatePreferencesArgs = {
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  preferences: v.array(
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    v.object({
      notificationKey: v.string(),
      siteEnabled: v.boolean(),
      toastEnabled: v.boolean(),
    }),
  ),
};

/**
 * Args for bulkUpdatePreferences mutation.
 */
export const bulkUpdatePreferencesArgs = {
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  preferences: v.array(
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    v.object({
      notificationKey: v.string(),
      siteEnabled: v.boolean(),
      toastEnabled: v.boolean(),
    }),
  ),
};

// ─── Internal Function Argument Validators ────────────────────────────────────

/**
 * Args for the internal send function.
 */
export const sendArgs = {
  userId: v.string(),
  notificationKey: v.string(),
  eventCode: v.string(),
  eventId: v.optional(v.id("events")),
  type: notificationTypeValidator,
  title: v.string(),
  message: v.string(),
  icon: v.optional(v.string()),
  actionUrl: v.optional(v.string()),
  actionLabel: v.optional(v.string()),
  actorId: v.optional(v.string()),
  actorName: v.optional(v.string()),
  actorAvatarUrl: v.optional(v.string()),
  metadata: v.optional(v.string()),
  persistent: v.optional(v.boolean()),
  groupKey: v.optional(v.string()),
};

/**
 * Args for the internal sendBulk function.
 */
export const sendBulkArgs = {
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  userIds: v.array(v.string()),
  notificationKey: v.string(),
  eventCode: v.string(),
  eventId: v.optional(v.id("events")),
  type: notificationTypeValidator,
  title: v.string(),
  message: v.string(),
  icon: v.optional(v.string()),
  actionUrl: v.optional(v.string()),
  actionLabel: v.optional(v.string()),
  actorId: v.optional(v.string()),
  actorName: v.optional(v.string()),
  actorAvatarUrl: v.optional(v.string()),
  metadata: v.optional(v.string()),
  persistent: v.optional(v.boolean()),
  groupKey: v.optional(v.string()),
};

/**
 * Args for the internal onEvent handler.
 */
export const onEventArgs = {
  eventId: v.id("events"),
};

/**
 * Args for the internal cleanupExpired function.
 */
export const cleanupExpiredArgs = {};

/**
 * Args for the internal cleanupBatch continuation.
 */
export const cleanupBatchArgs = {
  deletedSoFar: v.number(),
};

/**
 * Args for the internal markAllReadBatch continuation.
 */
export const markAllReadBatchArgs = {
  userId: v.string(),
  beforeTimestamp: v.optional(v.number()),
};

/**
 * Args for the internal bootstrapPreferences function.
 */
export const bootstrapPreferencesArgs = {
  userId: v.string(),
};

/**
 * Args for the internal sendTestNotification function.
 */
export const sendTestNotificationArgs = {
  userId: v.string(),
  actorName: v.optional(v.string()),
};
