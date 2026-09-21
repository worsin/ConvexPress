import { PACKAGED_EDITOR_ORIGIN, validateEditorOrigin } from "@convexpress/runtime-clients/preview-origin";
import { mapConfiguredDeploymentOrigin } from "./deploymentOriginMapping";
import path from "node:path";
import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
import { JsonStore } from "../utils/json-store";
import { isDev } from "../utils/platform";
import { isAppRendererSender, isDevAppRendererSender } from "./setupSender";
import { loadWebsiteArtifact } from "../hosting/artifact";
import { publishWebsite, type PublishCredential } from "../hosting/publish";
import { loadVercelArtifact, type VercelArtifact } from "../hosting/vercelArtifact";
import { publishVercelWebsite, type VercelUploadCredential } from "../hosting/vercelPublish";
import type { WebsiteArtifact } from "../hosting/artifact";
const { app, ipcMain } = require("electron") as typeof import("electron");
const config = new JsonStore({ name: "convexpress-config" });
const running = new Map<string, { senderId: number; controller: AbortController }>();
function sender(event: Electron.IpcMainInvokeEvent) {
  if (!(isDev() ? isDevAppRendererSender(event.sender.getURL()) : isAppRendererSender(event.sender.getURL(), { rendererIndexPath: path.join(__dirname, "..", "dist", "index.html") }))) throw Error("Website publishing is only available in the ConvexPress app");
}
const text = (value: unknown, max = 160) => { if (typeof value !== "string" || !value.trim() || value.length > max || /[\u0000-\u001f]/.test(value)) throw Error("Invalid website publication request"); return value; };
export function parseWebsitePublishRequest(raw: unknown) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw Error("Invalid website publication request");
  const r = raw as Record<string, unknown>;
  const authToken = text(r.authToken, 24_000);
  if (authToken.length < 100 || authToken.split(".").length !== 3) throw Error("Refresh the protected operator session");
  if (r.provider !== undefined && r.provider !== "cloudflare" && r.provider !== "vercel") throw Error("Unsupported website provider");
  const clerkPublishableKey = r.clerkPublishableKey === undefined || r.clerkPublishableKey === "" ? "" : text(r.clerkPublishableKey, 520);
  if (clerkPublishableKey && !/^pk_(?:test|live)_[A-Za-z0-9+/=_-]{10,500}$/.test(clerkPublishableKey)) throw Error("Only a Clerk publishable key is accepted");
  const common = { instanceId: text(r.instanceId), accountId: text(r.accountId), authToken, clerkPublishableKey, confirmLive: r.confirmLive === true };
  if (r.provider === "vercel") {
    const projectName = text(r.projectName, 100);
    if (!/^[a-z0-9][a-z0-9-]{0,98}[a-z0-9]$/.test(projectName)) throw Error("Invalid Vercel project name");
    return { ...common, provider: "vercel" as const, projectName, ...(r.resumeReleaseId === undefined ? {} : { resumeReleaseId: text(r.resumeReleaseId) }) };
  }
  const workerName = text(r.workerName, 63);
  if (!/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(workerName)) throw Error("Invalid Worker name");
  return { ...common, provider: "cloudflare" as const, workerName };
}
type PreflightCode = "WEBSITE_ARTIFACT_INVALID" | "CONTROL_PLANE_MISSING" | "CONTROL_PLANE_ORIGIN_INVALID";
class WebsitePublishPreflightError extends Error {
  constructor(readonly code: PreflightCode, message: string) { super(`[${code}] ${message}`); this.name = "WebsitePublishPreflightError"; }
}
function artifactRoot() { return isDev() ? path.resolve(app.getAppPath(), "../../../ConvexPress-Website/apps/web/dist") : path.join(process.resourcesPath, "website-hosting"); }
export function registerWebsitePublishHandlers() {
  ipcMain.handle("website-publish:run", async (event, raw: unknown) => {
    sender(event);
    const request = parseWebsitePublishRequest(raw);
    if (running.has(request.instanceId)) throw Error("A website release is already running for this environment");
    const controller = new AbortController();
    running.set(request.instanceId, { senderId: event.sender.id, controller });
    const progress = (message: string) => { if (!event.sender.isDestroyed()) event.sender.send("website-publish:progress", { instanceId: request.instanceId, message }); };
    let lease: { releaseId: string; leaseToken: string } | undefined;
    let client: ConvexHttpClient | undefined;
    try {
      progress("Verifying bundled storefront files");
      let artifact: WebsiteArtifact | VercelArtifact;
      try { artifact = request.provider === "vercel" ? loadVercelArtifact(isDev() ? path.join(app.getAppPath(), "resources/website-vercel/output") : path.join(process.resourcesPath, "website-vercel/output")) : loadWebsiteArtifact(artifactRoot()); }
      catch { throw new WebsitePublishPreflightError("WEBSITE_ARTIFACT_INVALID", "The storefront artifact is missing or failed integrity checks. Rebuild the Website hosting artifact and prepare the desktop hosting resource before retrying."); }
      const configured = config.get("convexUrl");
      if (typeof configured !== "string" || !configured.trim()) throw new WebsitePublishPreflightError("CONTROL_PLANE_MISSING", "Connect the agency control plane in desktop settings before publishing.");
      let origin: string;
      try { origin = mapConfiguredDeploymentOrigin(configured, { development: isDev(), originMap: process.env.CONVEXPRESS_DEPLOY_ORIGIN_MAP }); }
      catch { throw new WebsitePublishPreflightError("CONTROL_PLANE_ORIGIN_INVALID", "Use an HTTPS control-plane origin or a private-network HTTP origin. Check the configured development tunnel mapping; credentials and URL paths are not accepted."); }
      progress("Connecting to the agency control plane");
      client = new ConvexHttpClient(origin, { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(30_000) }) });
      client.setAuth(request.authToken);
      const cp = client;
      controller.signal.throwIfAborted();
      if (request.provider === "vercel") {
        const begin = await cp.mutation(makeFunctionReference<"mutation", { instanceId: string; accountId: string; projectName: string; artifactHash: string; clerkPublishableKey: string; editorOrigin: string; confirmLive: boolean; resumeReleaseId?: string }, { releaseId: string; leaseToken: string; alreadySucceeded?: boolean; siteOrigin?: string }>("hosting/vercelReleases:begin"),
          { instanceId: request.instanceId, accountId: request.accountId, projectName: request.projectName, artifactHash: artifact.hash, clerkPublishableKey: request.clerkPublishableKey, editorOrigin: validateEditorOrigin(isDev() ? new URL(event.sender.getURL()).origin : PACKAGED_EDITOR_ORIGIN), confirmLive: request.confirmLive, ...(request.resumeReleaseId ? { resumeReleaseId: request.resumeReleaseId } : {}) });
        if (begin.alreadySucceeded && begin.siteOrigin) { progress("Website published and public pages verified"); return { releaseId: begin.releaseId, siteOrigin: begin.siteOrigin }; }
        lease = { releaseId: begin.releaseId, leaseToken: begin.leaseToken }; const args = lease;
        const value = await publishVercelWebsite(artifact as VercelArtifact, {
          credential: () => cp.action(makeFunctionReference<"action", typeof args, VercelUploadCredential>("hosting/vercelPublish:credential"), args),
          heartbeat: () => cp.mutation(makeFunctionReference<"mutation">("hosting/vercelReleases:heartbeat"), args),
          submit: files => cp.action(makeFunctionReference<"action", typeof args & { files: typeof files }, { deploymentId: string }>("hosting/vercelPublish:submit"), { ...args, files }),
          poll: () => cp.action(makeFunctionReference<"action", typeof args, { ready: boolean; phase: string; siteOrigin: string }>("hosting/vercelPublish:poll"), args),
          receipt: () => cp.query(makeFunctionReference<"query", { releaseId: string }, { state: string; siteOrigin: string; artifactHash: string }>("hosting/vercelReleases:result"), { releaseId: args.releaseId }),
          interrupted: () => cp.mutation(makeFunctionReference<"mutation">("hosting/vercelReleases:interrupted"), args),
        }, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10 * 60_000)]), progress });
        return { releaseId: begin.releaseId, siteOrigin: value.siteOrigin };
      }
      const begin = await cp.mutation(makeFunctionReference<"mutation", { instanceId: string; accountId: string; workerName: string; artifactHash: string; clerkPublishableKey: string; editorOrigin: string; confirmLive: boolean }, { releaseId: string; leaseToken: string }>("hosting/websiteReleases:begin"), { instanceId: request.instanceId, accountId: request.accountId, workerName: request.workerName, artifactHash: artifact.hash, clerkPublishableKey: request.clerkPublishableKey, editorOrigin: validateEditorOrigin(isDev() ? new URL(event.sender.getURL()).origin : PACKAGED_EDITOR_ORIGIN), confirmLive: request.confirmLive });
      lease = { releaseId: begin.releaseId, leaseToken: begin.leaseToken };
      const args = lease;
      const value = await publishWebsite(artifact as WebsiteArtifact, begin.releaseId, {
        credential: () => cp.action(makeFunctionReference<"action", typeof args, PublishCredential>("hosting/websitePublish:credential"), args),
        checkpoint: phase => cp.mutation(makeFunctionReference<"mutation">("hosting/websiteReleases:checkpoint"), { ...args, phase }),
        confirm: () => cp.action(makeFunctionReference<"action">("hosting/websitePublish:confirm"), args),
        interrupted: () => cp.mutation(makeFunctionReference<"mutation">("hosting/websiteReleases:interrupted"), args),
      }, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10 * 60_000)]), progress });
      return { releaseId: begin.releaseId, siteOrigin: value.siteOrigin };
    } catch (error) {
      if (error instanceof WebsitePublishPreflightError) throw error;
      if (lease && client) await client.mutation(makeFunctionReference<"mutation">(request.provider === "vercel" ? "hosting/vercelReleases:interrupted" : "hosting/websiteReleases:interrupted"), lease).catch(() => undefined);
      // Provider/transport exceptions may contain URL or credential context. The
      // renderer receives only a fixed failure; durable CP state holds progress.
      throw Error(controller.signal.aborted ? "Website publishing cancelled. Reconcile the release before retrying." : "Website publishing was not confirmed. Check the registered address, provider permissions, and release status before retrying.");
    } finally { running.delete(request.instanceId); client?.clearAuth(); }
  });
  ipcMain.handle("website-publish:cancel", (event, id: unknown) => { sender(event); const instanceId = text(id); const run = running.get(instanceId); if (!run) return false; if (run.senderId !== event.sender.id) throw Error("This publication belongs to another window"); run.controller.abort(); return true; });
}
export function unregisterWebsitePublishHandlers() {
  for (const run of running.values()) run.controller.abort();
  ipcMain.removeHandler("website-publish:run"); ipcMain.removeHandler("website-publish:cancel");
}
