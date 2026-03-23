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
} from "../_generated/server";
import { internal } from "../_generated/api";
import { v, ConvexError } from "convex/values";
import { emitEvent } from "../helpers/events";
import { SYSTEM, EMAIL_EVENTS } from "../events/constants";
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
import {
  queueEmailInternalArgs,
  sendEmailArgs,
  markSentArgs,
  handleSendFailureArgs,
  updateQueueStatusArgs,
  emailStatusValidator,
} from "./validators";
import { DEFAULT_TEMPLATES } from "./templateDefaults";

// ─── Retry Constants ─────────────────────────────────────────────────────────

/** Base delay for exponential backoff (5 seconds) */
const RETRY_BASE_DELAY_MS = 5000;

/** HTTP status codes that are retryable */
const RETRYABLE_STATUS_CODES = new Set([408, 429, 500, 502, 503, 504]);

// ─── queueEmail (Internal Mutation) ──────────────────────────────────────────

/**
 * Internal mutation to add an email to the queue.
 * Called by event handler functions. Wraps queueEmailForEvent helper.
 */
export const queueEmail = internalMutation({
  args: queueEmailInternalArgs,
  handler: async (ctx, args) => {
    const variables = JSON.parse(args.variables) as Record<string, string>;

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

    // 2. Get Resend API key from environment
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      await ctx.runMutation(internal.emails.internals.handleSendFailure, {
        queueId: args.queueId,
        error: "RESEND_API_KEY environment variable is not configured",
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

    // Update template stats
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
  handler: async (ctx) => {
    const now = Date.now();
    const oneWeekAgo = now - 7 * 24 * 60 * 60 * 1000;
    const settings = await getEmailSettings(ctx);

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
        .map((p) => `<li><a href="${settings.siteUrl}/posts/${p.slug}">${p.title}</a></li>`)
        .join("\n");

      // Get the weekly digest template
      const digestTemplate = await ctx.db
        .query("emailTemplates")
        .withIndex("by_slug", (q) =>
          q.eq("slug", EMAIL_TEMPLATES.WEEKLY_DIGEST),
        )
        .unique();

      if (digestTemplate && digestTemplate.isActive) {
        // Get all active users who haven't unsubscribed from digest
        const allUsers = await ctx.db
          .query("users")
          .withIndex("by_status", (q) => q.eq("status", "active"))
          .take(1000); // H-17 FIX: bounded query

        for (const user of allUsers) {
          if (!user.email) continue;

          // Check unsubscribe
          const isUnsubscribed = await checkUnsubscribed(
            ctx,
            getUserIdentifier(user),
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
            user.displayName ??
              [user.firstName, user.lastName].filter(Boolean).join(" "),
          );

          const subject = renderTemplate(
            digestTemplate.subjectTemplate,
            variables,
          );
          const bodyHtml = renderTemplate(digestTemplate.bodyHtml, variables);
          const bodyText = stripHtmlToText(bodyHtml);

          await ctx.db.insert("emailQueue", {
            to: user.email,
            toName: user.displayName,
            toUserId: getUserIdentifier(user),
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
      // For each employee, we would aggregate comments on their posts
      // This is a simplified version - in production, we'd query the comments table
      for (const employee of employees) {
        const isUnsubscribed = await checkUnsubscribed(
          ctx,
          employee.userId,
          "comment",
        );
        if (isUnsubscribed) continue;

        // Queue the comment digest (variables would be populated with actual comment data)
        const variables = injectGlobalVariables(
          {
            comment_summary: "You have new comments on your posts this week.",
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
export const cleanupOldEmails = internalMutation({
  args: {},
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
  handler: async (ctx) => {
    const now = Date.now();

    for (const templateDef of DEFAULT_TEMPLATES) {
      // Check if template already exists
      const existing = await ctx.db
        .query("emailTemplates")
        .withIndex("by_slug", (q) => q.eq("slug", templateDef.slug))
        .unique();

      if (existing) {
        continue; // Skip existing templates
      }

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
    }
  },
});

// ─── Event Handler Functions (23 handlers) ───────────────────────────────────

/**
 * Handler: registration.registered -> Welcome Email + Email Verification + Admin Notification
 */
export const onUserRegistered = internalMutation({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    const event = await ctx.db.get("events", args.eventId);
    if (!event) return;

    const payload = JSON.parse(event.payload) as Record<string, string>;

    // 1. Welcome email to the user
    await queueEmailForEvent(ctx, EMAIL_TEMPLATES.WELCOME, {
      recipientEmail: payload.email ?? "",
      recipientName: payload.name ?? payload.displayName,
      recipientUserId: event.actorId,
      variables: {
        user_name: payload.name ?? payload.displayName ?? "",
        user_email: payload.email ?? "",
      },
      eventId: args.eventId,
    });

    // 2. Email verification
    await queueEmailForEvent(ctx, EMAIL_TEMPLATES.VERIFICATION, {
      recipientEmail: payload.email ?? "",
      recipientName: payload.name ?? payload.displayName,
      recipientUserId: event.actorId,
      variables: {
        user_name: payload.name ?? payload.displayName ?? "",
        verification_url: payload.verificationUrl ?? "",
      },
      eventId: args.eventId,
    });

    // 3. Admin notification (batched)
    const admins = await resolveRecipients(ctx, "admin");
    for (const admin of admins) {
      await queueEmailForEvent(ctx, EMAIL_TEMPLATES.NEW_USER_ADMIN, {
        recipientEmail: admin.email,
        recipientName: admin.name,
        recipientUserId: admin.userId,
        variables: {
          user_email: payload.email ?? "",
          user_name: payload.name ?? payload.displayName ?? "",
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
  handler: async (ctx, args) => {
    const event = await ctx.db.get("events", args.eventId);
    if (!event) return;

    const payload = JSON.parse(event.payload) as Record<string, string>;

    await queueEmailForEvent(ctx, EMAIL_TEMPLATES.INVITATION, {
      recipientEmail: payload.email ?? "",
      recipientName: payload.name,
      variables: {
        inviter_name: payload.inviterName ?? "",
        invite_url: payload.inviteUrl ?? "",
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
export const onLoggedIn = internalMutation({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    const event = await ctx.db.get("events", args.eventId);
    if (!event) return;

    const payload = JSON.parse(event.payload) as Record<string, string>;

    // In a full implementation, check if this device/IP has been seen before
    // For now, only queue if payload explicitly indicates a new device
    if (payload.isNewDevice !== "true") return;

    if (!event.actorId) return;
    const user = await lookupUserByIdentifier(ctx, event.actorId!);
    if (!user || !user.email) return;

    await queueEmailForEvent(ctx, EMAIL_TEMPLATES.LOGIN_NEW_DEVICE, {
      recipientEmail: user.email,
      recipientName: user.displayName,
      recipientUserId: getUserIdentifier(user),
      variables: {
        device: payload.device ?? "Unknown device",
        ip_address: payload.ipAddress ?? event.actorIp ?? "Unknown",
        location: payload.location ?? "Unknown location",
        login_time: new Date().toISOString(),
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
  handler: async (ctx, args) => {
    const event = await ctx.db.get("events", args.eventId);
    if (!event) return;

    const payload = JSON.parse(event.payload) as Record<string, string>;
    const targetEmail = payload.email;
    if (!targetEmail) return;

    // Check if this is an auth.login_failed event type
    // The event constants have auth.login but no auth.login_failed
    // We check the payload for a failure indicator
    if (payload.success !== "false" && payload.failed !== "true") return;

    // Count recent failures for this email (last 15 minutes)
    const fifteenMinutesAgo = Date.now() - 15 * 60 * 1000;
    const recentEvents = await ctx.db
      .query("events")
      .withIndex("by_code_emitted", (q) => q.eq("code", event.code))
      .order("desc")
      .take(100);

    const recentFailures = recentEvents.filter((e) => {
      if (e.emittedAt < fifteenMinutesAgo) return false;
      try {
        const p = JSON.parse(e.payload);
        return (
          (p.email === targetEmail) &&
          (p.success === "false" || p.failed === "true")
        );
      } catch {
        return false;
      }
    });

    // Only send if 5+ failures
    if (recentFailures.length < 5) return;

    // Check for duplicate alert (don't re-send within the same 15-minute window)
    const admins = await resolveRecipients(ctx, "admin");
    for (const admin of admins) {
      await queueEmailForEvent(ctx, EMAIL_TEMPLATES.FAILED_LOGIN, {
        recipientEmail: admin.email,
        recipientName: admin.name,
        recipientUserId: admin.userId,
        variables: {
          target_email: targetEmail,
          attempt_count: String(recentFailures.length),
          ip_address: event.actorIp ?? "Unknown",
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
  handler: async (ctx, args) => {
    const event = await ctx.db.get("events", args.eventId);
    if (!event) return;

    const payload = JSON.parse(event.payload) as Record<string, string>;

    await queueEmailForEvent(ctx, EMAIL_TEMPLATES.PASSWORD_RESET, {
      recipientEmail: payload.email ?? "",
      recipientName: payload.name,
      recipientUserId: event.actorId,
      variables: {
        reset_url: payload.resetUrl ?? "",
        expiry_hours: payload.expiryHours ?? "24",
      },
      eventId: args.eventId,
    });
  },
});

/**
 * Handler: password.changed -> Password Changed Confirmation
 */
export const onPasswordChanged = internalMutation({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    const event = await ctx.db.get("events", args.eventId);
    if (!event) return;

    const payload = JSON.parse(event.payload) as Record<string, string>;

    if (!event.actorId) return;
    const user = await lookupUserByIdentifier(ctx, event.actorId!);
    if (!user || !user.email) return;

    await queueEmailForEvent(ctx, EMAIL_TEMPLATES.PASSWORD_CHANGED, {
      recipientEmail: user.email,
      recipientName: user.displayName,
      recipientUserId: getUserIdentifier(user),
      variables: {
        ip_address: event.actorIp ?? "Unknown",
        changed_at: new Date().toISOString(),
      },
      eventId: args.eventId,
    });
  },
});

/**
 * Handler: post.published -> Author Notification + Subscriber Notification
 */
export const onPostPublished = internalMutation({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    const event = await ctx.db.get("events", args.eventId);
    if (!event) return;

    const payload = JSON.parse(event.payload) as Record<string, string>;

    // 1. Author notification
    if (event.actorId) {
      const author = await lookupUserByIdentifier(ctx, event.actorId!);

      if (author && author.email) {
        await queueEmailForEvent(ctx, EMAIL_TEMPLATES.POST_PUBLISHED_AUTHOR, {
          recipientEmail: author.email,
          recipientName: author.displayName,
          recipientUserId: getUserIdentifier(author),
          variables: {
            title: payload.title ?? "",
            post_url: payload.postUrl ?? payload.url ?? "",
          },
          eventId: args.eventId,
        });
      }
    }

    // 2. Subscriber notification (batched) - all active users except the author
    const allUsers = await ctx.db
      .query("users")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .take(1000); // H-17 FIX: bounded query

    for (const user of allUsers) {
      if (!user.email) continue;
      // Don't send to the author
      if (event.actorId && getUserIdentifier(user) === event.actorId) continue;

      await queueEmailForEvent(ctx, EMAIL_TEMPLATES.POST_PUBLISHED_SUBSCRIBERS, {
        recipientEmail: user.email,
        recipientName: user.displayName,
        recipientUserId: getUserIdentifier(user),
        variables: {
          title: payload.title ?? "",
          excerpt: payload.excerpt ?? "",
          post_url: payload.postUrl ?? payload.url ?? "",
          author_name: payload.authorName ?? "",
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
  handler: async (ctx, args) => {
    const event = await ctx.db.get("events", args.eventId);
    if (!event) return;

    const payload = JSON.parse(event.payload) as Record<string, string>;

    if (!event.actorId) return;
    const author = await lookupUserByIdentifier(ctx, event.actorId!);
    if (!author || !author.email) return;

    await queueEmailForEvent(ctx, EMAIL_TEMPLATES.POST_SCHEDULED, {
      recipientEmail: author.email,
      recipientName: author.displayName,
      recipientUserId: getUserIdentifier(author),
      variables: {
        title: payload.title ?? "",
        date: payload.scheduledDate ?? payload.publishDate ?? "",
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
  handler: async (ctx, args) => {
    const event = await ctx.db.get("events", args.eventId);
    if (!event) return;

    const payload = JSON.parse(event.payload) as Record<string, string>;

    // 1. Notify the post author
    if (payload.postAuthorId && payload.postAuthorId !== event.actorId) {
      const author = await lookupUserByIdentifier(ctx, payload.postAuthorId);

      if (author && author.email) {
        await queueEmailForEvent(ctx, EMAIL_TEMPLATES.NEW_COMMENT_AUTHOR, {
          recipientEmail: author.email,
          recipientName: author.displayName,
          recipientUserId: getUserIdentifier(author),
          variables: {
            post_title: payload.postTitle ?? "",
            commenter_name: payload.commenterName ?? "",
            comment_excerpt: payload.commentExcerpt ?? payload.content ?? "",
            post_url: payload.postUrl ?? "",
          },
          eventId: args.eventId,
        });
      }
    }

    // 2. Moderation notification (if comment requires moderation)
    if (payload.requiresModeration === "true") {
      const admins = await resolveRecipients(ctx, "admin");
      for (const admin of admins) {
        await queueEmailForEvent(ctx, EMAIL_TEMPLATES.COMMENT_MODERATION, {
          recipientEmail: admin.email,
          recipientName: admin.name,
          recipientUserId: admin.userId,
          variables: {
            post_title: payload.postTitle ?? "",
            commenter_name: payload.commenterName ?? "",
            comment_excerpt: payload.commentExcerpt ?? payload.content ?? "",
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
  handler: async (ctx, args) => {
    const event = await ctx.db.get("events", args.eventId);
    if (!event) return;

    const payload = JSON.parse(event.payload) as Record<string, string>;

    if (payload.commenterUserId) {
      const commenter = await lookupUserByIdentifier(ctx, payload.commenterUserId);

      if (commenter && commenter.email) {
        await queueEmailForEvent(ctx, EMAIL_TEMPLATES.COMMENT_APPROVED, {
          recipientEmail: commenter.email,
          recipientName: commenter.displayName,
          recipientUserId: getUserIdentifier(commenter),
          variables: {
            post_title: payload.postTitle ?? "",
            comment_url: payload.commentUrl ?? "",
          },
          eventId: args.eventId,
        });
      }
    }
  },
});

/**
 * Handler: comment.created (reply) -> Notify the parent commenter
 * This handler checks if the comment is a reply (has parentCommentId).
 */
export const onCommentReplied = internalMutation({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    const event = await ctx.db.get("events", args.eventId);
    if (!event) return;

    const payload = JSON.parse(event.payload) as Record<string, string>;

    // Only process if this is a reply (has parent comment reference)
    if (!payload.parentCommentAuthorId) return;

    // Don't notify if the replier is the same as the parent author
    if (event.actorId === payload.parentCommentAuthorId) return;

    const parentAuthor = await lookupUserByIdentifier(ctx, payload.parentCommentAuthorId);

    if (parentAuthor && parentAuthor.email) {
      await queueEmailForEvent(ctx, EMAIL_TEMPLATES.COMMENT_REPLY, {
        recipientEmail: parentAuthor.email,
        recipientName: parentAuthor.displayName,
        recipientUserId: getUserIdentifier(parentAuthor),
        variables: {
          replier_name: payload.commenterName ?? "",
          post_title: payload.postTitle ?? "",
          reply_excerpt: payload.commentExcerpt ?? payload.content ?? "",
          comment_url: payload.commentUrl ?? "",
        },
        eventId: args.eventId,
      });
    }
  },
});

/**
 * Handler: role.assigned -> Role Changed Notification
 */
export const onRoleAssigned = internalMutation({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    const event = await ctx.db.get("events", args.eventId);
    if (!event) return;

    const payload = JSON.parse(event.payload) as Record<string, string>;

    const targetUserId = payload.userId ?? payload.targetUserId;
    if (!targetUserId) return;

    const user = await lookupUserByIdentifier(ctx, targetUserId);

    if (user && user.email) {
      await queueEmailForEvent(ctx, EMAIL_TEMPLATES.ROLE_CHANGED, {
        recipientEmail: user.email,
        recipientName: user.displayName,
        recipientUserId: getUserIdentifier(user),
        variables: {
          role: payload.newRole ?? payload.roleName ?? "",
          old_role: payload.oldRole ?? "",
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
  handler: async (ctx, args) => {
    const event = await ctx.db.get("events", args.eventId);
    if (!event) return;

    const payload = JSON.parse(event.payload) as Record<string, string>;

    // Notify employees (Editor+)
    const employees = await resolveRecipients(ctx, "employee");
    const actorName = payload.restoredBy ?? "Someone";

    for (const emp of employees) {
      await queueEmailForEvent(ctx, EMAIL_TEMPLATES.REVISION_RESTORED, {
        recipientEmail: emp.email,
        recipientName: emp.name,
        recipientUserId: emp.userId,
        variables: {
          user: actorName,
          post_title: payload.postTitle ?? "",
          revision_date: payload.revisionDate ?? "",
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
  handler: async (ctx, args) => {
    const event = await ctx.db.get("events", args.eventId);
    if (!event) return;

    const payload = JSON.parse(event.payload) as Record<string, string>;

    // Only send if storage usage is flagged as high
    const usagePercent = Number(payload.storageUsagePercent ?? "0");
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
          used_space: payload.usedSpace ?? "",
          total_space: payload.totalSpace ?? "",
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
  handler: async (ctx, args) => {
    const event = await ctx.db.get("events", args.eventId);
    if (!event) return;

    const payload = JSON.parse(event.payload) as Record<string, string>;

    // Don't send email for email template changes (avoid noise)
    if (payload.section === "email_templates") return;

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
          changed_by: payload.updatedBy ?? event.actorId ?? "Unknown",
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
  handler: async (ctx, args) => {
    const event = await ctx.db.get("events", args.eventId);
    if (!event) return;

    const payload = JSON.parse(event.payload) as Record<string, string>;

    const admins = await resolveRecipients(ctx, "admin");
    for (const admin of admins) {
      await queueEmailForEvent(ctx, EMAIL_TEMPLATES.SITEMAP_GENERATED, {
        recipientEmail: admin.email,
        recipientName: admin.name,
        recipientUserId: admin.userId,
        variables: {
          url_count: payload.urlCount ?? "",
          sitemap_url: payload.sitemapUrl ?? "",
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
  handler: async (ctx, args) => {
    const event = await ctx.db.get("events", args.eventId);
    if (!event) return;

    const payload = JSON.parse(event.payload) as Record<string, string>;

    // Only send for failures
    const statusCode = Number(payload.statusCode ?? "200");
    const isFailure =
      statusCode >= 400 || payload.networkError === "true";
    if (!isFailure) return;

    const admins = await resolveRecipients(ctx, "admin");
    for (const admin of admins) {
      await queueEmailForEvent(ctx, EMAIL_TEMPLATES.WEBHOOK_FAILURE, {
        recipientEmail: admin.email,
        recipientName: admin.name,
        recipientUserId: admin.userId,
        variables: {
          endpoint: payload.endpoint ?? payload.url ?? "",
          status_code: String(statusCode),
          error: payload.error ?? "",
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
  handler: async (ctx, args) => {
    const event = await ctx.db.get("events", args.eventId);
    if (!event) return;

    const payload = JSON.parse(event.payload) as Record<string, string>;

    const targetUserId = payload.userId ?? payload.targetUserId ?? event.actorId;
    if (!targetUserId) return;

    const user = await lookupUserByIdentifier(ctx, targetUserId);

    if (user && user.email) {
      await queueEmailForEvent(ctx, EMAIL_TEMPLATES.ACCOUNT_DEACTIVATED, {
        recipientEmail: user.email,
        recipientName: user.displayName,
        recipientUserId: getUserIdentifier(user),
        variables: {
          reason: payload.reason ?? "",
          support_email: "support@smithharper.com",
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
  handler: async (ctx, args) => {
    const event = await ctx.db.get("events", args.eventId);
    if (!event) return;

    const payload = JSON.parse(event.payload) as Record<string, string>;

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
