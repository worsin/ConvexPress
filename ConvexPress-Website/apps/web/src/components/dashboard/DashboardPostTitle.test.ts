import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

test("all packs link only public published dashboard posts", () => {
  const result = spawnSync(process.execPath, [fileURLToPath(new URL("./DashboardPostTitle.fixture.jsx", import.meta.url))], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
  expect(result.stdout).toContain('"passed":true');
});
