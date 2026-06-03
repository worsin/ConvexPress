/**
 * Email Notification System - Core Helpers
 *
 * Utility functions shared across email system functions:
 *
 *   - renderTemplate: Replace {variables} in template strings
 *   - stripHtmlToText: Convert HTML to plain text for email fallback
 *   - checkUnsubscribed: Check if user has unsubscribed from category
 *   - isSecurityEmail: Check if email type cannot be unsubscribed
 *   - resolveRecipients: Resolve recipient type to email addresses
 *   - queueEmailForEvent: Universal event-to-email helper
 *   - isValidEmail: Basic email address validation
 *
 * Usage:
 *   import { renderTemplate, queueEmailForEvent } from "../helpers/email";
 */

import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import { getUserIdentifier } from "./permissions";

type ReadCtx = Pick<QueryCtx, "db">;

// ─── Constants ───────────────────────────────────────────────────────────────

/**
 * Template slugs that represent security-critical emails.
 * These CANNOT be unsubscribed -- they always send regardless of user preferences.
 */
export const SECURITY_CRITICAL_TEMPLATES = [
  "password-reset-request",
  "password-changed",
  "account-deactivated",
  "user-deletion-confirmation",
  "failed-login-attempts",
] as const;

/**
 * Template slug constants for type-safe references.
 */
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

  // Tickets / Support
  TICKET_REPLY_NOTIFICATION: "ticket_reply_notification",
  TICKET_USER_REPLY: "ticket_user_reply",
  TICKET_ASSIGNED: "ticket_assigned",
  TICKET_RESOLVED: "ticket_resolved",

  // Knowledge Base
  KB_WORKFLOW_STEP_READY: "kb_workflow_step_ready",
  KB_WORKFLOW_APPROVED: "kb_workflow_approved",
  KB_WORKFLOW_REJECTED: "kb_workflow_rejected",
  KB_COMMENT_NOTIFICATION: "kb_comment_notification",

  // Commerce Returns
  PURCHASE_RECEIPT: "purchase-receipt",
  PURCHASE_ADMIN_ALERT: "purchase-admin-alert",
  PURCHASE_PAYMENT_FAILED: "purchase-payment-failed",
  RETURN_REQUESTED_ADMIN: "commerce-return-requested-admin",
  RETURN_APPROVED: "commerce-return-approved",
  RETURN_REJECTED: "commerce-return-rejected",
  RETURN_LABEL_ADDED: "commerce-return-label-added",
  RETURN_REFUNDED: "commerce-return-refunded",
  RETURN_REFUND_FAILED: "commerce-return-refund-failed",

  // Digest
  WEEKLY_DIGEST: "weekly-content-digest",

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
  LMS_ENROLLMENT_EXPIRED: "lms-enrollment-expired",
  LMS_COURSE_COMPLETED: "lms-course-completed",
  LMS_CERTIFICATE_ISSUED: "lms-certificate-issued",
  LMS_CERTIFICATE_REVOKED: "lms-certificate-revoked",
} as const;

/**
 * Unsubscribe category constants.
 */
export const UNSUBSCRIBE_CATEGORIES = {
  CONTENT: "content",
  COMMENT: "comment",
  SECURITY: "security",
  SYSTEM: "system",
  DIGEST: "digest",
  ALL: "all",
} as const;

/**
 * Map from template category to unsubscribe category.
 */
const CATEGORY_TO_UNSUBSCRIBE: Record<string, string> = {
  registration: "system",
  content: "content",
  comment: "comment",
  security: "security",
  system: "system",
  support: "system",
  knowledge_base: "content",
  commerce: "system",
  shipping: "system",
  subscription: "system",
  lms: "content",
};

/**
 * Default email settings fallbacks (when settings system hasn't been configured).
 */
export const EMAIL_DEFAULTS = {
  from_address: "noreply@convexpress.com",
  from_name: "ConvexPress",
  reply_to: "support@convexpress.com",
  rate_limit: 50,
  daily_limit: 1000,
  batch_window: 15,
  enabled: true,
  unsubscribe_url: "/dashboard/settings",
} as const;

