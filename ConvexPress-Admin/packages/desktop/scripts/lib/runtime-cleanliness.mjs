import { execFile } from "node:child_process";
import { readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export const RESERVED_ACCEPTANCE_PORTS = new Set([
  4105,
  4106,
  4720,
  4721,
  4820,
  4821,
  4830,
  4831,
  4840,
  4841,
  4850,
  4851,
  4920,
  4921,
]);

function isWithinPath(candidate, root) {
  const normalizedRoot = resolve(root);
  const normalizedCandidate = resolve(candidate);
  return (
    normalizedCandidate === normalizedRoot ||
    normalizedCandidate.startsWith(`${normalizedRoot}${sep}`)
  );
}

export function processBelongsToCheckout(processInfo, checkoutRoot) {
  if (processInfo.cwd && isWithinPath(processInfo.cwd, checkoutRoot)) return true;
  const root = resolve(checkoutRoot);
  return (
    processInfo.command === root ||
    processInfo.command.includes(`${root}${sep}`)
  );
}

function isManagedApplicationRuntime(processInfo) {
  return /(?:^|[/\s])(?:electron|Electron)(?:[./\s]|$)|\b(?:vite|turbo)\b|\bconvex\s+(?:dev|local)|packages\/desktop\/scripts\/dev\.mjs|playwright-[\w-]+-acceptance\.mjs|serve-built\.mjs|setInterval\(\(\)=>\{\},1000\)/u.test(
    processInfo.command,
  );
}

function descendantPids(processes, roots) {
  const owned = new Set(roots);
  let changed = true;
  while (changed) {
    changed = false;
    for (const processInfo of processes) {
      if (!owned.has(processInfo.pid) && owned.has(processInfo.ppid)) {
        owned.add(processInfo.pid);
        changed = true;
      }
    }
  }
  return owned;
}

export function assessRuntimeCleanliness({
  checkoutRoot,
  excludedPids,
  processes,
  listeners,
  localDatabasePaths,
  staleProfilePaths,
}) {
  const directOwned = processes
    .filter((entry) => !excludedPids.has(entry.pid))
    .filter((entry) => processBelongsToCheckout(entry, checkoutRoot))
    .filter(isManagedApplicationRuntime)
    .map((entry) => entry.pid);
  const ownedPids = descendantPids(processes, directOwned);
  const ownedProcesses = processes
    .filter((entry) => ownedPids.has(entry.pid) && !excludedPids.has(entry.pid))
    .sort((left, right) => left.pid - right.pid);
  const reservedListeners = listeners.filter((entry) =>
    RESERVED_ACCEPTANCE_PORTS.has(entry.port),
  );
  return {
    clean:
      ownedProcesses.length === 0 &&
      reservedListeners.length === 0 &&
      localDatabasePaths.length === 0 &&
      staleProfilePaths.length === 0,
    ownedProcesses,
    totalOwnedRssKb: ownedProcesses.reduce(
      (total, entry) => total + entry.rssKb,
      0,
    ),
    reservedListeners,
    localDatabasePaths,
    staleProfilePaths,
  };
}

function parseProcesses(output, cwdByPid) {
  return output
    .split("\n")
    .map((line) => line.match(/^\s*(\d+)\s+(\d+)\s+(\d+)\s+(.+)$/u))
    .filter(Boolean)
    .map((match) => ({
      pid: Number(match[1]),
      ppid: Number(match[2]),
      rssKb: Number(match[3]),
      command: match[4],
      cwd: cwdByPid.get(Number(match[1])) ?? "",
    }));
}

function parseLsofRecords(output) {
  const records = [];
  let current;
  for (const line of output.split("\n")) {
    if (line.startsWith("p")) {
      current = { pid: Number(line.slice(1)), command: "", names: [] };
      records.push(current);
    } else if (current && line.startsWith("c")) {
      current.command = line.slice(1);
    } else if (current && line.startsWith("n")) {
      current.names.push(line.slice(1));
    }
  }
  return records;
}

async function commandOutput(command, args) {
  try {
    return (await execFileAsync(command, args, { maxBuffer: 16 * 1024 * 1024 }))
      .stdout;
  } catch (error) {
    if (typeof error?.stdout === "string") return error.stdout;
    throw error;
  }
}

async function collectFiles(root) {
  const files = [];
  const stack = [root];
  while (stack.length) {
    const current = stack.pop();
    let entries;
    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch (error) {
      if (error?.code === "ENOENT") continue;
      throw error;
    }
    for (const entry of entries) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) stack.push(path);
      else files.push(path);
    }
  }
  return files;
}

function ancestorPids(processes, startingPid) {
  const byPid = new Map(processes.map((entry) => [entry.pid, entry]));
  const excluded = new Set();
  let current = startingPid;
  while (current && !excluded.has(current)) {
    excluded.add(current);
    current = byPid.get(current)?.ppid;
  }
  return excluded;
}

export async function inspectRuntimeCleanliness({
  checkoutRoot = resolve(
    dirname(fileURLToPath(import.meta.url)),
    "../../../../..",
  ),
} = {}) {
  const cwdOutput = await commandOutput("lsof", [
    "-n",
    "-a",
    "-d",
    "cwd",
    "-F",
    "pcn",
  ]);
  const listenerOutput = await commandOutput("lsof", [
    "-nP",
    "-iTCP",
    "-sTCP:LISTEN",
    "-F",
    "pcn",
  ]);
  const psOutput = await commandOutput("ps", [
    "-axo",
    "pid=,ppid=,rss=,command=",
  ]);
  const cwdByPid = new Map(
    parseLsofRecords(cwdOutput).flatMap((record) =>
      record.names.length ? [[record.pid, record.names[0]]] : [],
    ),
  );
  const processes = parseProcesses(psOutput, cwdByPid);
  const listeners = parseLsofRecords(listenerOutput).flatMap((record) =>
    record.names.flatMap((name) => {
      const match = name.match(/:(\d+)(?:\s|$)/u);
      return match
        ? [{ pid: record.pid, port: Number(match[1]), command: record.command }]
        : [];
    }),
  );
  const localDatabasePaths = (
    await Promise.all(
      [
        join(checkoutRoot, "ConvexPress-Admin/.convex/local"),
        join(checkoutRoot, "ConvexPress-Admin/packages/control-plane/.convex/local"),
        join(checkoutRoot, "ConvexPress-Admin/temp/site-fixtures"),
        join(checkoutRoot, "ConvexPress-Admin/temp/client-handoff-controller"),
      ].map(collectFiles),
    )
  ).flat();
  const staleProfilePaths = (await readdir(tmpdir(), { withFileTypes: true }))
    .filter(
      (entry) =>
        entry.isDirectory() &&
        entry.name.startsWith("convexpress-") &&
        entry.name.includes("electron"),
    )
    .map((entry) => join(tmpdir(), entry.name));

  return assessRuntimeCleanliness({
    checkoutRoot,
    excludedPids: ancestorPids(processes, process.pid),
    processes,
    listeners,
    localDatabasePaths,
    staleProfilePaths,
  });
}
