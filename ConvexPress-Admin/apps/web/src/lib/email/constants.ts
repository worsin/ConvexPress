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

  // Commerce returns
  RETURN_REQUESTED_ADMIN: "commerce-return-requested-admin",
  RETURN_APPROVED: "commerce-return-approved",
  RETURN_REJECTED: "commerce-return-rejected",
  RETURN_LABEL_ADDED: "commerce-return-label-added",
  RETURN_REFUNDED: "commerce-return-refunded",
  RETURN_REFUND_FAILED: "commerce-return-refund-failed",

  // Support / tickets
  TICKET_REPLY_NOTIFICATION: "ticket_reply_notification",
  TICKET_USER_REPLY: "ticket_user_reply",
  TICKET_ASSIGNED: "ticket_assigned",
  TICKET_RESOLVED: "ticket_resolved",

  // Knowledge base
  KB_WORKFLOW_STEP_READY: "kb_workflow_step_ready",
  KB_WORKFLOW_APPROVED: "kb_workflow_approved",
  KB_WORKFLOW_REJECTED: "kb_workflow_rejected",
  KB_COMMENT_NOTIFICATION: "kb_comment_notification",

  // Shipping
  SHIPPING_PICKED_UP: "shipping_picked_up",
  SHIPPING_OUT_FOR_DELIVERY: "shipping_out_for_delivery",
  SHIPPING_DELIVERED: "shipping_delivered",
  SHIPPING_EXCEPTION: "shipping_exception",
  SHIPPING_RETURNED: "shipping_returned",

  // Subscriptions
  SUBSCRIPTION_WELCOME: "subscription-welcome",
  SUBSCRIPTION_RENEWED: "subscription-renewed",
  SUBSCRIPTION_PAYMENT_FAILED: "subscription-payment-failed",
  SUBSCRIPTION_TRIAL_ENDING: "subscription-trial-ending",
  SUBSCRIPTION_CANCELLED: "subscription-cancelled",
  SUBSCRIPTION_PAUSED: "subscription-paused",

  // LMS
  LMS_COURSE_ENROLLED: "lms-course-enrolled",
  LMS_COURSE_UNENROLLED: "lms-course-unenrolled",
  LMS_COURSE_COMPLETED: "lms-course-completed",
  LMS_CERTIFICATE_ISSUED: "lms-certificate-issued",
  LMS_CERTIFICATE_REVOKED: "lms-certificate-revoked",
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
  support: {
    label: "Support",
    className: "bg-sky-500/10 text-sky-700 border-sky-500/20",
  },
  knowledge_base: {
    label: "Knowledge Base",
    className: "bg-amber-500/10 text-amber-700 border-amber-500/20",
  },
  commerce: {
    label: "Commerce",
    className: "bg-emerald-500/10 text-emerald-700 border-emerald-500/20",
  },
  shipping: {
    label: "Shipping",
    className: "bg-cyan-500/10 text-cyan-700 border-cyan-500/20",
  },
  subscription: {
    label: "Subscription",
    className: "bg-indigo-500/10 text-indigo-700 border-indigo-500/20",
  },
  lms: {
    label: "LMS",
    className: "bg-violet-500/10 text-violet-700 border-violet-500/20",
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
  { label: "Support", value: "support" },
  { label: "Knowledge Base", value: "knowledge_base" },
  { label: "Commerce", value: "commerce" },
  { label: "Shipping", value: "shipping" },
  { label: "Subscription", value: "subscription" },
  { label: "LMS", value: "lms" },
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
