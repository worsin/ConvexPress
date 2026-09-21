"use node";
import { VercelApi, ProviderApiError, type VercelDeployment, type VercelProject } from "./providerApi";
import { vercelArtifactHash, type VercelArtifactFile } from "@convexpress/runtime-clients/vercel-artifact";
import { probeWebsiteRuntime, type RuntimeVerification } from "./websiteRuntimeVerification";
import { createPublicWebsiteFetch } from "./publicWebsiteFetch";

export interface VercelReleaseTarget {
  externalAccountId: string; projectName: string; hostingTarget: string; projectDispatched: boolean; projectId?: string;
  deploymentDispatched: boolean; deploymentId?: string; artifactHash: string; deploymentOrigin: string; siteOrigin: string; instanceKey: string; clerkPublishableKey: string; editorOrigin?: string;
}
export interface VercelReleaseControl {
  authorize(): Promise<VercelReleaseTarget>;
  dispatch(step: "project" | "deployment"): Promise<boolean>;
  projectConfirmed(projectId: string, hostingTarget: string): Promise<unknown>;
  deploymentConfirmed(deploymentId: string): Promise<unknown>;
  rejected(step: "project" | "deployment"): Promise<unknown>;
  failed(deploymentId: string): Promise<unknown>;
  complete(verification: RuntimeVerification): Promise<unknown>;
}
export function assertVercelProject(p: VercelProject, t: VercelReleaseTarget) {
  if (p.accountId !== t.externalAccountId || p.name !== t.projectName || p.hostingTarget !== t.hostingTarget || (t.projectId && p.id !== t.projectId))
    throw Error("This Vercel project does not belong to this website environment");
}
export function assertVercelDeployment(d: VercelDeployment, t: VercelReleaseTarget, releaseId: string) {
  if (!t.projectId || d.projectId !== t.projectId || (t.deploymentId && d.id !== t.deploymentId) || d.receiptId !== releaseId ||
    d.artifactHash !== t.artifactHash || d.instanceKey !== t.instanceKey || d.target !== "production")
    throw Error("Vercel deployment does not match this release and environment");
}
/** A provider-created alias is required even when DNS for the registered domain
 * resolves elsewhere. Never turn a stored arbitrary URL into a server-side probe. */
