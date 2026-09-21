import { ConvexError } from "convex/values";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import type { RequestReadLedger } from "../helpers/requestReadLedger";

/** Deliberately schema-independent: generic writers must not import the full
 * canonical block graph. Dirty rows are maintenance work, never auth grants. */
export async function clearSyncedConsumerDirty(ctx: Pick<MutationCtx, "db">, postId: Id<"posts">, budget?: RequestReadLedger): Promise<void> {
  budget?.beforeRead();
  const rows = await ctx.db.query("syncedBlockConsumerDirty").withIndex("by_document", q => q.eq("postId", postId)).take(8);
  for (const row of rows) { budget?.record(row); await ctx.db.delete("syncedBlockConsumerDirty", row._id); }
  // Normal writes have one unique row. Corrupt imported duplicates are removed
  // in bounded chunks; any remainder continues to prevent index readiness.
}

export async function removeSyncedConsumerDocument(ctx: Pick<MutationCtx, "db">, postId: Id<"posts">, budget?: RequestReadLedger): Promise<void> {
  budget?.beforeRead();
  const rows = await ctx.db.query("syncedBlockConsumers").withIndex("by_document", q => q.eq("postId", postId)).take(9);
  for (const row of rows) budget?.record(row);
  if (rows.length > 8) throw new ConvexError({ code: "SYNCED_CONSUMER_BUDGET", message: "Repair the reusable dependency index before deleting this document." });
  for (const row of rows) await ctx.db.delete("syncedBlockConsumers", row._id);
  await clearSyncedConsumerDirty(ctx, postId, budget);
}

export async function recordSyncedConsumerWrite(
  ctx: Pick<MutationCtx, "db">, postId: Id<"posts">,
  next: Record<string, unknown> | null, budget?: RequestReadLedger,
): Promise<void> {
  if (!next || next.blocksVersion !== 2) return removeSyncedConsumerDocument(ctx, postId, budget);
  budget?.beforeRead();
  const row = await ctx.db.query("syncedBlockConsumerDirty").withIndex("by_document", q => q.eq("postId", postId)).unique();
  budget?.record(row);
  if (!row) await ctx.db.insert("syncedBlockConsumerDirty", { postId });
}
