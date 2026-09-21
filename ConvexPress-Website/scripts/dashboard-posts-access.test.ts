import { expect, test } from "bun:test";
import { fileURLToPath } from "node:url";

test("posts direct route gates the real query loader before mount", () => {
  const cwd = fileURLToPath(new URL("../apps/web/", import.meta.url));
  const fixture = fileURLToPath(new URL("../apps/web/test-support/dashboard-posts-access.mjs", import.meta.url));
  const result = Bun.spawnSync(["bun", fixture], { cwd, stdout: "pipe", stderr: "pipe" });
  expect(new TextDecoder().decode(result.stderr)).toBe("");
  expect(result.exitCode).toBe(0);
  expect(new TextDecoder().decode(result.stdout)).toContain("authorized author loads own posts");
});
