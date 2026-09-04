import { describe, expect, test } from "bun:test";

import type { MenuItem } from "@/components/menus/types";

import {
  BADGE_SOURCE_OPTIONS,
  buildMenuItemUpdateArgs,
  createMenuItemDraft,
  draftSignature,
  hasVisibilityRules,
  normalizeMenuItemDraft,
  originalReference,
  validateMenuItemDraft,
  validatePathOverride,
  visibilitySummary,
} from "./item-editor-model";

const base: MenuItem = {
  _id: "item1" as MenuItem["_id"],
  menuId: "menu1" as MenuItem["menuId"],
  itemType: "dashboard",
  objectId: "orders",
  label: "Orders",
  position: 0,
};

describe("draft mapping", () => {
  test("createMenuItemDraft fills defaults for missing fields", () => {
    const draft = createMenuItemDraft(base);
    expect(draft).toEqual({
      label: "Orders",
      title: "",
      cssClasses: "",
      openInNewTab: false,
      linkRel: "",
      description: "",
      url: "",
      icon: "",
      badge: "",
      pathOverride: "",
      visibility: "everyone",
      roles: [],
      membershipPlans: [],
      capability: "",
    });
  });

  test("createMenuItemDraft copies stored presentation and visibility", () => {
    const draft = createMenuItemDraft({
      ...base,
      icon: "shopping-bag",
      badge: "orders.active",
      pathOverride: "/account",
      visibility: "signedIn",
      roles: ["customer"],
      membershipPlans: ["pro"],
      capability: "view_orders",
      target: "_blank",
    });
    expect(draft).toMatchObject({
      icon: "shopping-bag",
      badge: "orders.active",
      pathOverride: "/account",
      visibility: "signedIn",
      roles: ["customer"],
      membershipPlans: ["pro"],
      capability: "view_orders",
      openInNewTab: true,
    });
  });

  test("createMenuItemDraft copies arrays instead of sharing them", () => {
    const roles = ["customer"];
    const draft = createMenuItemDraft({ ...base, roles });
    draft.roles.push("editor");
    expect(roles).toEqual(["customer"]);
  });
});

describe("normalization", () => {
  test("trims, dedupes, and keeps type-specific fields only", () => {
    const draft = {
      ...createMenuItemDraft(base),
      label: "  Orders ",
      url: "https://ignored",
      pathOverride: " /account ",
      roles: [" customer ", "customer", ""],
      icon: " shopping-bag ",
    };
    const normalized = normalizeMenuItemDraft(draft, "dashboard");
    expect(normalized.label).toBe("Orders");
    expect(normalized.url).toBeUndefined();
    expect(normalized.pathOverride).toBe("/account");
    expect(normalized.roles).toEqual(["customer"]);
    expect(normalized.icon).toBe("shopping-bag");
    expect(normalized.target).toBe("_self");
  });

  test("custom links keep the url, other types drop it", () => {
    const draft = { ...createMenuItemDraft({ ...base, itemType: "custom" }), url: " https://x.test " };
    expect(normalizeMenuItemDraft(draft, "custom").url).toBe("https://x.test");
    expect(normalizeMenuItemDraft(draft, "page").url).toBeUndefined();
    expect(normalizeMenuItemDraft(draft, "page").pathOverride).toBeUndefined();
  });

  test("headings drop link-only fields and separators get a stable label", () => {
    const draft = { ...createMenuItemDraft(base), label: "", title: "t", linkRel: "nofollow", badge: "orders.active", openInNewTab: true };
    const separator = normalizeMenuItemDraft(draft, "separator");
    expect(separator.label).toBe("Separator");
    expect(separator.title).toBeUndefined();
    expect(separator.badge).toBe("");
    expect(separator.target).toBe("_self");
    const heading = normalizeMenuItemDraft({ ...draft, label: "Shop", icon: "store" }, "heading");
    expect(heading.icon).toBe("store");
    expect(heading.linkRel).toBeUndefined();
  });

  test("draftSignature is stable for equal drafts", () => {
    const a = normalizeMenuItemDraft(createMenuItemDraft(base), "dashboard");
    const b = normalizeMenuItemDraft(createMenuItemDraft({ ...base }), "dashboard");
    expect(draftSignature(a)).toBe(draftSignature(b));
  });
});

