import { expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

test("a single saved revision remains visible and restorable against current content", () => {
  const output = execFileSync(process.execPath, [fileURLToPath(new URL("./revision-comparison.test-support.tsx", import.meta.url))], { cwd: fileURLToPath(new URL("../../../", import.meta.url)), encoding: "utf8", timeout: 15000 });
  expect(output).toContain("revision comparison acceptance passed");
});
