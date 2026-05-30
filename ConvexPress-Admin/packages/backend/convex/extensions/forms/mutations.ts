/**
 * ConvexPress Forms — mutations (v2 Layer 3, write layer)
 * API path: api.extensions.forms.mutations.*
 *
 * Helper imports use "../../helpers/..." (extensions live two levels below
 * convex/). Form fields reuse the customFields engine: a form owns a backing
 * `fieldGroup` (forms.fieldGroupId) whose `fieldDefinitions` are the form's
 * fields, and submission answers are `fieldValues` with
 * entityType="form_submission", entityId=<submissionId>.
 *
 * Authorization contract:
 *   - Every ADMIN mutation starts with requireCan("form.<cap>").
 *   - `submit` is the PUBLIC unauthenticated endpoint — NO requireCan. It has
 *     a clear spam-guard TODO seam (see verifySubmissionSecurity) but does NOT
 *     implement captcha here.
 *
 * NOTE ON CAPABILITY TYPING: the `form.*` capabilities are SURFACED by this
 * extension but REGISTERED by the Role/Capability expert (they are not yet in
 * the closed `Capability` union in types/capabilities.ts). We therefore cast
 * the capability strings to `Capability` at the requireCan call sites. Once the
 * Role expert adds a FormCapability member to the union, the casts become
 * no-ops and can be dropped.
 */

import { mutation } from "../../_generated/server";
import { v } from "convex/values";
import { ConvexError } from "convex/values";
import { internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import { requireCan, getUserIdentifier } from "../../helpers/permissions";
import { emitEvent } from "../../helpers/events";
import { validateFieldValue } from "../../helpers/customFieldValidation";
import { LAYOUT_FIELD_TYPES } from "../../customFields/validators";
import { FORM_EVENTS, SYSTEM } from "../../events/constants";
import type { Capability } from "../../types/capabilities";
// Server-trusted Form Logic & Validation contract (field + section + page
// scope, cross-field operands, conditional-required, structural zod gate). The
// field-scope primitive `evaluateConditionalLogic` still lives in
// ./conditionalLogic and is composed internally by recomputeVisibility.
import {
  recomputeVisibility,
  validateSubmission,
  compileZodFromVisibleFields,
  type LogicFieldDef,
} from "./formLogic";
// Form Calculation & Pricing System (server-authoritative). The submit path
// recomputes every computed field in INTEGER CENTS before persisting answers, so
// a tampered client `lineTotal`/`subtotal` is discarded. Save-time graph
// validation rejects a cyclic or dangling-ref form before it can publish.
import {
  buildDependencyGraph,
  collectUnknownRefs,
  collectFormulaErrors,
  formatCycle,
  recomputeAuthoritative,
  type CalcFieldDef,
  type RepeaterRow,
  type AuthoritativeValue,
} from "./calc";

// ─── Local validators / helpers ─────────────────────────────────────────────

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

/**
 * Cast a `form.*` capability string to `Capability`. See file header — these
 * are surfaced here but registered by the Role expert, so they aren't in the
 * union yet. Centralizing the cast keeps the intent explicit and greppable.
 */
function formCap(cap: string): Capability {
  return cap as Capability;
}

/**
 * Seed the default notification rows for a newly created form (PRD §6 + §10).
 * Inserts directly into `form_notifications` (the Notification System owns its
 * own CRUD file; this seed is the one cross-touch in `create`). The site rows
 * ship `enabled: true` because the Notification System's `site` channel uses a
 * direct-insert path (no dependency on the closed notification-key registry).
 */
async function seedDefaultNotifications(
  ctx: { db: { insert: any } },
  formId: Id<"forms">,
): Promise<void> {
  const rows: Array<{
    name: string;
    channel: "email" | "site";
    recipientType: "admin" | "customer";
    toExpression?: string;
    subjectTemplate?: string;
    messageTemplate?: string;
    triggerEventCode: string;
    enabled: boolean;
    order: number;
  }> = [
    {
      name: "New Form Submission (Admin)",
      channel: "email",
      recipientType: "admin",
      toExpression: "{settings:admin_notification_email}",
      subjectTemplate: "New {form:title} submission",
      messageTemplate: "<p>A new submission was received.</p>{all_fields}",
      triggerEventCode: "form.submitted",
      enabled: true,
      order: 0,
    },
    {
      name: "Form Confirmation (Respondent)",
      channel: "email",
      recipientType: "customer",
      toExpression: "{field:email}",
      subjectTemplate: "We received your submission",
      messageTemplate:
        "<p>Thank you — we received your submission to {form:title}.</p>",
      triggerEventCode: "form.submitted",
      enabled: true,
      order: 1,
    },
    {
      name: "Resume Your Form",
      channel: "email",
      recipientType: "customer",
      toExpression: "{field:email}",
      subjectTemplate: "Resume your {form:title} form",
      messageTemplate:
        "<p>You can resume your form here: {form:resume_url}</p>",
      triggerEventCode: "form.progress_saved",
      enabled: true,
      order: 2,
    },
    {
      name: "Form Action Failed (Admin)",
      channel: "email",
      recipientType: "admin",
      toExpression: "{settings:admin_notification_email}",
      subjectTemplate: "A {form:title} action failed",
      messageTemplate:
        "<p>A post-submit action failed for {form:title}.</p><p>{action:error}</p>",
      triggerEventCode: "form.action_failed",
      enabled: true,
      order: 3,
    },
    {
      name: "New Form Submission",
      channel: "site",
      recipientType: "admin",
      messageTemplate: "A new {form:title} submission was received.",
      triggerEventCode: "form.submitted",
      enabled: true,
      order: 4,
    },
    {
      name: "Form Action Failed",
      channel: "site",
      recipientType: "admin",
      messageTemplate: "A {form:title} action failed.",
      triggerEventCode: "form.action_failed",
      enabled: true,
      order: 5,
    },
  ];

  for (const row of rows) {
    await ctx.db.insert("form_notifications", {
      formId,
      name: row.name,
      channel: row.channel,
      recipientType: row.recipientType,
      toExpression: row.toExpression,
      subjectTemplate: row.subjectTemplate,
      messageTemplate: row.messageTemplate,
      triggerEventCode: row.triggerEventCode,
      conditionalLogic: undefined,
      enabled: row.enabled,
      order: row.order,
    });
  }
}

/** Lowercase/slugify a string into a URL-safe form slug. */
function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96);
}

