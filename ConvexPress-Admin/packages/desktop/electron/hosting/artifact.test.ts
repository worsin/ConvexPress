import { expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { loadWebsiteArtifact } from "./artifact";
function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), "convexpress-hosting-test-"));
  mkdirSync(path.join(root, "hosting")); mkdirSync(path.join(root, "client"));
  const worker = "export default {}";
  const manifest = { version: 1, engine: "convexpress", worker: "worker.mjs", workerSha256: createHash("sha256").update(worker).digest("hex"), assets: { "/a.css": { hash: "b".repeat(32), size: 3 } } };
  writeFileSync(path.join(root, "hosting/worker.mjs"), worker); writeFileSync(path.join(root, "hosting/manifest.json"), JSON.stringify(manifest)); writeFileSync(path.join(root, "client/a.css"), "abc");
  return { root, manifest, save: () => writeFileSync(path.join(root, "hosting/manifest.json"), JSON.stringify(manifest)), close: () => rmSync(root, { recursive: true, force: true }) };
}
test("artifact receipt hashes actual bytes and rejects a changed Worker", () => {
  const f = fixture(); try { const a = loadWebsiteArtifact(f.root); writeFileSync(path.join(f.root, "client/a.css"), "def"); expect(loadWebsiteArtifact(f.root).hash).not.toBe(a.hash); writeFileSync(path.join(f.root, "hosting/worker.mjs"), "changed"); expect(() => loadWebsiteArtifact(f.root)).toThrow("checksum"); } finally { f.close(); }
});
test("asset traversal, symlinks and source maps never enter the release", () => {
  const f = fixture(); try {
    for (const name of ["/../secret", "/a.js.map", "/%2e%2e/secret"]) { f.manifest.assets = { [name]: { hash: "b".repeat(32), size: 3 } } as typeof f.manifest.assets; f.save(); expect(() => loadWebsiteArtifact(f.root)).toThrow("path"); }
    f.manifest.assets = { "/a.css": { hash: "b".repeat(32), size: 3 } }; f.save(); rmSync(path.join(f.root, "client/a.css")); symlinkSync(path.join(f.root, "hosting/worker.mjs"), path.join(f.root, "client/a.css")); expect(() => loadWebsiteArtifact(f.root)).toThrow("symlink");
  } finally { f.close(); }
});
