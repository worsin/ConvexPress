/**
 * Email Notification System - Internal Functions
 *
 * Functions that are NOT callable from clients. Used for:
 *
 *   - queueEmail: Internal mutation to add email to queue (event handlers call this)
 *   - sendEmail: Internal action that calls Resend API
 *   - markSent: Update queue record on successful send
 *   - handleSendFailure: Handle send failure with retry/backoff logic
 *   - updateQueueStatus: Simple status update helper
 *   - processBatchedEmails: Cron handler for batched emails
 *   - generateDigest: Cron handler for weekly digest
 *   - cleanupOldEmails: Retention cleanup cron
 *   - bootstrapTemplates: Seed default templates on first run
 *   - Event handler functions (23 handlers for email notification triggers)
 *
 * Internal functions use internalMutation/internalAction and are invoked
 * by the Event Dispatcher System or scheduled by cron jobs.
 */

import {
  internalMutation,
  internalAction,
  internalQuery,
} from "../_generated/server";
import { internal } from "../_generated/api";
import { v, ConvexError } from "convex/values";
import { emitEvent } from "../helpers/events";
import { SYSTEM } from "../events/constants";
import {
  queueEmailForEvent,
  getEmailSettings,
  resolveRecipients,
  stripHtmlToText,
  renderTemplate,
  injectGlobalVariables,
  isSecurityEmail,
  checkUnsubscribed,
  isValidEmail,
  EMAIL_TEMPLATES,
} from "../helpers/email";
import { getUserIdentifier, lookupUserByIdentifier } from "../helpers/permissions";
import { resolveServiceKey } from "../helpers/serviceKeys";
import {
  queueEmailInternalArgs,
  sendEmailArgs,
  markSentArgs,
  handleSendFailureArgs,
  updateQueueStatusArgs,
  queueRenderedEmailArgs,
  emailStatusValidator,
} from "./validators";
import { DEFAULT_TEMPLATES } from "./templateDefaults";
import {
  EMAIL_TEMPLATE_REGISTRY_BY_SLUG,
} from "./registry";
import { buildTemplateSampleVariables } from "./testData";

// ─── Retry Constants ─────────────────────────────────────────────────────────

/** Base delay for exponential backoff (5 seconds) */
const RETRY_BASE_DELAY_MS = 5000;

/** HTTP status codes that are retryable */
const RETRYABLE_STATUS_CODES = new Set([408, 429, 500, 502, 503, 504]);

function parsePayload(payload: string | undefined) {
  if (!payload) return {} as Record<string, any>;
  try {
    return JSON.parse(payload) as Record<string, any>;
  } catch {
    return {} as Record<string, any>;
  }
}

function toDisplayName(user: any) {
  return (
    user?.displayName ??
    [user?.firstName, user?.lastName].filter(Boolean).join(" ") ??
    user?.email ??
    ""
  );
}

function buildWebsiteUrl(siteUrl: string, path: string) {
  const base = siteUrl.replace(/\/$/, "");
  const nextPath = path.startsWith("/") ? path : `/${path}`;
  return `${base}${nextPath}`;
}

function excerptText(value: string | undefined, maxLength = 180) {
  if (!value) return "";
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 1).trim()}…`;
}

async function getEventRecord(ctx: any, eventId: any) {
  const event = await ctx.db.get("events", eventId);
  if (!event) return null;
  return {
    event,
    payload: parsePayload(event.payload),
  };
}

async function getTemplateRecord(ctx: any, templateSlug: string) {
  return await ctx.db
    .query("emailTemplates")
    .withIndex("by_slug", (q: any) => q.eq("slug", templateSlug))
    .unique();
}

async function getUserByAnyId(ctx: any, identifier: any) {
  if (!identifier) return null;
  try {
    return await lookupUserByIdentifier(ctx, String(identifier));
  } catch {
    return null;
  }
}

async function getPostContext(ctx: any, postId: any, siteUrl: string) {
  if (!postId) return null;
  const post = await ctx.db.get(postId);
  if (!post) return null;
  const author = post.authorId ? await ctx.db.get(post.authorId) : null;
  return {
    post,
    author,
    postUrl: buildWebsiteUrl(siteUrl, `/blog/${post.slug}`),
    excerpt:
      excerptText(post.excerpt) ||
      excerptText(stripHtmlToText(post.content ?? "")) ||
      excerptText(post.title),
  };
}

async function getCommentContext(ctx: any, commentId: any, siteUrl: string) {
  if (!commentId) return null;
  const comment = await ctx.db.get(commentId);
  if (!comment) return null;
  const postContext = await getPostContext(ctx, comment.postId, siteUrl);
  if (!postContext) return null;
  const author = comment.authorId ? await ctx.db.get(comment.authorId) : null;
  return {
    comment,
    post: postContext.post,
    postAuthor: postContext.author,
    commentAuthor: author,
    postUrl: postContext.postUrl,
    commentUrl: `${postContext.postUrl}#comment-${comment._id}`,
    commentExcerpt: excerptText(comment.content),
  };
}

async function getTicketContext(ctx: any, ticketId: any, siteUrl: string) {
  if (!ticketId) return null;
  const ticket = await ctx.db.get(ticketId);
  if (!ticket) return null;
  const assignee = ticket.assignedTo ? await ctx.db.get(ticket.assignedTo) : null;
  const owner = ticket.userId ? await ctx.db.get(ticket.userId) : null;
  return {
    ticket,
    assignee,
    owner,
    ticketUrl: buildWebsiteUrl(siteUrl, `/support/tickets/${ticketId}`),
  };
}

async function getKbArticleContext(ctx: any, articleId: any, siteUrl: string) {
  if (!articleId) return null;
  const article = await ctx.db.get(articleId);
  if (!article) return null;
  const author = article.authorId ? await ctx.db.get(article.authorId) : null;
  const category = article.categoryId ? await ctx.db.get(article.categoryId) : null;
  const categorySlug = category?.slug ?? "general";
  return {
    article,
    author,
    category,
    articleUrl: buildWebsiteUrl(
      siteUrl,
      `/help/${categorySlug}/${article.slug}`,
    ),
  };
}

async function getLmsContext(ctx: any, payload: Record<string, any>, siteUrl: string) {
  const course = payload.courseId ? await ctx.db.get(payload.courseId) : null;
  const learner = await getUserByAnyId(ctx, payload.userId);
  const firstLesson = course
    ? await ctx.db
        .query("lms_nodes")
        .withIndex("by_course_kind", (q: any) =>
          q.eq("courseId", course._id).eq("kind", "lesson"),
        )
        .first()
    : null;
  const issue = payload.certificateIssueId
    ? await ctx.db.get(payload.certificateIssueId)
    : null;
  const serial = payload.serial ?? issue?.serial ?? "";
  const courseSlug = course?.slug ?? "";
  const courseUrl =
    courseSlug && firstLesson
      ? buildWebsiteUrl(siteUrl, `/dashboard/courses/${courseSlug}/${firstLesson._id}`)
      : courseSlug
        ? buildWebsiteUrl(siteUrl, `/courses/${courseSlug}`)
        : buildWebsiteUrl(siteUrl, "/dashboard/courses");
  const coursePublicUrl = courseSlug
    ? buildWebsiteUrl(siteUrl, `/courses/${courseSlug}`)
    : buildWebsiteUrl(siteUrl, "/courses");
  const certificateUrl = serial
    ? buildWebsiteUrl(siteUrl, `/certificates/${serial}`)
    : courseUrl;

  return {
    course,
    learner,
    firstLesson,
    issue,
    courseTitle: course?.title ?? payload.courseTitle ?? "your course",
    courseUrl,
    coursePublicUrl,
    certificateUrl,
    serial,
  };
}

async function getCustomerRecipients(ctx: any) {
  const recipientMap = new Map<
    string,
    { email: string; name?: string; userId: string }
  >();

  for (const roleSlug of ["subscriber", "customer"]) {
    const role = await ctx.db
      .query("roles")
      .withIndex("by_slug", (q: any) => q.eq("slug", roleSlug))
      .unique();
    if (!role || role.status !== "active") continue;

    const users = await ctx.db
      .query("users")
      .withIndex("by_roleId", (q: any) => q.eq("roleId", role._id))
      .collect();

    for (const user of users) {
      if (!user.email || user.status !== "active") continue;
      const userId = getUserIdentifier(user);
      recipientMap.set(userId, {
        email: user.email,
        name: toDisplayName(user),
        userId,
      });
    }
  }

  return Array.from(recipientMap.values());
}

