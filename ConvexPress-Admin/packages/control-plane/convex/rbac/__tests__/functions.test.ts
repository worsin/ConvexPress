import { describe, expect, test } from "bun:test";

import { publicAccessDeniedData } from "../functions";

describe("control-plane denial payload", () => {
  test("does not expose internal decision reasons or rule identifiers", () => {
    const payload = publicAccessDeniedData();
    expect(payload).toEqual({
      code: "CONTROL_PLANE_ACCESS_DENIED",
      message:
        "This operator is not authorized for the requested control-plane operation",
    });
    expect(payload).not.toHaveProperty("reason");
    expect(payload).not.toHaveProperty("winningRuleId");
  });
});
