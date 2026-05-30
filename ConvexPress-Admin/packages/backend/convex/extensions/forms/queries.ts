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

    return { submission, values, notes };
  },
});
