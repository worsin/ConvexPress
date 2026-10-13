import { expect, test } from "bun:test";
import { convexTest } from "convex-test";
import { validate } from "convex-helpers/validators";

import { api, internal } from "../../_generated/api";
import schema from "../../schema";
import { SECTION_NAMES } from "../defaults";
import { anySectionValuesValidator, sectionWithMetaValidator } from "../sectionValues";
import { autoloadedSettingsValidator, publicSettingsValidator, settingsExportValidator } from "../queries";

// convex-test does not check record values, so every result is also checked
// with a full validator walk against the function's own `returns`.
const ADMIN_ISSUER = "https://convexpress-admin.local";

const modules = {
  "./convex/_generated/api.js": () => import("../../_generated/api.js"),
  "./convex/_generated/server.js": () => import("../../_generated/server.js"),
  "./convex/settings/queries.ts": () => import("../queries"),
  "./convex/settings/internals.ts": () => import("../internals"),
  "./convex/settings/httpInternals.ts": () => import("../httpInternals"),
};

/** Stored values with wrong types, unknown keys, secrets and nested template JSON. */
const messyValues: Record<string, unknown> = {
  general: { siteTitle: "Stored", weekStartsOn: "monday", legacyKey: 1, siteLogo: "media-1" },
  reading: { homepageId: 42, pageOnFront: 7 },
  email: { resendApiKey: "enc:abc", rateLimit: "fast" },
  plugins: { knowledgeBaseEnabled: false, customExtensionEnabled: true, label: "x" },
  "commerce.payments": { stripeSecretKey: "enc:sk", stripeEnabled: true, methodOrder: ["card", 3] },
  "appearance.template": {
    active: "core",
    overrides: { "shop.catalog": "journal" },
    variants: {},
    settings: { core: { colors: { primary: "#000", _hidden: "x" }, footer: { rows: [{ id: "r", columns: [] }] } } },
  },
  header: { layout: { style: "split", sticky: 3 }, unknown: true },
  footer: { rows: [{ id: "row", background: "muted", padding: "normal", container: "wide", columns: [{ id: "c", cell: { type: "html", rawHtml: "<b>x</b>" } }] }] },
  "integrations.clerk": { clerkSecretKey: "sk_test", clerkCapabilities: { version: 2 } },
  analytics: { ga4Connected: true, ga4PropertyId: null, ga4LastSync: 5 },
};

test("settings reads satisfy their exact returns for every section", async () => {
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
      capabilities: ["manage_options", "settings.update_email", "settings.export"],
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
    for (const section of SECTION_NAMES) {
      if (!(section in messyValues)) continue;
      await ctx.db.insert("settings", { section, values: messyValues[section], updatedAt: now, updatedBy: id });
    }
    return id;
  });
  const admin = t.withIdentity({
    issuer: ADMIN_ISSUER,
    subject: userId,
    tokenIdentifier: `${ADMIN_ISSUER}|${userId}`,
    email: "admin@example.com",
    name: "Admin",
  });

  for (const section of SECTION_NAMES) {
    const bySection = await admin.query(api.settings.queries.getBySection, { section });
    expect(validate(sectionWithMetaValidator, bySection)).toBe(true);
    const internalRead = await t.query(internal.settings.internals.getInternal, { section });
    expect(validate(sectionWithMetaValidator, internalRead)).toBe(true);
    const httpRead = await t.query(internal.settings.httpInternals.getBySectionInternal, { section });
    expect(validate(sectionWithMetaValidator, httpRead)).toBe(true);
  }

  const general = await admin.query(api.settings.queries.getBySection, { section: "general" });
  expect(general).toMatchObject({ siteTitle: "Stored", weekStartsOn: 0, siteLogo: "media-1", updatedBy: userId });
  expect(general).not.toHaveProperty("legacyKey");
  const email = await admin.query(api.settings.queries.getBySection, { section: "email" });
  expect(email).toMatchObject({ resendApiKey: "__set__", rateLimit: 50 });
  const emailInternal = await t.query(internal.settings.internals.getInternal, { section: "email" });
  expect(emailInternal).toMatchObject({ resendApiKey: "enc:abc" });
  expect(await t.query(internal.settings.internals.getInternal, { section: "nope" })).toBeNull();

  const autoloaded = await t.query(api.settings.queries.getAutoloaded, {});
  expect(validate(autoloadedSettingsValidator, autoloaded)).toBe(true);
  expect(autoloaded.general).not.toHaveProperty("adminEmail");
  expect(autoloaded.discussion).not.toHaveProperty("moderationWordList");

  const publicSettings = await t.query(api.settings.queries.getPublic, {});
  expect(validate(publicSettingsValidator, publicSettings)).toBe(true);
  expect(publicSettings.plugins).toMatchObject({ knowledgeBaseEnabled: false, customExtensionEnabled: true });
  expect(publicSettings.templateConfig.settings.core.colors).toEqual({ primary: "#000" });
  expect(publicSettings.colorPalette).toEqual([{ slug: "primary", color: "#000" }]);

  const exported = await admin.query(api.settings.queries.exportAll, {});
  expect(Object.keys(exported.settings).sort()).toEqual([...SECTION_NAMES].sort());
  for (const values of Object.values(exported.settings)) expect(validate(anySectionValuesValidator, values)).toBe(true);
  expect(validate(settingsExportValidator, exported)).toBe(true);
});
