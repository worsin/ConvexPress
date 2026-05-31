/**
 * ConvexPress Forms — queries (v2 Layer 2)
 * API path: api.extensions.forms.queries.*
 *
 * Public-safe reads project explicit fields. Admin reads authenticate and
 * let the route guards enforce the capability. Form fields are read from the
 * reused customFields `fieldDefinitions`; submission answers from `fieldValues`.
 */

import { query } from "../../_generated/server";
import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";

const formStatus = v.union(
  v.literal("draft"),
  v.literal("published"),
  v.literal("archived"),
);

const submissionStatus = v.union(
  v.literal("partial"),
  v.literal("complete"),
  v.literal("spam"),
  v.literal("deleted"),
);

// ─── Admin: paginated forms list ─────────────────────────────────────────────
export const list = query({
  args: {
    paginationOpts: paginationOptsValidator,
    status: v.optional(formStatus),
  },
  handler: async (ctx, { paginationOpts, status }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return { page: [], isDone: true, continueCursor: null };

    if (status) {
      return await ctx.db
        .query("forms")
        .withIndex("by_status", (q) => q.eq("status", status))
        .order("desc")
        .paginate(paginationOpts);
    }
    return await ctx.db.query("forms").order("desc").paginate(paginationOpts);
  },
});

// ─── Admin: single form by id ────────────────────────────────────────────────
export const getForm = query({
  args: { id: v.id("forms") },
  handler: async (ctx, { id }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    return await ctx.db.get(id);
  },
});

// ─── Public: a published form + its field definitions (for rendering) ────────
export const getBySlug = query({
  args: { slug: v.string() },
  handler: async (ctx, { slug }) => {
    const form = await ctx.db
      .query("forms")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .first();
    if (!form || form.status !== "published") return null;

    const groupId = form.fieldGroupId;
    const fieldDefs = groupId
      ? await ctx.db
          .query("fieldDefinitions")
          .withIndex("by_group", (q) => q.eq("groupId", groupId))
          .collect()
      : [];

    return {
      _id: form._id,
      title: form.title,
      slug: form.slug,
      description: form.description,
      settings: form.settings,
      fields: fieldDefs.map((f) => ({
        _id: f._id,
        label: f.label,
        name: f.name,
        key: f.key,
        type: f.type,
        instructions: f.instructions,
        required: f.required,
        defaultValue: f.defaultValue,
        settings: f.settings,
        conditionalLogic: f.conditionalLogic,
        parentFieldId: f.parentFieldId,
        menuOrder: f.menuOrder,
      })),
    };
  },
});

// ─── Public: resume a save-and-continue draft by token ───────────────────────

/**
 * Default draft TTL for save-and-continue (Form Multi-Step PRD §11): 30 days.
 * The schema has no `form_submissions.expiresAt` column today, so v1 computes
 * expiry from `submittedAt + DEFAULT_RESUME_TTL_MS` at read time. If/when the
 * Submission System adds an explicit column, read that instead (owned there).
 */
export const DEFAULT_RESUME_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Compute a draft's resume expiry from its start time. v1 has no `expiresAt`
 * column, so expiry = (submittedAt ?? createdAt) + TTL. Pure.
 */
export function computeResumeExpiry(
  sub: { submittedAt?: number; createdAt: number },
  ttlMs: number = DEFAULT_RESUME_TTL_MS,
): number {
  const startedAt = sub.submittedAt ?? sub.createdAt;
  return startedAt + ttlMs;
}

/**
 * Resume-safe projection of a draft's answer rows: a flat `{ fieldKey -> value }`
 * map drawn ONLY from `fieldKey`/`value`. By construction this can never carry
 * a row's `updatedBy`/`updatedAt` or any submission-level metadata
 * (createdBy/ip/userAgent/referrer/meta/...). Pure.
 */
export function projectResumeValues(
  rows: Array<{ fieldKey: string; value: string }>,
): Record<string, string> {
  const values: Record<string, string> = {};
  for (const row of rows) {
    values[row.fieldKey] = row.value;
  }
  return values;
}

