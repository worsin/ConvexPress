/**
 * Site deploy IPC.
 *
 * Applies site-auth environment variables to a site's Convex deployment and
 * redeploys the ConvexPress backend there, streaming progress back to the
 * renderer. Used by the Clerk Connection page: the Convex auth provider list
 * is evaluated at push time, so a new issuer only takes effect after a deploy.
 *
 * Credentials arrive per call (from the control plane, or the desktop's own
 * bundled backend env for single-site installs), are used for the child
 * processes only, and are never persisted or logged.
 */

import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { resolveBackendRoot } from "./setup.js";
import { isDev } from "../utils/platform.js";
import { isAppRendererSender, isDevAppRendererSender } from "./setupSender.js";
import {
  assertSiteDeployRequest,
  redactDeployLog,
  type SiteDeployRequest,
} from "./siteDeployValidation.js";

const { BrowserWindow, ipcMain } = require("electron") as typeof import("electron");

type Phase = "environment" | "codegen" | "deploy" | "complete" | "failed";

interface ProgressEvent {
  runId: string;
  phase: Phase;
  message: string;
  at: number;
}

interface RunState {
  runId: string;
  label: string;
  startedAt: number;
  finishedAt: number | null;
  phase: Phase;
  ok: boolean | null;
  error: string | null;
  log: string[];
}

let activeRun: RunState | null = null;
let lastRun: RunState | null = null;

function getRendererIndexPath(): string {
  return path.join(__dirname, "..", "dist", "index.html");
}

function assertSender(event: Electron.IpcMainInvokeEvent): void {
  const url = event.sender.getURL();
  const ok = isDev()
    ? isDevAppRendererSender(url)
    : isAppRendererSender(url, { rendererIndexPath: getRendererIndexPath() });
  if (!ok) throw new Error("Site deploys can only be started from the ConvexPress app.");
}

function broadcast(event: ProgressEvent): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send("site-deploy:progress", event);
  }
}

function runCommand(
  command: string,
  args: string[],
  options: { cwd: string; env: NodeJS.ProcessEnv; onLine: (line: string) => void },
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stderr = "";
    const forward = (chunk: Buffer, isErr: boolean) => {
      const text = chunk.toString();
      if (isErr) stderr += text;
      for (const line of text.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (
          trimmed &&
          !trimmed.includes("ExperimentalWarning") &&
          !trimmed.includes("--trace-warnings")
        ) {
          options.onLine(trimmed);
        }
      }
    };
    child.stdout.on("data", (chunk: Buffer) => forward(chunk, false));
    child.stderr.on("data", (chunk: Buffer) => forward(chunk, true));
    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (code === 0) return resolve();
      const tail = stderr.trim().split("\n").slice(-6).join("\n");
      reject(
        new Error(
          `${command} ${args[0] ?? ""} ${args[1] ?? ""} failed ${
            signal ? `with signal ${signal}` : `with exit code ${code}`
          }${tail ? `: ${tail}` : ""}`,
        ),
      );
    });
  });
}

/** Bundled single-site install: the backend's own deploy key, if present. */
export function readBundledDeployCredential(): {
  deployKey: string;
  deployment: string;
  convexUrl: string;
} | null {
  try {
    const backendRoot = resolveBackendRoot();
    const envPath = path.join(backendRoot, ".env.local");
    if (!existsSync(envPath)) return null;
    const env: Record<string, string> = {};
    for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
      const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line.trim());
      if (!match) continue;
      env[match[1]] = match[2].trim().replace(/^["']|["']$/g, "");
    }
    if (!env.CONVEX_DEPLOY_KEY || !env.CONVEX_DEPLOYMENT || !env.CONVEX_URL) return null;
    return {
      deployKey: env.CONVEX_DEPLOY_KEY,
      deployment: env.CONVEX_DEPLOYMENT,
      convexUrl: env.CONVEX_URL,
    };
  } catch {
    return null;
  }
}

