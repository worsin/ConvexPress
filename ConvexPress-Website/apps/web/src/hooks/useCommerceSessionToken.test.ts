import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

test("commerce session settlement remains scoped to the current client, site and login", () => {
  const result = spawnSync(process.execPath, ["test", fileURLToPath(new URL("./useCommerceSessionToken.cases.jsx", import.meta.url))], { encoding: "utf8", timeout: 20_000 });
  if (result.status !== 0) throw Error(result.stdout + result.stderr);
  expect(result.status).toBe(0);
}, 25_000);
