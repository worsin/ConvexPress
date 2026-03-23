/**
 * Email Notification System - Frontend Constants
 *
 * Template slugs, categories, status mappings, and label definitions
 * mirrored from the backend for use in admin UI components.
 */

import type { EmailStatus, EmailPriority, EmailCategory } from "./types";

// ─── Template Slug Constants ────────────────────────────────────────────────

export const EMAIL_TEMPLATES = {
  // Registration
  WELCOME: "welcome-email",
  VERIFICATION: "email-verification",
  NEW_USER_ADMIN: "new-user-admin",
  INVITATION: "user-invitation",

  // Security
  LOGIN_NEW_DEVICE: "login-new-device",
  FAILED_LOGIN: "failed-login-attempts",
  PASSWORD_RESET: "password-reset-request",
  PASSWORD_CHANGED: "password-changed",

  // Content
  POST_PUBLISHED_AUTHOR: "post-published-author",
  POST_PUBLISHED_SUBSCRIBERS: "post-published-subscribers",
  POST_SCHEDULED: "post-scheduled-reminder",

  // Comments
  NEW_COMMENT_AUTHOR: "new-comment-author",
  COMMENT_MODERATION: "comment-pending-moderation",
  COMMENT_APPROVED: "comment-approved",
  COMMENT_REPLY: "comment-reply",
  COMMENT_DIGEST: "comment-digest",

  // Role & Account
  ROLE_CHANGED: "role-changed",
  ACCOUNT_DEACTIVATED: "account-deactivated",
  USER_DELETION: "user-deletion-confirmation",

  // System
  REVISION_RESTORED: "revision-restored-alert",
  MEDIA_STORAGE: "media-storage-warning",
  SETTINGS_CHANGED: "settings-changed-alert",
  SITEMAP_GENERATED: "sitemap-generated",
  WEBHOOK_FAILURE: "webhook-failure-alert",

  // Digest
  WEEKLY_DIGEST: "weekly-content-digest",
} as const;

// ─── Unsubscribe Categories ─────────────────────────────────────────────────

export const UNSUBSCRIBE_CATEGORIES = {
  CONTENT: "content",
  COMMENT: "comment",
  SECURITY: "security",
  SYSTEM: "system",
  DIGEST: "digest",
  ALL: "all",
} as const;

// ─── Security-Critical Templates ────────────────────────────────────────────

export const SECURITY_CRITICAL_TEMPLATES = [
  "password-reset-request",
  "password-changed",
  "account-deactivated",
  "user-deletion-confirmation",
  "failed-login-attempts",
] as const;

// ─── Status Labels & Colors ─────────────────────────────────────────────────

export const EMAIL_STATUS_CONFIG: Record<
  EmailStatus,
  { label: string; className: string }
> = {
  queued: {
    label: "Queued",
    className: "bg-warning/10 text-warning border-warning/20",
  },
  sending: {
    label: "Sending",
    className: "bg-primary/10 text-primary border-primary/20",
  },
  sent: {
    label: "Sent",
    className: "bg-success/10 text-success border-success/20",
  },
  delivered: {
    label: "Delivered",
    className: "bg-success/10 text-success border-success/20",
  },
  bounced: {
    label: "Bounced",
    className: "bg-warning/10 text-warning border-warning/20",
  },
  failed: {
    label: "Failed",
    className: "bg-destructive/10 text-destructive border-destructive/20",
  },
  cancelled: {
    label: "Cancelled",
    className: "bg-black/5 text-muted-foreground border-border",
  },
};

// ─── Priority Labels ────────────────────────────────────────────────────────

export const EMAIL_PRIORITY_CONFIG: Record<
  EmailPriority,
  { label: string; className: string }
> = {
  immediate: {
    label: "Immediate",
    className: "bg-primary/10 text-primary border-primary/20",
  },
  batched: {
    label: "Batched",
    className: "bg-warning/10 text-warning border-warning/20",
  },
  digest: {
    label: "Digest",
    className: "bg-muted text-muted-foreground border-border",
  },
};

// ─── Category Labels ────────────────────────────────────────────────────────

export const EMAIL_CATEGORY_CONFIG: Record<
  EmailCategory,
  { label: string; className: string }
> = {
  registration: {
    label: "Registration",
    className: "bg-primary/10 text-primary border-primary/20",
  },
  content: {
    label: "Content",
    className: "bg-success/10 text-success border-success/20",
  },
  comment: {
    label: "Comment",
    className: "bg-warning/10 text-warning border-warning/20",
  },
  security: {
    label: "Security",
    className: "bg-destructive/10 text-destructive border-destructive/20",
  },
  system: {
    label: "System",
    className: "bg-muted text-muted-foreground border-border",
  },
};

// ─── Category Filter Options ────────────────────────────────────────────────

export const CATEGORY_OPTIONS = [
  { label: "All Categories", value: "" },
  { label: "Registration", value: "registration" },
  { label: "Content", value: "content" },
  { label: "Comment", value: "comment" },
  { label: "Security", value: "security" },
  { label: "System", value: "system" },
];

// ─── Status Filter Options ──────────────────────────────────────────────────

export const STATUS_OPTIONS = [
  { label: "All Statuses", value: "" },
  { label: "Queued", value: "queued" },
  { label: "Sending", value: "sending" },
  { label: "Sent", value: "sent" },
  { label: "Delivered", value: "delivered" },
  { label: "Bounced", value: "bounced" },
  { label: "Failed", value: "failed" },
  { label: "Cancelled", value: "cancelled" },
];
