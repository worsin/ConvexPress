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
import { currentUserCan } from "../../helpers/permissions";
import { isPluginEnabled } from "../../helpers/plugins";
import type { Id } from "../../_generated/dataModel";
import type { Capability } from "../../types/capabilities";
import {
  parseFormSettings,
  evaluateFormTimeAvailability,
  formEntryLimit,
  formRequiresLogin,
} from "./builderCore";
import { loadSecuritySettings } from "./spam";
import { isGeneratedResumeToken } from "./tokens";

function formCap(cap: string): Capability {
  return cap as Capability;
}

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

type SubmissionDoc = {
  _id: Id<"form_submissions">;
  formId: Id<"forms">;
  status: "partial" | "complete" | "spam" | "deleted";
  submittedAt?: number;
  completedAt?: number;
  ip?: string;
  userAgent?: string;
  referrer?: string;
  userId?: Id<"users">;
  resumeToken?: string;
  currentStep?: number;
  read?: boolean;
  starred?: boolean;
  meta?: string;
  createdAt: number;
  updatedAt: number;
};

async function completeSubmissionCountAtLimit(
  ctx: { db: { query: any } },
  formId: Id<"forms">,
  limit: number,
): Promise<boolean> {
  const rows = await ctx.db
    .query("form_submissions")
    .withIndex("by_form_status", (q: any) =>
      q.eq("formId", formId).eq("status", "complete"),
    )
    .take(limit);
  return rows.length >= limit;
}

async function countFieldsForForm(
  ctx: { db: { query: any } },
  fieldGroupId: Id<"fieldGroups"> | undefined,
): Promise<number> {
  if (!fieldGroupId) return 0;
  const fields = await ctx.db
    .query("fieldDefinitions")
    .withIndex("by_group", (q: any) => q.eq("groupId", fieldGroupId))
    .collect();
  return fields.length;
}

async function withFieldCounts<
  T extends { fieldGroupId?: Id<"fieldGroups"> },
>(
  ctx: { db: { query: any } },
  forms: T[],
): Promise<Array<T & { fieldCount: number }>> {
  return await Promise.all(
    forms.map(async (form) => ({
      ...form,
      fieldCount: await countFieldsForForm(ctx, form.fieldGroupId),
    })),
  );
}

function normalizeSubmissionRow<T extends SubmissionDoc>(
  row: T,
): T & { read: boolean; starred: boolean } {
  return {
    ...row,
    read: row.read === true,
    starred: row.starred === true,
  };
}

function normalizeEntrySearch(search: string | undefined): string {
  return (search ?? "").trim().toLowerCase().slice(0, 128);
}

function parseSearchCursor(cursor: string | null): number {
  const parsed = cursor ? Number.parseInt(cursor, 10) : 0;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function submissionMatchesSearch(row: SubmissionDoc, term: string): boolean {
  return [
    row._id,
    row.status,
    row.referrer,
    row.userId,
    row.resumeToken,
    row.ip,
    row.userAgent,
  ]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(term));
}

async function submissionValuesMatchSearch(
  ctx: { db: { query: any } },
  submissionId: Id<"form_submissions">,
  term: string,
): Promise<boolean> {
  const values = await ctx.db
    .query("fieldValues")
    .withIndex("by_entity", (q: any) =>
      q
        .eq("entityType", "form_submission")
        .eq("entityId", submissionId as string),
    )
    .collect();

  return values.some((value: { fieldName?: string; fieldKey?: string; value?: string }) =>
    [value.fieldName, value.fieldKey, value.value]
      .filter(Boolean)
      .some((part) => String(part).toLowerCase().includes(term)),
  );
}

async function searchSubmissions(
  ctx: { db: { query: any } },
  formId: Id<"forms">,
  status: "partial" | "complete" | "spam" | "deleted" | undefined,
  paginationOpts: { numItems: number; cursor: string | null },
  term: string,
  read: boolean | undefined,
  starred: boolean | undefined,
) {
  const rows: SubmissionDoc[] = status
    ? await ctx.db
        .query("form_submissions")
        .withIndex("by_form_status", (q: any) =>
          q.eq("formId", formId).eq("status", status),
        )
        .order("desc")
        .collect()
    : await ctx.db
        .query("form_submissions")
        .withIndex("by_form", (q: any) => q.eq("formId", formId))
        .order("desc")
        .collect();

  const matched: SubmissionDoc[] = [];
  for (const row of rows) {
    if (read !== undefined && (row.read === true) !== read) continue;
    if (starred !== undefined && (row.starred === true) !== starred) continue;
    if (
      !term ||
      submissionMatchesSearch(row, term) ||
      (await submissionValuesMatchSearch(ctx, row._id, term))
    ) {
      matched.push(row);
    }
  }

  const cursorIndex = parseSearchCursor(paginationOpts.cursor);
  const numItems = Math.max(1, paginationOpts.numItems);
  const page = matched
    .slice(cursorIndex, cursorIndex + numItems)
    .map(normalizeSubmissionRow);
  const nextCursor = cursorIndex + numItems;
  const isDone = nextCursor >= matched.length;
  return {
    page,
    isDone,
    continueCursor: isDone ? "" : String(nextCursor),
  };
}

