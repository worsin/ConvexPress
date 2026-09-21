import { makeFunctionReference } from "convex/server";
import { ConvexError, v } from "convex/values";
import { internalMutation, mutation, query, type MutationCtx } from "../_generated/server";
import type { Id, Doc } from "../_generated/dataModel";
import { capturePublicationAuthority, requireCapturedPublicationAuthority, requireCan } from "../helpers/permissions";
import { RequestReadLedger } from "../helpers/requestReadLedger";
import { validateCanonicalTree } from "../canonicalDocuments/foundation/generated/instances";
import { collectContactDefinitions } from "../canonicalDocuments/contactDefinitions";
import { syncContactForm } from "../canonicalDocuments/contactForms";
import { contactProjectionMatches } from "../canonicalDocuments/contactProjection";
import { reconcileSyncedConsumers } from "./consumers";
import { resolvePublishedOccurrences } from "./occurrences";
import { checkGeneration, installation, owned, publicationReview, storedRevision, syncedFailure } from "./model";
import { consumerDiscoveryReady, consumerIndexGeneration } from "./consumerIndexState";
import type { SyncedScope } from "../canonicalDocuments/foundation/syncedContent";
import { refreshStatusValidator } from "./refreshValidators";

type JobId = Id<"syncedBlockRefreshJobs">;
type Tick = { jobId: JobId; attempt: number; afterPostId: Id<"posts"> | null };
const stepRef = makeFunctionReference<"mutation", Tick, null>("syncedBlocks/refresh:step");
const pageRef = makeFunctionReference<"mutation", { jobId: JobId; attempt: number; postId: Id<"posts"> }, null>("syncedBlocks/refresh:refreshPage");
const recoverRef = makeFunctionReference<"mutation">("syncedBlocks/refresh:recover");
const jobIdValidator = v.id("syncedBlockRefreshJobs");

async function scheduleStep(ctx: MutationCtx, args: Tick) {
  const scheduledFunctionId = await ctx.scheduler.runAfter(0, stepRef, args);
  await ctx.db.patch("syncedBlockRefreshJobs", args.jobId, { scheduledFunctionId });
}

function belongsToSource(job: Doc<"syncedBlockRefreshJobs"> | null, source: Doc<"syncedBlocks">): job is Doc<"syncedBlockRefreshJobs"> {
  return !!job && job.sourceId === source._id && job.websiteKey === source.websiteKey && job.instanceKey === source.instanceKey && job.deploymentOrigin === source.deploymentOrigin;
}

/** Runs in the publishing transaction, so a committed pointer always has a
 * durable callback. Old deliveries are fenced by job ID, attempt and cursor. */
export async function enqueueRefresh(ctx: MutationCtx, source: Doc<"syncedBlocks">, scope: SyncedScope, sourceGeneration: number, capability: "post.publish" | "post.unpublish", budget: RequestReadLedger): Promise<JobId> {
  const authority = await capturePublicationAuthority(ctx, scope, capability, budget);
  const now = Date.now();
  if (source.refreshJobId) {
    budget.beforeRead();
    const previous = budget.record(await ctx.db.get("syncedBlockRefreshJobs", source.refreshJobId));
    if (belongsToSource(previous, source) && previous.status === "pending") await ctx.db.patch("syncedBlockRefreshJobs", previous._id, { status: "superseded", updatedAt: now });
  }
  const jobId = await ctx.db.insert("syncedBlockRefreshJobs", {
    sourceId: source._id, sourceGeneration, ...scope, authority, capability,
    indexGeneration: consumerIndexGeneration() ?? undefined,
    status: "pending", attempt: 1, afterPostId: null, processed: 0, failed: 0,
    createdAt: now, updatedAt: now,
  });
  await ctx.db.patch("syncedBlocks", source._id, { refreshJobId: jobId });
  await scheduleStep(ctx, { jobId, attempt: 1, afterPostId: null });
  return jobId;
}

