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
 * Capability: form.manage_notifications. `formCap(...)` keeps the Forms
 * authorization surface explicit at each requireCan call site.
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
import { isPluginEnabled, requirePluginEnabled } from "../../helpers/plugins";
import { resolveNotificationRecipients } from "../../helpers/notification";
import type { Capability } from "../../types/capabilities";
import { evaluateConditionalLogic } from "./conditionalLogic";
import { resolveMergeTags, isValidEmail, type MergeContext } from "./mergeTags";

// ─── Local validators / helpers ─────────────────────────────────────────────

/**
 * Local wrapper for Forms capability strings. Centralizing it keeps the
 * authorization surface explicit and greppable.
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

// ─── Pure cores (extracted; the dispatch action below delegates to these) ────
//
// These four functions hold ALL of the notification decision/assembly logic
// that does NOT need a Convex `ctx`. They are deterministic string/struct →
// struct transforms, so they are unit-testable under bun:test (the `dispatch`
// internalAction loads the DB pieces and then calls them). Behavior is the
// SAME as the prior inline code, plus the header-injection hardening called out
// below (CR/LF stripping on the resolved recipient + subject).

/** The shape of a notification row the pure cores read (DB-doc subset). */
export interface NotificationRowCore {
  channel: "email" | "site";
  toExpression?: string;
  subjectTemplate?: string;
  messageTemplate?: string;
  conditionalLogic?: string;
}

/**
 * SECURITY — strip CR/LF (and other control chars) from a value destined for an
 * email HEADER (the `To:` recipient or the `Subject:`). A submitter-controlled
 * field value that reaches `subjectTemplate`/`toExpression` could otherwise
 * smuggle a newline + `Bcc:`/extra header into the outbound message (SMTP/MIME
 * header injection / extra-recipient spoofing). The Resend transport is JSON so
 * the wire format already resists this, but stripping at the boundary is the
 * defense-in-depth contract: a header field is single-line, full stop. Body
 * (`bodyHtml`) is NOT passed through this — newlines are legal there and the
 * merge resolver already HTML-escapes untrusted cells for that sink.
 */
