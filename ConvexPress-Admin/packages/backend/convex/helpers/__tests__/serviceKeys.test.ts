import { describe, expect, test } from "bun:test";

import { encryptSettingSecret } from "../settingsSecret";
import { resolveServiceKey, resolveServiceKeyAsync } from "../serviceKeys";

describe("service key resolution", () => {
  test("the sync resolver hands back stored ciphertext untouched", async () => {
    const stored = await encryptSettingSecret("sk_test_123");
    expect(stored.startsWith("enc:") || stored.startsWith("b64:")).toBe(true);
    expect(resolveServiceKey({ stripeSecretKey: stored }, "stripeSecretKey", "STRIPE_SECRET_KEY")).toBe(stored);
  });

  test("the async resolver decrypts what Settings stored", async () => {
    const stored = await encryptSettingSecret("sk_test_123");
    expect(await resolveServiceKeyAsync({ stripeSecretKey: stored }, "stripeSecretKey", "STRIPE_SECRET_KEY")).toBe(
      "sk_test_123",
    );
  });

  test("plain values and env fallbacks pass through", async () => {
    expect(await resolveServiceKeyAsync({ key: "plain" }, "key", "UNSET_ENV_FOR_TEST")).toBe("plain");
    expect(await resolveServiceKeyAsync({ key: "" }, "key", "UNSET_ENV_FOR_TEST")).toBeUndefined();
  });
});
