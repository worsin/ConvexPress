import { contactSourceAllowed } from "../../canonicalDocuments/contactSource";
import { readCompletedFormCount } from "../../helpers/formSubmissionCounts";
/**
 * ConvexPress Forms — queries (v2 Layer 2)
 * API path: api.extensions.forms.queries.*
 *
 * Public-safe reads project explicit fields. Admin reads authenticate and
 * let the route guards enforce the capability. Form fields are read from the
 * reused customFields `fieldDefinitions`; submission answers from `fieldValues`.
 */

import { query, type QueryCtx } from "../../_generated/server";
import { v, type Infer } from "convex/values";
import type { PricingLineItem } from "./calc/recompute";
import {
  parsePricingLineItems,
  parseRecurringSnapshots,
  type PricingRecurringSnapshot,
} from "./pricingSnapshot";
import { paginationOptsValidator } from "convex/server";
import { currentUserCan, getCurrentUser } from "../../helpers/permissions";
import { isPluginEnabled } from "../../helpers/plugins";
import { evaluateMembershipAccess } from "../../membership/access";
import type { Id } from "../../_generated/dataModel";
import type { Capability } from "../../types/capabilities";
import {
  parseFormSettings,
  evaluateFormTimeAvailability,
  formEntryLimit,
  formRequiresAccountToSubmit,
  formRequiresLogin,
  publicFormSettingsJson,
} from "./builderCore";
import { actionPlan, choiceForOffer, choiceValues, withPlanPrefill, type ActionPlan } from "./planLinks";
import { loadSecuritySettings } from "./spam";
import { isGeneratedResumeToken, computeResumeExpiry } from "./tokens";
export { DEFAULT_RESUME_TTL_MS, computeResumeExpiry } from "./tokens";
import { LAYOUT_FIELD_TYPES } from "../../customFields/validators";
import { RequestReadLedger } from "../../helpers/requestReadLedger";

import { formsExtensionDocs } from "./schema.docs.generated";
import { paginationResultValidator } from "convex/server";
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

async function countFieldsForForm(
  ctx: { db: QueryCtx["db"] },
  fieldGroupId: Id<"fieldGroups"> | undefined,
): Promise<number> {
  if (!fieldGroupId) return 0;
  const fields = await ctx.db
    .query("fieldDefinitions")
    .withIndex("by_group", (q) => q.eq("groupId", fieldGroupId))
    .collect();
  return fields.length;
}

async function withFieldCounts<
  T extends { fieldGroupId?: Id<"fieldGroups"> },
