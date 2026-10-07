import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

test("private autosave review, serialization, uncertain replies and retired editor callbacks", () => {
  const result = spawnSync(process.execPath, ["test", fileURLToPath(new URL("./site-draft.cases.jsx", import.meta.url))], { encoding: "utf8", timeout: 30000 });
  if (result.status !== 0) throw Error(result.stdout + result.stderr);
  expect(result.status).toBe(0);
});
