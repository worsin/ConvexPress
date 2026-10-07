import { describe, expect, test } from "bun:test";

import {
  badgeCountFor,
  flattenNavLinks,
  isNavItemActive,
  menuToNav,
  registryToNav,
  resolvePageFromRemainder,
  type MenuTreeNode,
} from "./nav";
import type { DashboardPageDefinition } from "./types";

const pages: DashboardPageDefinition[] = [
  { id: "home", title: "Dashboard", icon: "layout-dashboard", description: "", path: "", pluginId: "core", group: "overview", defaultInSidebar: true },
  { id: "posts", title: "My posts", icon: "file-text", description: "", path: "/posts", pluginId: "core", capability: "post.update", group: "activity", defaultInSidebar: true },
  { id: "orders", title: "Orders", icon: "shopping-bag", description: "", path: "/orders", pluginId: "commerce", group: "commerce", defaultInSidebar: true, badge: "orders.active" },
  { id: "reviews", title: "My reviews", icon: "star", description: "", path: "/reviews", pluginId: "commerceReviews", group: "commerce", defaultInSidebar: false },
  { id: "profile", title: "Profile", icon: "user", description: "", path: "/profile", pluginId: "core", group: "account", defaultInSidebar: true },
];

describe("menuToNav", () => {
  test("maps dashboard, heading, separator, and custom items", () => {
    const tree: MenuTreeNode[] = [
      { _id: "1", itemType: "heading", label: "Shop" },
      { _id: "2", itemType: "dashboard", objectId: "orders", label: "Orders", url: "/account/orders", icon: "shopping-bag", badge: "orders.active" },
      { _id: "3", itemType: "separator", label: "" },
      { _id: "4", itemType: "custom", label: "Docs", url: "https://docs.example.com", target: "_blank", linkRel: "noopener" },
      { _id: "5", itemType: "dashboard", objectId: "home", label: "Home", url: "/account" },
      { _id: "6", itemType: "page", label: "Gone", url: "/page/old", isOrphaned: true },
    ];
    const nav = menuToNav(tree, "/account");
    expect(nav.map((item) => item.kind)).toEqual(["heading", "link", "separator", "link", "link"]);
    expect(nav[1]).toMatchObject({ href: "/account/orders", icon: "shopping-bag", badge: "orders.active", pageId: "orders", exact: false });
    expect(nav[3]).toMatchObject({ external: true, target: "_blank", rel: "noopener" });
    expect(nav[4]).toMatchObject({ exact: true, pageId: "home" });
  });
  test("preserves heading descendants", () => {
    const nav = menuToNav([{_id:"heading",itemType:"heading",label:"Account",children:[{_id:"profile",itemType:"custom",label:"Profile",url:"/members/profile"}]}], "/members");
    expect(nav[0].children[0]?.href).toBe("/members/profile");
  });
  test("nests children", () => {
    const nav = menuToNav([
      { _id: "p", itemType: "custom", label: "Parent", url: "/x", children: [{ _id: "c", itemType: "custom", label: "Child", url: "/x/y" }] },
    ], "/dashboard");
    expect(nav[0].children[0].href).toBe("/x/y");
    expect(flattenNavLinks(nav).map((item) => item.id)).toEqual(["p", "c"]);
  });
});

describe("registryToNav", () => {
  test("groups by registry order, honors capabilities and defaultInSidebar", () => {
    const nav = registryToNav(pages, { basePath: "/dashboard", capabilities: [], withHeadings: true });
    expect(nav.map((item) => item.kind === "heading" ? `#${item.label}` : item.pageId)).toEqual([
      "home",
      "#Shop",
      "orders",
      "#Account",
      "profile",
    ]);
    expect(nav.find((item) => item.pageId === "home")?.href).toBe("/dashboard");
    expect(nav.find((item) => item.pageId === "orders")?.href).toBe("/dashboard/orders");
  });
  test("includes capability-gated and hidden pages when allowed", () => {
    const nav = registryToNav(pages, { basePath: "/account", capabilities: ["post.update"], includeAll: true });
    expect(nav.map((item) => item.pageId)).toEqual(["home", "posts", "orders", "reviews", "profile"]);
  });
  test("skips pages that have no website module", () => {
    const nav = registryToNav(pages, { basePath: "/account", implementedPageIds: new Set(["home", "profile"]) });
    expect(nav.map((item) => item.pageId)).toEqual(["home", "profile"]);
  });
});

describe("isNavItemActive", () => {
  const home = registryToNav(pages, { basePath: "/dashboard" }).find((item) => item.pageId === "home")!;
  const orders = registryToNav(pages, { basePath: "/dashboard" }).find((item) => item.pageId === "orders")!;
  test("home matches exactly", () => {
    expect(isNavItemActive(home, "/dashboard")).toBe(true);
    expect(isNavItemActive(home, "/dashboard/")).toBe(true);
    expect(isNavItemActive(home, "/dashboard/orders")).toBe(false);
  });
  test("pages match nested paths", () => {
    expect(isNavItemActive(orders, "/dashboard/orders/123")).toBe(true);
    expect(isNavItemActive(orders, "/dashboard/orders-old")).toBe(false);
  });
});

describe("badgeCountFor", () => {
  test("reads the badge source", () => {
    const orders = registryToNav(pages, { basePath: "/dashboard" }).find((item) => item.pageId === "orders")!;
    expect(badgeCountFor(orders, { "orders.active": 3 })).toBe(3);
    expect(badgeCountFor(orders, { "orders.active": 0 })).toBe(0);
    expect(badgeCountFor(orders, null)).toBe(0);
  });
});

describe("resolvePageFromRemainder", () => {
  test("maps the empty remainder to the landing page", () => {
    expect(resolvePageFromRemainder("", pages)?.page.id).toBe("home");
    expect(resolvePageFromRemainder("/", pages, "profile")?.page.id).toBe("profile");
  });
  test("matches the longest page path and returns the subpath", () => {
    expect(resolvePageFromRemainder("/orders/ORD-1/return", pages)).toMatchObject({ subpath: "/ORD-1/return" });
    expect(resolvePageFromRemainder("/orders", pages)).toMatchObject({ subpath: "" });
    expect(resolvePageFromRemainder("/orders-archive", pages)).toBeNull();
  });
});
