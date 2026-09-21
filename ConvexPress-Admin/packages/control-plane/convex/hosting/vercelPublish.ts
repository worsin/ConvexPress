"use node";
import { v, type Infer } from "convex/values";
import { internal } from "../_generated/api";
import type { ActionCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { operatorAction } from "../rbac/functions";
import { decryptCredentialPayload, parseEnvelopeKey } from "../connections/crypto";
import { hostingCredentialAad } from "./policy";
import { VercelApi } from "./providerApi";
import { vercelLease } from "./vercelReleases";
import { ensureVercelProject, submitVercelRelease, pollVercelRelease, type VercelReleaseControl } from "./vercelPublishService";

type Lease = { releaseId: Id<"overseer_vercelHostingReleases">; leaseToken: string };
async function connection(ctx: ActionCtx, args: Lease) {
  const t = await ctx.runQuery(internal.hosting.vercelReleases.prepare, args);
  const payload = decryptCredentialPayload({ envelope: t.credentials, key: parseEnvelopeKey(process.env.CONVEXPRESS_CONNECTION_ENVELOPE_KEYS, t.credentials.version),
    aad: hostingCredentialAad({ organizationId: t.organizationId, businessId: t.businessId, provider: "vercel", externalAccountId: t.externalAccountId }) });
  if (typeof payload.token !== "string" || !payload.token.trim()) throw Error("Vercel account credentials are unavailable");
  const provider = new VercelApi(payload.token, t.externalAccountId.startsWith("team_") ? t.externalAccountId : undefined);
  const control: VercelReleaseControl = {
    authorize: async () => {
      const latest = await ctx.runQuery(internal.hosting.vercelReleases.prepare, args);
      if (latest.credentialGeneration !== t.credentialGeneration || latest.credentials.encrypted !== t.credentials.encrypted) throw Error("Vercel credential changed; resume this release");
      return latest;
    },
    dispatch: step => ctx.runMutation(internal.hosting.vercelReleases.dispatch, { ...args, step }),
    projectConfirmed: (projectId, hostingTarget) => ctx.runMutation(internal.hosting.vercelReleases.recordProject, { ...args, projectId, hostingTarget }),
    deploymentConfirmed: deploymentId => ctx.runMutation(internal.hosting.vercelReleases.recordDeployment, { ...args, deploymentId }),
    rejected: step => ctx.runMutation(internal.hosting.vercelReleases.providerRejected, { ...args, step }),
    failed: deploymentId => ctx.runMutation(internal.hosting.vercelReleases.deploymentFailed, { ...args, deploymentId }),
    complete: verification => ctx.runMutation(internal.hosting.vercelReleases.complete, { ...args, verification }),
  };
  return { provider, control, token: payload.token };
}
const uploadCredential = v.object({ token: v.string(), externalAccountId: v.string(), projectId: v.string(), artifactHash: v.string(), deploymentDispatched: v.boolean() });
/** Desktop main only: ensure the durable project, then release an upload token to
 * the already-authorized agency custodian. The renderer receives no token. */
export const credential = operatorAction({
  args: vercelLease, returns: uploadCredential,
  handler: async (ctx, args): Promise<Infer<typeof uploadCredential>> => {
    const c = await connection(ctx, args);
    const project = await ensureVercelProject(c.control, c.provider);
    const t = await c.control.authorize();
    return { token: c.token, externalAccountId: t.externalAccountId, projectId: project.id, artifactHash: t.artifactHash, deploymentDispatched: t.deploymentDispatched };
  },
});
export const submit = operatorAction({
  args: { ...vercelLease, files: v.array(v.object({ file: v.string(), sha: v.string(), sha256: v.string(), size: v.number() })) }, returns: v.object({ deploymentId: v.string() }),
  handler: async (ctx, args): Promise<{ deploymentId: string }> => {
    const c = await connection(ctx, args);
    return submitVercelRelease(c.control, c.provider, String(args.releaseId), args.files);
  },
});
export const poll = operatorAction({
  args: vercelLease, returns: v.object({ ready: v.boolean(), phase: v.string(), siteOrigin: v.string() }),
  handler: async (ctx, args): Promise<{ ready: boolean; phase: string; siteOrigin: string }> => {
    const c = await connection(ctx, args);
    return pollVercelRelease(c.control, c.provider, String(args.releaseId));
  },
});
