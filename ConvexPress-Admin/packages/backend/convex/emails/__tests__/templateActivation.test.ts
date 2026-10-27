/**
 * Which emails a site sends by default (upstream PR 065): routine notices
 * ship turned off, site setup can apply its own choice, and an
 * administrator's choice is never overridden.
 */
import { expect, test } from "bun:test";
import { convexTest } from "convex-test";
import { api, internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import schema from "../../schema";
import { DEFAULT_TEMPLATES, templateActiveByDefault } from "../templateDefaults";

const modules = {
  "./convex/_generated/api.js": () => import("../../_generated/api.js"),
  "./convex/_generated/server.js": () => import("../../_generated/server.js"),
  "./convex/bootstrap/requiredRecords.ts": () => import("../../bootstrap/requiredRecords"),
  "./convex/emails/internals.ts": () => import("../internals"),
  "./convex/emails/mutations.ts": () => import("../mutations"),
  "./convex/settings/internals.ts": () => import("../../settings/internals"),
};

async function fixture() {
  const t = convexTest({ schema, modules });
  await t.mutation(internal.bootstrap.requiredRecords.ensure, {});
  const admin = await t.run(async (ctx) => {
    const roleId = await ctx.db.insert("roles", {
      name: "Administrator", slug: "administrator", description: "Test", level: 100, type: "internal", isDefault: false,
      isProtected: true, capabilities: ["settings.update_email"], pageAccess: [], status: "active", createdAt: 1, updatedAt: 1,
    });
    return await ctx.db.insert("users", { authSource: "local", email: "admin@example.invalid", emailVerified: true, status: "active", roleId, createdAt: 1, updatedAt: 1 });
  });
  const template = (slug: string) =>
    t.run(async (ctx) => await ctx.db.query("emailTemplates").withIndex("by_slug", (q) => q.eq("slug", slug)).unique());
  const toggle = async (slug: string, isActive: boolean) => {
    const found = await template(slug);
    if (!found) throw new Error(`no ${slug} template`);
    await t
      .withIdentity({ subject: admin, tokenIdentifier: `https://convexpress-admin.local|${admin}` })
      .mutation(api.emails.mutations.updateTemplate, { templateId: found._id, isActive });
  };
  const apply = (slug: string, isActive: boolean) => t.mutation(internal.emails.internals.applyTemplateDefaultActive, { slug, isActive });
  return { template, toggle, apply, admin: admin satisfies Id<"users"> };
}

test("a new site doesn't send the sitemap notice, and sends the rest", async () => {
  const f = await fixture();
  expect((await f.template("sitemap-generated"))?.isActive).toBe(false);
  for (const def of DEFAULT_TEMPLATES.filter((d) => d.slug !== "sitemap-generated").slice(0, 5)) {
    expect((await f.template(def.slug))?.isActive).toBe(templateActiveByDefault(def));
  }
  expect(DEFAULT_TEMPLATES.filter((def) => !templateActiveByDefault(def)).map((def) => def.slug)).toEqual(["sitemap-generated"]);
});

test("site setup turns a template off or on until an administrator chooses", async () => {
  const f = await fixture();
  expect(await f.apply("purchase-admin-alert", false)).toEqual({ changed: true });
  expect((await f.template("purchase-admin-alert"))?.isActive).toBe(false);
  expect(await f.apply("purchase-admin-alert", false)).toEqual({ changed: false });
  expect(await f.apply("purchase-admin-alert", true)).toEqual({ changed: true });

  await f.toggle("purchase-admin-alert", false);
  expect((await f.template("purchase-admin-alert"))?.activeChangedAt).toBeNumber();
  expect(await f.apply("purchase-admin-alert", true)).toEqual({ changed: false });
  expect((await f.template("purchase-admin-alert"))?.isActive).toBe(false);

  await f.toggle("sitemap-generated", true);
  expect(await f.apply("sitemap-generated", false)).toEqual({ changed: false });
  expect((await f.template("sitemap-generated"))?.isActive).toBe(true);
  expect(await f.apply("no-such-template", false)).toEqual({ changed: false });
});

test("editing a template's wording isn't a choice about sending it", async () => {
  const f = await fixture();
  const found = await f.template("settings-changed-alert");
  if (!found) throw new Error("no settings-changed-alert template");
  expect(found.activeChangedAt).toBeUndefined();
  await f.toggle("settings-changed-alert", true);
  expect((await f.template("settings-changed-alert"))?.activeChangedAt).toBeUndefined();
  expect(await f.apply("settings-changed-alert", false)).toEqual({ changed: true });
});

test("the template bootstrap changes nothing on a second run", async () => {
  const t = convexTest({ schema, modules });
  await t.mutation(internal.bootstrap.requiredRecords.ensure, {});
  await t.mutation(internal.emails.internals.bootstrapTemplates, {});
  expect(await t.mutation(internal.emails.internals.bootstrapTemplates, {})).toEqual({ created: 0, updated: 0 });
});
