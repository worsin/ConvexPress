import { describe, expect, test } from "bun:test";

import {
  assertSiteDeployRequest,
  parseDeploymentOrigin,
  redactDeployLog,
} from "./siteDeployValidation";

describe("parseDeploymentOrigin", () => {
  test("accepts https and private http origins", () => {
    expect(parseDeploymentOrigin("https://happy-otter-1.convex.cloud/")).toBe("https://happy-otter-1.convex.cloud");
    expect(parseDeploymentOrigin("http://127.0.0.1:14820")).toBe("http://127.0.0.1:14820");
    expect(parseDeploymentOrigin("http://192.168.1.246:4820")).toBe("http://192.168.1.246:4820");
  });
  test("rejects public plain-http and junk", () => {
    expect(() => parseDeploymentOrigin("http://example.com")).toThrow();
    expect(() => parseDeploymentOrigin("ftp://x")).toThrow();
    expect(() => parseDeploymentOrigin("")).toThrow();
  });
});

describe("assertSiteDeployRequest", () => {
  const base = {
    label: "Northstar Shop — Live",
    credential: { kind: "admin-key", deploymentOrigin: "http://127.0.0.1:14820", adminKey: "convex-self-hosted|0123456789abcdef" },
    envChanges: [
      { name: "CLERK_JWT_ISSUER_DOMAIN", value: "https://x.clerk.accounts.dev" },
      { name: "CLERK_SECRET_KEY", value: "sk_test_abc" },
    ],
  };

  test("accepts a well-formed admin-key request", () => {
    const parsed = assertSiteDeployRequest(base);
    expect(parsed.credential.kind).toBe("admin-key");
    expect(parsed.envChanges).toHaveLength(2);
    expect(parsed.envOnly).toBe(false);
  });

  test("accepts deploy-key credentials and null removals", () => {
    const parsed = assertSiteDeployRequest({
      ...base,
      credential: { kind: "deploy-key", deployKey: "prod:x|abc", deployment: "prod:x" },
      envChanges: [{ name: "CLERK_WEBHOOK_SECRET", value: null }],
      envOnly: true,
    });
    expect(parsed.credential.kind).toBe("deploy-key");
    expect(parsed.envChanges[0].value).toBeNull();
    expect(parsed.envOnly).toBe(true);
  });

  test("rejects unknown variables, duplicates and short keys", () => {
    expect(() => assertSiteDeployRequest({ ...base, envChanges: [{ name: "AUTH_PRIVATE_KEY", value: "x" }] })).toThrow();
    expect(() =>
      assertSiteDeployRequest({
        ...base,
        envChanges: [
          { name: "CLERK_SECRET_KEY", value: "a" },
          { name: "CLERK_SECRET_KEY", value: "b" },
        ],
      }),
    ).toThrow();
    expect(() => assertSiteDeployRequest({ ...base, credential: { ...base.credential, adminKey: "short" } })).toThrow();
    expect(() => assertSiteDeployRequest({ ...base, envChanges: [], envOnly: true })).toThrow();
  });
});

describe("redactDeployLog", () => {
  test("scrubs provided secrets and key shapes", () => {
    const line = "set CLERK_SECRET_KEY=sk_test_abcdef123 admin convex-self-hosted|0123456789abcdef whsec_zzz";
    const out = redactDeployLog(line, ["convex-self-hosted|0123456789abcdef"]);
    expect(out).not.toContain("0123456789abcdef");
    expect(out).not.toContain("sk_test_abcdef123");
    expect(out).toContain("sk_test_••••");
    expect(out).toContain("whsec_••••");
  });
});
