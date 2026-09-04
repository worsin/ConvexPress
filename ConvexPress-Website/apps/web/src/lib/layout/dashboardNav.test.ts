import { describe, expect, test } from "bun:test";

import { allDashboardNavItems, buildDashboardNavItems, rebaseDashboardNavPath } from "./dashboardNav";

const ids = (settings: Parameters<typeof buildDashboardNavItems>[0], options?: Parameters<typeof buildDashboardNavItems>[1]) =>
  buildDashboardNavItems(settings, options).map((item) => item.id);

describe("buildDashboardNavItems", () => {
  test("core items only when no plugin is enabled", () => {
    expect(ids({ plugins: { lmsEnabled: false } })).toEqual([
      "home",
      "posts",
      "comments",
      "notifications",
      "profile",
      "security",
      "settings",
    ]);
  });

  test("null settings hide every gated item", () => {
    expect(ids(null)).toEqual(["home", "posts", "comments", "notifications", "profile", "security", "settings"]);
  });

  test("courses show only when the LMS plugin is enabled", () => {
    expect(ids({ plugins: {} })).toContain("courses");
    expect(ids({ plugins: { lmsEnabled: true } })).toContain("courses");
    expect(ids({ plugins: { lmsEnabled: false } })).not.toContain("courses");
  });

  test("commerce pages follow their plugin flags", () => {
    const commerceOnly = ids({ plugins: { commerceEnabled: true, lmsEnabled: false } });
    expect(commerceOnly).toEqual([
      "home",
      "posts",
      "comments",
      "notifications",
      "orders",
      "addresses",
      "profile",
      "security",
      "settings",
    ]);

    const everything = ids({
      plugins: {
        commerceEnabled: true,
        commerceSubscriptionsEnabled: true,
        commerceReturnsEnabled: true,
        commerceDigitalEnabled: true,
        commerceWishlistsEnabled: true,
        commerceReviewsEnabled: true,
        membershipEnabled: true,
        lmsEnabled: true,
      },
    });
    expect(everything).toEqual([
      "home",
      "posts",
      "comments",
      "notifications",
      "orders",
      "subscriptions",
      "returns",
      "downloads",
      "wishlist",
      "reviews",
      "addresses",
      "membership",
      "courses",
      "profile",
      "security",
      "settings",
    ]);
  });

  test("commerce sub-plugins never show without commerce itself", () => {
    const list = ids({
      plugins: {
        commerceEnabled: false,
        commerceSubscriptionsEnabled: true,
        commerceReturnsEnabled: true,
        commerceDigitalEnabled: true,
        commerceWishlistsEnabled: true,
        commerceReviewsEnabled: true,
        lmsEnabled: false,
      },
    });
    for (const id of ["orders", "subscriptions", "returns", "downloads", "wishlist", "reviews", "addresses"]) {
      expect(list).not.toContain(id);
    }
  });

  test("capability gate hides My Posts when the viewer lacks edit_posts", () => {
    expect(ids({ plugins: { lmsEnabled: false } }, { can: () => false })).not.toContain("posts");
    expect(ids({ plugins: { lmsEnabled: false } }, { can: (cap) => cap === "edit_posts" })).toContain("posts");
  });

  test("paths are rebased onto a configured base path", () => {
    const items = buildDashboardNavItems({ plugins: { commerceEnabled: true } }, { basePath: "/account" });
    expect(items.find((item) => item.id === "home")?.to).toBe("/account");
    expect(items.find((item) => item.id === "orders")?.to).toBe("/account/orders");
    expect(rebaseDashboardNavPath("/dashboard/profile", "/members/area")).toBe("/members/area/profile");
    expect(rebaseDashboardNavPath("/dashboard/profile", undefined)).toBe("/dashboard/profile");
  });

  test("every item has a registry-style icon name", () => {
    for (const item of allDashboardNavItems()) {
      expect(item.iconName, item.id).toBeTruthy();
    }
  });
});
