import { describe, expect, test } from "bun:test";

import {
  FIRST_ADMIN_SETUP_ROUTE,
  deriveSetupUsername,
  validateFirstAdminForm,
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

  test("normalizes manual first-admin form credentials", () => {
    const result = validateFirstAdminForm({
      displayName: " First Admin ",
      username: "",
      email: " First.Admin+Owner@Example.COM ",
      password: "CorrectHorse42",
      confirmPassword: "CorrectHorse42",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    expect(result.credentials).toEqual({
      displayName: "First Admin",
      username: "first.admin-owner",
      email: "first.admin+owner@example.com",
      password: "CorrectHorse42",
    });
  });

  test("keeps an explicit valid manual username", () => {
    const result = validateFirstAdminForm({
      displayName: "First Admin",
      username: " SiteOwner_01 ",
      email: "admin@example.com",
      password: "CorrectHorse42",
      confirmPassword: "CorrectHorse42",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    expect(result.credentials.username).toBe("SiteOwner_01");
  });

  test("rejects invalid manual first-admin form values", () => {
    expect(
      validateFirstAdminForm({
        displayName: "",
        username: "",
        email: "admin@example.com",
        password: "CorrectHorse42",
        confirmPassword: "CorrectHorse42",
      }),
    ).toEqual({ ok: false, error: "Please fill in all required fields." });

    expect(
      validateFirstAdminForm({
        displayName: "First Admin",
        username: "admin",
        email: "not-an-email",
        password: "CorrectHorse42",
        confirmPassword: "CorrectHorse42",
      }),
    ).toEqual({ ok: false, error: "Enter a valid email address." });

    expect(
      validateFirstAdminForm({
        displayName: "First Admin",
        username: "no spaces",
        email: "admin@example.com",
        password: "CorrectHorse42",
        confirmPassword: "CorrectHorse42",
      }),
    ).toEqual({
      ok: false,
      error:
        "Username must be 3-64 characters and may contain letters, numbers, dots, underscores, or hyphens.",
    });

    expect(
      validateFirstAdminForm({
        displayName: "First Admin",
        username: "admin",
        email: "admin@example.com",
        password: "CorrectHorse42",
        confirmPassword: "DifferentHorse42",
      }),
    ).toEqual({ ok: false, error: "Passwords don't match." });

    expect(
      validateFirstAdminForm({
        displayName: "First Admin",
        username: "admin",
        email: "admin@example.com",
        password: "short",
        confirmPassword: "short",
      }),
    ).toEqual({
      ok: false,
      error: "Password must be at least 8 characters.",
    });
  });
});
