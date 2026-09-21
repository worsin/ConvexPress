import { test, expect } from "bun:test";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
test("generated Admin layout/index relationships render children and preserve defaults", () => {
  const output = execFileSync(
    process.execPath,
    [
      "--conditions=browser",
      fileURLToPath(
        new URL("./admin-route-parents.dom-test-support.tsx", import.meta.url),
      ),
    ],
    {
      cwd: fileURLToPath(new URL("../../../", import.meta.url)),
      encoding: "utf8",
      timeout: 20000,
    },
  );
  expect(output).toContain(
    "admin-route-parents: five generated layouts/indexes",
  );
});
