import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  symlinkSync,
  rmSync,
  existsSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { buildVercelHosting } from "./build-vercel-hosting.mjs";
const actualApp = fileURLToPath(new URL("../apps/web/", import.meta.url));
function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), "convexpress-vercel-test-"));
  mkdirSync(path.join(root, "dist/server"), { recursive: true });
  mkdirSync(path.join(root, "dist/client/assets"), { recursive: true });
  writeFileSync(path.join(root, "package.json"), '{"type":"module"}');
  symlinkSync(path.join(actualApp, "node_modules"), path.join(root, "node_modules"), "dir");
  writeFileSync(
    path.join(root, "dist/server/server.js"),
    "export default {fetch:request=>new Response(request.url)};",
  );
  writeFileSync(path.join(root, "dist/client/assets/site.js"), 'console.log("synthetic");');
  writeFileSync(path.join(root, "dist/client/assets/site.js.map"), "private source map");
  writeFileSync(path.join(root, "dist/client/.env"), "SYNTHETIC_SECRET=not-for-deployment");
  return root;
}
test("Vercel packager emits self-contained v3 Node function and checksum-addressed static inventory", async () => {
  const root = fixture();
  try {
    const output = path.join(root, ".vercel/output");
    const manifest = await buildVercelHosting({
      appRoot: root,
      outputRoot: output,
      skipBuild: true,
    });
    assert.equal(manifest.provider, "vercel");
    assert.deepEqual(JSON.parse(readFileSync(path.join(output, "config.json"))), {
      version: 3,
      routes: [{ handle: "filesystem" }, { src: "/(.*)", dest: "/ssr" }],
    });
    assert.equal(
      JSON.parse(readFileSync(path.join(output, "functions/ssr.func/.vc-config.json"))).runtime,
      "nodejs22.x",
    );
    assert.equal(existsSync(path.join(output, "static/.env")), false);
    assert.equal(existsSync(path.join(output, "static/assets/site.js.map")), false);
    for (const file of manifest.files) {
      const bytes = readFileSync(path.join(root, file.file));
      assert.equal(createHash("sha1").update(bytes).digest("hex"), file.sha);
      assert.equal(bytes.length, file.size);
    }
    const handler = (await import(path.join(output, "functions/ssr.func/index.mjs"))).default;
    assert.equal(typeof handler, "function");
    await assert.rejects(
      buildVercelHosting({ appRoot: root, outputRoot: output, skipBuild: true }),
      /already exists/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
test("Vercel packager rejects asset symlinks rather than leaking files outside its client tree", async () => {
  const root = fixture();
  try {
    writeFileSync(path.join(root, "private.txt"), "synthetic-private");
    symlinkSync(path.join(root, "private.txt"), path.join(root, "dist/client/leak.txt"));
    await assert.rejects(buildVercelHosting({ appRoot: root, skipBuild: true }), /symlinks/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
