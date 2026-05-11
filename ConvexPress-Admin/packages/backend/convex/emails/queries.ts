/**
 * Email Notification System - Public Queries
 *
 * Six queries for reading email system data:
 *
 *   - listQueue: Paginated email queue with status/template/date filters
 *   - getEmail: Single email queue item with full detail
 *   - listTemplates: All email templates (list view, bodies omitted)
 *   - getTemplate: Single template with full body and variables
 *   - stats: Queue statistics (sent/failed/queued/bounced counts)
 *   - getUserPreferences: User's email unsubscribe preferences
 *
 * Admin queries require "manage_options" equivalent capabilities.
 * User queries require basic authentication.
 *
 * Usage:
 *   const queue = useQuery(api.emails.queries.listQueue, { status: "failed" });
 *   const templates = useQuery(api.emails.queries.listTemplates, {});
 *   const prefs = useQuery(api.emails.queries.getUserPreferences, {});
 */

import { query } from "../_generated/server";
import { ConvexError } from "convex/values";
import { requireCan, getCurrentUser, getUserIdentifier } from "../helpers/permissions";
import {
  listQueueArgs,
  getEmailArgs,
  listTemplatesArgs,
  getTemplateArgs,
  statsArgs,
  getUserPreferencesArgs,
} from "./validators";
import { EMAIL_TEMPLATE_REGISTRY_BY_SLUG } from "./registry";

const TEMPLATE_REGISTRY = EMAIL_TEMPLATE_REGISTRY_BY_SLUG as Record<
  string,
  { canonicalEventCode?: string; triggerKind?: string }
>;

// ─── listQueue ───────────────────────────────────────────────────────────────

/**
 * List email queue items with filtering and offset-based pagination.
 *
 * Selects optimal index based on filters:
 *   - status -> by_status index
 *   - templateSlug -> by_template index
 *   - recipientEmail -> by_recipient index
 *   - default -> by_created index (newest first)
 *
 * Date range applied as post-filter.
 *
 * NOTE: Uses .take(5000) cap to prevent unbounded memory consumption.
 * For deployments expecting >5000 queue records, consider migrating
 * to cursor-based pagination with Convex's .paginate() API, which
 * requires frontend changes to use continuation cursors instead of
 * page numbers.
 */
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const listQueue = query({
  args: listQueueArgs,
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    await requireCan(ctx, "settings.update_email");

    const page = Math.max(args.page ?? 1, 1);
    const perPage = Math.min(Math.max(args.perPage ?? 50, 1), 200);
    const skip = (page - 1) * perPage;

    // Fetch emails based on filters (capped at 5000 to prevent unbounded reads)
    const QUEUE_LIST_CAP = 5000;
    let emails;

    if (args.status) {
      emails = await ctx.db
        .query("emailQueue")
        .withIndex("by_status", (q: ConvexQueryBuilder) => q.eq("status", args.status!))
        .order("desc")
        .take(QUEUE_LIST_CAP);
    } else if (args.templateSlug) {
      emails = await ctx.db
        .query("emailQueue")
        .withIndex("by_template", (q: ConvexQueryBuilder) =>
          q.eq("templateSlug", args.templateSlug!),
        )
        .order("desc")
        .take(QUEUE_LIST_CAP);
    } else if (args.recipientEmail) {
      emails = await ctx.db
        .query("emailQueue")
        .withIndex("by_recipient", (q: ConvexQueryBuilder) => q.eq("to", args.recipientEmail!))
        .order("desc")
        .take(QUEUE_LIST_CAP);
    } else {
      emails = await ctx.db
        .query("emailQueue")
        .withIndex("by_created")
        .order("desc")
        .take(QUEUE_LIST_CAP);
    }

    // Apply date range post-filters
    if (args.dateFrom) {
      // @ts-expect-error TS7006: Callback param loses contextual typing downstream of TS2589.
      emails = emails.filter((e) => e.createdAt >= args.dateFrom!);
    }
    if (args.dateTo) {
      // @ts-expect-error TS7006: Callback param loses contextual typing downstream of TS2589.
      emails = emails.filter((e) => e.createdAt <= args.dateTo!);
    }

    // Apply cross-filter if status + template/recipient combos
    if (args.status && args.templateSlug) {
      // @ts-expect-error TS7006: Callback param loses contextual typing downstream of TS2589.
      emails = emails.filter((e) => e.templateSlug === args.templateSlug);
    }
    if (args.status && args.recipientEmail) {
      // @ts-expect-error TS7006: Callback param loses contextual typing downstream of TS2589.
      emails = emails.filter((e) => e.to === args.recipientEmail);
    }

    const total = emails.length;
    const totalPages = Math.ceil(total / perPage);
    const paginatedEmails = emails.slice(skip, skip + perPage);

    return {
      // @ts-expect-error TS7006: Callback param loses contextual typing downstream of TS2589.
      emails: paginatedEmails.map((email) => ({
        _id: email._id,
        to: email.to,
        toName: email.toName,
        subject: email.subject,
        templateSlug: email.templateSlug,
        status: email.status,
        priority: email.priority,
        attempts: email.attempts,
        createdAt: email.createdAt,
        sentAt: email.sentAt,
        lastError: email.lastError,
        isTest: email.isTest ?? false,
        testLabel: email.testLabel,
      })),
      total,
      page,
      perPage,
      totalPages,
    };
  },
});

