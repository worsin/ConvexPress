import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";

type SchedulerCtx = {
  scheduler: {
    runAfter: (delayMs: number, reference: any, args: Record<string, unknown>) => Promise<unknown>;
  };
};

export async function scheduleOperatorSessionRevocation(
  ctx: SchedulerCtx,
  controllerSubjectId: string,
) {
  await ctx.scheduler.runAfter(0, (internal as any).siteBroker.revocation.propagate, {
    scope: "operator",
    controllerSubjectId,
    attempt: 0,
  });
}

export async function scheduleControllerSessionRevocation(ctx: SchedulerCtx) {
  await ctx.scheduler.runAfter(0, (internal as any).siteBroker.revocation.propagate, {
    scope: "controller",
    attempt: 0,
  });
}

export async function scheduleHierarchySessionRevocation(
  ctx: SchedulerCtx,
  target: {
    targetOrganizationId?: Id<"overseer_organizations">;
    targetBusinessId?: Id<"overseer_businesses">;
    targetWebsiteId?: Id<"overseer_websites">;
  },
) {
  await ctx.scheduler.runAfter(0, (internal as any).siteBroker.revocation.propagate, {
    scope: "controller",
    attempt: 0,
    ...target,
  });
}
