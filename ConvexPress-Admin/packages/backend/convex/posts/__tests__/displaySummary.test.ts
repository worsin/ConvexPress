import { describe, expect, test } from "bun:test";
import { convexTest } from "convex-test";
import { api } from "../../_generated/api";
import schema from "../../schema";
import { boundedTextExcerpt, storedPostTextSummary, TEXT_EXCERPT_MAX_LENGTH } from "../../search/canonicalText";

const modules = {
  "./convex/_generated/server.js": () => import("../../_generated/server.js"),
  "./convex/_generated/api.js": () => import("../../_generated/api.js"),
  "./convex/posts/queries.ts": () => import("../queries"),
  "./convex/membership/policyReads.ts": () => import("../../membership/policyReads"),
};

type Audience = "everyone" | "signedIn" | "signedOut";
const richText = (text: string) => ({ type: "doc" as const, content: [{ type: "paragraph" as const, content: [{ type: "text" as const, text }] }] });
const paragraph = (id: string, text: string, visibility?: Audience) =>
  ({ id, name: "core/paragraph" as const, version: 2, attrs: { body: richText(text) }, ...(visibility ? { visibility } : {}) });
const words = (count: number) => Array.from({ length: count }, (_, index) => `word${index}`).join(" ");

describe("storedPostTextSummary", () => {
  test("reading time counts canonical text at 200 words a minute with a one-minute floor", async () => {
    expect(await storedPostTextSummary({ blocks: [paragraph("long", words(401))] }, { excerpt: false })).toEqual({ readingTimeMinutes: 3 });
    expect(await storedPostTextSummary({ blocks: [paragraph("short", "Two words")] }, { excerpt: false })).toEqual({ readingTimeMinutes: 1 });
    expect(await storedPostTextSummary({ blocks: [] }, { excerpt: true })).toEqual({ readingTimeMinutes: 1 });
  });

  test("excerpt is opening paragraph prose visible to everyone, never audience-gated text", async () => {
    const summary = await storedPostTextSummary({ blocks: [
      paragraph("members", "Signed-in secret", "signedIn"),
      { id: "gated-group", name: "core/group", version: 1, attrs: {}, visibility: "signedOut", children: [paragraph("inner-gated", "Guest-only aside")] },
      { id: "open-group", name: "core/group", version: 1, attrs: {}, children: [paragraph("inner-open", "Nested opening.")] },
      paragraph("public", "Public  closing   line.", "everyone"),
    ] }, { excerpt: true });
    expect(summary.textExcerpt).toBe("Nested opening. Public closing line.");
    expect(summary.textExcerpt).not.toContain("secret");
    expect(summary.textExcerpt).not.toContain("Guest-only");
    // Reading time is a count only; it is computed whether or not an excerpt is.
    expect(summary.readingTimeMinutes).toBe(1);
  });

  test("excerpt is omitted unless requested and when there is no paragraph prose", async () => {
    expect(await storedPostTextSummary({ blocks: [paragraph("p", "Body text")] }, { excerpt: false })).toEqual({ readingTimeMinutes: 1 });
    expect(await storedPostTextSummary({ blocks: [{ id: "g", name: "core/group", version: 1, attrs: {} }] }, { excerpt: true })).toEqual({ readingTimeMinutes: 1 });
  });

  test("excerpt is bounded and ends on a word boundary with an ellipsis", async () => {
    const { textExcerpt } = await storedPostTextSummary({ blocks: [paragraph("long", words(120))] }, { excerpt: true });
    expect(textExcerpt).toBeDefined();
    expect(textExcerpt!.length).toBeLessThanOrEqual(TEXT_EXCERPT_MAX_LENGTH);
    expect(textExcerpt!.endsWith("…")).toBe(true);
    expect(words(120).startsWith(textExcerpt!.slice(0, -1))).toBe(true);
    expect(textExcerpt!.at(-2)).not.toBe(" ");
    expect(words(120).charAt(textExcerpt!.length - 1)).toBe(" ");
    expect(boundedTextExcerpt("   ")).toBeUndefined();
    expect(boundedTextExcerpt("x".repeat(400))).toBe(`${"x".repeat(TEXT_EXCERPT_MAX_LENGTH - 1)}…`);
    expect(boundedTextExcerpt(`${"x".repeat(TEXT_EXCERPT_MAX_LENGTH - 2)}😀😀`)).toBe(`${"x".repeat(TEXT_EXCERPT_MAX_LENGTH - 2)}…`);
  });

  test("a stored tree that is not canonical yields the floor instead of throwing", async () => {
    expect(await storedPostTextSummary({ blocks: [{ id: "legacy", name: "core/text", version: 1, attrs: { text: "Legacy" } }] }, { excerpt: true }))
      .toEqual({ readingTimeMinutes: 1 });
  });
});

