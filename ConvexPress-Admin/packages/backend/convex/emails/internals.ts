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
  type MutationCtx,
  type QueryCtx,
} from "../_generated/server";
import type { Doc, Id, TableNames } from "../_generated/dataModel";
import type { HistoricalAuthoringSource } from "../helpers/authoringSnapshot";
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
  parseTemplateVariables,
  withDeclaredDefaults,
} from "../helpers/email";
import { settingsRecord } from "../helpers/settingsReader";
import { getUserIdentifier, lookupUserByIdentifier, requireCan } from "../helpers/permissions";
import { resolveServiceKeyAsync } from "../helpers/serviceKeys";
import {
  queueEmailInternalArgs,
  sendEmailArgs,
  markSentArgs,
  handleSendFailureArgs,
  updateQueueStatusArgs,
  queueRenderedEmailArgs,
  emailStatusValidator,
} from "./validators";
import { DEFAULT_TEMPLATES, templateActiveByDefault } from "./templateDefaults";
import {
  EMAIL_TEMPLATE_REGISTRY_BY_SLUG,
} from "./registry";
import { buildTemplateSampleVariables } from "./testData";
import { emailsDocs } from "../schema/emails.docs.generated";

// ─── Retry Constants ─────────────────────────────────────────────────────────

/** Base delay for exponential backoff (5 seconds) */
const RETRY_BASE_DELAY_MS = 5000;

/** HTTP status codes that are retryable */
const RETRYABLE_STATUS_CODES = new Set([408, 429, 500, 502, 503, 504]);

type DbCtx = Pick<QueryCtx, "db">;

/** Event payloads are JSON written by the emitting system; read fields with `text`. */
type EventPayload = Record<string, unknown>;

function parsePayload(payload: string | undefined): EventPayload {
  if (!payload) return {};
  try {
    const parsed: unknown = JSON.parse(payload);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? { ...parsed } : {};
  } catch {
    return {};
  }
}

/** A payload field as template text: strings as-is, numbers and booleans stringified. */
function text(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return undefined;
}

/** A payload timestamp (epoch ms or date string). */
function timestamp(value: unknown): number | string | undefined {
  return typeof value === "number" || typeof value === "string" ? value : undefined;
}

type DisplayNameSource = {
  displayName?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
};

