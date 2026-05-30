/**
 * ConvexPress Forms — Form Notification System (config CRUD + dispatch).
 * API path: api.extensions.forms.notifications.* (client CRUD)
 *           internal.extensions.forms.notifications.* (dispatch + internals)
 *
 * Helper imports use "../../helpers/..." (extensions live two levels below
 * convex/). This file owns the Notification system end-to-end so it never
 * touches the shared mutations.ts / queries.ts.
 *
 * REUSE BOUNDARY (per PLAN §5):
 *   - conditional logic  = evaluateConditionalLogic (existing pure evaluator)
 *   - email delivery     = emails.internals.queueRenderedEmail (existing)
 *   - templating         = local resolveMergeTags (mergeTags.ts, minimal)
 *   - site notifications = direct insert into `siteNotifications` (the closed
 *     notification-key registry is owned by the Role/Notification expert; we
 *     do NOT invent new keys there — see PLAN Ground Truth #5).
 * Selection/iteration glue is the only orchestration this file owns.
 *
 * SURFACED capability: form.manage_notifications (registered by Role expert).
 * The `form.*` caps are not yet in the closed `Capability` union, so we cast at
 * every requireCan call site via `formCap(...)`, exactly like mutations.ts.
 */

import {
  mutation,
  query,
  internalQuery,
  internalMutation,
  internalAction,
} from "../../_generated/server";
import { internal } from "../../_generated/api";
import { v, ConvexError } from "convex/values";
import type { Id } from "../../_generated/dataModel";
import { requireCan } from "../../helpers/permissions";
import { resolveNotificationRecipients } from "../../helpers/notification";
import type { Capability } from "../../types/capabilities";
import { evaluateConditionalLogic } from "./conditionalLogic";
import { resolveMergeTags, isValidEmail, type MergeContext } from "./mergeTags";

// ─── Local validators / helpers ─────────────────────────────────────────────

/**
 * Cast a `form.*` capability string to `Capability`. See file header — these
 * are surfaced here but registered by the Role expert, so they aren't in the
 * union yet. Centralizing the cast keeps the intent explicit and greppable.
 */
function formCap(cap: string): Capability {
  return cap as Capability;
}

const channelValidator = v.union(v.literal("email"), v.literal("site"));
const recipientTypeValidator = v.union(
  v.literal("admin"),
  v.literal("customer"),
);
const triggerEventCodeValidator = v.union(
  v.literal("form.submitted"),
  v.literal("form.progress_saved"),
  v.literal("form.action_failed"),
);

/** Validate that a conditionalLogic blob (if provided) is parseable JSON. */
function assertParseableLogic(conditionalLogic: string | undefined): void {
  if (conditionalLogic === undefined) return;
  try {
    JSON.parse(conditionalLogic);
  } catch {
    throw new ConvexError({
      code: "VALIDATION_ERROR",
      message: "Conditional logic must be valid JSON.",
    });
  }
}

// ─── Admin query: list rows for a form (gated) ───────────────────────────────

export const listForForm = query({
  args: { formId: v.id("forms") },
  handler: async (ctx, { formId }) => {
    await requireCan(ctx, formCap("form.manage_notifications"));
    const rows = await ctx.db
      .query("form_notifications")
      .withIndex("by_form", (q) => q.eq("formId", formId))
      .collect();
    return rows.sort((a, b) => a.order - b.order);
  },
});

// ─── Config mutations (all gated) ────────────────────────────────────────────

export const create = mutation({
  args: {
    formId: v.id("forms"),
    name: v.string(),
    channel: channelValidator,
    recipientType: recipientTypeValidator,
    toExpression: v.optional(v.string()),
    subjectTemplate: v.optional(v.string()),
    messageTemplate: v.optional(v.string()),
    triggerEventCode: triggerEventCodeValidator,
    conditionalLogic: v.optional(v.string()),
    enabled: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await requireCan(ctx, formCap("form.manage_notifications"));

    const name = args.name.trim();
    if (!name) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: "Notification name cannot be empty.",
      });
    }
    assertParseableLogic(args.conditionalLogic);

    // order = current sibling count (append to the end).
    const siblings = await ctx.db
      .query("form_notifications")
      .withIndex("by_form", (q) => q.eq("formId", args.formId))
      .collect();

    const notificationId = await ctx.db.insert("form_notifications", {
      formId: args.formId,
      name,
      channel: args.channel,
      recipientType: args.recipientType,
      toExpression: args.toExpression,
      subjectTemplate: args.subjectTemplate,
      messageTemplate: args.messageTemplate,
      triggerEventCode: args.triggerEventCode,
      conditionalLogic: args.conditionalLogic,
      enabled: args.enabled ?? true,
      order: siblings.length,
    });

    return await ctx.db.get(notificationId);
  },
});