async function currentJob(ctx: MutationCtx, id: JobId, attempt: number, budget: RequestReadLedger) {
  budget.beforeRead();
  const job = budget.record(await ctx.db.get("syncedBlockRefreshJobs", id));
  if (!job || job.status !== "pending" || job.attempt !== attempt) return null;
  const scope = await installation(ctx, budget);
  if (scope.websiteKey !== job.websiteKey || scope.instanceKey !== job.instanceKey || scope.deploymentOrigin !== job.deploymentOrigin)
    return syncedFailure("SYNCED_REFRESH_SCOPE", "Refresh belongs to another website environment.");
  if (!job.indexGeneration || job.indexGeneration !== consumerIndexGeneration())
    return syncedFailure("SYNCED_REFRESH_INDEX_CHANGED", "Deployment or restored data changed. Finish page discovery and retry with current permissions.");
  if (!(await consumerDiscoveryReady(ctx, scope, budget)))
    return syncedFailure("SYNCED_REFRESH_INDEX", "Finish indexing existing pages before refreshing linked pages.");
  const actor = await requireCapturedPublicationAuthority(ctx, job.authority, scope, job.capability, budget);
  const { source } = await owned(ctx, job.sourceId, actor._id, budget);
  if (source.refreshJobId !== job._id || source.generation < job.sourceGeneration) return null;
  return { job, scope };
}

/** Separate subtransaction: a page failure rolls back ALL its projections and
 * dependency writes, while the outer worker can safely persist a failure. */
export const refreshPage = internalMutation({
  args: { jobId: jobIdValidator, attempt: v.number(), postId: v.id("posts") }, returns: v.null(),
  handler: async (ctx, args) => {
    const budget = new RequestReadLedger(), state = await currentJob(ctx, args.jobId, args.attempt, budget);
    if (!state) return null;
    const { job, scope } = state;
    budget.beforeRead();
    const post = budget.record(await ctx.db.get("posts", args.postId));
    if (!post || post.blocksVersion !== 2 || !post.blocks) {
      await reconcileSyncedConsumers(ctx, args.postId, null, new Set(), budget);
      return null;
    }
    const sources = new Set<Id<"syncedBlocks">>();
    const plan = await resolvePublishedOccurrences(ctx, validateCanonicalTree(post.blocks), budget, { onSource: id => { sources.add(id); } });
    // Current authored references, not discovery edges, determine write scope.
    // No post content, unrelated page contacts, or other reusable sources change.
    const contacts = collectContactDefinitions(plan.resolverTree).filter(contact =>
      plan.byId.get(contact.blockId)?.sourceChain.some(source => source.id === job.sourceId),
    );
    await reconcileSyncedConsumers(ctx, post._id, scope, sources, budget);
    for (const contact of contacts) {
      budget.beforeRead();
      const existing = budget.record(await ctx.db.query("forms").withIndex("by_contact_source", q => q.eq("contactPostId", post._id).eq("contactBlockId", contact.blockId)).unique());
      // Matching pinned projections need no mutation or extra write grant.
      if (existing?.status === "published" && await contactProjectionMatches(ctx, existing, contact.attrs, budget)) continue;
      const formId = await syncContactForm(ctx, { postId: post._id, sourceTitle: post.title, ...contact }, budget,
        capability => requireCapturedPublicationAuthority(ctx, job.authority, scope, capability, budget));
      await ctx.db.patch("forms", formId, { status: "published" });
    }
    return null;
  },
});

function failureCode(error: unknown): string {
  // Never persist raw errors, authored field values or private page titles.
  const data = error instanceof ConvexError ? error.data : null;
  const code = data && typeof data === "object" && "code" in data ? data.code : null;
  return typeof code === "string" && /^[A-Z][A-Z0-9_]{0,79}$/.test(code) ? code : "SYNCED_REFRESH_FAILED";
}

