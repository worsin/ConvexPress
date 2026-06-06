import { configStore } from "./config.js";
import { spawn } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { generateKeyPairSync, randomBytes } from "node:crypto";
import { SETUP_CREDENTIAL_HANDOFF_TTL_MS } from "../launchRoute.js";
import {
  validateProductionDeployKey,
  validateSetupConfig,
} from "./setupValidation.js";
import { isExactWizardSender } from "./setupSender.js";
import type { SetupValidationConfig } from "./setupValidation.js";

const { ipcMain } = require("electron") as typeof import("electron");

interface SetupConfig extends SetupValidationConfig {
  mode: "server" | "client";
  convexUrl: string;
  adminKey?: string;
  siteName?: string;
}

type ProgressPhase =
  | "validating"
  | "environment"
  | "codegen"
  | "deploy"
  | "saving"
  | "complete";

function getWizardIndexPath(): string {
  return path.join(__dirname, "wizard", "index.html");
}

function deriveDeployment(config: SetupConfig): {
  deployKey: string;
  deployment: string;
} {
  return validateProductionDeployKey(config.adminKey, config.convexUrl);
}

function resolveBackendRoot(): string {
  const candidates = [
    path.resolve(__dirname, "../../backend"),
    path.resolve(process.cwd(), "../backend"),
    path.resolve(process.cwd(), "../../packages/backend"),
  ];

  for (const candidate of candidates) {
    if (
      existsSync(path.join(candidate, "package.json")) &&
      existsSync(path.join(candidate, "convex"))
    ) {
      return candidate;
    }
  }

  throw new Error(
    "Could not find the Convex backend source. Reinstall from a full ConvexPress checkout and try again.",
  );
}

function generateAuthPrivateKey(): string {
  const { privateKey } = generateKeyPairSync("ec", {
    namedCurve: "P-256",
  });

  return privateKey.export({
    type: "pkcs8",
    format: "pem",
  }) as string;
}

function generateFirstAdminSetupSecret(): string {
  return randomBytes(32).toString("base64url");
}

function parseEnvFile(filePath: string): Record<string, string> {
  if (!existsSync(filePath)) return {};

  const env: Record<string, string> = {};
  const raw = readFileSync(filePath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(trimmed);
    if (!match) continue;

    const [, key, rawValue] = match;
    let value = rawValue.trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[key] = value.replace(/\\n/g, "\n");
  }
  return env;
}

function loadLocalEnv(backendRoot: string): Record<string, string> {
  const candidates = [
    path.resolve(backendRoot, ".env.local"),
    path.resolve(backendRoot, "../../.env.local"),
    path.resolve(backendRoot, "../../apps/web/.env.local"),
    path.resolve(backendRoot, "../../apps/web/.env"),
  ];

  return candidates.reduce<Record<string, string>>(
    (merged, filePath) => ({ ...merged, ...parseEnvFile(filePath) }),
    {},
  );
}

function readEnvValue(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

function readSetupEnvValue(
  name: string,
  localEnv: Record<string, string>,
): string | undefined {
  const processValue = readEnvValue(name);
  if (processValue) return processValue;
  const localValue = localEnv[name]?.trim();
  return localValue ? localValue : undefined;
}

function envFileValue(value: string): string {
  return JSON.stringify(value);
}

function inferClerkIssuerDomain(
  localEnv: Record<string, string>,
): string | undefined {
  const explicit = readSetupEnvValue("CLERK_JWT_ISSUER_DOMAIN", localEnv);
  if (explicit) return explicit;

  const publishableKey = readSetupEnvValue(
    "VITE_CLERK_PUBLISHABLE_KEY",
    localEnv,
  );
  if (!publishableKey) return undefined;

  const encoded = publishableKey.replace(/^pk_(test|live)_/, "");
  try {
    const decoded = Buffer.from(encoded, "base64").toString("utf8");
    const host = decoded.replace(/\$$/, "").trim();
    if (!host) return undefined;
    return host.startsWith("http") ? host : `https://${host}`;
  } catch {
    return undefined;
  }
}

function createBackendEnvFile(
  convexSiteUrl: string,
  backendRoot: string,
  firstAdminSetupSecret?: string,
): {
  filePath: string;
  cleanup: () => void;
} {
  const localEnv = loadLocalEnv(backendRoot);
  const tempDir = mkdtempSync(path.join(tmpdir(), "convexpress-setup-"));
  const filePath = path.join(tempDir, "convex-env.local");
  const envVars: Record<string, string> = {
    AUTH_PRIVATE_KEY:
      readSetupEnvValue("AUTH_PRIVATE_KEY", localEnv) ?? generateAuthPrivateKey(),
    AUTH_ISSUER_URL: convexSiteUrl,
    AUTH_ALLOWED_ORIGINS:
      readSetupEnvValue("AUTH_ALLOWED_ORIGINS", localEnv) ??
      "http://localhost:4105,http://127.0.0.1:4105",
    AUTH_ALLOW_NULL_ORIGIN:
      readSetupEnvValue("AUTH_ALLOW_NULL_ORIGIN", localEnv) ?? "true",
  };

  if (firstAdminSetupSecret) {
    envVars.FIRST_ADMIN_SETUP_SECRET = firstAdminSetupSecret;
  }

  const clerkSecret = readSetupEnvValue("CLERK_SECRET_KEY", localEnv);
  if (clerkSecret) envVars.CLERK_SECRET_KEY = clerkSecret;

  const clerkIssuerDomain = inferClerkIssuerDomain(localEnv);
  if (clerkIssuerDomain) envVars.CLERK_JWT_ISSUER_DOMAIN = clerkIssuerDomain;

  const siteUrl = readSetupEnvValue("SITE_URL", localEnv);
  if (siteUrl) envVars.SITE_URL = siteUrl;

  const contents = Object.entries(envVars)
    .map(([key, value]) => `${key}=${envFileValue(value)}`)
    .join("\n");

  writeFileSync(filePath, `${contents}\n`, { mode: 0o600 });

  return {
    filePath,
    cleanup: () => rmSync(tempDir, { recursive: true, force: true }),
  };
}

function runCommand(
  command: string,
  args: string[],
  options: {
    cwd: string;
    env: NodeJS.ProcessEnv;
    onOutput?: (message: string) => void;
  },
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stderr = "";

    child.stdout.on("data", (data: Buffer) => {
      const message = data.toString().trim();
      if (message) options.onOutput?.(message);
    });

    child.stderr.on("data", (data: Buffer) => {
      const message = data.toString().trim();
      if (message) {
        stderr += `${message}\n`;
        options.onOutput?.(message);
      }
    });

    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(
        new Error(
          `${command} ${args.join(" ")} failed ${
            signal ? `with signal ${signal}` : `with exit code ${code}`
          }${stderr ? `: ${stderr.trim()}` : ""}`,
        ),
      );
    });
  });
}