export const update = mutation({
  args: {
    notificationId: v.id("form_notifications"),
    patch: v.object({
      name: v.optional(v.string()),
      channel: v.optional(channelValidator),
      recipientType: v.optional(recipientTypeValidator),
      toExpression: v.optional(v.string()),
      subjectTemplate: v.optional(v.string()),
      messageTemplate: v.optional(v.string()),
      triggerEventCode: v.optional(triggerEventCodeValidator),
      conditionalLogic: v.optional(v.string()),
      enabled: v.optional(v.boolean()),
    }),
  },
  handler: async (ctx, { notificationId, patch }) => {
    await requireCan(ctx, formCap("form.manage_notifications"));

    const existing = await ctx.db.get(notificationId);
    if (!existing) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Notification not found.",
      });
    }

    const update: Record<string, unknown> = {};
    if (patch.name !== undefined) {
      const name = patch.name.trim();
      if (!name) {
        throw new ConvexError({
          code: "VALIDATION_ERROR",
          message: "Notification name cannot be empty.",
        });
      }
      update.name = name;
    }
    if (patch.channel !== undefined) update.channel = patch.channel;
    if (patch.recipientType !== undefined) {
      update.recipientType = patch.recipientType;
    }
    if (patch.toExpression !== undefined) {
      update.toExpression = patch.toExpression;
    }
    if (patch.subjectTemplate !== undefined) {
      update.subjectTemplate = patch.subjectTemplate;
    }
    if (patch.messageTemplate !== undefined) {
      update.messageTemplate = patch.messageTemplate;
    }
    if (patch.triggerEventCode !== undefined) {
      update.triggerEventCode = patch.triggerEventCode;
    }
    if (patch.conditionalLogic !== undefined) {
      assertParseableLogic(patch.conditionalLogic);
      update.conditionalLogic = patch.conditionalLogic;
    }
    if (patch.enabled !== undefined) update.enabled = patch.enabled;

    if (Object.keys(update).length > 0) {
      await ctx.db.patch(notificationId, update);
    }
    return await ctx.db.get(notificationId);
  },
});

export const reorder = mutation({
  args: {
    formId: v.id("forms"),
    orderedIds: v.array(v.id("form_notifications")),
  },
  handler: async (ctx, { orderedIds }) => {
    await requireCan(ctx, formCap("form.manage_notifications"));
    await Promise.all(
      orderedIds.map((id, index) => ctx.db.patch(id, { order: index })),
    );
    return { success: true };
  },
});

export const remove = mutation({
  args: { notificationId: v.id("form_notifications") },
  handler: async (ctx, { notificationId }) => {
    await requireCan(ctx, formCap("form.manage_notifications"));
    await ctx.db.delete(notificationId);
    return { success: true };
  },
});

// ─── Internal reads used by dispatch (NOT client-callable) ───────────────────

/** Read an event row by id (an action cannot touch ctx.db directly). */
export const _getEvent = internalQuery({
  args: { eventId: v.id("events") },
  handler: async (ctx, { eventId }) => {
    const event = await ctx.db.get(eventId);
    if (!event) return null;
    return {
      code: event.code,
      payload: event.payload,
      actorId: event.actorId,
    };
  },
});

/** Read a form by id (returns null for the deleted-form edge case). */
export const _getForm = internalQuery({
  args: { formId: v.id("forms") },
  handler: async (ctx, { formId }) => {
    return await ctx.db.get(formId);
  },
});

/**
 * Load submission answers from `fieldValues` (the emitted payload omits values
 * for size — Ground Truth #3). Returns both fieldName + fieldKey per row so the
 * caller can build a name-map (merge tags) and a key-map (conditional logic).
 */
