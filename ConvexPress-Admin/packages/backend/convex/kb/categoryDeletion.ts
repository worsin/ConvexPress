import { makeFunctionReference, type RegisteredMutation, type RegisteredQuery } from "convex/server";
import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import { internalMutation, query, type MutationCtx } from "../_generated/server";
import { requireCan } from "../helpers/permissions";
import { requirePluginEnabled } from "../helpers/plugins";
import { patchWithMediaReferences } from "../media/attachmentGuard";
import { validateCategoryParent } from "./helpers/categoryHierarchy";

type JobArgs = { jobId: Id<"kb_category_deletions">; generation: number };
const advanceRef = makeFunctionReference<"mutation", JobArgs, null>("kb/categoryDeletion:advance");
const batchRef = makeFunctionReference<"mutation", JobArgs, null>("kb/categoryDeletion:batch");
const jobArgs = { jobId: v.id("kb_category_deletions"), generation: v.number() };

async function captureActor(ctx: MutationCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new ConvexError({ code: "UNAUTHORIZED", message: "Authentication required." });
  return { subject: identity.subject, issuer: identity.issuer, tokenIdentifier: identity.tokenIdentifier };
}

async function authorizeJob(ctx: MutationCtx, job: Doc<"kb_category_deletions">) {
  await requirePluginEnabled(ctx, "knowledgeBase");
  // Only beginCategoryDeletion captures this principal after requireCan. It is
  // deliberately not accepted as a function argument or returned to the client.
  await requireCan({ ...ctx, auth: { getUserIdentity: async () => job.actor } }, "kb.manageCategories");
}

async function schedule(ctx: MutationCtx, jobId: Id<"kb_category_deletions">, generation: number) {
  const scheduledId = await ctx.scheduler.runAfter(0, advanceRef, { jobId, generation });
  await ctx.db.patch("kb_category_deletions", jobId, { scheduledId, updatedAt: Date.now() });
}

export async function beginCategoryDeletion(ctx: MutationCtx, categoryId: Id<"kb_categories">): Promise<Id<"kb_categories">> {
  await requirePluginEnabled(ctx, "knowledgeBase");
  const user = await requireCan(ctx, "kb.manageCategories");
  const category = await ctx.db.get("kb_categories", categoryId);
  if (!category) throw new ConvexError({ code: "NOT_FOUND", message: "Category not found." });
  const actor = await captureActor(ctx), now = Date.now();
  if (category.deletionJobId) {
    const job = await ctx.db.get("kb_category_deletions", category.deletionJobId);
    if (!job || job.categoryId !== categoryId || job.status === "complete") throw new ConvexError({ code: "DELETION_STATE_INVALID", message: "The deletion record needs repair." });
    const generation = job.generation + 1;
    await ctx.db.patch("kb_category_deletions", job._id, { actor, generation, status: "running", message: undefined, updatedAt: now });
    await schedule(ctx, job._id, generation);
    return categoryId;
  }
  await validateCategoryParent(ctx, category.parentId, categoryId);
  const jobId = await ctx.db.insert("kb_category_deletions", {
    categoryId, categoryName: category.name, sourceSlug: category.slug, sourcePublished: category.isPublished,
    originalParentId: category.parentId, requestedBy: user._id, actor, status: "running", phase: "children",
    generation: 1, childrenMoved: 0, articlesMoved: 0, createdAt: now, updatedAt: now,
  });
  await ctx.db.patch("kb_categories", categoryId, { deletionJobId: jobId, isActive: false, isPublished: false, updatedAt: now });
  await schedule(ctx, jobId, 1);
  return categoryId;
}

type Status = { categoryName: string; status: "running" | "paused" | "failed" | "complete"; childrenMoved: number; articlesMoved: number; message?: string };
export const status: RegisteredQuery<"public", { jobId: Id<"kb_category_deletions"> }, Status | null> = query({
  args: { jobId: v.id("kb_category_deletions") },
  returns: v.union(v.null(), v.object({ categoryName: v.string(), status: v.union(v.literal("running"), v.literal("paused"), v.literal("failed"), v.literal("complete")), childrenMoved: v.number(), articlesMoved: v.number(), message: v.optional(v.string()) })),
  handler: async (ctx, { jobId }) => {
    await requireCan(ctx, "kb.view");
    const job = await ctx.db.get("kb_category_deletions", jobId);
    if (!job) return null;
    const result: Status = { categoryName: job.categoryName, status: job.status, childrenMoved: job.childrenMoved, articlesMoved: job.articlesMoved, message: job.message };
    if (job.status === "running" && job.scheduledId) {
      const task = await ctx.db.system.get(job.scheduledId);
      if (!task || task.state.kind === "failed" || task.state.kind === "canceled") return { ...result, status: "failed" as const, message: "The background task stopped. Continue deletion to retry the remaining records." };
    }
    return result;
  },
});

/** This wrapper records failure outside the batch's nested transaction. A failed
 * batch rolls back its moves and provenance rows before we persist the error. */