async function deployServerBackend(
  config: SetupConfig,
  convexSiteUrl: string,
  firstAdminSetupSecret: string,
  sendProgress: (phase: ProgressPhase, message: string) => void,
): Promise<void> {
  const { deployKey, deployment } = deriveDeployment(config);
  const backendRoot = resolveBackendRoot();
  const env = {
    ...process.env,
    CONVEX_DEPLOYMENT: deployment,
    CONVEX_DEPLOY_KEY: deployKey,
  };

  sendProgress("environment", "Preparing backend environment.");
  const envFile = createBackendEnvFile(
    convexSiteUrl,
    backendRoot,
    firstAdminSetupSecret,
  );

  try {
    sendProgress("environment", "Syncing required backend environment variables.");
    await runCommand(
      "bunx",
      ["convex", "env", "set", "--from-file", envFile.filePath, "--force"],
      {
        cwd: backendRoot,
        env,
        onOutput: (message) =>
          console.log(`[Setup IPC] Convex env: ${message}`),
      },
    );
  } finally {
    envFile.cleanup();
  }

  sendProgress("codegen", "Regenerating extension schema index.");
  await runCommand("node", ["scripts/generate-extension-index.mjs"], {
    cwd: backendRoot,
    env,
    onOutput: (message) => console.log(`[Setup IPC] Codegen: ${message}`),
  });

  sendProgress("deploy", "Deploying Convex backend code.");
  await runCommand(
    "bunx",
    [
      "convex",
      "deploy",
      "--typecheck",
      "disable",
      "--message",
      "ConvexPress desktop setup wizard",
    ],
    {
      cwd: backendRoot,
      env,
      onOutput: (message) =>
        console.log(`[Setup IPC] Convex deploy: ${message}`),
    },
  );
}

export function registerSetupHandlers(): void {
  // Channel: "setup:complete" -- called by the wizard via preload's
  // convexpressSetup.saveConfig(). Saves config and marks setup as done.
  ipcMain.handle(
    "setup:complete",
    async (event, config: SetupConfig): Promise<{ success: boolean; error?: string }> => {
      const sendProgress = (phase: ProgressPhase, message: string) => {
        event.sender.send("setup:progress", { phase, message });
      };

      try {
        if (!isExactWizardSender(event.sender.getURL(), getWizardIndexPath())) {
          throw new Error("Setup configuration can only be saved from the setup wizard.");
        }

        sendProgress("validating", "Validating setup configuration.");
        const validated = validateSetupConfig(config);
        const firstAdminSetupSecret =
          validated.mode === "server"
            ? generateFirstAdminSetupSecret()
            : undefined;

        if (validated.mode === "server") {
          await deployServerBackend(
            config,
            validated.convexSiteUrl,
            firstAdminSetupSecret!,
            sendProgress,
          );
        }

        sendProgress("saving", "Saving local desktop configuration.");
        configStore.set("mode", validated.mode);
        configStore.set("convexUrl", validated.convexUrl);
        configStore.set("convexSiteUrl", validated.convexSiteUrl);

        // The production deploy key is needed only for the setup-time deploy.
        // Do not persist it into the renderer-readable desktop config store.
        configStore.delete("adminKey");
        if (config.siteName) {
          configStore.set("siteName", config.siteName);
        }

        const handoffCreatedAt = Date.now();
        const handoffExpiresAt =
          handoffCreatedAt + SETUP_CREDENTIAL_HANDOFF_TTL_MS;

        if (validated.pendingAdminCredentials) {
          configStore.set(
            "pendingAdminCredentials",
            {
              ...validated.pendingAdminCredentials,
              setupToken: firstAdminSetupSecret,
              createdAt: handoffCreatedAt,
              expiresAt: handoffExpiresAt,
            },
          );
        } else {
          configStore.delete("pendingAdminCredentials");
        }

        if (validated.pendingLoginCredentials) {
          configStore.set(
            "pendingLoginCredentials",
            {
              ...validated.pendingLoginCredentials,
              createdAt: handoffCreatedAt,
              expiresAt: handoffExpiresAt,
            },
          );
        } else {
          configStore.delete("pendingLoginCredentials");
        }

        configStore.set("setupComplete", true);
        sendProgress("complete", "Setup configuration saved.");
        console.log(
          `[Setup IPC] Config saved: mode=${validated.mode}, url=${validated.convexUrl}`,
        );
        return { success: true };
      } catch (error) {
        console.error("[Setup IPC] Failed to save config:", error);
        return { success: false, error: String(error) };
      }
    },
  );
}

export function unregisterSetupHandlers(): void {
  ipcMain.removeHandler("setup:complete");
}
