import { validateEditorOrigin } from "@convexpress/runtime-clients/preview-origin";
import { CloudflareApi } from "@convexpress/runtime-clients/hosting-provider";
import type { WebsiteArtifact } from "./artifact";
export type PublishCredential = { token: string; externalAccountId: string; workerName: string; artifactHash: string; instanceKey: string; siteOrigin: string; deploymentOrigin: string; clerkPublishableKey: string; editorOrigin?: string; alreadyUploaded: boolean };
export interface PublishControl {
  credential(): Promise<PublishCredential>;
  checkpoint(phase: "assets" | "worker" | "subdomain"): Promise<unknown>;
  confirm(): Promise<unknown>;
  interrupted(): Promise<unknown>;
}
export async function publishWebsite(artifact: WebsiteArtifact, releaseId: string, control: PublishControl, options: { signal: AbortSignal; progress(message: string): void; fetch?: typeof fetch }) {
  const signal = options.signal;
  const check = () => signal.throwIfAborted();
  try {
    check();
    const c = await control.credential();
    if (c.artifactHash !== artifact.hash) throw Error("Website artifact changed after release preparation");
    const transport: typeof fetch = (input, init) => (options.fetch ?? fetch)(input, { ...init, signal: AbortSignal.any([signal, AbortSignal.timeout(60_000), ...(init?.signal ? [init.signal] : [])]) });
    const provider = new CloudflareApi(c.token, c.externalAccountId, transport);
    const tags = [`convexpress-instance:${c.instanceKey}`, `convexpress-release:${releaseId}`, `convexpress-artifact:${artifact.hash}`];
    if (!c.alreadyUploaded) {
      check(); await control.checkpoint("assets"); options.progress("Preparing asset upload");
      const session = await provider.createAssetSession(c.workerName, artifact.manifest);
      let completionJwt = session.buckets.length === 0 ? session.jwt : "";
      if (session.buckets.length > 4000) throw Error("Invalid provider asset bucket count");
      for (let i = 0; i < session.buckets.length; i++) {
        check(); await control.checkpoint("assets");
        const bucket = session.buckets[i];
        if (bucket.length > 4000) throw Error("Invalid provider asset bucket size");
        const files = bucket.map(hash => {
          const file = artifact.assets.get(hash);
          if (!file) throw Error("Cloudflare requested an asset outside this release");
          return { hash, contents: file.bytes.toString("base64"), contentType: file.contentType };
        });
        const jwt = await provider.uploadAssetBucket(session.jwt, files);
        if (jwt) completionJwt = jwt;
        options.progress(`Uploaded asset group ${i + 1} of ${session.buckets.length}`);
      }
      if (!completionJwt) throw Error("Cloudflare asset completion receipt is missing");
      // Re-read ownership directly before the irreversible script replacement.
      // Account/scope and lease are checked immediately before this provider step.
      check(); await control.checkpoint("worker");
      const existing = await provider.getWorkerMetadata(c.workerName);
      if (existing && (!existing.tags.includes(tags[0]) || existing.tags.some(tag => tag.startsWith("convexpress-instance:") && tag !== tags[0]))) throw Error("The Worker is owned by another environment");
      check(); options.progress("Publishing website Worker");
      await provider.uploadWorker(c.workerName, {
        modules: [{ name: "worker.mjs", contents: artifact.worker }], assetJwt: completionJwt, tags,
        bindings: { CONVEXPRESS_CONVEX_URL: c.deploymentOrigin, CONVEXPRESS_INSTANCE_KEY: c.instanceKey, CONVEXPRESS_RELEASE_ID: releaseId, CONVEXPRESS_ARTIFACT_HASH: artifact.hash, CONVEXPRESS_SITE_URL: c.siteOrigin, CONVEXPRESS_CLERK_PUBLISHABLE_KEY: c.clerkPublishableKey, ...(c.editorOrigin ? { CONVEXPRESS_ADMIN_APP_URL: validateEditorOrigin(c.editorOrigin) } : {}) }
      });
    } else options.progress("Existing Worker release reconciled");
    check(); await control.checkpoint("subdomain");
    await provider.enableWorkerSubdomain(c.workerName);
    check(); options.progress("Verifying the published homepage and preview page");
    await control.confirm(); options.progress("Website published and public pages verified");
    return { siteOrigin: c.siteOrigin };
  } catch (error) {
    // This uses a fresh, bounded control-plane request even if provider I/O was cancelled.
    await control.interrupted().catch(() => undefined);
    throw error;
  }
}