export const _getSubmissionValues = internalQuery({
  args: { submissionId: v.id("form_submissions") },
  handler: async (ctx, { submissionId }) => {
    const rows = await ctx.db
      .query("fieldValues")
      .withIndex("by_entity", (q) =>
        q
          .eq("entityType", "form_submission")
          .eq("entityId", submissionId as string),
      )
      .collect();
    return rows.map((r) => ({
      fieldName: r.fieldName,
      fieldKey: r.fieldKey,
      value: r.value,
    }));
  },
});

/** Enabled notification rows for a form + event code, in `order`. */
export const _enabledRowsForEvent = internalQuery({
  args: {
    formId: v.id("forms"),
    triggerEventCode: v.string(),
  },
  handler: async (ctx, { formId, triggerEventCode }) => {
    const rows = await ctx.db
      .query("form_notifications")
      .withIndex("by_form_event", (q) =>
        q.eq("formId", formId).eq("triggerEventCode", triggerEventCode),
      )
      .collect();
    return rows.filter((r) => r.enabled === true).sort((a, b) => a.order - b.order);
  },
});

// ─── Site channel: direct in-app notification for admins ─────────────────────

/**
 * Write an in-app `siteNotifications` row for every active admin. The closed
 * notification-key registry (notifications/validators.ts) is the Role expert's
 * file and has no form_* keys, so `notifications.internals.send` would reject
 * an arbitrary form notification. The `siteNotifications` table itself only
 * requires `notificationKey: v.string()` at the DB layer, so we insert directly
 * with a descriptive (unregistered) key. This is the PLAN's LEAN direct-insert
 * path — we do NOT add keys to the registry.
 */
export const _createSiteNotificationForAdmins = internalMutation({
  args: {
    formId: v.id("forms"),
    submissionId: v.optional(v.string()),
    eventCode: v.string(),
    type: v.union(
      v.literal("info"),
      v.literal("success"),
      v.literal("warning"),
      v.literal("error"),
    ),
    title: v.string(),
    body: v.string(),
    eventId: v.optional(v.id("events")),
  },
  handler: async (ctx, args) => {
    const adminIds = await resolveNotificationRecipients(ctx, "admin", {});
    if (adminIds.length === 0) return { created: 0 };

    const now = Date.now();
    const actionUrl = args.submissionId
      ? `/forms/${args.formId}/entries/${args.submissionId}`
      : `/forms/${args.formId}`;

    let created = 0;
    for (const userId of adminIds) {
      await ctx.db.insert("siteNotifications", {
        userId,
        // Descriptive, unregistered key. Intentionally NOT in the closed
        // NOTIFICATION_KEYS registry (the Role expert owns that file).
        notificationKey: "form_notification",
        eventCode: args.eventCode,
        eventId: args.eventId,
        type: args.type,
        title: args.title.slice(0, 200),
        message: args.body.slice(0, 1000),
        icon: "FileText",
        actionUrl: actionUrl.slice(0, 500),
        actionLabel: "View",
        readAt: undefined,
        dismissedAt: undefined,
        groupKey: undefined,
        groupCount: undefined,
        persistent: false,
        expiresAt: now + 30 * 24 * 60 * 60 * 1000,
        createdAt: now,
      });
      created += 1;
    }
    return { created };
  },
});

// ─── The event-subscribed dispatch handler (internalAction) ──────────────────

/**
 * Resolve + send all configured notifications for a form event.
 *
 * The Event Dispatcher invokes consumer handlers with `{ eventId }` ONLY
 * (Ground Truth #2), so we load the event row, JSON.parse its payload, then
 * load answers from `fieldValues` (the payload omits values — Ground Truth #3).
 * This is an `internalAction` because it fans out to multiple sub-mutations for
 * per-row delivery isolation.
 */
