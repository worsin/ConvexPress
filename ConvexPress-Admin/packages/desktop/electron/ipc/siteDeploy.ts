import { initializeDeploymentMediaIndex } from "../deployment/mediaIndex.js";
import { parseMediaIndexProgress } from "@convexpress/runtime-clients/media-index-maintenance";
import { mapConfiguredDeploymentOrigin } from "./deploymentOriginMapping";
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

import {
  DeploymentJournal,
  type DeploymentRun as RunState,
  type DeploymentPhase as Phase,
} from "../deployment/journal.js";
import { runDeploymentProcess, type DeploymentProcessOptions } from "../deployment/process.js";
import { cleanProvisioningEnv } from "./provisioningRuntime.js";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  AT_REST_ENCRYPTION_KEYS,
  generateAuthPrivateKey,
  generateEncryptionKeyHex,
  resolveBackendRoot,
} from "./setup.js";
import { requestDeploymentCredential } from "./connectionProvision.js";
import { validateCloudInitializeCredential } from "./cloudInitializeCredential.js";
import { JsonStore } from "../utils/json-store.js";
import { isDev } from "../utils/platform.js";
import { isAppRendererSender, isDevAppRendererSender } from "./setupSender.js";
import {
  parseDeploymentOrigin,
  assertSiteDeployRequest,
  assertSiteInitializeRequest,
  redactDeployLog,
  type SiteDeployRequest,
  type SiteInitializeRequest,
} from "./siteDeployValidation.js";

const { app, BrowserWindow, ipcMain } = require("electron") as typeof import("electron");

const configStore = new JsonStore({ name: "convexpress-config" });

