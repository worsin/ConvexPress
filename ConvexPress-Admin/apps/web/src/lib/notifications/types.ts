/**
 * Site Notification System - TypeScript Types
 *
 * Types matching the Convex schema shapes for UI consumption.
 * Used by notification components, hooks, and the admin settings page.
 */

/** Visual notification type (maps to color and Sonner function). */
export type NotificationType = "info" | "success" | "warning" | "error";

/** A single site notification as returned by the list query. */
export interface SiteNotification {
  _id: string;
  userId: string;
  notificationKey: string;
  eventCode: string;
  type: NotificationType;
  title: string;
  message: string;
  icon?: string;
  actionUrl?: string;
  actionLabel?: string;
  readAt?: number;
  groupKey?: string;
  groupCount?: number;
  actorId?: string;
  actorName?: string;
  actorAvatarUrl?: string;
  persistent: boolean;
  createdAt: number;
}

/** Result shape from the list query. */
export interface NotificationListResult {
  notifications: SiteNotification[];
  nextCursor?: number;
  hasMore: boolean;
}

/** A notification preference for a specific key (merged with defaults). */
export interface NotificationPreference {
  notificationKey: string;
  notificationName: string;
  category: string;
  type: string;
  icon: string;
  siteEnabled: boolean;
  toastEnabled: boolean;
}

/** A notification from the admin listAll query. */
export interface AdminNotification {
  _id: string;
  userId: string;
  notificationKey: string;
  eventCode: string;
  type: NotificationType;
  title: string;
  message: string;
  readAt?: number;
  dismissedAt?: number;
  groupCount?: number;
  actorName?: string;
  persistent: boolean;
  createdAt: number;
}

/** Result shape from the admin listAll query. */
export interface AdminNotificationListResult {
  notifications: AdminNotification[];
  nextCursor?: number;
  hasMore: boolean;
}
