import { describe, expect, test } from "bun:test";

import {
  FIRST_ADMIN_SETUP_ROUTE,
  deriveSetupUsername,
} from "./first-admin-setup";

describe("first-admin setup helpers", () => {
  test("uses the setup checklist route after first-admin creation", () => {
    expect(FIRST_ADMIN_SETUP_ROUTE).toBe("/setup");
  });

  test("keeps explicit usernames when the wizard provides one", () => {
    expect(deriveSetupUsername("admin@example.com", " SiteOwner ")).toBe(
      "SiteOwner",
    );
  });

  test("derives a valid username from the admin email prefix", () => {
    expect(deriveSetupUsername("First.Admin+owner@example.com")).toBe(
      "first.admin-owner",
    );
    expect(deriveSetupUsername("admin_user@example.com")).toBe("admin_user");
  });

  test("falls back when the email prefix is too short after cleanup", () => {
    expect(deriveSetupUsername("a@example.com")).toBe("admin");
    expect(deriveSetupUsername("!!!@example.com")).toBe("admin");
  });
});
