import { VercelApi } from "@convexpress/runtime-clients/hosting-provider";
import type { VercelArtifactFile } from "@convexpress/runtime-clients/vercel-artifact";
import type { VercelArtifact } from "./vercelArtifact";
export type VercelUploadCredential = { token: string; externalAccountId: string; projectId: string; artifactHash: string; deploymentDispatched: boolean };
export interface VercelPublishControl {
  credential(): Promise<VercelUploadCredential>;
  heartbeat(): Promise<unknown>;
  submit(files: VercelArtifactFile[]): Promise<{ deploymentId: string }>;
  poll(): Promise<{ ready: boolean; phase: string; siteOrigin: string }>;
  receipt(): Promise<{ state: string; siteOrigin: string; artifactHash: string }>;
  interrupted(): Promise<unknown>;
}
function pause(signal: AbortSignal, ms: number) {
  return new Promise<void>((resolve, reject) => {
    signal.throwIfAborted();
    const abort = () => { clearTimeout(timer); reject(signal.reason); };
    const timer = setTimeout(() => { signal.removeEventListener("abort", abort); resolve(); }, ms);
    signal.addEventListener("abort", abort, { once: true });
  });
}
export async function publishVercelWebsite(artifact: VercelArtifact, control: VercelPublishControl,
  options: { signal: AbortSignal; progress(message: string): void; fetch?: typeof fetch; pollIntervalMs?: number }) {
  const signal = options.signal, check = () => signal.throwIfAborted();
  try {
    check(); options.progress("Preparing the website’s Vercel project");
    const c = await control.credential();
    if (c.artifactHash !== artifact.hash) throw Error("Vercel artifact changed after release preparation");
    const transport: typeof fetch = (input, init) => (options.fetch ?? fetch)(input, { ...init, signal: AbortSignal.any([signal, AbortSignal.timeout(60_000), ...(init?.signal ? [init.signal] : [])]) });
    const provider = new VercelApi(c.token, c.externalAccountId.startsWith("team_") ? c.externalAccountId : undefined, transport);
    if (!c.deploymentDispatched) {
      const uploaded = new Set<string>();
      for (const file of artifact.files) {
        check(); await control.heartbeat(); check();
        const bytes = artifact.contents.get(file.file);
        if (!bytes) throw Error("Vercel artifact file is unavailable");
        if (!uploaded.has(file.sha)) {
          const receipt = await provider.uploadFile({ accountId: c.externalAccountId, path: file.file, bytes });
          if (receipt.sha !== file.sha || receipt.size !== file.size) throw Error("Vercel upload digest mismatch");
          uploaded.add(file.sha);
        }
        options.progress(`Uploaded ${uploaded.size} unique website files`);
      }
    } else options.progress("Reconciling the existing Vercel deployment");
    check(); await control.heartbeat(); check();
    await control.submit(artifact.files);
    for (;;) {
      check(); await control.heartbeat(); check();
      const state = await control.poll(); options.progress(state.phase);
      if (state.ready) return { siteOrigin: state.siteOrigin };
      await pause(signal, options.pollIntervalMs ?? 2000);
    }
  } catch (error) {
    // Completion may have committed even when its final action response was
    // lost. Read the known receipt before presenting a failed retry/new release.
    const receipt = await control.receipt().catch(() => null);
    if (receipt?.state === "succeeded" && receipt.artifactHash === artifact.hash) {
      options.progress("Website published and public pages verified"); return { siteOrigin: receipt.siteOrigin };
    }
    await control.interrupted().catch(() => undefined);
    throw error;
  }
}
