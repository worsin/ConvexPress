import { describe, expect, test } from "bun:test";

import {
  FIRST_ADMIN_SETUP_ROUTE,
  SETUP_CREDENTIAL_HANDOFF_TTL_MS,
  completeFirstAdminLogin,
  completeFirstAdminSetup,
  deriveSetupUsername,
  isPendingAdminCredentialHandoff,
  isPendingLoginCredentialHandoff,
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

  test("accepts only fresh pending admin credential handoffs", () => {
    expect(
      isPendingAdminCredentialHandoff(
        {
          displayName: "First Admin",
          email: "admin@example.com",
          password: "CorrectHorse42",
          setupToken: "setup-token",
          createdAt: 1_000,
          expiresAt: 2_000,
        },
        1_500,
      ),
    ).toBe(true);

    expect(
      isPendingAdminCredentialHandoff(
        {
          displayName: "First Admin",
          email: "admin@example.com",
          password: "CorrectHorse42",
          setupToken: "setup-token",
          createdAt: 1_000,
          expiresAt: 2_000,
        },
        2_000,
      ),
    ).toBe(false);
    expect(
      isPendingAdminCredentialHandoff(
        {
          displayName: "First Admin",
          email: "admin@example.com",
          password: "CorrectHorse42",
          setupToken: "setup-token",
        },
        1_500,
      ),
    ).toBe(false);
    expect(
      isPendingAdminCredentialHandoff(
        {
          displayName: "First Admin",
          email: "admin@example.com",
          password: "CorrectHorse42",
          setupToken: "setup-token",
          createdAt: 2_000,
          expiresAt: 3_000,
        },
        1_500,
      ),
    ).toBe(false);
    expect(
      isPendingAdminCredentialHandoff(
        {
          displayName: "First Admin",
          email: "admin@example.com",
          password: "CorrectHorse42",
          setupToken: "setup-token",
          createdAt: 1_000,
          expiresAt: 1_000 + SETUP_CREDENTIAL_HANDOFF_TTL_MS + 1,
        },
        1_500,
      ),
    ).toBe(false);
    expect(
      isPendingAdminCredentialHandoff(
        {
          displayName: "First Admin",
          email: "not-an-email",
          password: "CorrectHorse42",
          expiresAt: 2_000,
        },
        1_500,
      ),
    ).toBe(false);
    expect(
      isPendingAdminCredentialHandoff(
        {
          displayName: "A".repeat(129),
          email: "admin@example.com",
          password: "CorrectHorse42",
          setupToken: "setup-token",
          expiresAt: 2_000,
        },
        1_500,
      ),
    ).toBe(false);
    expect(
      isPendingAdminCredentialHandoff(
        {
          displayName: "First Admin",
          username: "invalid username",
          email: "admin@example.com",
          password: "CorrectHorse42",
          setupToken: "setup-token",
          expiresAt: 2_000,
        },
        1_500,
      ),
    ).toBe(false);
  });

  test("accepts only fresh pending login credential handoffs", () => {
    expect(
      isPendingLoginCredentialHandoff(
        {
          identifier: "admin@example.com",
          password: "CorrectHorse42",
          createdAt: 1_000,
          expiresAt: 2_000,
        },
        1_500,
      ),
    ).toBe(true);
    expect(
      isPendingLoginCredentialHandoff(
        {
          identifier: "admin@example.com",
          password: "CorrectHorse42",
          createdAt: 1_000,
          expiresAt: 2_000,
        },
        2_000,
      ),
    ).toBe(false);
    expect(
      isPendingLoginCredentialHandoff(
        {
          identifier: "admin@example.com",
          password: "CorrectHorse42",
          expiresAt: 2_000,
        },
        1_500,
      ),
    ).toBe(false);
    expect(
      isPendingLoginCredentialHandoff(
        {
          identifier: "admin@example.com",
          password: "CorrectHorse42",
          createdAt: 2_000,
          expiresAt: 3_000,
        },
        1_500,
      ),
    ).toBe(false);
    expect(
      isPendingLoginCredentialHandoff(
        {
          identifier: "admin@example.com",
          password: "CorrectHorse42",
          createdAt: 1_000,
          expiresAt: 1_000 + SETUP_CREDENTIAL_HANDOFF_TTL_MS + 1,
        },
        1_500,
      ),
    ).toBe(false);
    expect(
      isPendingLoginCredentialHandoff(
        {
          identifier: "",
          password: "CorrectHorse42",
          createdAt: 1_000,
          expiresAt: 2_000,
        },
        1_500,
      ),
    ).toBe(false);
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

    expect(
      validateFirstAdminForm({
        displayName: "A".repeat(129),
        username: "admin",
        email: "admin@example.com",
        password: "CorrectHorse42",
        confirmPassword: "CorrectHorse42",
      }),
    ).toEqual({
      ok: false,
      error: "Display name must be 128 characters or fewer.",
    });

    expect(
      validateFirstAdminForm({
        displayName: "First Admin",
        username: "admin",
        email: "admin@example.com",
        password: "A".repeat(257),
        confirmPassword: "A".repeat(257),
      }),
    ).toEqual({
      ok: false,
      error: "Password must be 256 characters or fewer.",
    });
  });

  test("creates, logs in, and navigates to the setup checklist in order", async () => {
    const calls: string[] = [];
    const createdCredentials: unknown[] = [];
    const loginCredentials: unknown[] = [];

    await completeFirstAdminSetup({
      credentials: {
        displayName: "First Admin",
        username: "admin",
        email: "admin@example.com",
        password: "CorrectHorse42",
        setupToken: "setup-token",
      },
      createFirstAdmin: async (credentials) => {
        calls.push("create");
        createdCredentials.push(credentials);
      },
      login: async (identifier, password) => {
        calls.push("login");
        loginCredentials.push({ identifier, password });
      },
      navigateToSetup: () => {
        calls.push("navigate");
      },
    });

    expect(calls).toEqual(["create", "login", "navigate"]);
    expect(createdCredentials).toEqual([
      {
        displayName: "First Admin",
        username: "admin",
        email: "admin@example.com",
        password: "CorrectHorse42",
        setupToken: "setup-token",
      },
    ]);
    expect(loginCredentials).toEqual([
      {
        identifier: "admin@example.com",
        password: "CorrectHorse42",
      },
    ]);
  });

  test("client pending login lands on the setup checklist after sign-in", async () => {
    const calls: string[] = [];
    const loginCredentials: unknown[] = [];

    await completeFirstAdminLogin({
      identifier: "admin@example.com",
      password: "CorrectHorse42",
      login: async (identifier, password) => {
        calls.push("login");
        loginCredentials.push({ identifier, password });
      },
      navigateToSetup: () => {
        calls.push("navigate");
      },
    });

    expect(calls).toEqual(["login", "navigate"]);
    expect(loginCredentials).toEqual([
      {
        identifier: "admin@example.com",
        password: "CorrectHorse42",
      },
    ]);
  });

  test("auto setup can recover from an already-created admin and still log in", async () => {
    const calls: string[] = [];

    await completeFirstAdminSetup({
      credentials: {
        username: "admin",
        email: "admin@example.com",
        password: "CorrectHorse42",
      },
      createFirstAdmin: async () => {
        calls.push("create");
        throw new Error("An administrator account already exists");
      },
      login: async () => {
        calls.push("login");
      },
      navigateToSetup: () => {
        calls.push("navigate");
      },
      allowExistingAdmin: true,
    });

    expect(calls).toEqual(["create", "login", "navigate"]);
  });

  test("manual setup does not log in or navigate when admin creation fails", async () => {
    const calls: string[] = [];
    let error: unknown;

    try {
      await completeFirstAdminSetup({
        credentials: {
          username: "admin",
          email: "admin@example.com",
          password: "CorrectHorse42",
        },
        createFirstAdmin: async () => {
          calls.push("create");
          throw new Error("An administrator account already exists");
        },
        login: async () => {
          calls.push("login");
        },
        navigateToSetup: () => {
          calls.push("navigate");
        },
      });
    } catch (caught) {
      error = caught;
    }

    expect(error instanceof Error).toBe(true);
    expect((error as Error).message).toBe(
      "An administrator account already exists",
    );
    expect(calls).toEqual(["create"]);
  });
});
