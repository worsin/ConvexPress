import { v } from "convex/values";
import { makeFunctionReference, type RegisteredMutation } from "convex/server";
import { internalMutation, type MutationCtx } from "../_generated/server";
import { rebuildCourseCatalog } from "./courseCatalogRecovery";

type Progress = { processed: number; done: boolean };
export const rebuild: RegisteredMutation<"internal", Record<string, never>, Progress> = internalMutation({
  args: {},
  returns: v.object({ processed: v.number(), done: v.boolean() }),
  handler: async (ctx: MutationCtx): Promise<Progress> => {
    const progress = await rebuildCourseCatalog(ctx);
    if (!progress.done) await ctx.scheduler.runAfter(0,
      makeFunctionReference<"mutation">("lms/courseCatalogMaintenance:rebuild"), {});
    return progress;
  },
});
