import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
test("all four real order surfaces render authoritative receipt breakdowns", () => {
  const result = spawnSync(process.execPath, [fileURLToPath(new URL("./render-runner.mjs", import.meta.url))], { encoding: "utf8", timeout: 30000 });
  if (result.status !== 0) throw Error(result.stdout + result.stderr);
  expect(result.stdout).toContain("32 order surface receipts passed");
});
