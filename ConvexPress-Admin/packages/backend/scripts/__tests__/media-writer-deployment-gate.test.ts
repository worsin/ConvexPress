import { expect, test } from "bun:test";
import { cpSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawnSync } from "node:child_process";
const backend = path.resolve(import.meta.dir, "../..");

test("actual offline deployment gate refuses a new direct owner writer and stale central boundary proof", () => {
  const isolated = mkdtempSync(path.join(os.tmpdir(), "media-writer-gate-"));
  try {
    cpSync(path.join(backend, "convex"), path.join(isolated, "convex"), { recursive: true, filter: file => !file.includes("/__tests__") });
    cpSync(path.join(backend, "scripts"), path.join(isolated, "scripts"), { recursive: true, filter: file => !file.includes("/__tests__") });
    symlinkSync(path.join(backend, "node_modules"), path.join(isolated, "node_modules"));
    const run = () => spawnSync("node", ["scripts/generate-media-writer-coverage.mjs", "--check"], { cwd: isolated, encoding: "utf8", timeout: 15000 });
    expect(run().status).toBe(0);
    const bypass = path.join(isolated, "convex/unreviewedWriter.ts");
    writeFileSync(bypass, 'export async function bypass(ctx: any) { await ctx.db.patch("posts", "id", { featuredImageId: "missing" }); }');
    const refused = run(); expect(refused.status).not.toBe(0); expect(refused.stderr).toContain("raw-owner-write");
    rmSync(bypass);
    const guard = path.join(isolated, "convex/media/attachmentGuard.ts");
    writeFileSync(guard, readFileSync(guard, "utf8") + "\n// A changed central boundary requires an explicitly regenerated version.\n");
    const stale = run(); expect(stale.status).not.toBe(0); expect(stale.stderr).toContain("coverage is stale");
  } finally { rmSync(isolated, { recursive: true, force: true }); }
}, 60000);

test("normal and packaged native deploy entry points invoke the same source coverage check", () => {
  const admin = path.resolve(backend, "../..");
  const packageJson = JSON.parse(readFileSync(path.join(backend, "package.json"), "utf8"));
  expect(packageJson.scripts.deploy).toContain("generate-media-writer-coverage.mjs --check");
  for (const file of ["packages/desktop/electron/ipc/siteDeploy.ts", "packages/desktop/electron/ipc/setup.ts"]) {
    const source = readFileSync(path.join(admin, file), "utf8");
    expect(source).toContain('["scripts/generate-media-writer-coverage.mjs", "--check"]');
  }
  const preparation = readFileSync(path.join(admin, "packages/desktop/scripts/prepare-provisioning.mjs"), "utf8");
  for (const file of ["generate-media-writer-coverage.mjs", "media-writer-coverage.mjs", "check-media-schema.mjs", "generate-media-reference-inventory.ts"]) expect(preparation).toContain(`"${file}"`);
  expect(preparation).toContain('checkedNode(path.join(stagedBackend, "scripts/generate-media-writer-coverage.mjs"), ["--check"], stagedBackend)');
});
