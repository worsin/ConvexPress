import { describe, expect, test } from "bun:test";

import {
  computeReadiness,
  decodePublishableKey,
  deriveHttpActionsOrigin,
  encodePublishableKey,
  environmentTypeFromSecretKey,
  mergeAllowedOrigins,
  normalizeClerkEnvironment,
  normalizeFrontendApi,
  oauthRedirectUrls,
  pickPrimaryDomain,
  uniqueOrigins,
  webhookEndpointUrl,
} from "../clerkConnectionHelpers";

const HOST = "endless-sawfish-45.clerk.accounts.dev";

describe("publishable key derivation", () => {
  test("round-trips host and environment", () => {
    const pk = encodePublishableKey(HOST, "development");
    expect(pk.startsWith("pk_test_")).toBe(true);
    expect(decodePublishableKey(pk)).toEqual({
      environmentType: "development",
      frontendApiHost: HOST,
      frontendApi: `https://${HOST}`,
    });
    const live = encodePublishableKey(`https://clerk.example.com/`, "production");
    expect(live.startsWith("pk_live_")).toBe(true);
    expect(decodePublishableKey(live)?.frontendApi).toBe("https://clerk.example.com");
  });

  test("rejects garbage", () => {
    expect(decodePublishableKey("pk_test_PLACEHOLDER")).toBeNull();
    expect(decodePublishableKey("sk_test_abc")).toBeNull();
    expect(decodePublishableKey("")).toBeNull();
  });

  test("secret key environment", () => {
    expect(environmentTypeFromSecretKey("sk_test_abc123")).toBe("development");
    expect(environmentTypeFromSecretKey("sk_live_abc123")).toBe("production");
    expect(environmentTypeFromSecretKey("whsec_x")).toBeNull();
  });

  test("normalizeFrontendApi accepts hosts and URLs", () => {
    expect(normalizeFrontendApi(HOST)).toBe(`https://${HOST}`);
    expect(normalizeFrontendApi(`https://${HOST}/`)).toBe(`https://${HOST}`);
    expect(normalizeFrontendApi("   ")).toBe("");
  });
});

describe("domains and origins", () => {
  const domains = [
    { name: "endless.sawfish-45.lcl.dev", is_satellite: false, frontend_api_url: `https://${HOST}`, accounts_portal_url: "https://x" },
    { name: "localhost:4105", is_satellite: false, frontend_api_url: "https://moving-akita-83.clerk.accounts.dev" },
    { name: "sat.example.com", is_satellite: true, frontend_api_url: "https://clerk.sat.example.com" },
  ];

  test("prefers the domain matching a known Frontend API, else the primary", () => {
    expect(pickPrimaryDomain(domains, "https://moving-akita-83.clerk.accounts.dev")?.name).toBe("localhost:4105");
    expect(pickPrimaryDomain(domains)?.name).toBe("endless.sawfish-45.lcl.dev");
    expect(pickPrimaryDomain([])).toBeNull();
  });

  test("uniqueOrigins normalises and dedupes", () => {
    expect(uniqueOrigins(["http://127.0.0.1:4301/", "HTTP://127.0.0.1:4301", "ftp://x", "", null, "https://shop.example.com/path"])).toEqual([
      "http://127.0.0.1:4301",
      "https://shop.example.com",
    ]);
  });

  test("allowed origins only grow an existing allowlist", () => {
    expect(mergeAllowedOrigins(null, ["http://localhost:4301"])).toEqual({ changed: false, next: null });
    expect(mergeAllowedOrigins([], ["http://localhost:4301"])).toEqual({ changed: false, next: null });
    expect(mergeAllowedOrigins(["https://a.com"], ["https://a.com", "https://b.com"])).toEqual({
      changed: true,
      next: ["https://a.com", "https://b.com"],
    });
  });

  test("redirect and webhook URLs", () => {
    expect(oauthRedirectUrls(["https://shop.example.com/"])).toEqual(["https://shop.example.com/api/auth/callback"]);
    expect(webhookEndpointUrl("https://happy-otter-1.convex.site")).toBe("https://happy-otter-1.convex.site/webhooks/clerk");
    expect(webhookEndpointUrl("")).toBeNull();
    expect(deriveHttpActionsOrigin("https://happy-otter-1.convex.cloud")).toBe("https://happy-otter-1.convex.site");
    expect(deriveHttpActionsOrigin("http://127.0.0.1:14820")).toBe("http://127.0.0.1:14821");
  });
});

