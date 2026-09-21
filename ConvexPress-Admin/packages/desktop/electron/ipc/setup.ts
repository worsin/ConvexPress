import { initializeDeploymentMediaIndex } from "../deployment/mediaIndex.js";
import { configStore } from "./config.js";
import { cleanProvisioningEnv, resolvePackagedBackendRoot } from "./provisioningRuntime.js";
import { runDeploymentProcess } from "../deployment/process.js";
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
  validateDeploymentCredential,
  validateAuthPrivateKey,
  validateSetupConfig,
  type DeploymentCredential,
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

function deriveDeployment(config: SetupConfig): DeploymentCredential {
  return validateDeploymentCredential(config.adminKey, config.convexUrl);
}

/** Names of env vars already present on the deployment (values never read). */
async function listDeploymentEnvNames(
  backendRoot: string,
  env: NodeJS.ProcessEnv,
  targetArgs: string[],
): Promise<Set<string>> {
  const result = await runDeploymentProcess("bunx", ["convex", "env", "list", ...targetArgs], {
    cwd: backendRoot, env, timeoutMs: 60_000, requireCompleteOutput: true,
  });
  if (result.code !== 0) {
    // An unavailable deployment is not an empty deployment. Continuing here
    // could overwrite encryption keys and make existing secrets unreadable.
    throw new Error("Could not verify existing deployment environment. Setup stopped before changing encryption keys.");
  }
  const names = new Set<string>();
  for (const line of result.stdout.split(/\r?\n/)) {
    const match = /^([A-Z][A-Z0-9_]*)=/.exec(line.trim());
    if (match) names.add(match[1]);
  }
  return names;
}

export function resolveBackendRoot(): string {
  const packaged = resolvePackagedBackendRoot();
  if (packaged) return packaged;
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
    "Could not find the Convex backend source. Reinstall ConvexPress or check the development checkout.",
  );
}

/** 32 random bytes as hex: the format `api/crypto_helpers` expects for AES-256-GCM keys. */
export function generateEncryptionKeyHex(): string {
  return randomBytes(32).toString("hex");
}

/** Env keys that protect secrets at rest; generated once, never rotated by setup. */
export const AT_REST_ENCRYPTION_KEYS = [
  "SHIPPING_PROVIDER_ENCRYPTION_KEY",
  "WEBHOOK_SECRET_ENCRYPTION_KEY",
] as const;

export function generateAuthPrivateKey(): string {
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
  existingNames: Set<string> = new Set(),
): {
  filePath: string;
  cleanup: () => void;
} {
  const localEnv = loadLocalEnv(backendRoot);
  const tempDir = mkdtempSync(path.join(tmpdir(), "convexpress-setup-"));
  const filePath = path.join(tempDir, "convex-env.local");
  const configuredAuthPrivateKey = readSetupEnvValue("AUTH_PRIVATE_KEY", localEnv);
  const envVars: Record<string, string> = {
    AUTH_ISSUER_URL: convexSiteUrl,
    AUTH_ALLOWED_ORIGINS:
      readSetupEnvValue("AUTH_ALLOWED_ORIGINS", localEnv) ??
      "http://localhost:4105,http://127.0.0.1:4105",
    AUTH_ALLOW_NULL_ORIGIN:
      readSetupEnvValue("AUTH_ALLOW_NULL_ORIGIN", localEnv) ?? "true",
  };

  // Re-running setup must never rotate a deployment's signing key: that
  // would invalidate every admin session and break website JWT checks for
  // the JWKS cache lifetime. Only set it when the deployment has none.
  if (!existingNames.has("AUTH_PRIVATE_KEY")) {
    envVars.AUTH_PRIVATE_KEY = configuredAuthPrivateKey
      ? validateAuthPrivateKey(configuredAuthPrivateKey)
      : generateAuthPrivateKey();
  }

  // Secrets at rest (integration API keys, shipping credentials, webhook
  // signing secrets) are AES-256-GCM encrypted only when these keys exist.
  // Without them the backend falls back to reversible base64, so a fresh
  // install always gets keys. Like the signing key, they are never rotated
  // here: rotating would make every stored secret undecryptable.
  for (const name of AT_REST_ENCRYPTION_KEYS) {
    if (existingNames.has(name)) continue;
    envVars[name] = readSetupEnvValue(name, localEnv) ?? generateEncryptionKeyHex();
  }

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

async function runCommand(
  command: string,
  args: string[],
  options: { cwd: string; env: NodeJS.ProcessEnv; onOutput?: (message: string) => void },
): Promise<void> {
  const result = await runDeploymentProcess(command, args, { ...options, onLine: options.onOutput });
  if (result.code !== 0) throw new Error(`Provisioning command failed with exit code ${result.code}.`);
}

async function deployServerBackend(
  config: SetupConfig,
  convexSiteUrl: string,
  firstAdminSetupSecret: string,
  sendProgress: (phase: ProgressPhase, message: string) => void,
): Promise<void> {
  const credential = deriveDeployment(config);
  const backendRoot = resolveBackendRoot();
  const env: NodeJS.ProcessEnv = cleanProvisioningEnv(process.env);
  const targetArgs: string[] = [];
  if (credential.kind === "cloud") {
    env.CONVEX_DEPLOYMENT = credential.deployment;
    env.CONVEX_DEPLOY_KEY = credential.deployKey;
  } else {
    targetArgs.push("--url", credential.convexUrl, "--admin-key", credential.adminKey);
  }

  sendProgress("environment", "Checking the deployment's existing environment.");
  const existingNames = await listDeploymentEnvNames(backendRoot, env, targetArgs);

  sendProgress("environment", "Preparing backend environment.");
  const envFile = createBackendEnvFile(
    convexSiteUrl,
    backendRoot,
    firstAdminSetupSecret,
    existingNames,
  );

  try {
    sendProgress("environment", "Syncing required backend environment variables.");
    await runCommand(
      "bunx",
      ["convex", "env", "set", "--from-file", envFile.filePath, "--force", ...targetArgs],
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

  await runCommand("node", ["scripts/generate-media-writer-coverage.mjs", "--check"], {
    cwd: backendRoot, env,
    onOutput: (message) => console.log(`[Setup IPC] Media writer coverage: ${message}`),
  });

  sendProgress("deploy", "Deploying Convex backend code (typechecked).");
  await runCommand(
    "bunx",
    [
      "convex",
      "deploy",
      ...targetArgs,
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
  sendProgress("environment", "Preparing resumable media deletion safety.");
  await initializeDeploymentMediaIndex(targetArgs, { cwd: backendRoot, env });
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
        sendProgress("complete", validated.mode === "server" ? "Setup saved. Media indexing will resume after authorized administrator sign-in." : "Setup configuration saved.");
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