function authorDisplayName(
  user:
    | {
        displayName?: string;
        firstName?: string;
        lastName?: string;
        email?: string;
      }
    | null,
): string {
  if (!user) return "Unknown user";
  const fullName = [user.firstName, user.lastName].filter(Boolean).join(" ");
  return user.displayName || fullName || user.email || "Unknown user";
}

// ─── Admin: paginated forms list ─────────────────────────────────────────────
export const list = query({
  args: {
    paginationOpts: paginationOptsValidator,
    status: v.optional(formStatus),
  },
  handler: async (ctx, { paginationOpts, status }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return { page: [], isDone: true, continueCursor: null };
    if (!(await isPluginEnabled(ctx, "forms"))) {
      return { page: [], isDone: true, continueCursor: null };
    }
    if (!(await currentUserCan(ctx, formCap("form.view")))) {
      return { page: [], isDone: true, continueCursor: null };
    }

    if (status) {
      const result = await ctx.db
        .query("forms")
        .withIndex("by_status", (q) => q.eq("status", status))
        .order("desc")
        .paginate(paginationOpts);
      return {
        ...result,
        page: await withFieldCounts(ctx, result.page),
      };
    }
    const result = await ctx.db
      .query("forms")
      .filter((q) => q.neq(q.field("status"), "archived"))
      .order("desc")
      .paginate(paginationOpts);
    return {
      ...result,
      page: await withFieldCounts(ctx, result.page),
    };
  },
});

// ─── Admin: single form by id ────────────────────────────────────────────────
export const getForm = query({
  args: { id: v.id("forms") },
  handler: async (ctx, { id }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    if (!(await isPluginEnabled(ctx, "forms"))) return null;
    if (!(await currentUserCan(ctx, formCap("form.view")))) return null;
    return await ctx.db.get(id);
  },
});

// ─── Public: a published form + its field definitions (for rendering) ────────
export const getBySlug = query({
  args: { slug: v.string() },
  handler: async (ctx, { slug }) => {
    if (!(await isPluginEnabled(ctx, "forms"))) return null;

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
    const settings = parseFormSettings(form.settings);
    const security = await loadSecuritySettings(ctx);
    const timeAvailability = evaluateFormTimeAvailability(settings, Date.now());
    const entryLimit = formEntryLimit(settings);
    const entryLimitReached =
      entryLimit !== null
        ? await completeSubmissionCountAtLimit(ctx, form._id, entryLimit)
        : false;
    const closed =
      !timeAvailability.open || entryLimitReached
        ? {
            code: !timeAvailability.open
              ? timeAvailability.code
              : "ENTRY_LIMIT_REACHED",
            message: !timeAvailability.open
              ? timeAvailability.message
              : "This form has reached its entry limit.",
          }
        : null;

    return {
      _id: form._id,
      title: form.title,
      slug: form.slug,
      description: form.description,
      settings: form.settings,
      availability: {
        open: closed === null,
        code: closed?.code,
        message: closed?.message,
        loginRequired: formRequiresLogin(settings),
        entryLimitReached,
      },
      security: {
        honeypotEnabled: security.honeypotEnabled,
        honeypotFieldName: security.honeypotFieldName,
        captchaEnabled: security.captchaEnabled,
        captchaProvider: security.captchaProvider,
        captchaSiteKey: security.captchaSiteKey ?? null,
        recaptchaMinScore: security.recaptchaMinScore,
      },
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
    if (!(await isPluginEnabled(ctx, "forms"))) return null;
    if (!isGeneratedResumeToken(token)) return null;

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
    search: v.optional(v.string()),
    read: v.optional(v.boolean()),
    starred: v.optional(v.boolean()),
  },
  handler: async (
    ctx,
    { formId, paginationOpts, status, search, read, starred },
  ) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return { page: [], isDone: true, continueCursor: null };
    if (!(await isPluginEnabled(ctx, "forms"))) {
      return { page: [], isDone: true, continueCursor: null };
    }
    if (!(await currentUserCan(ctx, formCap("form.view_entries")))) {
      return { page: [], isDone: true, continueCursor: null };
    }

    const term = normalizeEntrySearch(search);
    if (term || read !== undefined || starred !== undefined) {
      return await searchSubmissions(
        ctx,
        formId,
        status,
        paginationOpts,
        term,
        read,
        starred,
      );
    }

    if (status) {
      const result = await ctx.db
        .query("form_submissions")
        .withIndex("by_form_status", (q) =>
          q.eq("formId", formId).eq("status", status),
        )
        .order("desc")
        .paginate(paginationOpts);
      return {
        ...result,
        page: result.page.map(normalizeSubmissionRow),
      };
    }
    const result = await ctx.db
      .query("form_submissions")
      .withIndex("by_form", (q) => q.eq("formId", formId))
      .order("desc")
      .paginate(paginationOpts);
    return {
      ...result,
      page: result.page.map(normalizeSubmissionRow),
    };
  },
});