describe("normalizeClerkEnvironment", () => {
  test("maps a real environment document", () => {
    const capabilities = normalizeClerkEnvironment({
      auth_config: { first_factors: ["email_code", "oauth_google", "password"], second_factors: ["phone_code"] },
      display_config: {
        application_name: "ConvexPress",
        preferred_sign_in_strategy: "password",
        instance_environment_type: "development",
        terms_url: null,
        privacy_policy_url: "https://example.com/privacy",
      },
      user_settings: {
        attributes: {
          email_address: { enabled: true, required: true, verifications: ["email_code"], used_for_first_factor: true },
          phone_number: { enabled: true, required: false, verifications: ["phone_code"], used_for_second_factor: true },
          username: { enabled: true, required: true },
          first_name: { enabled: false, required: false },
          last_name: { enabled: false, required: false },
          password: { enabled: true, required: true },
        },
        social: { oauth_google: { enabled: true }, oauth_github: { enabled: false }, oauth_apple: { enabled: true } },
        sign_up: { captcha_enabled: true, captcha_widget_type: "smart", progressive: true, mode: "public", legal_consent_enabled: true },
        sign_in: { second_factor: { required: false } },
        password_settings: { min_length: 10, max_length: 0, require_numbers: true, allowed_special_characters: "!@#" },
      },
    });
    expect(capabilities.attributes.username.required).toBe(true);
    expect(capabilities.attributes.firstName.enabled).toBe(false);
    expect(capabilities.attributes.phoneNumber.usedForSecondFactor).toBe(true);
    expect(capabilities.social).toEqual(["oauth_apple", "oauth_google"]);
    expect(capabilities.signUp.captchaEnabled).toBe(true);
    expect(capabilities.signUp.legalConsentEnabled).toBe(true);
    expect(capabilities.password.minLength).toBe(10);
    expect(capabilities.password.maxLength).toBe(72);
    expect(capabilities.password.requireNumbers).toBe(true);
    expect(capabilities.signIn.firstFactors).toContain("oauth_google");
    expect(capabilities.signIn.secondFactors).toEqual(["phone_code"]);
    expect(capabilities.links.privacyPolicyUrl).toBe("https://example.com/privacy");
    expect(capabilities.environmentType).toBe("development");
  });

  test("falls back to defaults for an empty document", () => {
    const capabilities = normalizeClerkEnvironment({});
    expect(capabilities.attributes.emailAddress.required).toBe(true);
    expect(capabilities.attributes.username.enabled).toBe(false);
    expect(capabilities.social).toEqual([]);
    expect(capabilities.signUp.captchaEnabled).toBe(false);
    expect(capabilities.password.minLength).toBe(8);
  });
});

describe("computeReadiness", () => {
  const base = {
    secretKeyValid: true,
    publishableKey: "pk_test_x",
    issuer: `https://${HOST}`,
    jwksKeyCount: 1,
    jwtTemplatePresent: true,
    jwtTemplateAudienceOk: true,
    deploymentIssuer: `https://${HOST}/`,
    deploymentHasSecret: true,
    webhookSecretStored: true,
    webhookLastReceivedAt: 1_700_000_000_000,
    capabilitiesSyncedAt: 1_700_000_000_000,
    connectionMode: "secret_key",
    claimedAt: null,
  };

  test("fully healthy connection is complete", () => {
    const readiness = computeReadiness(base);
    expect(readiness.loginReady).toBe(true);
    expect(readiness.complete).toBe(true);
    expect(readiness.items.every((item) => item.state === "ok")).toBe(true);
  });

  test("issuer mismatch on the deployment blocks login", () => {
    const readiness = computeReadiness({ ...base, deploymentIssuer: "https://other.clerk.accounts.dev" });
    expect(readiness.loginReady).toBe(false);
    expect(readiness.items.find((item) => item.id === "deployment_env")?.state).toBe("fail");
  });

  test("missing webhook is a warning, not a blocker", () => {
    const readiness = computeReadiness({ ...base, webhookSecretStored: false, webhookLastReceivedAt: null });
    expect(readiness.loginReady).toBe(true);
    expect(readiness.complete).toBe(false);
    expect(readiness.items.find((item) => item.id === "webhook")?.state).toBe("warn");
  });

  test("keyless apps carry a claim reminder", () => {
    const readiness = computeReadiness({ ...base, connectionMode: "keyless" });
    expect(readiness.items.find((item) => item.id === "claim")?.state).toBe("warn");
    expect(computeReadiness({ ...base, connectionMode: "keyless", claimedAt: 1 }).items.find((item) => item.id === "claim")?.state).toBe("ok");
  });
});