export async function runBootstrapTemplates(ctx: any, now = Date.now()) {
  let created = 0;
  let updated = 0;

  for (const templateDef of DEFAULT_TEMPLATES) {
    const existing = await getTemplateRecord(ctx, templateDef.slug);
    if (!existing) {
      await ctx.db.insert("emailTemplates", {
        slug: templateDef.slug,
        name: templateDef.name,
        description: templateDef.description,
        subjectTemplate: templateDef.subjectTemplate,
        bodyHtml: templateDef.bodyHtml,
        bodyText: undefined,
        preheaderText: templateDef.preheaderText,
        availableVariables: templateDef.availableVariables,
        priority: templateDef.priority,
        recipientType: templateDef.recipientType,
        isActive: true,
        eventCode: templateDef.eventCode,
        isCustomized: false,
        defaultSubjectTemplate: templateDef.subjectTemplate,
        defaultBodyHtml: templateDef.bodyHtml,
        category: templateDef.category,
        lastSentAt: undefined,
        totalSent: 0,
        createdAt: now,
        updatedAt: now,
      });
      created++;
      continue;
    }

    const registryEntry = EMAIL_TEMPLATE_REGISTRY_BY_SLUG[templateDef.slug];
    const nextEventCode = registryEntry?.canonicalEventCode ?? templateDef.eventCode;
    const shouldPatch =
      existing.name !== templateDef.name ||
      existing.description !== templateDef.description ||
      existing.eventCode !== nextEventCode ||
      existing.category !== templateDef.category ||
      existing.priority !== templateDef.priority ||
      existing.recipientType !== templateDef.recipientType ||
      JSON.stringify(existing.availableVariables) !==
        JSON.stringify(templateDef.availableVariables) ||
      existing.defaultSubjectTemplate !== templateDef.subjectTemplate ||
      existing.defaultBodyHtml !== templateDef.bodyHtml;

    if (!shouldPatch) continue;

    await ctx.db.patch("emailTemplates", existing._id, {
      name: templateDef.name,
      description: templateDef.description,
      availableVariables: templateDef.availableVariables,
      priority: templateDef.priority,
      recipientType: templateDef.recipientType,
      eventCode: nextEventCode,
      category: templateDef.category,
      defaultSubjectTemplate: templateDef.subjectTemplate,
      defaultBodyHtml: templateDef.bodyHtml,
      updatedAt: now,
    });
    updated++;
  }

  return { created, updated };
}

// ─── queueEmail (Internal Mutation) ──────────────────────────────────────────

/**
 * Internal mutation to add an email to the queue.
 * Called by event handler functions. Wraps queueEmailForEvent helper.
 */
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const queueEmail = internalMutation({
  args: queueEmailInternalArgs,
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    const variables = JSON.parse(args.variables) as Record<string, string>;

    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    return await queueEmailForEvent(ctx, args.templateSlug, {
      recipientEmail: args.recipientEmail,
      recipientName: args.recipientName,
      recipientUserId: args.recipientUserId,
      variables,
      eventId: args.eventId,
      correlationId: args.correlationId,
    });
  },
});

const queueRenderedEmailConfig: any = {
  args: queueRenderedEmailArgs,
  handler: async (ctx: any, args: any) => {
    if (!isValidEmail(args.recipientEmail)) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: "Invalid recipient email address.",
      });
    }

    const settings = await getEmailSettings(ctx);
    const queueId = await ctx.db.insert("emailQueue", {
      to: args.recipientEmail,
      toName: args.recipientName,
      toUserId: args.recipientUserId,
      from: settings.fromAddress,
      fromName: settings.fromName,
      replyTo: settings.replyTo,
      subject: args.subject,
      bodyHtml: args.bodyHtml,
      bodyText: args.bodyText ?? stripHtmlToText(args.bodyHtml),
      templateSlug: args.templateSlug,
      templateVariables: args.templateVariables,
      status: "queued",
      priority: args.priority ?? "immediate",
      attempts: 0,
      maxAttempts: 3,
      eventId: args.eventId,
      correlationId: args.correlationId,
      isTest: args.isTest,
      testLabel: args.testLabel,
      testMetadata: args.testMetadata,
      createdAt: Date.now(),
    });

    await ctx.scheduler.runAfter(0, internal.emails.internals.sendEmail, {
      queueId,
    });

    return queueId;
  },
};

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const queueRenderedEmail = internalMutation(queueRenderedEmailConfig);

const getTemplateForTestingConfig: any = {
  args: {
    templateSlug: v.string(),
  },
  handler: async (ctx: any, args: { templateSlug: string }) => {
    return await getTemplateRecord(ctx, args.templateSlug);
  },
};

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const getTemplateForTesting = internalQuery(getTemplateForTestingConfig);

const queueTemplateTestEmailConfig: any = {
  args: {
    templateSlug: v.string(),
    recipientEmail: v.string(),
    recipientName: v.optional(v.string()),
    samplePreset: v.optional(v.string()),
    variableOverrides: v.optional(v.string()),
  },
  handler: async (ctx: any, args: any) => {
    const template = await getTemplateRecord(ctx, args.templateSlug);
    if (!template) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: `Email template "${args.templateSlug}" was not found.`,
      });
    }

    let parsedOverrides: Record<string, string> | undefined;
    if (args.variableOverrides) {
      parsedOverrides = JSON.parse(args.variableOverrides) as Record<
        string,
        string
      >;
    }

    const settings = await getEmailSettings(ctx);
    const variables = injectGlobalVariables(
      buildTemplateSampleVariables(template.availableVariables, parsedOverrides),
      {
        siteName: settings.siteName,
        siteUrl: settings.siteUrl,
        unsubscribeUrl: settings.unsubscribeUrl,
      },
      args.recipientName,
    );

    const subject = renderTemplate(template.subjectTemplate, variables);
    const bodyHtml = renderTemplate(template.bodyHtml, variables);
    const bodyText = template.bodyText
      ? renderTemplate(template.bodyText, variables)
      : stripHtmlToText(bodyHtml);

    const queueId = await ctx.db.insert("emailQueue", {
      to: args.recipientEmail,
      toName: args.recipientName,
      from: settings.fromAddress,
      fromName: settings.fromName,
      replyTo: settings.replyTo,
      subject,
      bodyHtml,
      bodyText,
      templateSlug: template.slug,
      templateVariables: JSON.stringify(variables),
      status: "queued",
      priority: "immediate",
      attempts: 0,
      maxAttempts: 3,
      isTest: true,
      testLabel: `Template test: ${template.name}`,
      testMetadata: JSON.stringify({
        source: "settings.email.template_test",
        templateSlug: template.slug,
        samplePreset: args.samplePreset ?? "default",
      }),
      createdAt: Date.now(),
    });

    await ctx.scheduler.runAfter(0, internal.emails.internals.sendEmail, {
      queueId,
    });

    return queueId;
  },
};

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const queueTemplateTestEmail = internalMutation(queueTemplateTestEmailConfig);

// ─── sendEmail (Internal Action) ─────────────────────────────────────────────

/**
 * Send an email via the Resend API.
 *
 * This is an action (not mutation) because it makes external HTTP calls.
 * Flow:
 *   1. Read the queue record (via internal query-like runMutation)
 *   2. Update status to "sending"
 *   3. Call Resend API via fetch()
 *   4. On success: call markSent internal mutation
 *   5. On failure: call handleSendFailure internal mutation
 */
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const sendEmail = internalAction({
  args: sendEmailArgs,
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    // 1. Update status to "sending" and fetch the record
    const email = await ctx.runMutation(
      internal.emails.internals.updateStatusAndGetEmail,
      {
        queueId: args.queueId,
        newStatus: "sending",
      },
    );

    if (!email) {
      // Email was cancelled, already sent, or doesn't exist
      return;
    }

    // 2. Get Resend API key (settings table first, env var fallback)
    const emailSettings = await ctx.runQuery(
      internal.settings.internals.getInternal,
      { section: "email" },
    ) as Record<string, unknown> | null;

    const apiKey = resolveServiceKey(emailSettings, "resendApiKey", "RESEND_API_KEY");
    if (!apiKey) {
      await ctx.runMutation(internal.emails.internals.handleSendFailure, {
        queueId: args.queueId,
        error: "Resend API key is not configured. Set it in Settings > Email or as the RESEND_API_KEY environment variable.",
        isRetryable: false,
      });
      return;
    }

    // 3. Call Resend API
    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: `${email.fromName} <${email.from}>`,
          to: [email.to],
          subject: email.subject,
          html: email.bodyHtml,
          text: email.bodyText ?? undefined,
          reply_to: email.replyTo ?? undefined,
          headers: {
            "List-Unsubscribe": `<${email.unsubscribeUrl}>`,
            "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
          },
        }),
      });

      if (response.ok) {
        const data = (await response.json()) as { id: string };

        // 4. Success: mark as sent
        await ctx.runMutation(internal.emails.internals.markSent, {
          queueId: args.queueId,
          resendId: data.id,
          resendResponse: JSON.stringify(data),
        });
      } else {
        const errorText = await response.text();
        const isRetryable = RETRYABLE_STATUS_CODES.has(response.status);

        // Check for hard bounce (422 with bounce indicator)
        const isBounce =
          response.status === 422 &&
          errorText.toLowerCase().includes("bounce");

        if (isBounce) {
          await ctx.runMutation(internal.emails.internals.updateQueueStatus, {
            queueId: args.queueId,
            status: "bounced",
          });
        } else {
          await ctx.runMutation(internal.emails.internals.handleSendFailure, {
            queueId: args.queueId,
            error: `Resend API error (${response.status}): ${errorText.slice(0, 1000)}`,
            isRetryable,
          });
        }
      }
    } catch (error: unknown) {
      // Network error - always retryable
      await ctx.runMutation(internal.emails.internals.handleSendFailure, {
        queueId: args.queueId,
        error: `Network error: ${error instanceof Error ? error.message : String(error)}`,
        isRetryable: true,
      });
    }
  },
});

// ─── updateStatusAndGetEmail (Internal Mutation) ─────────────────────────────