// ─── getEmail ────────────────────────────────────────────────────────────────

/**
 * Get a single email queue item with full detail.
 * Includes parsed template variables and event reference.
 */
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const getEmail = query({
  args: getEmailArgs,
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    await requireCan(ctx, "settings.update_email");

    const email = await ctx.db.get("emailQueue", args.queueId);
    if (!email) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Email queue item not found",
      });
    }

    // Parse template variables
    let parsedVariables: Record<string, string> = {};
    try {
      parsedVariables = JSON.parse(email.templateVariables);
    } catch {
      // Keep empty object
    }

    // Fetch linked event if present
    let eventMeta = null;
    if (email.eventId) {
      const event = await ctx.db.get("events", email.eventId);
      if (event) {
        eventMeta = {
          code: event.code,
          system: event.system,
          emittedAt: event.emittedAt,
        };
      }
    }

    return {
      _id: email._id,
      to: email.to,
      toName: email.toName,
      toUserId: email.toUserId,
      from: email.from,
      fromName: email.fromName,
      replyTo: email.replyTo,
      subject: email.subject,
      bodyHtml: email.bodyHtml,
      bodyText: email.bodyText,
      templateSlug: email.templateSlug,
      templateVariables: parsedVariables,
      status: email.status,
      priority: email.priority,
      scheduledFor: email.scheduledFor,
      resendId: email.resendId,
      resendResponse: email.resendResponse,
      attempts: email.attempts,
      maxAttempts: email.maxAttempts,
      lastAttemptAt: email.lastAttemptAt,
      nextRetryAt: email.nextRetryAt,
      lastError: email.lastError,
      eventId: email.eventId,
      correlationId: email.correlationId,
      isTest: email.isTest ?? false,
      testLabel: email.testLabel,
      testMetadata: email.testMetadata,
      createdAt: email.createdAt,
      sentAt: email.sentAt,
      deliveredAt: email.deliveredAt,
      openedAt: email.openedAt,
      event: eventMeta,
    };
  },
});

// ─── listTemplates ───────────────────────────────────────────────────────────

/**
 * List all email templates.
 * Returns templates without full body HTML for list performance.
 * Supports filtering by category and active status.
 */
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const listTemplates = query({
  args: listTemplatesArgs,
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    await requireCan(ctx, "settings.update_email");

    let templates;

    if (args.category) {
      templates = await ctx.db
        .query("emailTemplates")
        .withIndex("by_category", (q: ConvexQueryBuilder) => q.eq("category", args.category!))
        .collect();
    } else if (args.isActive !== undefined) {
      templates = await ctx.db
        .query("emailTemplates")
        .withIndex("by_active", (q: ConvexQueryBuilder) => q.eq("isActive", args.isActive!))
        .collect();
    } else {
      templates = await ctx.db.query("emailTemplates").collect();
    }

    // Apply cross-filter
    if (args.category && args.isActive !== undefined) {
      // @ts-expect-error TS7006: Callback param loses contextual typing downstream of TS2589.
      templates = templates.filter((t) => t.isActive === args.isActive);
    }

    // @ts-expect-error TS7006: Callback param loses contextual typing downstream of TS2589.
    return templates.map((template) => ({
      _id: template._id,
      slug: template.slug,
      name: template.name,
      description: template.description,
      category: template.category,
      priority: template.priority,
      recipientType: template.recipientType,
      isActive: template.isActive,
      isCustomized: template.isCustomized,
      eventCode: template.eventCode,
      canonicalEventCode:
        TEMPLATE_REGISTRY[template.slug]?.canonicalEventCode ?? template.eventCode,
      triggerKind: TEMPLATE_REGISTRY[template.slug]?.triggerKind ?? "manual",
      lastSentAt: template.lastSentAt,
      totalSent: template.totalSent,
      updatedAt: template.updatedAt,
    }));
  },
});

