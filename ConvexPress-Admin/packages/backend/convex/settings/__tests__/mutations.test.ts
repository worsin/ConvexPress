import { describe, expect, test } from "bun:test";
import { convexTest } from "convex-test";

import { api } from "../../_generated/api";
import schema from "../../schema";
import { decryptSettingSecret, SECRET_SENTINEL } from "../../helpers/settingsSecret";
import { getDefaults } from "../defaults";
import { getFunctionName, makeFunctionReference } from "convex/server";
import { updateSection, importAll } from "../mutations";
import { repairSystem } from "../../emails/mutations";

const ADMIN_ISSUER = "https://convexpress-admin.local";

const modules = {
  "./convex/_generated/api.js": () => import("../../_generated/api.js"),
  "./convex/_generated/server.js": () => import("../../_generated/server.js"),
  "./convex/settings/mutations.ts": () => import("../mutations"),
  "./convex/bootstrap/registerListeners.ts": () => import("../../bootstrap/registerListeners"),
};

function createHarness() {
  return convexTest({ schema, modules });
}

async function seedAdmin(t: ReturnType<typeof createHarness>) {
  const now = Date.now();
  const result = await t.run(async (ctx) => {
    const roleId = await ctx.db.insert("roles", {
      name: "Administrator",
      slug: "administrator",
      description: "Test admin role",
      level: 100,
      type: "internal",
      isDefault: false,
      isProtected: true,
      capabilities: ["manage_options", "settings.update_email", "settings.update_general", "settings.import"],
      pageAccess: ["/admin", "/admin/setup"],
      status: "active",
      createdAt: now,
      updatedAt: now,
    });

    const userId = await ctx.db.insert("users", {
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

    return { userId };
  });

  return t.withIdentity({
    issuer: ADMIN_ISSUER,
    subject: result.userId,
    tokenIdentifier: `${ADMIN_ISSUER}|${result.userId}`,
    email: "admin@example.com",
    name: "Admin",
  });
}

describe("settings mutations", () => {
  for (const operation of ["update", "import"] as const) {
    test(`${operation} never carries a saved AI key across providers`, async () => {
      const t = createHarness(), admin = await seedAdmin(t);
      const save = (values: Record<string, unknown>) => operation === "update"
        ? admin.mutation(api.settings.mutations.updateSection, { section: "ai", values })
        : admin.mutation(api.settings.mutations.importAll, { data: { settings: { ai: values } } });
      const read = () => t.run(async ctx => (await ctx.db.query("settings").withIndex("by_section", q => q.eq("section", "ai")).unique())!.values as Record<string, unknown>);
      await save({ provider: "openrouter", apiKey: "synthetic-router-key" });
      const first = await read();
      await save({ provider: "openrouter", apiKey: SECRET_SENTINEL });
      expect((await read()).apiKey).toBe(first.apiKey);
      await save({ provider: "anthropic", apiKey: SECRET_SENTINEL });
      expect((await read()).apiKey).toBe("");
      await save({ apiKey: "synthetic-anthropic-key" });
      await save({ provider: "openai" });
      expect((await read()).apiKey).toBe("");
      await save({ provider: "openrouter", apiKey: "synthetic-new-router-key" });
      expect(await decryptSettingSecret((await read()).apiKey as string)).toBe("synthetic-new-router-key");
      await save({ defaultModel: "chosen/model" });
      expect(await decryptSettingSecret((await read()).apiKey as string)).toBe("synthetic-new-router-key");
    });
  }

  test("membership maintenance settings require management authority and preserve valid partial updates", async () => {
    const t = createHarness(), admin = await seedAdmin(t);
    const save = (values: Record<string, unknown>) => admin.mutation(api.settings.mutations.updateSection, { section: "membership.general", values });
    const read = () => t.run(async ctx => (await ctx.db.query("settings").withIndex("by_section", q => q.eq("section", "membership.general")).unique())?.values);
    await expect(t.mutation(api.settings.mutations.updateSection, { section: "membership.general", values: { accessLogRetentionDays: 0 } })).rejects.toThrow();
    expect(await read()).toBeNull();
    await save({ accessLogRetentionDays: 0 });
    await save({ logAccessChecks: false });
    expect(await read()).toEqual({ accessLogRetentionDays: 0, logAccessChecks: false });
    for (const values of [{ accessLogRetentionDays: -1 }, { accessLogRetentionDays: 0.5 }, { accessLogRetentionDays: 3651 }, { logAccessChecks: "false" }, { unknown: true }]) {
      await expect(save(values)).rejects.toThrow();
      expect(await read()).toEqual({ accessLogRetentionDays: 0, logAccessChecks: false });
    }
    await save({ accessLogRetentionDays: 3650 });
    expect(await read()).toEqual({ accessLogRetentionDays: 3650, logAccessChecks: false });
  });
  for (const operation of ["update", "import"] as const) {
    test(`${operation} validates the merged general section for a date-format-only save`, async () => {
      const t = createHarness();
      const admin = await seedAdmin(t);
      const save = (values: Record<string, unknown>) => operation === "update"
        ? admin.mutation(api.settings.mutations.updateSection, { section: "general", values })
        : admin.mutation(api.settings.mutations.importAll, { data: { settings: { general: values } } });
      await save({ ...getDefaults("general"), siteTitle: "Saved site title", tagline: "Keep our tagline", siteUrl: "https://fixture.example.invalid", homeUrl: "https://fixture.example.invalid" });
      await save({ dateFormat: "Y-m-d" });
      const read = () => t.run(async (ctx) => (await ctx.db.query("settings").withIndex("by_section", (q) => q.eq("section", "general")).unique())!.values as Record<string, unknown>);
      expect(await read()).toMatchObject({ siteTitle: "Saved site title", tagline: "Keep our tagline", siteUrl: "https://fixture.example.invalid", dateFormat: "Y-m-d" });
      const beforeInvalid = await read();
      await expect(save({ siteTitle: "" })).rejects.toThrow(/failed for general settings/);
      expect(await read()).toEqual(beforeInvalid);
    });
  }

  for (const operation of ["email save", "email import", "email repair"] as const) {
    test(`${operation} preserves disabled and customized listeners`, async () => {
      const t = createHarness();
      const admin = await seedAdmin(t);
      await t.mutation(makeFunctionReference<"mutation">("bootstrap/registerListeners:ensureRequired"), {});
      await t.run(async (ctx) => {
        const listeners = await ctx.db.query("eventListeners").collect();
        for (const code of ["lms.enrolled", "lms.course_completed"]) {
          const row = listeners.find((listener) => listener.eventCode === code && listener.handlerModule === "emails/internals")!;
          expect(row).toBeDefined();
          await ctx.db.patch(row._id, { isActive: false, priority: 42, retryDelayMs: 1234, description: "Operator configuration", updatedAt: 123 });
        }
      });
      const before = await t.run((ctx) => ctx.db.query("eventListeners").collect());
      const scheduled: Array<{ reference: any; args: any }> = [];
      // Capture outbound/other background work; run the actual registration callback
      // that a settings save schedules, while preventing any email delivery in this fixture.
      await admin.run((ctx) => {
        const wrapped = { ...ctx, scheduler: { runAfter: async (_delay: number, reference: any, args: any) => { scheduled.push({ reference, args }); return "fixture-schedule"; } } };
        if (operation === "email repair") return (repairSystem as any)._handler(wrapped, {});
        if (operation === "email import") return (importAll as any)._handler(wrapped, { data: { settings: { email: { enabled: false } } } });
        return (updateSection as any)._handler(wrapped, { section: "email", values: { enabled: false } });
      });
      for (const job of scheduled) {
        if (getFunctionName(job.reference).startsWith("bootstrap/registerListeners:")) {
          await t.mutation(job.reference, job.args);
        }
      }
      expect(await t.run((ctx) => ctx.db.query("eventListeners").collect())).toEqual(before);
      expect(await t.run((ctx) => ctx.db.query("emailQueue").collect())).toEqual([]);
    });
  }

  for (const operation of ["update", "import"] as const) {
    test(`${operation} preserves omitted fields and stored secrets, rotates explicitly, and supports clear/reset`, async () => {
      const t = createHarness();
      const admin = await seedAdmin(t);
      const save = (values: Record<string, unknown>) => operation === "update"
        ? admin.mutation(api.settings.mutations.updateSection, { section: "commerce.payments", values })
        : admin.mutation(api.settings.mutations.importAll, { data: { settings: { "commerce.payments": values } } });
      const read = () => t.run(async (ctx) => {
        const row = await ctx.db.query("settings").withIndex("by_section", (q) => q.eq("section", "commerce.payments")).unique();
        return row!.values as Record<string, unknown>;
      });
      await save({ stripeSecretKey: "fixture-first-secret", paypalClientSecret: "fixture-paypal-secret", paypalMode: "production", customField: { prose: "Keep this value" } });
      const before = await read();
      await save({ stripePublishableKey: "pk_fixture_updated" });
      const partial = await read();
      expect(partial.paypalMode).toBe("production");
      expect(partial.customField).toEqual(before.customField);
      expect(partial.stripeSecretKey).toBe(before.stripeSecretKey);
      expect(partial.paypalClientSecret).toBe(before.paypalClientSecret);
      expect(await decryptSettingSecret(partial.stripeSecretKey as string)).toBe("fixture-first-secret");

      await save({ stripeSecretKey: "fixture-replacement-secret" });
      expect(await decryptSettingSecret((await read()).stripeSecretKey as string)).toBe("fixture-replacement-secret");
      const beforeSentinel = await read();
      const eventsBefore = await t.run((ctx) => ctx.db.query("events").collect());
      await save({ stripeSecretKey: SECRET_SENTINEL });
      expect(await read()).toEqual(beforeSentinel);
      expect(await t.run((ctx) => ctx.db.query("events").collect())).toEqual(eventsBefore);
      const payloads = eventsBefore.map((row) => row.payload).join("\n");
      expect(payloads).not.toContain("fixture-first-secret");
      expect(payloads).not.toContain("fixture-replacement-secret");
      expect(payloads).not.toContain(before.stripeSecretKey as string);
      expect(JSON.parse(eventsBefore.at(-1)!.payload).changes).toContainEqual({ field: "stripeSecretKey", oldValue: SECRET_SENTINEL, newValue: SECRET_SENTINEL });

      await save({ stripeSecretKey: "" });
      expect((await read()).stripeSecretKey).toBe("");
      expect((await read()).paypalClientSecret).toBe(before.paypalClientSecret);
      await save(getDefaults("commerce.payments"));
      const reset = await read();
      expect(reset.paypalMode).toBe(getDefaults("commerce.payments").paypalMode);
      expect(reset.paypalClientSecret).toBe("");
    });
  }

  test("strips query document metadata before persisting settings values", async () => {
    const t = createHarness();
    const admin = await seedAdmin(t);

    await admin.mutation(api.settings.mutations.updateSection, {
      section: "commerce.payments",
      values: {
        _id: "not-a-settings-doc-id",
        _creationTime: 123,
        section: "commerce.payments",
        updatedAt: 456,
        updatedBy: "not-a-user-id",
        stripePublishableKey: "pk_test_public",
        stripeSecretKey: "sk_test_secret",
        stripeWebhookSecret: "whsec_test_secret",
        stripeMode: "sandbox",
        paypalMode: "sandbox",
      },
    });

    const values = await t.run(async (ctx) => {
      const doc = await ctx.db
        .query("settings")
        .withIndex("by_section", (q) => q.eq("section", "commerce.payments"))
        .unique();
      return doc?.values as Record<string, unknown>;
    });

    expect(values._id).toBeUndefined();
    expect(values._creationTime).toBeUndefined();
    expect(values.section).toBeUndefined();
    expect(values.updatedAt).toBeUndefined();
    expect(values.updatedBy).toBeUndefined();
    expect(values.stripeMode).toBe("sandbox");
    expect(values.paypalMode).toBe("sandbox");
  });
});
