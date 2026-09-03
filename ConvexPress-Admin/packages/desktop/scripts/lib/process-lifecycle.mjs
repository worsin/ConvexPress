import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

function hasExited(child) {
  return child.exitCode !== null || child.signalCode !== null;
}

function processGroupExists(pid) {
  if (!pid || process.platform === "win32") return false;
  try {
    process.kill(-pid, 0);
    return true;
  } catch {
    return false;
  }
}

function ownedTreeExists(child, groupOwned) {
  if (!child?.pid) return false;
  if (!groupOwned || process.platform === "win32") return !hasExited(child);
  return processGroupExists(child.pid);
}

async function waitForTreeExit(child, timeoutMs, groupOwned) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!ownedTreeExists(child, groupOwned)) return true;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  return !ownedTreeExists(child, groupOwned);
}

async function signalOwnedTree(child, signal, groupOwned) {
  if (!child?.pid) return;
  if (process.platform === "win32") {
    if (hasExited(child)) return;
    if (signal === "SIGKILL") {
      await execFileAsync("taskkill", ["/PID", String(child.pid), "/T", "/F"]).catch(
        () => undefined,
      );
      return;
    }
    child.kill("SIGTERM");
    return;
  }
  if (groupOwned) {
    try {
      process.kill(-child.pid, signal);
      return;
    } catch (error) {
      if (error?.code !== "ESRCH") throw error;
    }
  }
  if (!hasExited(child)) child.kill(signal);
}

export function ownedSpawnOptions(options = {}) {
  return {
    ...options,
    detached: process.platform !== "win32",
  };
}

export async function terminateOwnedProcess(
  child,
  { label = "owned process", graceMs = 5_000, groupOwned = false } = {},
) {
  if (!child || !ownedTreeExists(child, groupOwned)) {
    return { exited: true, escalated: false };
  }
  await signalOwnedTree(child, "SIGTERM", groupOwned);
  if (await waitForTreeExit(child, graceMs, groupOwned)) {
    return { exited: true, escalated: false };
  }
  await signalOwnedTree(child, "SIGKILL", groupOwned);
  if (!(await waitForTreeExit(child, graceMs, groupOwned))) {
    throw new Error(`${label} did not exit after SIGKILL`);
  }
  return { exited: true, escalated: true };
}

export async function quitOwnedElectron(
  electronApp,
  { label = "Electron acceptance app", graceMs = 5_000 } = {},
) {
  if (!electronApp) return { exited: true, escalated: false };
  const child = electronApp.process();
  if (!ownedTreeExists(child, false)) return { exited: true, escalated: false };
  await electronApp.evaluate(({ app }) => app.exit(0)).catch(() => undefined);
  if (await waitForTreeExit(child, graceMs, false)) {
    return { exited: true, escalated: false };
  }
  return await terminateOwnedProcess(child, { label, graceMs });
}
