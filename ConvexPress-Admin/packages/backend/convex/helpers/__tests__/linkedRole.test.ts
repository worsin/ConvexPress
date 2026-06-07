import { describe, expect, test } from "bun:test";

import {
  getUnsafeMembershipLinkedCapabilities,
  isMembershipAuthCapability,
  pickHighestRole,
} from "../permissions";

type R = {
  _id: string;
  level: number;
  status: "active" | "inactive";
  type: "internal" | "customer" | "system";
  slug: string;
  capabilities: string[];
};

const editor: R = {
  _id: "r-editor",
  level: 80,
  status: "active",
  type: "internal",
  slug: "editor",
  capabilities: [],
};
const admin: R = {
  _id: "r-admin",
  level: 100,
  status: "active",
  type: "internal",
  slug: "administrator",
  capabilities: [],
};
const author: R = {
  _id: "r-author",
  level: 60,
  status: "active",
  type: "customer",
  slug: "author",
  capabilities: [],
};
const subscriber: R = {
  _id: "r-subscriber",
  level: 20,
  status: "active",
  type: "customer",
  slug: "subscriber",
  capabilities: [],
};
const vip: R = {
  _id: "r-vip",
  level: 70,
  status: "active",
  type: "customer",
  slug: "vip",
  capabilities: [],
};
const adminInactive: R = {
  _id: "r-admin-inactive",
  level: 100,
  status: "inactive",
  type: "internal",
  slug: "administrator",
  capabilities: [],
};

describe("pickHighestRole", () => {
  test("returns base role when no grants provided", () => {
    expect(pickHighestRole(editor, [])).toBe(editor);
  });

  test("null base + no grants → null", () => {
    expect(pickHighestRole(null, [])).toBeNull();
  });

  test("customer grant role wins when its level is higher than customer base", () => {
    expect(pickHighestRole(subscriber, [author])).toBe(author);
  });

  test("base wins when its level is higher than any grant", () => {
    expect(pickHighestRole(author, [subscriber])).toBe(author);
  });

  test("internal base roles are not overridden by membership grants", () => {
    expect(pickHighestRole(editor, [vip])).toBe(editor);
  });

  test("internal grant roles are ignored", () => {
    expect(pickHighestRole(subscriber, [admin])).toBe(subscriber);
    expect(pickHighestRole(null, [admin])).toBeNull();
  });

  test("inactive grant roles are ignored", () => {
    expect(pickHighestRole(editor, [adminInactive])).toBe(editor);
  });

  test("picks max level across multiple active customer grant roles", () => {
    expect(pickHighestRole(subscriber, [author, vip])).toBe(vip);
  });

  test("null base + active customer grant -> grant", () => {
    expect(pickHighestRole(null, [author])).toBe(author);
  });
});

describe("isMembershipAuthCapability", () => {
  test("allows built-in customer role auth capabilities", () => {
    expect(isMembershipAuthCapability("post.read")).toBe(true);
    expect(isMembershipAuthCapability("profile.update")).toBe(true);
  });

  test("rejects internal/admin auth capabilities", () => {
    expect(isMembershipAuthCapability("manage_options")).toBe(false);
    expect(isMembershipAuthCapability("role.assign")).toBe(false);
    expect(isMembershipAuthCapability("settings.update_general")).toBe(false);
  });

  test("treats unknown membership entitlement flags as non-auth capabilities", () => {
    expect(isMembershipAuthCapability("post.view_premium")).toBe(false);
  });
});

describe("getUnsafeMembershipLinkedCapabilities", () => {
  test("flags known unsafe auth capabilities but allows entitlement flags", () => {
    expect(
      getUnsafeMembershipLinkedCapabilities([
        "post.read",
        "post.view_premium",
        "manage_options",
        "role.assign",
        "post.edit",
      ]),
    ).toEqual(["manage_options", "role.assign", "post.edit"]);
  });
});
