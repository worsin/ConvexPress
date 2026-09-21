#!/usr/bin/env node
/** Stage the frozen, installed backend toolchain. No package installation or credentials. */
import { cpSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, readlinkSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const desktop = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const backend = path.resolve(desktop, "../backend");
const output = path.join(desktop, "resources", "provisioning");
const readJson = (file) => JSON.parse(readFileSync(file, "utf8"));

function resolvePackage(name, from) {
  const search = createRequire(path.join(from, "package.json")).resolve.paths(name) ?? [];
  for (const directory of search) {
    const candidate = path.join(directory, name);
    if (existsSync(path.join(candidate, "package.json"))) return realpathSync(candidate);
  }
  throw new Error(`Missing frozen dependency ${name}; run the frozen workspace install before packaging.`);
}

function checkedNode(script, args, cwd) {
  const result = spawnSync(process.execPath, [script, ...args], { cwd, stdio: "inherit" });
  if (result.status !== 0) throw new Error(`Provisioning build prerequisite failed: ${path.basename(script)}`);
}
checkedNode(path.join(backend, "scripts/generate-extension-index.mjs"), [], backend);
checkedNode(path.join(backend, "scripts/generate-local-api.mjs"), [], backend);
checkedNode(path.join(backend, "scripts/generate-media-writer-coverage.mjs"), ["--check"], backend);
checkedNode(path.join(resolvePackage("typescript", backend), "bin/tsc"), ["--noEmit", "-p", "convex/tsconfig.json"], backend);

rmSync(output, { recursive: true, force: true });
const stagedBackend = path.join(output, "backend");
mkdirSync(stagedBackend, { recursive: true });
const excluded = new Set(["node_modules", ".git", ".DS_Store", "__tests__", "tests", "test", "output", "coverage", "extensions.local"]);
const copyFilter = (source) => {
  const name = path.basename(source);
  return !excluded.has(name) && !/^\.env(?:\.|$)/.test(name) && !/\.(test|spec)\.[cm]?[jt]sx?$/.test(name);
};
cpSync(path.join(backend, "convex"), path.join(stagedBackend, "convex"), { recursive: true, filter: copyFilter });
// Server functions also import shared authorization and content helpers outside
// convex/. Keep those source dependencies inside the isolated deploy payload.
cpSync(path.join(backend, "lib"), path.join(stagedBackend, "lib"), { recursive: true, filter: copyFilter });
cpSync(path.join(backend, "convex.json"), path.join(stagedBackend, "convex.json"));
mkdirSync(path.join(stagedBackend, "scripts"));
for (const script of ["generate-extension-index.mjs", "generate-local-api.mjs", "generate-media-writer-coverage.mjs", "media-writer-coverage.mjs", "check-media-schema.mjs", "generate-media-reference-inventory.ts"]) cpSync(path.join(backend, "scripts", script), path.join(stagedBackend, "scripts", script));
// Rebuild after private local extensions were excluded from the release payload.
checkedNode(path.join(stagedBackend, "scripts/generate-extension-index.mjs"), [], stagedBackend);

const copied = new Map();
function stagePackage(source, requester) {
  source = realpathSync(source);
  const metadata = readJson(path.join(source, "package.json"));
  // Hoist exact dependencies where possible. Conflicting versions nest beneath
  // their consumer, matching Node resolution without runtime symlink privileges.
  let directory = requester;
  while (directory.startsWith(output)) {
    const candidate = path.join(directory, "node_modules", metadata.name);
    if (copied.get(candidate) === source) return candidate;
    if (directory === output) break;
    directory = path.dirname(directory);
  }
  const hoisted = path.join(stagedBackend, "node_modules", metadata.name);
  const destination = copied.has(hoisted) ? path.join(requester, "node_modules", metadata.name) : hoisted;
  if (copied.has(destination)) throw new Error(`Conflicting dependency placement for ${metadata.name}`);
  copied.set(destination, source);
  cpSync(source, destination, { recursive: true, dereference: true, filter: copyFilter });
  stageDependencies(metadata, source, destination);
  return destination;
}
function stageDependencies(metadata, source, destination) {
  const optional = metadata.optionalDependencies ?? {};
  const required = metadata.dependencies ?? {};
  const peers = Object.fromEntries(Object.entries(metadata.peerDependencies ?? {}).filter(([name]) => !metadata.peerDependenciesMeta?.[name]?.optional));
  for (const name of Object.keys({ ...required, ...peers, ...optional })) {
    let resolved;
    try { resolved = resolvePackage(name, source); }
    catch (error) { if (name in optional) continue; throw error; }
    stagePackage(resolved, destination);
  }
}
const backendPackage = readJson(path.join(backend, "package.json"));
stageDependencies(backendPackage, backend, stagedBackend);
// Deploy retains its compiler gate; ship the exact installed compiler and ambient
// declarations so a customer's payload never falls back to a checkout's toolchain.
for (const name of ["typescript", "@types/node", "@types/bcryptjs"]) stagePackage(resolvePackage(name, backend), stagedBackend);
const pinnedDependencies = Object.fromEntries(Object.keys(backendPackage.dependencies).map((name) => [name, readJson(path.join(resolvePackage(name, backend), "package.json")).version]));
writeFileSync(path.join(stagedBackend, "package.json"), JSON.stringify({ name: backendPackage.name, version: backendPackage.version, private: true, dependencies: pinnedDependencies }, null, 2));
// Prove native bundling works with the payload alone, before shipping it.
const stagedRequire = createRequire(path.join(stagedBackend, "node_modules/convex/package.json"));
const esbuild = stagedRequire("esbuild");
esbuild.transformSync("export const ready: number = 1", { loader: "ts" });
checkedNode(path.join(stagedBackend, "node_modules/convex/bin/main.js"), ["--version"], stagedBackend);
checkedNode(path.join(stagedBackend, "scripts/generate-local-api.mjs"), [], stagedBackend);
checkedNode(path.join(stagedBackend, "scripts/generate-media-writer-coverage.mjs"), ["--check"], stagedBackend);
checkedNode(path.join(stagedBackend, "node_modules/typescript/bin/tsc"), ["--noEmit", "-p", "convex/tsconfig.json"], stagedBackend);

const hash = createHash("sha256");
function hashTree(directory) {
  for (const name of readdirSync(directory).sort()) {
    const file = path.join(directory, name);
    const relative = path.relative(output, file).split(path.sep).join("/");
    const stat = lstatSync(file);
    hash.update(relative + "\0");
    if (stat.isSymbolicLink()) hash.update("link:" + readlinkSync(file));
    else if (stat.isDirectory()) hashTree(file);
    else hash.update(readFileSync(file));
  }
}
hashTree(output);
const manifest = { version: 1, digest: hash.digest("hex"), platform: process.platform, arch: process.arch, convexVersion: pinnedDependencies.convex, packages: copied.size };
writeFileSync(path.join(output, "manifest.json"), JSON.stringify(manifest, null, 2));
// Copy to the OS temp directory and run with PATH empty. This prevents a staged
// payload from passing only because Node resolves a missing package in the repo.
checkedNode(path.join(desktop, "scripts/check-provisioning-runtime.mjs"), ["--node"], desktop);
writeFileSync(path.join(output, "ready.json"), JSON.stringify({ digest: manifest.digest }));
console.log(`Prepared isolated provisioning payload: ${copied.size} pinned packages (${process.platform}/${process.arch}).`);