/** Validate that a settings blob is valid JSON; default to "{}". */
function ensureJsonSettings(settings: string | undefined): string {
  if (!settings) return "{}";
  try {
    JSON.parse(settings);
    return settings;
  } catch {
    throw new ConvexError({
      code: "VALIDATION_ERROR",
      message: "Form settings must be valid JSON.",
    });
  }
}

/** Throw if a slug is already taken by another form. */
async function assertSlugAvailable(
  ctx: { db: { query: any } },
  slug: string,
  exceptId?: Id<"forms">,
): Promise<void> {
  const existing = await ctx.db
    .query("forms")
    .withIndex("by_slug", (q: any) => q.eq("slug", slug))
    .first();
  if (existing && existing._id !== exceptId) {
    throw new ConvexError({
      code: "CONFLICT",
      message: `A form with slug "${slug}" already exists.`,
    });
  }
}

/** Find an available "-copy" slug, deduping with a numeric suffix. */
async function deriveCopySlug(
  ctx: { db: { query: any } },
  baseSlug: string,
): Promise<string> {
  let candidate = `${baseSlug}-copy`;
  let n = 1;
  // Bounded loop — practically always resolves on the first or second try.
  while (n < 100) {
    const taken = await ctx.db
      .query("forms")
      .withIndex("by_slug", (q: any) => q.eq("slug", candidate))
      .first();
    if (!taken) return candidate;
    n += 1;
    candidate = `${baseSlug}-copy-${n}`;
  }
  // Fallback: timestamp suffix guarantees uniqueness.
  return `${baseSlug}-copy-${Date.now()}`;
}

/**
 * Save-time validation of a form's calculation graph (Form Calculation & Pricing
 * System, PRD §8). Loads the form's field definitions and rejects the operation
 * when any computed field's formula:
 *   - references a field key that does not exist (dangling ref), OR
 *   - participates in a circular dependency (`grand_total ↔ subtotal`, self-ref),
 *   - or fails to parse.
 * A cyclic/invalid form can never publish. Acyclic forms (and forms with no
 * computed fields) pass silently. The runtime renderer still degrades safely.
 */
async function assertCalcGraphValid(
  ctx: { db: { query: any } },
  fieldGroupId: Id<"fieldGroups"> | undefined,
): Promise<void> {
  if (!fieldGroupId) return;
  const fieldDefs = await ctx.db
    .query("fieldDefinitions")
    .withIndex("by_group", (q: any) => q.eq("groupId", fieldGroupId))
    .collect();

  // The generated Docs structurally satisfy CalcFieldDef (key/type/settings).
  const calcDefs = fieldDefs as unknown as CalcFieldDef[];

  const formulaErrors = collectFormulaErrors(calcDefs);
  if (formulaErrors.length > 0) {
    const first = formulaErrors[0]!;
    throw new ConvexError({
      code: "VALIDATION_ERROR",
      message: `Field "${first.fieldKey}" has an invalid formula: ${first.message}`,
    });
  }

  const unknownRefs = collectUnknownRefs(calcDefs);
  if (unknownRefs.length > 0) {
    const first = unknownRefs[0]!;
    throw new ConvexError({
      code: "VALIDATION_ERROR",
      message: `Field "${first.fieldKey}" references an unknown field "{${first.missingRef}}".`,
    });
  }

  const { cycles } = buildDependencyGraph(calcDefs);
  if (cycles.length > 0) {
    throw new ConvexError({
      code: "VALIDATION_ERROR",
      message: `Calculation fields form a circular reference: ${formatCycle(cycles[0]!)}.`,
    });
  }
}

