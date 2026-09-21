#!/usr/bin/env node
import { cpSync, mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
const desktop = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const temporary = mkdtempSync(path.join(tmpdir(), "convexpress-packaged-runtime-"));
try {
  cpSync(path.join(desktop, "resources/provisioning"), temporary, { recursive: true });
  const manifest = JSON.parse(readFileSync(path.join(temporary, "manifest.json"), "utf8"));
  const cwd = path.join(temporary, "backend");
  const runtime = process.argv.includes("--node") ? process.execPath : require("electron");
  // No developer checkout or host toolchain is reachable through PATH.
  const env = { PATH: "", ELECTRON_RUN_AS_NODE: "1", HOME: process.env.HOME, TMPDIR: process.env.TMPDIR, SystemRoot: process.env.SystemRoot };
  for (const args of [
    [path.join(cwd, "node_modules/convex/bin/main.js"), "--version"],
    ["scripts/generate-extension-index.mjs"],
    ["scripts/generate-local-api.mjs"],
    [path.join(cwd, "node_modules/typescript/bin/tsc"), "--noEmit", "-p", "convex/tsconfig.json"],
    ["-e", "require('esbuild').transformSync('export const ready: number = 1', {loader:'ts'}); console.log('Native bundler ready')"],
  ]) {
    const result = spawnSync(runtime, args, { cwd, env, encoding: "utf8", timeout: 60_000 });
    if (result.status !== 0) throw new Error(`Embedded provisioning runtime failed: ${result.stderr || result.stdout || result.error || result.status}`);
    process.stdout.write(result.stdout);
  }
  console.log(`${process.argv.includes("--node") ? "Isolated Node payload" : "Embedded runtime"} passed with PATH empty (${manifest.platform}/${manifest.arch}, Convex ${manifest.convexVersion}).`);
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
