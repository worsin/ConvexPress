import { internal } from "../_generated/api";

type SchedulerCtx = {
  scheduler: {
    runAfter: (
      delayMs: number,
      reference: any,
      args: Record<string, unknown>,
    ) => Promise<unknown>;
  };
};

export async function scheduleOperatorSessionRevocation(
  ctx: SchedulerCtx,
  controllerSubjectId: string,
) {
  await ctx.scheduler.runAfter(
    0,
    (internal as any).siteBroker.revocation.propagate,
    { scope: "operator", controllerSubjectId, attempt: 0 },
  );
}

export async function scheduleControllerSessionRevocation(ctx: SchedulerCtx) {
  await ctx.scheduler.runAfter(
    0,
    (internal as any).siteBroker.revocation.propagate,
    { scope: "controller", attempt: 0 },
  );
}
