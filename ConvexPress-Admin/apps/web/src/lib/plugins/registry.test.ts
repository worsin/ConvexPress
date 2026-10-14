import { describe, expect, test } from "bun:test";

import { getPluginIdForAdminAccess, getPluginIdForRoutePath, isPluginEnabled } from "./registry";

describe("plugin ownership of paths", () => {
  test("the most specific prefix owns an admin path", () => {
    expect(getPluginIdForAdminAccess("/commerce")).toBe("commerce");
    expect(getPluginIdForAdminAccess("/commerce/orders")).toBe("commerce");
    expect(getPluginIdForAdminAccess("/commerce/orders/abandoned")).toBe("commerceStorefront");
    expect(getPluginIdForAdminAccess("/commerce/products/new")).toBe("commerceStorefront");
    expect(getPluginIdForAdminAccess("/commerce/settings")).toBe("commerce");
    expect(getPluginIdForAdminAccess("/commerce/settings/shipping/zones")).toBe("commerceStorefront");
    expect(getPluginIdForAdminAccess("/commerce/returns/abc")).toBe("commerceReturns");
    expect(getPluginIdForAdminAccess("/commerce/subscriptions/contracts")).toBe("commerceSubscriptions");
    expect(getPluginIdForAdminAccess("/posts")).toBeNull();
  });

  test("shop pages on the website belong to the storefront", () => {
    expect(getPluginIdForRoutePath("/products/widget")).toBe("commerceStorefront");
    expect(getPluginIdForRoutePath("/cart")).toBe("commerceStorefront");
    expect(getPluginIdForRoutePath("/dashboard/returns")).toBe("commerceReturns");
  });
});

describe("storefront enablement", () => {
  test("on wherever commerce is, unless turned off; never without commerce", () => {
    expect(isPluginEnabled("commerceStorefront", { commerceEnabled: true })).toBe(true);
    expect(isPluginEnabled("commerceStorefront", { commerceEnabled: true, commerceStorefrontEnabled: false })).toBe(false);
    expect(isPluginEnabled("commerceStorefront", { commerceEnabled: false, commerceStorefrontEnabled: true })).toBe(false);
  });
});