/**
 * Atomically update the queue status and return the email record.
 * Used by sendEmail action to safely transition from queued to sending.
 *
 * Enforces per-minute and daily rate limits from the email settings.
 * Security-critical templates (password reset, etc.) bypass rate limits.
 * If rate limit is exceeded, the email stays in "queued" and returns null
 * so it will be picked up on the next batch processing cycle.
 */
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const updateStatusAndGetEmail = internalMutation({
  args: {
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    queueId: v.id("emailQueue"),
    newStatus: emailStatusValidator,
  },
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    const email = await ctx.db.get("emailQueue", args.queueId);
    if (!email) return null;

    // Only proceed if status is "queued" or "sending" (for retries)
    if (email.status !== "queued" && email.status !== "sending") {
      return null;
    }

    // Read email settings (includes rate limits)
    const settings = await getEmailSettings(ctx);

    // Rate limit check (security-critical emails bypass this)
    if (!isSecurityEmail(email.templateSlug)) {
      const now = Date.now();
      const oneMinuteAgo = now - 60 * 1000;
      const oneDayAgo = now - 24 * 60 * 60 * 1000;

      // Count emails sent in the last minute
      const recentMinute = await ctx.db
        .query("emailQueue")
        .withIndex("by_status", (q: ConvexQueryBuilder) => q.eq("status", "sent"))
        .take(1000); // H-17 FIX: bounded query
      const sentLastMinute = recentMinute.filter(
        // @ts-expect-error TS7006: Callback param loses contextual typing downstream of TS2589.
        (e) => e.sentAt && e.sentAt >= oneMinuteAgo,
      ).length;

      if (sentLastMinute >= settings.rateLimit) {
        // Rate limit exceeded - leave email queued for next cycle
        return null;
      }

      // Count emails sent in the last 24 hours
      const sentLastDay = recentMinute.filter(
        // @ts-expect-error TS7006: Callback param loses contextual typing downstream of TS2589.
        (e) => e.sentAt && e.sentAt >= oneDayAgo,
      ).length;

      if (sentLastDay >= settings.dailyLimit) {
        // Daily limit exceeded - leave email queued for next cycle
        return null;
      }
    }

    await ctx.db.patch("emailQueue", args.queueId, {
      status: args.newStatus,
      lastAttemptAt: Date.now(),
    });

    return {
      to: email.to,
      toName: email.toName,
      from: email.from,
      fromName: email.fromName,
      replyTo: email.replyTo,
      subject: email.subject,
      bodyHtml: email.bodyHtml,
      bodyText: email.bodyText,
      templateSlug: email.templateSlug,
      unsubscribeUrl: `${settings.siteUrl}${settings.unsubscribeUrl}`,
    };
  },
});

// ─── markSent (Internal Mutation) ────────────────────────────────────────────

/**
 * Mark an email as successfully sent.
 * Updates queue record, template stats, and emits notification.email_sent event.
 */
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const markSent = internalMutation({
  args: markSentArgs,
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    const email = await ctx.db.get("emailQueue", args.queueId);
    if (!email) return;

    const now = Date.now();

    // Update queue record
    await ctx.db.patch("emailQueue", args.queueId, {
      status: "sent",
      sentAt: now,
      resendId: args.resendId,
      resendResponse: args.resendResponse,
      attempts: email.attempts + 1,
    });

    // Production sends update template stats; admin tests stay visible in the
    // queue but do not pollute operational metrics.
    if (!email.isTest) {
      const template = await ctx.db
        .query("emailTemplates")
        .withIndex("by_slug", (q: ConvexQueryBuilder) => q.eq("slug", email.templateSlug))
        .unique();

      if (template) {
        await ctx.db.patch("emailTemplates", template._id, {
          lastSentAt: now,
          totalSent: template.totalSent + 1,
        });
      }
    }

    // Emit notification.email_sent event
    await emitEvent(ctx, "notification.email_sent", SYSTEM.EMAIL, {
      to: email.to,
      subject: email.subject,
      template: email.templateSlug,
    });
  },
});

// ─── handleSendFailure (Internal Mutation) ───────────────────────────────────

/**
 * Handle a failed email send attempt.
 *
 * If retryable and under max attempts: calculate backoff delay and reschedule.
 * If non-retryable or exhausted retries: mark as failed and emit failure event.
 *
 * Exponential backoff: 5s, 10s, 20s (base * 2^attempt)
 */
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const handleSendFailure = internalMutation({
  args: handleSendFailureArgs,
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    const email = await ctx.db.get("emailQueue", args.queueId);
    if (!email) return;

    const newAttempts = email.attempts + 1;
    const now = Date.now();

    if (args.isRetryable && newAttempts < email.maxAttempts) {
      // Calculate retry delay with exponential backoff
      const delay = RETRY_BASE_DELAY_MS * Math.pow(2, email.attempts);
      const nextRetryAt = now + delay;

      await ctx.db.patch("emailQueue", args.queueId, {
        status: "queued",
        attempts: newAttempts,
        lastAttemptAt: now,
        lastError: args.error,
        nextRetryAt,
      });

      // Schedule retry
      await ctx.scheduler.runAfter(delay, internal.emails.internals.sendEmail, {
        queueId: args.queueId,
      });
    } else {
      // Final failure
      await ctx.db.patch("emailQueue", args.queueId, {
        status: "failed",
        attempts: newAttempts,
        lastAttemptAt: now,
        lastError: args.error,
        nextRetryAt: undefined,
      });

      // Emit notification.email_failed event
      await emitEvent(ctx, "notification.email_failed", SYSTEM.EMAIL, {
        to: email.to,
        subject: email.subject,
        error: args.error,
      });
    }
  },
});

// ─── updateQueueStatus (Internal Mutation) ───────────────────────────────────

/**
 * Simple status update for a queue record.
 * Used for bounced, delivered, and other webhook-driven status changes.
 */
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const updateQueueStatus = internalMutation({
  args: updateQueueStatusArgs,
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    const email = await ctx.db.get("emailQueue", args.queueId);
    if (!email) return;

    const patch: Record<string, unknown> = {
      status: args.status,
    };

    if (args.status === "delivered") {
      patch.deliveredAt = Date.now();
    }

    await ctx.db.patch("emailQueue", args.queueId, patch);
  },
});

// ─── updateStatusByResendId (Internal Mutation) ─────────────────────────────

/**
 * Find an email queue record by its Resend message ID and update its status.
 * Used by the Resend webhook handler to process delivery/bounce/complaint events.
 *
 * Uses the by_resend_id index on the emailQueue table.
 * If no matching record is found, silently returns (the email may have been cleaned up).
 */
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const updateStatusByResendId = internalMutation({
  args: {
    resendId: v.string(),
    status: v.string(),
  },
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    // Look up the queue record by resendId using the dedicated index
    const email = await ctx.db
      .query("emailQueue")
      .withIndex("by_resend_id", (q: ConvexQueryBuilder) => q.eq("resendId", args.resendId))
      .unique();

    if (!email) {
      // No matching record -- the email may have been cleaned up by retention policy
      return;
    }

    const patch: Record<string, unknown> = {
      status: args.status,
    };

    if (args.status === "delivered") {
      patch.deliveredAt = Date.now();
    }

    await ctx.db.patch("emailQueue", email._id, patch);

    // Emit event for bounce/complaint tracking
    if (args.status === "bounced") {
      await emitEvent(ctx, "notification.email_bounced", SYSTEM.EMAIL, {
        to: email.to,
        subject: email.subject,
        resendId: args.resendId,
      });
    }
  },
});

// ─── processBatchedEmails (Cron Handler) ─────────────────────────────────────

/**
 * Process batched emails that are ready to send.
 * Runs every 5 minutes via cron. Picks up queued emails whose
 * scheduledFor timestamp has passed.
 */
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const processBatchedEmails = internalMutation({
  args: {},
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx) => {
    const now = Date.now();

    // Find queued emails with scheduledFor <= now
    const readyEmails = await ctx.db
      .query("emailQueue")
      .withIndex("by_status_scheduled", (q: ConvexQueryBuilder) =>
        q.eq("status", "queued").lte("scheduledFor", now),
      )
      .take(50);

    // Schedule each one for immediate send
    for (const email of readyEmails) {
      await ctx.scheduler.runAfter(0, internal.emails.internals.sendEmail, {
        queueId: email._id,
      });
    }
  },
});

// ─── generateDigest (Cron Handler) ───────────────────────────────────────────

