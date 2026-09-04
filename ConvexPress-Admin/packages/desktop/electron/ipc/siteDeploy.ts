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
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { generateAuthPrivateKey, resolveBackendRoot } from "./setup.js";
import { requestDeploymentCredential } from "./connectionProvision.js";
import { JsonStore } from "../utils/json-store.js";
import { isDev } from "../utils/platform.js";
import { isAppRendererSender, isDevAppRendererSender } from "./setupSender.js";
import {
  assertSiteDeployRequest,
  assertSiteInitializeRequest,
  redactDeployLog,
  type SiteDeployRequest,
  type SiteInitializeRequest,
} from "./siteDeployValidation.js";

const { BrowserWindow, ipcMain } = require("electron") as typeof import("electron");

const configStore = new JsonStore({ name: "convexpress-config" });

type Phase = "environment" | "codegen" | "deploy" | "identity" | "connect" | "complete" | "failed";

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

/**
 * `convex env set NAME VALUE` parses a value that starts with "-" (PEM keys,
 * negative numbers) as a CLI option, and any value passed in argv is visible
 * to other local processes. Values therefore always travel through a
 * 0600 temp file and `--from-file`, the same path the setup wizard uses.
 */
async function setDeploymentEnv(
  name: string,
  value: string,
  targetArgs: string[],
  options: { cwd: string; env: NodeJS.ProcessEnv; onLine: (line: string) => void },
): Promise<void> {
  const dir = mkdtempSync(path.join(tmpdir(), "convexpress-env-"));
  const file = path.join(dir, "convex-env.local");
  writeFileSync(file, `${name}=${JSON.stringify(value)}\n`, { mode: 0o600 });
  try {
    // The CLI echoes the temp-file path; the caller reports "NAME set." instead.
    await runCommand("bunx", ["convex", "env", "set", "--from-file", file, "--force", ...targetArgs], {
      ...options,
      onLine: () => {},
    });
  } finally {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      /* temp dir cleanup is best-effort */
    }
  }
}