/**
 * Serialize a server-recomputed computed value to the string `fieldValues.value`
 * column expects. A `calculation` value is a number → its string form; a
 * `product` value is a line object → JSON. (Integer cents, set by the calc core.)
 */
function serializeComputedValue(value: AuthoritativeValue): string {
  if (typeof value === "number") return String(value);
  return JSON.stringify(value);
}

/**
 * Merge a freshly-recomputed pricing summary into an existing `meta` JSON bag
 * WITHOUT clobbering sibling-system keys (e.g. an analytics abandon marker).
 * Tolerates absent/malformed prior meta.
 */
function mergeMetaPricing(
  existingMeta: string | undefined,
  pricing: unknown,
): string {
  let base: Record<string, unknown> = {};
  if (existingMeta) {
    try {
      const parsed = JSON.parse(existingMeta);
      if (parsed && typeof parsed === "object") {
        base = parsed as Record<string, unknown>;
      }
    } catch {
      // Malformed prior meta — start clean (we still keep the new pricing).
    }
  }
  base.pricing = pricing;
  return JSON.stringify(base);
}

// ─── create ──────────────────────────────────────────────────────────────────

/**
 * Create a draft form with an empty backing field group.
 * Requires `form.create`.
 */
export const create = mutation({
  args: {
    title: v.string(),
    slug: v.optional(v.string()),
    description: v.optional(v.string()),
    settings: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireCan(ctx, formCap("form.create"));

    const title = args.title.trim();
    if (!title) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: "Form title cannot be empty.",
      });
    }

    const slug = slugify(args.slug ?? title);
    if (!slug) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: "Form slug must contain at least one alphanumeric character.",
      });
    }
    await assertSlugAvailable(ctx, slug);

    const settings = ensureJsonSettings(args.settings);
    const now = Date.now();

    // Backing field group for this form's fields (reuses customFields engine).
    // location rules are not meaningful for forms (forms render via /forms/$slug,
    // not via post-type metaboxes), but the table requires a non-empty set;
    // use an inert single rule. isActive stays true so definitions resolve.
    const fieldGroupId = await ctx.db.insert("fieldGroups", {
      title: `${title} — Fields`,
      key: `form_${slug}_${now.toString(36)}`,
      description: `Backing field group for form "${title}".`,
      locationRules: [
        [{ param: "form", operator: "==" as const, value: slug }],
      ],
      position: "normal" as const,
      style: "default" as const,
      labelPlacement: "top" as const,
      instructionPlacement: "label" as const,
      isActive: true,
      menuOrder: 0,
      createdBy: getUserIdentifier(user),
      createdAt: now,
      updatedAt: now,
    });

    const formId = await ctx.db.insert("forms", {
      title,
      slug,
      description: args.description,
      status: "draft" as const,
      fieldGroupId,
      settings,
      createdBy: user._id,
      createdAt: now,
      updatedAt: now,
    });

    // Seed the default notification rows (Form Notification System).
    await seedDefaultNotifications(ctx, formId);

    await emitEvent(ctx, FORM_EVENTS.CREATED, SYSTEM.FORMS, {
      formId,
      title,
      createdBy: getUserIdentifier(user),
    });

    return await ctx.db.get(formId);
  },
});

// ─── update ──────────────────────────────────────────────────────────────────

/**
 * Partial update of a form's title/description/slug/settings/status.
 * Requires `form.update`. Setting status to "published" stamps publishedAt.
 */