/**
 * Generate weekly digest emails.
 * Runs weekly (Monday 8am by default). Composes two types of digests:
 *   1. Comment Digest: For employees, summarizes comments on their posts
 *   2. Weekly Content Digest: For all subscribed users, summarizes new posts
 */
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const generateDigest = internalMutation({
  args: {},
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx) => {
    const now = Date.now();
    const oneWeekAgo = now - 7 * 24 * 60 * 60 * 1000;
    const settings = await getEmailSettings(ctx);
    if (!settings.digestEnabled) return;

    // ─── 1. Weekly Content Digest ──────────────────────────────────────
    // Fetch posts published in the last 7 days
    const recentPosts = await ctx.db
      .query("posts")
      .withIndex("by_status", (q: ConvexQueryBuilder) => q.eq("status", "publish"))
      .order("desc")
      .take(100);

    const postsThisWeek = recentPosts.filter(
      // @ts-expect-error TS7006: Callback param loses contextual typing downstream of TS2589.
      (p) => p.publishedAt && p.publishedAt >= oneWeekAgo,
    );

    if (postsThisWeek.length > 0) {
      // Build the post list for the digest
      const postList = postsThisWeek
        .slice(0, 20)
        // @ts-expect-error TS7006: Callback param loses contextual typing downstream of TS2589.
        .map((p) => `<li><a href="${buildWebsiteUrl(settings.siteUrl, `/blog/${p.slug}`)}">${p.title}</a></li>`)
        .join("\n");

      // Get the weekly digest template
      const digestTemplate = await ctx.db
        .query("emailTemplates")
        .withIndex("by_slug", (q: ConvexQueryBuilder) =>
          q.eq("slug", EMAIL_TEMPLATES.WEEKLY_DIGEST),
        )
        .unique();

      if (digestTemplate && digestTemplate.isActive) {
        const customers = await getCustomerRecipients(ctx);
        for (const user of customers) {
          // Check unsubscribe
          const isUnsubscribed = await checkUnsubscribed(
            ctx,
            user.userId,
            "digest",
          );
          if (isUnsubscribed) continue;

          const variables = injectGlobalVariables(
            {
              post_count: String(postsThisWeek.length),
              post_list: postList,
            },
            {
              siteName: settings.siteName,
              siteUrl: settings.siteUrl,
              unsubscribeUrl: settings.unsubscribeUrl,
            },
            user.name,
          );

          const subject = renderTemplate(
            digestTemplate.subjectTemplate,
            variables,
          );
          const bodyHtml = renderTemplate(digestTemplate.bodyHtml, variables);
          const bodyText = stripHtmlToText(bodyHtml);

          await ctx.db.insert("emailQueue", {
            to: user.email,
            toName: user.name,
            toUserId: user.userId,
            from: settings.fromAddress,
            fromName: settings.fromName,
            replyTo: settings.replyTo,
            subject,
            bodyHtml,
            bodyText,
            templateSlug: EMAIL_TEMPLATES.WEEKLY_DIGEST,
            templateVariables: JSON.stringify(variables),
            status: "queued",
            priority: "digest",
            attempts: 0,
            maxAttempts: 3,
            createdAt: now,
          });
        }
      }
    }

    // ─── 2. Comment Digest (for employees) ─────────────────────────────
    // Find employees (Editor+, Author+) and aggregate comments on their posts
    const employees = await resolveRecipients(ctx, "employee");

    const commentDigestTemplate = await ctx.db
      .query("emailTemplates")
      .withIndex("by_slug", (q: ConvexQueryBuilder) =>
        q.eq("slug", EMAIL_TEMPLATES.COMMENT_DIGEST),
      )
      .unique();

    if (commentDigestTemplate && commentDigestTemplate.isActive && employees.length > 0) {
      for (const employee of employees) {
        const isUnsubscribed = await checkUnsubscribed(
          ctx,
          employee.userId,
          "comment",
        );
        if (isUnsubscribed) continue;

        const employeeUser = await getUserByAnyId(ctx, employee.userId);
        if (!employeeUser?._id) continue;

        const posts = await ctx.db
          .query("posts")
          .withIndex("by_author", (q: any) =>
            q.eq("authorId", employeeUser._id).eq("type", "post").eq("status", "publish"),
          )
          .collect();

        const recentComments: any[] = [];
        const touchedPosts = new Set<string>();
        for (const post of posts) {
          const comments = await ctx.db
            .query("comments")
            .withIndex("by_post", (q: any) => q.eq("postId", post._id))
            .collect();

          for (const comment of comments) {
            if (
              comment.createdAt >= oneWeekAgo &&
              comment.status !== "spam" &&
              comment.status !== "trash"
            ) {
              recentComments.push(comment);
              touchedPosts.add(String(post._id));
            }
          }
        }

        if (recentComments.length === 0) continue;

        const recentReplies = recentComments.filter((comment) => comment.parentId).length;
        const pendingComments = recentComments.filter(
          (comment) => comment.status === "pending",
        ).length;

        const variables = injectGlobalVariables(
          {
            comment_summary: `${recentComments.length} comments were posted across ${touchedPosts.size} of your posts this week, including ${recentReplies} replies and ${pendingComments} awaiting moderation.`,
          },
          {
            siteName: settings.siteName,
            siteUrl: settings.siteUrl,
            unsubscribeUrl: settings.unsubscribeUrl,
          },
          employee.name,
        );

        const subject = renderTemplate(
          commentDigestTemplate.subjectTemplate,
          variables,
        );
        const bodyHtml = renderTemplate(commentDigestTemplate.bodyHtml, variables);
        const bodyText = stripHtmlToText(bodyHtml);

        await ctx.db.insert("emailQueue", {
          to: employee.email,
          toName: employee.name,
          toUserId: employee.userId,
          from: settings.fromAddress,
          fromName: settings.fromName,
          replyTo: settings.replyTo,
          subject,
          bodyHtml,
          bodyText,
          templateSlug: EMAIL_TEMPLATES.COMMENT_DIGEST,
          templateVariables: JSON.stringify(variables),
          status: "queued",
          priority: "digest",
          attempts: 0,
          maxAttempts: 3,
          createdAt: now,
        });
      }
    }
  },
});

// ─── cleanupOldEmails (Cron Handler) ─────────────────────────────────────────

/**
 * Clean up old queue records based on retention policy.
 * Runs daily. Deletes in batches of 100.
 *
 *   - Sent/delivered emails: 90 days retention
 *   - Failed emails: 30 days retention
 */
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const cleanupOldEmails = internalMutation({
  args: {},
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx) => {
    const now = Date.now();
    const BATCH_SIZE = 100;

    // Delete sent/delivered emails older than 90 days
    const sentCutoff = now - 90 * 24 * 60 * 60 * 1000;
    const oldSentEmails = await ctx.db
      .query("emailQueue")
      .withIndex("by_created", (q: ConvexQueryBuilder) => q.lt("createdAt", sentCutoff))
      .take(BATCH_SIZE);

    let sentDeleted = 0;
    for (const email of oldSentEmails) {
      if (email.status === "sent" || email.status === "delivered") {
        await ctx.db.delete("emailQueue", email._id);
        sentDeleted++;
      }
    }

    // Delete failed emails older than 30 days
    const failedCutoff = now - 30 * 24 * 60 * 60 * 1000;
    const oldFailedEmails = await ctx.db
      .query("emailQueue")
      .withIndex("by_created", (q: ConvexQueryBuilder) => q.lt("createdAt", failedCutoff))
      .take(BATCH_SIZE);

    let failedDeleted = 0;
    for (const email of oldFailedEmails) {
      if (email.status === "failed" || email.status === "bounced" || email.status === "cancelled") {
        await ctx.db.delete("emailQueue", email._id);
        failedDeleted++;
      }
    }
  },
});

// ─── bootstrapTemplates (Seed Function) ──────────────────────────────────────

/**
 * Seed all 25 default email templates on first run.
 * Checks if templates already exist before inserting.
 * Safe to call multiple times (idempotent).
 */
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const bootstrapTemplates = internalMutation({
  args: {},
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx) => {
    return await runBootstrapTemplates(ctx);
  },
});

// ─── Event Handler Functions (23 handlers) ───────────────────────────────────

/**
 * Handler: registration.registered -> Welcome Email + Email Verification + Admin Notification
 */
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const onUserRegistered = internalMutation({
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  args: { eventId: v.id("events") },
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    const eventRecord = await getEventRecord(ctx, args.eventId);
    if (!eventRecord) return;

    const { event, payload } = eventRecord;
    const settings = await getEmailSettings(ctx);
    const user =
      (await getUserByAnyId(ctx, payload.userId ?? event.actorId)) ??
      null;
    const recipientEmail = user?.email ?? payload.email ?? "";
    const recipientName = toDisplayName(user);
    const recipientUserId = user ? getUserIdentifier(user) : undefined;

    if (recipientEmail) {
      await queueEmailForEvent(ctx, EMAIL_TEMPLATES.WELCOME, {
        recipientEmail,
        recipientName,
        recipientUserId,
        variables: {
          user_name: recipientName,
          user_email: recipientEmail,
        },
        eventId: args.eventId,
      });

      await queueEmailForEvent(ctx, EMAIL_TEMPLATES.VERIFICATION, {
        recipientEmail,
        recipientName,
        recipientUserId,
        variables: {
          user_name: recipientName,
          verification_url:
            payload.verificationUrl ??
            buildWebsiteUrl(settings.siteUrl, "/verify-email"),
        },
        eventId: args.eventId,
      });
    }

    const admins = await resolveRecipients(ctx, "admin");
    for (const admin of admins) {
      await queueEmailForEvent(ctx, EMAIL_TEMPLATES.NEW_USER_ADMIN, {
        recipientEmail: admin.email,
        recipientName: admin.name,
        recipientUserId: admin.userId,
        variables: {
          user_email: recipientEmail,
          user_name: recipientName,
        },
        eventId: args.eventId,
      });
    }
  },
});

