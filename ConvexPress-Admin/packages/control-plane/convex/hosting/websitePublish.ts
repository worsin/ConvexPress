"use node";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import { operatorAction } from "../rbac/functions";
import { releaseLease } from "./websiteReleases";
import { getCloudflareToken } from "./cloudflareOAuth";
import { CloudflareApi } from "./providerApi";
import { assertProbeOrigin, probeWebsiteRuntime } from "./websiteRuntimeVerification";

export function releaseTags(instanceKey: string, releaseId: string, artifactHash: string) {
  return [`convexpress-instance:${instanceKey}`, `convexpress-release:${releaseId}`, `convexpress-artifact:${artifactHash}`];
}
export function assertWorkerOwnership(metadata: { tags: string[] } | null, instanceKey: string) {
  if (metadata && (!metadata.tags.includes(`convexpress-instance:${instanceKey}`) || metadata.tags.some(t => t.startsWith("convexpress-instance:") && t !== `convexpress-instance:${instanceKey}`)))
    throw Error("This Worker belongs to another deployment. Choose an unused Worker name; no existing script was overwritten.");
}
export function assertPublishedRuntime(metadata: { runtimeBindings: Record<string, string> }, target: { deploymentOrigin: string; instanceKey: string; siteOrigin: string; clerkPublishableKey: string; editorOrigin?: string; releaseId: string; artifactHash: string }) {
  const values = metadata.runtimeBindings;
  if (target.editorOrigin && values.CONVEXPRESS_ADMIN_APP_URL !== target.editorOrigin) throw Error("Published Worker editor origin no longer matches this release");
  if (values.CONVEXPRESS_RELEASE_ID !== target.releaseId || values.CONVEXPRESS_ARTIFACT_HASH !== target.artifactHash) throw Error("Published Worker runtime no longer matches this release");
  if (values.CONVEXPRESS_CONVEX_URL !== target.deploymentOrigin || values.CONVEXPRESS_INSTANCE_KEY !== target.instanceKey || values.CONVEXPRESS_SITE_URL !== target.siteOrigin || (values.CONVEXPRESS_CLERK_PUBLISHABLE_KEY ?? "") !== target.clerkPublishableKey)
    throw Error("Published Worker runtime no longer matches this website environment");
}
const result = v.object({ token: v.string(), externalAccountId: v.string(), workerName: v.string(), artifactHash: v.string(), instanceKey: v.string(), siteOrigin: v.string(), deploymentOrigin: v.string(), clerkPublishableKey: v.string(), editorOrigin: v.string(), alreadyUploaded: v.boolean() });
/** Only an authenticated agency custodian with current target permissions can
 * release the provider credential. Desktop main consumes it, never the renderer. */
export const credential = operatorAction({
  args: releaseLease, returns: result,
  handler: async (ctx, args): Promise<{ token: string; externalAccountId: string; workerName: string; artifactHash: string; instanceKey: string; siteOrigin: string; deploymentOrigin: string; clerkPublishableKey: string; editorOrigin: string; alreadyUploaded: boolean }> => {
    const t = await ctx.runQuery(internal.hosting.websiteReleases.prepare, args);
    const payload = await getCloudflareToken(ctx, t.accountId);
    const provider = new CloudflareApi(payload.token, t.externalAccountId);
    await provider.verifyIdentity();
    const subdomain = await provider.subdomain();
    assertProbeOrigin(t.siteOrigin, t.workerName, subdomain);
    const metadata = await provider.getWorkerMetadata(t.workerName);
    assertWorkerOwnership(metadata, t.instanceKey);
    const tags = releaseTags(t.instanceKey, args.releaseId, t.artifactHash);
    const alreadyUploaded = !!metadata && tags.every(tag => metadata.tags.includes(tag));
    if (alreadyUploaded && metadata) assertPublishedRuntime(metadata, { ...t, releaseId: args.releaseId });
    // Provider I/O must not bypass a concurrent revoke, move, or lease expiry.
    const current = await ctx.runQuery(internal.hosting.websiteReleases.prepare, args);
    if (current.credentialGeneration !== payload.generation) throw Error("Cloudflare credential changed during publication; retry safely");
    return { token: payload.token, externalAccountId: t.externalAccountId, workerName: t.workerName, artifactHash: t.artifactHash, instanceKey: t.instanceKey, siteOrigin: t.siteOrigin, deploymentOrigin: t.deploymentOrigin, clerkPublishableKey: t.clerkPublishableKey, editorOrigin: t.editorOrigin, alreadyUploaded };
  },
});
export const confirm = operatorAction({
  args: releaseLease, returns: v.null(), handler: async (ctx, args): Promise<null> => {
    const t = await ctx.runQuery(internal.hosting.websiteReleases.prepare, args);
    const payload = await getCloudflareToken(ctx, t.accountId);
    const provider = new CloudflareApi(payload.token, t.externalAccountId);
    await provider.verifyIdentity();
    const metadata = await provider.getWorkerMetadata(t.workerName);
    assertWorkerOwnership(metadata, t.instanceKey);
    if (!metadata || !releaseTags(t.instanceKey, args.releaseId, t.artifactHash).every(tag => metadata.tags.includes(tag))) throw Error("Cloudflare has not confirmed this release; reconcile before retrying");
    assertPublishedRuntime(metadata, { ...t, releaseId: args.releaseId });
    if (!(await provider.getWorkerSubdomain(t.workerName)).enabled) throw Error("Worker address is not enabled yet");
    assertProbeOrigin(t.siteOrigin, t.workerName, await provider.subdomain());
    const verification = await probeWebsiteRuntime({ releaseId: args.releaseId, instanceKey: t.instanceKey, artifactHash: t.artifactHash, siteOrigin: t.siteOrigin });
    // Detect external replacement while the real pages were being rendered.
    const latest = await provider.getWorkerMetadata(t.workerName);
    assertWorkerOwnership(latest, t.instanceKey);
    if (!latest || !releaseTags(t.instanceKey, args.releaseId, t.artifactHash).every(tag => latest.tags.includes(tag))) throw Error("Worker changed during runtime verification");
    assertPublishedRuntime(latest, { ...t, releaseId: args.releaseId });
    const current = await ctx.runQuery(internal.hosting.websiteReleases.prepare, args);
    if (current.credentialGeneration !== payload.generation) throw Error("Cloudflare credential changed during publication; reconcile this release");
    await ctx.runMutation(internal.hosting.websiteReleases.complete, { ...args, verification });
    if (verification.result !== "verified") throw Error("Website upload completed, but public pages failed runtime verification. Retry this release or publish a corrected artifact.");
    return null;
  },
});
