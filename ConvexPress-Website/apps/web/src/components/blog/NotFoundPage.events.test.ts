import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

test("the 404 page logs the address as asked for, and the bare 404 names itself in its heading", () => {
  const result = spawnSync(process.execPath, [fileURLToPath(new URL("./NotFoundPage.events.fixture.jsx", import.meta.url))], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
  expect(result.stdout).toContain('"logged":2');
});
