import { expect, test } from "bun:test";
import { convexTest } from "convex-test";
import schema from "../../schema";
import { internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import type { SiteSetupDocumentArgs } from "../siteSetupContracts";

const modules = {
  "./convex/_generated/api.js": () => import("../../_generated/api.js"),
  "./convex/_generated/server.js": () => import("../../_generated/server.js"),
  "./convex/canonicalDocuments.ts": () => import("../../canonicalDocuments"),
  "./convex/canonicalDocuments/siteSetup.ts": () => import("../siteSetup"),
  "./convex/canonicalDocuments/legacyImport.ts": () => import("../legacyImport"),
  "./convex/emails/internals.ts": () => import("../../emails/internals"),
  "./convex/posts/internals.ts": () => import("../../posts/internals"),
  "./convex/posts/authorCounts.ts": () => import("../../posts/authorCounts"),
  "./convex/syncedBlocks/legacy.ts": () => import("../../syncedBlocks/legacy"),
  "./convex/settings/queries.ts": () => import("../../settings/queries"),
  "./convex/blocks/queries.ts": () => import("../../blocks/queries"),
  "./convex/membership/policyReads.ts": () => import("../../membership/policyReads"),
};

async function fixture(options: { formRights?: boolean } = {}) {
  const t = convexTest({ schema, modules });
  const ids = await t.run(async (ctx) => {
    const role = await ctx.db.insert("roles", {
      name: "editor", slug: "editor", description: "Fixture", level: 80, type: "internal", isDefault: false, isProtected: false,
      capabilities: ["post.create", "page.create", "post.update", "page.update", "post.publish", "page.publish", ...(options.formRights === false ? [] : ["form.create", "form.update"])],
      pageAccess: [], status: "active", createdAt: 1, updatedAt: 1,
    });
    const author = await ctx.db.insert("users", { authSource: "local", email: "setup@example.invalid", emailVerified: true, roleId: role, status: "active", createdAt: 1, updatedAt: 1 });
    const management = await ctx.db.insert("users", { authSource: "management", email: "operator@example.invalid", emailVerified: true, roleId: role, status: "active", createdAt: 1, updatedAt: 1 });
    await ctx.db.insert("convexpress_siteIdentity", {
      identityKey: "site-identity", websiteKey: "fixture", instanceKey: "fixture-stage", environmentKind: "staging",
      deploymentOrigin: "https://fixture.convex.cloud", managementOrigin: "https://fixture.convex.site", siteOrigin: "https://fixture.example.invalid",
      siteContractVersion: "1", schemaVersion: "1", engineVersion: "1", managementCapabilities: [], initializedAt: 1, updatedAt: 1,
    });
    await ctx.db.insert("settings", { section: "plugins", values: { formsEnabled: true, membershipEnabled: false }, updatedAt: 1, updatedBy: author });
    await ctx.db.insert("settings", {
      section: "appearance.template", values: { active: "core", overrides: {}, variants: {}, settings: {} },
      legacyAppearanceMigration: { version: 2, migratedAt: 1 }, updatedAt: 1, updatedBy: author,
    });
    return { author, management };
  });
  const write = (args: SiteSetupDocumentArgs) => t.mutation(internal.canonicalDocuments.siteSetup.writeDocument, args);
  const post = (id: Id<"posts">) => t.run(async (ctx) => (await ctx.db.get("posts", id))!);
  const revisions = (id: Id<"posts">) => t.run(async (ctx) => await ctx.db.query("revisions").withIndex("by_parent_number", (q) => q.eq("parentId", id)).collect());
  return { t, ids, write, post, revisions };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
const hero = (title: string) => [{ id: "hero", name: "core/hero-text-only", version: 2, attrs: { title, body: "Plain numbers for every package." } }];
const pricing = (f: Fixture, patch: Partial<SiteSetupDocumentArgs> = {}): SiteSetupDocumentArgs => ({
  type: "page", setupKey: "fixture:packages", title: "Packages", slug: "packages", status: "publish",
  authorId: f.ids.author, pageTemplate: "default", blocks: hero("A flat subscription"), ...patch,
});
const heroTitle = (blocks: unknown) => {
  const [first] = blocks as { attrs: { title?: string } }[];
  return first?.attrs.title;
};

test("creates the document once; the same content again changes nothing", async () => {
  const f = await fixture();
  const first = await f.write(pricing(f));
  expect(first.outcome).toBe("created");
  const page = await f.post(first.postId!);
  expect(page).toMatchObject({ type: "page", slug: "packages", status: "publish", title: "Packages", pageTemplate: "default" });
  expect(heroTitle(page.blocks)).toBe("A flat subscription");
  await expect(f.write(pricing(f))).resolves.toEqual({ outcome: "unchanged", postId: first.postId });
});

test("refreshes its own document while nobody has edited it, keeping the old content as a revision", async () => {
  const f = await fixture();
  const first = await f.write(pricing(f));
  const updated = await f.write(pricing(f, { blocks: hero("Enforcement only when you need it") }));
  expect(updated).toEqual({ outcome: "updated", postId: first.postId });
  expect(heroTitle((await f.post(first.postId!)).blocks)).toBe("Enforcement only when you need it");
  const history = await f.revisions(first.postId!);
  expect(history.map((row) => heroTitle(row.blocks))).toContain("A flat subscription");
});

test("an editor's change wins over later setup runs", async () => {
  const f = await fixture();
  const first = await f.write(pricing(f));
  await f.t.run(async (ctx) => {
    const page = (await ctx.db.get("posts", first.postId!))!;
    await ctx.db.patch("posts", page._id, { blocks: hero("Edited by the site's editor"), blocksRevision: (page.blocksRevision ?? 1) + 1, updatedAt: page.updatedAt + 1 });
  });
  await expect(f.write(pricing(f, { blocks: hero("Setup's newer copy") }))).resolves.toEqual({ outcome: "kept_edited", postId: first.postId });
  expect(heroTitle((await f.post(first.postId!)).blocks)).toBe("Edited by the site's editor");
});

test("adopts an unedited page at the slug only when asked, and never an edited one", async () => {
  const f = await fixture();
  const imported = await f.write(pricing(f, { setupKey: "fixture:imported", blocks: hero("Imported copy") }));
  // The page is unedited (revision 1) but belongs to another setup key: it holds the slug.
  await f.t.run(async (ctx) => {
    const receipt = (await ctx.db.query("postMeta").withIndex("by_key", (q) => q.eq("key", "_convexpress_site_setup:fixture:imported")).unique())!;
    await ctx.db.delete("postMeta", receipt._id);
  });
  await expect(f.write(pricing(f))).resolves.toEqual({ outcome: "slug_taken", postId: imported.postId });
  const adopted = await f.write(pricing(f, { adoptUnedited: true }));
  expect(adopted).toEqual({ outcome: "adopted", postId: imported.postId });
  expect(heroTitle((await f.post(imported.postId!)).blocks)).toBe("A flat subscription");
  expect((await f.revisions(imported.postId!)).map((row) => heroTitle(row.blocks))).toContain("Imported copy");
  await expect(f.write(pricing(f, { adoptUnedited: true }))).resolves.toEqual({ outcome: "unchanged", postId: imported.postId });

  const other = await f.write(pricing(f, { setupKey: "fixture:about", title: "About", slug: "about", blocks: hero("About") }));
  await f.t.run(async (ctx) => {
    await ctx.db.delete("postMeta", (await ctx.db.query("postMeta").withIndex("by_key", (q) => q.eq("key", "_convexpress_site_setup:fixture:about")).unique())!._id);
    const page = (await ctx.db.get("posts", other.postId!))!;
    await ctx.db.patch("posts", page._id, { blocksRevision: 2 });
  });
  await expect(f.write(pricing(f, { setupKey: "fixture:about-2", title: "About", slug: "about", adoptUnedited: true }))).resolves.toEqual({ outcome: "slug_taken", postId: other.postId });
});

test("a removed document stays removed", async () => {
  const f = await fixture();
  const first = await f.write(pricing(f));
  await f.t.run(async (ctx) => { await ctx.db.patch("posts", first.postId!, { status: "trash" }); });
  await expect(f.write(pricing(f, { blocks: hero("Newer") }))).resolves.toEqual({ outcome: "kept_removed", postId: null });
});

test("refuses an author who can't write here and a slug that isn't canonical", async () => {
  const f = await fixture();
  await expect(f.write(pricing(f, { authorId: f.ids.management }))).rejects.toThrow(/SETUP_AUTHOR_INVALID|active site user/);
  await expect(f.write(pricing(f, { slug: "Packages Page" }))).rejects.toThrow(/canonical slug|INVALID_SETUP_SLUG/);
});

const contact = (heading: string) => [{
  id: "contact", name: "core/contact-form", version: 2,
  attrs: { heading, fields: [{ name: "email", label: "Email", type: "email", required: true }], submitLabel: "Send", successMessage: "Thanks." },
}];
const contactPage = (f: Fixture, heading: string): SiteSetupDocumentArgs =>
  pricing(f, { setupKey: "fixture:contact", title: "Contact", slug: "contact", blocks: contact(heading) });
const contactForm = (f: Fixture, postId: Id<"posts">) =>
  f.t.run(async (ctx) => await ctx.db.query("forms").withIndex("by_contact_source", (q) => q.eq("contactPostId", postId).eq("contactBlockId", "contact")).unique());

test("a contact form on a setup document is created and refreshed under the author's own rights", async () => {
  const f = await fixture();
  const first = await f.write(contactPage(f, "Talk to us"));
  expect(first.outcome).toBe("created");
  const form = await contactForm(f, first.postId!);
  expect(form).toMatchObject({ status: "published", title: "Talk to us", createdBy: f.ids.author });
  const updated = await f.write(contactPage(f, "Ask the team"));
  expect(updated).toEqual({ outcome: "updated", postId: first.postId });
  expect(await contactForm(f, first.postId!)).toMatchObject({ _id: form!._id, status: "published", title: "Ask the team" });
});

test("an author without form rights can't add a contact form", async () => {
  const f = await fixture({ formRights: false });
  await expect(f.write(contactPage(f, "Talk to us"))).rejects.toThrow(/lacks the required content capability|FORBIDDEN/);
  const pages = await f.t.run(async (ctx) => await ctx.db.query("posts").withIndex("by_type_slug", (q) => q.eq("type", "page").eq("slug", "contact")).collect());
  expect(pages).toEqual([]);
});
