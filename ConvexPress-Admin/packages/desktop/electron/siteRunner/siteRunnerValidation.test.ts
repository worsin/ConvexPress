import { describe, expect, test } from "bun:test";

import {
  assertSiteRunnerTarget,
  buildStorefrontEnv,
  cacheDirName,
  choosePort,
  deriveConvexSiteUrl,
  isLoopbackUrl,
  parseLoopbackPort,
  siteProcessKey,
} from "./siteRunnerValidation";

const base = {
  instanceKey: "acceptance:northstar:shop:live",
  label: "Northstar Shop — Live",
  convexUrl: "http://192.168.1.246:4820",
};

describe("site runner validation", () => {
  test("recognises loopback site addresses and their ports", () => {
    expect(isLoopbackUrl("http://127.0.0.1:4201")).toBe(true);
    expect(isLoopbackUrl("http://localhost:4201/")).toBe(true);
    expect(isLoopbackUrl("https://shop.northstar.example")).toBe(false);
    expect(isLoopbackUrl("not a url")).toBe(false);
    expect(parseLoopbackPort("http://127.0.0.1:4201")).toBe(4201);
    expect(parseLoopbackPort("http://localhost")).toBe(80);
    expect(parseLoopbackPort("https://shop.northstar.example")).toBeNull();
  });

  test("derives the HTTP-actions origin for cloud and self-hosted deployments", () => {
    expect(deriveConvexSiteUrl("https://happy-otter-123.convex.cloud")).toBe(
      "https://happy-otter-123.convex.site",
    );
    expect(deriveConvexSiteUrl("http://192.168.1.246:4820")).toBe("http://192.168.1.246:4821");
    expect(deriveConvexSiteUrl("nope")).toBeUndefined();
  });

  test("validates a target and fills defaults", () => {
    const target = assertSiteRunnerTarget({ ...base, siteUrl: "http://127.0.0.1:4201/" });
    expect(target.mode).toBe("dev");
    expect(target.convexSiteUrl).toBe("http://192.168.1.246:4821");
    expect(target.siteUrl).toBe("http://127.0.0.1:4201");
    expect(() => assertSiteRunnerTarget({ ...base, instanceKey: "bad key!" })).toThrow(
      "instanceKey is required",
    );
    expect(() => assertSiteRunnerTarget({ ...base, convexUrl: "ftp://x" })).toThrow(
      "must use http or https",
    );
    expect(() => assertSiteRunnerTarget(null)).toThrow("must be an object");
  });

  test("keys preview processes separately from the site address process", () => {
    expect(siteProcessKey({ instanceKey: "a:b", mode: "dev" })).toBe("a:b");
    expect(siteProcessKey({ instanceKey: "a:b", mode: "preview" })).toBe("a:b#preview");
    expect(cacheDirName("a:b#preview")).toBe("a_b_preview");
  });

  test("the loopback site address decides the port for dev mode", () => {
    const target = assertSiteRunnerTarget({ ...base, siteUrl: "http://127.0.0.1:4310" });
    expect(choosePort(target, { remembered: 4200, taken: [4200] })).toBe(4310);
  });

  test("preview mode reuses the remembered port or allocates a free one", () => {
    const preview = assertSiteRunnerTarget({ ...base, mode: "preview", siteUrl: "http://127.0.0.1:4310" });
    expect(choosePort(preview, { remembered: 4207, taken: [4200] })).toBe(4207);
    expect(choosePort(preview, { remembered: 4207, taken: [4207, 4200, 4201] })).toBe(4202);
    expect(choosePort(preview, { remembered: null, taken: [] })).toBe(4200);
  });

  test("builds the storefront environment the runtime module expects", () => {
    const target = assertSiteRunnerTarget({
      ...base,
      siteUrl: "http://127.0.0.1:4201",
      clerkPublishableKey: "pk_test_abc",
    });
    const env = buildStorefrontEnv(target, 4201, {
      cacheDir: "/tmp/cache",
      adminAppUrl: "http://localhost:4105",
    });
    expect(env.PORT).toBe("4201");
    expect(env.CONVEXPRESS_CONVEX_URL).toBe("http://192.168.1.246:4820");
    expect(env.CONVEXPRESS_CONVEX_SITE_URL).toBe("http://192.168.1.246:4821");
    expect(env.CONVEXPRESS_SITE_URL).toBe("http://127.0.0.1:4201");
    expect(env.VITE_APP_URL).toBe("http://127.0.0.1:4201");
    expect(env.CONVEXPRESS_ADMIN_APP_URL).toBe("http://localhost:4105");
    expect(env.VITE_CLERK_PUBLISHABLE_KEY).toBe("pk_test_abc");
    expect(env.CONVEXPRESS_VITE_CACHE_DIR).toBe("/tmp/cache");
    expect(env.CONVEXPRESS_INSTANCE_KEY).toBe("acceptance:northstar:shop:live");
  });
});