// ─── Template Rendering ──────────────────────────────────────────────────────

/**
 * Replace {variable_name} placeholders in a template string with actual values.
 *
 * Variables are enclosed in curly braces: {site_name}, {user_email}, etc.
 * Unresolved variables with a default value use the default.
 * Unresolved required variables are replaced with empty string.
 *
 * @param template - The template string with {variable} placeholders
 * @param variables - Key-value map of variable values
 * @returns The rendered string with variables replaced
 */
export function renderTemplate(
  template: string,
  variables: Record<string, string>,
): string {
  return template.replace(/\{(\w+)\}/g, (match, varName) => {
    if (varName in variables) {
      return variables[varName];
    }
    return match; // Leave unresolved variables as-is
  });
}

/**
 * Inject global variables that are available to all templates.
 * These are auto-resolved from context/settings and merged with
 * user-provided variables.
 */
export function injectGlobalVariables(
  variables: Record<string, string>,
  settings: {
    siteName?: string;
    siteUrl?: string;
    unsubscribeUrl?: string;
  },
  recipientName?: string,
): Record<string, string> {
  const now = new Date();
  return {
    site_name: settings.siteName ?? "ConvexPress",
    site_url: settings.siteUrl ?? "",
    current_year: String(now.getFullYear()),
    unsubscribe_url: settings.unsubscribeUrl ?? EMAIL_DEFAULTS.unsubscribe_url,
    recipient_name: recipientName ?? "",
    ...variables,
  };
}

// ─── HTML to Text ────────────────────────────────────────────────────────────

/**
 * Convert HTML to readable plain text for email fallback.
 * Handles common HTML elements like headers, paragraphs, links, and lists.
 *
 * @param html - HTML string to convert
 * @returns Plain text representation
 */
