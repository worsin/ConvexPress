import { describe, expect, test } from "bun:test";
import { normalizeDeploymentOrigin } from "./deploymentOrigins";

describe("normalizeDeploymentOrigin", () => {
  test("keeps exact http(s) origins and drops paths", () => {
    expect(normalizeDeploymentOrigin("http://192.168.1.246:4820/api/storage/x")).toBe("http://192.168.1.246:4820");
    expect(normalizeDeploymentOrigin("https://happy-otter-123.convex.cloud")).toBe("https://happy-otter-123.convex.cloud");
  });
  test("rejects credentials, other schemes and junk", () => {
    expect(normalizeDeploymentOrigin("http://user:pw@192.168.1.246:4820")).toBeNull();
    expect(normalizeDeploymentOrigin("ws://192.168.1.246:4820")).toBeNull();
    expect(normalizeDeploymentOrigin("file:///etc/passwd")).toBeNull();
    expect(normalizeDeploymentOrigin(42)).toBeNull();
    expect(normalizeDeploymentOrigin("not a url")).toBeNull();
  });
});
