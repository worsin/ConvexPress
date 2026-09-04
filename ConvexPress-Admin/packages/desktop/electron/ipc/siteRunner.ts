/**
 * Site runner IPC.
 *
 * Lets the admin renderer start, stop and open local storefront processes
 * for any environment instance, all from the single ConvexPress-Website
 * checkout. Port and checkout location are remembered in
 * `convexpress-sites.json` in userData.
 */

import { existsSync } from "node:fs";
import path from "node:path";

import { SiteRunnerManager } from "../siteRunner/manager.js";
import {
  assertProcessKey,
  assertSiteRunnerTarget,
  assertWebsiteRepoPathInput,
  isLoopbackUrl,
  siteProcessKey,
  type SiteProcessState,
  type SiteRunnerConfig,
} from "../siteRunner/siteRunnerValidation.js";
import { JsonStore } from "../utils/json-store.js";
import { isDev } from "../utils/platform.js";
import { getTrustedDevRendererOrigin, isAppRendererSender, isDevAppRendererSender } from "./setupSender.js";

const { app, BrowserWindow, dialog, ipcMain, shell } = require("electron") as typeof import("electron");

const store = new JsonStore<SiteRunnerConfig & Record<string, unknown>>({
  name: "convexpress-sites",
  defaults: { websiteRepoPath: null, ports: {} },
});

function getRendererIndexPath(): string {
  return path.join(__dirname, "..", "dist", "index.html");
}

function isRunnerAppSender(senderUrl: string): boolean {
  return isDev()
    ? isDevAppRendererSender(senderUrl)
    : isAppRendererSender(senderUrl, { rendererIndexPath: getRendererIndexPath() });
}

function assertSender(event: Electron.IpcMainInvokeEvent): void {
  if (!isRunnerAppSender(event.sender.getURL())) {
    throw new Error("Local storefronts can only be controlled from the ConvexPress app.");
  }
}

function looksLikeWebsiteRepo(candidate: string): boolean {
  return existsSync(path.join(candidate, "apps", "web", "package.json"));
}

/** Candidate checkouts next to the admin in a development tree. */
function defaultRepoCandidates(): string[] {
  const appPath = app.getAppPath();
  return [
    process.env.CONVEXPRESS_WEBSITE_REPO ?? "",
    path.resolve(appPath, "..", "..", "..", "ConvexPress-Website"),
    path.resolve(appPath, "..", "..", "ConvexPress-Website"),
    path.resolve(process.cwd(), "..", "..", "..", "ConvexPress-Website"),
    path.resolve(process.cwd(), "..", "ConvexPress-Website"),
  ].filter(Boolean);
}

export function resolveWebsiteRepoPath(): { path: string | null; source: "config" | "env" | "sibling" | "none" } {
  const configured = store.get("websiteRepoPath") as string | null;
  if (configured && looksLikeWebsiteRepo(configured)) return { path: configured, source: "config" };
  const fromEnv = process.env.CONVEXPRESS_WEBSITE_REPO;
  if (fromEnv && looksLikeWebsiteRepo(fromEnv)) return { path: fromEnv, source: "env" };
  for (const candidate of defaultRepoCandidates()) {
    if (looksLikeWebsiteRepo(candidate)) return { path: candidate, source: "sibling" };
  }
  return { path: null, source: "none" };
}

function broadcast(state: SiteProcessState): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send("site-runner:changed", state);
  }
}

let manager: SiteRunnerManager | null = null;
let logSink: (line: string) => void = () => {};

/**
 * Development aid: `CONVEXPRESS_SITE_ORIGIN_MAP` is a JSON object mapping a
 * deployment origin to the origin a storefront process should use instead
 * (for example a worker address to an SSH tunnel on loopback). Never set in
 * packaged builds; ignored unless valid JSON.
 */
function mapDevelopmentOrigins<T extends { convexUrl: string; convexSiteUrl?: string }>(target: T): T {
  const raw = process.env.CONVEXPRESS_SITE_ORIGIN_MAP;
  if (!raw) return target;
  let map: Record<string, string>;
  try {
    map = JSON.parse(raw) as Record<string, string>;
  } catch {
    return target;
  }
  const rewrite = (origin: string | undefined) => {
    if (!origin) return origin;
    const replacement = map[origin] ?? map[origin.replace(/\/$/, "")];
    return typeof replacement === "string" && /^https?:\/\//.test(replacement) ? replacement : origin;
  };
  const mapped = { ...target, convexUrl: rewrite(target.convexUrl) as string, convexSiteUrl: rewrite(target.convexSiteUrl) };
  if (mapped.convexUrl !== target.convexUrl) {
    logSink(`[SiteRunner] origin map ${target.convexUrl} → ${mapped.convexUrl}`);
  }
  return mapped;
}

