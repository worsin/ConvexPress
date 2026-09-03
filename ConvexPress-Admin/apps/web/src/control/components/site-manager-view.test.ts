import { describe, expect, test } from "bun:test";

import {
  buildEnvironmentKey,
  buildWebsiteKey,
  controlSurfaceVisibility,
  expectedConnectionRevocation,
  portfolioControlVisibility,
  slugifyPortablePart,
} from "./site-manager-view";

describe("site manager presentation policy", () => {
  test("builds stable portable website and environment keys", () => {
    expect(slugifyPortablePart("  Northstar & Co.  ")).toBe("northstar-co");
    expect(buildWebsiteKey("northstar", "Shop Online")).toBe(
      "northstar:shop-online",
    );
    expect(
      buildEnvironmentKey({
        websiteKey: "northstar:shop-online",
        kind: "staging",
        label: "QA Two",
        existingKeys: ["northstar:shop-online:staging"],
      }),
    ).toBe("northstar:shop-online:staging:qa-two");
  });

  test("requires an exact connection-specific revocation phrase", () => {
    expect(expectedConnectionRevocation("jd7connection")).toBe(
      "REVOKE CONNECTION jd7connection",
    );
  });

  test("keeps website controls bound to website authorization", () => {
    expect(
      portfolioControlVisibility({
        hierarchyManage: false,
        businessUpdate: true,
        websiteUpdate: false,
      }),
    ).toEqual({
      editOrganization: false,
      editBusiness: true,
      editWebsite: false,
      createWebsite: true,
    });
  });

  test("hides lifecycle and handoff launchers when the target needs live authority", () => {
    expect(
      controlSurfaceVisibility({
        backupAllowed: true,
        selectedEnvironmentIsLive: false,
        websiteHasLiveEnvironment: true,
        liveOperateAllowed: false,
        handoffExportAllowed: true,
        handoffImportAllowed: false,
      }),
    ).toEqual({
      operations: true,
      handoffExport: false,
      handoffImport: false,
      handoff: false,
    });
  });
});
