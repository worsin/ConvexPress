import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

test("actual panel subscriptions are sequenced without affecting other component tests", () => {
  // Isolate mocked Convex hooks from every other test file in this Bun process.
  const result = spawnSync(process.execPath, [fileURLToPath(new URL("./controller-query-startup.fixture.jsx", import.meta.url))], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
  expect(result.status).toBe(0);
});
