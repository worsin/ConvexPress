/**
 * ConvexPress Forms — Form Confirmation System (config CRUD + public resolver).
 * API path: api.extensions.forms.confirmations.*
 *
 * Helper imports use "../../helpers/..." (extensions live two levels below
 * convex/). This file owns the Confirmation system end-to-end so it never
 * touches the shared mutations.ts / queries.ts.
 *
 * REUSE / SANITIZE NOTE: the Confirmation PRD/PLAN reference
 * `isomorphic-dompurify`, but that package is NOT a dependency of the Convex
 * backend (`packages/backend`) — it is only available to the two `apps/web`
 * frontends. The backend's canonical HTML sanitizer is
 * `helpers/comment.ts#sanitizeCommentContent` (string-based, no DOM library,
 * same allow-list philosophy as custom-fields/FieldMessage.tsx). We reuse it
 * here for the message body; the Website re-sanitizes client-side with
 * isomorphic-dompurify as defense-in-depth.
 *
 * SURFACED capability: form.manage_confirmations (registered by Role expert).
 */

import { query, mutation } from "../../_generated/server";
import { v, ConvexError } from "convex/values";
import type { Id } from "../../_generated/dataModel";
import { requireCan } from "../../helpers/permissions";
import { sanitizeCommentContent } from "../../helpers/comment";
import type { Capability } from "../../types/capabilities";
import { evaluateConditionalLogic } from "./conditionalLogic";

// ─── Local validators / helpers ─────────────────────────────────────────────

/** Cast a `form.*` capability string to `Capability` (registered by Role expert). */
function formCap(cap: string): Capability {
  return cap as Capability;
}

const confirmationTypeValidator = v.union(
  v.literal("message"),
  v.literal("redirect"),
  v.literal("page"),
);

/**
 * External hosts allowed for `redirect`-type confirmations. MVP: empty ⇒ only
 * same-origin / relative URLs are permitted (open-redirect guard). Add trusted
 * hosts here as needed.
 */
const ALLOWED_REDIRECT_HOSTS: string[] = [];

/**
 * A redirect target is allowed when it is relative (no host) OR its host is on
 * the allow-list. Parsed against a placeholder base so relative URLs resolve to
 * the placeholder host (treated as "no external host" → allowed).
 */
function isAllowedRedirectHost(url: string): boolean {
  if (!url) return false;
  const trimmed = url.trim();
  // Block dangerous protocols outright.
  if (/^(javascript|data|vbscript|blob):/i.test(trimmed)) return false;
  // Relative paths (no scheme/host) are always allowed.
  if (trimmed.startsWith("/") && !trimmed.startsWith("//")) return true;
  try {
    const parsed = new URL(trimmed, "https://placeholder.invalid");
    // Resolved against the placeholder → relative input, no real external host.
    if (parsed.host === "placeholder.invalid") return true;
    return ALLOWED_REDIRECT_HOSTS.includes(parsed.host);
  } catch {
    return false;
  }
}

/** Throw a VALIDATION_ERROR if a redirect target host is not allowed. */
function assertAllowedRedirect(url: string | undefined): void {
  if (!url) return;
  if (!isAllowedRedirectHost(url)) {
    throw new ConvexError({
      code: "VALIDATION_ERROR",
      message: "Redirect URL host is not allowed.",
    });
  }
}

/** Sanitize confirmation message HTML (backend-safe, reuses comment sanitizer). */
function sanitizeMessage(html: string): string {
  return sanitizeCommentContent(html);
}

/**
 * Render namespaced merge tags against a flat token map built from the
 * submission + form. Tokens: {field:<name>}, {form:title}, {form:slug},
 * {entry:id}, {entry:date}. Unknown tokens render to empty string.
 */
function renderConfirmationMergeTags(
  template: string,
  valueMap: Record<string, string>,
  form: { title: string; slug: string },
  submission: { _id: string; submittedAt?: number } | null,
): string {
  const tokens: Record<string, string> = {
    "form:title": form.title,
    "form:slug": form.slug,
    "entry:id": submission?._id ?? "",
    "entry:date": submission?.submittedAt
      ? new Date(submission.submittedAt).toISOString()
      : "",
  };
  for (const [name, value] of Object.entries(valueMap)) {
    tokens[`field:${name}`] = value;
  }
  return template.replace(/\{([\w:]+)\}/g, (_match, key) => tokens[key] ?? "");
}

/** Lazy-seed: ensure the form has exactly one default confirmation row. */
async function ensureDefault(
  ctx: any,
  formId: Id<"forms">,
  userId: Id<"users">,
): Promise<void> {
  const existing = await ctx.db
    .query("form_confirmations")
    .withIndex("by_form_default", (q: any) =>
      q.eq("formId", formId).eq("isDefault", true),
    )
    .first();
  if (existing) return;

  const now = Date.now();
  await ctx.db.insert("form_confirmations", {
    formId,
    name: "Default Confirmation",
    type: "message" as const,
    content: "<p>Thank you for your submission.</p>",
    redirectUrl: undefined,
    pageId: undefined,
    conditionalLogic: undefined,
    isDefault: true,
    order: 0,
    createdBy: userId,
    updatedBy: userId,
    createdAt: now,
    updatedAt: now,
  });
}

