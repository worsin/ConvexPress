import { test, expect } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { loadVercelArtifact } from "./vercelArtifact";
function fixture() {
  const dir = mkdtempSync(path.join(tmpdir(), "convexpress-vercel-artifact-")), root = path.join(dir, "output");
  const files = ["config.json", "functions/ssr.func/index.mjs", "functions/ssr.func/.vc-config.json"].map(file => {
    const bytes = Buffer.from(file === "config.json" ? '{"version":3}' : "synthetic output");
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true }); writeFileSync(path.join(root, file), bytes);
    return { file: ".vercel/output/" + file, sha: createHash("sha1").update(bytes).digest("hex"), sha256: createHash("sha256").update(bytes).digest("hex"), size: bytes.length };
  });
  const metadata = { version: 1, provider: "vercel", engine: "convexpress", buildOutputVersion: 3, outputRoot: "/untrusted/old/build/directory", files, totalBytes: files.reduce((sum, file) => sum + file.size, 0) };
  const save = () => writeFileSync(root + ".manifest.json", JSON.stringify(metadata)); save();
  return { dir, root, metadata, save, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}
test("Vercel loader binds all bytes and ignores manifest outputRoot and inventory order", () => {
  const f = fixture(); try {
    const a = loadVercelArtifact(f.root);
    expect(a.contents.size).toBe(3); expect(a.hash).toMatch(/^[a-f0-9]{64}$/);
    f.metadata.files.reverse(); f.save(); expect(loadVercelArtifact(f.root).hash).toBe(a.hash);
    writeFileSync(path.join(f.root, "functions/ssr.func/index.mjs"), "tampered output!");
    expect(() => loadVercelArtifact(f.root)).toThrow();
  } finally { f.cleanup(); }
});
test("Vercel loader rejects unsafe paths, duplicate descriptors and absent SSR requirements", () => {
  const f = fixture(); try {
    const original = structuredClone(f.metadata.files);
    for (const file of [".vercel/output/../outside", ".vercel/output/static/.env", ".vercel/output/static/a.map", ".vercel/output/static/%2e%2e/secret", ".vercel/output/static/a\\b"]) {
      f.metadata.files = [...original, { ...original[0], file }]; f.save();
      expect(() => loadVercelArtifact(f.root)).toThrow("descriptor");
    }
    f.metadata.files = [...original, original[0]]; f.save(); expect(() => loadVercelArtifact(f.root)).toThrow("descriptor");
    f.metadata.files = original.slice(1); f.save(); expect(() => loadVercelArtifact(f.root)).toThrow("inventory");
  } finally { f.cleanup(); }
});
test("Vercel loader refuses symlinks and unlisted files, even if listed content hashes match", () => {
  const f = fixture(); try {
    const entry = path.join(f.root, "functions/ssr.func/index.mjs"), outside = path.join(f.dir, "outside");
    writeFileSync(outside, readFileSync(entry)); rmSync(entry); symlinkSync(outside, entry);
    expect(() => loadVercelArtifact(f.root)).toThrow("symlinks");
    rmSync(entry); writeFileSync(entry, readFileSync(outside));
    writeFileSync(path.join(f.root, "unlisted.secret"), "synthetic only"); expect(() => loadVercelArtifact(f.root)).toThrow("unlisted");
  } finally { f.cleanup(); }
});