export const update = mutation({
  args: {
    id: v.id("forms"),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    slug: v.optional(v.string()),
    settings: v.optional(v.string()),
    status: v.optional(formStatus),
  },
  handler: async (ctx, args) => {
    const user = await requireCan(ctx, formCap("form.update"));

    const form = await ctx.db.get(args.id);
    if (!form) throw new ConvexError({ code: "NOT_FOUND", message: "Form not found." });

    const patch: Record<string, unknown> = {};
    const changedFields: string[] = [];

    if (args.title !== undefined) {
      const title = args.title.trim();
      if (!title) {
        throw new ConvexError({
          code: "VALIDATION_ERROR",
          message: "Form title cannot be empty.",
        });
      }
      if (title !== form.title) {
        patch.title = title;
        changedFields.push("title");
      }
    }

    if (args.description !== undefined && args.description !== form.description) {
      patch.description = args.description;
      changedFields.push("description");
    }

    if (args.slug !== undefined) {
      const slug = slugify(args.slug);
      if (!slug) {
        throw new ConvexError({
          code: "VALIDATION_ERROR",
          message: "Form slug must contain at least one alphanumeric character.",
        });
      }
      if (slug !== form.slug) {
        await assertSlugAvailable(ctx, slug, args.id);
        patch.slug = slug;
        changedFields.push("slug");
      }
    }

    if (args.settings !== undefined) {
      const settings = ensureJsonSettings(args.settings);
      if (settings !== form.settings) {
        patch.settings = settings;
        changedFields.push("settings");
      }
    }

    if (args.status !== undefined && args.status !== form.status) {
      // Publishing via update must clear the same calc-graph gate as publish().
      if (args.status === "published") {
        await assertCalcGraphValid(ctx, form.fieldGroupId);
      }
      patch.status = args.status;
      changedFields.push("status");
      // Stamp publishedAt the first time the form goes live.
      if (args.status === "published" && !form.publishedAt) {
        patch.publishedAt = Date.now();
      }
    }

    if (changedFields.length === 0) {
      return form;
    }

    patch.updatedBy = user._id;
    patch.updatedAt = Date.now();
    await ctx.db.patch(args.id, patch);

    await emitEvent(ctx, FORM_EVENTS.UPDATED, SYSTEM.FORMS, {
      formId: args.id,
      changedFields,
      updatedBy: getUserIdentifier(user),
    });

    return await ctx.db.get(args.id);
  },
});

// ─── publish / unpublish ─────────────────────────────────────────────────────

/**
 * Publish a form (status -> "published", stamps publishedAt once).
 * Requires `form.update`.
 */
export const publish = mutation({
  args: { id: v.id("forms") },
  handler: async (ctx, { id }) => {
    const user = await requireCan(ctx, formCap("form.update"));

    const form = await ctx.db.get(id);
    if (!form) throw new ConvexError({ code: "NOT_FOUND", message: "Form not found." });
    if (form.status === "published") return form;

    // A form with a cyclic / dangling / invalid calculation graph can never go
    // live (Form Calculation & Pricing PRD §8).
    await assertCalcGraphValid(ctx, form.fieldGroupId);

    const now = Date.now();
    await ctx.db.patch(id, {
      status: "published" as const,
      publishedAt: form.publishedAt ?? now,
      updatedBy: user._id,
      updatedAt: now,
    });

    await emitEvent(ctx, FORM_EVENTS.UPDATED, SYSTEM.FORMS, {
      formId: id,
      changedFields: ["status"],
      status: "published",
      updatedBy: getUserIdentifier(user),
    });

    return await ctx.db.get(id);
  },
});

/**
 * Unpublish a form back to draft (status -> "draft").
 * Requires `form.update`.
 */
export const unpublish = mutation({
  args: { id: v.id("forms") },
  handler: async (ctx, { id }) => {
    const user = await requireCan(ctx, formCap("form.update"));

    const form = await ctx.db.get(id);
    if (!form) throw new ConvexError({ code: "NOT_FOUND", message: "Form not found." });
    if (form.status === "draft") return form;

    await ctx.db.patch(id, {
      status: "draft" as const,
      updatedBy: user._id,
      updatedAt: Date.now(),
    });

    await emitEvent(ctx, FORM_EVENTS.UPDATED, SYSTEM.FORMS, {
      formId: id,
      changedFields: ["status"],
      status: "draft",
      updatedBy: getUserIdentifier(user),
    });

    return await ctx.db.get(id);
  },
});

// ─── remove (soft delete) ────────────────────────────────────────────────────

/**
 * Soft-delete a form via status "archived" (preserves the row + submissions).
 * Requires `form.delete`.
 */
export const remove = mutation({
  args: { id: v.id("forms") },
  handler: async (ctx, { id }) => {
    const user = await requireCan(ctx, formCap("form.delete"));

    const form = await ctx.db.get(id);
    if (!form) throw new ConvexError({ code: "NOT_FOUND", message: "Form not found." });

    await ctx.db.patch(id, {
      status: "archived" as const,
      updatedBy: user._id,
      updatedAt: Date.now(),
    });

    await emitEvent(ctx, FORM_EVENTS.DELETED, SYSTEM.FORMS, {
      formId: id,
      deletedBy: getUserIdentifier(user),
    });

    return { success: true };
  },
});

// ─── duplicate ───────────────────────────────────────────────────────────────

/**
 * Duplicate a form: clones the backing field group + its field definitions and
 * inserts a new draft form with a deduped "-copy" slug.
 * Requires `form.duplicate`.
 */
