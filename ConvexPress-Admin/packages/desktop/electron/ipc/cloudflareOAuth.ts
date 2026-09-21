import path from "node:path";
import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
import { JsonStore } from "../utils/json-store";
import { isDev } from "../utils/platform";
import { isAppRendererSender, isDevAppRendererSender } from "./setupSender";
import { mapConfiguredDeploymentOrigin } from "./deploymentOriginMapping";
import { CLOUDFLARE_REDIRECT_URI, startCloudflareLoopback } from "../hosting/cloudflareLoopback";
const { ipcMain, shell } = require("electron") as typeof import("electron");
const config = new JsonStore({ name: "convexpress-config" });
let running: { senderId: number; controller: AbortController } | undefined;
function assertSender(event: Electron.IpcMainInvokeEvent) {
  if (!(isDev() ? isDevAppRendererSender(event.sender.getURL()) : isAppRendererSender(event.sender.getURL(), {rendererIndexPath:path.join(__dirname,"..","dist","index.html")}))) throw Error("Cloudflare connections are only available in the ConvexPress app");
}
const text = (value: unknown, max = 160) => {
  if (typeof value !== "string" || !value.trim() || value.length > max || /[\u0000-\u0020\u007f]/.test(value)) throw Error("Invalid Cloudflare connection request");
  return value;
};
export function parseCloudflareOAuthRequest(raw: unknown) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw Error("Invalid Cloudflare connection request");
  const value = raw as Record<string, unknown>;
  const authToken = text(value.authToken, 24000);
  if (authToken.length < 100 || authToken.split(".").length !== 3) throw Error("Refresh the protected operator session");
  if (!Number.isSafeInteger(value.expectedRevision) || Number(value.expectedRevision) < 0) throw Error("Invalid Cloudflare account revision");
  const externalAccountId = text(value.externalAccountId);
  if (!/^[a-f0-9]{32}$/.test(externalAccountId)) throw Error("Invalid Cloudflare account ID");
  return {authToken, organizationId:text(value.organizationId), ...(value.businessId === undefined ? {} : {businessId:text(value.businessId)}), externalAccountId, expectedRevision:Number(value.expectedRevision)};
}
type BeginResult = {authorizationUrl:string;redirectUri:string;state:string};
type ConnectedAccount = {accountId:string;provider:"cloudflare";externalAccountId:string;label:string;revision:number};
export function registerCloudflareOAuthHandlers() {
  ipcMain.handle("hosting:cloudflare-oauth", async (event, raw: unknown) => {
    assertSender(event);
    const {authToken, ...request} = parseCloudflareOAuthRequest(raw);
    if (running) throw Error("A Cloudflare connection attempt is already open");
    const configured = config.get("convexUrl");
    if (typeof configured !== "string") throw Error("Connect the agency control plane before connecting Cloudflare");
    const origin = mapConfiguredDeploymentOrigin(configured, {development:isDev(),originMap:process.env.CONVEXPRESS_DEPLOY_ORIGIN_MAP});
    const controller = new AbortController();
    running = {senderId:event.sender.id,controller};
    const onDestroyed = () => controller.abort();
    event.sender.once("destroyed", onDestroyed);
    let listener: Awaited<ReturnType<typeof startCloudflareLoopback>> | undefined;
    const client = new ConvexHttpClient(origin, {fetch:(input, init) => fetch(input, {...init, signal:AbortSignal.any([controller.signal,AbortSignal.timeout(30000)])})});
    client.setAuth(authToken);
    try {
      listener = await startCloudflareLoopback({signal:controller.signal});
      const begin = await client.action(makeFunctionReference<"action",typeof request,BeginResult>("hosting/cloudflareOAuth:begin"),request);
      if (begin.redirectUri !== CLOUDFLARE_REDIRECT_URI || begin.redirectUri !== listener.redirectUri) throw Error("Invalid callback configuration");
      const url = new URL(begin.authorizationUrl);
      if (url.origin !== "https://dash.cloudflare.com" || url.pathname !== "/oauth2/auth" || url.username || url.password || url.hash
        || url.searchParams.get("redirect_uri") !== CLOUDFLARE_REDIRECT_URI || url.searchParams.get("state") !== begin.state
        || url.searchParams.get("response_type") !== "code" || url.searchParams.get("code_challenge_method") !== "S256") throw Error("Invalid authorization endpoint");
      listener.expectState(begin.state);
      controller.signal.throwIfAborted();
      await shell.openExternal(url.href);
      const callback = await listener.result;
      controller.signal.throwIfAborted();
      return await client.action(makeFunctionReference<"action",typeof callback,ConnectedAccount>("hosting/cloudflareOAuth:complete"),callback);
    } catch {
      throw Error(controller.signal.aborted ? "Cloudflare connection cancelled" : "Cloudflare connection was not completed. Check the application OAuth configuration and account permissions, then retry.");
    } finally {
      listener?.close();
      event.sender.removeListener("destroyed",onDestroyed);
      client.clearAuth();
      running = undefined;
    }
  });
  ipcMain.handle("hosting:cloudflare-oauth-cancel", (event) => {
    assertSender(event);
    if (!running) return false;
    if (running.senderId !== event.sender.id) throw Error("This Cloudflare connection belongs to another window");
    running.controller.abort();return true;
  });
}
export function unregisterCloudflareOAuthHandlers() {
  running?.controller.abort();
  ipcMain.removeHandler("hosting:cloudflare-oauth");
  ipcMain.removeHandler("hosting:cloudflare-oauth-cancel");
}
