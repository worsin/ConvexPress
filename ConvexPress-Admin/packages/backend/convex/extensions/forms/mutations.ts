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
import type { Id } from "../../_generated/dataModel";
import { requireCan, getUserIdentifier } from "../../helpers/permissions";
import { emitEvent } from "../../helpers/events";
import { validateFieldValue } from "../../helpers/customFieldValidation";
import { FORM_EVENTS, SYSTEM } from "../../events/constants";
import type { Capability } from "../../types/capabilities";
import { evaluateConditionalLogic } from "./conditionalLogic";

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

    // (b) Spam-guard seam. DO NOT implement captcha here — leave a clear hook.
    // TODO(form-spam-security): verifySubmissionSecurity(ctx, {
    //   formId: args.formId, captchaToken: args.captchaToken,
    //   honeypot: args.honeypot, ip, userAgent, resumeToken: args.resumeToken,
    // }) before accepting — reject/flag-as-spam on failure.

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

    // (d) Recompute conditional visibility server-side. Hidden fields are
    // treated as not-required and their submitted values are ignored.
    type FieldDef = (typeof fieldDefs)[number];
    const visibleDefs: FieldDef[] = fieldDefs.filter((def: FieldDef) =>
      evaluateConditionalLogic(def.conditionalLogic, valueMap),
    );

    // (e) Validate each VISIBLE field with the server-trusted validator.
    const errors: Array<{ fieldKey: string; label: string; error: string }> = [];
    for (const def of visibleDefs) {
      // Layout fields (message/accordion/tab) carry no value — skip them.
      if (def.type === "message" || def.type === "accordion" || def.type === "tab") {
        continue;
      }
      const submitted = valueMap[def.key] ?? "";
      let parsedSettings: Record<string, unknown> = {};
      try {
        parsedSettings = JSON.parse(def.settings);
      } catch {
        // Malformed settings JSON — validate against an empty settings object.
      }
      const result = validateFieldValue(
        def.type,
        submitted,
        parsedSettings,
        def.required,
      );
      if (!result.valid) {
        errors.push({
          fieldKey: def.key,
          label: def.label,
          error: result.error ?? "Invalid value.",
        });
      }
    }

    if (errors.length > 0) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: "One or more fields are invalid.",
        errors,
      });
    }

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
      await ctx.db.patch(submissionId, {
        status: isComplete ? ("complete" as const) : ("partial" as const),
        submittedAt: existing.submittedAt ?? now,
        completedAt: isComplete ? now : existing.completedAt,
        resumeToken: args.resumeToken,
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
    const entityId = submissionId as string;
    const visibleByKey = new Map(visibleDefs.map((d: FieldDef) => [d.key, d]));
    for (const entry of args.values) {
      const def = visibleByKey.get(entry.fieldKey);
      if (!def) continue; // unknown field or hidden field — ignore
      if (def.type === "message" || def.type === "accordion" || def.type === "tab") {
        continue; // layout fields store no value
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
