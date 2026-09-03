import { describe, expect, test } from "bun:test";

import {
  validateConnectionProvisionRequest,
  validateDeploymentAdminKey,
} from "./connectionProvisionValidation";

describe("secure connection provisioning validation", () => {
  test("accepts only public target metadata plus the current operator token", () => {
    expect(
      validateConnectionProvisionRequest({
        instanceId: "jh7abc123",
        name: "Northstar live",
        accountLabel: "Northstar production",
        authToken: `${"a".repeat(80)}.${"b".repeat(80)}.${"c".repeat(80)}`,
      }),
    ).toEqual({
      instanceId: "jh7abc123",
      name: "Northstar live",
      accountLabel: "Northstar production",
      authToken: `${"a".repeat(80)}.${"b".repeat(80)}.${"c".repeat(80)}`,
    });
  });

  test("rejects any renderer request that contains credential-shaped fields", () => {
    expect(() =>
      validateConnectionProvisionRequest({
        instanceId: "jh7abc123",
        name: "Northstar live",
        authToken: `${"a".repeat(80)}.${"b".repeat(80)}.${"c".repeat(80)}`,
        deploymentAdminKey: "local|must-never-cross-the-app-renderer",
      }),
    ).toThrow("Connection request contains unsupported fields");
  });

  test("accepts a deploy key only inside the isolated Electron credential path", () => {
    expect(validateDeploymentAdminKey("local|this-is-a-long-local-admin-key")).toBe(
      "local|this-is-a-long-local-admin-key",
    );
    expect(() => validateDeploymentAdminKey("short")).toThrow(
      "Deployment credential is invalid",
    );
    expect(() => validateDeploymentAdminKey("x".repeat(16_385))).toThrow(
      "Deployment credential is invalid",
    );
  });
});