/**
 * Handler: registration.invited -> User Invitation Email
 */
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const onUserInvited = internalMutation({
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  args: { eventId: v.id("events") },
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    const eventRecord = await getEventRecord(ctx, args.eventId);
    if (!eventRecord) return;

    const { payload } = eventRecord;
    if (payload.sendNotification === false) return;

    const invitation = payload.invitationId
      ? await ctx.db.get(payload.invitationId)
      : null;
    const inviter = payload.invitedBy
      ? await ctx.db.get(payload.invitedBy)
      : null;
    const settings = await getEmailSettings(ctx);
    const inviteToken =
      invitation?.token ?? payload.token ?? payload.invitationToken ?? "";

    await queueEmailForEvent(ctx, EMAIL_TEMPLATES.INVITATION, {
      recipientEmail: payload.email ?? "",
      recipientName:
        [payload.firstName, payload.lastName].filter(Boolean).join(" ") ||
        undefined,
      variables: {
        inviter_name: toDisplayName(inviter),
        invite_url:
          payload.inviteUrl ??
          (inviteToken
            ? buildWebsiteUrl(settings.siteUrl, `/register?token=${inviteToken}`)
            : buildWebsiteUrl(settings.siteUrl, "/register")),
        role: payload.role ?? "",
      },
      eventId: args.eventId,
    });
  },
});

/**
 * Handler: auth.login -> New Device Login Alert
 * Only sends if the device/IP is new for this user (simplified: always sends for now).
 */
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const onLoggedIn = internalMutation({
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  args: { eventId: v.id("events") },
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    const eventRecord = await getEventRecord(ctx, args.eventId);
    if (!eventRecord) return;

    const { event, payload } = eventRecord;
    const user = await getUserByAnyId(ctx, payload.userId ?? event.actorId);
    if (!user || !user.email) return;

    const device = payload.device ?? payload.userAgent ?? "Unknown device";
    const ipAddress = payload.ip ?? payload.ipAddress ?? event.actorIp ?? "Unknown";

    const recentAlerts = await ctx.db
      .query("emailQueue")
      .withIndex("by_recipient", (q: any) => q.eq("to", user.email))
      .order("desc")
      .take(25);

    const alreadySeen = recentAlerts.some((queuedEmail: any) => {
      if (queuedEmail.templateSlug !== EMAIL_TEMPLATES.LOGIN_NEW_DEVICE) {
        return false;
      }
      const variables = parsePayload(queuedEmail.templateVariables);
      return (
        variables.device === device &&
        variables.ip_address === ipAddress &&
        queuedEmail.status !== "failed" &&
        queuedEmail.status !== "cancelled"
      );
    });

    if (alreadySeen) return;

    await queueEmailForEvent(ctx, EMAIL_TEMPLATES.LOGIN_NEW_DEVICE, {
      recipientEmail: user.email,
      recipientName: toDisplayName(user),
      recipientUserId: getUserIdentifier(user),
      variables: {
        device,
        ip_address: ipAddress,
        location: payload.location ?? "Unknown location",
        login_time: new Date(payload.loginAt ?? event.emittedAt).toISOString(),
      },
      eventId: args.eventId,
    });
  },
});

/**
 * Handler: auth.login (failed) -> Failed Login Attempts Alert to Admins
 * Only sends when 5+ failures for the same email within 15 minutes.
 */
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const onLoginFailed = internalMutation({
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  args: { eventId: v.id("events") },
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    const eventRecord = await getEventRecord(ctx, args.eventId);
    if (!eventRecord) return;

    const { event, payload } = eventRecord;
    const targetEmail = payload.email;
    if (!targetEmail) return;

    // Count recent failures for this email (last 15 minutes)
    const fifteenMinutesAgo = Date.now() - 15 * 60 * 1000;
    const recentFailures = await ctx.db
      .query("failedLoginAttempts")
      .withIndex("by_email", (q: any) =>
        q.eq("email", targetEmail).gte("attemptedAt", fifteenMinutesAgo),
      )
      .take(25);

    // Only send if 5+ failures
    if (recentFailures.length < 5) return;

    const existingAlerts = await ctx.db
      .query("emailQueue")
      .withIndex("by_template", (q: any) =>
        q.eq("templateSlug", EMAIL_TEMPLATES.FAILED_LOGIN).gte("createdAt", fifteenMinutesAgo),
      )
      .take(50);

    const alreadyAlerted = existingAlerts.some((queuedEmail: any) => {
      const variables = parsePayload(queuedEmail.templateVariables);
      return variables.target_email === targetEmail;
    });
    if (alreadyAlerted) return;

    const admins = await resolveRecipients(ctx, "admin");
    for (const admin of admins) {
      await queueEmailForEvent(ctx, EMAIL_TEMPLATES.FAILED_LOGIN, {
        recipientEmail: admin.email,
        recipientName: admin.name,
        recipientUserId: admin.userId,
        variables: {
          target_email: targetEmail,
          attempt_count: String(recentFailures.length),
          ip_address: payload.ip ?? event.actorIp ?? "Unknown",
        },
        eventId: args.eventId,
      });
    }
  },
});

/**
 * Handler: password.reset_requested -> Password Reset Link
 */
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const onPasswordResetRequested = internalMutation({
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  args: { eventId: v.id("events") },
  handler: async () => {
    // Password reset emails are queued directly at the point where the secure
    // reset URL is generated. Keeping this listener active would create a
    // second, often incomplete copy of the email.
  },
});

/**
 * Handler: password.changed -> Password Changed Confirmation
 */
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const onPasswordChanged = internalMutation({
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  args: { eventId: v.id("events") },
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    const eventRecord = await getEventRecord(ctx, args.eventId);
    if (!eventRecord) return;

    const { event, payload } = eventRecord;
    const user = await getUserByAnyId(ctx, payload.userId ?? event.actorId);
    if (!user || !user.email) return;

    await queueEmailForEvent(ctx, EMAIL_TEMPLATES.PASSWORD_CHANGED, {
      recipientEmail: user.email,
      recipientName: toDisplayName(user),
      recipientUserId: getUserIdentifier(user),
      variables: {
        ip_address: event.actorIp ?? payload.ip ?? "Unknown",
        changed_at: new Date(event.emittedAt).toISOString(),
      },
      eventId: args.eventId,
    });
  },
});

/**
 * Handler: post.published -> Author Notification + Subscriber Notification
 */
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const onPostPublished = internalMutation({
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  args: { eventId: v.id("events") },
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    const eventRecord = await getEventRecord(ctx, args.eventId);
    if (!eventRecord) return;

    const { event, payload } = eventRecord;
    const settings = await getEmailSettings(ctx);
    const postContext = await getPostContext(
      ctx,
      payload.postId,
      settings.siteUrl,
    );
    if (!postContext) return;

    const author =
      postContext.author ??
      (await getUserByAnyId(
        ctx,
        payload.authorId ?? event.actorId ?? postContext.post.authorId,
      ));

    if (author?.email) {
      await queueEmailForEvent(ctx, EMAIL_TEMPLATES.POST_PUBLISHED_AUTHOR, {
        recipientEmail: author.email,
        recipientName: toDisplayName(author),
        recipientUserId: getUserIdentifier(author),
        variables: {
          title: postContext.post.title,
          post_title: postContext.post.title,
          post_url: postContext.postUrl,
          published_at: new Date(
            postContext.post.publishedAt ?? event.emittedAt,
          ).toISOString(),
        },
        eventId: args.eventId,
      });
    }

    const customers = await getCustomerRecipients(ctx);
    for (const user of customers) {
      if (author && user.userId === getUserIdentifier(author)) continue;

      await queueEmailForEvent(ctx, EMAIL_TEMPLATES.POST_PUBLISHED_SUBSCRIBERS, {
        recipientEmail: user.email,
        recipientName: user.name,
        recipientUserId: user.userId,
        variables: {
          title: postContext.post.title,
          post_title: postContext.post.title,
          excerpt: postContext.excerpt,
          post_excerpt: postContext.excerpt,
          post_url: postContext.postUrl,
          author_name: author ? toDisplayName(author) : "",
        },
        eventId: args.eventId,
        correlationId: event.correlationId,
      });
    }
  },
});

/**
 * Handler: post.scheduled -> Schedule Reminder to Author
 */
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const onPostScheduled = internalMutation({
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  args: { eventId: v.id("events") },
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    const eventRecord = await getEventRecord(ctx, args.eventId);
    if (!eventRecord) return;

    const { event, payload } = eventRecord;
    const settings = await getEmailSettings(ctx);
    const postContext = await getPostContext(
      ctx,
      payload.postId,
      settings.siteUrl,
    );
    const author = await getUserByAnyId(
      ctx,
      payload.authorId ?? event.actorId ?? postContext?.post.authorId,
    );
    if (!author || !author.email) return;

    await queueEmailForEvent(ctx, EMAIL_TEMPLATES.POST_SCHEDULED, {
      recipientEmail: author.email,
      recipientName: toDisplayName(author),
      recipientUserId: getUserIdentifier(author),
      variables: {
        title: postContext?.post.title ?? payload.title ?? "",
        post_title: postContext?.post.title ?? payload.title ?? "",
        date:
          payload.scheduledDate ??
          payload.publishDate ??
          String(postContext?.post.scheduledAt ?? ""),
        scheduled_date:
          payload.scheduledDate ??
          payload.publishDate ??
          String(postContext?.post.scheduledAt ?? ""),
        edit_url: buildWebsiteUrl(
          settings.siteUrl,
          `/admin/posts/${payload.postId ?? ""}/edit`,
        ),
      },
      eventId: args.eventId,
    });
  },
});

