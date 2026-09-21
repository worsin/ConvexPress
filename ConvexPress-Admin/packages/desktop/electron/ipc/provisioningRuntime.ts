import { cpSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync } from "node:fs";
import path from "node:path";

export interface ProvisioningRuntimeContext {
  packaged: boolean;
  resourcesPath: string;
  userDataPath: string;
  execPath: string;
}

function runtimeContext(): ProvisioningRuntimeContext {
  const { app } = require("electron") as typeof import("electron");
  return { packaged: app.isPackaged, resourcesPath: process.resourcesPath,
    userDataPath: app.getPath("userData"), execPath: process.execPath };
}

const selectors = ["CONVEX_DEPLOYMENT", "CONVEX_DEPLOY_KEY", "CONVEX_SELF_HOSTED_URL", "CONVEX_SELF_HOSTED_ADMIN_KEY", "CONVEX_AGENT_MODE"] as const;
export function cleanProvisioningEnv(base: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const env = { ...base };
  for (const key of selectors) delete env[key];
  return env;
}

/** The installed app carries its own versioned, writable backend toolchain. */
export function resolvePackagedBackendRoot(context = runtimeContext()): string | null {
  if (!context.packaged) return null;
  const source = path.join(context.resourcesPath, "provisioning");
  const manifest = JSON.parse(readFileSync(path.join(source, "manifest.json"), "utf8")) as { version: number; digest: string };
  if (manifest.version !== 1 || !/^[a-f0-9]{64}$/.test(manifest.digest)) {
    throw new Error("The installed provisioning payload is invalid. Reinstall ConvexPress.");
  }
  const parent = path.join(context.userDataPath, "provisioning");
  const target = path.join(parent, manifest.digest);
  if (!existsSync(path.join(target, "ready.json"))) {
    mkdirSync(parent, { recursive: true });
    const temporary = `${target}.preparing-${process.pid}`;
    rmSync(temporary, { recursive: true, force: true });
    try {
      cpSync(source, temporary, { recursive: true, dereference: false, verbatimSymlinks: true });
      // The payload itself includes the completion marker; a partial copy cannot
      // become visible because publication is a same-volume atomic rename.
      renameSync(temporary, target);
    } finally {
      rmSync(temporary, { recursive: true, force: true });
    }
  }
  const root = path.join(target, "backend");
  if (!existsSync(path.join(root, "convex", "schema.ts"))) throw new Error("The installed backend payload is incomplete.");
  return root;
}

/** Normalize credentials and choose the installed runtime before spawning. */
export function resolveProvisioningCommand(command: string, args: string[], options: {
  cwd: string; env: NodeJS.ProcessEnv;
}, context = runtimeContext()): { command: string; args: string[]; env: NodeJS.ProcessEnv } {
  const env = { ...options.env };
  const normalized = [...args];
  const take = (flag: string): string | undefined => {
    const index = normalized.indexOf(flag);
    if (index < 0) return undefined;
    const value = normalized[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`Missing ${flag} value.`);
    normalized.splice(index, 2);
    return value;
  };
  if (command === "bunx" && normalized[0] === "convex") {
    const url = take("--url");
    const key = take("--admin-key");
    if (url || key) {
      if (!url || !key) throw new Error("A self-hosted deployment requires its URL and admin key.");
      for (const selector of selectors) delete env[selector];
      env.CONVEX_SELF_HOSTED_URL = url;
      env.CONVEX_SELF_HOSTED_ADMIN_KEY = key;
    } else if (env.CONVEX_DEPLOY_KEY) {
      delete env.CONVEX_SELF_HOSTED_URL;
      delete env.CONVEX_SELF_HOSTED_ADMIN_KEY;
    }
    if (context.packaged) {
      const cli = path.join(options.cwd, "node_modules", "convex", "bin", "main.js");
      if (!existsSync(cli)) throw new Error("The installed Convex CLI is missing. Reinstall ConvexPress.");
      normalized[0] = cli;
      if (normalized[1] === "deploy") normalized.push("--typecheck", "enable");
      return { command: context.execPath, args: normalized, env: { ...env, ELECTRON_RUN_AS_NODE: "1" } };
    }
  }
  if (context.packaged && command === "node") {
    return { command: context.execPath, args: normalized, env: { ...env, ELECTRON_RUN_AS_NODE: "1" } };
  }
  return { command, args: normalized, env };
}