async function execute(request: SiteDeployRequest, run: RunState): Promise<void> {
  const backendRoot = resolveBackendRoot();
  const secrets: string[] = [];
  const env: NodeJS.ProcessEnv = { ...process.env };
  const targetArgs: string[] = [];
  if (request.credential.kind === "bundled") {
    const bundled = readBundledDeployCredential();
    if (!bundled) throw new Error("This install has no bundled deploy key; connect the site through the control plane instead.");
    if (bundled.convexUrl.replace(/\/+$/, "") !== request.credential.convexUrl) {
      throw new Error("The bundled deploy key belongs to a different deployment.");
    }
    secrets.push(bundled.deployKey);
    env.CONVEX_DEPLOYMENT = bundled.deployment;
    env.CONVEX_DEPLOY_KEY = bundled.deployKey;
  } else if (request.credential.kind === "admin-key") {
    secrets.push(request.credential.adminKey);
    targetArgs.push(
      "--url",
      request.credential.deploymentOrigin,
      "--admin-key",
      request.credential.adminKey,
    );
  } else {
    secrets.push(request.credential.deployKey);
    env.CONVEX_DEPLOYMENT = request.credential.deployment;
    env.CONVEX_DEPLOY_KEY = request.credential.deployKey;
  }
  for (const change of request.envChanges) if (change.value) secrets.push(change.value);

  const report = (phase: Phase, message: string) => {
    const safe = redactDeployLog(message, secrets);
    run.phase = phase;
    run.log.push(`[${new Date().toISOString()}] ${phase}: ${safe}`);
    if (run.log.length > 400) run.log.splice(0, run.log.length - 400);
    console.log(`[Site deploy] ${run.label} · ${phase}: ${safe}`);
    broadcast({ runId: run.runId, phase, message: safe, at: Date.now() });
  };

  if (request.envChanges.length > 0) {
    report("environment", `Writing ${request.envChanges.length} environment variable(s).`);
    for (const change of request.envChanges) {
      const args =
        change.value === null
          ? ["convex", "env", "remove", change.name, ...targetArgs]
          : ["convex", "env", "set", change.name, change.value, ...targetArgs];
      await runCommand("bunx", args, {
        cwd: backendRoot,
        env,
        onLine: (line) => report("environment", line),
      });
      report("environment", `${change.name} ${change.value === null ? "removed" : "set"}.`);
    }
  }

  if (request.envOnly) {
    report("complete", "Environment applied.");
    return;
  }

  report("codegen", "Regenerating extension index.");
  await runCommand("node", ["scripts/generate-extension-index.mjs"], {
    cwd: backendRoot,
    env,
    onLine: (line) => report("codegen", line),
  });

  report("deploy", "Deploying the ConvexPress backend (this can take a minute).");
  await runCommand(
    "bunx",
    ["convex", "deploy", ...targetArgs, "--message", `ConvexPress: ${request.label}`],
    { cwd: backendRoot, env, onLine: (line) => report("deploy", line) },
  );
  report("complete", "Deployed. The site now trusts the configured sign-in provider.");
}

export function registerSiteDeployHandlers(): void {
  ipcMain.handle("site-deploy:status", (event) => {
    assertSender(event);
    const run = activeRun ?? lastRun;
    return run ? { ...run, log: run.log.slice(-60) } : null;
  });

  ipcMain.handle("site-deploy:run", async (event, rawInput: unknown) => {
    assertSender(event);
    if (activeRun) throw new Error(`A deploy is already running (${activeRun.label}).`);
    const request = assertSiteDeployRequest(rawInput);
    const run: RunState = {
      runId: `deploy_${Date.now().toString(36)}`,
      label: request.label,
      startedAt: Date.now(),
      finishedAt: null,
      phase: "environment",
      ok: null,
      error: null,
      log: [],
    };
    activeRun = run;
    try {
      await execute(request, run);
      run.ok = true;
    } catch (error) {
      run.ok = false;
      run.phase = "failed";
      run.error = redactDeployLog(error instanceof Error ? error.message : String(error), [
        request.credential.kind === "admin-key"
          ? request.credential.adminKey
          : request.credential.kind === "deploy-key"
            ? request.credential.deployKey
            : (readBundledDeployCredential()?.deployKey ?? ""),
        ...request.envChanges.map((change) => change.value ?? ""),
      ]);
      broadcast({ runId: run.runId, phase: "failed", message: run.error, at: Date.now() });
    } finally {
      run.finishedAt = Date.now();
      lastRun = run;
      activeRun = null;
    }
    return { runId: run.runId, ok: run.ok === true, error: run.error, log: run.log.slice(-60) };
  });

  ipcMain.handle("site-deploy:bundled-credential", (event) => {
    assertSender(event);
    const bundled = readBundledDeployCredential();
    return bundled
      ? { available: true, convexUrl: bundled.convexUrl, deployment: bundled.deployment }
      : { available: false };
  });
}

export function unregisterSiteDeployHandlers(): void {
  ipcMain.removeHandler("site-deploy:status");
  ipcMain.removeHandler("site-deploy:run");
  ipcMain.removeHandler("site-deploy:bundled-credential");
}