export const duplicate = mutation({
  args: { id: v.id("forms") },
  handler: async (ctx, { id }) => {
    const user = await requireCan(ctx, formCap("form.duplicate"));

    const source = await ctx.db.get(id);
    if (!source) throw new ConvexError({ code: "NOT_FOUND", message: "Form not found." });

    const now = Date.now();
    const newTitle = `${source.title} (Copy)`;
    const newSlug = await deriveCopySlug(ctx, source.slug);

    // Clone the backing field group (if any) + its field definitions.
    let newGroupId: Id<"fieldGroups"> | undefined;
    const sourceGroupId = source.fieldGroupId;
    if (sourceGroupId) {
      const sourceGroup = await ctx.db.get(sourceGroupId);
      if (sourceGroup) {
        newGroupId = await ctx.db.insert("fieldGroups", {
          title: `${newTitle} — Fields`,
          key: `form_${newSlug}_${now.toString(36)}`,
          description: sourceGroup.description,
          locationRules: sourceGroup.locationRules,
          position: sourceGroup.position,
          style: sourceGroup.style,
          labelPlacement: sourceGroup.labelPlacement,
          instructionPlacement: sourceGroup.instructionPlacement,
          isActive: sourceGroup.isActive,
          menuOrder: sourceGroup.menuOrder,
          createdBy: getUserIdentifier(user),
          createdAt: now,
          updatedAt: now,
        });

        const fields = await ctx.db
          .query("fieldDefinitions")
          .withIndex("by_group", (q: any) => q.eq("groupId", sourceGroupId))
          .collect();

        // Two-pass copy so parentFieldId references resolve to the new IDs.
        const idMap = new Map<string, Id<"fieldDefinitions">>();
        const topLevel = fields.filter((f: any) => !f.parentFieldId);
        const subLevel = fields.filter((f: any) => f.parentFieldId);

        for (const field of topLevel) {
          const newFieldId = await ctx.db.insert("fieldDefinitions", {
            groupId: newGroupId,
            label: field.label,
            name: field.name,
            key: `field_${field.name}_${Math.random().toString(36).slice(2, 8)}`,
            type: field.type,
            instructions: field.instructions,
            required: field.required,
            defaultValue: field.defaultValue,
            settings: field.settings,
            conditionalLogic: field.conditionalLogic,
            wrapperWidth: field.wrapperWidth,
            wrapperClass: field.wrapperClass,
            wrapperId: field.wrapperId,
            menuOrder: field.menuOrder,
            createdAt: now,
            updatedAt: now,
          });
          idMap.set(field._id, newFieldId);
        }

        for (const field of subLevel) {
          const newParentId = field.parentFieldId
            ? idMap.get(field.parentFieldId)
            : undefined;
          const newFieldId = await ctx.db.insert("fieldDefinitions", {
            groupId: newGroupId,
            label: field.label,
            name: field.name,
            key: `field_${field.name}_${Math.random().toString(36).slice(2, 8)}`,
            type: field.type,
            instructions: field.instructions,
            required: field.required,
            defaultValue: field.defaultValue,
            settings: field.settings,
            conditionalLogic: field.conditionalLogic,
            wrapperWidth: field.wrapperWidth,
            wrapperClass: field.wrapperClass,
            wrapperId: field.wrapperId,
            menuOrder: field.menuOrder,
            parentFieldId: newParentId,
            createdAt: now,
            updatedAt: now,
          });
          idMap.set(field._id, newFieldId);
        }
      }
    }

    const newFormId = await ctx.db.insert("forms", {
      title: newTitle,
      slug: newSlug,
      description: source.description,
      status: "draft" as const,
      fieldGroupId: newGroupId,
      settings: source.settings,
      createdBy: user._id,
      createdAt: now,
      updatedAt: now,
    });

    await emitEvent(ctx, FORM_EVENTS.CREATED, SYSTEM.FORMS, {
      formId: newFormId,
      title: newTitle,
      createdBy: getUserIdentifier(user),
      duplicatedFrom: id,
    });

    return await ctx.db.get(newFormId);
  },
});

// ─── submit (PUBLIC — unauthenticated) ───────────────────────────────────────

/**
 * PUBLIC form submission endpoint. NO requireCan — this is the unauthenticated
 * path used by the public site. Validation is server-trusted: conditional
 * visibility is recomputed here, a hidden field is treated as not-required and
 * its value ignored, and every visible field is run through validateFieldValue.
 *
 * Spam protection is intentionally a SEAM, not implemented here (see the
 * TODO below). captchaToken/honeypot are accepted so the public client contract
 * is stable, but they are not yet verified.
 */