function toDisplayName(user: DisplayNameSource | null | undefined): string {
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

/** Load a document from an untrusted event-payload id, only if it belongs to `table`. */
async function getPayloadDoc<T extends TableNames>(
  ctx: DbCtx,
  table: T,
  raw: unknown,
): Promise<Doc<T> | null> {
  if (typeof raw !== "string" || raw.length === 0) return null;
  const id = ctx.db.normalizeId(table, raw);
  return id ? await ctx.db.get(table, id) : null;
}

async function getEventRecord(ctx: DbCtx, eventId: Id<"events">) {
  const event = await ctx.db.get("events", eventId);
  if (!event) return null;
  return {
    event,
    payload: parsePayload(event.payload),
  };
}

async function getTemplateRecord(ctx: DbCtx, templateSlug: string) {
  return await ctx.db
    .query("emailTemplates")
    .withIndex("by_slug", (q) => q.eq("slug", templateSlug))
    .unique();
}

async function getUserByAnyId(ctx: DbCtx, identifier: unknown) {
  if (typeof identifier !== "string" || identifier.length === 0) return null;
  return await lookupUserByIdentifier(ctx, identifier);
}

async function getPostContext(ctx: DbCtx, postId: unknown, siteUrl: string) {
  const post = await getPayloadDoc(ctx, "posts", postId);
  if (!post) return null;
  // Pre-retirement posts may still carry legacy article content.
  const source: HistoricalAuthoringSource = post;
  const author = await ctx.db.get("users", post.authorId);
  return {
    post,
    author,
    postUrl: buildWebsiteUrl(siteUrl, `/blog/${post.slug}`),
    excerpt:
      excerptText(post.excerpt) ||
      excerptText(stripHtmlToText(source.content ?? "")) ||
      excerptText(post.title),
  };
}

async function getCommentContext(ctx: DbCtx, commentId: unknown, siteUrl: string) {
  const comment = await getPayloadDoc(ctx, "comments", commentId);
  if (!comment) return null;
  const postContext = await getPostContext(ctx, comment.postId, siteUrl);
  if (!postContext) return null;
  // Comment authors are user identifier strings (Clerk id or users _id).
  const author = await getUserByAnyId(ctx, comment.authorId);
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

async function getTicketContext(ctx: DbCtx, ticketId: unknown, siteUrl: string) {
  const ticket = await getPayloadDoc(ctx, "ticket_tickets", ticketId);
  if (!ticket) return null;
  const assignee = ticket.assignedTo ? await ctx.db.get("users", ticket.assignedTo) : null;
  const owner = await ctx.db.get("users", ticket.userId);
  return {
    ticket,
    assignee,
    owner,
    ticketUrl: buildWebsiteUrl(siteUrl, `/support/tickets/${ticket._id}`),
  };
}

async function getKbArticleContext(ctx: DbCtx, articleId: unknown, siteUrl: string) {
  const article = await getPayloadDoc(ctx, "kb_articles", articleId);
  if (!article) return null;
  const author = await ctx.db.get("users", article.authorId);
  const category = article.categoryId ? await ctx.db.get("kb_categories", article.categoryId) : null;
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

async function getLmsContext(ctx: DbCtx, payload: EventPayload, siteUrl: string) {
  const course = await getPayloadDoc(ctx, "lms_courses", payload.courseId);
  const learner = await getUserByAnyId(ctx, payload.userId);
  const firstLesson = course
    ? await ctx.db
        .query("lms_nodes")
        .withIndex("by_course_kind", (q) =>
          q.eq("courseId", course._id).eq("kind", "lesson"),
        )
        .first()
    : null;
  const issue = await getPayloadDoc(ctx, "lms_certificate_issues", payload.certificateIssueId);
  const serial = text(payload.serial) ?? issue?.serial ?? "";
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
    courseTitle: course?.title ?? text(payload.courseTitle) ?? "your course",
    courseUrl,
    coursePublicUrl,
    certificateUrl,
    serial,
  };
}

async function getCustomerRecipients(ctx: DbCtx) {
  const recipientMap = new Map<
    string,
    { email: string; name?: string; userId: string }
  >();

  for (const roleSlug of ["subscriber", "customer"]) {
    const role = await ctx.db
      .query("roles")
      .withIndex("by_slug", (q) => q.eq("slug", roleSlug))
      .unique();
    if (!role || role.status !== "active") continue;

    const users = await ctx.db
      .query("users")
      .withIndex("by_roleId", (q) => q.eq("roleId", role._id))
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

/**
 * A site's own choice of whether a template is sent, applied by site setup.
 * A template an administrator has turned on or off keeps that choice.
 */
export const applyTemplateDefaultActive = internalMutation({
  args: { slug: v.string(), isActive: v.boolean() },
  returns: v.object({ changed: v.boolean() }),
  handler: async (ctx, { slug, isActive }) => {
    const template = await getTemplateRecord(ctx, slug);
    if (!template || template.activeChangedAt !== undefined || template.isActive === isActive) {
      return { changed: false };
    }
    await ctx.db.patch("emailTemplates", template._id, { isActive, updatedAt: Date.now() });
    return { changed: true };
  },
});

export async function runBootstrapTemplates(ctx: Pick<MutationCtx, "db">, now = Date.now()) {
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
        isActive: templateActiveByDefault(templateDef),
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

    // A template nobody edited follows the shipped default; an edited one
    // keeps its wording and only learns the new default (for "reset").
    const followsDefault = existing.isCustomized !== true;
    const contentStale =
      followsDefault &&
      (existing.subjectTemplate !== templateDef.subjectTemplate ||
        existing.bodyHtml !== templateDef.bodyHtml ||
        existing.preheaderText !== templateDef.preheaderText);

    if (!shouldPatch && !contentStale) continue;

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
      ...(followsDefault
        ? {
            subjectTemplate: templateDef.subjectTemplate,
            bodyHtml: templateDef.bodyHtml,
            preheaderText: templateDef.preheaderText,
          }
        : {}),
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
export const queueEmail = internalMutation({
  args: queueEmailInternalArgs,
  returns: v.union(v.null(), v.id("emailQueue")),
  handler: async (ctx, args) => {
    const variables = parseTemplateVariables(args.variables) ?? {};

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

export const queueRenderedEmail = internalMutation({
  args: queueRenderedEmailArgs,
  returns: v.id("emailQueue"),
  handler: async (ctx, args) => {
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
});

/** Throws unless the caller may manage Email settings (used by the test-send actions). */
export const assertEmailSettingsAccess = internalQuery({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    await requireCan(ctx, "settings.update_email");
    return null;
  },
});

export const getTemplateForTesting = internalQuery({
  args: {
    templateSlug: v.string(),
  },
  returns: v.union(v.null(), emailsDocs.emailTemplates),
  handler: async (ctx, args) => {
    return await getTemplateRecord(ctx, args.templateSlug);
  },
});

export const queueTemplateTestEmail = internalMutation({
  args: {
    templateSlug: v.string(),
    recipientEmail: v.string(),
    recipientName: v.optional(v.string()),
    samplePreset: v.optional(v.string()),
    variableOverrides: v.optional(v.string()),
  },
  returns: v.id("emailQueue"),
  handler: async (ctx, args) => {
    const template = await getTemplateRecord(ctx, args.templateSlug);
    if (!template) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: `Email template "${args.templateSlug}" was not found.`,
      });
    }

    const parsedOverrides = args.variableOverrides
      ? parseTemplateVariables(args.variableOverrides) ?? undefined
      : undefined;

    const settings = await getEmailSettings(ctx);
    // Sample values fill the template's own variables; the site's name and
    // links are real, so a test looks like what customers receive.
    const variables = {
      ...injectGlobalVariables(
        buildTemplateSampleVariables(template.availableVariables, parsedOverrides),
        {},
        args.recipientName,
      ),
      site_name: settings.siteName,
      site_url: settings.siteUrl,
      unsubscribe_url: settings.unsubscribeUrl,
      ...parsedOverrides,
    };

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
});

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
export const sendEmail = internalAction({
  args: sendEmailArgs,
  returns: v.null(),
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
    const emailSettings = settingsRecord(
      await ctx.runQuery(internal.settings.internals.getInternal, { section: "email" }),
    );

    const apiKey = await resolveServiceKeyAsync(emailSettings, "resendApiKey", "RESEND_API_KEY");
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
export const updateStatusAndGetEmail = internalMutation({
  args: {
    queueId: v.id("emailQueue"),
    newStatus: emailStatusValidator,
  },
  returns: v.union(v.null(), v.object({
    to: v.string(),
    toName: v.optional(v.string()),
    from: v.string(),
    fromName: v.string(),
    replyTo: v.optional(v.string()),
    subject: v.string(),
    bodyHtml: v.string(),
    bodyText: v.optional(v.string()),
    templateSlug: v.string(),
    unsubscribeUrl: v.string(),
  })),
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
        .withIndex("by_status", (q) => q.eq("status", "sent"))
        .take(1000); // H-17 FIX: bounded query
      const sentLastMinute = recentMinute.filter(
        (e) => e.sentAt && e.sentAt >= oneMinuteAgo,
      ).length;

      if (sentLastMinute >= settings.rateLimit) {
        // Rate limit exceeded - leave email queued for next cycle
        return null;
      }

      // Count emails sent in the last 24 hours
      const sentLastDay = recentMinute.filter(
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
export const markSent = internalMutation({
  args: markSentArgs,
  returns: v.null(),
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
        .withIndex("by_slug", (q) => q.eq("slug", email.templateSlug))
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
export const handleSendFailure = internalMutation({
  args: handleSendFailureArgs,
  returns: v.null(),
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
export const updateQueueStatus = internalMutation({
  args: updateQueueStatusArgs,
  returns: v.null(),
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
export const updateStatusByResendId = internalMutation({
  args: {
    resendId: v.string(),
    status: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    // Look up the queue record by resendId using the dedicated index
    const email = await ctx.db
      .query("emailQueue")
      .withIndex("by_resend_id", (q) => q.eq("resendId", args.resendId))
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
export const processBatchedEmails = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const now = Date.now();

    // Find queued emails with scheduledFor <= now
    const readyEmails = await ctx.db
      .query("emailQueue")
      .withIndex("by_status_scheduled", (q) =>
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
export const generateDigest = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const now = Date.now();
    const oneWeekAgo = now - 7 * 24 * 60 * 60 * 1000;
    const settings = await getEmailSettings(ctx);
    if (!settings.digestEnabled) return;

    // ─── 1. Weekly Content Digest ──────────────────────────────────────
    // Fetch posts published in the last 7 days
    const recentPosts = await ctx.db
      .query("posts")
      .withIndex("by_status", (q) => q.eq("status", "publish"))
      .order("desc")
      .take(100);

    const postsThisWeek = recentPosts.filter(
      (p) => p.publishedAt && p.publishedAt >= oneWeekAgo,
    );

    if (postsThisWeek.length > 0) {
      // Build the post list for the digest
      const postList = postsThisWeek
        .slice(0, 20)
        .map((p) => `<li><a href="${buildWebsiteUrl(settings.siteUrl, `/blog/${p.slug}`)}">${p.title}</a></li>`)
        .join("\n");

      // Get the weekly digest template
      const digestTemplate = await ctx.db
        .query("emailTemplates")
        .withIndex("by_slug", (q) =>
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

          const variables = withDeclaredDefaults(
            injectGlobalVariables(
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
            ),
            digestTemplate.availableVariables,
            settings.siteUrl,
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
      .withIndex("by_slug", (q) =>
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
          .withIndex("by_author", (q) =>
            q.eq("authorId", employeeUser._id).eq("type", "post").eq("status", "publish"),
          )
          .collect();

        const recentComments: Doc<"comments">[] = [];
        const touchedPosts = new Set<string>();
        for (const post of posts) {
          const comments = await ctx.db
            .query("comments")
            .withIndex("by_post", (q) => q.eq("postId", post._id))
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

        const variables = withDeclaredDefaults(
          injectGlobalVariables(
            {
              comment_summary: `${recentComments.length} comments were posted across ${touchedPosts.size} of your posts this week, including ${recentReplies} replies and ${pendingComments} awaiting moderation.`,
            },
            {
              siteName: settings.siteName,
              siteUrl: settings.siteUrl,
              unsubscribeUrl: settings.unsubscribeUrl,
            },
            employee.name,
          ),
          commentDigestTemplate.availableVariables,
          settings.siteUrl,
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
export const cleanupOldEmails = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const now = Date.now();
    const BATCH_SIZE = 100;

    // Delete sent/delivered emails older than 90 days
    const sentCutoff = now - 90 * 24 * 60 * 60 * 1000;
    const oldSentEmails = await ctx.db
      .query("emailQueue")
      .withIndex("by_created", (q) => q.lt("createdAt", sentCutoff))
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
      .withIndex("by_created", (q) => q.lt("createdAt", failedCutoff))
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
export const bootstrapTemplates = internalMutation({
  args: {},
  returns: v.object({ created: v.number(), updated: v.number() }),
  handler: async (ctx) => {
    return await runBootstrapTemplates(ctx);
  },
});

// ─── Event Handler Functions (23 handlers) ───────────────────────────────────

/**
 * Handler: registration.registered -> Welcome Email + Email Verification + Admin Notification
 */
export const onUserRegistered = internalMutation({
  args: { eventId: v.id("events") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const eventRecord = await getEventRecord(ctx, args.eventId);
    if (!eventRecord) return;

    const { event, payload } = eventRecord;
    const settings = await getEmailSettings(ctx);
    const user =
      (await getUserByAnyId(ctx, text(payload.userId) ?? event.actorId)) ??
      null;
    const recipientEmail = user?.email ?? text(payload.email) ?? "";
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
            text(payload.verificationUrl) ??
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
export const onUserInvited = internalMutation({
  args: { eventId: v.id("events") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const eventRecord = await getEventRecord(ctx, args.eventId);
    if (!eventRecord) return;

    const { payload } = eventRecord;
    if (payload.sendNotification === false) return;

    const invitation = await getPayloadDoc(ctx, "invitations", payload.invitationId);
    const inviter = await getPayloadDoc(ctx, "users", payload.invitedBy);
    const settings = await getEmailSettings(ctx);
    const inviteToken =
      invitation?.token ?? text(payload.token) ?? text(payload.invitationToken) ?? "";

    await queueEmailForEvent(ctx, EMAIL_TEMPLATES.INVITATION, {
      recipientEmail: text(payload.email) ?? "",
      recipientName:
        [payload.firstName, payload.lastName].filter(Boolean).join(" ") ||
        undefined,
      variables: {
        inviter_name: toDisplayName(inviter),
        invite_url:
          text(payload.inviteUrl) ??
          (inviteToken
            ? buildWebsiteUrl(settings.siteUrl, `/register?token=${inviteToken}`)
            : buildWebsiteUrl(settings.siteUrl, "/register")),
        role: text(payload.role) ?? "",
      },
      eventId: args.eventId,
    });
  },
});

/**
 * Handler: auth.login -> New Device Login Alert
 * Only sends if the device/IP is new for this user (simplified: always sends for now).
 */
export const onLoggedIn = internalMutation({
  args: { eventId: v.id("events") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const eventRecord = await getEventRecord(ctx, args.eventId);
    if (!eventRecord) return;

    const { event, payload } = eventRecord;
    const user = await getUserByAnyId(ctx, text(payload.userId) ?? event.actorId);
    if (!user || !user.email) return;

    const device = text(payload.device) ?? text(payload.userAgent) ?? "Unknown device";
    const ipAddress = text(payload.ip) ?? text(payload.ipAddress) ?? event.actorIp ?? "Unknown";

    const recentAlerts = await ctx.db
      .query("emailQueue")
      .withIndex("by_recipient", (q) => q.eq("to", user.email))
      .order("desc")
      .take(25);

    const alreadySeen = recentAlerts.some((queuedEmail) => {
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
        location: text(payload.location) ?? "Unknown location",
        login_time: new Date(timestamp(payload.loginAt) ?? event.emittedAt).toISOString(),
      },
      eventId: args.eventId,
    });
  },
});

/**
 * Handler: auth.login (failed) -> Failed Login Attempts Alert to Admins
 * Only sends when 5+ failures for the same email within 15 minutes.
 */
export const onLoginFailed = internalMutation({
  args: { eventId: v.id("events") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const eventRecord = await getEventRecord(ctx, args.eventId);
    if (!eventRecord) return;

    const { event, payload } = eventRecord;
    const targetEmail = text(payload.email);
    if (!targetEmail) return;

    // Count recent failures for this email (last 15 minutes)
    const fifteenMinutesAgo = Date.now() - 15 * 60 * 1000;
    const recentFailures = await ctx.db
      .query("failedLoginAttempts")
      .withIndex("by_email", (q) =>
        q.eq("email", targetEmail).gte("attemptedAt", fifteenMinutesAgo),
      )
      .take(25);

    // Only send if 5+ failures
    if (recentFailures.length < 5) return;

    const existingAlerts = await ctx.db
      .query("emailQueue")
      .withIndex("by_template", (q) =>
        q.eq("templateSlug", EMAIL_TEMPLATES.FAILED_LOGIN).gte("createdAt", fifteenMinutesAgo),
      )
      .take(50);

    const alreadyAlerted = existingAlerts.some((queuedEmail) => {
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
          ip_address: text(payload.ip) ?? event.actorIp ?? "Unknown",
        },
        eventId: args.eventId,
      });
    }
  },
});

/**
 * Handler: password.reset_requested -> Password Reset Link
 */
export const onPasswordResetRequested = internalMutation({
  args: { eventId: v.id("events") },
  returns: v.null(),
  handler: async () => {
    // Password reset emails are queued directly at the point where the secure
    // reset URL is generated. Keeping this listener active would create a
    // second, often incomplete copy of the email.
  },
});

/**
 * Handler: password.changed -> Password Changed Confirmation
 */
export const onPasswordChanged = internalMutation({
  args: { eventId: v.id("events") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const eventRecord = await getEventRecord(ctx, args.eventId);
    if (!eventRecord) return;

    const { event, payload } = eventRecord;
    const user = await getUserByAnyId(ctx, text(payload.userId) ?? event.actorId);
    if (!user || !user.email) return;

    await queueEmailForEvent(ctx, EMAIL_TEMPLATES.PASSWORD_CHANGED, {
      recipientEmail: user.email,
      recipientName: toDisplayName(user),
      recipientUserId: getUserIdentifier(user),
      variables: {
        ip_address: event.actorIp ?? text(payload.ip) ?? "Unknown",
        changed_at: new Date(event.emittedAt).toISOString(),
      },
      eventId: args.eventId,
    });
  },
});

/**
 * Handler: post.published -> Author Notification + Subscriber Notification
 *
 * Imported posts were already published on their source site; announcing
 * them again would mail every subscriber about old content.
 */
export const onPostPublished = internalMutation({
  args: { eventId: v.id("events") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const eventRecord = await getEventRecord(ctx, args.eventId);
    if (!eventRecord) return;

    const { event, payload } = eventRecord;
    if (payload.imported === true) return;
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
        text(payload.authorId) ?? event.actorId ?? postContext.post.authorId,
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
export const onPostScheduled = internalMutation({
  args: { eventId: v.id("events") },
  returns: v.null(),
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
      text(payload.authorId) ?? event.actorId ?? postContext?.post.authorId,
    );
    if (!author || !author.email) return;

    await queueEmailForEvent(ctx, EMAIL_TEMPLATES.POST_SCHEDULED, {
      recipientEmail: author.email,
      recipientName: toDisplayName(author),
      recipientUserId: getUserIdentifier(author),
      variables: {
        title: postContext?.post.title ?? text(payload.title) ?? "",
        post_title: postContext?.post.title ?? text(payload.title) ?? "",
        date:
          text(payload.scheduledDate) ??
          text(payload.publishDate) ??
          String(postContext?.post.scheduledAt ?? ""),
        scheduled_date:
          text(payload.scheduledDate) ??
          text(payload.publishDate) ??
          String(postContext?.post.scheduledAt ?? ""),
        edit_url: buildWebsiteUrl(
          settings.siteUrl,
          `/admin/posts/${text(payload.postId) ?? ""}/edit`,
        ),
      },
      eventId: args.eventId,
    });
  },
});

/**
 * Handler: comment.created -> Author Notification + Moderation Notification
 */
export const onCommentCreated = internalMutation({
  args: { eventId: v.id("events") },
  returns: v.null(),
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
export const onCommentApproved = internalMutation({
  args: { eventId: v.id("events") },
  returns: v.null(),
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
export const onCommentReplied = internalMutation({
  args: { eventId: v.id("events") },
  returns: v.null(),
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

    const parentComment = await ctx.db.get("comments", commentContext.comment.parentId);
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
export const onRoleAssigned = internalMutation({
  args: { eventId: v.id("events") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const eventRecord = await getEventRecord(ctx, args.eventId);
    if (!eventRecord) return;

    const { payload } = eventRecord;
    const targetUserId = text(payload.userId) ?? text(payload.targetUserId);
    if (!targetUserId) return;

    const user = await getUserByAnyId(ctx, targetUserId);

    if (user && user.email) {
      await queueEmailForEvent(ctx, EMAIL_TEMPLATES.ROLE_CHANGED, {
        recipientEmail: user.email,
        recipientName: toDisplayName(user),
        recipientUserId: getUserIdentifier(user),
        variables: {
          role:
            text(payload.newRole) ??
            text(payload.newRoleName) ??
            text(payload.newRoleSlug) ??
            text(payload.roleName) ??
            "",
          old_role:
            text(payload.oldRole) ??
            text(payload.previousRole) ??
            text(payload.oldRoleName) ??
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
export const onRevisionRestored = internalMutation({
  args: { eventId: v.id("events") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const eventRecord = await getEventRecord(ctx, args.eventId);
    if (!eventRecord) return;

    const { payload } = eventRecord;
    const post = await getPayloadDoc(ctx, "posts", payload.postId);
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
          post_title: post?.title ?? text(payload.postTitle) ?? "",
          revision_date:
            text(payload.revisionDate) ??
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
export const onMediaUploaded = internalMutation({
  args: { eventId: v.id("events") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const eventRecord = await getEventRecord(ctx, args.eventId);
    if (!eventRecord) return;

    const mediaSettingsDoc = await ctx.db
      .query("settings")
      .withIndex("by_section", (q) => q.eq("section", "media"))
      .unique();
    const mediaSettings = settingsRecord(mediaSettingsDoc?.values);
    const storageQuotaBytes =
      typeof mediaSettings.storageQuotaBytes === "number"
        ? mediaSettings.storageQuotaBytes
        : 5 * 1024 * 1024 * 1024;

    const mediaRows = await ctx.db.query("media").take(5000);
    const usedBytes = mediaRows.reduce(
      (sum: number, media) => sum + (media.fileSize ?? 0),
      0,
    );
    const usagePercent = Math.round((usedBytes / storageQuotaBytes) * 100);
    if (usagePercent < 80) return;

    // Check for deduplication: at most once per 24 hours
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
    const recentWarnings = await ctx.db
      .query("emailQueue")
      .withIndex("by_template", (q) =>
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
export const onSettingsUpdated = internalMutation({
  args: { eventId: v.id("events") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const eventRecord = await getEventRecord(ctx, args.eventId);
    if (!eventRecord) return;

    const { event, payload } = eventRecord;

    // Don't send email for email template changes (avoid noise)
    if (payload.section === "email_templates") return;

    const actor = await getUserByAnyId(ctx, text(payload.updatedBy) ?? event.actorId);
    const admins = await resolveRecipients(ctx, "admin");
    for (const admin of admins) {
      // Don't notify the admin who made the change
      if (event.actorId && admin.userId === event.actorId) continue;

      await queueEmailForEvent(ctx, EMAIL_TEMPLATES.SETTINGS_CHANGED, {
        recipientEmail: admin.email,
        recipientName: admin.name,
        recipientUserId: admin.userId,
        variables: {
          section: text(payload.section) ?? "",
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
export const onSitemapGenerated = internalMutation({
  args: { eventId: v.id("events") },
  returns: v.null(),
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
          url_count: String(text(payload.urlCount) ?? text(payload.pageCount) ?? ""),
          sitemap_url: text(payload.sitemapUrl) ?? text(payload.url) ?? "",
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
export const onWebhookTriggered = internalMutation({
  args: { eventId: v.id("events") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const eventRecord = await getEventRecord(ctx, args.eventId);
    if (!eventRecord) return;

    const { payload } = eventRecord;

    // Only send for failures
    const statusCode = Number(text(payload.statusCode) ?? "0");
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
          endpoint: text(payload.endpoint) ?? text(payload.url) ?? "",
          status_code: statusCode > 0 ? String(statusCode) : "",
          error: text(payload.error) ?? text(payload.errorMessage) ?? "",
        },
        eventId: args.eventId,
      });
    }
  },
});

/**
 * Handler: profile.deactivated -> Account Deactivated Notification
 */
export const onProfileDeactivated = internalMutation({
  args: { eventId: v.id("events") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const eventRecord = await getEventRecord(ctx, args.eventId);
    if (!eventRecord) return;

    const { event, payload } = eventRecord;
    const targetUserId = text(payload.userId) ?? text(payload.targetUserId) ?? event.actorId;
    if (!targetUserId) return;

    const user = await getUserByAnyId(ctx, targetUserId);

    if (user && user.email) {
      await queueEmailForEvent(ctx, EMAIL_TEMPLATES.ACCOUNT_DEACTIVATED, {
        recipientEmail: user.email,
        recipientName: toDisplayName(user),
        recipientUserId: getUserIdentifier(user),
        variables: {
          reason: text(payload.reason) ?? "",
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
export const onProfileDeleted = internalMutation({
  args: { eventId: v.id("events") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const eventRecord = await getEventRecord(ctx, args.eventId);
    if (!eventRecord) return;

    const { payload } = eventRecord;
    // The user may already be deleted, so use the payload email
    const email = text(payload.email);
    const name = text(payload.name) ?? text(payload.displayName);
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

export const onTicketReplied = internalMutation({
  args: { eventId: v.id("events") },
  returns: v.null(),
  handler: async (ctx, args) => {
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

    const message = await getPayloadDoc(ctx, "ticket_messages", payload.messageId);
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
});

export const onTicketAssigned = internalMutation({
  args: { eventId: v.id("events") },
  returns: v.null(),
  handler: async (ctx, args) => {
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
});

export const onTicketResolved = internalMutation({
  args: { eventId: v.id("events") },
  returns: v.null(),
  handler: async (ctx, args) => {
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
});

export const onKbWorkflowStepReady = internalMutation({
  args: { eventId: v.id("events") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const eventRecord = await getEventRecord(ctx, args.eventId);
    if (!eventRecord) return;

    const { payload } = eventRecord;
    const settings = await getEmailSettings(ctx);
    const articleContext = await getKbArticleContext(
      ctx,
      payload.articleId,
      settings.siteUrl,
    );
    const reviewer = await getPayloadDoc(ctx, "users", payload.assigneeId);
    if (!articleContext || !reviewer?.email) return;

    await queueEmailForEvent(ctx, EMAIL_TEMPLATES.KB_WORKFLOW_STEP_READY, {
      recipientEmail: reviewer.email,
      recipientName: toDisplayName(reviewer),
      recipientUserId: getUserIdentifier(reviewer),
      variables: {
        reviewer_name: toDisplayName(reviewer),
        article_title: articleContext.article.title,
        article_url: articleContext.articleUrl,
        step_name: text(payload.stepName) ?? text(payload.workflowStep) ?? "Review",
        author_name: articleContext.author ? toDisplayName(articleContext.author) : "",
      },
      eventId: args.eventId,
    });
  },
});

export const onKbWorkflowApproved = internalMutation({
  args: { eventId: v.id("events") },
  returns: v.null(),
  handler: async (ctx, args) => {
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
        next_step: text(payload.nextStep) ?? "Published",
      },
      eventId: args.eventId,
    });
  },
});

export const onKbWorkflowRejected = internalMutation({
  args: { eventId: v.id("events") },
  returns: v.null(),
  handler: async (ctx, args) => {
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
        rejection_reason: text(payload.rejectionReason) ?? "",
      },
      eventId: args.eventId,
    });
  },
});

export const onKbCommentCreated = internalMutation({
  args: { eventId: v.id("events") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const eventRecord = await getEventRecord(ctx, args.eventId);
    if (!eventRecord) return;

    const { payload } = eventRecord;
    const settings = await getEmailSettings(ctx);
    const articleContext = await getKbArticleContext(
      ctx,
      payload.articleId,
      settings.siteUrl,
    );
    const comment = await getPayloadDoc(ctx, "kb_comments", payload.commentId);
    const commentAuthor = await getPayloadDoc(ctx, "users", payload.userId);
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
});

export const onLmsCourseEnrolled = internalMutation({
  args: { eventId: v.id("events") },
  returns: v.null(),
  handler: async (ctx, args) => {
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
});

export const onLmsCourseUnenrolled = internalMutation({
  args: { eventId: v.id("events") },
  returns: v.null(),
  handler: async (ctx, args) => {
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
});

export const onLmsEnrollmentExpired = internalMutation({
  args: { eventId: v.id("events") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const eventRecord = await getEventRecord(ctx, args.eventId);
    if (!eventRecord) return;

    const { event, payload } = eventRecord;
    const settings = await getEmailSettings(ctx);
    const lms = await getLmsContext(ctx, payload, settings.siteUrl);
    if (!lms.learner?.email) return;
    const expiredAt =
      typeof payload.expiresAt === "number"
        ? new Date(payload.expiresAt).toISOString()
        : "";

    await queueEmailForEvent(ctx, EMAIL_TEMPLATES.LMS_ENROLLMENT_EXPIRED, {
      recipientEmail: lms.learner.email,
      recipientName: toDisplayName(lms.learner),
      recipientUserId: getUserIdentifier(lms.learner),
      variables: {
        course_title: lms.courseTitle,
        course_public_url: lms.coursePublicUrl,
        expired_at: expiredAt,
        expired_at_sentence: expiredAt ? ` on ${expiredAt}` : "",
      },
      eventId: args.eventId,
      correlationId: event.correlationId,
    });
  },
});

export const onLmsCourseCompleted = internalMutation({
  args: { eventId: v.id("events") },
  returns: v.null(),
  handler: async (ctx, args) => {
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
});

export const onLmsCertificateIssued = internalMutation({
  args: { eventId: v.id("events") },
  returns: v.null(),
  handler: async (ctx, args) => {
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
});

export const onLmsCertificateRevoked = internalMutation({
  args: { eventId: v.id("events") },
  returns: v.null(),
  handler: async (ctx, args) => {
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
});