// ─── getTemplate ─────────────────────────────────────────────────────────────

/**
 * Get a single template by slug with full detail.
 * Includes body HTML, default templates, and available variables.
 */
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const getTemplate = query({
  args: getTemplateArgs,
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    await requireCan(ctx, "settings.update_email");

    const template = await ctx.db
      .query("emailTemplates")
      .withIndex("by_slug", (q: ConvexQueryBuilder) => q.eq("slug", args.templateSlug))
      .unique();

    if (!template) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: `Email template "${args.templateSlug}" not found`,
      });
    }

    const templateSlug = String((template as any).slug);
    const registryEntry: any = (EMAIL_TEMPLATE_REGISTRY_BY_SLUG as any)[templateSlug] ?? {};

    return {
      ...template,
      canonicalEventCode: registryEntry.canonicalEventCode ?? template.eventCode,
      triggerKind: registryEntry.triggerKind ?? "manual",
    };
  },
});

// ─── stats ───────────────────────────────────────────────────────────────────

/**
 * Get email queue statistics.
 *
 * Returns aggregate counts for a date range:
 *   - totalSent, totalFailed, totalBounced, totalQueued
 *   - byTemplate: per-template sent/failed counts
 *   - byDay: daily sent/failed counts (last 7 days)
 *
 * KNOWN LIMITATION: Capped at 10,000 records per query for performance.
 * For high-volume deployments exceeding 10,000 emails per 7-day window,
 * this query will return approximate counts. Consider implementing a
 * dedicated aggregation table (denormalized counters) if exact counts
 * beyond this cap are required.
 */
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const stats = query({
  args: statsArgs,
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    await requireCan(ctx, "settings.update_email");

    // Default to last 7 days
    const now = Date.now();
    const dateFrom = args.dateFrom ?? now - 7 * 24 * 60 * 60 * 1000;
    const dateTo = args.dateTo ?? now;

    // Fetch all emails in range (cap at 10000 for performance)
    const emails = await ctx.db
      .query("emailQueue")
      .withIndex("by_created", (q: ConvexQueryBuilder) => q.gte("createdAt", dateFrom))
      .order("desc")
      .take(10000);

    // Filter by date range
    const filtered = emails.filter(
      // @ts-expect-error TS7006: Callback param loses contextual typing downstream of TS2589.
      (e) =>
        e.createdAt >= dateFrom &&
        e.createdAt <= dateTo &&
        e.isTest !== true,
    );

    // Aggregate totals
    let totalSent = 0;
    let totalFailed = 0;
    let totalBounced = 0;
    let totalQueued = 0;

    // By template
    const templateMap: Record<
      string,
      { slug: string; sent: number; failed: number }
    > = {};

    // By day
    const dayMap: Record<string, { date: string; sent: number; failed: number }> =
      {};

    for (const email of filtered) {
      // Total counts
      if (email.status === "sent" || email.status === "delivered") totalSent++;
      else if (email.status === "failed") totalFailed++;
      else if (email.status === "bounced") totalBounced++;
      else if (email.status === "queued" || email.status === "sending")
        totalQueued++;

      // By template
      if (!templateMap[email.templateSlug]) {
        templateMap[email.templateSlug] = {
          slug: email.templateSlug,
          sent: 0,
          failed: 0,
        };
      }
      if (email.status === "sent" || email.status === "delivered") {
        templateMap[email.templateSlug].sent++;
      } else if (email.status === "failed") {
        templateMap[email.templateSlug].failed++;
      }

      // By day
      const date = new Date(email.createdAt).toISOString().slice(0, 10);
      if (!dayMap[date]) {
        dayMap[date] = { date, sent: 0, failed: 0 };
      }
      if (email.status === "sent" || email.status === "delivered") {
        dayMap[date].sent++;
      } else if (email.status === "failed") {
        dayMap[date].failed++;
      }
    }

    // Fetch template names for the byTemplate breakdown
    const byTemplate: Array<{
      slug: string;
      name: string;
      sent: number;
      failed: number;
    }> = [];
    for (const entry of Object.values(templateMap)) {
      const template = await ctx.db
        .query("emailTemplates")
        .withIndex("by_slug", (q: ConvexQueryBuilder) => q.eq("slug", entry.slug))
        .unique();

      byTemplate.push({
        slug: entry.slug,
        name: template?.name ?? entry.slug,
        sent: entry.sent,
        failed: entry.failed,
      });
    }

    // Sort byDay chronologically
    // @ts-expect-error TS2589 TS7006: Convex generated API types (see feedback_typecheck_deploy.md).
    const byDay = Object.values(dayMap).sort((a, b) =>
      a.date.localeCompare(b.date),
    );

    return {
      totalSent,
      totalFailed,
      totalBounced,
      totalQueued,
      byTemplate,
      byDay,
    };
  },
});

