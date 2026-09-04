/**
 * SiteRunnerManager — owns the storefront processes started from the admin.
 *
 * Every process is a `bun run dev` of the shared ConvexPress-Website checkout
 * with its own port, Vite cache directory and Convex target. Processes are
 * spawned in their own process group so stopping one takes its whole tree,
 * and the manager stops everything when the app quits.
 */

import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import http from "node:http";
import path from "node:path";

import {
  buildStorefrontEnv,
  cacheDirName,
  choosePort,
  localSiteUrl,
  siteProcessKey,
  type SiteProcessState,
  type SiteRunnerTarget,
} from "./siteRunnerValidation.js";

const LOG_LINES = 300;
const READY_TIMEOUT_MS = 180_000;
const READY_POLL_MS = 500;
const STOP_GRACE_MS = 6_000;

interface ManagedProcess {
  state: SiteProcessState;
  child: ChildProcess | null;
  logs: string[];
  readyPromise: Promise<void> | null;
}

export interface SiteRunnerManagerOptions {
  /** Absolute path of the ConvexPress-Website checkout. */
  websiteRepoPath: () => string | null;
  /** Directory for per-process Vite caches (inside userData). */
  cacheRoot: () => string;
  adminAppUrl: () => string | undefined;
  rememberedPort: (key: string) => number | null;
  rememberPort: (key: string, port: number) => void;
  onChange: (state: SiteProcessState) => void;
  log: (line: string) => void;
}

function nowIso(): string {
  return new Date().toISOString().slice(11, 19);
}

function isAlive(child: ChildProcess | null): boolean {
  return !!child && child.exitCode === null && child.signalCode === null;
}

function signalTree(child: ChildProcess, signal: NodeJS.Signals): void {
  if (!child.pid) return;
  if (process.platform !== "win32") {
    try {
      process.kill(-child.pid, signal);
      return;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ESRCH") {
        // fall through to a direct signal
      }
    }
  }
  if (isAlive(child)) child.kill(signal);
}

