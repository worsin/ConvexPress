import { v } from "convex/values";
import { makeFunctionReference, type RegisteredMutation } from "convex/server";
import { internalMutation, type MutationCtx } from "../../_generated/server";
import { recoverProgressCounts } from "./countRecovery";
type Progress = { processed: number; done: boolean };
const result = v.object({ processed: v.number(), done: v.boolean() });
const stepRef = makeFunctionReference<"mutation", {generation:number}, Progress>("lms/progress/countMaintenance:step");

/** Cron and manual triggers share one actual scheduled job. Failed or canceled
 * jobs can resume; an existing pending/in-progress job is never duplicated. */
export async function queueProgressRecovery(ctx: MutationCtx): Promise<Progress> {
  const state = await ctx.db.query("lms_progress_maintenance").withIndex("by_key", q => q.eq("key", "rebuild")).unique();
  const job = state?.scheduledJobId ? await ctx.db.system.get(state.scheduledJobId) : null;
  if (job?.state.kind === "pending" || job?.state.kind === "inProgress") return {processed:0,done:false};
  const generation = (state?.generation ?? 0) + 1;
  const scheduledJobId = await ctx.scheduler.runAfter(0, stepRef, {generation});
  if (state) await ctx.db.patch("lms_progress_maintenance", state._id, {generation,scheduledJobId});
  else await ctx.db.insert("lms_progress_maintenance", {key:"rebuild",generation,scheduledJobId});
  return {processed:0,done:false};
}
export async function runProgressRecoveryStep(ctx: MutationCtx, generation: number): Promise<Progress> {
  const state = await ctx.db.query("lms_progress_maintenance").withIndex("by_key", q => q.eq("key", "rebuild")).unique();
  if (!state?.scheduledJobId || state.generation !== generation) return {processed:0,done:false};
  const progress = await recoverProgressCounts(ctx);
  const nextGeneration = generation + 1;
  const scheduledJobId = progress.processed > 0 && !progress.done
    ? await ctx.scheduler.runAfter(0, stepRef, {generation:nextGeneration}) : undefined;
  // Advancing on every step also fences duplicate callbacks after a successful
  // transaction. A stalled curriculum waits for cron instead of spinning.
  await ctx.db.patch("lms_progress_maintenance", state._id, {generation:nextGeneration,scheduledJobId});
  return progress;
}
export const rebuild: RegisteredMutation<"internal", Record<string, never>, Progress> = internalMutation({
  args: {}, returns: result, handler: queueProgressRecovery,
});
export const step: RegisteredMutation<"internal", {generation:number}, Progress> = internalMutation({
  args: {generation:v.number()}, returns: result,
  handler: (ctx:MutationCtx,args:{generation:number}) => runProgressRecoveryStep(ctx,args.generation),
});
