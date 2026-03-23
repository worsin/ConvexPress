#!/usr/bin/env node

import { execFileSync, spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";
import { WorkOS } from "@workos-inc/node";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const webAppRoot = path.resolve(__dirname, "..");
const websiteRoot = path.resolve(webAppRoot, "..", "..");
const adminBackendRoot = path.resolve(
  websiteRoot,
  "..",
  "ConvexPress-Admin",
  "packages",
  "backend",
);

loadEnv({ path: path.join(webAppRoot, ".env.local") });
loadEnv({ path: path.join(webAppRoot, ".env") });

function parseArgs(argv) {
  const parsed = {
    email: "",
    password: "",
    firstName: "Codex",
    lastName: "Tester",
    role: "admin",
    skipConvexSync: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const current = argv[i];
    const next = argv[i + 1];
    if (current === "--email" && next) {
      parsed.email = next.trim().toLowerCase();
      i += 1;
      continue;
    }
    if (current === "--password" && next) {
      parsed.password = next;
      i += 1;
      continue;
    }
    if (current === "--first-name" && next) {
      parsed.firstName = next.trim();
      i += 1;
      continue;
    }
    if (current === "--last-name" && next) {
      parsed.lastName = next.trim();
      i += 1;
      continue;
    }
    if (current === "--role" && next) {
      parsed.role = next.trim().toLowerCase();
      i += 1;
      continue;
    }
    if (current === "--skip-convex-sync") {
      parsed.skipConvexSync = true;
      continue;
    }
  }

  return parsed;
}

function usage() {
  console.error(
    [
      "Usage:",
      "  bun run auth:provision --email you@example.com --password 'YourStrongPassword123!'",
      "Optional:",
      "  --first-name Codex --last-name Tester --role admin|customer --skip-convex-sync",
    ].join("\n"),
  );
}

function resolveBunExecutable() {
  const envCandidates = [
    process.env.BUN_EXEC_PATH,
    process.env.npm_execpath,
    process.env.npm_node_execpath,
  ];

  const winAppData =
    process.platform === "win32" && process.env.APPDATA
      ? path.join(
          process.env.APPDATA,
          "npm",
          "node_modules",
          "bun",
          "bin",
          "bun.exe",
        )
      : null;

  const candidates = [
    ...envCandidates,
    ...(process.platform === "win32" ? [winAppData, "bun.exe", "bun"] : ["bun"]),
  ];

  for (const candidate of candidates) {
    if (!candidate) continue;
    const probe = spawnSync(candidate, ["--version"], { stdio: "ignore" });
    if (!probe.error && probe.status === 0) {
      return candidate;
    }
  }

  throw new Error(
    "Unable to find Bun executable. Install Bun or set BUN_EXEC_PATH.",
  );
}

function runConvexRun(functionName, payload) {
  const bunExec = resolveBunExecutable();
  execFileSync(
    bunExec,
    ["x", "convex", "run", functionName, JSON.stringify(payload)],
    {
      cwd: adminBackendRoot,
      stdio: "inherit",
      env: process.env,
    },
  );
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.email || !args.password) {
    usage();
    process.exitCode = 1;
    return;
  }

  const role = args.role === "customer" ? "customer" : "admin";
  const workosApiKey = process.env.WORKOS_API_KEY;
  const workosClientId = process.env.WORKOS_CLIENT_ID;

  if (!workosApiKey) {
    console.error("WORKOS_API_KEY is missing. Check ConvexPress-Website/apps/web/.env.local");
    process.exitCode = 1;
    return;
  }

  const workos = new WorkOS({ apiKey: workosApiKey, clientId: workosClientId });

  const listed = await workos.userManagement.listUsers({ email: args.email });
  const existing = listed.data.find(
    (user) => user.email.toLowerCase() === args.email,
  );

  let user;
  if (existing) {
    user = await workos.userManagement.updateUser({
      userId: existing.id,
      email: args.email,
      password: args.password,
      firstName: args.firstName,
      lastName: args.lastName,
      emailVerified: true,
      metadata: {
        ...(existing.metadata ?? {}),
        internalRole: role,
      },
    });
    console.log(`Updated WorkOS user: ${user.email} (${user.id})`);
  } else {
    user = await workos.userManagement.createUser({
      email: args.email,
      password: args.password,
      firstName: args.firstName,
      lastName: args.lastName,
      emailVerified: true,
      metadata: {
        internalRole: role,
      },
    });
    console.log(`Created WorkOS user: ${user.email} (${user.id})`);
  }

  if (!args.skipConvexSync) {
    console.log("Seeding/migrating Convex roles and syncing user role...");
    runConvexRun("roles/internals:seedRoles", {});
    runConvexRun("profiles/internals:syncFromWorkOS", {
      workosUserId: user.id,
      email: user.email,
      firstName: user.firstName ?? undefined,
      lastName: user.lastName ?? undefined,
      profilePictureUrl: user.profilePictureUrl ?? undefined,
      emailVerified: user.emailVerified === true,
      isNewUser: true,
    });
    runConvexRun("roles/internals:migrateLegacyRoles", {});
    if (role === "admin") {
      runConvexRun("users:setAdminByEmail", { email: args.email });
    } else {
      runConvexRun("users:setCustomerByEmail", { email: args.email });
    }
  }

  console.log("\nLogin credentials ready:");
  console.log(`  Email: ${args.email}`);
  console.log("  Password: (the value you passed with --password)");
  console.log("  Website login: http://localhost:4106/login");
  console.log("  Admin login:   http://localhost:4105/");
}

await main();
