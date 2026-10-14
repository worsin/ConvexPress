import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

test("the account page states the plan, the next charge with discounts, and readable statuses in every pack", () => {
  const result = spawnSync(process.execPath, [fileURLToPath(new URL("./CustomerPortalCard.fixture.jsx", import.meta.url))], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
  expect(result.stdout).toContain('"passed":true');
});