/**
 * Handler: comment.created -> Author Notification + Moderation Notification
 */
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const onCommentCreated = internalMutation({
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  args: { eventId: v.id("events") },
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    const eventRecord = await getEventRecord(ctx, args.eventId);
    if (!eventRecord) return;

    const { payload } = eventRecord;
    const settings = await getEmailSettings(ctx);
    const commentContext = await getCommentContext(
      ctx,
      payload.commentId,
      settings.siteUrl,
    );
    if (!commentContext) return;

    if (
      commentContext.postAuthor?.email &&
      commentContext.postAuthor._id !== commentContext.commentAuthor?._id
    ) {
      await queueEmailForEvent(ctx, EMAIL_TEMPLATES.NEW_COMMENT_AUTHOR, {
        recipientEmail: commentContext.postAuthor.email,
        recipientName: toDisplayName(commentContext.postAuthor),
        recipientUserId: getUserIdentifier(commentContext.postAuthor),
        variables: {
          post_title: commentContext.post.title,
          commenter_name:
            commentContext.comment.authorName ??
            toDisplayName(commentContext.commentAuthor),
          comment_excerpt: commentContext.commentExcerpt,
          post_url: commentContext.postUrl,
          comment_url: commentContext.commentUrl,
        },
        eventId: args.eventId,
      });
    }

    if (commentContext.comment.status !== "approved") {
      const admins = await resolveRecipients(ctx, "admin");
      for (const admin of admins) {
        await queueEmailForEvent(ctx, EMAIL_TEMPLATES.COMMENT_MODERATION, {
          recipientEmail: admin.email,
          recipientName: admin.name,
          recipientUserId: admin.userId,
          variables: {
            post_title: commentContext.post.title,
            commenter_name:
              commentContext.comment.authorName ??
              toDisplayName(commentContext.commentAuthor),
            comment_excerpt: commentContext.commentExcerpt,
            moderation_url: buildWebsiteUrl(
              settings.siteUrl,
              "/admin/comments?status=pending",
            ),
          },
          eventId: args.eventId,
        });
      }
    }
  },
});

/**
 * Handler: comment.approved -> Notify the commenter
 */
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const onCommentApproved = internalMutation({
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  args: { eventId: v.id("events") },
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    const eventRecord = await getEventRecord(ctx, args.eventId);
    if (!eventRecord) return;

    const { payload } = eventRecord;
    const settings = await getEmailSettings(ctx);
    const commentContext = await getCommentContext(
      ctx,
      payload.commentId,
      settings.siteUrl,
    );
    if (!commentContext?.commentAuthor?.email) return;

    await queueEmailForEvent(ctx, EMAIL_TEMPLATES.COMMENT_APPROVED, {
      recipientEmail: commentContext.commentAuthor.email,
      recipientName: toDisplayName(commentContext.commentAuthor),
      recipientUserId: getUserIdentifier(commentContext.commentAuthor),
      variables: {
        post_title: commentContext.post.title,
        comment_url: commentContext.commentUrl,
        comment_excerpt: commentContext.commentExcerpt,
      },
      eventId: args.eventId,
    });
  },
});

/**
 * Handler: comment.created (reply) -> Notify the parent commenter
 * This handler checks if the comment is a reply (has parentCommentId).
 */
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const onCommentReplied = internalMutation({
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  args: { eventId: v.id("events") },
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    const eventRecord = await getEventRecord(ctx, args.eventId);
    if (!eventRecord) return;

    const { payload } = eventRecord;
    const settings = await getEmailSettings(ctx);
    const commentContext = await getCommentContext(
      ctx,
      payload.commentId,
      settings.siteUrl,
    );
    if (!commentContext?.comment.parentId) return;

    const parentComment = await ctx.db.get(commentContext.comment.parentId);
    if (!parentComment?.authorId) return;
    if (parentComment.authorId === commentContext.comment.authorId) return;

    const parentAuthor = await getUserByAnyId(ctx, parentComment.authorId);
    if (!parentAuthor?.email) return;

    await queueEmailForEvent(ctx, EMAIL_TEMPLATES.COMMENT_REPLY, {
      recipientEmail: parentAuthor.email,
      recipientName: toDisplayName(parentAuthor),
      recipientUserId: getUserIdentifier(parentAuthor),
      variables: {
        replier_name:
          commentContext.comment.authorName ??
          toDisplayName(commentContext.commentAuthor),
        post_title: commentContext.post.title,
        reply_excerpt: commentContext.commentExcerpt,
        comment_url: commentContext.commentUrl,
      },
      eventId: args.eventId,
    });
  },
});

/**
 * Handler: role.assigned -> Role Changed Notification
 */
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const onRoleAssigned = internalMutation({
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  args: { eventId: v.id("events") },
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    const eventRecord = await getEventRecord(ctx, args.eventId);
    if (!eventRecord) return;

    const { payload } = eventRecord;
    const targetUserId = payload.userId ?? payload.targetUserId;
    if (!targetUserId) return;

    const user = await getUserByAnyId(ctx, targetUserId);

    if (user && user.email) {
      await queueEmailForEvent(ctx, EMAIL_TEMPLATES.ROLE_CHANGED, {
        recipientEmail: user.email,
        recipientName: toDisplayName(user),
        recipientUserId: getUserIdentifier(user),
        variables: {
          role:
            payload.newRole ??
            payload.newRoleName ??
            payload.newRoleSlug ??
            payload.roleName ??
            "",
          old_role:
            payload.oldRole ??
            payload.previousRole ??
            payload.oldRoleName ??
            "",
        },
        eventId: args.eventId,
      });
    }
  },
});

/**
 * Handler: revision.restored -> Revision Restored Alert to Editor/Author
 */
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const onRevisionRestored = internalMutation({
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  args: { eventId: v.id("events") },
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    const eventRecord = await getEventRecord(ctx, args.eventId);
    if (!eventRecord) return;

    const { payload } = eventRecord;
    const post = payload.postId ? await ctx.db.get(payload.postId) : null;
    const employees = await resolveRecipients(ctx, "employee");
    const actor = await getUserByAnyId(ctx, payload.restoredBy);
    const actorName = toDisplayName(actor) || "Someone";

    for (const emp of employees) {
      await queueEmailForEvent(ctx, EMAIL_TEMPLATES.REVISION_RESTORED, {
        recipientEmail: emp.email,
        recipientName: emp.name,
        recipientUserId: emp.userId,
        variables: {
          user: actorName,
          post_title: post?.title ?? payload.postTitle ?? "",
          revision_date:
            payload.revisionDate ??
            (post?.updatedAt ? new Date(post.updatedAt).toISOString() : ""),
        },
        eventId: args.eventId,
      });
    }
  },
});

/**
 * Handler: media.uploaded -> Storage Warning (only if storage > 80%)
 * Sends at most once per 24 hours.
 */
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const onMediaUploaded = internalMutation({
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  args: { eventId: v.id("events") },
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    const eventRecord = await getEventRecord(ctx, args.eventId);
    if (!eventRecord) return;

    const mediaSettingsDoc = await ctx.db
      .query("settings")
      .withIndex("by_section", (q: any) => q.eq("section", "media"))
      .unique();
    const mediaSettings = (mediaSettingsDoc?.values ?? {}) as Record<
      string,
      unknown
    >;
    const storageQuotaBytes =
      typeof mediaSettings.storageQuotaBytes === "number"
        ? mediaSettings.storageQuotaBytes
        : 5 * 1024 * 1024 * 1024;

    const mediaRows = await ctx.db.query("media").take(5000);
    const usedBytes = mediaRows.reduce(
      (sum: number, media: any) => sum + (media.fileSize ?? 0),
      0,
    );
    const usagePercent = Math.round((usedBytes / storageQuotaBytes) * 100);
    if (usagePercent < 80) return;

    // Check for deduplication: at most once per 24 hours
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
    const recentWarnings = await ctx.db
      .query("emailQueue")
      .withIndex("by_template", (q: ConvexQueryBuilder) =>
        q
          .eq("templateSlug", EMAIL_TEMPLATES.MEDIA_STORAGE)
          .gte("createdAt", oneDayAgo),
      )
      .take(1);

    if (recentWarnings.length > 0) return;

    const admins = await resolveRecipients(ctx, "admin");
    for (const admin of admins) {
      await queueEmailForEvent(ctx, EMAIL_TEMPLATES.MEDIA_STORAGE, {
        recipientEmail: admin.email,
        recipientName: admin.name,
        recipientUserId: admin.userId,
        variables: {
          usage_percent: String(usagePercent),
          used_space: `${(usedBytes / (1024 * 1024 * 1024)).toFixed(1)} GB`,
          total_space: `${(storageQuotaBytes / (1024 * 1024 * 1024)).toFixed(1)} GB`,
        },
        eventId: args.eventId,
      });
    }
  },
});

/**
 * Handler: settings.updated -> Settings Changed Alert to Admins
 */
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const onSettingsUpdated = internalMutation({
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  args: { eventId: v.id("events") },
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    const eventRecord = await getEventRecord(ctx, args.eventId);
    if (!eventRecord) return;

    const { event, payload } = eventRecord;

    // Don't send email for email template changes (avoid noise)
    if (payload.section === "email_templates") return;

    const actor = await getUserByAnyId(ctx, payload.updatedBy ?? event.actorId);
    const admins = await resolveRecipients(ctx, "admin");
    for (const admin of admins) {
      // Don't notify the admin who made the change
      if (event.actorId && admin.userId === event.actorId) continue;

      await queueEmailForEvent(ctx, EMAIL_TEMPLATES.SETTINGS_CHANGED, {
        recipientEmail: admin.email,
        recipientName: admin.name,
        recipientUserId: admin.userId,
        variables: {
          section: payload.section ?? "",
          changed_by: toDisplayName(actor) || "Unknown",
        },
        eventId: args.eventId,
      });
    }
  },
});