/** Human message for a failure, preferring ConvexError payloads over "Server Error". */
export function describeFailure(error: unknown): string {
  const data = (error as { data?: unknown } | null)?.data;
  if (data && typeof data === "object" && typeof (data as { message?: unknown }).message === "string") {
    return (data as { message: string }).message;
  }
  if (typeof data === "string" && data.trim()) return data.trim();
  const message = describeFailure(error);
  const uncaught = /Uncaught (?:Convex)?Error: ([^\n]+)/u.exec(message);
  return (uncaught?.[1] ?? message).trim();
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
      // Lead with the CLI's own failure lines (✖ …); drop runtime warnings and
      // progress spinners so the operator sees the reason, not the noise.
      const lines = stderr
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(
          (line) =>
            line &&
            !line.includes("ExperimentalWarning") &&
            !line.includes("--trace-warnings") &&
            !/^- Deploying to /.test(line),
        );
      const failures = lines.filter((line) => line.startsWith("✖") || /error/i.test(line));
      const tail = (failures.length > 0 ? failures : lines).slice(-4).join("\n");
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

/**
 * Development acceptance runs reach the worker fleet through SSH tunnels while
 * the control plane records the fleet's LAN origins. `CONVEXPRESS_DEPLOY_ORIGIN_MAP`
 * ("http://lan:4830=http://127.0.0.1:14830,…") lets the dev desktop deploy to
 * the tunnelled address. Ignored in packaged builds.
 */
function mapDeploymentOrigin(origin: string): string {
  if (!isDev()) return origin;
  const raw = process.env.CONVEXPRESS_DEPLOY_ORIGIN_MAP;
  if (!raw) return origin;
  for (const pair of raw.split(",")) {
    const [from, to] = pair.split("=").map((part) => part.trim().replace(/\/+$/, ""));
    if (from && to && from === origin.replace(/\/+$/, "")) return to;
  }
  return origin;
}

async function execute(request: SiteDeployRequest, run: RunState, promptedKey: string | null): Promise<void> {
  const backendRoot = resolveBackendRoot();
  const secrets: string[] = [];
  const env: NodeJS.ProcessEnv = { ...process.env };
  const targetArgs: string[] = [];
  if (request.credential.kind === "prompt") {
    if (!promptedKey) throw new Error("No deployment key was entered.");
    secrets.push(promptedKey);
    targetArgs.push("--url", mapDeploymentOrigin(request.credential.deploymentOrigin), "--admin-key", promptedKey);
  } else if (request.credential.kind === "control-plane") {
    // The sealed admin key never enters the renderer: main asks the control
    // plane for it with the operator's token and keeps it in memory only.
    const controlPlaneUrl = configStore.get("convexUrl");
    if (typeof controlPlaneUrl !== "string" || !controlPlaneUrl.trim()) {
      throw new Error("The ConvexPress control plane is not configured.");
    }
    const { ConvexHttpClient } = await import("convex/browser");
    const { makeFunctionReference } = await import("convex/server");
    const client = new ConvexHttpClient(mapDeploymentOrigin(controlPlaneUrl.trim()));
    client.setAuth(request.credential.authToken);
    const issued = (await client.action(
      makeFunctionReference<"action">("connections/siteAuth:issueDeploymentCredential"),
      { connectionId: request.credential.connectionId },
    )) as { deploymentOrigin: string; deploymentAdminKey: string };
    secrets.push(issued.deploymentAdminKey, request.credential.authToken);
    targetArgs.push("--url", mapDeploymentOrigin(issued.deploymentOrigin), "--admin-key", issued.deploymentAdminKey);
  } else if (request.credential.kind === "bundled") {
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
      mapDeploymentOrigin(request.credential.deploymentOrigin),
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
      const onLine = (line: string) => report("environment", line);
      if (change.value === null) {
        await runCommand("bunx", ["convex", "env", "remove", change.name, ...targetArgs], {
          cwd: backendRoot,
          env,
          onLine,
        });
      } else {
        await setDeploymentEnv(change.name, change.value, targetArgs, { cwd: backendRoot, env, onLine });
      }
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


// The site must accept every capability the control plane enrolls. This mirrors
// @convexpress/site-contract MANAGEMENT_CAPABILITY_CODES (the package ships TS
// source, which the Electron main bundle cannot require at runtime);
// siteDeployCapabilities.test.ts fails the build if the two lists drift.
export const MANAGEMENT_CAPABILITIES: string[] = [
  "health.read",
  "compatibility.read",
  "site.register",
  "site.attach",
  "site.deploy",
  "site.select",
  "session.exchange",
  "backup.create",
  "site.clone",
  "site.promote",
  "site.restore",
  "credential.rotate",
  "authority.grant",
  "authority.revoke",
  "operation.resume",
  "handoff.export",
];

function runCapture(
  command: string,
  args: string[],
  options: { cwd: string; env: NodeJS.ProcessEnv },
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: options.cwd, env: options.env, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => (stdout += chunk.toString()));
    child.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString()));
    child.on("error", reject);
    child.on("exit", (code) => resolve({ code: code ?? 1, stdout, stderr }));
  });
}

async function fetchJson(url: string, init: RequestInit = {}, timeoutMs = 15_000): Promise<{ ok: boolean; status: number; json: any }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    const text = await response.text();
    let json: any = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    return { ok: response.ok, status: response.status, json };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Initialize a fresh Convex deployment as a ConvexPress site and enroll the
 * control-plane connection, using the admin key exactly once.
 */
