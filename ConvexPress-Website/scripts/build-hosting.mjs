#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const app = path.join(root, "apps/web");
const require = createRequire(path.join(app, "package.json"));
const rootRequire = createRequire(path.join(root, "package.json"));
const { hash: blake3Hash } = createRequire(rootRequire.resolve("wrangler/package.json"))("blake3-wasm");
const { build } = await import(pathToFileURL(createRequire(require.resolve("vite/package.json")).resolve("esbuild")));
if (!process.argv.includes("--skip-build")) {
  const result = spawnSync(process.execPath, [path.join(path.dirname(require.resolve("vite/package.json")), "bin/vite.js"), "build"], { cwd: app, stdio: "inherit", env: process.env });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
const output = path.join(app, "dist/hosting");
mkdirSync(output, { recursive: true });
const server = path.join(app, "dist/server/server.js");
const wrapper = `import handler from ${JSON.stringify(server)};
export default {
  async fetch(request, env, context) {
    const configured = process.env.CONVEXPRESS_CONVEX_URL;
    if (!configured || !process.env.CONVEXPRESS_INSTANCE_KEY || !process.env.CONVEXPRESS_SITE_URL) return new Response('This website is awaiting configuration.', {status:503});
    if (env.CONVEXPRESS_CONVEX_URL !== configured || env.CONVEXPRESS_INSTANCE_KEY !== process.env.CONVEXPRESS_INSTANCE_KEY || env.CONVEXPRESS_SITE_URL !== process.env.CONVEXPRESS_SITE_URL) return new Response('Website configuration mismatch.', {status:503});
    const response = await handler.fetch(request);
    const headers = new Headers(response.headers);
    for (const [header, binding] of Object.entries({
      'x-convexpress-instance': 'CONVEXPRESS_INSTANCE_KEY',
      'x-convexpress-release': 'CONVEXPRESS_RELEASE_ID',
      'x-convexpress-artifact': 'CONVEXPRESS_ARTIFACT_HASH',
    })) {
      const value = env[binding];
      if (typeof value === 'string' && /^[A-Za-z0-9_-]{1,256}$/.test(value)) headers.set(header, value);
    }
    return new Response(response.body, {status: response.status, statusText: response.statusText, headers});
  }
};`;
const result = await build({
  stdin: { contents: wrapper, resolveDir: app, sourcefile: "convexpress-worker.mjs" },
  outfile: path.join(output, "worker.mjs"), bundle: true, platform: "node", format: "esm", target: "es2022",
  conditions: ["workerd", "worker"], external: ["node:*"], minify: true, metafile: true,
  logOverride: { "ignored-bare-import": "silent" },
  define: { "process.env.NODE_ENV": '"production"' },
  // Workers modules do not expose import.meta.url. All application dependencies
  // are bundled; this resolver is only used for node:* compatibility modules.
  banner: { js: "import { createRequire as __convexpressCreateRequire } from 'node:module'; const require = __convexpressCreateRequire('file:///convexpress/worker.mjs');" },
});
const forbidden = Object.keys(result.metafile.inputs).filter(p => /(?:^|\/)jsdom\/|(?:^|\/)canvas\//.test(p));
if (forbidden.length) throw new Error("The edge bundle includes a DOM emulator or native canvas dependency.");
const assets = {};
function visit(dir, relative = "") {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) throw new Error("Hosting assets cannot contain symlinks.");
    const rel = relative + "/" + entry.name, file = path.join(dir, entry.name);
    if (entry.isDirectory()) visit(file, rel);
    else if (entry.isFile()) {
      if (entry.name.endsWith(".map") || /(?:^|\/)\.env/.test(rel)) continue;
      const bytes = readFileSync(file);
      if (bytes.length > 25 * 1024 * 1024) throw new Error(`Asset exceeds Cloudflare's per-file limit: ${rel}`);
      // Match Wrangler's asset protocol, including the extension so equal bytes
      // served with different MIME types do not share an upload identity.
      assets[rel] = { hash: blake3Hash(bytes.toString("base64") + path.extname(file).slice(1)).toString("hex").slice(0, 32), size: bytes.length };
    }
  }
}
visit(path.join(app, "dist/client"));
const worker = readFileSync(path.join(output, "worker.mjs"));
writeFileSync(path.join(output, "manifest.json"), JSON.stringify({ version: 1, engine: "convexpress", worker: "worker.mjs", workerSha256: createHash("sha256").update(worker).digest("hex"), assets }, null, 2));
writeFileSync(path.join(output, "wrangler.json"), JSON.stringify({ name: "convexpress-local-hosting-check", main: "worker.mjs", compatibility_date: "2026-09-01", compatibility_flags: ["nodejs_compat"], assets: { directory: "../client", binding: "ASSETS", html_handling: "none", not_found_handling: "none" } }, null, 2));
console.log(`Hosting bundle: ${Object.keys(assets).length} assets; ${statSync(path.join(output, "worker.mjs")).size} worker bytes; no native DOM dependencies.`);

// A resolvable bundle can still contain conflicting SSR runtime identities.
// Execute both real routes in workerd with all outbound traffic intercepted.
if (!process.argv.includes("--skip-build")) {
  const smoke = spawnSync(process.execPath, [path.join(root, "scripts/check-hosting-runtime.mjs")], {cwd: root, stdio: "inherit", env: process.env});
  if (smoke.status !== 0) process.exit(smoke.status ?? 1);
}