/** Next `order` value = max existing order + 1. */
async function nextOrder(ctx: any, formId: Id<"forms">): Promise<number> {
  const rows = await ctx.db
    .query("form_confirmations")
    .withIndex("by_form_order", (q: any) => q.eq("formId", formId))
    .collect();
  if (rows.length === 0) return 0;
  return Math.max(...rows.map((r: any) => r.order)) + 1;
}

// ─── Admin query (gated) ─────────────────────────────────────────────────────

export const listConfirmations = query({
  args: { formId: v.id("forms") },
  handler: async (ctx, { formId }) => {
    const user = await requireCan(ctx, formCap("form.manage_confirmations"));
    // Lazy-seed so the editor always shows ≥1 row.
    await ensureDefault(ctx, formId, user._id);

    const rows = await ctx.db
      .query("form_confirmations")
      .withIndex("by_form_order", (q) => q.eq("formId", formId))
      .collect();

    // Sort by order, with the default row pinned last.
    return rows.sort((a, b) => {
      if (a.isDefault !== b.isDefault) return a.isDefault ? 1 : -1;
      return a.order - b.order;
    });
  },
});

// ─── Config mutations (all gated) ────────────────────────────────────────────

export const createConfirmation = mutation({
  args: {
    formId: v.id("forms"),
    name: v.string(),
    type: confirmationTypeValidator,
    content: v.optional(v.string()),
    redirectUrl: v.optional(v.string()),
    pageId: v.optional(v.string()),
    conditionalLogic: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireCan(ctx, formCap("form.manage_confirmations"));
    await ensureDefault(ctx, args.formId, user._id);

    const name = args.name.trim();
    if (!name) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: "Confirmation name cannot be empty.",
      });
    }
    if (args.type === "redirect") assertAllowedRedirect(args.redirectUrl);

    const content =
      args.type === "message" && args.content !== undefined
        ? sanitizeMessage(args.content)
        : args.content;

    const now = Date.now();
    const order = await nextOrder(ctx, args.formId);
    const id = await ctx.db.insert("form_confirmations", {
      formId: args.formId,
      name,
      type: args.type,
      content,
      redirectUrl: args.redirectUrl,
      pageId: args.pageId,
      conditionalLogic: args.conditionalLogic,
      isDefault: false,
      order,
      createdBy: user._id,
      updatedBy: user._id,
      createdAt: now,
      updatedAt: now,
    });
    return await ctx.db.get(id);
  },
});

export const updateConfirmation = mutation({
  args: {
    confirmationId: v.id("form_confirmations"),
    patch: v.object({
      name: v.optional(v.string()),
      type: v.optional(confirmationTypeValidator),
      content: v.optional(v.string()),
      redirectUrl: v.optional(v.string()),
      pageId: v.optional(v.string()),
      conditionalLogic: v.optional(v.string()),
    }),
  },
  handler: async (ctx, { confirmationId, patch }) => {
    const user = await requireCan(ctx, formCap("form.manage_confirmations"));

    const existing = await ctx.db.get(confirmationId);
    if (!existing) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Confirmation not found.",
      });
    }

    const update: Record<string, unknown> = {};
    if (patch.name !== undefined) {
      const name = patch.name.trim();
      if (!name) {
        throw new ConvexError({
          code: "VALIDATION_ERROR",
          message: "Confirmation name cannot be empty.",
        });
      }
      update.name = name;
    }
    if (patch.type !== undefined) update.type = patch.type;
    if (patch.redirectUrl !== undefined) {
      assertAllowedRedirect(patch.redirectUrl);
      update.redirectUrl = patch.redirectUrl;
    }
    if (patch.content !== undefined) {
      update.content = sanitizeMessage(patch.content);
    }
    if (patch.pageId !== undefined) update.pageId = patch.pageId;
    if (patch.conditionalLogic !== undefined) {
      update.conditionalLogic = patch.conditionalLogic;
    }

    update.updatedBy = user._id;
    update.updatedAt = Date.now();
    await ctx.db.patch(confirmationId, update);
    return await ctx.db.get(confirmationId);
  },
});

export const reorderConfirmations = mutation({
  args: {
    formId: v.id("forms"),
    order: v.array(v.id("form_confirmations")),
  },
  handler: async (ctx, { order }) => {
    await requireCan(ctx, formCap("form.manage_confirmations"));
    await Promise.all(
      order.map((id, index) => ctx.db.patch(id, { order: index })),
    );
    return { success: true };
  },
});

