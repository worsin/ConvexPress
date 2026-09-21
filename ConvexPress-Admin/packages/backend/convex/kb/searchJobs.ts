import { makeFunctionReference as ref, paginationOptsValidator, type PaginationOptions, type PaginationResult, type RegisteredMutation, type RegisteredQuery } from "convex/server";
import { ConvexError, v, type Validator } from "convex/values";
import { internalMutation, mutation, query, type MutationCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { kbTables } from "../schema/kb";
import { requireCan } from "../helpers/permissions";
import { requirePluginEnabled } from "../helpers/plugins";
import { patchWithMediaReferences } from "../media/attachmentGuard";
import { getMeilisearchIndex } from "./searchSecurity";
import { loadSearchArticle } from "./internals";
import { meilisearchConfigFingerprint, meilisearchDocument, searchDocumentFingerprint } from "./searchDocument";

type Job = Doc<"kb_search_jobs">;
export type JobArgs = { jobId: Id<"kb_search_jobs">; generation: number };
export type LeaseArgs = JobArgs & { lease: number };
const jobArgs = { jobId: v.id("kb_search_jobs"), generation: v.number() };
const leaseArgs = { ...jobArgs, lease: v.number() };
const worker = ref<"action", JobArgs, null>("kb/searchJobWorker:advance");
const statusValidator = kbTables.kb_search_jobs.validator.fields.status;
export type SearchJobStatus = { jobId: Id<"kb_search_jobs">; articleId: Id<"kb_articles">; operation: "sync" | "remove"; status: Job["status"]; phase: Job["phase"]; taskUid?: number; message?: string; reconciledBy?: "document" | "task" };
const publicStatusFields = { jobId: v.id("kb_search_jobs"), articleId: v.id("kb_articles"), operation: kbTables.kb_search_jobs.validator.fields.operation, status: statusValidator, phase: kbTables.kb_search_jobs.validator.fields.phase, taskUid: v.optional(v.number()), message: v.optional(v.string()), reconciledBy: v.optional(v.union(v.literal("document"), v.literal("task"))) };
export const searchJobStatusValidator: Validator<SearchJobStatus, "required", string> = v.object(publicStatusFields);
function publicStatus(job: Job): SearchJobStatus {
  return { jobId: job._id, articleId: job.articleId, operation: job.operation, status: job.status, phase: job.phase, taskUid: job.taskUid, message: job.message, reconciledBy: job.reconciledBy };
}
async function schedule(ctx: MutationCtx, job: Pick<Job, "_id" | "generation">, delay = 0) {
  await ctx.db.patch("kb_search_jobs", job._id, { nextRunAt: Date.now() + delay, updatedAt: Date.now() });
  await ctx.scheduler.runAfter(delay, worker, { jobId: job._id, generation: job.generation });
}
async function authorize(ctx: MutationCtx, job: Job) {
  await requirePluginEnabled(ctx, "knowledgeBase");
  await requireCan({ ...ctx, auth: { getUserIdentity: async () => job.actor } }, "manage_options");
  const settings = await ctx.db.query("settings").withIndex("by_section", q => q.eq("section", "kb.search")).unique();
  if (getUrl(settings?.values) !== job.providerUrl || meilisearchConfigFingerprint(settings?.values ?? null) !== job.configFingerprint || await getMeilisearchIndex(ctx) !== job.indexName) throw new ConvexError({ code: "SEARCH_CONFIGURATION_CHANGED", message: "The search provider configuration changed." });
  return settings!;
}
function getUrl(settings: Record<string, unknown> | undefined): string {
  if (!settings?.meilisearchEnabled || typeof settings.meilisearchUrl !== "string" || !settings.meilisearchApiKey) throw new ConvexError({ code: "CONFIGURATION_ERROR", message: "Configure Meilisearch before starting indexing." });
  let url: URL;
  try { url = new URL(settings.meilisearchUrl); } catch { throw new ConvexError({ code: "CONFIGURATION_ERROR", message: "Invalid Meilisearch URL." }); }
  if (!["https:", "http:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new ConvexError({ code: "CONFIGURATION_ERROR", message: "Invalid Meilisearch URL." });
  return url.toString();
}
async function currentLease(ctx: MutationCtx, args: LeaseArgs) {
  const job = await ctx.db.get("kb_search_jobs", args.jobId);
  return job?.generation === args.generation && job.lease === args.lease && job.status === "running" ? job : null;
}

export const begin: RegisteredMutation<"internal", { articleId: Id<"kb_articles">; operation: "sync" | "remove" }, SearchJobStatus> = internalMutation({
  args: { articleId: v.id("kb_articles"), operation: kbTables.kb_search_jobs.validator.fields.operation }, returns: searchJobStatusValidator,
  handler: async (ctx, args) => {
    await requirePluginEnabled(ctx, "knowledgeBase"); await requireCan(ctx, "manage_options");
    const existing = await ctx.db.query("kb_search_jobs").withIndex("by_article", q => q.eq("articleId", args.articleId)).order("desc").first();
    if (existing && ["running", "paused", "uncertain"].includes(existing.status)) {
      if (existing.operation !== args.operation) throw new ConvexError({ code: "SEARCH_JOB_BUSY", message: "Resolve the existing indexing job before starting a different operation." });
      return publicStatus(existing);
    }
    const identity = await ctx.auth.getUserIdentity(); if (!identity) throw new ConvexError({ code: "UNAUTHORIZED", message: "Authentication required." });
    const settings = await ctx.db.query("settings").withIndex("by_section", q => q.eq("section", "kb.search")).unique();
    const providerUrl = getUrl(settings?.values), indexName = await getMeilisearchIndex(ctx);
    const article = await ctx.db.get("kb_articles", args.articleId);
    if (!article && args.operation === "sync") throw new ConvexError({ code: "NOT_FOUND", message: "Article not found." });
    if (article) await patchWithMediaReferences<"kb_articles">(ctx, "kb_articles", article._id, { meilisearchSynced: false, meilisearchSyncedAt: undefined });
    const now = Date.now();
    const values = { articleId: args.articleId, operation: args.operation, actor: { subject: identity.subject, issuer: identity.issuer, tokenIdentifier: identity.tokenIdentifier }, generation: 1, lease: 0, leaseUntil: 0, nextRunAt: now, status: "running" as const, phase: "settings" as const, receiptVersion: 1 as const, indexName, configFingerprint: meilisearchConfigFingerprint(settings!.values), providerUrl, createdAt: now, updatedAt: now };
    const jobId = await ctx.db.insert("kb_search_jobs", values);
    await schedule(ctx, { _id: jobId, generation: values.generation });
    return publicStatus((await ctx.db.get("kb_search_jobs", jobId))!);
  },
});

export const status: RegisteredQuery<"public", { jobId: Id<"kb_search_jobs"> }, SearchJobStatus | null> = query({
  args: { jobId: v.id("kb_search_jobs") }, returns: v.union(v.null(), searchJobStatusValidator),
  handler: async (ctx, { jobId }) => { await requireCan(ctx, "manage_options"); const job = await ctx.db.get("kb_search_jobs", jobId); return job ? publicStatus(job) : null; },
});
type ArticleOption = { articleId: Id<"kb_articles">; title: string; status: Doc<"kb_articles">["status"]; meilisearchSynced: boolean };
const articleOptionValidator: Validator<ArticleOption, "required", string> = v.object({ articleId: v.id("kb_articles"), title: v.string(), status: kbTables.kb_articles.validator.fields.status, meilisearchSynced: v.boolean() });
type JobListEntry = SearchJobStatus & { title: string; articleDeleted: boolean; createdAt: number; updatedAt: number };
const jobListEntryValidator: Validator<JobListEntry, "required", string> = v.object({ ...publicStatusFields, title: v.string(), articleDeleted: v.boolean(), createdAt: v.number(), updatedAt: v.number() });
function pageValidator<T>(item: Validator<T, "required", string>): Validator<PaginationResult<T>, "required", string> {
  return v.object({ page: v.array(item), isDone: v.boolean(), continueCursor: v.string(), splitCursor: v.optional(v.union(v.string(), v.null())), pageStatus: v.optional(v.union(v.literal("SplitRecommended"), v.literal("SplitRequired"), v.null())) });
}
function boundedPage(options: PaginationOptions) {
  if (!Number.isSafeInteger(options.numItems) || options.numItems < 1 || options.numItems > 25) throw new ConvexError({ code: "INVALID_SEARCH_JOB_PAGE", message: "Request 1–25 items at a time." });
  return { ...options, maximumRowsRead: 25, maximumBytesRead: 2 * 1024 * 1024 };
}
export const articleOptions: RegisteredQuery<"public", { paginationOpts: PaginationOptions; search?: string }, PaginationResult<ArticleOption>> = query({
  args: { paginationOpts: paginationOptsValidator, search: v.optional(v.string()) }, returns: pageValidator(articleOptionValidator),
  handler: async (ctx, args) => {
    await requirePluginEnabled(ctx, "knowledgeBase"); await requireCan(ctx, "manage_options");
    const paginationOpts = boundedPage(args.paginationOpts);
    if ((args.search?.length ?? 0) > 200) throw new ConvexError({ code: "INVALID_ARTICLE_SEARCH", message: "Search titles using at most 200 characters." });
    const search = args.search?.trim();
    const result = search
      ? await ctx.db.query("kb_articles").withSearchIndex("search_article_titles", q => q.search("title", search)).paginate(paginationOpts)
      : await ctx.db.query("kb_articles").order("desc").paginate(paginationOpts);
    return { ...result, page: result.page.map(article => ({ articleId: article._id, title: article.title, status: article.status, meilisearchSynced: article.meilisearchSynced })) };
  },
});
export const list: RegisteredQuery<"public", { paginationOpts: PaginationOptions }, PaginationResult<JobListEntry>> = query({
  args: { paginationOpts: paginationOptsValidator }, returns: pageValidator(jobListEntryValidator),
  handler: async (ctx, args) => {
    await requirePluginEnabled(ctx, "knowledgeBase"); await requireCan(ctx, "manage_options");
    const result = await ctx.db.query("kb_search_jobs").order("desc").paginate(boundedPage(args.paginationOpts));
    return { ...result, page: await Promise.all(result.page.map(async job => {
      const article = await ctx.db.get("kb_articles", job.articleId);
      return { ...publicStatus(job), title: article?.title ?? "Deleted article", articleDeleted: !article, createdAt: job.createdAt, updatedAt: job.updatedAt };
    })) };
  },
});
export const resume: RegisteredMutation<"public", { jobId: Id<"kb_search_jobs"> }, SearchJobStatus> = mutation({
  args: { jobId: v.id("kb_search_jobs") }, returns: searchJobStatusValidator,
  handler: async (ctx, { jobId }) => {
    await requirePluginEnabled(ctx, "knowledgeBase"); await requireCan(ctx, "manage_options");
    const job = await ctx.db.get("kb_search_jobs", jobId); if (!job) throw new ConvexError({ code: "NOT_FOUND", message: "Indexing job not found." });
    if (job.status === "uncertain") throw new ConvexError({ code: "SEARCH_ACKNOWLEDGEMENT_UNCERTAIN", message: "The provider may have accepted this write. Reconcile its task before continuing; it will not be resubmitted." });
    if (!["paused", "running"].includes(job.status)) return publicStatus(job);
    if (job.leaseUntil > Date.now()) return publicStatus(job);
    const identity = (await ctx.auth.getUserIdentity())!;
    const next = { ...job, actor: { subject: identity.subject, issuer: identity.issuer, tokenIdentifier: identity.tokenIdentifier } };
    await authorize(ctx, next);
    await ctx.db.patch("kb_search_jobs", jobId, { actor: next.actor, status: "running", message: undefined, leaseUntil: 0 });
    await schedule(ctx, job); return publicStatus((await ctx.db.get("kb_search_jobs", jobId))!);
  },
});

export const claim: RegisteredMutation<"internal", JobArgs, (Job & { encryptedKey: string }) | null> = internalMutation({
  args: jobArgs, returns: v.union(v.null(), v.object({ ...kbTables.kb_search_jobs.validator.fields, _id: v.id("kb_search_jobs"), _creationTime: v.number(), encryptedKey: v.string() })),
  handler: async (ctx: MutationCtx, args: JobArgs) => {
    const job = await ctx.db.get("kb_search_jobs", args.jobId), now = Date.now();
    if (!job || job.generation !== args.generation || job.status !== "running" || job.leaseUntil > now) return null;
    if (job.phase.endsWith("Submitting")) {
      await ctx.db.patch("kb_search_jobs", job._id, { status: "uncertain", message: "The write acknowledgement was interrupted. Reconcile the provider task; this write has not been resubmitted.", leaseUntil: 0, updatedAt: now }); return null;
    }
    let settings;
    try { settings = await authorize(ctx, job); }
    catch { await ctx.db.patch("kb_search_jobs", job._id, { status: "paused", message: "Indexing paused. Restore the provider configuration and continue with an active authorized session.", leaseUntil: 0, updatedAt: now }); return null; }
    let document = job.document, fingerprint = job.fingerprint;
    if (job.phase === "document" && job.operation === "sync") {
      try {
        const article = await loadSearchArticle(ctx, job.articleId);
        if (!article) throw new Error("Article removed");
        document = JSON.stringify(meilisearchDocument(article)); fingerprint = searchDocumentFingerprint(article);
      } catch { await ctx.db.patch("kb_search_jobs", job._id, { status: "failed", message: "The current article could not be prepared for indexing.", updatedAt: now }); return null; }
    }
    const lease = job.lease + 1, leaseUntil = now + 45_000;
    await ctx.db.patch("kb_search_jobs", job._id, { lease, leaseUntil, document, fingerprint, nextRunAt: leaseUntil, updatedAt: now });
    await ctx.scheduler.runAfter(46_000, worker, args);
    return { ...job, lease, leaseUntil, document, fingerprint, encryptedKey: String(settings.values.meilisearchApiKey) };
  },
});

/** Commit the submission boundary before HTTP. Recovery will never replay an
 * interrupted write without an acknowledged provider task. */
export const submitting: RegisteredMutation<"internal", LeaseArgs, boolean> = internalMutation({
  args: leaseArgs, returns: v.boolean(), handler: async (ctx: MutationCtx, args: LeaseArgs) => {
    const job = await currentLease(ctx, args); if (!job || job.leaseUntil <= Date.now() || !["settings", "document"].includes(job.phase)) return false;
    await authorize(ctx, job);
    await ctx.db.patch("kb_search_jobs", job._id, { phase: job.phase === "settings" ? "settingsSubmitting" : "documentSubmitting", updatedAt: Date.now() }); return true;
  },
});

// Acknowledgements are safe to persist after revocation: they record an already
// issued request, and do not authorize another provider operation.
export const acknowledge: RegisteredMutation<"internal", LeaseArgs & { taskUid: number }, null> = internalMutation({
  args: { ...leaseArgs, taskUid: v.number() }, returns: v.null(), handler: async (ctx, args) => {
    const job = await ctx.db.get("kb_search_jobs", args.jobId); if (!job || job.generation !== args.generation || job.lease !== args.lease || !["running", "uncertain"].includes(job.status) || !job.phase.endsWith("Submitting")) return null;
    if (!Number.isSafeInteger(args.taskUid) || args.taskUid < 0) throw new Error("Invalid task identifier");
    await ctx.db.patch("kb_search_jobs", job._id, { status: "running", message: undefined, taskUid: args.taskUid, phase: job.phase === "settingsSubmitting" ? "settingsPoll" : "documentPoll", leaseUntil: 0 });
    await schedule(ctx, job); return null;
  },
});

type Result = "ready" | "pending" | "succeeded" | "failed" | "uncertain";
export const record: RegisteredMutation<"internal", LeaseArgs & { result: Result }, null> = internalMutation({
  args: { ...leaseArgs, result: v.union(v.literal("ready"), v.literal("pending"), v.literal("succeeded"), v.literal("failed"), v.literal("uncertain")) }, returns: v.null(),
  handler: async (ctx: MutationCtx, args: LeaseArgs & { result: Result }) => {
    const job = await currentLease(ctx, args); if (!job) return null;
    if (args.result === "uncertain" || args.result === "failed") {
      await ctx.db.patch("kb_search_jobs", job._id, { status: args.result, leaseUntil: 0, message: args.result === "uncertain" ? "The provider write acknowledgement is uncertain. Reconcile it before another write." : "The provider rejected or failed this operation. Start a new sync after correcting the cause.", updatedAt: Date.now() }); return null;
    }
    try { await authorize(ctx, job); }
    catch { await ctx.db.patch("kb_search_jobs", job._id, { status: "paused", leaseUntil: 0, message: "Indexing paused. Continue with an active authorized session and the original provider configuration.", updatedAt: Date.now() }); return null; }
    if (args.result === "pending") { await ctx.db.patch("kb_search_jobs", job._id, { leaseUntil: 0 }); await schedule(ctx, job, 5_000); return null; }
    if ((args.result === "ready" && job.phase === "settings") || (args.result === "succeeded" && job.phase === "settingsPoll")) {
      await ctx.db.patch("kb_search_jobs", job._id, { phase: "document", taskUid: undefined, leaseUntil: 0 }); await schedule(ctx, job); return null;
    }
    if (args.result === "succeeded" && (job.phase === "documentPoll" || (job.operation === "remove" && job.phase === "documentSubmitting"))) {
      let matches = true;
      if (job.operation === "sync") {
        const article = await loadSearchArticle(ctx, job.articleId); matches = !!article && searchDocumentFingerprint(article) === job.fingerprint;
        if (matches) await patchWithMediaReferences<"kb_articles">(ctx, "kb_articles", job.articleId, { meilisearchSynced: true, meilisearchSyncedAt: Date.now() });
      }
      await ctx.db.patch("kb_search_jobs", job._id, { status: matches ? "complete" : "stale", leaseUntil: 0, message: matches ? undefined : "The article changed while indexing. Start a new sync for its current version.", updatedAt: Date.now() });
    }
    return null;
  },
});

export const recover: RegisteredMutation<"internal", Record<string, never>, null> = internalMutation({
  args: {}, returns: v.null(), handler: async ctx => {
    const jobs = await ctx.db.query("kb_search_jobs").withIndex("by_status_due", q => q.eq("status", "running").lte("nextRunAt", Date.now())).take(20);
    for (const job of jobs) await schedule(ctx, job, Math.max(0, job.leaseUntil - Date.now()));
    return null;
  },
});

// These endpoints are internal so callers cannot supply provider evidence or
// arbitrary task IDs. The Node action reads evidence from the saved provider.
export const prepareReconciliation: RegisteredMutation<"internal", { jobId: Id<"kb_search_jobs"> }, (Job & { encryptedKey: string }) | null> = internalMutation({
  args: { jobId: v.id("kb_search_jobs") }, returns: v.union(v.null(), v.object({ ...kbTables.kb_search_jobs.validator.fields, _id: v.id("kb_search_jobs"), _creationTime: v.number(), encryptedKey: v.string() })),
  handler: async (ctx: MutationCtx, { jobId }: { jobId: Id<"kb_search_jobs"> }) => {
    await requirePluginEnabled(ctx, "knowledgeBase"); await requireCan(ctx, "manage_options");
    const job = await ctx.db.get("kb_search_jobs", jobId);
    if (!job || job.status !== "uncertain") return null;
    if (job.receiptVersion !== 1 || !job.phase.endsWith("Submitting")) throw new ConvexError({ code: "SEARCH_RECEIPT_UNAVAILABLE", message: "This older operation has no verifiable receipt. It remains held; no write has been repeated." });
    const identity = (await ctx.auth.getUserIdentity())!;
    const actor = { subject: identity.subject, issuer: identity.issuer, tokenIdentifier: identity.tokenIdentifier };
    const settings = await authorize(ctx, { ...job, actor });
    // Do not change the worker lease: a delayed acknowledgement from that worker
    // is still useful and may win the race with this read-only observation.
    await ctx.db.patch("kb_search_jobs", jobId, { actor });
    return { ...job, actor, encryptedKey: String(settings.values.meilisearchApiKey) };
  },
});
type ReconciliationResult = JobArgs & { lease: number; phase: Job["phase"]; cursor?: number; taskUid?: number; documentObserved?: boolean; next?: number };
export const finishReconciliation: RegisteredMutation<"internal", ReconciliationResult, null> = internalMutation({
  args: { ...leaseArgs, phase: kbTables.kb_search_jobs.validator.fields.phase, cursor: v.optional(v.number()), taskUid: v.optional(v.number()), documentObserved: v.optional(v.boolean()), next: v.optional(v.number()) }, returns: v.null(),
  handler: async (ctx: MutationCtx, args: ReconciliationResult) => {
    await requirePluginEnabled(ctx, "knowledgeBase"); await requireCan(ctx, "manage_options");
    const job = await ctx.db.get("kb_search_jobs", args.jobId);
    if (!job || job.status !== "uncertain" || job.receiptVersion !== 1 || job.generation !== args.generation || job.lease !== args.lease || job.phase !== args.phase || job.reconciliationCursor !== args.cursor) return null;
    await authorize(ctx, job);
    const evidence = job.reconciliationEvidence ?? [];
    if (evidence.length >= 2) throw new Error("Reconciliation evidence limit reached");
    if (args.taskUid !== undefined) {
      if (!Number.isSafeInteger(args.taskUid) || args.taskUid < 0 || !(job.phase === "settingsSubmitting" || (job.phase === "documentSubmitting" && job.operation === "remove"))) throw new Error("Invalid receipt task");
      await ctx.db.patch("kb_search_jobs", job._id, { status: "running", phase: job.phase === "settingsSubmitting" ? "settingsPoll" : "documentPoll", taskUid: args.taskUid, reconciledBy: "task", reconciliationEvidence: [...evidence, { phase: job.phase === "settingsSubmitting" ? "settings" : "document", kind: "task", taskUid: args.taskUid, verifiedAt: Date.now() }], reconciliationCursor: undefined, leaseUntil: 0, message: undefined });
      await schedule(ctx, job); return null;
    }
    if (args.documentObserved === true) {
      if (job.operation !== "sync" || job.phase !== "documentSubmitting") throw new Error("Invalid document receipt");
      const article = await loadSearchArticle(ctx, job.articleId);
      const matches = !!article && searchDocumentFingerprint(article) === job.fingerprint;
      if (matches) await patchWithMediaReferences<"kb_articles">(ctx, "kb_articles", job.articleId, { meilisearchSynced: true, meilisearchSyncedAt: Date.now() });
      await ctx.db.patch("kb_search_jobs", job._id, { status: matches ? "complete" : "stale", reconciledBy: "document", reconciliationEvidence: [...evidence, { phase: "document", kind: "document", verifiedAt: Date.now() }], reconciliationCursor: undefined, leaseUntil: 0, updatedAt: Date.now(), message: matches ? "The provider's indexed document matches this operation's receipt and complete snapshot." : "The provider accepted this operation, but the article has since changed. Sync its current version." });
      return null;
    }
    if (args.next !== undefined && (!Number.isSafeInteger(args.next) || args.next < 0 || (args.cursor !== undefined && args.next >= args.cursor))) throw new Error("Invalid reconciliation cursor");
    await ctx.db.patch("kb_search_jobs", job._id, { reconciliationCursor: args.next, updatedAt: Date.now(), message: args.next === undefined ? "No matching provider receipt is visible yet. The operation remains held; checking again will not repeat the write." : "This page contains no matching receipt. Check again to inspect the next page of provider tasks." });
    return null;
  },
});
