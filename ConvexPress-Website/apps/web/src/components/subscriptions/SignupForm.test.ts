import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

test("direct signup: inline coupon refusal, summary, in-page confirmation, already-subscribed and redirect return", () => {
  const result = spawnSync(process.execPath, [fileURLToPath(new URL("./SignupForm.fixture.jsx", import.meta.url))], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
  expect(result.stdout).toContain('"passed":true');
});
