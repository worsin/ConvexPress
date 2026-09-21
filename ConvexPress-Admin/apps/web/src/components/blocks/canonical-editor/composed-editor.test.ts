import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
test("custom document editing uses exact versioned schemas and definition-bound save receipts", () => {
  const result = spawnSync(process.execPath, ["test", fileURLToPath(new URL("./composed-editor.cases.jsx", import.meta.url))], { encoding: "utf8", timeout: 30000 });
  if (result.status !== 0) throw new Error(result.stdout + result.stderr);
  expect(result.status).toBe(0);
});