// ─── getUserPreferences ──────────────────────────────────────────────────────

/**
 * Get a user's email unsubscribe preferences.
 * Defaults to the currently authenticated user.
 *
 * Returns all available categories with subscription status.
 */
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const getUserPreferences = query({
  args: getUserPreferencesArgs,
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    const currentUser = await getCurrentUser(ctx);
    if (!currentUser) {
      throw new ConvexError({
        code: "UNAUTHORIZED",
        message: "Authentication required",
      });
    }

    // Use provided userId or fall back to current user
    const userId = args.userId ?? getUserIdentifier(currentUser);

    // Only admins can view other users' preferences
    if (userId !== getUserIdentifier(currentUser)) {
      await requireCan(ctx, "settings.update_email");
    }

    // Fetch all unsubscribes for this user
    const unsubscribes = await ctx.db
      .query("emailUnsubscribes")
      .withIndex("by_user", (q: ConvexQueryBuilder) => q.eq("userId", userId))
      .collect();

    const unsubscribedCategories = new Set(
      // @ts-expect-error TS7006: Callback param loses contextual typing downstream of TS2589.
      unsubscribes.map((u) => u.category),
    );

    // Build the category list with subscription status
    const categories: Array<{
      category: string;
      label: string;
      description: string;
      isSubscribed: boolean;
      canUnsubscribe: boolean;
    }> = [
      {
        category: "content",
        label: "Content Notifications",
        description: "New posts and content updates",
        isSubscribed: !unsubscribedCategories.has("content") && !unsubscribedCategories.has("all"),
        canUnsubscribe: true,
      },
      {
        category: "comment",
        label: "Comment Notifications",
        description: "Replies to your comments and new comments on your posts",
        isSubscribed: !unsubscribedCategories.has("comment") && !unsubscribedCategories.has("all"),
        canUnsubscribe: true,
      },
      {
        category: "security",
        label: "Security Notifications",
        description:
          "Password changes, new device logins, and account security alerts",
        isSubscribed: true, // Always subscribed
        canUnsubscribe: false,
      },
      {
        category: "system",
        label: "System Notifications",
        description: "Role changes, account status updates, and admin alerts",
        isSubscribed: !unsubscribedCategories.has("system") && !unsubscribedCategories.has("all"),
        canUnsubscribe: true,
      },
      {
        category: "digest",
        label: "Weekly Digest",
        description: "Weekly summary of content and comments",
        isSubscribed: !unsubscribedCategories.has("digest") && !unsubscribedCategories.has("all"),
        canUnsubscribe: true,
      },
    ];

    return {
      userId,
      // @ts-expect-error TS7006: Callback param loses contextual typing downstream of TS2589.
      unsubscribed: unsubscribes.map((u) => ({
        category: u.category,
        unsubscribedAt: u.unsubscribedAt,
      })),
      categories,
    };
  },
});