export function getSiteRunnerManager(): SiteRunnerManager {
  manager ??= new SiteRunnerManager({
    websiteRepoPath: () => resolveWebsiteRepoPath().path,
    cacheRoot: () => path.join(app.getPath("userData"), "storefront-cache"),
    adminAppUrl: () =>
      isDev() ? getTrustedDevRendererOrigin() : (store.get("adminAppUrl") as string | undefined),
    rememberedPort: (key) => {
      const ports = (store.get("ports") as Record<string, number> | undefined) ?? {};
      return typeof ports[key] === "number" ? ports[key] : null;
    },
    rememberPort: (key, port) => {
      const ports = { ...((store.get("ports") as Record<string, number> | undefined) ?? {}) };
      ports[key] = port;
      store.set("ports", ports);
    },
    onChange: broadcast,
    log: (line) => logSink(line),
  });
  return manager;
}

export function setSiteRunnerLogger(sink: (line: string) => void): void {
  logSink = sink;
}

export function registerSiteRunnerHandlers(): void {
  ipcMain.handle("site-runner:list", (event) => {
    assertSender(event);
    return getSiteRunnerManager().list();
  });

  ipcMain.handle("site-runner:get-config", (event) => {
    assertSender(event);
    const resolved = resolveWebsiteRepoPath();
    return {
      websiteRepoPath: resolved.path,
      source: resolved.source,
      configuredPath: (store.get("websiteRepoPath") as string | null) ?? null,
      ports: (store.get("ports") as Record<string, number> | undefined) ?? {},
    };
  });

  ipcMain.handle("site-runner:set-config", (event, input: unknown) => {
    assertSender(event);
    const raw = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
    if ("websiteRepoPath" in raw) {
      const value = assertWebsiteRepoPathInput(raw.websiteRepoPath);
      if (value && !looksLikeWebsiteRepo(value)) {
        throw new Error("That folder does not contain a ConvexPress-Website checkout (apps/web/package.json).");
      }
      store.set("websiteRepoPath", value);
    }
    return resolveWebsiteRepoPath();
  });

  ipcMain.handle("site-runner:pick-repo", async (event) => {
    assertSender(event);
    const win = BrowserWindow.fromWebContents(event.sender);
    const dialogOptions: Electron.OpenDialogOptions = {
      title: "Choose the ConvexPress-Website checkout",
      properties: ["openDirectory"],
    };
    const result = win
      ? await dialog.showOpenDialog(win, dialogOptions)
      : await dialog.showOpenDialog(dialogOptions);
    if (result.canceled || !result.filePaths[0]) return { cancelled: true as const };
    const chosen = result.filePaths[0];
    if (!looksLikeWebsiteRepo(chosen)) {
      throw new Error("That folder does not contain a ConvexPress-Website checkout (apps/web/package.json).");
    }
    store.set("websiteRepoPath", chosen);
    return { cancelled: false as const, path: chosen };
  });

  ipcMain.handle("site-runner:start", async (event, input: unknown) => {
    assertSender(event);
    const target = mapDevelopmentOrigins(assertSiteRunnerTarget(input));
    return await getSiteRunnerManager().ensureRunning(target);
  });

  ipcMain.handle("site-runner:stop", async (event, key: unknown) => {
    assertSender(event);
    return await getSiteRunnerManager().stop(assertProcessKey(key));
  });

  ipcMain.handle("site-runner:restart", async (event, input: unknown) => {
    assertSender(event);
    const target = mapDevelopmentOrigins(assertSiteRunnerTarget(input));
    const runner = getSiteRunnerManager();
    await runner.stop(siteProcessKey(target));
    return await runner.ensureRunning(target);
  });

  ipcMain.handle("site-runner:forget", (event, key: unknown) => {
    assertSender(event);
    getSiteRunnerManager().forget(assertProcessKey(key));
    return getSiteRunnerManager().list();
  });

  ipcMain.handle("site-runner:logs", (event, key: unknown) => {
    assertSender(event);
    return getSiteRunnerManager().logs(assertProcessKey(key));
  });

  /**
   * "View website": open the configured address. When it is a loopback
   * address the storefront is started first, on that address's port.
   */
  ipcMain.handle("site-runner:open", async (event, input: unknown) => {
    assertSender(event);
    const target = mapDevelopmentOrigins(assertSiteRunnerTarget(input));
    if (target.mode !== "preview" && !isLoopbackUrl(target.siteUrl)) {
      const url = target.siteUrl;
      if (!url) throw new Error("This environment has no site address yet.");
      await shell.openExternal(url);
      return { launched: false as const, url };
    }
    const state = await getSiteRunnerManager().ensureRunning(target);
    await shell.openExternal(state.url);
    return { launched: true as const, url: state.url, state };
  });

  ipcMain.handle("site-runner:open-url", async (event, url: unknown) => {
    assertSender(event);
    if (typeof url !== "string" || !/^https?:\/\//.test(url)) {
      throw new Error("Only http(s) URLs can be opened.");
    }
    await shell.openExternal(url);
  });
}

export function unregisterSiteRunnerHandlers(): void {
  for (const channel of [
    "site-runner:list",
    "site-runner:get-config",
    "site-runner:set-config",
    "site-runner:pick-repo",
    "site-runner:start",
    "site-runner:stop",
    "site-runner:restart",
    "site-runner:forget",
    "site-runner:logs",
    "site-runner:open",
    "site-runner:open-url",
  ]) {
    ipcMain.removeHandler(channel);
  }
}

export function shutdownSiteRunner(): void {
  manager?.killAllSync();
}