export const advance: RegisteredMutation<"internal", JobArgs, null> = internalMutation({
  args: jobArgs, returns: v.null(),
  handler: async (ctx, args) => {
    const job = await ctx.db.get("kb_category_deletions", args.jobId);
    if (!job || job.generation !== args.generation || job.status !== "running") return null;
    try { await authorizeJob(ctx, job); }
    catch { await ctx.db.patch("kb_category_deletions", job._id, { status: "paused", message: "Deletion paused. An authorized operator must continue it with an active session and Knowledge Base enabled.", updatedAt: Date.now() }); return null; }
    try { await ctx.runMutation(batchRef, args); }
    catch { await ctx.db.patch("kb_category_deletions", job._id, { status: "failed", message: "The last batch could not finish. Its changes were rolled back; continue deletion to retry.", updatedAt: Date.now() }); }
    return null;
  },
});

export const batch: RegisteredMutation<"internal", JobArgs, null> = internalMutation({
  args: jobArgs, returns: v.null(),
  handler: async (ctx, args) => {
    const job = await ctx.db.get("kb_category_deletions", args.jobId);
    if (!job || job.generation !== args.generation || job.status !== "running") return null;
    await authorizeJob(ctx, job);
    const category = await ctx.db.get("kb_categories", job.categoryId);
    if (!category || category.deletionJobId !== job._id) throw new ConvexError({ code: "DELETION_STATE_INVALID", message: "Category deletion ownership changed." });
    const now = Date.now();
    if (job.phase === "children") {
      const parent = job.originalParentId ? await ctx.db.get("kb_categories", job.originalParentId) : null;
      const parentId = parent?.isActive && !parent.deletionJobId ? parent._id : undefined;
      await validateCategoryParent(ctx, parentId, category._id);
      const page = await ctx.db.query("kb_categories").withIndex("by_parent", q => q.eq("parentId", category._id)).paginate({ numItems: 20, cursor: null, maximumRowsRead: 20, maximumBytesRead: 512 * 1024 });
      if (!page.page.length && !page.isDone) throw new ConvexError({ code: "DELETION_NO_PROGRESS", message: "The child batch could not advance." });
      for (const child of page.page) await ctx.db.patch("kb_categories", child._id, { parentId, updatedAt: now });
      await ctx.db.patch("kb_category_deletions", job._id, { childrenMoved: job.childrenMoved + page.page.length, phase: page.isDone ? "articles" : "children", updatedAt: now });
      await schedule(ctx, job._id, job.generation);
      return null;
    }
    const page = await ctx.db.query("kb_articles").withIndex("by_category", q => q.eq("categoryId", category._id)).paginate({ numItems: 20, cursor: null, maximumRowsRead: 20, maximumBytesRead: 512 * 1024 });
    if (!page.page.length && !page.isDone) throw new ConvexError({ code: "DELETION_NO_PROGRESS", message: "The article batch could not advance." });
    for (const article of page.page) {
      const existing = await ctx.db.query("kb_article_category_guards").withIndex("by_job_article", q => q.eq("jobId", job._id).eq("articleId", article._id)).unique();
      if (existing && (existing.categorySlug !== job.sourceSlug || existing.articleSlug !== article.slug || existing.wasPublished !== job.sourcePublished)) throw new ConvexError({ code: "DELETION_GUARD_CHANGED", message: "An existing retained access record needs review." });
      if (!existing) await ctx.db.insert("kb_article_category_guards", { articleId: article._id, jobId: job._id, categorySlug: job.sourceSlug, articleSlug: article.slug, wasPublished: job.sourcePublished, createdAt: now });
      await patchWithMediaReferences<"kb_articles">(ctx, "kb_articles", article._id, { categoryId: undefined, meilisearchSynced: false, ragSynced: false, updatedAt: now });
    }
    const articlesMoved = job.articlesMoved + page.page.length;
    if (page.isDone) {
      // New assignments are fenced by deletionJobId. Recheck both indexes before
      // removal, so even an unexpected competing writer cannot leave an orphan.
      const child = await ctx.db.query("kb_categories").withIndex("by_parent", q => q.eq("parentId", category._id)).first();
      const article = await ctx.db.query("kb_articles").withIndex("by_category", q => q.eq("categoryId", category._id)).first();
      if (child || article) {
        await ctx.db.patch("kb_category_deletions", job._id, { articlesMoved, phase: child ? "children" : "articles", updatedAt: now });
        await schedule(ctx, job._id, job.generation); return null;
      }
      await ctx.db.delete("kb_categories", category._id);
      await ctx.db.patch("kb_category_deletions", job._id, { articlesMoved, status: "complete", completedAt: now, updatedAt: now });
    } else {
      await ctx.db.patch("kb_category_deletions", job._id, { articlesMoved, updatedAt: now });
      await schedule(ctx, job._id, job.generation);
    }
    return null;
  },
});