/**
 * Handler: seo.sitemap_generated -> Sitemap Generated Alert to Admins
 */
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const onSitemapGenerated = internalMutation({
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  args: { eventId: v.id("events") },
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    const eventRecord = await getEventRecord(ctx, args.eventId);
    if (!eventRecord) return;

    const { payload } = eventRecord;

    const admins = await resolveRecipients(ctx, "admin");
    for (const admin of admins) {
      await queueEmailForEvent(ctx, EMAIL_TEMPLATES.SITEMAP_GENERATED, {
        recipientEmail: admin.email,
        recipientName: admin.name,
        recipientUserId: admin.userId,
        variables: {
          url_count: String(payload.urlCount ?? payload.pageCount ?? ""),
          sitemap_url: payload.sitemapUrl ?? payload.url ?? "",
        },
        eventId: args.eventId,
      });
    }
  },
});

/**
 * Handler: api.webhook_triggered -> Webhook Failure Alert
 * Only sends for failed webhooks (status >= 400 or network error).
 */
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const onWebhookTriggered = internalMutation({
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  args: { eventId: v.id("events") },
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    const eventRecord = await getEventRecord(ctx, args.eventId);
    if (!eventRecord) return;

    const { payload } = eventRecord;

    // Only send for failures
    const statusCode = Number(payload.statusCode ?? "0");
    const isFailure =
      statusCode >= 400 || payload.networkError === true || payload.success === false;
    if (!isFailure) return;

    const admins = await resolveRecipients(ctx, "admin");
    for (const admin of admins) {
      await queueEmailForEvent(ctx, EMAIL_TEMPLATES.WEBHOOK_FAILURE, {
        recipientEmail: admin.email,
        recipientName: admin.name,
        recipientUserId: admin.userId,
        variables: {
          endpoint: payload.endpoint ?? payload.url ?? "",
          status_code: statusCode > 0 ? String(statusCode) : "",
          error: payload.error ?? payload.errorMessage ?? "",
        },
        eventId: args.eventId,
      });
    }
  },
});

/**
 * Handler: profile.deactivated -> Account Deactivated Notification
 */
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const onProfileDeactivated = internalMutation({
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  args: { eventId: v.id("events") },
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    const eventRecord = await getEventRecord(ctx, args.eventId);
    if (!eventRecord) return;

    const { event, payload } = eventRecord;
    const targetUserId = payload.userId ?? payload.targetUserId ?? event.actorId;
    if (!targetUserId) return;

    const user = await getUserByAnyId(ctx, targetUserId);

    if (user && user.email) {
      await queueEmailForEvent(ctx, EMAIL_TEMPLATES.ACCOUNT_DEACTIVATED, {
        recipientEmail: user.email,
        recipientName: toDisplayName(user),
        recipientUserId: getUserIdentifier(user),
        variables: {
          reason: payload.reason ?? "",
          support_email: "support@convexpress.com",
        },
        eventId: args.eventId,
      });
    }
  },
});

/**
 * Handler: profile.deleted -> User Deletion Confirmation
 * Note: profile.deleted is not in the existing event constants.
 * This handler will be wired when the event is available.
 */
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const onProfileDeleted = internalMutation({
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  args: { eventId: v.id("events") },
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    const eventRecord = await getEventRecord(ctx, args.eventId);
    if (!eventRecord) return;

    const { payload } = eventRecord;
    // The user may already be deleted, so use the payload email
    const email = payload.email;
    const name = payload.name ?? payload.displayName;
    if (!email) return;

    await queueEmailForEvent(ctx, EMAIL_TEMPLATES.USER_DELETION, {
      recipientEmail: email,
      recipientName: name,
      variables: {
        deletion_date: new Date().toISOString(),
        data_retention_days: "30",
      },
      eventId: args.eventId,
    });
  },
});

const onTicketRepliedConfig: any = {
  args: { eventId: v.id("events") },
  handler: async (ctx: any, args: any) => {
    const eventRecord = await getEventRecord(ctx, args.eventId);
    if (!eventRecord) return;

    const { payload } = eventRecord;
    if (payload.isInternal === true) return;

    const settings = await getEmailSettings(ctx);
    const ticketContext = await getTicketContext(
      ctx,
      payload.ticketId,
      settings.siteUrl,
    );
    if (!ticketContext) return;

    const message = payload.messageId ? await ctx.db.get(payload.messageId) : null;
    const replyExcerpt = excerptText(message?.content);

    if (payload.senderType === "admin" && ticketContext.owner?.email) {
      await queueEmailForEvent(ctx, EMAIL_TEMPLATES.TICKET_REPLY_NOTIFICATION, {
        recipientEmail: ticketContext.owner.email,
        recipientName: toDisplayName(ticketContext.owner),
        recipientUserId: getUserIdentifier(ticketContext.owner),
        variables: {
          user_name: toDisplayName(ticketContext.owner),
          ticket_id: ticketContext.ticket.ticketNumber,
          subject: ticketContext.ticket.subject,
          reply_excerpt: replyExcerpt,
          ticket_url: ticketContext.ticketUrl,
        },
        eventId: args.eventId,
      });
    }

    if (payload.senderType === "user" && ticketContext.assignee?.email) {
      await queueEmailForEvent(ctx, EMAIL_TEMPLATES.TICKET_USER_REPLY, {
        recipientEmail: ticketContext.assignee.email,
        recipientName: toDisplayName(ticketContext.assignee),
        recipientUserId: getUserIdentifier(ticketContext.assignee),
        variables: {
          agent_name: toDisplayName(ticketContext.assignee),
          ticket_id: ticketContext.ticket.ticketNumber,
          subject: ticketContext.ticket.subject,
          user_name:
            ticketContext.owner?.displayName ??
            ticketContext.ticket.userNameSnapshot,
          reply_excerpt: replyExcerpt,
          ticket_url: ticketContext.ticketUrl,
        },
        eventId: args.eventId,
      });
    }
  },
};

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const onTicketReplied = internalMutation(onTicketRepliedConfig);

const onTicketAssignedConfig: any = {
  args: { eventId: v.id("events") },
  handler: async (ctx: any, args: any) => {
    const eventRecord = await getEventRecord(ctx, args.eventId);
    if (!eventRecord) return;

    const { payload } = eventRecord;
    const settings = await getEmailSettings(ctx);
    const ticketContext = await getTicketContext(
      ctx,
      payload.ticketId,
      settings.siteUrl,
    );
    if (!ticketContext?.assignee?.email) return;

    await queueEmailForEvent(ctx, EMAIL_TEMPLATES.TICKET_ASSIGNED, {
      recipientEmail: ticketContext.assignee.email,
      recipientName: toDisplayName(ticketContext.assignee),
      recipientUserId: getUserIdentifier(ticketContext.assignee),
      variables: {
        agent_name: toDisplayName(ticketContext.assignee),
        ticket_id: ticketContext.ticket.ticketNumber,
        subject: ticketContext.ticket.subject,
        priority: ticketContext.ticket.priority,
        category: ticketContext.ticket.category,
        ticket_url: ticketContext.ticketUrl,
      },
      eventId: args.eventId,
    });
  },
};

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const onTicketAssigned = internalMutation(onTicketAssignedConfig);

const onTicketResolvedConfig: any = {
  args: { eventId: v.id("events") },
  handler: async (ctx: any, args: any) => {
    const eventRecord = await getEventRecord(ctx, args.eventId);
    if (!eventRecord) return;

    const { payload } = eventRecord;
    const settings = await getEmailSettings(ctx);
    const ticketContext = await getTicketContext(
      ctx,
      payload.ticketId,
      settings.siteUrl,
    );
    if (!ticketContext?.owner?.email) return;

    await queueEmailForEvent(ctx, EMAIL_TEMPLATES.TICKET_RESOLVED, {
      recipientEmail: ticketContext.owner.email,
      recipientName: toDisplayName(ticketContext.owner),
      recipientUserId: getUserIdentifier(ticketContext.owner),
      variables: {
        user_name: toDisplayName(ticketContext.owner),
        ticket_id: ticketContext.ticket.ticketNumber,
        subject: ticketContext.ticket.subject,
        rating_url: ticketContext.ticketUrl,
        ticket_url: ticketContext.ticketUrl,
      },
      eventId: args.eventId,
    });
  },
};

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const onTicketResolved = internalMutation(onTicketResolvedConfig);

const onKbWorkflowStepReadyConfig: any = {
  args: { eventId: v.id("events") },
  handler: async (ctx: any, args: any) => {
    const eventRecord = await getEventRecord(ctx, args.eventId);
    if (!eventRecord) return;

    const { payload } = eventRecord;
    const settings = await getEmailSettings(ctx);
    const articleContext = await getKbArticleContext(
      ctx,
      payload.articleId,
      settings.siteUrl,
    );
    const reviewer = payload.assigneeId
      ? await ctx.db.get(payload.assigneeId)
      : null;
    if (!articleContext || !reviewer?.email) return;

    await queueEmailForEvent(ctx, EMAIL_TEMPLATES.KB_WORKFLOW_STEP_READY, {
      recipientEmail: reviewer.email,
      recipientName: toDisplayName(reviewer),
      recipientUserId: getUserIdentifier(reviewer),
      variables: {
        reviewer_name: toDisplayName(reviewer),
        article_title: articleContext.article.title,
        article_url: articleContext.articleUrl,
        step_name: payload.stepName ?? payload.workflowStep ?? "Review",
        author_name: articleContext.author ? toDisplayName(articleContext.author) : "",
      },
      eventId: args.eventId,
    });
  },
};

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const onKbWorkflowStepReady = internalMutation(onKbWorkflowStepReadyConfig);

