/**
 * The pricing page's content page (upstream PR 060): an administrator (or
 * site setup) chooses a block-editor page whose content surrounds the plans,
 * and public readers see it only while it is published for everyone.
 */
import { expect, test } from "bun:test";
import { convexTest } from "convex-test";
import { api, internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import schema from "../../schema";

const modules = {
  "./convex/_generated/api.js": () => import("../../_generated/api.js"),
  "./convex/_generated/server.js": () => import("../../_generated/server.js"),
  "./convex/commerceSubscriptions/pricingCards.ts": () => import("../pricingCards"),
};

async function fixture() {
  const t = convexTest({ schema, modules });
  const ids = await t.run(async (ctx) => {
    const roleId = await ctx.db.insert("roles", {
      name: "Administrator", slug: "administrator", description: "Test", level: 100, type: "internal", isDefault: false,
      isProtected: true, capabilities: ["manage_options"], pageAccess: [], status: "active", createdAt: 1, updatedAt: 1,
    });
    const editorRole = await ctx.db.insert("roles", {
      name: "Editor", slug: "editor", description: "Test", level: 80, type: "internal", isDefault: false,
      isProtected: false, capabilities: ["page.update"], pageAccess: [], status: "active", createdAt: 1, updatedAt: 1,
    });
    const admin = await ctx.db.insert("users", { authSource: "local", email: "admin@example.invalid", emailVerified: true, status: "active", roleId, createdAt: 1, updatedAt: 1 });
    const editor = await ctx.db.insert("users", { authSource: "local", email: "editor@example.invalid", emailVerified: true, status: "active", roleId: editorRole, createdAt: 1, updatedAt: 1 });
    await ctx.db.insert("settings", { section: "plugins", values: { commerceEnabled: true, commerceSubscriptionsEnabled: true }, updatedAt: 1, updatedBy: admin });
    const page = (slug: string, fields: { status?: "publish" | "draft" | "trash"; visibility?: "public" | "private"; legacy?: boolean } = {}) =>
      ctx.db.insert("posts", {
        type: "page", title: slug === "packages" ? "Packages and pricing" : slug, slug, status: fields.status ?? "publish",
        visibility: fields.visibility ?? "public", authorId: admin, commentStatus: "closed", excerpt: "Plain numbers.",
        ...(fields.legacy ? {} : { blocksVersion: 2 as const, blocks: [] }), createdAt: 1, updatedAt: 1,
      });
    return {
      admin, editor,
      packages: await page("packages"),
      draft: await page("draft-pricing", { status: "draft" }),
      privatePage: await page("members-pricing", { visibility: "private" }),
      trashed: await page("old-pricing", { status: "trash" }),
      legacy: await page("legacy", { legacy: true }),
    };
  });
  const as = (user: Id<"users">) => t.withIdentity({ subject: user, tokenIdentifier: `https://convexpress-admin.local|${user}` });
  const save = (contentPageId: Id<"posts"> | null | undefined) =>
    as(ids.admin).mutation(api.commerceSubscriptions.pricingCards.updatePricingCardConfig, {
      orderedOfferIds: [], templateKey: "default", ...(contentPageId === undefined ? {} : { contentPageId }),
    });
  const publicPage = () => t.query(api.commerceSubscriptions.pricingCards.getPricingContentPage, {});
  return { t, ids, as, save, publicPage };
}

test("the chosen page is public while it is published for everyone, and only then", async () => {
  const f = await fixture();
  expect(await f.publicPage()).toBeNull();
  await f.save(f.ids.packages);
  expect(await f.publicPage()).toEqual({ _id: f.ids.packages, title: "Packages and pricing", excerpt: "Plain numbers.", blocksVersion: 2 });

  // Saving other settings keeps the page; null clears it.
  await f.save(undefined);
  expect((await f.publicPage())?._id).toBe(f.ids.packages);
  await f.save(null);
  expect(await f.publicPage()).toBeNull();

  // A draft or private page can be chosen ahead of time but isn't shown.
  for (const pageId of [f.ids.draft, f.ids.privatePage]) {
    await f.save(pageId);
    expect(await f.publicPage()).toBeNull();
  }
  // Unpublishing the chosen page takes it off the pricing page at once.
  await f.save(f.ids.packages);
  await f.t.run(async (ctx) => { await ctx.db.patch("posts", f.ids.packages, { status: "draft" }); });
  expect(await f.publicPage()).toBeNull();
});

test("only an existing block-editor page can be chosen, and only by an administrator", async () => {
  const f = await fixture();
  await expect(f.save(f.ids.trashed)).rejects.toThrow(/existing block-editor page/);
  await expect(f.save(f.ids.legacy)).rejects.toThrow(/existing block-editor page/);
  await expect(
    f.as(f.ids.editor).mutation(api.commerceSubscriptions.pricingCards.updatePricingCardConfig, { orderedOfferIds: [], contentPageId: f.ids.packages }),
  ).rejects.toThrow();
  await expect(f.as(f.ids.editor).query(api.commerceSubscriptions.pricingCards.listPricingContentPages, {})).rejects.toThrow();
  const choices = await f.as(f.ids.admin).query(api.commerceSubscriptions.pricingCards.listPricingContentPages, {});
  expect(choices.map(({ slug, isPublic }) => [slug, isPublic]).sort()).toEqual([["draft-pricing", false], ["members-pricing", false], ["packages", true]]);
});

test("site setup sets the page as its actor, keeping the other pricing settings", async () => {
  const f = await fixture();
  await f.t.mutation(internal.commerceSubscriptions.pricingCards.setContentPage, { pageId: f.ids.packages, actorId: f.ids.admin });
  expect((await f.publicPage())?._id).toBe(f.ids.packages);
  await f.as(f.ids.admin).mutation(api.commerceSubscriptions.pricingCards.updatePricingCardConfig, { orderedOfferIds: [], headline: "Packages" });
  await f.t.mutation(internal.commerceSubscriptions.pricingCards.setContentPage, { pageId: null, actorId: f.ids.admin });
  const config = await f.t.query(api.commerceSubscriptions.pricingCards.getPricingCardConfig, {});
  expect(config).toMatchObject({ headline: "Packages" });
  expect(config.contentPageId).toBeUndefined();
  await expect(f.t.mutation(internal.commerceSubscriptions.pricingCards.setContentPage, { pageId: f.ids.trashed, actorId: f.ids.admin })).rejects.toThrow();
});
