import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
test("canonical AI proposal DOM review, cancellation, preview and atomic acceptance", () => {
  const result = spawnSync(process.execPath, ["test", fileURLToPath(new URL("./ai-proposal.cases.jsx", import.meta.url))], { encoding: "utf8", timeout: 45000 });
  if (result.status !== 0) throw Error(result.stdout + result.stderr);
  expect(result.status).toBe(0);
});
