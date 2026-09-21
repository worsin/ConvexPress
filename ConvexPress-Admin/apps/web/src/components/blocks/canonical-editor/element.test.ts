import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
test("element creation preserves the page draft and rejects stale insertion", () => {
 const result = spawnSync(process.execPath, ["test", fileURLToPath(new URL("./element.cases.jsx", import.meta.url))], { encoding: "utf8", timeout: 30000 });
 if (result.status !== 0) throw Error(result.stdout + result.stderr);
 expect(result.status).toBe(0);
}, 35000);
