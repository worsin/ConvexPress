import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

describe("desktop packaging", () => {
  test("builds the Electron renderer as the standalone control plane", () => {
    const packageJson = JSON.parse(
      readFileSync(new URL("../package.json", import.meta.url), "utf8"),
    ) as { scripts?: Record<string, string> };

    expect(packageJson.scripts?.["build:web"]).toContain(
      "VITE_STANDALONE_CONTROL_PLANE=true",
    );
  });
});
