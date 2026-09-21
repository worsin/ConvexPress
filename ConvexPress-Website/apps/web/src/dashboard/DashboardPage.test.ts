import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

test("dashboard pages mount only while the live registry and capability allow access", () => {
  const result = spawnSync(process.execPath, [fileURLToPath(new URL("./DashboardPage.access.fixture.jsx", import.meta.url))], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
  expect(result.stdout).toContain('"passed":true');
});
