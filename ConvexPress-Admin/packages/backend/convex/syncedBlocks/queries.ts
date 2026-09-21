import { paginationOptsValidator, type PaginationOptions } from "convex/server";
import { v } from "convex/values";
import { query } from "../_generated/server";
import { requireCan, resolveUserRole } from "../helpers/permissions";
import { canonicalStoredTreeValidator } from "../canonicalDocuments/foundation/generated/storage";
import { content, installation, owned, storedRevision, syncedFailure } from "./model";

const id = v.id("syncedBlocks");
const pageFields = { isDone: v.boolean(), continueCursor: v.string(), splitCursor: v.optional(v.union(v.string(), v.null())), pageStatus: v.optional(v.union(v.literal("SplitRequired"), v.literal("SplitRecommended"), v.null())) };
function pageOptions(value: PaginationOptions, maxRows = 20): PaginationOptions {
  if (!Number.isInteger(value.numItems) || value.numItems < 1 || value.numItems > 20) return syncedFailure("SYNCED_PAGE_SIZE", "Request between 1 and 20 items per page.");
  return { ...value, maximumRowsRead: maxRows, maximumBytesRead: 1024 * 1024 };
}
export const list = query({
  args: { paginationOpts: paginationOptsValidator },
  returns: v.object({ ...pageFields, page: v.array(v.object({ id, title: v.string(), generation: v.number(), revision: v.number(), publishedRevision: v.union(v.number(), v.null()), updatedAt: v.number() })) }),
  handler: async (ctx, args) => {
    const actor = await requireCan(ctx, "post.read"), scope = await installation(ctx), role = await resolveUserRole(ctx, actor);
    const base = role && role.level >= 80
      ? ctx.db.query("syncedBlocks").withIndex("by_scope_updated", q => q.eq("websiteKey", scope.websiteKey).eq("instanceKey", scope.instanceKey).eq("deploymentOrigin", scope.deploymentOrigin))
      : ctx.db.query("syncedBlocks").withIndex("by_scope_author_updated", q => q.eq("websiteKey", scope.websiteKey).eq("instanceKey", scope.instanceKey).eq("deploymentOrigin", scope.deploymentOrigin).eq("createdBy", actor._id));
    const result = await base.order("desc").paginate(pageOptions(args.paginationOpts));
    return { ...result, page: result.page.map(source => ({ id: source._id, title: source.title, generation: source.generation, revision: source.lastRevision, publishedRevision: source.publishedRevision ?? null, updatedAt: source.updatedAt })) };
  },
});
export const revisions = query({
  args: { id, paginationOpts: paginationOptsValidator },
  returns: v.object({ ...pageFields, page: v.array(v.object({ revision: v.number(), title: v.string(), digest: v.string(), createdAt: v.number(), wasPublished: v.boolean(), isPublished: v.boolean() })) }),
  handler: async (ctx, args) => {
    const actor = await requireCan(ctx, "post.read"), { source } = await owned(ctx, args.id, actor._id);
    const result = await ctx.db.query("syncedBlockRevisions").withIndex("by_source_revision", q => q.eq("syncedBlockId", source._id)).order("desc").paginate(pageOptions(args.paginationOpts));
    return { ...result, page: result.page.map(version => ({ revision: version.revision, title: version.title, digest: version.digest, createdAt: version.createdAt, wasPublished: version.publishedAt !== undefined, isPublished: source.publishedRevision === version.revision })) };
  },
});
export const revision = query({
  args: { id, revision: v.number() },
  returns: v.union(v.object({ state: v.literal("ready"), id, generation: v.number(), revision: v.number(), title: v.string(), blocks: canonicalStoredTreeValidator, digest: v.string(), wasPublished: v.boolean(), isPublished: v.boolean() }), v.object({ state: v.literal("unavailable"), id, generation: v.number(), revision: v.number() })),
  handler: async (ctx, args) => {
    const actor = await requireCan(ctx, "post.read"), { source } = await owned(ctx, args.id, actor._id);
    if (!Number.isInteger(args.revision) || args.revision < 1 || args.revision > source.lastRevision) return syncedFailure("SYNCED_REVISION", "Select an existing synced content revision.");
    const version = await storedRevision(ctx, source._id, args.revision);
    const unavailable = { state: "unavailable" as const, id: source._id, generation: source.generation, revision: args.revision };
    if (!version) return unavailable;
    try {
      const value = content(version.title, version.blocks);
      if (value.digest !== version.digest) return unavailable;
      return { state: "ready" as const, id: source._id, generation: source.generation, revision: version.revision, ...value, wasPublished: version.publishedAt !== undefined, isPublished: source.publishedRevision === version.revision };
    } catch { return unavailable; }
  },
});
/** Keep recovery navigation usable even when the current body is damaged. */
export const head = query({
  args: { id }, returns: v.object({ id, title: v.string(), generation: v.number(), revision: v.number(), publishedRevision: v.union(v.number(), v.null()) }),
  handler: async (ctx, args) => {
    const actor = await requireCan(ctx, "post.read"), { source } = await owned(ctx, args.id, actor._id);
    return { id: source._id, title: source.title, generation: source.generation, revision: source.lastRevision, publishedRevision: source.publishedRevision ?? null };
  },
});
/** Reuse is available to authors, but only explicitly published revisions are
 * offered. A draft title is never substituted for the live revision's title. */
export const publishedOptions = query({
  args: { paginationOpts: paginationOptsValidator },
  returns: v.object({ ...pageFields, page: v.array(v.object({ id, title: v.string(), revision: v.number(), digest: v.string() })) }),
  handler: async (ctx, args) => {
    await requireCan(ctx, "post.read");
    const scope = await installation(ctx);
    // Each head requires one body-bearing revision lookup. Limit the heads as
    // well as the indexed pagination bytes to bound those additional reads.
    const result = await ctx.db.query("syncedBlocks").withIndex("by_scope_published", q => q.eq("websiteKey", scope.websiteKey).eq("instanceKey", scope.instanceKey).eq("deploymentOrigin", scope.deploymentOrigin).gt("publishedRevision", 0)).order("desc").paginate({ ...pageOptions(args.paginationOpts, 8), numItems: Math.min(args.paginationOpts.numItems, 8) });
    const page = [];
    for (const source of result.page) {
      if (source.publishedRevision === undefined) continue;
      const version = await storedRevision(ctx, source._id, source.publishedRevision);
      if (!version || version.publishedAt === undefined) continue;
      page.push({ id: source._id, title: version.title, revision: version.revision, digest: version.digest });
    }
    return { ...result, page };
  },
});