export const submit = mutation({
  args: {
    formId: v.id("forms"),
    values: v.array(
      v.object({
        fieldKey: v.string(),
        value: v.string(),
      }),
    ),
    isComplete: v.optional(v.boolean()),
    resumeToken: v.optional(v.string()),
    captchaToken: v.optional(v.string()),
    honeypot: v.optional(v.string()),
    // Time-trap stamp (ms epoch) set by the Forms Renderer when the form first
    // mounts; the spam guard rejects sub-`minFillMs` and stale submissions.
    startedAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    // (a) Load form; only published forms accept submissions.
    const form = await ctx.db.get(args.formId);
    if (!form || form.status !== "published") {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Form is not available for submission.",
      });
    }

    // (b) Spam guard — runs FIRST, before any validation or write. The guard
    // (honeypot/time-trap → per-ip+form rate limit → CAPTCHA, fail-closed when
    // CAPTCHA is enabled) emits `form.spam_blocked` on a block; we reject with a
    // low-detail error so a bot can't probe which stage caught it (PRD §13.5).
    // `ip` is undefined here (a Convex mutation ctx has no request IP); an
    // HTTP-action front door can forward it later via the guard's `ip` seam.
    // HANDOFF: persisting guard.score as spamScore/status:"spam" is the Form
    // Submission System's job — the guard rejects before any row is written.
    const guard = await ctx.runMutation(
      internal.extensions.forms.spam.guardSubmission,
      {
        formId: args.formId,
        honeypot: args.honeypot,
        captchaToken: args.captchaToken,
        startedAt: args.startedAt,
        ip: undefined,
      },
    );
    if (guard.block) {
      throw new ConvexError({ code: "REJECTED", message: "Submission rejected" });
    }

    const isComplete = args.isComplete ?? false;

    // (c) Load the form's field definitions via the backing group.
    const formGroupId = form.fieldGroupId;
    const fieldDefs = formGroupId
      ? await ctx.db
          .query("fieldDefinitions")
          .withIndex("by_group", (q: any) => q.eq("groupId", formGroupId))
          .collect()
      : [];

    // Build the fieldKey -> value map for server-side visibility evaluation
    // AND per-field lookup. Conditional rules reference a sibling field's
    // `key`, and submitted values are keyed by fieldKey, so this is the right
    // input for both the evaluator and the validation loop below.
    const valueMap: Record<string, string> = {};
    for (const entry of args.values) {
      valueMap[entry.fieldKey] = entry.value;
    }

    // (d) Recompute visibility server-side via the Form Logic & Validation
    // contract: field + section (`group`) + page scope, cross-field operands,
    // and conditional-required. Hidden (field/section/page) fields are treated
    // as not-required and their submitted values dropped — the client is never
    // trusted to tell us which fields were visible. `fieldDefs` (Convex Docs)
    // satisfy the structural LogicFieldDef shape the engine reads.
    type FieldDef = (typeof fieldDefs)[number];
    const logicDefs = fieldDefs as unknown as LogicFieldDef[];
    const visibility = recomputeVisibility(logicDefs, valueMap);
    const visibleDefs: FieldDef[] = fieldDefs.filter((def: FieldDef) =>
      visibility.visibleFieldKeys.has(def.key),
    );

    // (e) Validate visible fields (imperative per-type checks + conditional-
    // required) AND a structural zod gate; BOTH must pass. The engine returns
    // fieldKey -> message; we re-attach `label` from the def to preserve the
    // existing wire contract `errors: [{ fieldKey, label, error }]`.
    const labelByKey = new Map(fieldDefs.map((d: FieldDef) => [d.key, d.label]));
    const validation = validateSubmission(
      logicDefs,
      valueMap,
      visibility,
      validateFieldValue,
    );

    const zodErrors: Record<string, string> = {};
    const zodSchema = compileZodFromVisibleFields(logicDefs, visibility, valueMap);
    const zodResult = zodSchema.safeParse(valueMap);
    if (!zodResult.success) {
      for (const issue of zodResult.error.issues) {
        const key = String(issue.path[0] ?? "");
        if (key && !(key in validation.errors) && !(key in zodErrors)) {
          zodErrors[key] = issue.message || "Invalid value.";
        }
      }
    }

    const mergedErrors = { ...zodErrors, ...validation.errors };
    if (Object.keys(mergedErrors).length > 0) {
      const errors = Object.entries(mergedErrors).map(([fieldKey, error]) => ({
        fieldKey,
        label: labelByKey.get(fieldKey) ?? fieldKey,
        error,
      }));
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: "One or more fields are invalid.",
        errors,
      });
    }

    // (e2) Authoritative calculation recompute (Form Calculation & Pricing PRD
    // §8). Runs AFTER validation, BEFORE persistence. We re-derive every computed
    // field server-side over the trusted value map (in integer cents) and IGNORE
    // any computed value the client sent — a tampered `subtotal`/`lineTotal` is
    // discarded here. The pricing summary is stored once on the submission so the
    // Commerce Action + Confirmation read a single trusted object.
    const calcDefs = visibleDefs as unknown as CalcFieldDef[];
    // Restrict the value map to VISIBLE fields so a hidden operand resolves to
    // `treatBlankAs` (PRD §8 "hidden operands are absent"). Hidden submitted
    // values never feed a formula.
    const visibleValueMap: Record<string, string> = {};
    for (const def of visibleDefs) {
      if (def.key in valueMap) visibleValueMap[def.key] = valueMap[def.key]!;
    }
    // Build a `{row.*}` repeaters map: a repeater field stores a JSON array of
    // row value maps under its own key. Malformed/absent → empty (never throw).
    const repeaters: Record<string, RepeaterRow[]> = {};
    for (const def of visibleDefs) {
      if (def.type !== "repeater") continue;
      const raw = visibleValueMap[def.key];
      if (typeof raw !== "string" || raw.trim() === "") continue;
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          repeaters[def.key] = parsed.filter(
            (r): r is RepeaterRow => typeof r === "object" && r !== null,
          );
        }
      } catch {
        // Leave this repeater out of aggregation.
      }
    }

    const calcResult = recomputeAuthoritative(calcDefs, visibleValueMap, repeaters);
    // Serialize each server-computed value back to a string for fieldValues. A
    // calculation → its number; a product → its JSON line object.
    const computedSerialized = new Map<string, string>();
    for (const [key, value] of Object.entries(calcResult.computed)) {
      computedSerialized.set(key, serializeComputedValue(value));
    }

    // The effective answer set persisted in step (g): the client values with
    // every computed field's value OVERWRITTEN by the server figure, plus any
    // computed field the client never sent (so a server-derived total is stored
    // even when the client omitted it).
    const seenKeys = new Set(args.values.map((entry) => entry.fieldKey));
    const effectiveValues: Array<{ fieldKey: string; value: string }> = args.values.map(
      (entry) => {
        const serverValue = computedSerialized.get(entry.fieldKey);
        return serverValue !== undefined
          ? { fieldKey: entry.fieldKey, value: serverValue }
          : entry;
      },
    );
    for (const [key, value] of computedSerialized) {
      if (!seenKeys.has(key)) effectiveValues.push({ fieldKey: key, value });
    }

    // The trusted pricing summary persisted on `form_submissions.meta` (existing
    // JSON bag — no new table). Commerce/confirmation read `meta.pricing`.
    const metaJson = JSON.stringify({ pricing: calcResult.pricing });

    // (f) Upsert the submission row. We key resumable drafts by resumeToken so
    // a save-and-continue flow updates the same row rather than duplicating it.
    const now = Date.now();
    let submissionId: Id<"form_submissions">;
    let existing = null;
    if (args.resumeToken) {
      existing = await ctx.db
        .query("form_submissions")
        .withIndex("by_resumeToken", (q: any) =>
          q.eq("resumeToken", args.resumeToken),
        )
        .first();
    }

    if (existing && existing.formId === args.formId && existing.status !== "deleted") {
      submissionId = existing._id;
      // Merge the recomputed pricing into any existing meta bag so we don't
      // clobber sibling-system markers (e.g. an analytics abandon flag).
      const mergedMeta = mergeMetaPricing(existing.meta, calcResult.pricing);
      await ctx.db.patch(submissionId, {
        status: isComplete ? ("complete" as const) : ("partial" as const),
        submittedAt: existing.submittedAt ?? now,
        completedAt: isComplete ? now : existing.completedAt,
        resumeToken: args.resumeToken,
        meta: mergedMeta,
        updatedAt: now,
      });
    } else {
      // Server-derived request metadata (ip/userAgent/referrer) is not available
      // from a Convex mutation ctx, so it is left undefined here; an HTTP-action
      // front door can populate it later. read/starred default to false.
      submissionId = await ctx.db.insert("form_submissions", {
        formId: args.formId,
        status: isComplete ? ("complete" as const) : ("partial" as const),
        submittedAt: now,
        completedAt: isComplete ? now : undefined,
        ip: undefined,
        userAgent: undefined,
        referrer: undefined,
        userId: undefined,
        resumeToken: args.resumeToken,
        currentStep: undefined,
        read: false,
        starred: false,
        meta: metaJson,
        createdAt: now,
        updatedAt: now,
      });
    }

    // Resolve the acting identity for fieldValues.updatedBy. Anonymous public
    // submissions use the "guest" sentinel; a logged-in submitter uses their id.
    let actorIdentifier = "guest";
    try {
      const identity = await ctx.auth.getUserIdentity();
      if (identity) actorIdentifier = identity.subject;
    } catch {
      // No auth context (anonymous public submit) — keep the "guest" sentinel.
    }

    // (g) Persist each submitted value as a fieldValue scoped to this
    // submission. Only values for KNOWN, VISIBLE fields are written (hidden
    // fields are dropped, matching the visibility recompute). Upsert so a
    // resumed draft overwrites prior answers instead of duplicating them.
    // We iterate `effectiveValues` (not the raw client payload) so every
    // computed field's stored value is the SERVER recompute (cents), and any
    // computed field the client omitted is still written (PRD §8).
    const entityId = submissionId as string;
    // Re-source the visible set from the server visibility recompute so section/
    // page-hidden values are dropped too (PRD §9 "hidden ⇒ omitted").
    const visibleByKey = new Map(visibleDefs.map((d: FieldDef) => [d.key, d]));
    for (const entry of effectiveValues) {
      const def = visibleByKey.get(entry.fieldKey);
      if (!def) continue; // unknown field or hidden field — ignore
      if (LAYOUT_FIELD_TYPES.has(def.type)) {
        continue; // layout + security (captcha/honeypot) fields store no value
      }
      const existingValue = await ctx.db
        .query("fieldValues")
        .withIndex("by_entity_field", (q: any) =>
          q
            .eq("entityType", "form_submission")
            .eq("entityId", entityId)
            .eq("fieldKey", entry.fieldKey),
        )
        .unique();
      if (existingValue) {
        await ctx.db.patch(existingValue._id, {
          value: entry.value,
          fieldName: def.name,
          updatedBy: actorIdentifier,
          updatedAt: now,
        });
      } else {
        await ctx.db.insert("fieldValues", {
          entityType: "form_submission",
          entityId,
          fieldKey: entry.fieldKey,
          fieldName: def.name,
          value: entry.value,
          updatedBy: actorIdentifier,
          updatedAt: now,
        });
      }
    }

    // (h) Emit events. Keep the payload small — counts/ids only, never the
    // full answer set (the dispatcher enforces a 100KB payload cap).
    await emitEvent(ctx, FORM_EVENTS.SUBMITTED, SYSTEM.FORMS, {
      formId: args.formId,
      submissionId,
      isComplete,
      submittedAt: now,
      valueCount: args.values.length,
      values: "<omitted-for-size>",
    });

    if (!isComplete) {
      await emitEvent(ctx, FORM_EVENTS.PROGRESS_SAVED, SYSTEM.FORMS, {
        formId: args.formId,
        submissionId,
        resumeToken: args.resumeToken,
        step: existing?.currentStep,
      });
    }

    return { submissionId, isComplete };
  },
});

