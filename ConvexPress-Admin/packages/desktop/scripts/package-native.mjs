#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const target = process.argv[2];
const expected = { mac: "darwin", win: "win32", linux: "linux" }[target];
if (!expected || expected !== process.platform) throw new Error("Build this installer on its target operating system so its provisioning tools match the installed app.");
for (const [script, args] of [
  [path.join(root, "scripts/prepare-provisioning.mjs"), []],
  [path.join(root, "scripts/prepare-hosting.mjs"), []],
  [path.join(root, "scripts/prepare-vercel-hosting.mjs"), []],
  [path.join(root, "scripts/check-provisioning-runtime.mjs"), []],
  [createRequire(import.meta.url).resolve("electron-builder/cli.js"), [`--${target}`, `--${process.arch}`, ...process.argv.slice(3)]],
]) {
  const result = spawnSync(process.execPath, [script, ...args], { cwd: root, stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
