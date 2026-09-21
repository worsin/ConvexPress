"use node";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import { internalAction } from "../_generated/server";
import { probeTargetIdentity } from "../connections/healthProbe";
import { healthEvidence } from "../connections/healthEvidence";
export async function probeIdentity(target: { managementOrigin: string; websiteKey: string; instanceKey: string }, fetchImpl: typeof fetch = fetch): Promise<boolean> {
  try { return healthEvidence(await probeTargetIdentity(target, fetchImpl), target, Date.now()).health === "ok"; }
  catch { return false; }
}

export const probe = internalAction({
  args: { policyId: v.id("overseer_fleetPolicies"), lease: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const target = await ctx.runQuery(internal.fleet.jobs.healthTarget, args);
    if (!target) return null;
    const start = Date.now();
    let report;
    try { report = await probeTargetIdentity(target); } catch { /* Persist a fenced unreachable observation. */ }
    await ctx.runMutation(internal.fleet.jobs.healthResult, {
      ...args,
      targetRevision: target.targetRevision,
      report,
      latencyMs: Date.now() - start,
    });
    return null;
  },
});