export function stripHtmlToText(html: string): string {
  let text = html;

  // Replace <br> and </p> with newlines
  text = text.replace(/<br\s*\/?>/gi, "\n");
  text = text.replace(/<\/p>/gi, "\n\n");
  text = text.replace(/<\/div>/gi, "\n");
  text = text.replace(/<\/h[1-6]>/gi, "\n\n");

  // Replace <li> with bullet points
  text = text.replace(/<li>/gi, "  - ");
  text = text.replace(/<\/li>/gi, "\n");

  // Replace <a> tags with "text (url)" format
  text = text.replace(
    /<a\s+[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gi,
    "$2 ($1)",
  );

  // Replace <strong> and <em> with text markers
  text = text.replace(/<\/?strong>/gi, "");
  text = text.replace(/<\/?em>/gi, "");
  text = text.replace(/<\/?b>/gi, "");
  text = text.replace(/<\/?i>/gi, "");

  // Strip remaining HTML tags
  text = text.replace(/<[^>]+>/g, "");

  // Decode common HTML entities
  text = text.replace(/&amp;/g, "&");
  text = text.replace(/&lt;/g, "<");
  text = text.replace(/&gt;/g, ">");
  text = text.replace(/&quot;/g, '"');
  text = text.replace(/&#39;/g, "'");
  text = text.replace(/&nbsp;/g, " ");

  // Clean up excessive whitespace
  text = text.replace(/[ \t]+/g, " ");
  text = text.replace(/\n{3,}/g, "\n\n");
  text = text.trim();

  return text;
}

// ─── Unsubscribe Checks ─────────────────────────────────────────────────────

/**
 * Check if a template slug is a security-critical email.
 * Security-critical emails cannot be unsubscribed.
 */
export function isSecurityEmail(templateSlug: string): boolean {
  return (SECURITY_CRITICAL_TEMPLATES as readonly string[]).includes(
    templateSlug,
  );
}

/**
 * Check if a user has unsubscribed from a specific email category.
 *
 * @param ctx - Query or mutation context
 * @param userId - User identifier string to check
 * @param category - The template category (registration, content, etc.)
 * @returns true if the user has unsubscribed (email should NOT be sent)
 */
export async function checkUnsubscribed(
  ctx: ReadCtx,
  userId: string,
  category: string,
): Promise<boolean> {
  // Map template category to unsubscribe category
  const unsubCategory = CATEGORY_TO_UNSUBSCRIBE[category] ?? category;

  // Check for "all" unsubscribe first
  const allUnsub = await ctx.db
    .query("emailUnsubscribes")
    .withIndex("by_user_category", (q) =>
      q.eq("userId", userId).eq("category", "all"),
    )
    .unique();

  if (allUnsub) return true;

  // Check specific category
  const categoryUnsub = await ctx.db
    .query("emailUnsubscribes")
    .withIndex("by_user_category", (q) =>
      q.eq("userId", userId).eq("category", unsubCategory),
    )
    .unique();

  return !!categoryUnsub;
}

// ─── Recipient Resolution ────────────────────────────────────────────────────

/**
 * Resolve recipient type to actual email addresses.
 *
 * @param ctx - Query or mutation context
 * @param recipientType - "admin", "employee", or "custom"
 * @param options - Optional user IDs or role level filter
 * @returns Array of resolved recipients with email, name, and userId
 */
export async function resolveRecipients(
  ctx: ReadCtx,
  recipientType: "admin" | "employee" | "custom",
  options?: {
    userIds?: string[];
    roleLevel?: number;
  },
): Promise<Array<{ email: string; name?: string; userId: string }>> {
  const recipients: Array<{ email: string; name?: string; userId: string }> =
    [];

  if (recipientType === "custom" && options?.userIds) {
    // Resolve specific user IDs - try multiple lookup strategies
    for (const id of options.userIds) {
      // Try by clerkUserId first, then direct ID
      let user = await ctx.db
        .query("users")
        .withIndex("by_clerkUserId", (q) =>
          q.eq("clerkUserId", id),
        )
        .unique();

      if (!user) {
        // Try as a direct Convex ID
        try {
          user = await ctx.db.get(id as Id<"users">);
        } catch {
          // Invalid ID format - skip
        }
      }

      if (user && user.status === "active" && user.email) {
        recipients.push({
          email: user.email,
          name:
            user.displayName ??
            [user.firstName, user.lastName].filter(Boolean).join(" ") ??
            undefined,
          userId: getUserIdentifier(user),
        });
      }
    }
    return recipients;
  }

  // For admin/employee, find qualifying roles first, then query users by roleId.
  // This avoids loading ALL active users. Uses the by_level index on roles
  // and by_roleId index on users.
  const minLevel = recipientType === "admin" ? 100 : 60;

  // Get all active roles at or above the minimum level
  const qualifyingRoles = await ctx.db
    .query("roles")
    .withIndex("by_level", (q) => q.gte("level", minLevel))
    .collect();

  const activeRoleIds = qualifyingRoles
    .filter((r) => r.status === "active")
    .map((r) => r._id);

  // For each qualifying role, query users assigned to that role
  for (const roleId of activeRoleIds) {
    const usersWithRole = await ctx.db
      .query("users")
      .withIndex("by_roleId", (q) => q.eq("roleId", roleId))
      .collect();

    for (const user of usersWithRole) {
      if (!user.email || user.status !== "active") continue;

      recipients.push({
        email: user.email,
        name:
          user.displayName ??
          [user.firstName, user.lastName].filter(Boolean).join(" ") ??
          undefined,
        userId: getUserIdentifier(user),
      });
    }
  }

  return recipients;
}

// ─── Email Validation ────────────────────────────────────────────────────────

/**
 * Basic email address format validation.
 */
export function isValidEmail(email: string): boolean {
  if (!email || email.length > 254) return false;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

// ─── Duplicate Detection ─────────────────────────────────────────────────────

/**
 * Check if a duplicate email was recently sent (within last 5 minutes).
 * Prevents duplicate sends for the same template + recipient + event.
 *
 * @param ctx - Query or mutation context
 * @param templateSlug - Template identifier
 * @param recipientEmail - Recipient email address
 * @param eventId - Optional triggering event ID
 * @returns true if a duplicate was found (email should be skipped)
 */
export async function isDuplicateEmail(
  ctx: ReadCtx,
  templateSlug: string,
  recipientEmail: string,
  eventId?: Id<"events">,
): Promise<boolean> {
  const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;

  // Check by recipient + template in the last 5 minutes
  const recentEmails = await ctx.db
    .query("emailQueue")
    .withIndex("by_recipient", (q) =>
      q.eq("to", recipientEmail).gte("createdAt", fiveMinutesAgo),
    )
    .collect();

  return recentEmails.some(
    (email) =>
      email.templateSlug === templateSlug &&
      email.status !== "cancelled" &&
      email.status !== "failed" &&
      (eventId ? email.eventId === eventId : true),
  );
}

// ─── Email Settings Reader ───────────────────────────────────────────────────

/**
 * Read email settings from the Settings System.
 * Reads the "email" section from the settings table, falling back
 * to EMAIL_DEFAULTS for any missing values. Also reads the "general"
 * section for site name/URL.
 */
export async function getEmailSettings(
  ctx: ReadCtx,
): Promise<{
  fromAddress: string;
  fromName: string;
  replyTo: string;
  rateLimit: number;
  dailyLimit: number;
  batchWindow: number;
  enabled: boolean;
  unsubscribeUrl: string;
  siteName: string;
  siteUrl: string;
  maxRetries: number;
  retryDelay: number;
  queueRetentionDays: number;
  trackingEnabled: boolean;
  digestEnabled: boolean;
  digestDay: number;
  digestHour: number;
  includeUnsubscribeLink: boolean;
}> {
  // Read general settings for site name/URL
  const generalSettings = await ctx.db
    .query("settings")
    .withIndex("by_section", (q) => q.eq("section", "general"))
    .unique();

  const generalValues = (generalSettings?.values ?? {}) as Record<
    string,
    unknown
  >;

  // Read the "email" section from the settings table
  const emailSettings = await ctx.db
    .query("settings")
    .withIndex("by_section", (q) => q.eq("section", "email"))
    .unique();

  const emailValues = (emailSettings?.values ?? {}) as Record<
    string,
    unknown
  >;

  return {
    fromAddress: (emailValues.fromAddress as string) ?? EMAIL_DEFAULTS.from_address,
    fromName: (emailValues.fromName as string) ?? EMAIL_DEFAULTS.from_name,
    replyTo: (emailValues.replyTo as string) ?? EMAIL_DEFAULTS.reply_to,
    rateLimit: (emailValues.rateLimit as number) ?? EMAIL_DEFAULTS.rate_limit,
    dailyLimit: (emailValues.dailyLimit as number) ?? EMAIL_DEFAULTS.daily_limit,
    batchWindow: (emailValues.batchWindow as number) ?? EMAIL_DEFAULTS.batch_window,
    enabled: (emailValues.enabled as boolean) ?? EMAIL_DEFAULTS.enabled,
    unsubscribeUrl: (emailValues.unsubscribeUrl as string) ?? EMAIL_DEFAULTS.unsubscribe_url,
    siteName: (generalValues.siteTitle as string) ?? "ConvexPress",
    siteUrl: (generalValues.siteUrl as string) ?? "",
    maxRetries: (emailValues.maxRetries as number) ?? 3,
    retryDelay: (emailValues.retryDelay as number) ?? 5,
    queueRetentionDays: (emailValues.queueRetentionDays as number) ?? 30,
    trackingEnabled: (emailValues.trackingEnabled as boolean) ?? false,
    digestEnabled: (emailValues.digestEnabled as boolean) ?? true,
    digestDay: (emailValues.digestDay as number) ?? 1,
    digestHour: (emailValues.digestHour as number) ?? 8,
    includeUnsubscribeLink: (emailValues.includeUnsubscribeLink as boolean) ?? true,
  };
}

// ─── Queue Email for Event ───────────────────────────────────────────────────

/**
 * Universal event-to-email helper. Called by event listener handlers to
 * queue an email. Handles template lookup, variable resolution, unsubscribe
 * checks, and queue insertion in a single call.
 *
 * @param ctx - Mutation context (must be a write context)
 * @param templateSlug - Which template to use
 * @param options - Recipient info, variables, event reference
 * @returns Queue record ID or null (if template disabled, user unsubscribed, etc.)
 */
export async function queueEmailForEvent(
  ctx: MutationCtx,
  templateSlug: string,
  options: {
    recipientEmail: string;
    recipientName?: string;
    recipientUserId?: string;
    variables: Record<string, string>;
    eventId?: Id<"events">;
    correlationId?: string;
  },
): Promise<Id<"emailQueue"> | null> {
  // 1. Validate email address
  if (!isValidEmail(options.recipientEmail)) {
    return null;
  }

  // 2. Fetch template
  const template = await ctx.db
    .query("emailTemplates")
    .withIndex("by_slug", (q) => q.eq("slug", templateSlug))
    .unique();

  if (!template) {
    return null;
  }

  // 3. Check if template is active
  if (!template.isActive) {
    return null;
  }

  // 4. Get email settings
  const settings = await getEmailSettings(ctx);

  // 5. Check if email system is enabled
  if (!settings.enabled) {
    return null;
  }

  // 6. Check unsubscribe (unless security-critical)
  if (
    !isSecurityEmail(templateSlug) &&
    options.recipientUserId
  ) {
    const isUnsubscribed = await checkUnsubscribed(
      ctx,
      options.recipientUserId,
      template.category,
    );
    if (isUnsubscribed) {
      return null;
    }
  }

  // 7. Check for duplicate emails (within last 5 minutes)
  const isDuplicate = await isDuplicateEmail(
    ctx,
    templateSlug,
    options.recipientEmail,
    options.eventId,
  );
  if (isDuplicate) {
    return null;
  }

  // 8. Inject global variables and render template
  const allVariables = injectGlobalVariables(
    options.variables,
    {
      siteName: settings.siteName,
      siteUrl: settings.siteUrl,
      unsubscribeUrl: settings.unsubscribeUrl,
    },
    options.recipientName,
  );

  const renderedSubject = renderTemplate(
    template.subjectTemplate,
    allVariables,
  );
  const renderedHtml = renderTemplate(template.bodyHtml, allVariables);
  const renderedText = template.bodyText
    ? renderTemplate(template.bodyText, allVariables)
    : stripHtmlToText(renderedHtml);

  // 9. Calculate scheduledFor based on priority
  let scheduledFor: number | undefined;
  if (template.priority === "batched") {
    scheduledFor = Date.now() + settings.batchWindow * 60 * 1000;
  } else if (template.priority === "digest") {
    // Digest emails are generated by the cron, not queued individually
    return null;
  }

  // 10. Insert into queue
  const now = Date.now();
  const queueId = await ctx.db.insert("emailQueue", {
    to: options.recipientEmail,
    toName: options.recipientName,
    toUserId: options.recipientUserId,
    from: settings.fromAddress,
    fromName: settings.fromName,
    replyTo: settings.replyTo,
    subject: renderedSubject,
    bodyHtml: renderedHtml,
    bodyText: renderedText,
    templateSlug,
    templateVariables: JSON.stringify(allVariables),
    status: "queued",
    priority: template.priority,
    scheduledFor,
    attempts: 0,
    maxAttempts: 3,
    eventId: options.eventId,
    correlationId: options.correlationId,
    createdAt: now,
  });

  // 11. For immediate priority, schedule send right away
  if (template.priority === "immediate") {
    await ctx.scheduler.runAfter(0, internal.emails.internals.sendEmail, {
      queueId,
    });
  }

  return queueId;
}
