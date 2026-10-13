import { expect, test } from "bun:test";
import { convexTest } from "convex-test";
import { validate } from "convex-helpers/validators";
import { v } from "convex/values";

import { api } from "../../_generated/api";
import schema from "../../schema";
import { appearanceTemplateSettingsValidator } from "../sectionValues";
import { templateSnapshotValidator } from "../templateDrafts";

// convex-test does not check record values, so every result is also checked
// with a full validator walk against the function's own `returns`.
const ADMIN_ISSUER = "https://convexpress-admin.local";

const modules = {
  "./convex/_generated/api.js": () => import("../../_generated/api.js"),
  "./convex/_generated/server.js": () => import("../../_generated/server.js"),
  "./convex/settings/templateDrafts.ts": () => import("../templateDrafts"),
};

const draftValidator = v.union(
  v.null(),
  v.object({
    values: appearanceTemplateSettingsValidator.fields.settings.value,
    variants: v.record(v.string(), v.string()),
    sourceRevision: v.string(),
    revision: v.string(),
    updatedAt: v.number(),
  }),
);

test("template snapshot, publish and draft reads satisfy their exact returns over messy storage", async () => {
  const t = convexTest({ schema, modules });
  const userId = await t.run(async (ctx) => {
    const now = Date.now();
    const roleId = await ctx.db.insert("roles", {
      name: "Administrator",
      slug: "administrator",
      description: "Test role",
      level: 100,
      type: "internal",
      isDefault: false,
      isProtected: true,
      capabilities: ["manage_options"],
      pageAccess: ["/admin"],
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
    const id = await ctx.db.insert("users", {
      authSource: "local",
      email: "admin@example.com",
      username: "admin",
      passwordHash: "not-a-real-hash",
      displayName: "Admin",
      slug: "admin",
      emailVerified: true,
      status: "active",
      isInternal: true,
      internalRole: "admin",
      roleId,
      registrationMethod: "self",
      registeredAt: now,
      createdAt: now,
      updatedAt: now,
    });
    // Migrated template row with an unknown top-level key, a non-text variant
    // and a field whose key Convex records cannot carry.
    await ctx.db.insert("settings", {
      section: "appearance.template",
      values: {
        active: "core",
        overrides: {},
        variants: { "shop.catalog": "journal", "shop.product": 3 },
        settings: { core: { colors: { primary: "#000", _hidden: "x" }, footer: { rows: [{ id: "r", columns: [] }] } } },
        legacyKey: true,
      },
      legacyAppearanceMigration: { version: 2, migratedAt: now },
      updatedAt: now,
      updatedBy: id,
    });
    await ctx.db.insert("appearance_drafts", {
      userId: id,
      packId: "core",
      sourceRevision: "source",
      values: { colors: { primary: "#111", _hidden: "y" }, header: "not-a-module" },
      variants: {},
      updatedAt: now,
    });
    return id;
  });
  const admin = t.withIdentity({
    issuer: ADMIN_ISSUER,
    subject: userId,
    tokenIdentifier: `${ADMIN_ISSUER}|${userId}`,
    email: "admin@example.com",
    name: "Admin",
  });

  const snapshot = await admin.query(api.settings.templateDrafts.snapshot, {});
  expect(validate(templateSnapshotValidator, snapshot)).toBe(true);
  expect(snapshot.values.variants).toEqual({ "shop.catalog": "journal" });
  expect(snapshot.values.settings.core.colors).toEqual({ primary: "#000" });
  expect(snapshot.values).not.toHaveProperty("legacyKey");
  expect(snapshot.identity).toBeNull();

  const draft = await admin.query(api.settings.templateDrafts.getDraft, { packId: "core" });
  expect(validate(draftValidator, draft)).toBe(true);
  expect(draft?.values).toEqual({ colors: { primary: "#111" } });

  const changed = { ...snapshot.values, settings: { core: { colors: { primary: "#abcdef" } } } };
  const published = await admin.mutation(api.settings.templateDrafts.publish, {
    values: changed,
    expectedRevision: snapshot.revision,
    confirmLive: true,
  });
  expect(validate(templateSnapshotValidator, published)).toBe(true);
  expect(published.values.settings.core).toEqual({ colors: { primary: "#abcdef" } });
});
