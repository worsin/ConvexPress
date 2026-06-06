import { afterEach, describe, expect, test } from "bun:test";
import { convexTest } from "convex-test";

import { api } from "../../../_generated/api";
import schema from "../../../schema";

const ORIGINAL_ENV = { ...process.env };

const modules = {
  "./convex/_generated/api.js": () => import("../../../_generated/api.js"),
  "./convex/_generated/server.js": () => import("../../../_generated/server.js"),
  "./convex/extensions/forms/devFixtures.ts": () => import("../devFixtures"),
};

function createHarness() {
  return convexTest({ schema, modules });
}

function restoreEnvVar(name: string) {
  const value = ORIGINAL_ENV[name];
  if (value === undefined) {
    delete process.env[name];
    return;
  }

  process.env[name] = value;
}

afterEach(() => {
  restoreEnvVar("CONVEXPRESS_ENABLE_DEV_INTERNALS");
  restoreEnvVar("CONVEXPRESS_DEV_INTERNALS_TOKEN");
});

async function seedFixtureAdmin(t: ReturnType<typeof createHarness>) {
  return await t.run(async (ctx) => {
    const now = Date.now();
    return await ctx.db.insert("users", {
      authSource: "local",
      email: "forms-smoke-admin@example.test",
      username: "forms-smoke-admin",
      passwordHash: "not-a-real-hash",
      displayName: "Forms Smoke Admin",
      slug: "forms-smoke-admin",
      emailVerified: true,
      status: "active",
      isInternal: true,
      internalRole: "admin",
      registrationMethod: "self",
      registeredAt: now,
      createdAt: now,
      updatedAt: now,
    });
  });
}

describe("forms dev fixture action", () => {
  test("requires the dev internals feature flag", async () => {
    const t = createHarness();

    await expect(
      t.action(api.extensions.forms.devFixtures.seedPaidTesterFixtures, {
        devToken: "dev-token",
      }),
    ).rejects.toThrow("seedPaidTesterFixtures is disabled");
  });

  test("requires the configured dev internals token", async () => {
    const t = createHarness();
    process.env.CONVEXPRESS_ENABLE_DEV_INTERNALS = "true";
    process.env.CONVEXPRESS_DEV_INTERNALS_TOKEN = "";

    await expect(
      t.action(api.extensions.forms.devFixtures.seedPaidTesterFixtures, {
        devToken: "dev-token",
      }),
    ).rejects.toThrow("seedPaidTesterFixtures requires CONVEXPRESS_DEV_INTERNALS_TOKEN");
  });

  test("rejects missing or invalid dev internals tokens", async () => {
    const t = createHarness();
    process.env.CONVEXPRESS_ENABLE_DEV_INTERNALS = "true";
    process.env.CONVEXPRESS_DEV_INTERNALS_TOKEN = "dev-token";

    await expect(
      t.action(api.extensions.forms.devFixtures.seedPaidTesterFixtures, {}),
    ).rejects.toThrow("Invalid dev internals token.");

    await expect(
      t.action(api.extensions.forms.devFixtures.seedPaidTesterFixtures, {
        devToken: "wrong-token",
      }),
    ).rejects.toThrow("Invalid dev internals token.");
  });

  test("seeds paid tester fixtures with the configured dev internals token", async () => {
    const t = createHarness();
    process.env.CONVEXPRESS_ENABLE_DEV_INTERNALS = "true";
    process.env.CONVEXPRESS_DEV_INTERNALS_TOKEN = "dev-token";
    await seedFixtureAdmin(t);

    const result = await t.action(
      api.extensions.forms.devFixtures.seedPaidTesterFixtures,
      {
        devToken: "dev-token",
      },
    );

    expect(result.slug).toBe("paid-tester-form");
    expect(result.multiStepSlug).toBe("paid-tester-multi-step");
    expect(result.firstStepLabel).toBe("First Name");
  });
});
