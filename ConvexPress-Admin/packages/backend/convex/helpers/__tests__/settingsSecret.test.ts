import { describe, expect, test } from "bun:test";

import {
  isSecretFieldName,
  redactSettingSecrets,
  SECRET_SENTINEL,
} from "../settingsSecret";

describe("settings secret helpers", () => {
  test("treats service account JSON as a secret without masking the email", () => {
    expect(isSecretFieldName("ga4ServiceAccountJson")).toBe(true);
    expect(isSecretFieldName("service_account_json")).toBe(true);
    expect(isSecretFieldName("ga4ServiceAccountEmail")).toBe(false);
  });

  test("redacts keyfile-style settings values", () => {
    const redacted = redactSettingSecrets({
      ga4ServiceAccountJson:
        '{"type":"service_account","client_email":"analytics@example.test","private_key":"secret"}',
      ga4ServiceAccountEmail: "analytics@example.test",
      ga4PropertyId: "properties/123456789",
    });

    expect(redacted?.ga4ServiceAccountJson).toBe(SECRET_SENTINEL);
    expect(redacted?.ga4ServiceAccountEmail).toBe("analytics@example.test");
    expect(redacted?.ga4PropertyId).toBe("properties/123456789");
  });
});
