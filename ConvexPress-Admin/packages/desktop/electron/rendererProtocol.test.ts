import { describe, expect, test } from "bun:test";
import path from "node:path";

import {
  PACKAGED_RENDERER_ENTRY_URL,
  resolvePackagedRendererPath,
} from "./rendererProtocol";

describe("packaged renderer protocol", () => {
  const rendererRoot = path.join("/Applications", "ConvexPress.app", "dist");

  test("maps only the trusted shell host into packaged renderer files", () => {
    expect(PACKAGED_RENDERER_ENTRY_URL).toBe(
      "convexpress-app://shell/index.html",
    );
    expect(
      resolvePackagedRendererPath(
        rendererRoot,
        "convexpress-app://shell/assets/app.js",
      ),
    ).toBe(path.join(rendererRoot, "assets", "app.js"));
    expect(
      resolvePackagedRendererPath(rendererRoot, "convexpress-app://shell/"),
    ).toBe(path.join(rendererRoot, "index.html"));
  });

  test("rejects other schemes, hosts, malformed encodings, and traversal", () => {
    for (const requestUrl of [
      "https://shell/index.html",
      "convexpress-app://attacker/index.html",
      "convexpress-app://shell/%2e%2e/secret",
      "convexpress-app://shell/%ZZ",
    ]) {
      expect(() => resolvePackagedRendererPath(rendererRoot, requestUrl)).toThrow();
    }
  });
});