export const setDefaultConfirmation = mutation({
  args: {
    formId: v.id("forms"),
    confirmationId: v.id("form_confirmations"),
  },
  handler: async (ctx, { formId, confirmationId }) => {
    const user = await requireCan(ctx, formCap("form.manage_confirmations"));

    const target = await ctx.db.get(confirmationId);
    if (!target || target.formId !== formId) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Confirmation not found.",
      });
    }

    const now = Date.now();
    // Clear the prior default(s) for this form.
    const priorDefaults = await ctx.db
      .query("form_confirmations")
      .withIndex("by_form_default", (q) =>
        q.eq("formId", formId).eq("isDefault", true),
      )
      .collect();
    for (const row of priorDefaults) {
      if (row._id === confirmationId) continue;
      await ctx.db.patch(row._id, {
        isDefault: false,
        updatedBy: user._id,
        updatedAt: now,
      });
    }

    await ctx.db.patch(confirmationId, {
      isDefault: true,
      updatedBy: user._id,
      updatedAt: now,
    });
    return { success: true };
  },
});

export const deleteConfirmation = mutation({
  args: { confirmationId: v.id("form_confirmations") },
  handler: async (ctx, { confirmationId }) => {
    await requireCan(ctx, formCap("form.manage_confirmations"));

    const existing = await ctx.db.get(confirmationId);
    if (!existing) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Confirmation not found.",
      });
    }
    if (existing.isDefault) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: "Cannot delete the default confirmation. Set another default first.",
      });
    }
    await ctx.db.delete(confirmationId);
    return { success: true };
  },
});

// ─── Public resolver (UN-gated — NO requireCan) ──────────────────────────────

/**
 * Resolve which confirmation a submission should see. First-match-by-order over
 * the non-default rows (using the fail-open conditional evaluator), with a
 * guaranteed default fallback. Open-redirect guarded via the host allow-list.
 *
 * Return shape: { confirmationId, type, renderedMessage? | redirectUrl? | pagePath? }.
 */
export const resolveConfirmation = query({
  args: {
    formId: v.id("forms"),
    submissionId: v.id("form_submissions"),
  },
  handler: async (ctx, { formId, submissionId }) => {
    const all = await ctx.db
      .query("form_confirmations")
      .withIndex("by_form_order", (q) => q.eq("formId", formId))
      .collect();

    const def = all.find((c) => c.isDefault) ?? null;
    const conditional = all
      .filter((c) => !c.isDefault)
      .sort((a, b) => a.order - b.order);

    // Build value map (fieldName -> value); values are already strings.
    const valueRows = await ctx.db
      .query("fieldValues")
      .withIndex("by_entity", (q) =>
        q
          .eq("entityType", "form_submission")
          .eq("entityId", submissionId as string),
      )
      .collect();
    const valueMap: Record<string, string> = {};
    for (const row of valueRows) {
      valueMap[row.fieldName] = row.value;
    }

    const form = await ctx.db.get(formId);
    const submission = await ctx.db.get(submissionId);
    const formCtx = {
      title: form?.title ?? "",
      slug: form?.slug ?? "",
    };
    const submissionCtx = submission
      ? { _id: submission._id as string, submittedAt: submission.submittedAt }
      : null;

    // First-match-wins; a logic-less row always matches (evaluator fail-opens).
    const winner =
      conditional.find((c) =>
        evaluateConditionalLogic(c.conditionalLogic, valueMap),
      ) ?? def;

    // Fail-safe: no rows at all (should not happen — admin lazy-seeds a default).
    if (!winner) {
      return {
        confirmationId: "",
        type: "message" as const,
        renderedMessage: "Thank you.",
      };
    }

    const renderMessage = (row: typeof winner): string =>
      sanitizeMessage(
        renderConfirmationMergeTags(
          row.content ?? "",
          valueMap,
          formCtx,
          submissionCtx,
        ),
      );

    if (winner.type === "message") {
      return {
        confirmationId: winner._id,
        type: "message" as const,
        renderedMessage: renderMessage(winner),
      };
    }

    if (winner.type === "redirect") {
      // Host allow-list re-checked at resolve time; disallowed → default message.
      if (winner.redirectUrl && isAllowedRedirectHost(winner.redirectUrl)) {
        return {
          confirmationId: winner._id,
          type: "redirect" as const,
          redirectUrl: winner.redirectUrl,
        };
      }
      return {
        confirmationId: def?._id ?? winner._id,
        type: "message" as const,
        renderedMessage: def ? renderMessage(def) : "Thank you.",
      };
    }

    // type === "page"
    if (winner.pageId && winner.pageId.trim()) {
      return {
        confirmationId: winner._id,
        type: "page" as const,
        pagePath: winner.pageId,
      };
    }
    // Blank pageId → fall back to default.
    return {
      confirmationId: def?._id ?? winner._id,
      type: "message" as const,
      renderedMessage: def ? renderMessage(def) : "Thank you.",
    };
  },
});
