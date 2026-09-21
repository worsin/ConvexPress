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
  test("renders terminal diagnostics as plain text before scrubbing secrets", () => {
    expect(redactDeployLog("\u001b[96mconvex/example.ts\u001b[0m:14 TS7053", [])).toBe("convex/example.ts:14 TS7053");
    expect(redactDeployLog("token=private-\u001b[31mtest-secret\u001b[0m", ["private-test-secret"])).toBe("token=••••");
  });
  test("scrubs provided secrets and key shapes", () => {
    const line = "set CLERK_SECRET_KEY=sk_test_abcdef123 admin convex-self-hosted|0123456789abcdef whsec_zzz"; // gitleaks:allow -- Deliberately fake secret used to verify log redaction; not a credential.
    const out = redactDeployLog(line, ["convex-self-hosted|0123456789abcdef"]);
    expect(out).not.toContain("0123456789abcdef");
    expect(out).not.toContain("sk_test_abcdef123");
    expect(out).toContain("sk_test_••••");
    expect(out).toContain("whsec_••••");
  });
});

describe("assertSiteInitializeRequest", () => {
  const token = `${"a".repeat(40)}.${"b".repeat(40)}.${"c".repeat(40)}`;
  const base = {
    instanceId: "ins_1",
    websiteKey: "northstar-shop",
    instanceKey: "northstar-shop-live",
    environmentKind: "live",
    deploymentOrigin: "http://127.0.0.1:14820",
    managementOrigin: "http://127.0.0.1:14821",
    siteOrigin: "https://shop.example.com",
    siteTitle: "Northstar Shop",
    connectionName: "Controller",
    authToken: token,
    adminOrigins: ["http://127.0.0.1:4105"],
  };
  test("accepts a complete request", async () => {
    const { assertSiteInitializeRequest } = await import("./siteDeployValidation");
    const parsed = assertSiteInitializeRequest(base);
    expect(parsed.environmentKind).toBe("live");
    expect(parsed.adminOrigins).toEqual(["http://127.0.0.1:4105"]);
    expect(parsed.accountLabel).toBeUndefined();
  });
  test("rejects bad keys, kinds and tokens", async () => {
    const { assertSiteInitializeRequest } = await import("./siteDeployValidation");
    expect(() => assertSiteInitializeRequest({ ...base, websiteKey: "Bad Key!" })).toThrow();
    expect(() => assertSiteInitializeRequest({ ...base, environmentKind: "prod" })).toThrow();
    expect(() => assertSiteInitializeRequest({ ...base, authToken: "short" })).toThrow();
    expect(() => assertSiteInitializeRequest({ ...base, siteOrigin: "ftp://x" })).toThrow();
  });
});

describe("redactDeployLog multi-line secrets", () => {
  test("scrubs every line of a multi-line secret and PEM markers", () => {
    const key = "-----BEGIN PRIVATE KEY-----\nMIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQg5dFr3YRLEGhhA5KR\n-----END PRIVATE KEY-----"; // gitleaks:allow -- Deliberately fake secret used to verify log redaction; not a credential.
    expect(redactDeployLog("error: unknown option '-----BEGIN PRIVATE KEY-----", [key])).not.toContain("BEGIN PRIVATE KEY");
    expect(redactDeployLog("MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQg5dFr3YRLEGhhA5KR", [key])).toBe("••••");
    expect(redactDeployLog(`failed: ${key}`, [])).toBe("failed: [private key redacted]");
  });
});
