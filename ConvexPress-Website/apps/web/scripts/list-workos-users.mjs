#!/usr/bin/env node

import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";
import { WorkOS } from "@workos-inc/node";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const webAppRoot = path.resolve(__dirname, "..");

loadEnv({ path: path.join(webAppRoot, ".env.local") });
loadEnv({ path: path.join(webAppRoot, ".env") });

const workosApiKey = process.env.WORKOS_API_KEY;
const workosClientId = process.env.WORKOS_CLIENT_ID;

if (!workosApiKey) {
  console.error("WORKOS_API_KEY is missing in apps/web/.env.local");
  process.exit(1);
}

const workos = new WorkOS({ apiKey: workosApiKey, clientId: workosClientId });
const listed = await workos.userManagement.listUsers({ limit: 100 });

for (const user of listed.data) {
  const fullName = [user.firstName ?? "", user.lastName ?? ""].join(" ").trim();
  const name = fullName || "(no name)";
  console.log(
    `${user.email}\t${user.id}\tverified=${Boolean(user.emailVerified)}\t${name}`,
  );
}
