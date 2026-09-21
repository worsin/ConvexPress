import { expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";

test("native media coordinator executes outside the checkout without workspace TypeScript", () => {
  const desktop = path.resolve(import.meta.dir, "../..");
  const require = createRequire(path.join(desktop, "package.json"));
  const temporary = mkdtempSync(path.join(tmpdir(), "convexpress-native-bundle-"));
  try {
    const cli = path.join(path.dirname(require.resolve("tsup/package.json")), "dist/cli-default.js");
    const built = spawnSync(process.execPath, [cli, "electron/deployment/mediaIndex.ts", "--outDir", temporary, "--format", "cjs"], { cwd: desktop, encoding: "utf8" });
    expect(built.status, built.stderr || built.stdout).toBe(0);
    const bundle = path.join(temporary, "mediaIndex.js");
    const executed = spawnSync(require("electron"), ["-e", `const assert = require('node:assert/strict'); const {mediaEpochFromEnvList} = require(${JSON.stringify(bundle)}); assert.equal(mediaEpochFromEnvList('MEDIA_REFERENCE_INDEX_EPOCH=staging_fixture'), 'staging_fixture');`], {
      cwd: temporary,
      env: { PATH: "", ELECTRON_RUN_AS_NODE: "1", HOME: process.env.HOME, TMPDIR: process.env.TMPDIR, SystemRoot: process.env.SystemRoot },
      encoding: "utf8",
      timeout: 15_000,
    });
    expect(executed.status, executed.stderr || executed.stdout).toBe(0);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});
