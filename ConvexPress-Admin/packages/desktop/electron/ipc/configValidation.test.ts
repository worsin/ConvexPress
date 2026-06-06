import { describe, expect, test } from "bun:test";

import {
  assertReadableConfigKey,
  assertRendererConfigClear,
} from "./configValidation";

describe("config IPC validation", () => {
  test("allows reads for explicit renderer config keys", () => {
    expect(() => assertReadableConfigKey("convexUrl")).not.toThrow();
    expect(() =>
      assertReadableConfigKey("pendingAdminCredentials"),
    ).not.toThrow();
  });

  test("rejects reads for secrets and unknown keys", () => {
    expect(() => assertReadableConfigKey("adminKey")).toThrow(
      "Config key not allowed: adminKey",
    );
    expect(() => assertReadableConfigKey("__proto__")).toThrow(
      "Config key not allowed: __proto__",
    );
  });

  test("only allows renderer writes that clear pending credentials", () => {
    expect(() =>
      assertRendererConfigClear("pendingAdminCredentials", null),
    ).not.toThrow();
    expect(() =>
      assertRendererConfigClear("pendingLoginCredentials", null),
    ).not.toThrow();

    expect(() => assertRendererConfigClear("convexUrl", null)).toThrow(
      "Config key is read-only: convexUrl",
    );
    expect(() =>
      assertRendererConfigClear("pendingLoginCredentials", {
        identifier: "admin@example.com",
        password: "CorrectHorseBatteryStaple42!",
      }),
    ).toThrow(
      "Config key can only be cleared from the renderer: pendingLoginCredentials",
    );
  });
});
