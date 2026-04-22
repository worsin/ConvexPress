/**
 * Email Notification System - Shared Validators
 *
 * Convex argument validators used by queries, mutations, and internal functions.
 * These enforce type safety at the Convex argument level.
 */

import { v } from "convex/values";

// ─── Shared Type Validators ──────────────────────────────────────────────────

/**
 * Validator for email delivery priority.
 */
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const emailPriorityValidator = v.union(
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  v.literal("immediate"),
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  v.literal("batched"),
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  v.literal("digest"),
);

/**
 * Validator for email recipient type.
 */
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const emailRecipientTypeValidator = v.union(
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  v.literal("customer"),
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  v.literal("employee"),
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  v.literal("admin"),
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  v.literal("custom"),
);

/**
 * Validator for email queue status.
 */
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const emailStatusValidator = v.union(
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  v.literal("queued"),
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  v.literal("sending"),
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  v.literal("sent"),
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  v.literal("delivered"),
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  v.literal("bounced"),
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  v.literal("failed"),
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  v.literal("cancelled"),
);

/**
 * Validator for email template category.
 */
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const emailCategoryValidator = v.union(
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  v.literal("registration"),
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  v.literal("content"),
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  v.literal("comment"),
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  v.literal("security"),
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  v.literal("system"),
);

/**
 * Validator for unsubscribe category.
 */
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const unsubscribeCategoryValidator = v.union(
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  v.literal("content"),
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  v.literal("comment"),
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  v.literal("security"),
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  v.literal("system"),
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  v.literal("digest"),
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  v.literal("all"),
);

// ─── Query Argument Validators ───────────────────────────────────────────────

/**
 * Args for the listQueue query (paginated email queue).
 */
export const listQueueArgs = {
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  status: v.optional(emailStatusValidator),
  templateSlug: v.optional(v.string()),
  recipientEmail: v.optional(v.string()),
  dateFrom: v.optional(v.number()),
  dateTo: v.optional(v.number()),
  page: v.optional(v.number()),
  perPage: v.optional(v.number()),
};

/**
 * Args for the getEmail query (single queue item).
 */
export const getEmailArgs = {
  queueId: v.id("emailQueue"),
};

/**
 * Args for the listTemplates query.
 */
export const listTemplatesArgs = {
  category: v.optional(v.string()),
  isActive: v.optional(v.boolean()),
};

/**
 * Args for the getTemplate query.
 */
export const getTemplateArgs = {
  templateSlug: v.string(),
};

/**
 * Args for the stats query.
 */
export const statsArgs = {
  dateFrom: v.optional(v.number()),
  dateTo: v.optional(v.number()),
};

/**
 * Args for the getUserPreferences query.
 */
export const getUserPreferencesArgs = {
  userId: v.optional(v.string()),
};

// ─── Mutation Argument Validators ────────────────────────────────────────────

/**
 * Args for the updateTemplate mutation.
 */
export const updateTemplateArgs = {
  templateId: v.id("emailTemplates"),
  subjectTemplate: v.optional(v.string()),
  bodyHtml: v.optional(v.string()),
  bodyText: v.optional(v.string()),
  preheaderText: v.optional(v.string()),
  isActive: v.optional(v.boolean()),
};

/**
 * Args for the resetTemplate mutation.
 */
export const resetTemplateArgs = {
  templateId: v.id("emailTemplates"),
};

/**
 * Args for the retryEmail mutation.
 */
export const retryEmailArgs = {
  queueId: v.id("emailQueue"),
};

/**
 * Args for the cancelEmail mutation.
 */
export const cancelEmailArgs = {
  queueId: v.id("emailQueue"),
};

/**
 * Args for the updateUnsubscribe mutation.
 */
export const updateUnsubscribeArgs = {
  category: v.string(),
  subscribed: v.boolean(),
};

// ─── Internal Function Argument Validators ───────────────────────────────────

/**
 * Args for the internal queueEmail function.
 */
export const queueEmailInternalArgs = {
  templateSlug: v.string(),
  variables: v.string(),
  recipientEmail: v.string(),
  recipientName: v.optional(v.string()),
  recipientUserId: v.optional(v.string()),
  eventId: v.optional(v.id("events")),
  correlationId: v.optional(v.string()),
  scheduledFor: v.optional(v.number()),
};

/**
 * Args for the internal sendEmail action.
 */
export const sendEmailArgs = {
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  queueId: v.id("emailQueue"),
};

/**
 * Args for the internal markSent function.
 */
export const markSentArgs = {
  queueId: v.id("emailQueue"),
  resendId: v.string(),
  resendResponse: v.string(),
};

/**
 * Args for the internal handleSendFailure function.
 */
export const handleSendFailureArgs = {
  queueId: v.id("emailQueue"),
  error: v.string(),
  isRetryable: v.boolean(),
};

/**
 * Args for the internal updateQueueStatus function.
 */
export const updateQueueStatusArgs = {
  queueId: v.id("emailQueue"),
  status: v.string(),
};

/**
 * Args for the bootstrap seed templates function.
 */
export const bootstrapTemplatesArgs = {};

/**
 * Args for the cleanup function.
 */
export const cleanupArgs = {};

/**
 * Args for the process batched emails cron.
 */
export const processBatchedArgs = {};

/**
 * Args for the digest generation cron.
 */
export const generateDigestArgs = {};
