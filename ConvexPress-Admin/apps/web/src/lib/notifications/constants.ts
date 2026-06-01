/**
 * Site Notification System - Client-Side Constants
 *
 * Icon mappings, color mappings, and toast duration configuration
 * for rendering notifications in the admin UI.
 */

import type { NotificationType } from "./types";

/**
 * CSS color classes for each notification type.
 * Uses CSS variables only -- no hardcoded colors.
 */
export const NOTIFICATION_TYPE_COLORS: Record<NotificationType, string> = {
  info: "text-primary",
  success: "text-primary",
  warning: "text-foreground/60",
  error: "text-destructive",
};

/**
 * Background indicator classes for notification type badges.
 */
export const NOTIFICATION_TYPE_BG: Record<NotificationType, string> = {
  info: "bg-primary/10",
  success: "bg-primary/10",
  warning: "bg-foreground/5",
  error: "bg-destructive/10",
};

/**
 * Lucide icon name for each notification visual type (fallback when
 * the notification doesn't have a specific icon set).
 */
export const NOTIFICATION_TYPE_ICON_NAMES: Record<NotificationType, string> = {
  info: "Info",
  success: "CheckCircle",
  warning: "AlertTriangle",
  error: "XCircle",
};

/**
 * Sonner toast auto-dismiss durations per notification type (in milliseconds).
 */
export const TOAST_DURATIONS: Record<NotificationType, number> = {
  info: 5000,
  success: 4000,
  warning: 8000,
  error: 10000,
};

/**
 * Notification categories in display order.
 */
export const NOTIFICATION_CATEGORIES = [
  "Content",
  "Comments",
  "Media",
  "Users",
  "Security",
  "Account",
  "Support",
  "Knowledge Base",
  "Commerce",
  "LMS",
  "System",
  "Discovery",
  "Developer",
] as const;

export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];
