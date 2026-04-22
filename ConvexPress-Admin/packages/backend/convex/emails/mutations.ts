/**
 * Email Notification System - Public Mutations
 *
 * Five mutations:
 *
 *   - updateTemplate: Admin updates template subject/body/active status
 *   - resetTemplate: Reset a customized template to its defaults
 *   - retryEmail: Retry a failed email by resetting it to queued
 *   - cancelEmail: Cancel a queued email before it sends
 *   - updateUnsubscribe: User updates their email category preferences
 *
 * Admin mutations require "settings.update_email" capability (Administrator).
 * User mutations require basic authentication (all roles).
 *
 * Usage:
 *   const updateTemplate = useMutation(api.emails.mutations.updateTemplate);
 *   const retryEmail = useMutation(api.emails.mutations.retryEmail);
 *   const updatePrefs = useMutation(api.emails.mutations.updateUnsubscribe);
 */

import { mutation } from "../_generated/server";
import { internal } from "../_generated/api";
import { ConvexError } from "convex/values";
import { requireCan, getCurrentUser, getUserIdentifier } from "../helpers/permissions";
import { emitEvent } from "../helpers/events";
import { SETTINGS_EVENTS, SYSTEM } from "../events/constants";
import {
  updateTemplateArgs,
  resetTemplateArgs,
  retryEmailArgs,
  cancelEmailArgs,
  updateUnsubscribeArgs,
} from "./validators";

// ─── Security-critical categories that cannot be unsubscribed ────────────────

const UNSUBSCRIBABLE_CATEGORIES = new Set([
  "content",
  "comment",
  "system",
  "digest",
  "all",
]);

// ─── updateTemplate ──────────────────────────────────────────────────────────

/**
 * Update an email template's content or active status.
 *
 * Only Administrators can modify email templates.
 * Sets isCustomized = true if subject or body differs from defaults.
 *
 * Emits settings.updated event for audit trail.
 */
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const updateTemplate = mutation({
  args: updateTemplateArgs,
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    const user = await requireCan(ctx, "settings.update_email");

    const template = await ctx.db.get("emailTemplates", args.templateId);
    if (!template) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Email template not found",
      });
    }

    // Build the patch object with only provided fields
    const patch: Record<string, unknown> = {
      updatedAt: Date.now(),
    };

    if (args.subjectTemplate !== undefined) {
      if (!args.subjectTemplate.trim()) {
        throw new ConvexError({
          code: "VALIDATION_ERROR",
          message: "Subject template cannot be empty",
        });
      }
      if (args.subjectTemplate.length > 500) {
        throw new ConvexError({
          code: "VALIDATION_ERROR",
          message: "Subject template must be 500 characters or less",
        });
      }
      patch.subjectTemplate = args.subjectTemplate;
    }

    if (args.bodyHtml !== undefined) {
      if (!args.bodyHtml.trim()) {
        throw new ConvexError({
          code: "VALIDATION_ERROR",
          message: "Body HTML cannot be empty",
        });
      }
      if (args.bodyHtml.length > 500 * 1024) {
        throw new ConvexError({
          code: "VALIDATION_ERROR",
          message: "Body HTML must be under 500KB",
        });
      }
      patch.bodyHtml = args.bodyHtml;
    }

    if (args.bodyText !== undefined) {
      patch.bodyText = args.bodyText;
    }

    if (args.preheaderText !== undefined) {
      if (args.preheaderText.length > 200) {
        throw new ConvexError({
          code: "VALIDATION_ERROR",
          message: "Preheader text must be 200 characters or less",
        });
      }
      patch.preheaderText = args.preheaderText;
    }

    if (args.isActive !== undefined) {
      patch.isActive = args.isActive;
    }

    // Determine if the template is now customized
    const newSubject = (patch.subjectTemplate as string) ?? template.subjectTemplate;
    const newBody = (patch.bodyHtml as string) ?? template.bodyHtml;
    const isCustomized =
      newSubject !== template.defaultSubjectTemplate ||
      newBody !== template.defaultBodyHtml;
    patch.isCustomized = isCustomized;

    // Apply the patch
    await ctx.db.patch("emailTemplates", args.templateId, patch);

    // Emit settings.updated event
    await emitEvent(ctx, SETTINGS_EVENTS.UPDATED, SYSTEM.SETTINGS, {
      section: "email_templates",
      changes: [template.slug],
      updatedBy: user._id,
    });

    return { success: true, templateId: args.templateId };
  },
});

// ─── resetTemplate ───────────────────────────────────────────────────────────