>(
  ctx: { db: QueryCtx["db"] },
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
  ctx: { db: QueryCtx["db"] },
  submissionId: Id<"form_submissions">,
  term: string,
): Promise<boolean> {
  const values = await ctx.db
    .query("fieldValues")
    .withIndex("by_entity", (q) =>
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
  ctx: { db: QueryCtx["db"] },
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
        .withIndex("by_form_status", (q) =>
          q.eq("formId", formId).eq("status", status),
        )
        .order("desc")
        .collect()
    : await ctx.db
        .query("form_submissions")
        .withIndex("by_form", (q) => q.eq("formId", formId))
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
  returns: paginationResultValidator(v.object({
    _id: v.id("forms"),
    _creationTime: v.number(),
    updatedBy: v.optional(v.id("users")),
    description: v.optional(v.string()),
    publishedAt: v.optional(v.number()),
    contactPostId: v.optional(v.id("posts")),
    contactBlockId: v.optional(v.string()),
    contactDefinition: v.optional(v.string()),
    contactNotificationId: v.optional(v.id("form_notifications")),
    contactConfirmationId: v.optional(v.id("form_confirmations")),
    fieldGroupId: v.optional(v.id("fieldGroups")),
    submissionCountReady: v.optional(v.boolean()),
    title: v.string(),
    updatedAt: v.number(),
    createdAt: v.number(),
    status: v.union(v.literal("draft"), v.literal("archived"), v.literal("published")),
    slug: v.string(),
    createdBy: v.id("users"),
    settings: v.string(),
    fieldCount: v.number(),
  })),
  handler: async (ctx, { paginationOpts, status }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return { page: [], isDone: true, continueCursor: "" };
    if (!(await isPluginEnabled(ctx, "forms"))) {
      return { page: [], isDone: true, continueCursor: "" };
    }
    if (!(await currentUserCan(ctx, formCap("form.view")))) {
      return { page: [], isDone: true, continueCursor: "" };
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
  returns: v.union(v.null(), formsExtensionDocs.forms),
  handler: async (ctx, { id }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    if (!(await isPluginEnabled(ctx, "forms"))) return null;
    if (!(await currentUserCan(ctx, formCap("form.view")))) return null;
    return await ctx.db.get(id);
  },
});

// ─── Plan offers (subscription forms) ────────────────────────────────────────

const planOfferValidator = v.object({
  value: v.string(),
  title: v.string(),
  publicSummary: v.optional(v.string()),
  currencyCode: v.string(),
  recurringAmount: v.number(),
  setupFeeAmount: v.optional(v.number()),
  billingInterval: v.optional(v.union(v.literal("day"), v.literal("week"), v.literal("month"), v.literal("year"))),
  billingIntervalCount: v.optional(v.number()),
  trialDays: v.optional(v.number()),
  features: v.array(v.object({ text: v.string(), highlighted: v.optional(v.boolean()) })),
});
type PlanOffer = Infer<typeof planOfferValidator>;

/** Each choice of a plan field with the active offer it buys (choices without one are left out). */
async function planOffersFor(
  ctx: QueryCtx,
  plan: Extract<ActionPlan, { mode: "fromField" }>,
  values: string[],
): Promise<PlanOffer[]> {
  const out: PlanOffer[] = [];
  for (const value of values) {
    const mapped = plan.offerByChoice[value] ?? value;
    const offerId = ctx.db.normalizeId("commerce_subscription_offers", mapped);
    const offer = offerId ? await ctx.db.get(offerId) : null;
    if (!offer || offer.status !== "active" || choiceForOffer(plan, offer._id) !== value) continue;
    const template = await ctx.db.get(offer.templateId);
    out.push({
      value,
      title: offer.title,
      publicSummary: offer.publicSummary,
      currencyCode: offer.currencyCode,
      recurringAmount: offer.recurringAmount,
      setupFeeAmount: offer.setupFeeAmount,
      billingInterval: template?.billingInterval,
      billingIntervalCount: template?.billingIntervalCount,
      trialDays: offer.trialDaysOverride ?? template?.trialDays,
      features: (offer.features ?? []).map((feature) => ({ text: feature.text, highlighted: feature.highlighted })),
    });
  }
  return out;
}

// ─── Public: a published form + its field definitions (for rendering) ────────
export const getBySlug = query({
  args: { slug: v.string(), contactPassword: v.optional(v.string()) },
  returns: v.union(v.null(), v.object({
    _id: v.id("forms"),
    title: v.string(),
    slug: v.string(),
    description: v.optional(v.string()),
    settings: v.string(),
    availability: v.object({
      open: v.boolean(),
      code: v.optional(v.string()),
      message: v.optional(v.string()),
      loginRequired: v.boolean(),
      /** Only the final submit needs an account; the website asks for it in the form. */
      accountRequiredToSubmit: v.boolean(),
      entryLimitReached: v.boolean(),
    }),
    security: v.object({
      honeypotEnabled: v.boolean(),
      honeypotFieldName: v.string(),
      captchaEnabled: v.boolean(),
      captchaProvider: v.union(v.literal("none"), v.literal("turnstile"), v.literal("hcaptcha"), v.literal("recaptcha")),
      captchaSiteKey: v.union(v.null(), v.string()),
      recaptchaMinScore: v.number(),
    }),
    fields: v.array(v.object({
      _id: v.id("fieldDefinitions"),
      label: v.string(),
      name: v.string(),
      key: v.string(),
      type: v.string(),
      instructions: v.optional(v.string()),
      required: v.boolean(),
      defaultValue: v.optional(v.string()),
      settings: v.string(),
      conditionalLogic: v.optional(v.string()),
      parentFieldId: v.optional(v.id("fieldDefinitions")),
      menuOrder: v.number(),
      /**
       * The plan field of a subscription action: each choice's offer as
       * customers see it, so the form can show plan cards. Public fields only.
       */
      planOffers: v.optional(v.array(planOfferValidator)),
    })),
  })),
  handler: async (ctx, { slug, contactPassword }) => {
    if (!(await isPluginEnabled(ctx, "forms"))) return null;

    const form = await ctx.db
      .query("forms")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .first();
    if (!form || form.status !== "published") return null;
    if (!(await contactSourceAllowed(ctx, form, contactPassword))) return null;
    if (!(await evaluateMembershipAccess(ctx, { resourceType: "route", resourceIdOrKey: `/forms/${encodeURIComponent(form.slug)}` })).allowed) return null;

    const groupId = form.fieldGroupId;
    const fieldDefs = groupId
      ? await ctx.db
          .query("fieldDefinitions")
          .withIndex("by_group", (q) => q.eq("groupId", groupId))
          .collect()
      : [];
    const settings = parseFormSettings(form.settings);
    // The field a subscription action reads the plan from can be preselected
    // from a link (pricing pages link into the form; see planLinks.ts).
    const subscriptionActions = (
      await ctx.db
        .query("form_actions")
        .withIndex("by_form_enabled", (q) => q.eq("formId", form._id).eq("enabled", true))
        .collect()
    ).filter((action) => action.type === "subscription");
    const planFields = new Map<string, Extract<ActionPlan, { mode: "fromField" }>>();
    for (const action of subscriptionActions) {
      const plan = actionPlan(action.config);
      if (plan?.mode === "fromField") planFields.set(plan.fieldKey, plan);
    }
    const planFieldKeys = new Set(planFields.keys());
    const planOffersByField = new Map<string, PlanOffer[]>();
    if (planFields.size > 0 && (await isPluginEnabled(ctx, "commerceSubscriptions"))) {
      for (const definition of fieldDefs) {
        const plan = planFields.get(definition.key);
        if (plan) planOffersByField.set(definition.key, await planOffersFor(ctx, plan, choiceValues(definition.settings)));
      }
    }
    const security = await loadSecuritySettings(ctx);
    const timeAvailability = evaluateFormTimeAvailability(settings, Date.now());
    const entryLimit = formEntryLimit(settings);
    const completeCount = entryLimit !== null ? await readCompletedFormCount(ctx, form._id) : 0;
    const countPending = completeCount === null;
    const entryLimitReached = entryLimit !== null && completeCount !== null && completeCount >= entryLimit;
    const closed =
      !timeAvailability.open || countPending || entryLimitReached
        ? {
            code: !timeAvailability.open
              ? timeAvailability.code
              : countPending ? "FORM_PREPARING" : "ENTRY_LIMIT_REACHED",
            message: !timeAvailability.open
              ? timeAvailability.message
              : countPending ? "This form is preparing its response count. Please try again shortly." : "This form has reached its entry limit.",
          }
        : null;

    return {
      _id: form._id,
      title: form.title,
      slug: form.slug,
      description: form.description,
      settings: publicFormSettingsJson(settings),
      availability: {
        open: closed === null,
        code: closed?.code,
        message: closed?.message,
        loginRequired: formRequiresLogin(settings),
        accountRequiredToSubmit: formRequiresAccountToSubmit(settings),
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
        settings: planFieldKeys.has(f.key) ? withPlanPrefill(f.settings) : f.settings,
        planOffers: planOffersByField.get(f.key),
        conditionalLogic: f.conditionalLogic,
        parentFieldId: f.parentFieldId,
        menuOrder: f.menuOrder,
      })),
    };
  },
});

