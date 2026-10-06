import { test, expect } from "bun:test";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
test("Customizer appearance review uses the controller and retains reviewed promotion safeguards", () => {
  const output = execFileSync(process.execPath, [fileURLToPath(new URL("./appearancePromotion.dom-test-support.tsx", import.meta.url))], { cwd: fileURLToPath(new URL("../../../", import.meta.url)), encoding: "utf8", timeout: 20000 });
  expect(output).toContain("appearance promotion: controller routing, selection, source, reset and access verified");
});
