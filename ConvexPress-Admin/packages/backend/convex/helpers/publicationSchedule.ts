import { ConvexError } from "convex/values";
import { insertWithMediaReferences, patchWithMediaReferences, deleteWithMediaReferences } from "../media/attachmentGuard";
import { makeFunctionReference } from "convex/server";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import type { RequestReadLedger } from "./requestReadLedger";

const publishScheduled = makeFunctionReference<"mutation", { postId: Id<"posts">; expectedScheduledAt?: number }>("posts/internals:publishScheduled");
async function previousSchedule(ctx: MutationCtx, postId: Id<"posts">, budget?: RequestReadLedger): Promise<Doc<"postMeta"> | null> {
  budget?.beforeRead();
  const previous = await ctx.db.query("postMeta").withIndex("by_post_key", q => q.eq("postId", postId).eq("key", "_scheduled_fn")).unique();
  budget?.record(previous);
  if (previous) {
    let previousId: Id<"_scheduled_functions"> | null = null;
    try {
      const saved: unknown = JSON.parse(previous.value);
      if (saved && typeof saved === "object" && "functionId" in saved && typeof saved.functionId === "string") previousId = ctx.db.system.normalizeId("_scheduled_functions", saved.functionId);
    } catch { /* Malformed old metadata cannot identify a job; deadline guards remain authoritative. */ }
    if (previousId) {
      budget?.beforeRead();
      const job = await ctx.db.system.get(previousId);
      budget?.record(job);
      if (job?.state.kind === "pending") await ctx.scheduler.cancel(previousId);
    }
  }
  return previous;
}
export async function clearPublicationSchedule(ctx: MutationCtx, postId: Id<"posts">, budget?: RequestReadLedger): Promise<void> {
  const previous = await previousSchedule(ctx, postId, budget);
  if (previous) await deleteWithMediaReferences(ctx, "postMeta", previous._id, budget);
}
export async function replacePublicationSchedule(ctx: MutationCtx, postId: Id<"posts">, scheduledAt: number, budget?: RequestReadLedger): Promise<Id<"_scheduled_functions">> {
  if (!Number.isFinite(scheduledAt) || scheduledAt <= Date.now()) throw new ConvexError({ code: "VALIDATION_ERROR", message: "Scheduled date must be in the future" });
  const previous = await previousSchedule(ctx, postId, budget);
  const functionId = await ctx.scheduler.runAt(scheduledAt, publishScheduled, { postId, expectedScheduledAt: scheduledAt });
  const value = JSON.stringify({ functionId, scheduledAt });
  if (previous) await patchWithMediaReferences(ctx, "postMeta", previous._id, { value }, undefined, budget);
  else await insertWithMediaReferences(ctx, "postMeta", { postId, key: "_scheduled_fn", value }, undefined, budget);
  return functionId;
}