export function assertVercelAlias(d: VercelDeployment, t: VercelReleaseTarget) {
  const url = new URL(t.siteOrigin);
  if (url.protocol !== "https:" || url.port || url.origin !== t.siteOrigin || !d.aliasAssigned || !d.aliases.includes(url.hostname))
    throw Error("The registered website address is not assigned to this Vercel deployment yet");
}
export async function ensureVercelProject(control: VercelReleaseControl, provider: VercelApi): Promise<VercelProject> {
  const t = await control.authorize();
  let project = t.projectId ? await provider.getProject(t.projectId, t.externalAccountId) : await provider.findProject(t.projectName, t.externalAccountId);
  if (!project) {
    if (t.projectDispatched) throw Error("Vercel project creation is unconfirmed; resume later to reconcile without creating another project");
    await control.authorize();
    if (!await control.dispatch("project")) throw Error("Vercel project creation is already being reconciled");
    let created: VercelProject;
    try { created = await provider.createProject({ name: t.projectName, accountId: t.externalAccountId, hostingTarget: t.hostingTarget }); }
    catch (error) {
      if (error instanceof ProviderApiError && !error.uncertain) await control.rejected("project");
      throw error;
    }
    // An HTTP success alone does not confirm that the marker survived creation.
    project = await provider.getProject(created.id, t.externalAccountId);
  }
  assertVercelProject(project, t);
  const current = await control.authorize();
  assertVercelProject(project, current);
  if (!current.projectDispatched) throw Error("Existing Vercel project was not created by this release");
  await control.projectConfirmed(project.id, t.hostingTarget);
  return project;
}
export async function submitVercelRelease(control: VercelReleaseControl, provider: VercelApi, releaseId: string, files: VercelArtifactFile[]) {
  let t = await control.authorize();
  if (vercelArtifactHash(files) !== t.artifactHash) throw Error("Vercel artifact changed after release preparation");
  if (!t.projectId) throw Error("Confirm the Vercel project before uploading");
  assertVercelProject(await provider.getProject(t.projectId, t.externalAccountId), t);
  let deployment = t.deploymentId ? await provider.getDeployment(t.deploymentId, t.externalAccountId, t.projectId)
    : t.deploymentDispatched ? await provider.findDeploymentByReceipt(t.projectId, t.externalAccountId, releaseId) : null;
  if (!deployment) {
    if (t.deploymentDispatched) throw Error("Vercel deployment creation is unconfirmed; resume later without submitting a duplicate");
    t = await control.authorize();
    if (!await control.dispatch("deployment")) throw Error("Vercel deployment creation is already being reconciled");
    try {
      const created = await provider.createDeployment({ accountId: t.externalAccountId, projectId: t.projectId!, receiptId: releaseId,
        environment: "production", files: files.map(({ file, sha, size }) => ({ file, sha, size })),
        env: { CONVEXPRESS_CONVEX_URL: t.deploymentOrigin, CONVEXPRESS_CONVEX_SITE_URL: t.deploymentOrigin.replace(/\.convex\.cloud$/, ".convex.site"),
          CONVEXPRESS_INSTANCE_KEY: t.instanceKey, CONVEXPRESS_SITE_URL: t.siteOrigin, CONVEXPRESS_CLERK_PUBLISHABLE_KEY: t.clerkPublishableKey,
          CONVEXPRESS_RELEASE_ID: releaseId, CONVEXPRESS_ARTIFACT_HASH: t.artifactHash, ...(t.editorOrigin ? { CONVEXPRESS_ADMIN_APP_URL: t.editorOrigin } : {}) } });
      // Keep readback outside the definitive-write-rejection catch below.
      deployment = created;
    } catch (error) {
      if (error instanceof ProviderApiError && !error.uncertain) await control.rejected("deployment");
      throw error;
    }
    deployment = await provider.getDeployment(deployment.id, t.externalAccountId, t.projectId!);
  }
  t = await control.authorize(); assertVercelDeployment(deployment, t, releaseId);
  if (!t.deploymentDispatched) throw Error("Vercel deployment was not dispatched by this release");
  await control.deploymentConfirmed(deployment.id);
  return { deploymentId: deployment.id };
}
export async function pollVercelRelease(control: VercelReleaseControl, provider: VercelApi, releaseId: string,
  probe: typeof probeWebsiteRuntime = probeWebsiteRuntime): Promise<{ ready: boolean; phase: string; siteOrigin: string }> {
  const t = await control.authorize();
  if (!t.projectId || !t.deploymentId) throw Error("Resume submission to reconcile the Vercel deployment");
  assertVercelProject(await provider.getProject(t.projectId, t.externalAccountId), t);
  const d = await provider.getDeployment(t.deploymentId, t.externalAccountId, t.projectId);
  assertVercelDeployment(d, t, releaseId);
  if (["ERROR", "CANCELED"].includes(d.readyState)) {
    await control.failed(d.id); throw Error("Vercel deployment failed; publish a corrected release");
  }
  if (d.readyState !== "READY" || !d.aliasAssigned) return { ready: false, phase: "Waiting for Vercel deployment and domain assignment", siteOrigin: t.siteOrigin };
  assertVercelAlias(d, t);
  const domain = await provider.getProjectDomain(t.projectId, t.externalAccountId, new URL(t.siteOrigin).hostname);
  if (!domain?.verified || domain.projectId !== t.projectId) return { ready: false, phase: "Verify the website domain in Vercel, then resume publishing", siteOrigin: t.siteOrigin };
  await control.authorize();
  const verification = await probe({ releaseId, instanceKey: t.instanceKey, artifactHash: t.artifactHash, siteOrigin: t.siteOrigin }, { fetch: createPublicWebsiteFetch(t.siteOrigin) });
  const latest = await provider.getDeployment(t.deploymentId, t.externalAccountId, t.projectId);
  assertVercelDeployment(latest, t, releaseId); assertVercelAlias(latest, t);
  if (["ERROR", "CANCELED"].includes(latest.readyState)) {
    await control.failed(latest.id); throw Error("Vercel deployment failed during verification");
  }
  if (latest.readyState !== "READY") return { ready: false, phase: "Vercel deployment changed during verification; checking again", siteOrigin: t.siteOrigin };
  assertVercelProject(await provider.getProject(t.projectId, t.externalAccountId), t);
  const currentDomain = await provider.getProjectDomain(t.projectId, t.externalAccountId, new URL(t.siteOrigin).hostname);
  if (!currentDomain?.verified || currentDomain.projectId !== t.projectId) return { ready: false, phase: "Domain verification changed; verify the domain and resume", siteOrigin: t.siteOrigin };
  await control.authorize();
  await control.complete(verification);
  if (verification.result !== "verified") throw Error("Vercel is ready, but the actual public pages failed verification");
  return { ready: true, phase: "Published; public pages verified", siteOrigin: t.siteOrigin };
}
