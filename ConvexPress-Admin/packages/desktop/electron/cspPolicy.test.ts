import { describe, expect, test } from "bun:test";

import {
  buildDesktopContentSecurityPolicy,
  controllerConfigUsesLoopback,
} from "./cspPolicy";

describe("desktop CSP policy", () => {
  test("recognizes only exact loopback controller hosts", () => {
    expect(
      controllerConfigUsesLoopback(
        "http://127.0.0.1:4720",
        "http://localhost:4721",
      ),
    ).toBe(true);
    expect(
      controllerConfigUsesLoopback(
        "https://controller.convex.cloud",
        "https://controller.convex.site",
      ),
    ).toBe(false);
    expect(
      controllerConfigUsesLoopback(
        "https://localhost.attacker.example",
        "https://127.0.0.1.attacker.example",
      ),
    ).toBe(false);
  });

  test("allows packaged loopback connections only for loopback controller installs", () => {
    const localPolicy = buildDesktopContentSecurityPolicy({
      development: false,
      allowLoopback: true,
    });
    expect(localPolicy).toContain("http://127.0.0.1:*");
    expect(localPolicy).toContain("ws://localhost:*");

    const cloudPolicy = buildDesktopContentSecurityPolicy({
      development: false,
      allowLoopback: false,
    });
    expect(cloudPolicy).not.toContain("http://127.0.0.1:*");
    expect(cloudPolicy).not.toContain("ws://localhost:*");
    expect(cloudPolicy).toContain("https://*.convex.cloud");
  });

  test("keeps development script policy separate from packaged policy", () => {
    expect(
      buildDesktopContentSecurityPolicy({
        development: true,
        allowLoopback: false,
      }),
    ).toContain("'unsafe-eval'");
    expect(
      buildDesktopContentSecurityPolicy({
        development: false,
        allowLoopback: true,
      }),
    ).not.toContain("'unsafe-eval'");
  });
});