interface ProgressEvent {
  runId: string;
  targetOrigin: string;
  phase: Phase;
  message: string;
  at: number;
}
let journal: DeploymentJournal | undefined;
const controllers = new Map<string, AbortController>();
function getJournal(): DeploymentJournal {
  return (journal ??= new DeploymentJournal(
    path.join(app.getPath("userData"), "convexpress-deployments.json"),
  ));
}
function commandOptions(run: RunState) {
  return {
    signal: controllers.get(run.runId)?.signal,
    onSpawn: (pid: number) => getJournal().process(run.runId, pid),
    onClose: () => getJournal().process(run.runId, null),
  };
}
function reporter(run: RunState, secrets: string[]) {
  let lastPhase: Phase | undefined;
  return (phase: Phase, message: string) => {
    if (phase !== lastPhase) {
      if (lastPhase) getJournal().checkpoint(run.runId, lastPhase, "completed");
      getJournal().checkpoint(run.runId, phase, "started");
      lastPhase = phase;
    }
    const safe = redactDeployLog(message, secrets);
    run.log.push(`[${new Date().toISOString()}] ${phase}: ${safe}`);
    if (run.log.length > 400) run.log.splice(0, run.log.length - 400);
    broadcast({
      runId: run.runId,
      targetOrigin: run.targetOrigin,
      phase,
      message: safe,
      at: Date.now(),
    });
  };
}
const boundedFetch: typeof fetch = (input, init) =>
  fetch(input, {
    ...init,
    signal: AbortSignal.any([AbortSignal.timeout(30_000), ...(init?.signal ? [init.signal] : [])]),
  });

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
  options: DeploymentProcessOptions,
): Promise<void> {
  const dir = mkdtempSync(path.join(tmpdir(), "convexpress-env-"));
  const file = path.join(dir, "convex-env.local");
  writeFileSync(file, `${name}=${JSON.stringify(value)}\n`, { mode: 0o600 });
  try {
    // The CLI echoes the temp-file path; the caller reports "NAME set." instead.
    await runCommand(
      "bunx",
      ["convex", "env", "set", "--from-file", file, "--force", ...targetArgs],
      {
        ...options,
        onLine: () => {},
      },
    );
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
  if (
    data &&
    typeof data === "object" &&
    typeof (data as { message?: unknown }).message === "string"
  ) {
    return (data as { message: string }).message;
  }
  if (typeof data === "string" && data.trim()) return data.trim();
  const message = error instanceof Error ? error.message : String(error);
  const uncaught = /Uncaught (?:Convex)?Error: ([^\n]+)/u.exec(message);
  return (uncaught?.[1] ?? message).trim();
}

let codegenTail: Promise<void> = Promise.resolve();
async function runCommand(
  command: string,
  args: string[],
  options: DeploymentProcessOptions,
): Promise<void> {
  const isCodegen = command === "node" && args[0] === "scripts/generate-extension-index.mjs";
  const execute = () => runDeploymentProcess(command, args, options);
  const pending = isCodegen ? codegenTail.then(execute) : execute();
  if (isCodegen)
    codegenTail = pending.then(
      () => {},
      () => {},
    );
  const result = await pending;
  if (result.code !== 0) {
    const tail = result.stderr.trim().split(/\r?\n/).slice(-4).join("\n");
    throw new Error(
      `Deployment command failed with exit code ${result.code}${tail ? `: ${tail}` : ""}`,
    );
  }
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
  return mapConfiguredDeploymentOrigin(origin, { development: isDev(), originMap: process.env.CONVEXPRESS_DEPLOY_ORIGIN_MAP });
}

async function execute(
  request: SiteDeployRequest,
  run: RunState,
  promptedKey: string | null,
): Promise<void> {
  const backendRoot = resolveBackendRoot();
  const secrets: string[] = [];
  const env = cleanProvisioningEnv(process.env);
  const lifecycle = commandOptions(run);
  const targetArgs: string[] = [];
  if (request.credential.kind === "prompt") {
    if (!promptedKey) throw new Error("No deployment key was entered.");
    secrets.push(promptedKey);
    targetArgs.push(
      "--url",
      mapDeploymentOrigin(request.credential.deploymentOrigin),
      "--admin-key",
      promptedKey,
    );
  } else if (request.credential.kind === "control-plane") {
    throw new Error("Deployment credential was not resolved before locking the target.");
  } else if (request.credential.kind === "bundled") {
    const bundled = readBundledDeployCredential();
    if (!bundled)
      throw new Error(
        "This install has no bundled deploy key; connect the site through the control plane instead.",
      );
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

  const report = reporter(run, secrets);

  if (request.envChanges.length > 0) {
    report("environment", `Writing ${request.envChanges.length} environment variable(s).`);
    for (const change of request.envChanges) {
      const onLine = (line: string) => report("environment", line);
      if (change.value === null) {
        await runCommand("bunx", ["convex", "env", "remove", change.name, ...targetArgs], {
          ...lifecycle,
          cwd: backendRoot,
          env,
          onLine,
        });
      } else {
        await setDeploymentEnv(change.name, change.value, targetArgs, {
          ...lifecycle,
          cwd: backendRoot,
          env,
          onLine,
        });
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
    ...lifecycle,
    cwd: backendRoot,
    env,
    onLine: (line) => report("codegen", line),
  });

  await runCommand("node", ["scripts/generate-media-writer-coverage.mjs", "--check"], {
    ...lifecycle, cwd: backendRoot, env, onLine: (line) => report("codegen", line),
  });
  report("deploy", "Deploying the ConvexPress backend (this can take a minute).");
  await runCommand(
    "bunx",
    ["convex", "deploy", ...targetArgs, "--message", `ConvexPress: ${request.label}`],
    { ...lifecycle, cwd: backendRoot, env, onLine: (line) => report("deploy", line) },
  );
  await initializeDeploymentMediaIndex(targetArgs, { ...lifecycle, cwd: backendRoot, env });
  getJournal().recordMediaIndex(run.runId, null);
  report("media-index", "Backend deployed. Media indexing resumes with an authorized site session.");
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

const runCapture = runDeploymentProcess;

async function fetchJson(
  url: string,
  init: RequestInit = {},
  timeoutMs = 15_000,
): Promise<{ ok: boolean; status: number; json: any }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...init,
      signal: AbortSignal.any([controller.signal, ...(init.signal ? [init.signal] : [])]),
    });
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
  const env = cleanProvisioningEnv(process.env);
  const lifecycle = commandOptions(run);
  const targetArgs = ["--url", deployOrigin, "--admin-key", adminKey];
  const report = reporter(run, secrets);

  try {
    // 1. Reachability + credential check (list env vars is a cheap admin call).
    report("environment", `Checking the deployment at ${deployOrigin}.`);
    const existing = await runCapture("bunx", ["convex", "env", "list", ...targetArgs], {
      ...lifecycle,
      cwd: backendRoot,
      env,
      requireCompleteOutput: true,
    });
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
    const adminOrigins = Array.from(
      new Set(["http://localhost:4105", "http://127.0.0.1:4105", ...request.adminOrigins]),
    );
    const wanted: Array<[string, string]> = [
      ["AUTH_ISSUER_URL", request.managementOrigin],
      ["AUTH_ALLOWED_ORIGINS", adminOrigins.join(",")],
      ["AUTH_ALLOW_NULL_ORIGIN", "true"],
      ["SITE_URL", request.siteOrigin],
    ];
    if (!presentNames.has("AUTH_PRIVATE_KEY"))
      wanted.unshift(["AUTH_PRIVATE_KEY", generateAuthPrivateKey()]);
    // At-rest encryption keys for stored integration secrets (see setup.ts).
    for (const name of AT_REST_ENCRYPTION_KEYS) {
      if (!presentNames.has(name)) wanted.push([name, generateEncryptionKeyHex()]);
    }
    for (const [name, value] of wanted) {
      if (presentNames.has(name) && name !== "SITE_URL" && name !== "AUTH_ISSUER_URL") {
        report("environment", `${name} already set, keeping it.`);
        continue;
      }
      if (
        name === "AUTH_PRIVATE_KEY" ||
        (AT_REST_ENCRYPTION_KEYS as readonly string[]).includes(name)
      )
        secrets.push(value);
      await setDeploymentEnv(name, value, targetArgs, {
        ...lifecycle,
        cwd: backendRoot,
        env,
        onLine: (line) => report("environment", line),
      });
      report("environment", `${name} set.`);
    }

    // 3. Deploy the ConvexPress backend.
    report("codegen", "Regenerating extension index.");
    await runCommand("node", ["scripts/generate-extension-index.mjs"], {
      ...lifecycle,
      cwd: backendRoot,
      env,
      onLine: (line) => report("codegen", line),
    });
    await runCommand("node", ["scripts/generate-media-writer-coverage.mjs", "--check"], {
    ...lifecycle, cwd: backendRoot, env, onLine: (line) => report("codegen", line),
  });
  report("deploy", "Deploying the ConvexPress backend (this can take a minute).");
    await runCommand(
      "bunx",
      [
        "convex",
        "deploy",
        ...targetArgs,
        "--message",
        `ConvexPress: initialize ${request.websiteKey}/${request.instanceKey}`,
      ],
      {
        ...lifecycle,
        cwd: backendRoot,
        env,
        onLine: (line) => report("deploy", line),
      },
    );

    await initializeDeploymentMediaIndex(targetArgs, { ...lifecycle, cwd: backendRoot, env });

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
    await runCommand(
      "bunx",
      [
        "convex",
        "run",
        "management/bootstrap:configureIdentity",
        JSON.stringify(identity),
        ...targetArgs,
      ],
      {
        ...lifecycle,
        cwd: backendRoot,
        env,
        onLine: (line) => report("identity", line),
      },
    );
    await runCommand("bunx", ["convex", "run", "roles/internals:seedRoles", "{}", ...targetArgs], {
      ...lifecycle,
      cwd: backendRoot,
      env,
      onLine: (line) => report("identity", line),
    });
    report("identity", "Creating missing built-in templates and default category.");
    await runCommand(
      "bunx",
      ["convex", "run", "bootstrap/requiredRecords:ensure", "{}", ...targetArgs],
      {
        ...lifecycle,
        cwd: backendRoot,
        env,
        onLine: (line) => report("identity", line),
      },
    );
    report("identity", "Registering missing default event listeners.");
    await runCommand(
      "bunx",
      ["convex", "run", "bootstrap/registerListeners:ensureRequired", "{}", ...targetArgs],
      {
        ...lifecycle,
        cwd: backendRoot,
        env,
        onLine: (line) => report("identity", line),
      },
    );
    const healthOrigin = mapDeploymentOrigin(request.managementOrigin);
    const health = await fetchJson(`${healthOrigin}/api/convexpress/management/health`, {
      signal: lifecycle.signal,
    });
    if (
      !health.ok ||
      health.json?.websiteKey !== request.websiteKey ||
      health.json?.instanceKey !== request.instanceKey
    ) {
      throw new Error(
        `The site answered its health check with an unexpected identity (HTTP ${health.status}).`,
      );
    }
    report("identity", "Site identity confirmed by the health endpoint.");

    // 5. Enroll the control-plane connection with the same key.
    report("connect", "Enrolling the controller connection.");
    const { ConvexHttpClient } = await import("convex/browser");
    const { makeFunctionReference } = await import("convex/server");
    const client = new ConvexHttpClient(mapDeploymentOrigin(controlPlaneUrl), {
      fetch: (input, init) => boundedFetch(input, { ...init, signal: lifecycle.signal }),
    });
    client.setAuth(request.authToken);
    const connections = (await client.query(
      makeFunctionReference<"query">("connections/queries:listForInstance"),
      { instanceId: request.instanceId },
    )) as Array<{
      connectionId: string;
      status: string;
      hasCredentials: boolean;
      isActive: boolean;
    }>;
    const verifySavedConnection = async (connectionId: string) => {
      report("connect", "Verifying the saved controller authority and site compatibility.");
      const verified = await client.action(
        makeFunctionReference<"action">("connections/actions:test"),
        { connectionId },
      ) as { connectionId?: string; status?: string };
      if (verified?.connectionId !== connectionId || verified.status !== "healthy") {
        throw new Error("The saved connection did not pass signed verification.");
      }
    };
    const active = connections.filter((connection) => connection.isActive);
    if (
      active.length === 1 &&
      ["connected", "healthy", "error"].includes(active[0].status) &&
      active[0].hasCredentials
    ) {
      await verifySavedConnection(active[0].connectionId);
      await maintainFleetMediaIndex(client, active[0].connectionId, request.deploymentOrigin, run, report);
      report("complete", "Controller connection and media deletion safety verified. The site is ready.");
      return active[0].connectionId;
    }
    if (active.length)
      throw new Error(
        "An existing controller connection is pending or needs repair. Reconcile it before retrying initialization.",
      );
    const created = (await client.action(
      makeFunctionReference<"action">("connections/actions:create"),
      {
        instanceId: request.instanceId,
        name: request.connectionName,
        ...(request.accountLabel ? { accountLabel: request.accountLabel } : {}),
        deploymentAdminKey: adminKey,
      },
    )) as { connectionId: string; status: string };
    if (!created || typeof created.connectionId !== "string" || !created.connectionId) throw Error("The connection was not created.");
    // Current control planes verify inside create. Older compatible control
    // planes returned only connected, so require the signed test explicitly.
    if (created.status !== "healthy") await verifySavedConnection(created.connectionId);
    await maintainFleetMediaIndex(client, created.connectionId, request.deploymentOrigin, run, report);
    report("complete", "Controller connection and media deletion safety verified. The site is ready.");
    return String(created.connectionId);
  } catch (error) {
    throw new Error(redactDeployLog(describeFailure(error), secrets));
  }
}

async function maintainFleetMediaIndex(
  client: import("convex/browser").ConvexHttpClient, connectionId: string, deploymentOrigin: string,
  run: RunState, report: (phase: Phase, message: string) => void,
): Promise<void> {
  const { makeFunctionReference } = await import("convex/server");
  const signal = controllers.get(run.runId)?.signal;
  report("media-index", "Building resumable media deletion safety.");
  for (let batch = 0; batch < 200; batch++) {
    signal?.throwIfAborted();
    const progress = parseMediaIndexProgress(await client.action(
      makeFunctionReference<"action">("siteBroker/mediaIndex:maintain"),
      { connectionId, expectedDeploymentOrigin: deploymentOrigin },
    ));
    signal?.throwIfAborted();
    getJournal().recordMediaIndex(run.runId, progress);
    report("media-index", `${progress.completedOwners} of ${progress.totalOwners} content groups checked; ${progress.documents} records indexed.`);
    if (progress.status === "ready") return;
    if (progress.status !== "building") throw Error("Media indexing paused safely. Open Media deletion safety to inspect and resume; the backend remains deployed.");
  }
  throw Error("Media indexing paused at its bounded maintenance limit. Retry to resume saved progress.");
}

/** Resolve credentials once, before choosing the target lock. Never returns them to the renderer. */
async function prepareDeploy(
  request: SiteDeployRequest,
  event: Electron.IpcMainInvokeEvent,
): Promise<{ request: SiteDeployRequest; targetOrigin: string; secrets: string[] } | null> {
  const credential = request.credential;
  if (credential.kind === "prompt") {
    const adminKey = await requestDeploymentCredential(BrowserWindow.fromWebContents(event.sender));
    return adminKey
      ? {
          request: {
            ...request,
            credential: {
              kind: "admin-key",
              deploymentOrigin: credential.deploymentOrigin,
              adminKey,
            },
          },
          targetOrigin: credential.deploymentOrigin,
          secrets: [adminKey],
        }
      : null;
  }
  if (credential.kind === "control-plane") {
    const controlPlaneUrl = configStore.get("convexUrl");
    if (typeof controlPlaneUrl !== "string" || !controlPlaneUrl.trim())
      throw new Error("The ConvexPress control plane is not configured.");
    const { ConvexHttpClient } = await import("convex/browser");
    const { makeFunctionReference } = await import("convex/server");
    const client = new ConvexHttpClient(mapDeploymentOrigin(controlPlaneUrl.trim()), {
      fetch: boundedFetch,
    });
    client.setAuth(credential.authToken);
    const issued = (await client.action(
      makeFunctionReference<"action">("connections/siteAuth:issueDeploymentCredential"),
      { connectionId: credential.connectionId },
    )) as { deploymentOrigin: string; deploymentAdminKey: string };
    const targetOrigin = parseDeploymentOrigin(issued.deploymentOrigin);
    return {
      request: {
        ...request,
        credential: {
          kind: "admin-key",
          deploymentOrigin: targetOrigin,
          adminKey: issued.deploymentAdminKey,
        },
      },
      targetOrigin,
      secrets: [credential.authToken, issued.deploymentAdminKey],
    };
  }
  if (credential.kind === "admin-key")
    return { request, targetOrigin: credential.deploymentOrigin, secrets: [credential.adminKey] };
  if (credential.kind === "bundled")
    return {
      request,
      targetOrigin: credential.convexUrl,
      secrets: [readBundledDeployCredential()?.deployKey ?? ""],
    };
  const name = credential.deployment.replace(/^(?:dev|prod):/, "");
  if (!/^[a-z0-9-]+$/.test(name)) throw new Error("Invalid cloud deployment name");
  return { request, targetOrigin: `https://${name}.convex.cloud`, secrets: [credential.deployKey] };
}

async function perform(run: RunState, secrets: string[], work: () => Promise<string | void>) {
  const controller = new AbortController();
  controllers.set(run.runId, controller);
  const timer = setTimeout(() => controller.abort(), 30 * 60_000);
  let error: string | null = null;
  let connectionId: string | null = null;
  try {
    connectionId = (await work()) ?? null;
    getJournal().finish(run.runId, true, connectionId);
  } catch (failure) {
    error = redactDeployLog(describeFailure(failure), secrets);
    getJournal().finish(run.runId, false);
    broadcast({
      runId: run.runId,
      targetOrigin: run.targetOrigin,
      phase: "failed",
      message: error,
      at: Date.now(),
    });
  } finally {
    clearTimeout(timer);
    controllers.delete(run.runId);
  }
  return {
    runId: run.runId,
    ok: run.ok === true,
    cancelled: controller.signal.aborted,
    error,
    log: run.log.slice(-60),
    connectionId,
  };
}

export function registerSiteDeployHandlers(): void {
  ipcMain.handle("site-deploy:status", (event, input?: { deploymentOrigin?: string }) => {
    assertSender(event);
    return getJournal().status(
      input?.deploymentOrigin ? parseDeploymentOrigin(input.deploymentOrigin) : undefined,
    );
  });
  ipcMain.handle("site-deploy:history", (event) => {
    assertSender(event);
    return getJournal().history();
  });
  ipcMain.handle("site-deploy:cancel", (event, runId: string) => {
    assertSender(event);
    const controller = controllers.get(runId);
    controller?.abort();
    return { cancelled: Boolean(controller) };
  });
  ipcMain.handle("site-deploy:run", async (event, rawInput: unknown) => {
    assertSender(event);
    const original = assertSiteDeployRequest(rawInput);
    const prepared = await prepareDeploy(original, event);
    if (!prepared) return { runId: null, ok: false, cancelled: true, error: null, log: [] };
    const run = getJournal().begin({ kind: "deploy", targetOrigin: prepared.targetOrigin });
    return perform(
      run,
      [...prepared.secrets, ...prepared.request.envChanges.map((change) => change.value ?? "")],
      async () => {
        await execute(prepared.request, run, null);
        if (!original.envOnly && original.credential.kind === "control-plane") {
          const { ConvexHttpClient } = await import("convex/browser");
          const controlOrigin = configStore.get("convexUrl");
          if (typeof controlOrigin !== "string") throw Error("Control plane is unavailable for media indexing.");
          const client = new ConvexHttpClient(mapDeploymentOrigin(controlOrigin), { fetch: (input, init) => boundedFetch(input, { ...init, signal: controllers.get(run.runId)?.signal }) });
          client.setAuth(original.credential.authToken);
          try {
            const report = reporter(run, prepared.secrets);
            await maintainFleetMediaIndex(client, original.credential.connectionId, prepared.targetOrigin, run, report);
            report("complete", "Backend deployed and media deletion safety verified.");
          } finally { client.clearAuth(); }
        }
      },
    );
  });
  ipcMain.handle("site-deploy:initialize", async (event, rawInput: unknown) => {
    assertSender(event);
    const request = assertSiteInitializeRequest(rawInput);
    const controlPlaneUrl = configStore.get("convexUrl");
    if (typeof controlPlaneUrl !== "string" || !controlPlaneUrl.trim())
      throw new Error("The ConvexPress control plane is not configured.");
    const { ConvexHttpClient } = await import("convex/browser");
    const { makeFunctionReference } = await import("convex/server");
    const client = new ConvexHttpClient(mapDeploymentOrigin(controlPlaneUrl.trim()), { fetch: boundedFetch });
    client.setAuth(request.authToken);
    const cloudCredential = await client.action(
      makeFunctionReference<"action">("hosting/deploy:credential"),
      { instanceId: request.instanceId },
    );
    const adminKey = validateCloudInitializeCredential(cloudCredential, request)
      ?? await requestDeploymentCredential(BrowserWindow.fromWebContents(event.sender));
    if (!adminKey)
      return { runId: null, ok: false, cancelled: true, error: null, log: [], connectionId: null };
    const run = getJournal().begin({
      kind: "initialize",
      targetOrigin: request.deploymentOrigin,
      identity: {
        websiteKey: request.websiteKey,
        instanceKey: request.instanceKey,
        instanceId: request.instanceId,
        managementOrigin: request.managementOrigin,
        siteOrigin: request.siteOrigin,
      },
    });
    return perform(run, [adminKey, request.authToken], () =>
      initializeSite(request, adminKey, controlPlaneUrl.trim(), run),
    );
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
  for (const channel of ["status", "history", "cancel", "run", "initialize", "bundled-credential"])
    ipcMain.removeHandler(`site-deploy:${channel}`);
}
