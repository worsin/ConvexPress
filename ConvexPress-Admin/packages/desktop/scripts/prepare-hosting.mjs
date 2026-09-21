#!/usr/bin/env node
import { readFileSync, writeFileSync, mkdirSync, lstatSync, realpathSync, copyFileSync, rmSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
const desktop = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = path.resolve(desktop, "../../../ConvexPress-Website/apps/web/dist");
const output = path.join(desktop, "resources/website-hosting");
const root = realpathSync(source);
const manifest = JSON.parse(readFileSync(path.join(root, "hosting/manifest.json"), "utf8"));
if (manifest.version !== 1 || manifest.engine !== "convexpress" || manifest.worker !== "worker.mjs" || !manifest.assets || Object.keys(manifest.assets).length > 4000) throw Error("Build the storefront hosting artifact before packaging");
const files = ["hosting/manifest.json", "hosting/worker.mjs", ...Object.keys(manifest.assets).map(p => {
  if (!p.startsWith("/") || /[\\\u0000-\u001f]/.test(p) || p.split("/").slice(1).some(s => !s || s.startsWith(".") || /%2e|%2f|%5c/i.test(s)) || p.endsWith(".map")) throw Error("Unsafe storefront asset path");
  return "client" + p;
})];
let total = 0;
const checksums = {};
for (const relative of files) {
  let file = root;
  for (const part of relative.split("/")) { file = path.join(file, part); if (lstatSync(file).isSymbolicLink()) throw Error("Storefront source contains a symlink"); }
  const stat = lstatSync(file);
  if (!stat.isFile() || stat.size > 25 * 1024 * 1024 || (total += stat.size) > 250 * 1024 * 1024) throw Error("Storefront resource exceeds its supported size");
  checksums[relative] = createHash("sha256").update(readFileSync(file)).digest("hex");
}
if (checksums["hosting/worker.mjs"] !== manifest.workerSha256) throw Error("Storefront Worker checksum mismatch");
// Only this dedicated generated resource tree is replaced.
rmSync(output, { recursive: true, force: true });
for (const relative of files) { const destination = path.join(output, relative); mkdirSync(path.dirname(destination), { recursive: true }); copyFileSync(path.join(root, relative), destination); }
writeFileSync(path.join(output, "ready.json"), JSON.stringify({ version: 1, checksums }, null, 2));
console.log(`Prepared generic storefront resource (${files.length} files).`);
