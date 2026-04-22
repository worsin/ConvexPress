import { describe, expect, test } from "bun:test";

import { pickHighestRole } from "../permissions";

type R = {
  _id: string;
  level: number;
  status: "active" | "inactive";
  slug: string;
  capabilities: string[];
};

const editor: R = {
  _id: "r-editor",
  level: 80,
  status: "active",
  slug: "editor",
  capabilities: [],
};
const admin: R = {
  _id: "r-admin",
  level: 100,
  status: "active",
  slug: "administrator",
  capabilities: [],
};
const author: R = {
  _id: "r-author",
  level: 60,
  status: "active",
  slug: "author",
  capabilities: [],
};
const subscriber: R = {
  _id: "r-subscriber",
  level: 20,
  status: "active",
  slug: "subscriber",
  capabilities: [],
};
const adminInactive: R = {
  _id: "r-admin-inactive",
  level: 100,
  status: "inactive",
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

  test("grant role wins when its level is higher than base", () => {
    expect(pickHighestRole(editor, [admin])).toBe(admin);
  });

  test("base wins when its level is higher than any grant", () => {
    expect(pickHighestRole(admin, [editor])).toBe(admin);
  });

  test("inactive grant roles are ignored", () => {
    expect(pickHighestRole(editor, [adminInactive])).toBe(editor);
  });

  test("picks max level across multiple active grant roles", () => {
    expect(pickHighestRole(subscriber, [author, editor])).toBe(editor);
  });

  test("null base + active grant → grant", () => {
    expect(pickHighestRole(null, [editor])).toBe(editor);
  });
});