export const step = internalMutation({
  args: { jobId: jobIdValidator, attempt: v.number(), afterPostId: v.union(v.id("posts"), v.null()) }, returns: v.null(),
  handler: async (ctx, args) => {
    const job = await ctx.db.get("syncedBlockRefreshJobs", args.jobId);
    if (!job || job.status !== "pending" || job.attempt !== args.attempt || job.afterPostId !== args.afterPostId) return null;
    const source = await ctx.db.get("syncedBlocks", job.sourceId);
    if (!source || source.refreshJobId !== job._id) {
      await ctx.db.patch("syncedBlockRefreshJobs", job._id, { status: "superseded", updatedAt: Date.now() });
      return null;
    }
    try {
      if (!(await currentJob(ctx, job._id, job.attempt, new RequestReadLedger()))) {
        await ctx.db.patch("syncedBlockRefreshJobs", job._id, { status: "superseded", updatedAt: Date.now() });
        return null;
      }
    } catch (error) {
      // Validate even an empty job: no restored/expired grant becomes a false
      // successful refresh merely because its discovery rows are missing.
      await ctx.db.patch("syncedBlockRefreshJobs", job._id, { status: "failed", errorCode: failureCode(error), updatedAt: Date.now() });
      return null;
    }
    const rows = await ctx.db.query("syncedBlockConsumers").withIndex("by_source_scope", q => {
      const range = q.eq("sourceId", job.sourceId).eq("websiteKey", job.websiteKey).eq("instanceKey", job.instanceKey).eq("deploymentOrigin", job.deploymentOrigin);
      return job.afterPostId === null ? range : range.gt("postId", job.afterPostId);
    }).take(1);
    const edge = rows[0];
    if (!edge) {
      await ctx.db.patch("syncedBlockRefreshJobs", job._id, { status: job.failed ? "failed" : "completed", updatedAt: Date.now() });
      return null;
    }
    let failed = job.failed;
    try { await ctx.runMutation(pageRef, { jobId: job._id, attempt: job.attempt, postId: edge.postId }); }
    catch (error) {
      failed++;
      await ctx.db.insert("syncedBlockRefreshFailures", { jobId: job._id, attempt: job.attempt, postId: edge.postId, code: failureCode(error), createdAt: Date.now() });
    }
    await ctx.db.patch("syncedBlockRefreshJobs", job._id, { afterPostId: edge.postId, processed: job.processed + 1, failed, updatedAt: Date.now() });
    await scheduleStep(ctx, { jobId: job._id, attempt: job.attempt, afterPostId: edge.postId });
    return null;
  },
});

/** Aggregate source status intentionally excludes consumer IDs/titles and auth
 * provenance. Source readers are not automatically readers of private pages. */
export const status = query({
  args: { id: v.id("syncedBlocks") },
  returns: v.union(v.null(), v.object({ jobId: jobIdValidator, sourceGeneration: v.number(), status: refreshStatusValidator, attempt: v.number(), processed: v.number(), failed: v.number(), errorCode: v.union(v.string(), v.null()), updatedAt: v.number() })),
  handler: async (ctx, args) => {
    const budget = new RequestReadLedger(), actor = await requireCan(ctx, "post.read", budget);
    const { source } = await owned(ctx, args.id, actor._id, budget);
    if (!source.refreshJobId) return null;
    budget.beforeRead();
    const job = budget.record(await ctx.db.get("syncedBlockRefreshJobs", source.refreshJobId));
    if (!belongsToSource(job, source)) return null;
    return { jobId: job._id, sourceGeneration: job.sourceGeneration, status: job.status, attempt: job.attempt, processed: job.processed, failed: job.failed, errorCode: job.errorCode ?? null, updatedAt: job.updatedAt };
  },
});

/** Imported publications can predate refresh jobs. Start from the current
 * publisher's authority only after discovery is complete; never manufacture a
 * historic actor or silently report success over an incomplete consumer index. */
export const start = mutation({
  args: { id: v.id("syncedBlocks"), expectedGeneration: v.number() },
  returns: v.object({ jobId: jobIdValidator, attempt: v.number() }),
  handler: async (ctx, args) => {
    const budget = new RequestReadLedger(), actor = await requireCan(ctx, "post.publish", budget);
    const { source, scope } = await owned(ctx, args.id, actor._id, budget);
    checkGeneration(source, args.expectedGeneration);
    if (source.refreshJobId) {
      budget.beforeRead();
      const previous = budget.record(await ctx.db.get("syncedBlockRefreshJobs", source.refreshJobId));
      if (belongsToSource(previous, source)) return syncedFailure("SYNCED_REFRESH_CONFLICT", "Refresh already exists. Reload its status before retrying.");
    }
    if (source.publishedRevision === undefined) return syncedFailure("SYNCED_REFRESH_UNPUBLISHED", "Publish this reusable content before refreshing linked pages.");
    if (!(await consumerDiscoveryReady(ctx, scope, budget))) return syncedFailure("SYNCED_REFRESH_INDEX", "Finish indexing existing pages before refreshing linked pages.");
    const version = await storedRevision(ctx, source._id, source.publishedRevision, budget);
    if (!version || version.publishedAt === undefined) return syncedFailure("SYNCED_REFRESH_PUBLICATION", "The published revision is unavailable. Review and publish a valid revision before refreshing linked pages.");
    await publicationReview(ctx, source, version, scope, budget);
    const jobId = await enqueueRefresh(ctx, source, scope, source.generation, "post.publish", budget);
    return { jobId, attempt: 1 };
  },
});

