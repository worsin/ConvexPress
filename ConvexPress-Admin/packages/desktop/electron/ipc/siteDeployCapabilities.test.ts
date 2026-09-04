import { describe, expect, test } from "bun:test";
import { MANAGEMENT_CAPABILITY_CODES } from "@convexpress/site-contract";

import { MANAGEMENT_CAPABILITIES } from "./siteDeploy";

describe("site initializer capabilities", () => {
  test("configures exactly the capabilities the control plane enrolls", () => {
    // A site that lacks any code from the contract rejects the controller's
    // enrollment with "Authority capability is not supported by this site".
    expect([...MANAGEMENT_CAPABILITIES].sort()).toEqual([...MANAGEMENT_CAPABILITY_CODES].sort());
  });
});
