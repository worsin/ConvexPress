import { v } from "convex/values";
import { makeFunctionReference, type RegisteredMutation } from "convex/server";
import { internalMutation, type MutationCtx } from "../_generated/server";
import { rebuildCurriculumCounts } from "./curriculumCountRecovery";

type Progress = { processed: number; done: boolean };
export const rebuild: RegisteredMutation<"internal", Record<string, never>, Progress> = internalMutation({
  args: {},
  returns: v.object({ processed: v.number(), done: v.boolean() }),
  handler: async (ctx: MutationCtx): Promise<Progress> => {
    const progress = await rebuildCurriculumCounts(ctx);
    if (!progress.done) await ctx.scheduler.runAfter(0,
      makeFunctionReference<"mutation">("lms/curriculumCountMaintenance:rebuild"), {});
    return progress;
  },
});
