import { spawn } from "node:child_process";
import {
  resolveProvisioningCommand,
  type ProvisioningRuntimeContext,
} from "../ipc/provisioningRuntime.js";

export interface DeploymentProcessOptions {
  cwd: string;
  env: NodeJS.ProcessEnv;
  requireCompleteOutput?: boolean;
  onLine?: (line: string) => void;
  timeoutMs?: number;
  onSpawn?: (pid: number) => void;
  onClose?: () => void;
  signal?: AbortSignal;
  runtime?: ProvisioningRuntimeContext;
}

/** Bounded command execution; settle only once the process and its pipes close. */
export function runDeploymentProcess(
  command: string,
  args: string[],
  options: DeploymentProcessOptions,
): Promise<{ code: number; stdout: string; stderr: string }> {
  if (options.signal?.aborted) return Promise.reject(new Error("Deployment command cancelled"));
  const resolved = resolveProvisioningCommand(command, args, options, options.runtime);
  return new Promise((resolve, reject) => {
    const child = spawn(resolved.command, resolved.args, {
      cwd: options.cwd,
      env: resolved.env,
      stdio: ["ignore", "pipe", "pipe"],
      detached: process.platform !== "win32",
    });
    let stdout = "";
    let stderr = "";
    let stopped: Error | null = null;
    let killTimer: ReturnType<typeof setTimeout> | undefined;
    const kill = (signal: NodeJS.Signals) => {
      if (!child.pid) return;
      try {
        if (process.platform === "win32")
          spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
        else process.kill(-child.pid, signal);
      } catch {
        /* process already exited */
      }
    };

    const stop = (reason: string) => {
      if (stopped) return;
      stopped = new Error(reason);
      kill("SIGTERM");
      killTimer = setTimeout(() => kill("SIGKILL"), 1000);
    };
    const timeoutMs = options.timeoutMs ?? 10 * 60_000;
    const timeout = setTimeout(
      () => stop(`Deployment command timed out after ${timeoutMs}ms`),
      timeoutMs,
    );
    const abort = () => stop("Deployment command cancelled");
    options.signal?.addEventListener("abort", abort, { once: true });
    if (options.signal?.aborted) abort();
    try {
      if (child.pid) options.onSpawn?.(child.pid);
    } catch {
      stop("Could not persist deployment process receipt");
    }
    const forward = (chunk: Buffer, isError: boolean) => {
      const text = chunk.toString();
      if (options.requireCompleteOutput && !isError && stdout.length + text.length > 262144) {
        stop("Deployment command output exceeded the safe capture limit");
        return;
      }
      if (isError) stderr = (stderr + text).slice(-262144);
      else stdout = (stdout + text).slice(-262144);
      try {
        for (const line of text.split(/\r?\n/))
          if (line.trim()) options.onLine?.(line.trim().slice(0, 8192));
      } catch {
        stop("Could not record deployment progress");
      }
    };
    child.stdout.on("data", (chunk: Buffer) => forward(chunk, false));
    child.stderr.on("data", (chunk: Buffer) => forward(chunk, true));
    child.on("error", (error) => {
      stopped ??= error;
    });
    child.on("close", (code) => {
      clearTimeout(timeout);
      if (killTimer) {
        kill("SIGKILL");
        clearTimeout(killTimer);
      }
      options.signal?.removeEventListener("abort", abort);
      try {
        options.onClose?.();
      } catch {
        stopped ??= new Error("Could not persist deployment process completion");
      }
      if (stopped) reject(stopped);
      else resolve({ code: code ?? 1, stdout, stderr });
    });
  });
}
