import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
test("isolated native website editing IPC boundaries", () => {
  const result = spawnSync(process.execPath, ["test", fileURLToPath(new URL("./ipc.cases.mts", import.meta.url))], { encoding: "utf8", timeout: 15000 });
  if (result.status !== 0) throw Error(result.stdout + result.stderr);
  expect(result.status).toBe(0);
}, 20000);
