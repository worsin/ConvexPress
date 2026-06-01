/**
 * Email Notification System - Frontend TypeScript Types
 *
 * Type definitions for email templates, queue items, statistics,
 * and user email preferences.
 */

// ─── Status & Priority Enums ────────────────────────────────────────────────

export type EmailStatus =
  | "queued"
  | "sending"
  | "sent"
  | "delivered"
  | "bounced"
  | "failed"
  | "cancelled";

export type EmailPriority = "immediate" | "batched" | "digest";

export type EmailRecipientType = "customer" | "employee" | "admin" | "custom";

export type EmailCategory =
  | "registration"
  | "content"
  | "comment"
  | "security"
  | "system"
  | "support"
  | "knowledge_base"
  | "commerce"
  | "shipping"
  | "subscription"
  | "lms";

export type EmailTemplateTriggerKind = "event" | "direct" | "digest" | "manual";

export type UnsubscribeCategory =
  | "content"
  | "comment"
  | "security"
  | "system"
  | "digest"
  | "all";

// ─── Email Template ─────────────────────────────────────────────────────────

export interface EmailTemplateListItem {
  _id: string;
  slug: string;
  name: string;
  description?: string;
  category: string;
  priority: EmailPriority;
  recipientType: EmailRecipientType;
  isActive: boolean;
  isCustomized: boolean;
  eventCode?: string;
  canonicalEventCode?: string;
  triggerKind?: EmailTemplateTriggerKind;
  lastSentAt?: number;
  totalSent: number;
  updatedAt: number;
}

export interface EmailTemplate extends EmailTemplateListItem {
  subjectTemplate: string;
  bodyHtml: string;
  bodyText?: string;
  preheaderText?: string;
  availableVariables: TemplateVariable[];
  defaultSubjectTemplate: string;
  defaultBodyHtml: string;
  createdAt: number;
}

export interface TemplateVariable {
  name: string;
  description: string;
  required: boolean;
  defaultValue?: string;
}

// ─── Email Queue ────────────────────────────────────────────────────────────

export interface EmailQueueListItem {
  _id: string;
  to: string;
  toName?: string;
  subject: string;
  templateSlug: string;
  status: EmailStatus;
  priority: EmailPriority;
  attempts: number;
  createdAt: number;
  sentAt?: number;
  lastError?: string;
  isTest?: boolean;
  testLabel?: string;
}

export interface EmailQueueDetail extends EmailQueueListItem {
  toUserId?: string;
  from: string;
  fromName: string;
  replyTo?: string;
  bodyHtml: string;
  bodyText?: string;
  templateVariables: Record<string, string>;
  scheduledFor?: number;
  resendId?: string;
  resendResponse?: string;
  maxAttempts: number;
  lastAttemptAt?: number;
  nextRetryAt?: number;
  eventId?: string;
  correlationId?: string;
  isTest?: boolean;
  testLabel?: string;
  testMetadata?: string;
  deliveredAt?: number;
  openedAt?: number;
  event?: {
    code: string;
    system: string;
    emittedAt: number;
  } | null;
}

// ─── Email Statistics ───────────────────────────────────────────────────────

export interface EmailStats {
  totalSent: number;
  totalFailed: number;
  totalBounced: number;
  totalQueued: number;
  byTemplate: Array<{
    slug: string;
    name: string;
    sent: number;
    failed: number;
  }>;
  byDay: Array<{
    date: string;
    sent: number;
    failed: number;
  }>;
}

// ─── Email Preferences ──────────────────────────────────────────────────────

export interface EmailPreferences {
  userId: string;
  unsubscribed: Array<{
    category: string;
    unsubscribedAt: number;
  }>;
  categories: Array<{
    category: string;
    label: string;
    description: string;
    isSubscribed: boolean;
    canUnsubscribe: boolean;
  }>;
}

// ─── Paginated Queue Result ─────────────────────────────────────────────────

export interface PaginatedQueueResult {
  emails: EmailQueueListItem[];
  total: number;
  page: number;
  perPage: number;
  totalPages: number;
}