describe("validation", () => {
  test("validatePathOverride accepts empty and lowercase paths", () => {
    expect(validatePathOverride("")).toBeNull();
    expect(validatePathOverride("/account")).toBeNull();
    expect(validatePathOverride("/my/area")).toBeNull();
    expect(validatePathOverride("/Account")).not.toBeNull();
    expect(validatePathOverride("/account/")).not.toBeNull();
    expect(validatePathOverride("account")).not.toBeNull();
  });

  test("validateMenuItemDraft reports label, url, path, and icon problems", () => {
    const empty = normalizeMenuItemDraft({ ...createMenuItemDraft(base), label: "" }, "dashboard");
    expect(validateMenuItemDraft(empty, "dashboard").label).toBeDefined();
    expect(validateMenuItemDraft(empty, "separator").label).toBeUndefined();

    const custom = normalizeMenuItemDraft({ ...createMenuItemDraft({ ...base, itemType: "custom" }), url: "" }, "custom");
    expect(validateMenuItemDraft(custom, "custom").url).toBeDefined();

    const badPath = normalizeMenuItemDraft({ ...createMenuItemDraft(base), pathOverride: "/Bad/" }, "dashboard");
    expect(validateMenuItemDraft(badPath, "dashboard").pathOverride).toBeDefined();

    const badIcon = normalizeMenuItemDraft({ ...createMenuItemDraft(base), icon: "Shopping Bag" }, "dashboard");
    expect(validateMenuItemDraft(badIcon, "dashboard").icon).toBeDefined();
  });
});

describe("update payload", () => {
  test("buildMenuItemUpdateArgs sends clears as empty strings and type-specific keys", () => {
    const normalized = normalizeMenuItemDraft(createMenuItemDraft(base), "dashboard");
    const args = buildMenuItemUpdateArgs(normalized, base);
    expect(args).toMatchObject({
      itemId: "item1",
      label: "Orders",
      icon: "",
      badge: "",
      pathOverride: "",
      visibility: "everyone",
      roles: [],
      membershipPlans: [],
      capability: "",
    });
    expect("url" in args).toBe(false);

    const custom = { ...base, itemType: "custom" as const };
    const customArgs = buildMenuItemUpdateArgs(
      normalizeMenuItemDraft({ ...createMenuItemDraft(custom), url: "https://x.test" }, "custom"),
      custom,
    );
    expect(customArgs.url).toBe("https://x.test");
    expect("pathOverride" in customArgs).toBe(false);
  });
});

describe("card helpers", () => {
  test("hasVisibilityRules and visibilitySummary", () => {
    expect(hasVisibilityRules(base)).toBe(false);
    expect(hasVisibilityRules({ ...base, visibility: "everyone" })).toBe(false);
    expect(hasVisibilityRules({ ...base, visibility: "signedIn" })).toBe(true);
    expect(hasVisibilityRules({ ...base, roles: ["editor"] })).toBe(true);
    expect(hasVisibilityRules({ ...base, capability: " " })).toBe(false);
    expect(visibilitySummary({ ...base, visibility: "signedOut", membershipPlans: ["pro", "team"] })).toBe(
      "Signed-out visitors only · Plans: pro, team",
    );
  });

  test("originalReference describes each type", () => {
    expect(originalReference(base)).toBe("Dashboard page: orders");
    expect(originalReference({ ...base, itemType: "custom", url: "/x" })).toBe("Custom URL: /x");
    expect(originalReference({ ...base, itemType: "heading" })).toContain("heading");
    expect(originalReference({ ...base, itemType: "separator" })).toContain("divider");
    expect(originalReference({ ...base, itemType: "page", label: "About" })).toBe("Page: About");
  });

  test("badge options carry friendly labels for every registry source", () => {
    expect(BADGE_SOURCE_OPTIONS.map((option) => option.value)).toEqual([
      "notifications.unread",
      "tickets.awaitingYou",
      "orders.active",
      "cart.items",
      "courses.inProgress",
    ]);
    for (const option of BADGE_SOURCE_OPTIONS) expect(option.label).not.toContain(".");
  });
});