// ─── updateEntry ─────────────────────────────────────────────────────────────

/**
 * Patch a submission's admin-ops flags (read/starred) and/or status.
 * Requires `form.edit_entry`.
 */
export const updateEntry = mutation({
  args: {
    id: v.id("form_submissions"),
    read: v.optional(v.boolean()),
    starred: v.optional(v.boolean()),
    status: v.optional(submissionStatus),
  },
  handler: async (ctx, args) => {
    await requireCan(ctx, formCap("form.edit_entry"));

    const submission = await ctx.db.get(args.id);
    if (!submission) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Submission not found." });
    }

    const patch: Record<string, unknown> = {};
    const changedFields: string[] = [];
    if (args.read !== undefined && args.read !== submission.read) {
      patch.read = args.read;
      changedFields.push("read");
    }
    if (args.starred !== undefined && args.starred !== submission.starred) {
      patch.starred = args.starred;
      changedFields.push("starred");
    }
    if (args.status !== undefined && args.status !== submission.status) {
      patch.status = args.status;
      changedFields.push("status");
    }

    if (changedFields.length === 0) {
      return submission;
    }

    patch.updatedAt = Date.now();
    await ctx.db.patch(args.id, patch);

    await emitEvent(ctx, FORM_EVENTS.ENTRY_UPDATED, SYSTEM.FORMS, {
      formId: submission.formId,
      submissionId: args.id,
      changedFields,
    });

    return await ctx.db.get(args.id);
  },
});

