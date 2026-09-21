import { test, expect } from "bun:test";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
test("RoleSelector renders eligible roles for the actual assignment identity", () => {
  const output = execFileSync(
    process.execPath,
    [
      fileURLToPath(
        new URL("./role-selector.dom-test-support.tsx", import.meta.url),
      ),
    ],
    {
      cwd: fileURLToPath(new URL("../../../", import.meta.url)),
      encoding: "utf8",
      timeout: 20000,
    },
  );
  expect(output).toContain("role-selector: identity-filtered options");
});
