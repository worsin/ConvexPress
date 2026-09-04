import { describe, expect, test } from "bun:test";

import { moduleIdFromPath, scanModules } from "./registry-core";

describe("moduleIdFromPath", () => {
  test("extracts the folder id", () => {
    expect(moduleIdFromPath("./pages/orders/manifest.tsx")).toBe("orders");
    expect(moduleIdFromPath("./widgets.local/my-widget/manifest.tsx")).toBe("my-widget");
  });
  test("rejects non-manifest paths", () => {
    expect(moduleIdFromPath("./pages/orders/OrdersPage.tsx")).toBeNull();
  });
});

describe("scanModules", () => {
  test("keys modules by folder and lets local override official", () => {
    const result = scanModules(
      {
        "./pages/orders/manifest.tsx": { default: { id: "orders", label: "official" } },
        "./pages/profile/manifest.tsx": { default: { id: "profile" } },
      },
      { "./pages.local/orders/manifest.tsx": { default: { id: "orders", label: "local" } } },
    );
    expect(result.modules.get("orders")?.source).toBe("local");
    expect((result.modules.get("orders")!.module as { label?: string }).label).toBe("local");
    expect(result.modules.get("profile")?.source).toBe("official");
    expect(result.warnings).toContain('Local module "orders" overrides the official module');
  });
  test("normalizes a mismatched manifest id to the folder id with a warning", () => {
    const result = scanModules({ "./widgets/welcome/manifest.tsx": { default: { id: "hello" } } });
    expect(result.modules.get("welcome")?.module.id).toBe("welcome");
    expect(result.warnings[0]).toContain('differs from folder "welcome"');
  });
  test("skips manifests without a default export", () => {
    const result = scanModules({ "./widgets/broken/manifest.tsx": {} });
    expect(result.modules.size).toBe(0);
    expect(result.warnings[0]).toContain("no default export");
  });
});