// ─── deleteEntry (soft delete) ───────────────────────────────────────────────

/**
 * Soft-delete a submission via status "deleted".
 * Requires `form.delete_entry`.
 */
export const deleteEntry = mutation({
  args: { id: v.id("form_submissions") },
  handler: async (ctx, { id }) => {
    await requireCan(ctx, formCap("form.delete_entry"));

    const submission = await ctx.db.get(id);
    if (!submission) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Submission not found." });
    }

    await ctx.db.patch(id, {
      status: "deleted" as const,
      updatedAt: Date.now(),
    });

    await emitEvent(ctx, FORM_EVENTS.ENTRY_DELETED, SYSTEM.FORMS, {
      formId: submission.formId,
      submissionId: id,
    });

    return { success: true };
  },
});

// ─── addNote ─────────────────────────────────────────────────────────────────

/**
 * Add an internal note to a submission (Entry Management System).
 * Requires `form.edit_entry`.
 */
export const addNote = mutation({
  args: {
    submissionId: v.id("form_submissions"),
    body: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requireCan(ctx, formCap("form.edit_entry"));

    const body = args.body.trim();
    if (!body) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: "Note body cannot be empty.",
      });
    }

    const submission = await ctx.db.get(args.submissionId);
    if (!submission) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Submission not found." });
    }

    const noteId = await ctx.db.insert("form_submission_notes", {
      submissionId: args.submissionId,
      body,
      authorId: user._id,
      createdAt: Date.now(),
    });

    return await ctx.db.get(noteId);
  },
});
