import { ConvexError } from "convex/values";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import type { RequestReadLedger } from "../helpers/requestReadLedger";
import { SYNCED_CONTENT_LIMITS, type SyncedScope } from "../canonicalDocuments/foundation/syncedContent";
import { clearSyncedConsumerDirty } from "./consumerWrites";

/** Discovery metadata only. The caller has authorized the document write and
 * resolved these sources in its current installation. Edges cannot authorize
 * a background worker to edit a page or create/update its Forms projections. */
export async function reconcileSyncedConsumers(
  ctx: Pick<MutationCtx, "db">,
  postId: Id<"posts">,
  scope: SyncedScope | null,
  sourceIds: ReadonlySet<Id<"syncedBlocks">>,
  budget: RequestReadLedger,
  verifyOnly = false,
): Promise<void> {
  if (sourceIds.size > SYNCED_CONTENT_LIMITS.reads || (sourceIds.size && !scope)) {
    throw new ConvexError({ code: "SYNCED_CONSUMER_BUDGET", message: "Reusable dependencies exceed the supported document budget." });
  }
  budget.beforeRead();
  const previous = await ctx.db.query("syncedBlockConsumers").withIndex("by_document", q => q.eq("postId", postId)).take(SYNCED_CONTENT_LIMITS.reads + 1);
  for (const row of previous) budget.record(row);
  if (previous.length > SYNCED_CONTENT_LIMITS.reads) {
    throw new ConvexError({ code: "SYNCED_CONSUMER_BUDGET", message: "Saved reusable dependencies exceed the supported document budget. Repair the dependency index before saving." });
  }
  const retained = new Set<Id<"syncedBlocks">>();
  const removed: Id<"syncedBlockConsumers">[] = [];
  for (const row of previous) {
    if (scope && sourceIds.has(row.sourceId) && !retained.has(row.sourceId)
      && row.websiteKey === scope.websiteKey && row.instanceKey === scope.instanceKey && row.deploymentOrigin === scope.deploymentOrigin) retained.add(row.sourceId);
    else removed.push(row._id);
  }
  const added = [...sourceIds].filter(id => !retained.has(id));
  if (verifyOnly && (removed.length || added.length)) {
    throw new ConvexError({ code: "SYNCED_CONSUMERS_REQUIRES_SAVE", message: "Save this document again before scheduled publication to refresh its reusable dependencies." });
  }
  for (const id of removed) await ctx.db.delete("syncedBlockConsumers", id);
  for (const sourceId of added) await ctx.db.insert("syncedBlockConsumers", { postId, sourceId, ...scope! });
  if (!verifyOnly) await clearSyncedConsumerDirty(ctx, postId, budget);
}