/**
 * PUBLIC, no-auth resume query (the ONE new backend surface this system owns).
 * The opaque token IS the credential for an anonymous draft. Abuse control on
 * reads is the Spam System's job on the underlying surface.
 *
 * Returns:
 *   - `null` when the token is unknown / not a `partial` / its form is missing
 *     or unpublished (route → NotFound).
 *   - `{ status: "expired" }` when the draft is past its TTL (route → expired
 *     notice). NEVER returns answer data for an expired draft.
 *   - else the resume-safe projection: `{ submissionId, formSlug, status,
 *     currentStep, expiresAt, values }` where `values` is keyed by `fieldKey`
 *     (string→string) so it drops straight into the wizard's value map. No
 *     authoring metadata (createdBy/updatedBy/ip/meta/...) is ever projected.
 */
export const resume = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const sub = await ctx.db
      .query("form_submissions")
      .withIndex("by_resumeToken", (q) => q.eq("resumeToken", token))
      .first();

    // Unknown / completed / spam / deleted → not resumable.
    if (!sub || sub.status !== "partial") return null;

    // Expiry (computed from submittedAt + TTL; no expiresAt column yet).
    const expiresAt = computeResumeExpiry(sub);
    if (Date.now() > expiresAt) {
      return { status: "expired" as const };
    }

    // Parent form must exist + be published.
    const form = await ctx.db.get(sub.formId);
    if (!form || form.status !== "published") return null;

    // Read answers; project resume-safe { fieldKey -> value } only.
    const rows = await ctx.db
      .query("fieldValues")
      .withIndex("by_entity", (q) =>
        q
          .eq("entityType", "form_submission")
          .eq("entityId", sub._id as string),
      )
      .collect();

    const values = projectResumeValues(rows);

    return {
      submissionId: sub._id,
      formSlug: form.slug,
      status: "partial" as const,
      currentStep: sub.currentStep ?? 0,
      expiresAt,
      values,
    };
  },
});

// ─── Admin: submissions for a form (paginated) ───────────────────────────────
export const listSubmissions = query({
  args: {
    formId: v.id("forms"),
    paginationOpts: paginationOptsValidator,
    status: v.optional(submissionStatus),
  },
  handler: async (ctx, { formId, paginationOpts, status }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return { page: [], isDone: true, continueCursor: null };

    if (status) {
      return await ctx.db
        .query("form_submissions")
        .withIndex("by_form_status", (q) =>
          q.eq("formId", formId).eq("status", status),
        )
        .order("desc")
        .paginate(paginationOpts);
    }
    return await ctx.db
      .query("form_submissions")
      .withIndex("by_form", (q) => q.eq("formId", formId))
      .order("desc")
      .paginate(paginationOpts);
  },
});

// ─── Admin: a single submission with its answers + notes ─────────────────────
export const getSubmission = query({
  args: { id: v.id("form_submissions") },
  handler: async (ctx, { id }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const submission = await ctx.db.get(id);
    if (!submission) return null;

    const values = await ctx.db
      .query("fieldValues")
      .withIndex("by_entity", (q) =>
        q.eq("entityType", "form_submission").eq("entityId", id as string),
      )
      .collect();

    const notes = await ctx.db
      .query("form_submission_notes")
      .withIndex("by_submission", (q) => q.eq("submissionId", id))
      .collect();

    // Surface the trusted, server-recomputed pricing summary (integer cents)
    // from `meta.pricing` so the Commerce / Subscription Action + Confirmation
    // screen read ONE object without re-walking the calculation graph (Form
    // Calculation & Pricing PRD §5). Null when the form carries no pricing.
    const pricing = parseMetaPricing(submission.meta);

    return { submission, values, notes, pricing };
  },
});

// ─── Public: a submission's trusted pricing summary (commerce/confirmation) ───
export const getSubmissionPricing = query({
  args: { id: v.id("form_submissions") },
  handler: async (ctx, { id }) => {
    const submission = await ctx.db.get(id);
    if (!submission) return null;
    return parseMetaPricing(submission.meta);
  },
});

/**
 * Extract `{ oneTime, recurring }` from a submission's `meta` JSON bag. Returns
 * null when meta is absent/malformed or carries no pricing. Pure helper.
 */
export function parseMetaPricing(
  meta: string | undefined,
): { oneTime: number; recurring: Array<{ interval: string; amount: number; label?: string }> } | null {
  if (!meta) return null;
  try {
    const parsed = JSON.parse(meta);
    const pricing = parsed?.pricing;
    if (
      pricing &&
      typeof pricing === "object" &&
      typeof pricing.oneTime === "number" &&
      Array.isArray(pricing.recurring)
    ) {
      return pricing;
    }
    return null;
  } catch {
    return null;
  }
}
