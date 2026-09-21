import { describe, expect, test } from "bun:test";

import {
  buildDesktopContentSecurityPolicy,
  controllerConfigUsesLoopback,
} from "./cspPolicy";

describe("desktop CSP policy", () => {
  test.each([true, false])("permits Clerk avatars only as images (development=%s)", (development) => {
    const directives = Object.fromEntries(
      buildDesktopContentSecurityPolicy({ development, allowLoopback: false })
        .split("; ").map((directive) => {
          const [name, ...sources] = directive.split(" ");
          return [name, sources];
        }),
    );
    expect(directives["img-src"]).toContain("https://img.clerk.com");
    for (const [name, sources] of Object.entries(directives)) {
      if (name !== "img-src") expect(sources).not.toContain("https://img.clerk.com");
      expect(sources).not.toContain("https://*.clerk.com");
    }
  });

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

  test("allows only exact configured HTTP origins for remote self-hosted fleets", () => {
    const policy = buildDesktopContentSecurityPolicy({
      development: true,
      allowLoopback: false,
      additionalConnectOrigins: [
        "http://192.168.1.246:4720",
        "http://192.168.1.246:4721/path-is-ignored",
        "file:///tmp/not-network",
        "http://name:secret@192.168.1.246:4820",
      ],
    });
    expect(policy).toContain("http://192.168.1.246:4720");
    expect(policy).toContain("ws://192.168.1.246:4720");
    expect(policy).toContain("http://192.168.1.246:4721");
    expect(policy).not.toContain("path-is-ignored");
    expect(policy).not.toContain("name:secret");
    expect(policy).not.toContain("file:///tmp/not-network");
  });

  test("lets images and media load from the connected site deployments", () => {
    const policy = buildDesktopContentSecurityPolicy({
      development: false,
      allowLoopback: false,
      additionalConnectOrigins: ["http://192.168.1.246:4820", "wss://ignored.example"],
    });
    const directives = Object.fromEntries(
      policy.split("; ").map((d) => [d.split(" ")[0], d]),
    );
    expect(directives["img-src"]).toContain("http://192.168.1.246:4820");
    expect(directives["media-src"]).toContain("http://192.168.1.246:4820");
    expect(directives["img-src"]).not.toContain("wss://ignored.example");
    expect(directives["connect-src"]).toContain("ws://192.168.1.246:4820");
    expect(directives["frame-src"]).toContain("http://192.168.1.246:4820");
  });

  test("lets the Customizer frame loopback storefronts in development", () => {
    const policy = buildDesktopContentSecurityPolicy({ development: true, allowLoopback: false });
    expect(policy).toMatch(/frame-src [^;]*http:\/\/127\.0\.0\.1:\*/);
  });
});

test("development permits Vite reconnect blob workers without broadening packaged worker policy",()=>{
 const dev=buildDesktopContentSecurityPolicy({development:true,allowLoopback:false});
 const packaged=buildDesktopContentSecurityPolicy({development:false,allowLoopback:false});
 expect(dev.split("; ")).toContain("worker-src 'self' blob:");
 expect(packaged.split("; ").some(directive=>directive.startsWith("worker-src"))).toBe(false);
 expect(dev.split("; ").find(d=>d.startsWith("script-src"))).not.toContain("blob:");
});