function probe(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    const request = http.get(url, { timeout: 4_000 }, (response) => {
      response.resume();
      resolve((response.statusCode ?? 500) < 500);
    });
    request.on("timeout", () => {
      request.destroy();
      resolve(false);
    });
    request.on("error", () => resolve(false));
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class SiteRunnerManager {
  private readonly processes = new Map<string, ManagedProcess>();

  constructor(private readonly options: SiteRunnerManagerOptions) {}

  list(): SiteProcessState[] {
    return [...this.processes.values()].map((entry) => ({ ...entry.state }));
  }

  get(key: string): SiteProcessState | null {
    const entry = this.processes.get(key);
    return entry ? { ...entry.state } : null;
  }

  logs(key: string): string[] {
    return [...(this.processes.get(key)?.logs ?? [])];
  }

  private takenPorts(exceptKey?: string): number[] {
    return [...this.processes.values()]
      .filter((entry) => entry.state.key !== exceptKey && entry.state.status !== "stopped" && entry.state.status !== "failed")
      .map((entry) => entry.state.port);
  }

  private emit(entry: ManagedProcess): void {
    this.options.onChange({ ...entry.state });
  }

  private appendLog(entry: ManagedProcess, chunk: string): void {
    const lines = chunk
      .split(/\r?\n/)
      .map((line) => line.replace(/\[[0-9;]*m/g, "").trimEnd())
      .filter(Boolean);
    if (!lines.length) return;
    for (const line of lines) {
      entry.logs.push(`${nowIso()} ${line}`);
    }
    if (entry.logs.length > LOG_LINES) {
      entry.logs.splice(0, entry.logs.length - LOG_LINES);
    }
    entry.state.lastLogLine = lines[lines.length - 1] ?? entry.state.lastLogLine;
    this.emit(entry);
  }

  /**
   * Start (or return) the process for a target and resolve once it answers
   * HTTP. Rejects when the checkout is missing or the process dies early.
   */
  async ensureRunning(target: SiteRunnerTarget): Promise<SiteProcessState> {
    const key = siteProcessKey(target);
    const existing = this.processes.get(key);
    if (existing && (existing.state.status === "running" || existing.state.status === "starting")) {
      if (existing.readyPromise) await existing.readyPromise;
      return { ...existing.state };
    }

    const repo = this.options.websiteRepoPath();
    if (!repo) {
      throw new Error(
        "The ConvexPress-Website checkout is not configured. Choose it under Local storefronts.",
      );
    }
    const appDir = path.join(repo, "apps", "web");
    if (!existsSync(path.join(appDir, "package.json"))) {
      throw new Error(`No storefront app found at ${appDir}.`);
    }

    const port = choosePort(target, {
      remembered: this.options.rememberedPort(key),
      taken: this.takenPorts(key),
    });
    const cacheDir = path.join(this.options.cacheRoot(), cacheDirName(key));
    mkdirSync(cacheDir, { recursive: true });

    const entry: ManagedProcess = {
      state: {
        key,
        instanceKey: target.instanceKey,
        label: target.label,
        mode: target.mode ?? "dev",
        status: "starting",
        port,
        url: localSiteUrl(port),
        convexUrl: target.convexUrl,
        pid: null,
        startedAt: Date.now(),
        exitCode: null,
        error: null,
        lastLogLine: null,
      },
      child: null,
      logs: [],
      readyPromise: null,
    };
    this.processes.set(key, entry);
    this.options.rememberPort(key, port);

    const env: NodeJS.ProcessEnv = {
      ...process.env,
      ...buildStorefrontEnv(target, port, {
        cacheDir,
        adminAppUrl: this.options.adminAppUrl(),
      }),
      FORCE_COLOR: "0",
      CI: "1",
    };
    delete env.ELECTRON_RUN_AS_NODE;

    const command = process.platform === "win32" ? "bun.exe" : "bun";
    // `bun run <script> [args]` forwards the arguments to the script (vite dev).
    const args = ["run", "dev", "--host", "127.0.0.1", "--port", String(port)];
    this.options.log(`[SiteRunner] start ${key} → ${entry.state.url} (${target.convexUrl})`);
    this.appendLog(entry, `$ ${command} ${args.join(" ")}`);

    let child: ChildProcess;
    try {
      child = spawn(command, args, {
        cwd: appDir,
        env,
        stdio: ["ignore", "pipe", "pipe"],
        detached: process.platform !== "win32",
        windowsHide: true,
      });
    } catch (error) {
      entry.state.status = "failed";
      entry.state.error = error instanceof Error ? error.message : String(error);
      this.emit(entry);
      throw error;
    }
    entry.child = child;
    entry.state.pid = child.pid ?? null;
    this.emit(entry);

    child.stdout?.on("data", (data: Buffer) => this.appendLog(entry, data.toString()));
    child.stderr?.on("data", (data: Buffer) => this.appendLog(entry, data.toString()));
    child.on("error", (error) => {
      entry.state.status = "failed";
      entry.state.error = error.message;
      this.appendLog(entry, `process error: ${error.message}`);
    });
    child.on("exit", (code, signal) => {
      const stopping = entry.state.status === "stopping";
      const wasReady = entry.state.status === "running";
      entry.state.exitCode = code;
      entry.state.pid = null;
      entry.state.status = stopping || (wasReady && code === 0) ? "stopped" : "failed";
      if (!stopping && !(wasReady && code === 0)) {
        const tail = entry.logs.slice(-3).map((line) => line.replace(/^\d\d:\d\d:\d\d /, "")).join(" · ");
        entry.state.error = `Storefront exited with ${signal ?? `code ${code}`}${wasReady ? "" : " before it was ready"}.${tail ? ` Last output: ${tail}` : ""}`;
      }
      this.options.log(`[SiteRunner] exit ${key} code=${code} signal=${signal}`);
      this.emit(entry);
    });

    entry.readyPromise = this.waitUntilReady(entry);
    await entry.readyPromise;
    return { ...entry.state };
  }

  private async waitUntilReady(entry: ManagedProcess): Promise<void> {
    const deadline = Date.now() + READY_TIMEOUT_MS;
    while (Date.now() < deadline) {
      if (!isAlive(entry.child)) {
        throw new Error(entry.state.error ?? "Storefront process stopped before it was ready.");
      }
      if (await probe(entry.state.url)) {
        entry.state.status = "running";
        entry.state.error = null;
        this.emit(entry);
        return;
      }
      await sleep(READY_POLL_MS);
    }
    entry.state.status = "failed";
    entry.state.error = "Storefront did not answer within three minutes.";
    this.emit(entry);
    signalTree(entry.child as ChildProcess, "SIGTERM");
    throw new Error(entry.state.error);
  }

  async stop(key: string): Promise<SiteProcessState | null> {
    const entry = this.processes.get(key);
    if (!entry) return null;
    const child = entry.child;
    if (!isAlive(child)) {
      entry.state.status = "stopped";
      this.emit(entry);
      return { ...entry.state };
    }
    entry.state.status = "stopping";
    this.emit(entry);
    signalTree(child as ChildProcess, "SIGTERM");
    const deadline = Date.now() + STOP_GRACE_MS;
    while (Date.now() < deadline && isAlive(child)) {
      await sleep(50);
    }
    if (isAlive(child)) {
      signalTree(child as ChildProcess, "SIGKILL");
      await sleep(200);
    }
    entry.state.status = "stopped";
    entry.state.pid = null;
    this.emit(entry);
    return { ...entry.state };
  }

  async stopAll(): Promise<void> {
    await Promise.all([...this.processes.keys()].map((key) => this.stop(key).catch(() => null)));
  }

  /** Synchronous best-effort shutdown for `before-quit`. */
  killAllSync(): void {
    for (const entry of this.processes.values()) {
      if (isAlive(entry.child)) {
        entry.state.status = "stopping";
        signalTree(entry.child as ChildProcess, "SIGTERM");
      }
    }
  }

  forget(key: string): void {
    const entry = this.processes.get(key);
    if (!entry || isAlive(entry.child)) return;
    this.processes.delete(key);
  }
}