const onKbWorkflowApprovedConfig: any = {
  args: { eventId: v.id("events") },
  handler: async (ctx: any, args: any) => {
    const eventRecord = await getEventRecord(ctx, args.eventId);
    if (!eventRecord) return;

    const { payload } = eventRecord;
    const settings = await getEmailSettings(ctx);
    const articleContext = await getKbArticleContext(
      ctx,
      payload.articleId,
      settings.siteUrl,
    );
    const reviewer = await getUserByAnyId(ctx, payload.reviewerId);
    if (!articleContext?.author?.email) return;

    await queueEmailForEvent(ctx, EMAIL_TEMPLATES.KB_WORKFLOW_APPROVED, {
      recipientEmail: articleContext.author.email,
      recipientName: toDisplayName(articleContext.author),
      recipientUserId: getUserIdentifier(articleContext.author),
      variables: {
        author_name: toDisplayName(articleContext.author),
        article_title: articleContext.article.title,
        article_url: articleContext.articleUrl,
        reviewer_name: toDisplayName(reviewer),
        next_step: payload.nextStep ?? "Published",
      },
      eventId: args.eventId,
    });
  },
};

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const onKbWorkflowApproved = internalMutation(onKbWorkflowApprovedConfig);

const onKbWorkflowRejectedConfig: any = {
  args: { eventId: v.id("events") },
  handler: async (ctx: any, args: any) => {
    const eventRecord = await getEventRecord(ctx, args.eventId);
    if (!eventRecord) return;

    const { payload } = eventRecord;
    const settings = await getEmailSettings(ctx);
    const articleContext = await getKbArticleContext(
      ctx,
      payload.articleId,
      settings.siteUrl,
    );
    const reviewer = await getUserByAnyId(ctx, payload.reviewerId);
    if (!articleContext?.author?.email) return;

    await queueEmailForEvent(ctx, EMAIL_TEMPLATES.KB_WORKFLOW_REJECTED, {
      recipientEmail: articleContext.author.email,
      recipientName: toDisplayName(articleContext.author),
      recipientUserId: getUserIdentifier(articleContext.author),
      variables: {
        author_name: toDisplayName(articleContext.author),
        article_title: articleContext.article.title,
        article_url: articleContext.articleUrl,
        reviewer_name: toDisplayName(reviewer),
        rejection_reason: payload.rejectionReason ?? "",
      },
      eventId: args.eventId,
    });
  },
};

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const onKbWorkflowRejected = internalMutation(onKbWorkflowRejectedConfig);

const onKbCommentCreatedConfig: any = {
  args: { eventId: v.id("events") },
  handler: async (ctx: any, args: any) => {
    const eventRecord = await getEventRecord(ctx, args.eventId);
    if (!eventRecord) return;

    const { payload } = eventRecord;
    const settings = await getEmailSettings(ctx);
    const articleContext = await getKbArticleContext(
      ctx,
      payload.articleId,
      settings.siteUrl,
    );
    const comment = payload.commentId ? await ctx.db.get(payload.commentId) : null;
    const commentAuthor = payload.userId ? await ctx.db.get(payload.userId) : null;
    if (!articleContext || !comment) return;

    const recipients =
      articleContext.author && articleContext.author.email
        ? [
            {
              email: articleContext.author.email,
              name: toDisplayName(articleContext.author),
              userId: getUserIdentifier(articleContext.author),
            },
          ]
        : await resolveRecipients(ctx, "admin");

    for (const recipient of recipients) {
      await queueEmailForEvent(ctx, EMAIL_TEMPLATES.KB_COMMENT_NOTIFICATION, {
        recipientEmail: recipient.email,
        recipientName: recipient.name,
        recipientUserId: recipient.userId,
        variables: {
          recipient_name: recipient.name ?? "",
          article_title: articleContext.article.title,
          article_url: articleContext.articleUrl,
          comment_author: toDisplayName(commentAuthor),
          comment_excerpt: excerptText(comment.content),
        },
        eventId: args.eventId,
      });
    }
  },
};

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const onKbCommentCreated = internalMutation(onKbCommentCreatedConfig);

const onLmsCourseEnrolledConfig: any = {
  args: { eventId: v.id("events") },
  handler: async (ctx: any, args: any) => {
    const eventRecord = await getEventRecord(ctx, args.eventId);
    if (!eventRecord) return;

    const { event, payload } = eventRecord;
    const settings = await getEmailSettings(ctx);
    const lms = await getLmsContext(ctx, payload, settings.siteUrl);
    if (!lms.learner?.email) return;

    await queueEmailForEvent(ctx, EMAIL_TEMPLATES.LMS_COURSE_ENROLLED, {
      recipientEmail: lms.learner.email,
      recipientName: toDisplayName(lms.learner),
      recipientUserId: getUserIdentifier(lms.learner),
      variables: {
        course_title: lms.courseTitle,
        course_url: lms.courseUrl,
      },
      eventId: args.eventId,
      correlationId: event.correlationId,
    });
  },
};

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const onLmsCourseEnrolled = internalMutation(onLmsCourseEnrolledConfig);

const onLmsCourseUnenrolledConfig: any = {
  args: { eventId: v.id("events") },
  handler: async (ctx: any, args: any) => {
    const eventRecord = await getEventRecord(ctx, args.eventId);
    if (!eventRecord) return;

    const { event, payload } = eventRecord;
    const settings = await getEmailSettings(ctx);
    const lms = await getLmsContext(ctx, payload, settings.siteUrl);
    if (!lms.learner?.email) return;

    await queueEmailForEvent(ctx, EMAIL_TEMPLATES.LMS_COURSE_UNENROLLED, {
      recipientEmail: lms.learner.email,
      recipientName: toDisplayName(lms.learner),
      recipientUserId: getUserIdentifier(lms.learner),
      variables: {
        course_title: lms.courseTitle,
        course_public_url: lms.coursePublicUrl,
      },
      eventId: args.eventId,
      correlationId: event.correlationId,
    });
  },
};

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const onLmsCourseUnenrolled = internalMutation(onLmsCourseUnenrolledConfig);

const onLmsCourseCompletedConfig: any = {
  args: { eventId: v.id("events") },
  handler: async (ctx: any, args: any) => {
    const eventRecord = await getEventRecord(ctx, args.eventId);
    if (!eventRecord) return;

    const { event, payload } = eventRecord;
    const settings = await getEmailSettings(ctx);
    const lms = await getLmsContext(ctx, payload, settings.siteUrl);
    if (!lms.learner?.email) return;

    await queueEmailForEvent(ctx, EMAIL_TEMPLATES.LMS_COURSE_COMPLETED, {
      recipientEmail: lms.learner.email,
      recipientName: toDisplayName(lms.learner),
      recipientUserId: getUserIdentifier(lms.learner),
      variables: {
        course_title: lms.courseTitle,
        course_url: lms.courseUrl,
        completed_at: new Date(event.emittedAt).toISOString(),
      },
      eventId: args.eventId,
      correlationId: event.correlationId,
    });
  },
};

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const onLmsCourseCompleted = internalMutation(onLmsCourseCompletedConfig);

const onLmsCertificateIssuedConfig: any = {
  args: { eventId: v.id("events") },
  handler: async (ctx: any, args: any) => {
    const eventRecord = await getEventRecord(ctx, args.eventId);
    if (!eventRecord) return;

    const { event, payload } = eventRecord;
    const settings = await getEmailSettings(ctx);
    const lms = await getLmsContext(ctx, payload, settings.siteUrl);
    if (!lms.learner?.email) return;

    await queueEmailForEvent(ctx, EMAIL_TEMPLATES.LMS_CERTIFICATE_ISSUED, {
      recipientEmail: lms.learner.email,
      recipientName: toDisplayName(lms.learner),
      recipientUserId: getUserIdentifier(lms.learner),
      variables: {
        course_title: lms.courseTitle,
        serial: lms.serial,
        certificate_url: lms.certificateUrl,
      },
      eventId: args.eventId,
      correlationId: event.correlationId,
    });
  },
};

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const onLmsCertificateIssued = internalMutation(onLmsCertificateIssuedConfig);

const onLmsCertificateRevokedConfig: any = {
  args: { eventId: v.id("events") },
  handler: async (ctx: any, args: any) => {
    const eventRecord = await getEventRecord(ctx, args.eventId);
    if (!eventRecord) return;

    const { event, payload } = eventRecord;
    const settings = await getEmailSettings(ctx);
    const lms = await getLmsContext(ctx, payload, settings.siteUrl);
    if (!lms.learner?.email) return;

    await queueEmailForEvent(ctx, EMAIL_TEMPLATES.LMS_CERTIFICATE_REVOKED, {
      recipientEmail: lms.learner.email,
      recipientName: toDisplayName(lms.learner),
      recipientUserId: getUserIdentifier(lms.learner),
      variables: {
        course_title: lms.courseTitle,
        serial: lms.serial,
        course_url: lms.courseUrl,
      },
      eventId: args.eventId,
      correlationId: event.correlationId,
    });
  },
};

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const onLmsCertificateRevoked = internalMutation(onLmsCertificateRevokedConfig);
