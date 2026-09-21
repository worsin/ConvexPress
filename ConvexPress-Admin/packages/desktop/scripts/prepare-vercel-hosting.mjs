#!/usr/bin/env node
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const desktop = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const website = path.resolve(desktop, "../../../ConvexPress-Website");
const temporary = mkdtempSync(path.join(tmpdir(), "convexpress-vercel-resource-"));
try {
  const { buildVercelHosting } = await import(pathToFileURL(path.join(website, "scripts/build-vercel-hosting.mjs")));
  const manifest = await buildVercelHosting({ outputRoot: path.join(temporary, "output"), skipBuild: true });
  // Run the same loader used by Electron against the exact new resource. Bundle
  // its TypeScript locally; target installers need no Bun or TS interpreter.
  const require = createRequire(path.join(desktop, "package.json"));
  const { build } = await import(pathToFileURL(createRequire(require.resolve("tsup/package.json")).resolve("esbuild")));
  const verifier = path.join(temporary, "verifier.mjs");
  await build({ entryPoints: [path.join(desktop, "electron/hosting/vercelArtifact.ts")], outfile: verifier, bundle: true, platform: "node", format: "esm", target: "node22", logLevel: "silent" });
  const { loadVercelArtifact } = await import(pathToFileURL(verifier));
  const artifact = loadVercelArtifact(path.join(temporary, "output"));
  const output = path.join(desktop, "resources/website-vercel");
  const ready = { version: 1, artifactHash: artifact.hash, checksums: {} };
  // Replace only this dedicated generated resource directory after validation.
  rmSync(output, { recursive: true, force: true });
  function write(relative, bytes) {
    const destination = path.join(output, relative); mkdirSync(path.dirname(destination), { recursive: true }); writeFileSync(destination, bytes);
    ready.checksums[relative] = createHash("sha256").update(bytes).digest("hex");
  }
  for (const [file, bytes] of artifact.contents) write("output/" + file.slice(".vercel/output/".length), bytes);
  const publicManifest = { ...manifest, outputRoot: "output" };
  write("output.manifest.json", Buffer.from(JSON.stringify(publicManifest, null, 2)));
  const copied = loadVercelArtifact(path.join(output, "output"));
  if (copied.hash !== artifact.hash) throw Error("Packaged Vercel artifact changed during preparation");
  writeFileSync(path.join(output, "ready.json"), JSON.stringify(ready, null, 2));
  console.log(`Prepared Vercel storefront resource (${artifact.files.length} files; ${manifest.totalBytes} bytes; ${artifact.hash}).`);
} finally { rmSync(temporary, { recursive: true, force: true }); }