async function fixture(options: { membership?: boolean } = {}) {
  const t = convexTest({ schema, modules });
  const ids = await t.run(async ctx => {
    const authorId = await ctx.db.insert("users", { email: "summary-author@example.invalid", displayName: "Summary Author", emailVerified: true, status: "active", authSource: "local", createdAt: 1, updatedAt: 1 });
    await ctx.db.insert("settings", { section: "plugins", values: { membershipEnabled: options.membership === true }, updatedAt: 1, updatedBy: authorId });
    const shared = { type: "post" as const, status: "publish" as const, authorId, commentStatus: "closed" as const, blocksVersion: 2, createdAt: 1, updatedAt: 1, publishedAt: 1 };
    const body = [paragraph("opening", "Opening paragraph."), paragraph("long", words(450))];
    const open = await ctx.db.insert("posts", { ...shared, title: "Open", slug: "open", visibility: "public", blocks: body });
    const manual = await ctx.db.insert("posts", { ...shared, title: "Manual", slug: "manual", visibility: "public", excerpt: "Hand-written excerpt", blocks: body });
    const locked = await ctx.db.insert("posts", { ...shared, title: "Locked", slug: "locked", visibility: "password", password: "synthetic-password", blocks: body });
    return { authorId, open, manual, locked };
  });
  return { t, ids };
}

describe("public post read paths", () => {
  test("getPublished derives reading time and the plain-text excerpt from canonical text", async () => {
    const { t } = await fixture();
    const post = await t.query(api.posts.queries.getPublished, { slug: "open" });
    expect(post?.readingTimeMinutes).toBe(3);
    expect(post?.textExcerpt).toBe(boundedTextExcerpt(`Opening paragraph. ${words(450)}`));
    expect(post?.textExcerpt?.startsWith("Opening paragraph. word0 word1")).toBe(true);
    // One object shape: no featured image means the fields are absent, not a second union member.
    expect(post && "featuredImageUrl" in post).toBe(false);
  });

  test("a manual excerpt suppresses the derived one", async () => {
    const { t } = await fixture();
    const post = await t.query(api.posts.queries.getPublished, { slug: "manual" });
    expect(post?.excerpt).toBe("Hand-written excerpt");
    expect(post?.textExcerpt).toBeUndefined();
    expect(post?.readingTimeMinutes).toBe(3);
  });

  test("password-protected bodies yield an excerpt only after the password is verified", async () => {
    const { t } = await fixture();
    const gated = await t.query(api.posts.queries.getPublished, { slug: "locked" });
    expect(gated?.isPasswordProtected).toBe(true);
    expect(gated?.textExcerpt).toBeUndefined();
    expect(JSON.stringify(gated)).not.toContain("Opening paragraph");
    expect(gated?.readingTimeMinutes).toBe(3);
    const verified = await t.query(api.posts.queries.verifyPostPassword, { slug: "locked", password: "synthetic-password" });
    expect(verified?.textExcerpt?.startsWith("Opening paragraph.")).toBe(true);
    expect(verified?.readingTimeMinutes).toBe(3);
  });

  test("listPublished items carry both fields", async () => {
    const { t, ids } = await fixture();
    const list = await t.query(api.posts.queries.listPublished, {});
    const bySlug = new Map(list.posts.map(post => [post.slug, post]));
    expect(list.posts.map(post => post._id).sort()).toEqual([ids.open, ids.manual].sort());
    expect(bySlug.get("open")?.readingTimeMinutes).toBe(3);
    expect(bySlug.get("open")?.textExcerpt?.startsWith("Opening paragraph.")).toBe(true);
    expect(bySlug.get("manual")?.textExcerpt).toBeUndefined();
  });

  test("with membership enabled the excerpt fails closed because block rules need reads", async () => {
    const { t } = await fixture({ membership: true });
    const post = await t.query(api.posts.queries.getPublished, { slug: "open" });
    expect(post?.isMembershipRestricted).toBe(false);
    expect(post?.textExcerpt).toBeUndefined();
    expect(post?.readingTimeMinutes).toBe(3);
    const list = await t.query(api.posts.queries.listPublished, {});
    expect(list.posts.every(item => item.textExcerpt === undefined)).toBe(true);
  });

  test("a restricted post never exposes body text through the excerpt", async () => {
    const { t, ids } = await fixture({ membership: true });
    await t.run(ctx => ctx.db.insert("membership_restriction_rules", { resourceType: "post", resourceIdOrKey: ids.open, ruleMode: "allow_only", planIds: [], loginRequired: true, teaserMode: "excerpt", createdAt: 1, updatedAt: 1 }));
    const post = await t.query(api.posts.queries.getPublished, { slug: "open" });
    expect(post?.isMembershipRestricted).toBe(true);
    expect(post?.textExcerpt).toBeUndefined();
    expect(JSON.stringify(post)).not.toContain("Opening paragraph");
  });
});