/**
 * Reset a customized template back to its default content.
 * Copies defaultSubjectTemplate -> subjectTemplate and
 * defaultBodyHtml -> bodyHtml, sets isCustomized = false.
 */
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const resetTemplate = mutation({
  args: resetTemplateArgs,
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    const user = await requireCan(ctx, "settings.update_email");

    const template = await ctx.db.get("emailTemplates", args.templateId);
    if (!template) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Email template not found",
      });
    }

    await ctx.db.patch("emailTemplates", args.templateId, {
      subjectTemplate: template.defaultSubjectTemplate,
      bodyHtml: template.defaultBodyHtml,
      bodyText: undefined,
      preheaderText: undefined,
      isCustomized: false,
      updatedAt: Date.now(),
    });

    // Emit settings.updated event
    await emitEvent(ctx, SETTINGS_EVENTS.UPDATED, SYSTEM.SETTINGS, {
      section: "email_templates",
      changes: [`${template.slug} (reset to default)`],
      updatedBy: user._id,
    });

    return { success: true, templateId: args.templateId };
  },
});

// ─── retryEmail ──────────────────────────────────────────────────────────────

/**
 * Retry a failed email by resetting it to queued status and
 * scheduling an immediate send attempt.
 *
 * Only failed emails can be retried.
 */
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const retryEmail = mutation({
  args: retryEmailArgs,
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    await requireCan(ctx, "email.retry");

    const email = await ctx.db.get("emailQueue", args.queueId);
    if (!email) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Email queue item not found",
      });
    }

    if (email.status !== "failed") {
      throw new ConvexError({
        code: "INVALID_STATE",
        message: `Cannot retry email with status "${email.status}". Only "failed" emails can be retried.`,
      });
    }

    // Reset to queued state
    await ctx.db.patch("emailQueue", args.queueId, {
      status: "queued",
      attempts: 0,
      lastError: undefined,
      nextRetryAt: undefined,
    });

    // Schedule immediate send
    await ctx.scheduler.runAfter(0, internal.emails.internals.sendEmail, {
      queueId: args.queueId,
    });

    return { success: true };
  },
});

// ─── cancelEmail ─────────────────────────────────────────────────────────────

/**
 * Cancel a queued email before it is sent.
 * Only queued emails can be cancelled.
 */
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const cancelEmail = mutation({
  args: cancelEmailArgs,
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

    if (email.status !== "queued") {
      throw new ConvexError({
        code: "INVALID_STATE",
        message: `Cannot cancel email with status "${email.status}". Only "queued" emails can be cancelled.`,
      });
    }

    await ctx.db.patch("emailQueue", args.queueId, {
      status: "cancelled",
    });

    return { success: true };
  },
});

// ─── updateUnsubscribe ───────────────────────────────────────────────────────

/**
 * Update a user's email category subscription preference.
 *
 * subscribed = true -> resubscribe (remove unsubscribe record)
 * subscribed = false -> unsubscribe (add unsubscribe record)
 *
 * Security-critical categories ("security") cannot be unsubscribed.
 */
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const updateUnsubscribe = mutation({
  args: updateUnsubscribeArgs,
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) {
      throw new ConvexError({
        code: "UNAUTHORIZED",
        message: "Authentication required",
      });
    }

    const { category, subscribed } = args;

    // Validate category
    if (category === "security") {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message:
          "Security-critical email notifications cannot be unsubscribed. These include password resets, account deactivation, and failed login alerts.",
      });
    }

    if (!UNSUBSCRIBABLE_CATEGORIES.has(category)) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: `Invalid email category: "${category}"`,
      });
    }

    const userId = getUserIdentifier(user);

    if (subscribed) {
      // Resubscribe: delete the unsubscribe record if it exists
      const existing = await ctx.db
        .query("emailUnsubscribes")
        .withIndex("by_user_category", (q: ConvexQueryBuilder) =>
          q.eq("userId", userId).eq("category", category),
        )
        .unique();

      if (existing) {
        await ctx.db.delete("emailUnsubscribes", existing._id);
      }
    } else {
      // Unsubscribe: check if record already exists
      const existing = await ctx.db
        .query("emailUnsubscribes")
        .withIndex("by_user_category", (q: ConvexQueryBuilder) =>
          q.eq("userId", userId).eq("category", category),
        )
        .unique();

      if (!existing) {
        await ctx.db.insert("emailUnsubscribes", {
          userId,
          category,
          unsubscribedAt: Date.now(),
        });
      }
    }

    return { success: true };
  },
});
