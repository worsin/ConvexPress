import { describe, expect, test } from "bun:test";

import { collectLegacySecrets, withReplacedValues } from "../settingsSecretUpgrade";

describe("legacy secret upgrade", () => {
  const values = {
    apiKey: "b64:c2VjcmV0",
    publishableKey: "b64:not-a-secret-field",
    label: "b64:looks-encoded-but-not-secret",
    nested: { clientSecret: "b64:aW5uZXI=", already: { token: "enc:abc" } },
    list: [{ token: "b64:ignored-in-arrays" }],
  };

  test("finds only b64 values on secret-named fields, recursively", () => {
    expect(collectLegacySecrets(values).map((entry) => entry.path.join("."))).toEqual([
      "apiKey",
      "nested.clientSecret",
    ]);
  });

  test("replaces values in a copy without touching anything else", () => {
    const next = withReplacedValues(values, [
      { path: ["apiKey"], value: "enc:1" },
      { path: ["nested", "clientSecret"], value: "enc:2" },
    ]);
    expect(next.apiKey).toBe("enc:1");
    expect((next.nested as { clientSecret: string }).clientSecret).toBe("enc:2");
    expect(values.apiKey).toBe("b64:c2VjcmV0");
    expect(next.label).toBe(values.label);
  });
});
