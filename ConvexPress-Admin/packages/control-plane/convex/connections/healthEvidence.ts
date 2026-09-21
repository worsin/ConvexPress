import { assessRuntimeCompatibility, siteHealthResponseSchema } from "@convexpress/site-contract";
import { v } from "convex/values";
const component = v.union(v.literal("healthy"), v.literal("degraded"), v.literal("unhealthy"), v.literal("unknown"));
export const healthReportValidator = v.object({
  status: v.union(v.literal("healthy"), v.literal("degraded"), v.literal("unhealthy")),
  checkedAt: v.string(), websiteKey: v.string(), instanceKey: v.string(),
  siteContractVersion: v.string(), schemaVersion: v.string(), engineVersion: v.string(),
  storageStatus: component, authStatus: component,
});
export function healthEvidence(value: unknown, target: { websiteKey: string; instanceKey: string }, now: number) {
  const report = siteHealthResponseSchema.parse(value);
  if (report.websiteKey !== target.websiteKey || report.instanceKey !== target.instanceKey) throw Error("Health target identity mismatch");
  const healthy = report.status === "healthy" && report.storageStatus === "healthy" && report.authStatus === "healthy";
  const compatibility = assessRuntimeCompatibility(report);
  return {
    health: healthy ? "ok" as const : "degraded" as const,
    lastHealthAt: now,
    lastHealthError: healthy ? undefined : "SITE_HEALTH_DEGRADED",
    siteContractVersion: report.siteContractVersion,
    schemaVersion: report.schemaVersion,
    engineVersion: report.engineVersion,
    compatibility: compatibility.compatible ? "compatible" as const : "incompatible" as const,
    lastCompatibilityAt: now,
    lastCompatibilityError: compatibility.compatible ? undefined : compatibility.issues.join(", "),
  };
}

export function connectionTargetRevision(instance: { updatedAt: number; instanceKey: string; deploymentOrigin: string; managementOrigin: string; siteOrigin: string; kind: string }, websiteKey: string) {
  return JSON.stringify([instance.updatedAt, websiteKey, instance.instanceKey, instance.deploymentOrigin, instance.managementOrigin, instance.siteOrigin, instance.kind]);
}