export function sanitizeEmailHeader(value: string): string {
  // Replace CR, LF, NUL and every other C0/DEL control char with a space,
  // then collapse runs and trim - so "a\r\nBcc: x"
  // cannot leave a usable line break that smuggles a header.
  return Array.from(value, (char) => {
    const code = char.charCodeAt(0);
    return code <= 0x1f || code === 0x7f ? " " : char;
  })
    .join("")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/**
 * Decide whether a single notification row FIRES for this event + submission.
 * Pure mirror of the per-row gate in `dispatch`:
 *   1. `form.submitted` only fires on a COMPLETE submission (payload.isComplete).
 *   2. A row with `conditionalLogic` fires only when the evaluator returns true
 *      against the submission's `fieldKey -> value` map (conditional routing).
 *   3. Otherwise it fires.
 * `valueByKey` is keyed by field KEY (conditional logic references keys).
 */
export function notificationFiresForSubmission(
  row: Pick<NotificationRowCore, "conditionalLogic">,
  eventCode: string,
  payload: Record<string, unknown>,
  valueByKey: Record<string, string>,
): boolean {
  if (eventCode === "form.submitted" && payload.isComplete !== true) {
    return false;
  }
  if (row.conditionalLogic) {
    return evaluateConditionalLogic(row.conditionalLogic, valueByKey);
  }
  return true;
}

/** Result of resolving a notification's recipient address. */
export interface RecipientResolution {
  /** The sanitized, resolved recipient (may be ""). */
  email: string;
  /** True only when `email` is a single, valid, injection-free address. */
  valid: boolean;
}

/**
 * Resolve a notification's recipient from its `toExpression` via merge tags.
 *
 * Recipient sourcing model (per task §3 spoofing review):
 *   - Admin-configured static recipients (e.g. `{settings:admin_notification_email}`)
 *     are TRUSTED — they come from the row template an admin authored.
 *   - A field-derived "send to" (e.g. `{field:email}` on a customer confirmation)
 *     is UNTRUSTED submitter input. It MUST resolve to exactly ONE valid email
 *     with no header break, or it is rejected (caller skips the row). A public
 *     submitter therefore cannot inject a second recipient or a header, and an
 *     admin row that resolves to a corrupt address simply does not send.
 *
 * The header sanitizer runs FIRST so a smuggled newline is gone before the
 * single-address `isValidEmail` shape check (which also rejects internal
 * whitespace). Returns `{ email, valid }`; the caller decides what to do with
 * an invalid one (email channel skips; logs `no_recipient`).
 */
export function resolveNotificationRecipient(
  toExpression: string | undefined,
  ctx: MergeContext,
): RecipientResolution {
  const resolved = sanitizeEmailHeader(resolveMergeTags(toExpression, ctx));
  return { email: resolved, valid: resolved.length > 0 && isValidEmail(resolved) };
}

/** Assembled, ready-to-send notification content. */
export interface NotificationContent {
  /** Sanitized single-line subject with a non-empty fallback. */
  subject: string;
  /** Resolved HTML body (already escaped for untrusted cells by the resolver). */
  bodyHtml: string;
}

/**
 * Assemble a notification's subject + body from its templates via merge tags.
 *
 * - `subject` is resolved, header-sanitized (CR/LF stripped), and falls back to
 *   `"<formTitle> — notification"` when the template is blank — mirroring the
 *   prior `subject || \`${form.title} — notification\`` in dispatch.
 * - `bodyHtml` is the resolver's output VERBATIM. The legacy resolver already
 *   HTML-escapes every untrusted cell (`{field:*}`, `{action:error}`,
 *   `{all_fields}`) for the email-html sink, so the escaped string is exactly
 *   what reaches `queueRenderedEmail({ bodyHtml })` — there is NO raw re-resolve
 *   on this path. Body is intentionally NOT header-sanitized (newlines are
 *   legal in an HTML body).
 */
export function assembleNotificationContent(
  row: Pick<NotificationRowCore, "subjectTemplate" | "messageTemplate">,
  ctx: MergeContext,
  formTitle: string,
): NotificationContent {
  const rawSubject = sanitizeEmailHeader(resolveMergeTags(row.subjectTemplate, ctx));
  const bodyHtml = resolveMergeTags(row.messageTemplate, ctx);
  return {
    subject: rawSubject || `${formTitle} — notification`,
    bodyHtml,
  };
}

const RESUME_NOTIFICATION_SENT_AT_META_KEY = "resumeNotificationSentAt";

function parseSubmissionMeta(meta: string | undefined): Record<string, unknown> {
  if (!meta) return {};
  try {
    const parsed = JSON.parse(meta);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

export function progressNotificationAlreadySent(
  meta: string | undefined,
): boolean {
  const parsed = parseSubmissionMeta(meta);
  return typeof parsed[RESUME_NOTIFICATION_SENT_AT_META_KEY] === "number";
}

export function markProgressNotificationSentMeta(
  meta: string | undefined,
  sentAt: number,
): string {
  return JSON.stringify({
    ...parseSubmissionMeta(meta),
    [RESUME_NOTIFICATION_SENT_AT_META_KEY]: sentAt,
  });
}

// ─── Admin query: list rows for a form (gated) ───────────────────────────────

export const listForForm = query({
  args: { formId: v.id("forms") },
  handler: async (ctx, { formId }) => {
    await requireCan(ctx, formCap("form.manage_notifications"));
    await requirePluginEnabled(ctx, "forms");
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
    await requirePluginEnabled(ctx, "forms");

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
    await requirePluginEnabled(ctx, "forms");

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
  handler: async (ctx, { formId, orderedIds }) => {
    await requireCan(ctx, formCap("form.manage_notifications"));
    await requirePluginEnabled(ctx, "forms");
    const rows = await Promise.all(orderedIds.map((id) => ctx.db.get(id)));
    if (rows.some((row) => !row || row.formId !== formId)) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "One or more notifications were not found for this form.",
      });
    }
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
    await requirePluginEnabled(ctx, "forms");
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

export const _claimProgressNotification = internalMutation({
  args: { submissionId: v.id("form_submissions") },
  handler: async (ctx, { submissionId }) => {
    const submission = await ctx.db.get(submissionId);
    if (!submission) return { claimed: false };
    if (progressNotificationAlreadySent(submission.meta)) {
      return { claimed: false };
    }

    const now = Date.now();
    await ctx.db.patch(submissionId, {
      meta: markProgressNotificationSentMeta(submission.meta, now),
      updatedAt: now,
    });
    return { claimed: true };
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
    if (!(await isPluginEnabled(ctx, "forms"))) return;

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
    // The decision (does this row fire?), the recipient resolution, and the
    // subject/body assembly are all the extracted PURE cores above. This loop
    // is the orchestration shell: gate → resolve → enqueue/insert per channel.
    let progressNotificationClaimed: boolean | null = null;
    for (const row of rows) {
      try {
        // Firing rule + conditional routing (pure).
        if (
          !notificationFiresForSubmission(row, eventCode, payload, valueByKey)
        ) {
          continue;
        }

        // Subject/body assembly (pure). Body is the escaped resolver output.
        const content = assembleNotificationContent(
          row,
          mergeContext,
          form.title,
        );

        if (row.channel === "email") {
          // Recipient resolution (pure): header-sanitized + single-address
          // validated. A field-derived recipient cannot inject a header or a
          // second address; an unresolvable/invalid one skips this row.
          const recipient = resolveNotificationRecipient(
            row.toExpression,
            mergeContext,
          );
          if (!recipient.valid) {
            console.warn(
              `[FormNotification] skip no_recipient (row=${row._id} form=${formId})`,
            );
            continue;
          }
          if (eventCode === "form.progress_saved") {
            if (!submissionId) continue;
            if (progressNotificationClaimed === null) {
              const claim = await ctx.runMutation(
                internal.extensions.forms.notifications
                  ._claimProgressNotification,
                { submissionId },
              );
              progressNotificationClaimed = claim.claimed === true;
            }
            if (!progressNotificationClaimed) continue;
          }
          await ctx.runMutation(internal.emails.internals.queueRenderedEmail, {
            recipientEmail: recipient.email,
            subject: content.subject,
            bodyHtml: content.bodyHtml,
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
              body: content.bodyHtml || `New activity on ${form.title}.`,
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
