import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

test("a page whose email addresses a CDN split into their own text nodes hydrates once they are merged", () => {
  const result = spawnSync(process.execPath, [fileURLToPath(new URL("./restore-server-text.fixture.jsx", import.meta.url))], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
  expect(result.stdout).toContain('"restored":0');
});