// ─── Public: resume a save-and-continue draft by token ───────────────────────

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
  args: { token: v.string(), contactPassword: v.optional(v.string()) },
  returns: v.union(v.null(), v.object({
    status: v.literal("expired"),
  }), v.object({
    submissionId: v.id("form_submissions"),
    formSlug: v.string(),
    status: v.literal("partial"),
    currentStep: v.number(),
    expiresAt: v.number(),
    values: v.record(v.string(), v.string()),
  })),
  handler: async (ctx, { token, contactPassword }) => {
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
    if (!(await contactSourceAllowed(ctx, form, contactPassword))) return null;

    // Possession of a draft token cannot bypass current form access rules.
    if (!(await evaluateMembershipAccess(ctx, { resourceType: "route", resourceIdOrKey: `/forms/${encodeURIComponent(form.slug)}` })).allowed) return null;
    if (formRequiresLogin(parseFormSettings(form.settings))) {
      const user = await getCurrentUser(ctx);
      if (!user || user.status !== "active") return null;
    }

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
  returns: paginationResultValidator(v.object({
    _id: v.id("form_submissions"),
    formId: v.id("forms"),
    status: v.union(v.literal("partial"), v.literal("spam"), v.literal("complete"), v.literal("deleted")),
    submittedAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
    ip: v.optional(v.string()),
    userAgent: v.optional(v.string()),
    referrer: v.optional(v.string()),
    userId: v.optional(v.id("users")),
    resumeToken: v.optional(v.string()),
    currentStep: v.optional(v.number()),
    read: v.boolean(),
    starred: v.boolean(),
    meta: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })),
  handler: async (
    ctx,
    { formId, paginationOpts, status, search, read, starred },
  ) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return { page: [], isDone: true, continueCursor: "" };
    if (!(await isPluginEnabled(ctx, "forms"))) {
      return { page: [], isDone: true, continueCursor: "" };
    }
    if (!(await currentUserCan(ctx, formCap("form.view_entries")))) {
      return { page: [], isDone: true, continueCursor: "" };
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
  returns: v.array(v.object({
    authorName: v.string(),
    authorEmail: v.optional(v.string()),
    _id: v.id("form_submission_notes"),
    _creationTime: v.number(),
    createdAt: v.number(),
    authorId: v.id("users"),
    submissionId: v.id("form_submissions"),
    body: v.string(),
  })),
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
  returns: v.union(v.null(), v.object({
    submission: v.object({
      _id: v.id("form_submissions"),
      _creationTime: v.number(),
      userId: v.optional(v.id("users")),
      completedAt: v.optional(v.number()),
      referrer: v.optional(v.string()),
      userAgent: v.optional(v.string()),
      ip: v.optional(v.string()),
      currentStep: v.optional(v.number()),
      submittedAt: v.optional(v.number()),
      confirmationTokenHash: v.optional(v.string()),
      confirmationExpiresAt: v.optional(v.number()),
      resumeToken: v.optional(v.string()),
      read: v.boolean(),
      starred: v.boolean(),
      meta: v.optional(v.string()),
      updatedAt: v.number(),
      createdAt: v.number(),
      status: v.union(v.literal("partial"), v.literal("spam"), v.literal("complete"), v.literal("deleted")),
      formId: v.id("forms"),
    }),
    values: v.array(v.object({
      fieldLabel: v.string(),
      fieldType: v.optional(v.string()),
      _id: v.id("fieldValues"),
      _creationTime: v.number(),
      formFieldSnapshot: v.optional(v.object({ type: v.string(), label: v.string() })),
      updatedAt: v.number(),
      updatedBy: v.string(),
      value: v.string(),
      entityType: v.string(),
      entityId: v.string(),
      fieldKey: v.string(),
      fieldName: v.string(),
    })),
    notes: v.array(v.object({
      authorName: v.string(),
      authorEmail: v.optional(v.string()),
      _id: v.id("form_submission_notes"),
      _creationTime: v.number(),
      createdAt: v.number(),
      authorId: v.id("users"),
      submissionId: v.id("form_submissions"),
      body: v.string(),
    })),
    pricing: v.union(v.null(), v.object({
      oneTime: v.number(),
      recurring: v.array(v.object({ interval: v.string(), amount: v.number(), label: v.optional(v.string()) })),
      lineItems: v.array(v.object({
        source: v.union(v.literal("product"), v.literal("choice"), v.literal("calculation")),
        fieldKey: v.string(),
        fieldLabel: v.string(),
        label: v.string(),
        amount: v.number(),
        priceKind: v.union(v.literal("recurring"), v.literal("oneTime")),
        choiceValue: v.optional(v.string()),
        quantity: v.optional(v.number()),
        interval: v.optional(v.union(v.literal("year"), v.literal("month"))),
        recurringLabel: v.optional(v.string()),
        firstPeriodAmount: v.optional(v.number()),
      })),
      currency: v.string(),
    })),
  })),
  handler: async (ctx, { id }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    if (!(await isPluginEnabled(ctx, "forms"))) return null;
    if (!(await currentUserCan(ctx, formCap("form.view_entries")))) return null;

    const submission = await ctx.db.get(id);
    if (!submission) return null;

    const values = await ctx.db
      .query("fieldValues")
      .withIndex("by_entity", (q) =>
        q.eq("entityType", "form_submission").eq("entityId", id as string),
      )
      .collect();

    // Current definitions cannot establish which prompt a historical visitor
    // answered. Preserve legacy names; never manufacture missing labels/types.
    const enrichedValues = values.map((value) => ({
      ...value,
      fieldLabel: value.formFieldSnapshot?.label ?? value.fieldName ?? value.fieldKey,
      fieldType: value.formFieldSnapshot?.type,
    }));

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

/** Mutable correction policy is separate from the immutable answer history.
 * Archived forms still allow authorized corrections, just like updateEntry.
 * Absence from this list means a stored answer's definition was removed.
 */
export const getSubmissionEditing = query({
  args: { id: v.id("form_submissions") },
  returns: v.union(v.null(), v.array(v.object({
    fieldKey: v.string(),
    label: v.string(),
    type: v.string(),
    required: v.boolean(),
    updatedAt: v.number(),
    editable: v.boolean(),
  }))),
  handler: async (ctx, { id }) => {
    if (!(await ctx.auth.getUserIdentity())) return null;
    if (!(await isPluginEnabled(ctx, "forms"))) return null;
    if (!(await currentUserCan(ctx, formCap("form.view_entries")))) return null;
    if (!(await currentUserCan(ctx, formCap("form.edit_entry")))) return null;
    const submission = await ctx.db.get(id);
    if (!submission) return null;
    const form = await ctx.db.get(submission.formId);
    if (!form?.fieldGroupId) return [];
    const budget = new RequestReadLedger();
    const fields = [];
    for await (const field of ctx.db.query("fieldDefinitions")
      .withIndex("by_group", q => q.eq("groupId", form.fieldGroupId!))) {
      budget.beforeRead();
      budget.record(field);
      fields.push({
        fieldKey: field.key, label: field.label, type: field.type,
        required: field.required, updatedAt: field.updatedAt,
        editable: field.type !== "calculation" && !LAYOUT_FIELD_TYPES.has(field.type),
      });
    }
    return fields;
  },
});

// ─── Public: a submission's trusted pricing summary (commerce/confirmation) ───
export const getSubmissionPricing = query({
  args: { id: v.id("form_submissions") },
  returns: v.union(v.null(), v.object({
    oneTime: v.number(),
    recurring: v.array(v.object({ interval: v.string(), amount: v.number(), label: v.optional(v.string()) })),
    lineItems: v.array(v.object({
      source: v.union(v.literal("product"), v.literal("choice"), v.literal("calculation")),
      fieldKey: v.string(),
      fieldLabel: v.string(),
      label: v.string(),
      amount: v.number(),
      priceKind: v.union(v.literal("recurring"), v.literal("oneTime")),
      choiceValue: v.optional(v.string()),
      quantity: v.optional(v.number()),
      interval: v.optional(v.union(v.literal("year"), v.literal("month"))),
      recurringLabel: v.optional(v.string()),
      firstPeriodAmount: v.optional(v.number()),
    })),
    currency: v.string(),
  })),
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
  recurring: PricingRecurringSnapshot[];
  lineItems: PricingLineItem[];
  currency: string;
}

function readPricingBag(meta: string): Record<string, unknown> | null {
  const parsed: unknown = JSON.parse(meta);
  if (typeof parsed !== "object" || parsed === null || !("pricing" in parsed)) return null;
  const pricing: unknown = parsed.pricing;
  return typeof pricing === "object" && pricing !== null && !Array.isArray(pricing)
    ? { ...pricing }
    : null;
}

export function parseMetaPricing(
  meta: string | undefined,
): SubmissionPricingSnapshot | null {
  if (!meta) return null;
  try {
    const pricing = readPricingBag(meta);
    if (
      pricing &&
      typeof pricing.oneTime === "number" &&
      Array.isArray(pricing.recurring)
    ) {
      const currency = pricing.currency;
      return {
        oneTime: pricing.oneTime,
        recurring: parseRecurringSnapshots(pricing.recurring),
        lineItems: parsePricingLineItems(pricing.lineItems),
        currency:
          typeof currency === "string" && currency.trim()
            ? currency.trim().toUpperCase()
            : "USD",
      };
    }
    return null;
  } catch {
    return null;
  }
}
