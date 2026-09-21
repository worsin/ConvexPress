#!/usr/bin/env node
import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  readdirSync,
  lstatSync,
  copyFileSync,
  existsSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const app = path.join(root, "apps/web");
export async function buildVercelHosting({
  appRoot = app,
  outputRoot = path.join(appRoot, ".vercel/output"),
  skipBuild = false,
} = {}) {
  const require = createRequire(path.join(appRoot, "package.json"));
  if (existsSync(outputRoot))
    throw Error(
      "Vercel output already exists. Choose a fresh --output directory to prevent stale artifact reuse.",
    );
  if (!skipBuild) {
    const result = spawnSync(
      process.execPath,
      [path.join(path.dirname(require.resolve("vite/package.json")), "bin/vite.js"), "build"],
      { cwd: appRoot, stdio: "inherit", env: process.env },
    );
    if (result.status !== 0) throw Error("Website build failed");
  }
  const server = path.join(appRoot, "dist/server/server.js"),
    client = path.join(appRoot, "dist/client");
  if (!existsSync(server) || !existsSync(client))
    throw Error("Build the website server and client before packaging Vercel output");
  const { build } = await import(
    pathToFileURL(createRequire(require.resolve("vite/package.json")).resolve("esbuild"))
  );
  const functionDir = path.join(outputRoot, "functions/ssr.func");
  mkdirSync(functionDir, { recursive: true });
  const wrapper = `import server from ${JSON.stringify(server)};import {createVercelHandler} from ${JSON.stringify(path.join(root, "scripts/vercel-runtime.mjs"))};export default createVercelHandler(request=>server.fetch(request));`;
  const bundled = await build({
    stdin: { contents: wrapper, resolveDir: appRoot, sourcefile: "vercel-ssr.mjs" },
    outfile: path.join(functionDir, "index.mjs"),
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node22",
    external: ["node:*"],
    minify: true,
    metafile: true,
    logOverride: { "ignored-bare-import": "silent" },
    define: { "process.env.NODE_ENV": '"production"' },
    banner: {
      js: "import {createRequire as __convexpressRequire} from 'node:module';const require=__convexpressRequire(import.meta.url);",
    },
  });
  if (Object.keys(bundled.metafile.inputs).some((p) => /(?:^|\/)jsdom\/|(?:^|\/)canvas\//.test(p)))
    throw Error("Vercel SSR must not include DOM emulators or native canvas");
  writeFileSync(
    path.join(functionDir, ".vc-config.json"),
    JSON.stringify({
      runtime: "nodejs22.x",
      handler: "index.mjs",
      launcherType: "Nodejs",
      supportsResponseStreaming: true,
      maxDuration: 60,
    }),
  );
  writeFileSync(
    path.join(outputRoot, "config.json"),
    JSON.stringify({
      version: 3,
      routes: [{ handle: "filesystem" }, { src: "/(.*)", dest: "/ssr" }],
    }),
  );
  const staticRoot = path.join(outputRoot, "static");
  mkdirSync(staticRoot, { recursive: true });
  function copy(dir, relative = "") {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const source = path.join(dir, entry.name),
        rel = path.posix.join(relative, entry.name);
      if (lstatSync(source).isSymbolicLink())
        throw Error("Vercel artifacts cannot contain symlinks");
      if (entry.isDirectory()) {
        if (entry.name.startsWith(".")) continue;
        mkdirSync(path.join(staticRoot, rel), { recursive: true });
        copy(source, rel);
      } else if (entry.isFile()) {
        if (entry.name.endsWith(".map") || entry.name.startsWith(".env")) continue;
        if (lstatSync(source).size > 25 * 1024 * 1024)
          throw Error("Vercel asset exceeds supported per-file limit");
        copyFileSync(source, path.join(staticRoot, rel));
      }
    }
  }
  copy(client);
  const files = [];
  let total = 0;
  function inventory(dir, relative = "") {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const absolute = path.join(dir, entry.name),
        rel = path.posix.join(relative, entry.name);
      if (entry.isDirectory()) inventory(absolute, rel);
      else {
        const bytes = readFileSync(absolute);
        if (bytes.length > 25 * 1024 * 1024)
          throw Error("Vercel function or asset exceeds supported per-file limit");
        total += bytes.length;
        files.push({
          file: ".vercel/output/" + rel,
          sha: createHash("sha1").update(bytes).digest("hex"),
          sha256: createHash("sha256").update(bytes).digest("hex"),
          size: bytes.length,
        });
      }
    }
  }
  inventory(outputRoot);
  if (files.length > 10000 || total > 250 * 1024 * 1024)
    throw Error("Vercel artifact exceeds supported upload limits");
  const manifest = {
    version: 1,
    provider: "vercel",
    engine: "convexpress",
    buildOutputVersion: 3,
    outputRoot,
    runtimeBindings: ["CONVEXPRESS_CONVEX_URL", "CONVEXPRESS_INSTANCE_KEY", "CONVEXPRESS_SITE_URL"],
    files,
    totalBytes: total,
  };
  // Stored beside output; it is orchestration metadata and is never served.
  writeFileSync(
    path.join(path.dirname(outputRoot), path.basename(outputRoot) + ".manifest.json"),
    JSON.stringify(manifest, null, 2),
  );
  return manifest;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const at = args.indexOf("--output");
  if (
    (at >= 0 && (!args[at + 1] || args[at + 1].startsWith("--"))) ||
    args.some(
      (arg, i) => arg !== "--skip-build" && arg !== "--output" && !(at >= 0 && i === at + 1),
    )
  )
    throw Error("Use --skip-build and optional --output DIR");
  const manifest = await buildVercelHosting({
    skipBuild: args.includes("--skip-build"),
    ...(at >= 0 ? { outputRoot: path.resolve(args[at + 1] ?? "") } : {}),
  });
  console.log(
    `Vercel Build Output v3: ${manifest.files.length} files; ${manifest.totalBytes} bytes; no native DOM dependencies.`,
  );
}