// ─── Admin: notes for a single submission ───────────────────────────────────
export const listNotes = query({
  args: {
    submissionId: v.id("form_submissions"),
    formId: v.optional(v.id("forms")),
  },
  handler: async (ctx, { submissionId, formId }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];
    if (!(await isPluginEnabled(ctx, "forms"))) return [];
    if (!(await currentUserCan(ctx, formCap("form.view_entries")))) return [];

    const submission = await ctx.db.get(submissionId);
    if (!submission) return [];
    if (formId !== undefined && submission.formId !== formId) return [];

    const notes = await ctx.db
      .query("form_submission_notes")
      .withIndex("by_submission", (q) => q.eq("submissionId", submissionId))
      .collect();

    const enrichedNotes = await Promise.all(
      notes
        .sort((a, b) => b.createdAt - a.createdAt)
        .map(async (note) => {
          const author = await ctx.db.get(note.authorId);
          return {
            ...note,
            authorName: authorDisplayName(author),
            authorEmail: author?.email,
          };
        }),
    );
    return enrichedNotes;
  },
});

// ─── Admin: a single submission with its answers + notes ─────────────────────
export const getSubmission = query({
  args: { id: v.id("form_submissions") },
  handler: async (ctx, { id }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    if (!(await isPluginEnabled(ctx, "forms"))) return null;
    if (!(await currentUserCan(ctx, formCap("form.view_entries")))) return null;

    const submission = await ctx.db.get(id);
    if (!submission) return null;
    const form = await ctx.db.get(submission.formId);

    const values = await ctx.db
      .query("fieldValues")
      .withIndex("by_entity", (q) =>
        q.eq("entityType", "form_submission").eq("entityId", id as string),
      )
      .collect();

    const fieldGroupId = form?.fieldGroupId;
    const fieldDefs = fieldGroupId
      ? await ctx.db
          .query("fieldDefinitions")
          .withIndex("by_group", (q) => q.eq("groupId", fieldGroupId))
          .collect()
      : [];
    const fieldByKey = new Map(fieldDefs.map((field) => [field.key, field]));
    const enrichedValues = values.map((value) => {
      const field = fieldByKey.get(value.fieldKey);
      return {
        ...value,
        fieldLabel: field?.label ?? value.fieldName ?? value.fieldKey,
        fieldType: field?.type,
      };
    });

    const notes = await ctx.db
      .query("form_submission_notes")
      .withIndex("by_submission", (q) => q.eq("submissionId", id))
      .collect();
    const enrichedNotes = await Promise.all(
      notes
        .sort((a, b) => b.createdAt - a.createdAt)
        .map(async (note) => {
          const author = await ctx.db.get(note.authorId);
          return {
            ...note,
            authorName: authorDisplayName(author),
            authorEmail: author?.email,
          };
        }),
    );

    // Surface the trusted, server-recomputed pricing summary (integer cents)
    // from `meta.pricing` so the Commerce / Subscription Action + Confirmation
    // screen read ONE object without re-walking the calculation graph (Form
    // Calculation & Pricing PRD §5). Null when the form carries no pricing.
    const pricing = parseMetaPricing(submission.meta);

    return {
      submission: normalizeSubmissionRow(submission),
      values: enrichedValues,
      notes: enrichedNotes,
      pricing,
    };
  },
});

// ─── Public: a submission's trusted pricing summary (commerce/confirmation) ───
export const getSubmissionPricing = query({
  args: { id: v.id("form_submissions") },
  handler: async (ctx, { id }) => {
    if (!(await isPluginEnabled(ctx, "forms"))) return null;
    const submission = await ctx.db.get(id);
    if (!submission) return null;
    return parseMetaPricing(submission.meta);
  },
});

/**
 * Extract `{ oneTime, recurring }` from a submission's `meta` JSON bag. Returns
 * null when meta is absent/malformed or carries no pricing. Pure helper.
 */
export interface SubmissionPricingSnapshot {
  oneTime: number;
  recurring: Array<{ interval: string; amount: number; label?: string }>;
  lineItems: Array<Record<string, unknown>>;
  currency: string;
}

export function parseMetaPricing(
  meta: string | undefined,
): SubmissionPricingSnapshot | null {
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
      return {
        oneTime: pricing.oneTime,
        recurring: pricing.recurring,
        lineItems: Array.isArray(pricing.lineItems) ? pricing.lineItems : [],
        currency:
          typeof pricing.currency === "string" && pricing.currency.trim()
            ? pricing.currency.trim().toUpperCase()
            : "USD",
      };
    }
    return null;
  } catch {
    return null;
  }
}
