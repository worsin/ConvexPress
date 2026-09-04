import { describe, expect, test } from "bun:test";

import { CORE_DASHBOARD_PAGES } from "@backend/convex/extensions/dashboard/registry";
import { DASHBOARD_DEFAULTS } from "@backend/convex/settings/defaults";

import {
  buildPreviewFromMenu,
  buildProfileFromRegistry,
  buildSidebarFromRegistry,
  buildTopbarFromRegistry,
  createDashboardDraft,
  dashboardItemHref,
  describeVisibility,
  draftToSectionValues,
  validateDashboardDraft,
  welcomePreview,
} from "./settings-model";

const flags = { commerceEnabled: true, commerceSubscriptionsEnabled: false, ticketsEnabled: true, lmsEnabled: false, knowledgeBaseEnabled: true, membershipEnabled: false };

describe("draft", () => {
  test("createDashboardDraft fills every field from defaults", () => {
    expect(createDashboardDraft(null)).toEqual(DASHBOARD_DEFAULTS);
    expect(createDashboardDraft({ layout: "bogus", sidebarWidth: "280", showSearch: true })).toMatchObject({
      layout: "sidebar",
      sidebarWidth: 280,
      showSearch: true,
    });
  });

  test("validateDashboardDraft mirrors the backend rules", () => {
    const good = createDashboardDraft({ basePath: "/members/area" });
    expect(validateDashboardDraft(good)).toEqual({});
    const bad = createDashboardDraft({ basePath: "/Dashboard/", sidebarWidth: 100, brandMark: "custom" });
    const errors = validateDashboardDraft(bad);
    expect(errors.basePath).toBeDefined();
    expect(errors.sidebarWidth).toBeDefined();
    expect(errors.customLogoUrl).toBeDefined();
    expect(validateDashboardDraft(createDashboardDraft({ customLogoUrl: "not a url" })).customLogoUrl).toBeDefined();
    expect(validateDashboardDraft(createDashboardDraft({ customLogoUrl: "/media/logo.png" })).customLogoUrl).toBeUndefined();
  });

  test("draftToSectionValues trims text and rounds width", () => {
    const values = draftToSectionValues(createDashboardDraft({ basePath: " /account ", sidebarWidth: 250.6 }));
    expect(values.basePath).toBe("/account");
    expect(values.sidebarWidth).toBe(251);
    expect(Object.keys(values).sort()).toEqual(Object.keys(DASHBOARD_DEFAULTS).sort());
  });

  test("welcomePreview substitutes the name token", () => {
    expect(welcomePreview("Hi {name}, {name}!", "Sam")).toBe("Hi Sam, Sam!");
  });
});

describe("registry previews", () => {
  test("sidebar groups enabled pages under headings and skips disabled plugins", () => {
    const nodes = buildSidebarFromRegistry(CORE_DASHBOARD_PAGES, flags, "/dashboard");
    const keys = nodes.map((node) => node.key);
    expect(keys[0]).toBe("home");
    expect(keys).toContain("orders");
    expect(keys).not.toContain("subscriptions");
    expect(keys).not.toContain("courses");
    expect(keys).toContain("heading-commerce");
    expect(keys).not.toContain("heading-learning");
    expect(nodes.find((node) => node.key === "orders")?.href).toBe("/dashboard/orders");
    expect(nodes.find((node) => node.key === "orders")?.badge).toBe("orders.active");
  });

  test("topbar keeps overview + activity pages only", () => {
    const keys = buildTopbarFromRegistry(CORE_DASHBOARD_PAGES, flags, "/d").map((node) => node.key);
    expect(keys).toEqual(["home", "notifications", "posts", "comments"]);
  });

  test("profile menu ends with a separator and sign out", () => {
    const nodes = buildProfileFromRegistry(CORE_DASHBOARD_PAGES, flags, "/d");
    expect(nodes[0]).toMatchObject({ key: "home", href: "/d" });
    expect(nodes.at(-2)?.kind).toBe("separator");
    expect(nodes.at(-1)?.label).toBe("Sign out");
    expect(nodes.map((node) => node.key)).toContain("security");
  });
});

describe("menu previews", () => {
  test("buildPreviewFromMenu nests children, decorates dashboard items, and notes rules", () => {
    const rows = [
      { _id: "h", itemType: "heading", label: "Shop", position: 0 },
      { _id: "o", itemType: "dashboard", objectId: "orders", label: "My orders", position: 1, roles: ["customer"] },
      { _id: "c", itemType: "custom", label: "Blog", url: "/blog", position: 2, parentItemId: "o" },
      { _id: "s", itemType: "separator", label: "", position: 3 },
      { _id: "sub", itemType: "dashboard", objectId: "subscriptions", label: "Plans", position: 4, pathOverride: "/account" },
      { _id: "x", itemType: "page", label: "Gone", position: 5, isOrphaned: true },
    ];
    const nodes = buildPreviewFromMenu(rows, CORE_DASHBOARD_PAGES, flags, "/dashboard");
    expect(nodes.map((node) => node.kind)).toEqual(["heading", "link", "separator", "link"]);
    const orders = nodes[1];
    expect(orders).toMatchObject({ icon: "shopping-bag", badge: "orders.active", href: "/dashboard/orders" });
    expect(orders.note).toContain("roles: customer");
    expect(orders.children?.[0]).toMatchObject({ label: "Blog", href: "/blog" });
    expect(nodes[3].href).toBe("/account/subscriptions");
    expect(nodes[3].note).toContain("plugin is off");
  });

  test("dashboardItemHref prefers the override", () => {
    expect(dashboardItemHref({ objectId: "orders" }, CORE_DASHBOARD_PAGES, "/dash")).toBe("/dash/orders");
    expect(dashboardItemHref({ objectId: "orders", pathOverride: "/me" }, CORE_DASHBOARD_PAGES, "/dash")).toBe("/me/orders");
  });

  test("describeVisibility summarises every rule", () => {
    expect(describeVisibility({})).toBeUndefined();
    expect(describeVisibility({ visibility: "signedIn", roles: ["editor"], membershipPlans: ["pro"], capability: "edit_posts" })).toBe(
      "signed-in only · roles: editor · plans: pro · needs edit_posts",
    );
  });
});
