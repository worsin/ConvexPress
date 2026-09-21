#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
const app = resolve(dirname(fileURLToPath(import.meta.url)), "../apps/web");
for (const args of [["x", "vite", "build", "--config", "vite.template-smoke.config.ts"], [".template-smoke/template-smoke.mjs"]]) {
  const result = spawnSync("bun", args, { cwd: app, stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
