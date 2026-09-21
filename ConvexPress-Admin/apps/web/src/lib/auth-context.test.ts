import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
test("native auth effective permission DOM checks", () => {
  const result = spawnSync(process.execPath, ["test", fileURLToPath(new URL("./auth-context.cases.jsx", import.meta.url))], {encoding:"utf8",timeout:30000});
  if(result.status !== 0) throw Error(result.stdout + result.stderr);
  expect(result.status).toBe(0);
});