export const dispatch = internalAction({
  args: { eventId: v.id("events") },
  handler: async (ctx, { eventId }) => {
    // ── Load + parse the event ──────────────────────────────────────────────
    const event = await ctx.runQuery(
      internal.extensions.forms.notifications._getEvent,
      { eventId },
    );
    if (!event) return;

    let payload: Record<string, unknown> = {};
    try {
      payload = JSON.parse(event.payload) as Record<string, unknown>;
    } catch {
      // Unparseable payload — nothing we can resolve.
      return;
    }

    const eventCode = event.code;
    const formId = payload.formId as Id<"forms"> | undefined;
    const submissionId = payload.submissionId as
      | Id<"form_submissions">
      | undefined;
    if (!formId) return;

    // ── Load enabled rows for this form + event ─────────────────────────────
    const rows = await ctx.runQuery(
      internal.extensions.forms.notifications._enabledRowsForEvent,
      { formId, triggerEventCode: eventCode },
    );
    if (rows.length === 0) return;

    // ── Load the form (deleted-form edge case → bail) ───────────────────────
    const form = await ctx.runQuery(
      internal.extensions.forms.notifications._getForm,
      { formId },
    );
    if (!form) return;

    // ── Load answers (values omitted from payload) → name + key maps ────────
    const valueByName: Record<string, string> = {};
    const valueByKey: Record<string, string> = {};
    if (submissionId) {
      const answers = await ctx.runQuery(
        internal.extensions.forms.notifications._getSubmissionValues,
        { submissionId },
      );
      for (const a of answers) {
        valueByName[a.fieldName] = a.value;
        valueByKey[a.fieldKey] = a.value;
      }
    }

    // ── Resolve settings (adminEmail + siteUrl live in the `general` section).
    const generalSettings = await ctx.runQuery(
      internal.settings.internals.getInternal,
      { section: "general" },
    );
    const settingsAdminEmail =
      (generalSettings?.adminEmail as string | undefined) ?? "";
    const siteUrl = (generalSettings?.siteUrl as string | undefined) ?? "";

    // Per-form override: form.settings.adminNotificationEmail wins if present.
    let adminEmail = settingsAdminEmail;
    try {
      const formSettings = JSON.parse(form.settings) as Record<string, unknown>;
      const override = formSettings.adminNotificationEmail;
      if (typeof override === "string" && override.trim()) {
        adminEmail = override.trim();
      }
    } catch {
      // Malformed form.settings JSON — fall back to the global admin email.
    }

    const mergeContext: MergeContext = {
      form,
      valueByName,
      payload,
      settings: { adminEmail, siteUrl },
    };

    // ── Per-row loop (in order) ─────────────────────────────────────────────
    for (const row of rows) {
      try {
        // Firing rule: form.submitted only fires on a COMPLETE submission.
        if (eventCode === "form.submitted" && payload.isComplete !== true) {
          continue;
        }

        // Conditional gate: a `true` evaluator result = fire, `false` = skip.
        if (row.conditionalLogic) {
          const shouldFire = evaluateConditionalLogic(
            row.conditionalLogic,
            valueByKey,
          );
          if (!shouldFire) continue;
        }

        // Resolve templates.
        const to = resolveMergeTags(row.toExpression, mergeContext);
        const subject = resolveMergeTags(row.subjectTemplate, mergeContext);
        const body = resolveMergeTags(row.messageTemplate, mergeContext);

        if (row.channel === "email") {
          if (!to || !isValidEmail(to)) {
            console.warn(
              `[FormNotification] skip no_recipient (row=${row._id} form=${formId})`,
            );
            continue;
          }
          await ctx.runMutation(internal.emails.internals.queueRenderedEmail, {
            recipientEmail: to,
            subject: subject || `${form.title} — notification`,
            bodyHtml: body,
            templateSlug: "form_notification",
            templateVariables: "{}",
            priority: "immediate",
            eventId,
          });
        } else {
          // Site channel — direct insert for admins (closed-registry path).
          const siteType: "info" | "error" =
            eventCode === "form.action_failed" ? "error" : "info";
          await ctx.runMutation(
            internal.extensions.forms.notifications
              ._createSiteNotificationForAdmins,
            {
              formId,
              submissionId: submissionId ? (submissionId as string) : undefined,
              eventCode,
              type: siteType,
              title: row.name || form.title,
              body: body || `New activity on ${form.title}.`,
              eventId,
            },
          );
        }
      } catch (err) {
        // Per-row isolation: a failure must not abort sibling rows or roll back
        // the committed submission. Log + continue.
        console.warn(
          `[FormNotification] delivery failed (row=${row._id} form=${formId})`,
          err,
        );
      }
    }
  },
});