async function initializeSite(
  request: SiteInitializeRequest,
  adminKey: string,
  controlPlaneUrl: string,
  run: RunState,
): Promise<string> {
  const backendRoot = resolveBackendRoot();
  const deployOrigin = mapDeploymentOrigin(request.deploymentOrigin);
  const secrets = [adminKey, request.authToken];
  const env: NodeJS.ProcessEnv = { ...process.env };
  const targetArgs = ["--url", deployOrigin, "--admin-key", adminKey];
  const report = (phase: Phase, message: string) => {
    const safe = redactDeployLog(message, secrets);
    run.phase = phase;
    run.log.push(`[${new Date().toISOString()}] ${phase}: ${safe}`);
    if (run.log.length > 400) run.log.splice(0, run.log.length - 400);
    console.log(`[Site init] ${run.label} · ${phase}: ${safe}`);
    broadcast({ runId: run.runId, phase, message: safe, at: Date.now() });
  };

  // 1. Reachability + credential check (list env vars is a cheap admin call).
  report("environment", `Checking the deployment at ${deployOrigin}.`);
  const existing = await runCapture("bunx", ["convex", "env", "list", ...targetArgs], { cwd: backendRoot, env });
  if (existing.code !== 0) {
    const tail = existing.stderr.trim().split("\n").slice(-4).join(" ");
    throw new Error(`The deployment rejected the admin key or is unreachable: ${tail}`);
  }
  const presentNames = new Set(
    existing.stdout
      .split(/\r?\n/)
      .map((line) => /^([A-Z][A-Z0-9_]*)=/.exec(line.trim())?.[1])
      .filter((name): name is string => Boolean(name)),
  );

  // 2. Environment: only fill what is missing, never rotate an existing signing key.
  const adminOrigins = Array.from(new Set(["http://localhost:4105", "http://127.0.0.1:4105", ...request.adminOrigins]));
  const wanted: Array<[string, string]> = [
    ["AUTH_ISSUER_URL", request.managementOrigin],
    ["AUTH_ALLOWED_ORIGINS", adminOrigins.join(",")],
    ["AUTH_ALLOW_NULL_ORIGIN", "true"],
    ["SITE_URL", request.siteOrigin],
  ];
  if (!presentNames.has("AUTH_PRIVATE_KEY")) wanted.unshift(["AUTH_PRIVATE_KEY", generateAuthPrivateKey()]);
  for (const [name, value] of wanted) {
    if (presentNames.has(name) && name !== "SITE_URL" && name !== "AUTH_ISSUER_URL") {
      report("environment", `${name} already set, keeping it.`);
      continue;
    }
    if (name === "AUTH_PRIVATE_KEY") secrets.push(value);
    await setDeploymentEnv(name, value, targetArgs, {
      cwd: backendRoot,
      env,
      onLine: (line) => report("environment", line),
    });
    report("environment", `${name} set.`);
  }

  // 3. Deploy the ConvexPress backend.
  report("codegen", "Regenerating extension index.");
  await runCommand("node", ["scripts/generate-extension-index.mjs"], { cwd: backendRoot, env, onLine: (line) => report("codegen", line) });
  report("deploy", "Deploying the ConvexPress backend (this can take a minute).");
  await runCommand("bunx", ["convex", "deploy", ...targetArgs, "--message", `ConvexPress: initialize ${request.websiteKey}/${request.instanceKey}`], {
    cwd: backendRoot,
    env,
    onLine: (line) => report("deploy", line),
  });

  // 4. Site identity + built-in roles.
  report("identity", "Writing the site identity and seeding roles.");
  const identity = {
    websiteKey: request.websiteKey,
    instanceKey: request.instanceKey,
    environmentKind: request.environmentKind,
    deploymentOrigin: request.deploymentOrigin,
    managementOrigin: request.managementOrigin,
    siteOrigin: request.siteOrigin,
    siteContractVersion: "1.0.0",
    schemaVersion: "2026.9.0",
    engineVersion: "1.0.0",
    managementCapabilities: MANAGEMENT_CAPABILITIES,
  };
  await runCommand("bunx", ["convex", "run", "management/bootstrap:configureIdentity", JSON.stringify(identity), ...targetArgs], {
    cwd: backendRoot,
    env,
    onLine: (line) => report("identity", line),
  });
  await runCommand("bunx", ["convex", "run", "roles/internals:seedRoles", "{}", ...targetArgs], {
    cwd: backendRoot,
    env,
    onLine: (line) => report("identity", line),
  });
  const healthOrigin = mapDeploymentOrigin(request.managementOrigin);
  const health = await fetchJson(`${healthOrigin}/api/convexpress/management/health`);
  if (!health.ok || health.json?.websiteKey !== request.websiteKey || health.json?.instanceKey !== request.instanceKey) {
    throw new Error(`The site answered its health check with an unexpected identity (HTTP ${health.status}).`);
  }
  report("identity", "Site identity confirmed by the health endpoint.");

  // 5. Enroll the control-plane connection with the same key.
  report("connect", "Enrolling the controller connection.");
  const { ConvexHttpClient } = await import("convex/browser");
  const { makeFunctionReference } = await import("convex/server");
  const client = new ConvexHttpClient(mapDeploymentOrigin(controlPlaneUrl));
  client.setAuth(request.authToken);
  const created = (await client.action(makeFunctionReference<"action">("connections/actions:create"), {
    instanceId: request.instanceId,
    name: request.connectionName,
    ...(request.accountLabel ? { accountLabel: request.accountLabel } : {}),
    deploymentAdminKey: adminKey,
  })) as { connectionId: string; status: string };
  report("complete", `Connected (${created.status}). The site is ready.`);
  return String(created.connectionId);
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
    let promptedKey: string | null = null;
    if (request.credential.kind === "prompt") {
      promptedKey = await requestDeploymentCredential(BrowserWindow.fromWebContents(event.sender));
      if (!promptedKey) return { runId: null, ok: false, cancelled: true, error: null, log: [] };
    }
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
      await execute(request, run, promptedKey);
      run.ok = true;
    } catch (error) {
      run.ok = false;
      run.phase = "failed";
      run.error = redactDeployLog(describeFailure(error), [
        request.credential.kind === "admin-key"
          ? request.credential.adminKey
          : request.credential.kind === "deploy-key"
            ? request.credential.deployKey
            : request.credential.kind === "prompt"
              ? (promptedKey ?? "")
              : request.credential.kind === "control-plane"
                ? request.credential.authToken
                : (readBundledDeployCredential()?.deployKey ?? ""),
        ...request.envChanges.map((change) => change.value ?? ""),
      ]);
      broadcast({ runId: run.runId, phase: "failed", message: run.error, at: Date.now() });
    } finally {
      run.finishedAt = Date.now();
      lastRun = run;
      activeRun = null;
      promptedKey = null;
    }
    return { runId: run.runId, ok: run.ok === true, cancelled: false, error: run.error, log: run.log.slice(-60) };
  });

  // Turn an empty Convex deployment into a ConvexPress site: env, deploy,
  // identity, roles, health check, then enroll the control-plane connection.
  ipcMain.handle("site-deploy:initialize", async (event, rawInput: unknown) => {
    assertSender(event);
    if (activeRun) throw new Error(`A deploy is already running (${activeRun.label}).`);
    const request = assertSiteInitializeRequest(rawInput);
    const controlPlaneUrl = configStore.get("convexUrl");
    if (typeof controlPlaneUrl !== "string" || !controlPlaneUrl.trim()) {
      throw new Error("The ConvexPress control plane is not configured.");
    }
    let adminKey: string | null = await requestDeploymentCredential(BrowserWindow.fromWebContents(event.sender));
    if (!adminKey) return { runId: null, ok: false, cancelled: true, error: null, log: [], connectionId: null };
    const run: RunState = {
      runId: `init_${Date.now().toString(36)}`,
      label: `Initialize ${request.siteTitle}`,
      startedAt: Date.now(),
      finishedAt: null,
      phase: "environment",
      ok: null,
      error: null,
      log: [],
    };
    activeRun = run;
    let connectionId: string | null = null;
    try {
      connectionId = await initializeSite(request, adminKey, controlPlaneUrl.trim(), run);
      run.ok = true;
    } catch (error) {
      run.ok = false;
      run.phase = "failed";
      run.error = redactDeployLog(describeFailure(error), [adminKey]);
      broadcast({ runId: run.runId, phase: "failed", message: run.error, at: Date.now() });
    } finally {
      run.finishedAt = Date.now();
      lastRun = run;
      activeRun = null;
      adminKey = null;
    }
    return { runId: run.runId, ok: run.ok === true, cancelled: false, error: run.error, log: run.log.slice(-60), connectionId };
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
  ipcMain.removeHandler("site-deploy:initialize");
  ipcMain.removeHandler("site-deploy:bundled-credential");
}
