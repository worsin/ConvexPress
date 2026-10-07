import { expect, test } from "bun:test";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const website = resolve(import.meta.dir, "..");

function snapshot(dir: string): Record<string, string> {
  return Object.fromEntries(readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter(entry => entry.isFile())
    .map(entry => {
      const path = join(entry.parentPath, entry.name);
      return [path.slice(dir.length), readFileSync(path, "base64")];
    }));
}

test("template audits reject stale Admin pack metadata without repairing it", () => {
  const fixture = mkdtempSync(join(tmpdir(), "template-sync-"));
  const root = join(fixture, "ConvexPress-Website");
  const run = (script: string, ...args: string[]) => spawnSync(process.execPath,
    [join(root, "scripts", script), ...args], { encoding: "utf8" });
  try {
    mkdirSync(join(fixture, "ConvexPress-Admin/apps/web/src/lib/templates"), { recursive: true });
    for (const file of ["scripts/sync-template-packs.mjs", "scripts/check-template-packs.mjs", "scripts/template-contract.mjs", "apps/web/src/templates/sdk", "apps/web/src/templates/packs/core"]) {
      mkdirSync(dirname(join(root, file)), { recursive: true });
      cpSync(join(website, file), join(root, file), { recursive: true });
    }
    expect(run("sync-template-packs.mjs").status).toBe(0);
    expect(run("check-template-packs.mjs").status).toBe(0);
    const manifestPath = join(root, "apps/web/src/templates/packs/core/template.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    manifest.tagline = "Changed in Website, not yet synchronized to Admin";
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
    const before = snapshot(fixture);
    const audit = run("check-template-packs.mjs");
    expect(audit.status).not.toBe(0);
    expect(audit.stderr).toContain("packs.ts");
    expect(snapshot(fixture)).toEqual(before);
    const direct = run("sync-template-packs.mjs", "--check");
    expect(direct.status).not.toBe(0);
    expect(snapshot(fixture)).toEqual(before);
    expect(run("sync-template-packs.mjs").status).toBe(0);
    const synchronized = snapshot(fixture);
    expect(run("check-template-packs.mjs").status).toBe(0);
    expect(run("sync-template-packs.mjs", "--check").status).toBe(0);
    expect(snapshot(fixture)).toEqual(synchronized);
  } finally { rmSync(fixture, { recursive: true, force: true }); }
});