export const retry = mutation({
  args: { id: v.id("syncedBlocks"), jobId: jobIdValidator, expectedAttempt: v.number() },
  returns: v.object({ jobId: jobIdValidator, attempt: v.number() }),
  handler: async (ctx, args) => {
    const budget = new RequestReadLedger(), actor = await requireCan(ctx, "post.read", budget);
    const { source, scope } = await owned(ctx, args.id, actor._id, budget);
    budget.beforeRead();
    const job = budget.record(await ctx.db.get("syncedBlockRefreshJobs", args.jobId));
    if (!job || source.refreshJobId !== job._id || job.sourceId !== source._id || job.attempt !== args.expectedAttempt || job.status === "superseded" || job.websiteKey !== scope.websiteKey || job.instanceKey !== scope.instanceKey || job.deploymentOrigin !== scope.deploymentOrigin)
      return syncedFailure("SYNCED_REFRESH_CONFLICT", "Refresh changed. Reload its status before retrying.");
    if (!(await consumerDiscoveryReady(ctx, scope, budget))) return syncedFailure("SYNCED_REFRESH_INDEX", "Finish indexing existing pages before refreshing linked pages.");
    const authority = await capturePublicationAuthority(ctx, scope, job.capability, budget);
    const attempt = job.attempt + 1;
    if (!Number.isSafeInteger(attempt)) return syncedFailure("SYNCED_REFRESH_CONFLICT", "Refresh retry limit reached.");
    await ctx.db.patch("syncedBlockRefreshJobs", job._id, { authority, indexGeneration: consumerIndexGeneration()!, errorCode: undefined, attempt, afterPostId: null, processed: 0, failed: 0, status: "pending", updatedAt: Date.now() });
    await scheduleStep(ctx, { jobId: job._id, attempt, afterPostId: null });
    return { jobId: job._id, attempt };
  },
});

/** A scheduler timeout can terminate step before it records a failure. Inspect
 * the actual callback state; elapsed time alone never proves it has stopped.
 * Recovery only exposes a retryable failure. A user retry captures fresh grants. */
export const recover = internalMutation({
  args: { cursor: v.optional(v.union(v.string(), v.null())) }, returns: v.null(),
  handler: async (ctx, args) => {
    const page = await ctx.db.query("syncedBlockRefreshJobs")
      .withIndex("by_status_updated", q => q.eq("status", "pending"))
      .paginate({ cursor: args.cursor ?? null, numItems: 20 });
    for (const job of page.page) {
      const callback = job.scheduledFunctionId ? await ctx.db.system.get(job.scheduledFunctionId) : null;
      const delivery = callback?.args[0];
      const matches = callback
        && ["syncedBlocks/refresh:step", "syncedBlocks/refresh.js:step"].includes(callback.name)
        && delivery && typeof delivery === "object" && !Array.isArray(delivery)
        && "jobId" in delivery && delivery.jobId === job._id
        && "attempt" in delivery && delivery.attempt === job.attempt
        && "afterPostId" in delivery && delivery.afterPostId === job.afterPostId;
      if (matches && (callback.state.kind === "pending" || callback.state.kind === "inProgress")) continue;
      await ctx.db.patch("syncedBlockRefreshJobs", job._id, {
        status: "failed",
        errorCode: !job.scheduledFunctionId ? "SYNCED_REFRESH_RECOVERY_REQUIRED" : "SYNCED_REFRESH_CALLBACK_FAILED",
        updatedAt: Date.now(),
      });
    }
    if (!page.isDone) await ctx.scheduler.runAfter(0, recoverRef, { cursor: page.continueCursor });
    return null;
  },
});
