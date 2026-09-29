import { expect, test, setSystemTime } from "bun:test";
import { convexTest } from "convex-test";
import { makeFunctionReference } from "convex/server";
import schema from "../../schema";
import { parseCanonicalDocumentRead } from "../foundation/documentContracts";
const reference = (name: string, kind: "query" | "mutation" = "query") =>
	makeFunctionReference<any, any, any>(`canonicalDocuments:${name}`);

test("commerce resolver-invalid edits are refused before saving or previewing without changing history", async () => {
  const f = await fixture();
  await initialize(f);
  const opened = await f.client.query(reference("get"), { postId: f.ids.post });
  const snapshot = () => f.t.run(async ctx => ({ post: await ctx.db.get("posts", f.ids.post), history: await ctx.db.query("revisions").collect() }));
  const before = await snapshot();
  for (const [name, attrs] of [
    ["blocks/product-collection", { count: 1.5 }],
    ["commerce/product-showcase", { count: 1.5 }],
    ["blocks/product-collection", { mode: "category" }],
    ["blocks/product-collection", { mode: "tag" }],
    ["commerce/product-showcase", { source: "category" }],
  ] as const) {
    const args = { postId: f.ids.post, expectedRevision: opened.document.revision, title: opened.document.title, blocks: [{ id: "products", name, version: 2, attrs }] };
    for (const operation of [() => f.client.mutation(reference("save", "mutation"), args), () => f.client.query(reference("previewDraft"), args)]) {
      await expect(operation()).rejects.toMatchObject({ data: { code: "INVALID_CANONICAL_DOCUMENT" } });
      expect(await snapshot()).toEqual(before);
    }
  }
});

test("announcement schedules refuse new saves, previews and publication while historical drafts remain recoverable", async () => {
  const f = await fixture();
  await initialize(f);
  await f.t.run(async ctx => {
    const user = (await ctx.db.get("users", f.ids.user))!;
    await ctx.db.patch("roles", user.roleId!, { capabilities: ["page.update", "page.publish", "revision.restore"] });
    await ctx.db.patch("posts", f.ids.post, { blocks: [{ id: "notice", name: "core/announcement-bar", version: 1, attrs: { text: "Retained historical notice", schedule: { startsAt: "2040-06-01T09:00:00Z", endsAt: "2040-06-01T08:00:00Z" } } }] });
  });
  const opened = await f.client.query(reference("get"), { postId: f.ids.post });
  const snapshot = () => f.t.run(async ctx => ({ post: await ctx.db.get("posts", f.ids.post), history: await ctx.db.query("revisions").collect() }));
  const before = await snapshot();
  const args = { postId: f.ids.post, expectedRevision: opened.document.revision, title: opened.document.title, blocks: opened.document.blocks };
  for (const endsAt of ["2040-06-01T08:00:00Z", "2040-06-01T09:00:00Z"]) {
    const blocks = structuredClone(args.blocks);
    blocks[0].attrs.schedule.endsAt = endsAt;
    for (const operation of [() => f.client.mutation(reference("save", "mutation"), { ...args, blocks }), () => f.client.query(reference("previewDraft"), { ...args, blocks })]) {
      await expect(operation()).rejects.toMatchObject({ data: { code: "INVALID_CANONICAL_DOCUMENT" } });
      expect(await snapshot()).toEqual(before);
    }
  }
  await expect(f.client.mutation(reference("setPublication", "mutation"), { postId: f.ids.post, expectedRevision: args.expectedRevision, status: "publish" })).rejects.toMatchObject({ data: { code: "INVALID_CANONICAL_DOCUMENT" } });
  expect(await snapshot()).toEqual(before);
  const repaired = structuredClone(args.blocks);
  repaired[0].attrs.schedule.endsAt = "2040-06-01T10:00:00Z";
  const saved = await f.client.mutation(reference("save", "mutation"), { ...args, blocks: repaired });
  const history = await f.client.query(reference("pageRevisions"), { postId: f.ids.post, paginationOpts: { cursor: null, numItems: 20 } });
  const old = history.page.find((row: any) => row.blocksVersion === 2);
  expect(old).toBeDefined();
  await f.client.mutation(reference("restore", "mutation"), { postId: f.ids.post, expectedRevision: saved.revision, revisionId: old.id });
  expect((await f.client.query(reference("get"), { postId: f.ids.post })).document.blocks).toEqual(args.blocks);
});

test("CTA family writes reject unusable actions without changing content or history", async () => {
  const cases = [
    ["blocks/media-mentions", 1, { items: [{ ctaUrl: "javascript:alert(1)", ctaLabel: "Read" }] }],
    ["blocks/page-banner", 1, { ctaUrl: "javascript:alert(1)", ctaLabel: "Read" }],
    ["blocks/product-collection", 2, { ctaUrl: "mailto:hello@example.com", ctaLabel: "Read" }],
    ["blocks/product-collection", 2, { products: [{ href: "/study", title: " " }] }],
    ["blocks/product-collection", 2, { groups: [{ products: [{ href: "javascript:alert(1)", title: "Read" }] }] }],
    ["commerce/assistant-band", 1, { ctaUrl: "javascript:alert(1)", ctaLabel: "Read" }],
    ["commerce/category-tiles", 2, { ctaUrl: "/study", ctaLabel: " " }],
    ["commerce/product-showcase", 2, { ctaUrl: "tel:+18005550100", ctaLabel: "Read" }],
    ["blocks/promo-band", 1, { primaryCtaUrl: "javascript:alert(1)", primaryCtaLabel: "Read" }],
    ["blocks/promo-band", 1, { secondaryCtaUrl: "/study", secondaryCtaLabel: " " }],
    ["blocks/story-timeline", 2, { items: [{ linkUrl: "/study", linkLabel: " " }] }],
    ["local/sample-alert", 1, { ctaUrl: "javascript:alert(1)", ctaLabel: "Read" }],
  ] as const;
  const f = await fixture();
  await initialize(f);
  const opened = await f.client.query(reference("get"), { postId: f.ids.post });
  const before = await f.t.run(async ctx => ({ post: await ctx.db.get("posts", f.ids.post), history: await ctx.db.query("revisions").collect() }));
  for (const [name, version, attrs] of cases) {
    const args = { postId: f.ids.post, expectedRevision: opened.document.revision, title: opened.document.title, blocks: [{ id: "action", name, version, attrs }] };
    for (const operation of [() => f.client.mutation(reference("save", "mutation"), args), () => f.client.query(reference("previewDraft"), args)]) {
      // Field diagnostics stay in the compiler; the public endpoint returns its stable contract error.
      await expect(operation()).rejects.toMatchObject({ data: { code: "INVALID_CANONICAL_DOCUMENT" } });
      expect(await f.t.run(async ctx => ({ post: await ctx.db.get("posts", f.ids.post), history: await ctx.db.query("revisions").collect() }))).toEqual(before);
    }
  }
});

test("CTA authoring rejects save, preview and publication atomically while legacy repair and recovery stay available", async () => {
  const f = await fixture();
  await initialize(f);
  await f.t.run(async ctx => {
    const user = (await ctx.db.get("users", f.ids.user))!;
    await ctx.db.patch("roles", user.roleId!, { capabilities: ["page.update", "page.publish", "revision.restore"] });
    // A saved value from before the authoring rule, not a permitted new write.
    await ctx.db.patch("posts", f.ids.post, { blocks: [{ id: "cta", name: "blocks/tabbed-content", version: 2, attrs: { tabs: [{ ctaLabel: "Open", ctaUrl: "javascript:alert(1)" }] } }] });
  });
  const opened = await f.client.query(reference("get"), { postId: f.ids.post });
  const before = await f.t.run(async ctx => ({ post: await ctx.db.get("posts", f.ids.post), history: await ctx.db.query("revisions").collect() }));
  const args = { postId: f.ids.post, expectedRevision: opened.document.revision, title: opened.document.title, blocks: opened.document.blocks };
  for (const operation of [
    () => f.client.mutation(reference("save", "mutation"), args),
    () => f.client.query(reference("previewDraft"), args),
    ...(["publish", "private", "future"] as const).map(status => () => f.client.mutation(reference("setPublication", "mutation"), { postId: f.ids.post, expectedRevision: args.expectedRevision, status, ...(status === "future" ? { scheduledAt: Date.now() + 60000 } : {}) })),
  ]) {
    await expect(operation()).rejects.toThrow();
    expect(await f.t.run(async ctx => ({ post: await ctx.db.get("posts", f.ids.post), history: await ctx.db.query("revisions").collect() }))).toEqual(before);
  }
  expect(opened.document.blocks[0].attrs.tabs[0].ctaUrl).toBe("javascript:alert(1)");
  const repaired = structuredClone(args.blocks);
  repaired[0].attrs.tabs[0].ctaUrl = "/page/example/";
  const saved = await f.client.mutation(reference("save", "mutation"), { ...args, blocks: repaired });
  expect(saved.revision).toBe(args.expectedRevision + 1);
  const history = await f.client.query(reference("pageRevisions"), { postId: f.ids.post, paginationOpts: { cursor: null, numItems: 20 } });
  const old = history.page.find((row: any) => row.blocksVersion === 2);
  expect(old).toBeDefined();
  const restored = await f.client.mutation(reference("restore", "mutation"), { postId: f.ids.post, expectedRevision: saved.revision, revisionId: old.id });
  expect((await f.client.query(reference("get"), { postId: f.ids.post })).document.blocks).toEqual(args.blocks);
  const settings = await f.client.query(reference("getSettings"), { postId: f.ids.post });
  const changed = await f.client.mutation(reference("setSettings", "mutation"), { postId: f.ids.post, expectedRevision: restored.revision, expectedSettingsDigest: settings.settingsDigest, slug: settings.slug, pageTemplate: settings.pageTemplate, hideHeader: !settings.hideHeader, hideFooter: settings.hideFooter });
  const original = history.page.find((row: any) => row.action === "recover-legacy");
  expect(original).toBeDefined();
  await f.client.mutation(reference("recoverLegacy", "mutation"), { postId: f.ids.post, expectedRevision: changed.revision, revisionId: original.id });
  expect((await f.t.run(ctx => ctx.db.get("posts", f.ids.post)))?.blocksVersion).toBe(1);
});

test("saved block locks reject combined unlock/edit, removal and order changes without creating revisions", async () => {
	const f = await fixture();
	const blocks = [
		{ id: "protected", name: "core/heading", version: 2, attrs: { text: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Original" }] }] } }, lock: { edit: true, move: true, remove: true } },
		{ id: "space", name: "core/spacer", version: 2, attrs: {} },
	];
	await initialize(f);
	await f.client.mutation(reference("save", "mutation"), { postId: f.ids.post, expectedRevision: 1, title: "Protected content", blocks });
	const read = await f.client.query(reference("get"), { postId: f.ids.post });
	const before = await f.t.run(async ctx => ({ post: await ctx.db.get("posts", f.ids.post), history: await ctx.db.query("revisions").collect() }));
	for (const candidate of [
		read.document.blocks.slice(1),
		[...read.document.blocks].reverse(),
		[{ ...read.document.blocks[0], lock: {}, anchor: "changed" }, read.document.blocks[1]],
	]) {
		await expect(f.client.mutation(reference("save", "mutation"), { postId: f.ids.post, expectedRevision: read.document.revision, title: read.document.title, blocks: candidate })).rejects.toThrow();
		expect(await f.t.run(async ctx => ({ post: await ctx.db.get("posts", f.ids.post), history: await ctx.db.query("revisions").collect() }))).toEqual(before);
	}
	const unlocked = read.document.blocks.map((block: any) => ({ ...block, lock: {} }));
	const first = await f.client.mutation(reference("save", "mutation"), { postId: f.ids.post, expectedRevision: read.document.revision, title: read.document.title, blocks: unlocked });
	const changed = [{ ...unlocked[0], anchor: "changed" }, unlocked[1]];
	const second = await f.client.mutation(reference("save", "mutation"), { postId: f.ids.post, expectedRevision: first.revision, title: read.document.title, blocks: changed });
	expect(second.revision).toBe(first.revision + 1);
	expect((await f.client.query(reference("get"), { postId: f.ids.post })).document.blocks).toEqual(changed);
});

test("legacy utility variants migrate together, save and recover their exact original attrs", async () => {
  const f = await fixture();
  const blocks = [
    ...["small","medium","large","xlarge"].map(size=>({id:`space-${size}`,name:"core/spacer",version:1,attrs:{size}})),
    ...["default","section","subtle"].map(variant=>({id:`rule-${variant}`,name:"core/divider",version:1,attrs:{variant}})),
  ];
  await f.t.run(ctx=>ctx.db.patch("posts",f.ids.post,{contentMode:"blocks",blocksVersion:1,blocks}));
  const review=await f.client.query(reference("prepareMigration"),{postId:f.ids.post});
  expect(review.candidate.document.blocks.map((node:any)=>node.treatment.values)).toEqual(blocks.map(node=>node.attrs));
  const receipt=await f.client.mutation(reference("migrate","mutation"),{postId:f.ids.post,expectedRevision:review.source.revision,expectedAuthoringDigest:review.source.authoringDigest,expectedCandidateDigest:review.candidate.document.digest,expectedPresentationRevision:review.candidate.presentation.revision});
  const reopened=await f.client.query(reference("get"),{postId:f.ids.post});
  expect(reopened.document.blocks).toEqual(review.candidate.document.blocks);
  reopened.document.blocks[0].anchor="first-space";
  const saved=await f.client.mutation(reference("save","mutation"),{postId:f.ids.post,expectedRevision:receipt.revision,title:reopened.document.title,blocks:reopened.document.blocks});
  expect((await f.client.query(reference("get"),{postId:f.ids.post})).document.blocks).toEqual(reopened.document.blocks);
  const history=await f.client.query(reference("pageRevisions"),{postId:f.ids.post,paginationOpts:{cursor:null,numItems:20}});
  const original=history.page.find((row:any)=>row.action==="recover-legacy");expect(original).toBeDefined();
  await f.client.mutation(reference("recoverLegacy","mutation"),{postId:f.ids.post,revisionId:original.id,expectedRevision:saved.revision});
  const restored=await f.t.run(ctx=>ctx.db.get("posts",f.ids.post));expect(restored!.blocks).toEqual(blocks);expect(restored!.blocksVersion).toBe(1);
});

test("structured article migration retains visible order, links, anchors and complete original recovery", async () => {
  const f = await fixture();
  const authored = {
    type: "post" as const, contentMode: "article" as const, blocksVersion: 1,
    content: "Hidden fallback article", hero: { title: "Hidden hero title", subtitle: "A studio practice", content: "First **literal** paragraph.\n\nRead https://example.org/study", ctaText: "Visit the studio", ctaUrl: "/studio" },
    topics: [{ subtitle: "Hidden empty topic" }, { title: "First steps", subtitle: "Start slowly", content: "Make something." }, { title: "Keep going", content: "Return tomorrow." }],
    tableOfContents: "01 — First steps\n02 — Keep going", summary: { title: "Takeaways", content: "A lasting practice." }, sources: "https://example.org/reference\nA printed reference", pagePrompt: "Preserve my brief",
  };
  await f.t.run(ctx => ctx.db.patch("posts", f.ids.post, authored));
  const original = await f.t.run(ctx => ctx.db.get("posts", f.ids.post));
  const review = await f.client.query(reference("prepareMigration"), { postId: f.ids.post });
  const serialized = JSON.stringify(review.candidate.document.blocks);
  expect(serialized).not.toContain("Hidden");
  for (const text of ["First **literal** paragraph.", "https://example.org/study", "Visit the studio", "01 — First steps", "topic-first-steps", "Takeaways", "A printed reference"]) expect(serialized).toContain(text);
  const result = await f.client.mutation(reference("migrate", "mutation"), { postId: f.ids.post, expectedRevision: review.source.revision, expectedAuthoringDigest: review.source.authoringDigest, expectedCandidateDigest: review.candidate.document.digest, expectedPresentationRevision: review.candidate.presentation.revision });
  const history = await f.client.query(reference("pageRevisions"), { postId: f.ids.post, paginationOpts: { cursor: null, numItems: 20 } });
  const recovery = history.page.find((row: any) => row.action === "recover-legacy");
  expect(recovery?.restorable).toBe(true);
  await f.client.mutation(reference("recoverLegacy", "mutation"), { postId: f.ids.post, revisionId: recovery.id, expectedRevision: result.revision });
  const restored = await f.t.run(ctx => ctx.db.get("posts", f.ids.post));
  for (const field of Object.keys(authored)) expect((restored as any)[field]).toEqual((original as any)[field]);
});

test("legacy block and section migration commits the visible source and recovers the complete original", async () => {
  for (const source of ["page-blocks", "post-blocks", "page-sections", "empty-block-page"] as const) {
    const f = await fixture();
    const blocks = [{ id: "saved-heading", name: "core/heading", version: 1, attrs: { text: "Visible **literal** heading", level: 2 } }];
    const sections = [{ id: "saved-section", type: "rich-text", data: { heading: "Visible section", body: "Original section body" } }];
    await f.t.run(ctx => ctx.db.patch("posts", f.ids.post, {
      type: source === "post-blocks" ? "post" : "page", contentMode: "blocks", blocksVersion: 1,
      blocks: source.endsWith("-blocks") ? blocks : [],
      pageSections: source === "empty-block-page" ? [] : sections,
      content: "Hidden text must never become the migrated body", pagePrompt: "Retain my brief",
      ...(source === "post-blocks" ? { hero: { content: "Hidden structured fallback" } } : {}),
    }));
    const original = await f.t.run(ctx => ctx.db.get("posts", f.ids.post));
    const review = await f.client.query(reference("prepareMigration"), { postId: f.ids.post });
    const candidate = review.candidate.document.blocks;
    expect(candidate.map((node: any) => node.id)).toEqual(source.endsWith("-blocks") ? ["saved-heading"] : source === "page-sections" ? ["saved-section"] : []);
    expect(JSON.stringify(candidate)).not.toContain("Hidden");
    const receipt = await f.client.mutation(reference("migrate", "mutation"), {
      postId: f.ids.post, expectedRevision: review.source.revision, expectedAuthoringDigest: review.source.authoringDigest,
      expectedCandidateDigest: review.candidate.document.digest, expectedPresentationRevision: review.candidate.presentation.revision,
    });
    expect((await f.client.query(reference("get"), { postId: f.ids.post })).document.blocks).toEqual(candidate);
    const history = await f.client.query(reference("pageRevisions"), { postId: f.ids.post, paginationOpts: { cursor: null, numItems: 20 } });
    const recovery = history.page.find((row: any) => row.action === "recover-legacy");
    expect(recovery?.restorable).toBe(true);
    await f.client.mutation(reference("recoverLegacy", "mutation"), { postId: f.ids.post, revisionId: recovery.id, expectedRevision: receipt.revision });
    const restored = await f.t.run(ctx => ctx.db.get("posts", f.ids.post));
    for (const field of ["blocks", "pageSections", "content", "hero", "pagePrompt", "contentMode", "blocksVersion"] as const) expect(restored![field]).toEqual(original![field]);
  }
});

test("legacy block migration refuses unknown fields and stale settings reviews without any writes", async () => {
  const f = await fixture(), block = { id: "saved-heading", name: "core/heading", version: 1, attrs: { text: "Original", level: 2 } };
  await f.t.run(ctx => ctx.db.patch("posts", f.ids.post, { contentMode: "blocks", blocksVersion: 1, blocks: [block] }));
  const review = await f.client.query(reference("prepareMigration"), { postId: f.ids.post });
  const args = { postId: f.ids.post, expectedRevision: review.source.revision, expectedAuthoringDigest: review.source.authoringDigest, expectedCandidateDigest: review.candidate.document.digest, expectedPresentationRevision: review.candidate.presentation.revision };
  for (const changed of [
    { ...block, attrs: { ...block.attrs, extra: "Must not disappear" } },
    { ...block, layout: { tone: "muted" } },
    { ...block, lock: { move: true } },
  ]) {
    await f.t.run(ctx => ctx.db.patch("posts", f.ids.post, { blocks: [changed] }));
    const before = await f.t.run(async ctx => ({ post: await ctx.db.get("posts", f.ids.post), revisions: await ctx.db.query("revisions").collect() }));
    if ("layout" in changed || "lock" in changed) {
      const refreshed = await f.client.query(reference("prepareMigration"), { postId: f.ids.post });
      expect(refreshed.inactiveSettings).toHaveLength(1);
    } else await expect(f.client.query(reference("prepareMigration"), { postId: f.ids.post })).rejects.toThrow();
    await expect(f.client.mutation(reference("migrate", "mutation"), args)).rejects.toThrow();
    expect(await f.t.run(async ctx => ({ post: await ctx.db.get("posts", f.ids.post), revisions: await ctx.db.query("revisions").collect() }))).toEqual(before);
  }
});
const modules = {
 "./convex/extensions/events/rsvp.ts":()=>import("../../extensions/events/rsvp"),
 "./convex/extensions/forms/polls.ts":()=>import("../../extensions/forms/polls"),
 "./convex/extensions/forms/mutations.ts":()=>import("../../extensions/forms/mutations"),
 "./convex/extensions/forms/confirmations.ts":()=>import("../../extensions/forms/confirmations"),
 "./convex/extensions/forms/spam.ts":()=>import("../../extensions/forms/spam"),
  "./convex/posts/authorCounts.ts": () => import("../../posts/authorCounts"),
	"./convex/_generated/api.js": () => import("../../_generated/api.js"),
	"./convex/_generated/server.js": () => import("../../_generated/server.js"),
	"./convex/canonicalDocuments.ts": () => import("../../canonicalDocuments"),
	"./convex/posts/mutations.ts": () => import("../../posts/mutations"),
 "./convex/posts/queries.ts": () => import("../../posts/queries"),
 "./convex/posts/internals.ts": () => import("../../posts/internals"),
	"./convex/pages/mutations.ts": () => import("../../pages/mutations"),
	"./convex/revisions/mutations.ts": () => import("../../revisions/mutations"),
	"./convex/revisions/internals.ts": () => import("../../revisions/internals"),
	"./convex/settings/queries.ts": () => import("../../settings/queries"),
	"./convex/blocks/queries.ts": () => import("../../blocks/queries"),
	"./convex/membership/policyReads.ts": () =>
		import("../../membership/policyReads"),
};
test("public canonical responses remove restricted parent bodies before loading their data and media", async () => {
  const f = await fixture();
  await f.t.run(async ctx => {
    const plugins = (await ctx.db.query("settings").withIndex("by_section", q => q.eq("section", "plugins")).unique())!;
    await ctx.db.patch("settings", plugins._id, { values: { membershipEnabled: true } });
    await ctx.db.patch("posts", f.ids.post, { status: "publish", publishedAt: 1, blocksVersion: 2, blocks: [
      { id: "visible", name: "core/paragraph", version: 2, attrs: {} },
      { id: "members", name: "core/group", version: 1, attrs: {}, children: [
        { id: "secret", name: "core/paragraph", version: 2, attrs: { body: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "PRIVATE_BODY" }] }] } } },
        { id: "private-image", name: "core/image", version: 2, attrs: { mediaId: "INVALID_PRIVATE_MEDIA" } },
        { id: "private-data", name: "core/featured-page", version: 1, attrs: { page: "INVALID_PRIVATE_PAGE" } },
      ] },
    ] });
    await ctx.db.insert("membership_restriction_rules", { resourceType: "block", resourceIdOrKey: "members", ruleMode: "allow_only", planIds: [], loginRequired: true, teaserMode: "hide", createdAt: 1, updatedAt: 1 });
  });
  const result = await f.t.query(reference("getForRender"), { postId: f.ids.post });
  expect(result.state).toBe("ready");expect(result.document.blocks.map((node: {id: string}) => node.id)).toEqual(["visible"]);
  expect(result.resources.media).toEqual({});expect(result.data.dataByBlock).toEqual({});
  for (const secret of ["PRIVATE_BODY", "INVALID_PRIVATE_MEDIA", "INVALID_PRIVATE_PAGE"]) expect(JSON.stringify(result)).not.toContain(secret);
  expect((await f.t.run(ctx => ctx.db.get("posts", f.ids.post)))?.blocks).toHaveLength(2);
});
test("block-level membership deadlines change the public payload and lease without modifying the authored document", async () => {
  const f = await fixture(), now = Date.now();
  await f.t.run(async ctx => {
    const plugins = (await ctx.db.query("settings").withIndex("by_section", q => q.eq("section", "plugins")).unique())!;
    await ctx.db.patch("settings", plugins._id, { values: { membershipEnabled: true } });
    await ctx.db.patch("posts", f.ids.post, { status: "publish", publishedAt: 1, blocksVersion: 2, blocks: [{ id: "member-copy", name: "core/paragraph", version: 2, attrs: {} }] });
    const plan = await ctx.db.insert("membership_plans", { title: "Readers", slug: "readers", status: "active", grantMode: "manual", priority: 1, createdAt: now, updatedAt: now });
    await ctx.db.insert("membership_grants", { userId: f.ids.user, planId: plan, sourceType: "manual", status: "active", startsAt: now - 1000, endsAt: now + 1000, createdAt: now, updatedAt: now });
    await ctx.db.insert("membership_restriction_rules", { resourceType: "block", resourceIdOrKey: "member-copy", ruleMode: "allow_only", planIds: [plan], loginRequired: true, teaserMode: "hide", createdAt: now, updatedAt: now });
  });
  expect((await f.t.query(reference("getForRender"), { postId: f.ids.post })).document.blocks).toEqual([]);
  const before = await f.client.query(reference("getForRender"), { postId: f.ids.post });
  expect(before.document.blocks).toHaveLength(1);expect(before.accessLease.expiresAt).toBe(now + 1000);
  try {
    setSystemTime(now + 1000);
    const after = await f.client.query(reference("getForRender"), { postId: f.ids.post });
    expect(after.document.blocks).toEqual([]);expect(after.document.digest).not.toBe(before.document.digest);expect(after.document.revision).toBe(before.document.revision);
  } finally { setSystemTime(); }
  expect((await f.t.run(ctx => ctx.db.get("posts", f.ids.post)))?.blocks).toHaveLength(1);
});
async function fixture() {
	const t = convexTest({ schema, modules });
	const ids = await t.run(async (ctx) => {
		const role = await ctx.db.insert("roles", {
			name: "Editor",
			slug: "editor",
			description: "Fixture",
			level: 80,
			type: "internal",
			isDefault: false,
			isProtected: false,
			capabilities: ["page.update", "post.update", "revision.restore"],
			pageAccess: [],
			status: "active",
			createdAt: 1,
			updatedAt: 1,
		});
		const user = await ctx.db.insert("users", {
			authSource: "local",
			email: "fixture@example.invalid",
			emailVerified: true,
			roleId: role,
			status: "active",
			createdAt: 1,
			updatedAt: 1,
		});
		const denied = await ctx.db.insert("users", {
			authSource: "local",
			email: "denied@example.invalid",
			emailVerified: true,
			status: "active",
			createdAt: 1,
			updatedAt: 1,
		});
		await ctx.db.insert("convexpress_siteIdentity", {
			identityKey: "site-identity",
			websiteKey: "fixture",
			instanceKey: "fixture-stage",
			environmentKind: "staging",
			deploymentOrigin: "https://fixture.convex.cloud",
			managementOrigin: "https://fixture.convex.site",
			siteOrigin: "https://fixture.example.invalid",
			siteContractVersion: "1",
			schemaVersion: "1",
			engineVersion: "1",
			managementCapabilities: [],
			initializedAt: 1,
			updatedAt: 1,
		});
		await ctx.db.insert("settings", {
			section: "plugins",
			values: { membershipEnabled: false },
			updatedAt: 1,
			updatedBy: user,
		});
		await ctx.db.insert("settings", {
			section: "appearance.template",
			values: { active: "core", overrides: {}, variants: {}, settings: {} },
			legacyAppearanceMigration: { version: 2, migratedAt: 1 },
			updatedAt: 1,
			updatedBy: user,
		});
		const post = await ctx.db.insert("posts", {
			type: "page",
			title: "Disposable draft",
			slug: "draft",
			path: "/draft",
			content: "",
			status: "draft",
			visibility: "public",
			authorId: user,
			commentStatus: "closed",
			createdAt: 1,
			updatedAt: 1,
		});
		return { user, denied, post };
	});
	const as = (id: typeof ids.user) =>
		t.withIdentity({
			subject: id,
			tokenIdentifier: `https://convexpress-admin.local|${id}`,
		});
	return { t, ids, as, client: as(ids.user) };
}
async function code(run: () => Promise<unknown>) {
	try {
		await run();
		return null;
	} catch (error: any) {
		return error.data?.code ?? error.message;
	}
}
const tree = [
	{
		id: "copy",
		name: "core/paragraph",
		version: 2,
		attrs: {
			body: {
				type: "doc",
				content: [
					{
						type: "paragraph",
						content: [
							{ type: "text", text: "Original ", marks: [{ type: "bold" }] },
							{ type: "hardBreak" },
							{ type: "text", text: "fixture prose" },
						],
					},
				],
			},
		},
		layout: { width: "wide", spacing: "compact" },
		anchor: "original",
	},
];
async function initialize(f: Awaited<ReturnType<typeof fixture>>) {
	const current = await f.client.query(reference("get"), {
		postId: f.ids.post,
	});
	expect(current.contract).toBe("canonical-initialization-v1");
	return f.client.mutation(reference("initialize", "mutation"), {
		postId: f.ids.post,
		expectedRevision: current.document.revision,
		expectedAuthoringDigest: current.document.authoringDigest,
		title: current.document.title,
		blocks: tree,
	});
}
test("canonical signup blocks can be authored and published while disabled Forms plugin blocks remain unavailable", async () => {
  const f = await fixture();
  await initialize(f);
  const blocks = [
    { id: "signup", name: "core/newsletter-signup", version: 2, attrs: { heading: "Field notes" } },
    { id: "cta", name: "core/cta-with-form", version: 2, attrs: { heading: "Stay in touch" } },
  ];
  await f.client.mutation(reference("save", "mutation"), { postId: f.ids.post, expectedRevision: 1, title: "Signup fixture", blocks });
  const editor = await f.client.query(reference("get"), { postId: f.ids.post });
  expect(editor.policy.capabilities).toContain("form.submission");
  for (const name of ["core/newsletter-signup", "core/cta-with-form"]) expect(editor.policy.disabledBlocks).not.toContain(name);
  for (const name of ["core/contact-form", "core/poll"]) expect(editor.policy.disabledBlocks).toContain(name);
  await f.t.run(async ctx => { await ctx.db.patch("posts", f.ids.post, { status: "publish", publishedAt: 1 }); });
  const publicView = await f.t.query(reference("getForRender"), { postId: f.ids.post });
  expect(publicView.state).toBe("ready");
  expect(publicView.document.blocks.map((block: {name: string}) => block.name)).toEqual(blocks.map(block => block.name));
  // Display/preview reads do not create subscriptions; only explicit submission may write.
  expect(await f.t.run(ctx => ctx.db.query("newsletterSubscribers").collect())).toEqual([]);
});

test("registered Poll authoring, publication and revision recovery retain the original ballot and votes", async () => {
  const f = await fixture();
  await f.t.run(async ctx => {
    const user = await ctx.db.get(f.ids.user);
    await ctx.db.patch(user!.roleId!, { capabilities: ["page.update", "page.publish", "revision.restore"] });
    const setting = await ctx.db.query("settings").withIndex("by_section", q => q.eq("section", "plugins")).unique();
    await ctx.db.patch(setting!._id, { values: { formsEnabled: true, membershipEnabled: false } });
  });
  const initial = await initialize(f);
  const blocks = [{ id: "poll", name: "core/poll", version: 1, attrs: { question: "Which morning?", options: [{ key: "walk", label: "A coastal walk" }, { key: "read", label: "A quiet book" }] } }];
  let saved = await f.client.mutation(reference("save", "mutation"), { postId: f.ids.post, expectedRevision: initial.revision, title: "Morning poll", blocks });
  const editor = await f.client.query(reference("get"), { postId: f.ids.post });
  expect(editor.policy.capabilities).toContain("poll.submission");
  expect(editor.policy.disabledBlocks).not.toContain("core/poll");
  expect(await f.t.query(reference("getForRender"), { postId: f.ids.post })).toBeNull();
  saved = await f.client.mutation(reference("setPublication", "mutation"), { postId: f.ids.post, expectedRevision: saved.revision, status: "publish" });
  const shown = await f.t.query(reference("getForRender"), { postId: f.ids.post });
  expect(shown.state).toBe("ready");
  const poll = shown.data.dataByBlock.poll.data.poll;
  expect(poll.total).toBe(0);
  const vote = makeFunctionReference<any, any, any>("extensions/forms/polls:vote");
  const args = { postId: f.ids.post, blockId: "poll", definitionVersion: poll.definitionVersion, visitorToken: "ab".repeat(32), optionKey: "walk" };
  expect(await f.t.mutation(vote, args)).toMatchObject({ accepted: true });
  saved = await f.client.mutation(reference("save", "mutation"), { postId: f.ids.post, expectedRevision: saved.revision, title: "Morning poll", blocks: [] });
  await expect(f.t.mutation(vote, args)).rejects.toThrow();
  const history = await f.client.query(reference("pageRevisions"), { postId: f.ids.post, paginationOpts: { cursor: null, numItems: 20 } });
  const previous = history.page.find((item: any) => item.blocksVersion === 2);
  expect(previous).toBeDefined();
  await f.client.mutation(reference("restore", "mutation"), { postId: f.ids.post, revisionId: previous.id, expectedRevision: saved.revision });
  const restored = await f.t.query(reference("getForRender"), { postId: f.ids.post });
  expect(restored.data.dataByBlock.poll.data.poll).toMatchObject({ definitionVersion: poll.definitionVersion, total: 1 });
  expect(await f.t.mutation(vote, args)).toEqual({ accepted: false, optionKey: "walk" });
  expect(await f.t.run(ctx => ctx.db.query("form_poll_votes").collect())).toHaveLength(1);
});
test("actual canonical lifecycle saves/reopens normalized marked content and restores without revision ABA", async () => {
	const f = await fixture();
	const first = await initialize(f);
	expect(first).toMatchObject({
		postId: f.ids.post,
		revision: 1,
		changed: true,
	});
	const opened = await f.client.query(reference("get"), { postId: f.ids.post });
	expect(parseCanonicalDocumentRead(opened)).toEqual(opened);
	expect(opened.document.blocks).toEqual(tree);
	const unchanged = await f.client.mutation(reference("save", "mutation"), {
		postId: f.ids.post,
		expectedRevision: 1,
		title: opened.document.title,
		blocks: opened.document.blocks,
	});
	expect(unchanged.changed).toBe(false);
	expect(unchanged.revision).toBe(1);
	const second = await f.client.mutation(reference("save", "mutation"), {
		postId: f.ids.post,
		expectedRevision: 1,
		title: "Changed title",
		blocks: tree,
	});
	expect(second.revision).toBe(2);
	expect(
		await code(() =>
			f.client.mutation(reference("save", "mutation"), {
				postId: f.ids.post,
				expectedRevision: 1,
				title: "Changed title",
				blocks: tree,
			}),
		),
	).toBe("CONFLICT");
	const history = await f.client.query(reference("pageRevisions"), {
		postId: f.ids.post,
		paginationOpts: { cursor: null, numItems: 20 },
	});
	const restore = history.page.find((row: any) => row.blocksVersion === 2);
	expect(restore).toBeDefined();
	const receipt = await f.client.mutation(reference("restore", "mutation"), {
		postId: f.ids.post,
		revisionId: restore.id,
		expectedRevision: 2,
	});
	expect(receipt.revision).toBe(3);
	const restored = await f.client.query(reference("get"), {
		postId: f.ids.post,
	});
	expect(restored.document.title).toBe(opened.document.title);
	expect(restored.document.blocks).toEqual(opened.document.blocks);
});
test("actual get/write boundaries reject anonymous, inactive and capability-empty identities with no stored writes", async () => {
	const f = await fixture();
	expect(
		await code(() => f.t.query(reference("get"), { postId: f.ids.post })),
	).toBe("UNAUTHORIZED");
	expect(
		await code(() =>
			f.as(f.ids.denied).query(reference("get"), { postId: f.ids.post }),
		),
	).toBe("FORBIDDEN");
	await f.t.run(async (ctx) => {
		await ctx.db.patch("users", f.ids.user, { status: "banned" });
	});
	expect(
		await code(() => f.client.query(reference("get"), { postId: f.ids.post })),
	).toBe("FORBIDDEN");
	expect(
		await f.t.run(
			async (ctx) => (await ctx.db.query("revisions").collect()).length,
		),
	).toBe(0);
});
test("initialization refuses authored legacy content and a title-only legacy race with unchanged revision", async () => {
	const f = await fixture(),
		opened = await f.client.query(reference("get"), { postId: f.ids.post });
	const args = {
		postId: f.ids.post,
		expectedRevision: 0,
		expectedAuthoringDigest: opened.document.authoringDigest,
		title: "Next",
		blocks: tree,
	};
	await f.t.run(async (ctx) => {
		await ctx.db.patch("posts", f.ids.post, {
			title: "Concurrent legacy title",
		});
	});
	expect(
		await code(() =>
			f.client.mutation(reference("initialize", "mutation"), args),
		),
	).toBe("CONFLICT");
	await f.t.run(async (ctx) => {
		await ctx.db.patch("posts", f.ids.post, {
			content: "Existing authored body",
		});
	});
	const current = await f.client.query(reference("get"), {
		postId: f.ids.post,
	});
	expect(current.initialization.eligible).toBe(false);
	expect(
		await code(() =>
			f.client.mutation(reference("initialize", "mutation"), {
				...args,
				expectedAuthoringDigest: current.document.authoringDigest,
			}),
		),
	).toBe("CANONICAL_INITIALIZATION_UNAVAILABLE");
	expect(
		await f.t.run(
			async (ctx) => (await ctx.db.query("revisions").collect()).length,
		),
	).toBe(0);
});
test("invalid tree, duplicate anchors and unavailable media refuse before snapshots or changes", async () => {
	const f = await fixture();
	await initialize(f);
	const before = await f.t.run(async (ctx) => ({
		post: await ctx.db.get("posts", f.ids.post),
		revisions: await ctx.db.query("revisions").collect(),
	}));
	for (const blocks of [
		[...tree, { ...tree[0], id: "second" }],
		[{ id: "unknown", name: "unknown", version: 1, attrs: {} }],
		[
			{
				id: "media",
				name: "core/image",
				version: 2,
				attrs: { mediaId: "not-a-real-media-id" },
			},
		],
	]) {
		expect(
			await code(() =>
				f.client.mutation(reference("save", "mutation"), {
					postId: f.ids.post,
					expectedRevision: 1,
					title: "Changed",
					blocks,
				}),
			),
		).not.toBeNull();
	}
	expect(
		await f.t.run(async (ctx) => ({
			post: await ctx.db.get("posts", f.ids.post),
			revisions: await ctx.db.query("revisions").collect(),
		})),
	).toEqual(before);
});

test("actual page picker traverses empty intermediate pages and includes only discoverable published pages", async () => {
	const f = await fixture();
	const rows = await f.t.run(async (ctx) => {
		const base = (await ctx.db.get("posts", f.ids.post))!;
		const { _id, _creationTime, ...fields } = base;
		return Promise.all([
			ctx.db.insert("posts", {
				...fields,
				title: "Published page",
				slug: "public",
				path: "/public",
				status: "publish",
			}),
			ctx.db.insert("posts", {
				...fields,
				title: "Hidden password",
				slug: "password",
				path: "/password",
				status: "publish",
				visibility: "password",
				password: "fixture",
			}),
			ctx.db.insert("posts", {
				...fields,
				title: "Private",
				slug: "private",
				path: "/private",
				status: "private",
			}),
			ctx.db.insert("posts", {
				...fields,
				title: "Trashed",
				slug: "trash",
				path: "/trash",
				status: "trash",
			}),
			ctx.db.insert("posts", {
				...fields,
				type: "post",
				title: "Published post",
				slug: "post",
				status: "publish",
			}),
		]);
	});
	const found: string[] = [];
	let cursor: string | null = null,
		emptyIntermediate = false;
	for (let i = 0; i < 10; i++) {
		const page = await f.client.query(reference("pageOptions"), {
			postId: f.ids.post,
			paginationOpts: { cursor, numItems: 1 },
		});
		found.push(...page.page.map((item: any) => item.id));
		if (!page.isDone && !page.page.length) emptyIntermediate = true;
		if (page.isDone) break;
		cursor = page.continueCursor;
	}
	expect(found).toEqual([rows[0]]);
	expect(emptyIntermediate).toBe(true);
	for (const name of ["pageOptions", "pageRevisions"]) {
		expect(
			await code(() =>
				f.client.query(reference(name), {
					postId: f.ids.post,
					paginationOpts: { cursor: null, numItems: 21 },
				}),
			),
		).toBe("INVALID_PAGE_SIZE");
		expect(
			await code(() =>
				f.as(f.ids.denied).query(reference(name), {
					postId: f.ids.post,
					paginationOpts: { cursor: null, numItems: 1 },
				}),
			),
		).toBe("FORBIDDEN");
	}
});
test("actual canonical references resolve only public pages and react to current visibility", async () => {
	const f = await fixture();
	const target = await f.t.run(async (ctx) => {
		const { _id, _creationTime, ...base } = (await ctx.db.get(
			"posts",
			f.ids.post,
		))!;
		return ctx.db.insert("posts", {
			...base,
			title: "Source page",
			slug: "source",
			path: "/source",
			status: "publish",
			excerpt: "Public summary",
		});
	});
	const open = await f.client.query(reference("get"), { postId: f.ids.post });
	await f.client.mutation(reference("initialize", "mutation"), {
		postId: f.ids.post,
		expectedRevision: 0,
		expectedAuthoringDigest: open.document.authoringDigest,
		title: "Reference",
		blocks: [
			{
				id: "featured",
				name: "core/featured-page",
				version: 1,
				attrs: { page: target },
			},
		],
	});
	const first = await f.client.query(reference("get"), { postId: f.ids.post });
	expect(first.data.dataByBlock.featured.data.page.id).toBe(target);
	expect(first.data.dataByBlock.featured.data.page.href).toBe("/page/source");
	for (const [path, expected] of [["/collection/source", "/page/collection/source"], [undefined, "/page/source"]] as const) {
		await f.t.run(async (ctx) => { await ctx.db.patch("posts", target, { path }); });
		const current = await f.client.query(reference("get"), { postId: f.ids.post });
		expect(current.data.dataByBlock.featured.data.page.href).toBe(expected);
	}
	await f.t.run(async (ctx) => {
		await ctx.db.patch("posts", target, {
			visibility: "password",
			password: "fixture",
		});
	});
	const hidden = await f.client.query(reference("get"), { postId: f.ids.post });
	expect(hidden.data.dataByBlock.featured.data.page).toBeNull();
	expect(JSON.stringify(hidden)).not.toContain("Public summary");
});
test("canonical lock changes require canonical writes and legacy readers cannot flatten protected content", async () => {
	const f = await fixture();
	await initialize(f);
	const receipt = await f.client.mutation(reference("save", "mutation"), {
		postId: f.ids.post, expectedRevision: 1, title: "Protected content", blocks: [{ ...tree[0], lock: { remove: true } }],
	});
	expect(receipt.revision).toBe(2);
	expect(await code(() => f.client.mutation(reference("save", "mutation"), {
		postId: f.ids.post, expectedRevision: 2, title: "Protected content", blocks: [],
	}))).toBe("BLOCK_REMOVE_LOCKED");
	expect(await code(() => f.client.query(makeFunctionReference<any, any, any>("blocks/queries:getForDocument"), { postId: f.ids.post }))).toBe("CANONICAL_AUTHORING_REQUIRED");
	expect((await f.t.run(ctx => ctx.db.get("posts", f.ids.post)))?.blocksRevision).toBe(2);
});

test("ordinary post/page edits, autosave and legacy revision restore cannot mutate canonical documents", async () => {
	const f = await fixture();
	await initialize(f);
	const history = await f.client.query(reference("pageRevisions"), {
		postId: f.ids.post,
		paginationOpts: { cursor: null, numItems: 20 },
	});
	const before = await f.t.run(async (ctx) => ({
		post: await ctx.db.get("posts", f.ids.post),
		revisions: await ctx.db.query("revisions").collect(),
	}));
	for (const [name, args] of [
		[
			"posts/mutations:update",
			{ postId: f.ids.post, title: "Legacy post write" },
		],
		[
			"pages/mutations:update",
			{ pageId: f.ids.post, title: "Legacy page write" },
		],
		[
			"posts/mutations:autosave",
			{ postId: f.ids.post, content: "Legacy autosave" },
		],
		["revisions/mutations:restore", { revisionId: history.page[0].id }],
	] as const) {
		expect(
			await code(() =>
				f.client.mutation(makeFunctionReference<any, any, any>(name), args),
			),
		).toBe("CANONICAL_AUTHORING_REQUIRED");
	}
	expect(
		await f.t.run(async (ctx) => ({
			post: await ctx.db.get("posts", f.ids.post),
			revisions: await ctx.db.query("revisions").collect(),
		})),
	).toEqual(before);
});

test("actual oversized raw settings refuse initialization before a stored revision or owner change", async () => {
	const f = await fixture();
	const current = await f.client.query(reference("get"), {
		postId: f.ids.post,
	});
	const before = await f.t.run((ctx) => ctx.db.get("posts", f.ids.post));
	await f.t.run(async (ctx) => {
		const settings = (await ctx.db
			.query("settings")
			.withIndex("by_section", (q) => q.eq("section", "plugins"))
			.unique())!;
		await ctx.db.patch("settings", settings._id, {
			values: {
				membershipEnabled: false,
				privatePadding: "x".repeat(520 * 1024),
			},
		});
	});
	expect(
		await code(() =>
			f.client.mutation(reference("initialize", "mutation"), {
				postId: f.ids.post,
				expectedRevision: 0,
				expectedAuthoringDigest: current.document.authoringDigest,
				title: "Budget fixture",
				blocks: tree,
			}),
		),
	).toBe("CANONICAL_READ_BUDGET");
	expect(await f.t.run((ctx) => ctx.db.get("posts", f.ids.post))).toEqual(
		before,
	);
	expect(
		await f.t.run((ctx) => ctx.db.query("revisions").collect()),
	).toHaveLength(0);
});
test("actual successful media save remains target-bound and unavailable media invalidates reopening", async () => {
	const f = await fixture();
	const media = await f.t.run((ctx) =>
		ctx.db.insert("media", {
			title: "Original fixture",
			fileName: "original.png",
			slug: "original",
			url: "https://fixture.example.invalid/original.png",
			mimeType: "image/png",
			fileSize: 66,
			mediaType: "image",
			status: "active",
			uploadedBy: f.ids.user,
			createdAt: 1,
			updatedAt: 1,
		}),
	);
	const current = await f.client.query(reference("get"), {
		postId: f.ids.post,
	});
	await f.client.mutation(reference("initialize", "mutation"), {
		postId: f.ids.post,
		expectedRevision: 0,
		expectedAuthoringDigest: current.document.authoringDigest,
		title: "Media fixture",
		blocks: [
			{
				id: "image",
				name: "core/image",
				version: 2,
				attrs: { mediaId: media },
			},
		],
	});
	const opened = await f.client.query(reference("get"), { postId: f.ids.post });
	expect(Object.keys(opened.resources.media)).toEqual([media]);
	expect(opened.resources.media[media].byteSize).toBe(66);
	await f.t.run((ctx) => ctx.db.patch("media", media, { status: "trashed" }));
	expect(
		await code(() => f.client.query(reference("get"), { postId: f.ids.post })),
	).toBe("MEDIA_UNAVAILABLE");
});

test("explicit cache-busting reads remain bounded and recheck current authority", async () => {
	const f = await fixture();
	const first = await f.client.query(reference("get"), {
		postId: f.ids.post,
		refreshKey: "fresh_one",
	});
	expect(first.contract).toBe("canonical-initialization-v1");
	expect(
		await code(() =>
			f.client.query(reference("get"), {
				postId: f.ids.post,
				refreshKey: "x".repeat(65),
			}),
		),
	).toBe("INVALID_REFRESH_KEY");
	await f.t.run((ctx) =>
		ctx.db.patch("users", f.ids.user, { status: "banned" }),
	);
	expect(
		await code(() =>
			f.client.query(reference("get"), {
				postId: f.ids.post,
				refreshKey: "fresh_two",
			}),
		),
	).toBe("FORBIDDEN");
});

test("usage documents include canonical descendants once per document", async () => {
	const f = await fixture();
	await f.t.run(async (ctx) => {
		const user = (await ctx.db.get("users", f.ids.user))!;
		const role = (await ctx.db.get("roles", user.roleId!))!;
		await ctx.db.patch("roles", role._id, {
			capabilities: [...role.capabilities, "manage_options"],
		});
	});
	const current = await f.client.query(reference("get"), {
		postId: f.ids.post,
	});
	await f.client.mutation(reference("initialize", "mutation"), {
		postId: f.ids.post,
		expectedRevision: 0,
		expectedAuthoringDigest: current.document.authoringDigest,
		title: "Nested",
		blocks: [
			{
				id: "group",
				name: "core/group",
				version: 1,
				attrs: {},
				children: [tree[0], { ...tree[0], id: "second", anchor: "second" }],
			},
		],
	});
	const result = await f.client.query(
		makeFunctionReference<any, any, any>("blocks/queries:usageDocuments"),
		{ paginationOpts: { cursor: null, numItems: 25 } },
	);
	expect(
		result.page.find((row: any) => row._id === f.ids.post).blockNames,
	).toEqual(["core/group", "core/paragraph"]);
});

test("legacy status-only submission cannot strand a canonical draft in an unsupported workflow", async () => {
	const f = await fixture();
	await initialize(f);
	expect(
		await code(() =>
			f.client.mutation(
				makeFunctionReference<any, any, any>("posts/mutations:update"),
				{ postId: f.ids.post, status: "pending" },
			),
		),
	).toBe("CANONICAL_PUBLICATION_UNAVAILABLE");
	expect(
		(await f.t.run((ctx) => ctx.db.get("posts", f.ids.post)))?.status,
	).toBe("draft");
});

test("a valid tree cannot save a full authored row that the bounded reader could not reopen", async () => {
	const f = await fixture();
	await f.t.run((ctx) =>
		ctx.db.patch("posts", f.ids.post, { pagePrompt: "x".repeat(40 * 1024) }),
	);
	const current = await f.client.query(reference("get"), {
		postId: f.ids.post,
	});
	const before = await f.t.run((ctx) => ctx.db.get("posts", f.ids.post));
	expect(
		await code(() =>
			f.client.mutation(reference("initialize", "mutation"), {
				postId: f.ids.post,
				expectedRevision: 0,
				expectedAuthoringDigest: current.document.authoringDigest,
				title: "Large fixture",
				blocks: [
					{
						id: "code",
						name: "core/code",
						version: 2,
						attrs: { code: "x".repeat(480 * 1024) },
					},
				],
			}),
		),
	).toBe("CANONICAL_DOCUMENT_BUDGET");
	expect(await f.t.run((ctx) => ctx.db.get("posts", f.ids.post))).toEqual(
		before,
	);
	expect(
		await f.t.run((ctx) => ctx.db.query("revisions").collect()),
	).toHaveLength(0);
});

test("normal empty draft with exact redundant autosave can initialize; distinct autosave and stale digest remain protected", async () => {
  const f = await fixture();
  await f.t.run(async ctx => {
    const post = await ctx.db.get("posts", f.ids.post);
    await ctx.db.patch("posts", f.ids.post, { autosaveTitle: post!.title, autosaveContent: "", autosavedAt: 42 });
  });
  const read = await f.client.query(reference("get"), { postId: f.ids.post });
  expect(read.initialization).toEqual({ eligible: true, reason: null });
  const args = { postId: f.ids.post, expectedRevision: read.document.revision, expectedAuthoringDigest: read.document.authoringDigest, title: read.document.title, blocks: [] };
  await f.t.run(async ctx => { await ctx.db.patch("posts", f.ids.post, { autosaveTitle: "Distinct unsaved title" }); });
  const distinct = await f.client.query(reference("get"), { postId: f.ids.post });
  expect(distinct.initialization).toEqual({ eligible: false, reason: "existing-authored-content" });
  await expect(f.client.mutation(reference("initialize", "mutation"), args)).rejects.toThrow();
  await f.t.run(async ctx => { await ctx.db.patch("posts", f.ids.post, { autosaveTitle: read.document.title }); });
  const receipt = await f.client.mutation(reference("initialize", "mutation"), args);
  expect(receipt.revision).toBe(1);
  const stored = await f.t.run(async ctx => ({ post: await ctx.db.get("posts", f.ids.post), revisions: await ctx.db.query("revisions").collect() }));
  expect(stored.post!.blocksVersion).toBe(2);
  expect(stored.post!.autosaveTitle).toBeUndefined();
  expect(stored.revisions).toHaveLength(1);
  expect(stored.revisions[0].title).toBe(read.document.title);
  expect(stored.revisions[0].content).toBe("");
});

test("reviewed authored article migration preserves marks and source history with exact CAS and candidate binding", async () => {
  const f = await fixture();
  const body = JSON.stringify({ type: "doc", content: [{ type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "A field note", marks: [{ type: "italic" }] }] }, { type: "paragraph", content: [{ type: "text", text: "Keep this", marks: [{ type: "bold" }] }, { type: "hardBreak" }, { type: "text", text: "exact prose" }] }] });
  await f.t.run(async ctx => { await ctx.db.patch("posts", f.ids.post, { type: "post", contentMode: "blocks", content: body, excerpt: "Preserved summary", pagePrompt: "Original editorial direction" }); });
  const plan = await f.client.query(reference("prepareMigration"), { postId: f.ids.post });
  expect(plan.contract).toBe("canonical-migration-v1");
  expect(plan.candidate.document.blocks.map((block: { name: string }) => block.name)).toEqual(["core/heading", "core/paragraph"]);
  const args = { postId: f.ids.post, expectedRevision: plan.source.revision, expectedAuthoringDigest: plan.source.authoringDigest, expectedCandidateDigest: plan.candidate.document.digest, expectedPresentationRevision: plan.candidate.presentation.revision };
  await expect(f.client.mutation(reference("migrate", "mutation"), { ...args, expectedCandidateDigest: "0".repeat(64) })).rejects.toThrow();
  const receipt = await f.client.mutation(reference("migrate", "mutation"), args);
  expect(receipt.digest).toBe(plan.candidate.document.digest);
  const reopened = await f.client.query(reference("get"), { postId: f.ids.post });
  expect(reopened.document.blocks).toEqual(plan.candidate.document.blocks);
  const stored = await f.t.run(async ctx => ({ post: await ctx.db.get("posts", f.ids.post), history: await ctx.db.query("revisions").collect() }));
  expect(stored.post!.excerpt).toBe("Preserved summary");
  expect(stored.post!.pagePrompt).toBe("Original editorial direction");
  expect(stored.history).toHaveLength(1);
  expect(stored.history[0].content).toBe(body);
  await expect(f.client.mutation(reference("migrate", "mutation"), args)).rejects.toThrow();
});

test("migration refuses unsafe precedence, unrepresented nodes, distinct autosaves, stale source and lost authority without writes", async () => {
  const f = await fixture();
  const content = JSON.stringify({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Original" }] }] });
  await f.t.run(async ctx => { await ctx.db.patch("posts", f.ids.post, { type: "post", contentMode: "article", content }); });
  const plan = await f.client.query(reference("prepareMigration"), { postId: f.ids.post });
  const args = { postId: f.ids.post, expectedRevision: plan.source.revision, expectedAuthoringDigest: plan.source.authoringDigest, expectedCandidateDigest: plan.candidate.document.digest, expectedPresentationRevision: plan.candidate.presentation.revision };
  for (const patch of [{ hero: { content: "x".repeat(20001) } }, { autosaveTitle: "Unsaved title" }, { content: JSON.stringify({ type: "doc", content: [{ type: "table", content: [] }] }) }]) {
    await f.t.run(async ctx => { await ctx.db.patch("posts", f.ids.post, patch); });
    await expect(f.client.query(reference("prepareMigration"), { postId: f.ids.post })).rejects.toThrow();
    await f.t.run(async ctx => { await ctx.db.patch("posts", f.ids.post, { hero: undefined, autosaveTitle: undefined, content }); });
  }
  await f.t.run(async ctx => { await ctx.db.patch("posts", f.ids.post, { pagePrompt: "Changed after review" }); });
  await expect(f.client.mutation(reference("migrate", "mutation"), args)).rejects.toThrow();
  await expect(f.as(f.ids.denied).mutation(reference("migrate", "mutation"), args)).rejects.toThrow();
  const state = await f.t.run(async ctx => ({ post: await ctx.db.get("posts", f.ids.post), history: await ctx.db.query("revisions").collect() }));
  expect(state.post!.content).toBe(content);
  expect(state.post!.blocksVersion).toBeUndefined();
  expect(state.history).toHaveLength(0);
});

test("manual page and post saves reconcile only redundant autosaves before immediate canonical entry", async () => {
  for (const kind of ["page", "post"] as const) {
    const f = await fixture();
    await f.t.run(async ctx => { await ctx.db.patch("posts", f.ids.post, { type: kind, autosaveTitle: "Disposable draft", autosaveContent: "", autosavedAt: 42 }); });
    const update = makeFunctionReference<any, any, any>(`${kind === "page" ? "pages" : "posts"}/mutations:update`);
    const idArgs = kind === "page" ? { pageId: f.ids.post } : { postId: f.ids.post };
    await f.client.mutation(update, { ...idArgs, title: "Saved new title", content: "" });
    const read = await f.client.query(reference("get"), { postId: f.ids.post });
    expect(read.document.title).toBe("Saved new title");
    expect(read.initialization.eligible).toBe(true);
    let post = await f.t.run(ctx => ctx.db.get("posts", f.ids.post));
    expect(post!.autosaveTitle).toBeUndefined();
    expect(post!.autosavedAt).toBeUndefined();
    await f.t.run(async ctx => { await ctx.db.patch("posts", f.ids.post, { autosaveTitle: "Another unsaved draft", autosaveContent: "Unsaved distinct body", autosavedAt: 43 }); });
    await f.client.mutation(update, { ...idArgs, title: "Saved again", content: "" });
    post = await f.t.run(ctx => ctx.db.get("posts", f.ids.post));
    expect(post!.autosaveTitle).toBe("Another unsaved draft");
    expect(post!.autosaveContent).toBe("Unsaved distinct body");
    expect(post!.autosavedAt).toBe(43);
    expect((await f.client.query(reference("get"), { postId: f.ids.post })).initialization.eligible).toBe(false);
  }
});

test("public canonical ready data is separate, strips editorial locks, and refuses draft or private content", async () => {
  const f = await fixture();
  await initialize(f);
  expect(await f.t.query(reference("getForRender"), { postId: f.ids.post })).toBeNull();
  await f.t.run(async ctx => { const post = await ctx.db.get("posts", f.ids.post); await ctx.db.patch("posts", f.ids.post, { status: "publish", blocks: (post!.blocks ?? []).map(block => ({ ...block, lock: { edit: true, move: true, remove: true } })) }); });
  const ready = await f.t.query(reference("getForRender"), { postId: f.ids.post });
  expect(ready.contract).toBe("canonical-public-document-v1");
  expect(ready.state).toBe("ready");
  expect(ready.viewerSubject).toBeNull();
  expect(ready.document.status).toBeUndefined();
  expect(ready.document.blocks[0].lock).toBeUndefined();
  expect(ready.document.title).toBe("Disposable draft");
  await f.t.run(async ctx => { await ctx.db.patch("posts", f.ids.post, { visibility: "private" }); });
  expect(await f.t.query(reference("getForRender"), { postId: f.ids.post })).toBeNull();
  await f.t.run(async ctx => {
    const user = await ctx.db.get("users", f.ids.user);
    const role = await ctx.db.get("roles", user!.roleId!);
    await ctx.db.patch("roles", role!._id, { capabilities: [...role!.capabilities, "page.read_private"] });
  });
  expect((await f.client.query(reference("getForRender"), { postId: f.ids.post })).state).toBe("ready");
});

test("public canonical passwords are verified server-side; denied result contains no tree, resources or body reads", async () => {
  const f = await fixture();
  await initialize(f);
  await f.t.run(async ctx => {
    await ctx.db.patch("posts", f.ids.post, { status: "publish", visibility: "password", password: "fixture-password", excerpt: "Protected excerpt" });
    const setting = await ctx.db.query("settings").withIndex("by_section", q => q.eq("section", "appearance.template")).unique();
    await ctx.db.patch("settings", setting!._id, { values: { tooLarge: "x".repeat(530000) } });
  });
  const denied = await f.t.query(reference("getForRender"), { postId: f.ids.post, password: "wrong" });
  expect(denied.state).toBe("restricted");
  expect(denied.restriction).toEqual({ password: true, membership: false });
  expect(denied.document.excerpt).toBeNull();
  expect(denied.document.blocks).toBeUndefined();
  expect(denied.resources).toBeUndefined();
  expect(denied.data).toBeUndefined();
  await expect(f.t.query(reference("getForRender"), { postId: f.ids.post, passwordVerified: true })).rejects.toThrow();
  await expect(f.t.query(reference("getForRender"), { postId: f.ids.post, password: "fixture-password" })).rejects.toThrow();
  await f.t.run(async ctx => {
    const setting = await ctx.db.query("settings").withIndex("by_section", q => q.eq("section", "appearance.template")).unique();
    await ctx.db.patch("settings", setting!._id, { values: { active: "core", overrides: {}, variants: {}, settings: {} } });
  });
  const unlocked = await f.t.query(reference("getForRender"), { postId: f.ids.post, password: "fixture-password" });
  expect(unlocked.state).toBe("ready");
  expect(unlocked.document.password).toBeUndefined();
});

test("public canonical membership requires an actual current grant and revocation removes all body resources", async () => {
  const f = await fixture();
  await initialize(f);
  const grant = await f.t.run(async ctx => {
    await ctx.db.patch("posts", f.ids.post, { status: "publish", excerpt: "Allowed teaser" });
    const plugin = await ctx.db.query("settings").withIndex("by_section", q => q.eq("section", "plugins")).unique();
    await ctx.db.patch("settings", plugin!._id, { values: { membershipEnabled: true } });
    const plan = await ctx.db.insert("membership_plans", { title: "Fixture", slug: "fixture", status: "active", grantMode: "manual", priority: 1, createdAt: 1, updatedAt: 1 });
    await ctx.db.insert("membership_restriction_rules", { resourceType: "page", resourceIdOrKey: f.ids.post, ruleMode: "allow_only", planIds: [plan], teaserMode: "excerpt", loginRequired: true, createdAt: 1, updatedAt: 1 });
    return ctx.db.insert("membership_grants", { userId: f.ids.denied, planId: plan, sourceType: "manual", status: "active", startsAt: 1, createdAt: 1, updatedAt: 1 });
  });
  const denied = await f.t.query(reference("getForRender"), { postId: f.ids.post });
  expect(denied.state).toBe("restricted");
  expect(denied.document.excerpt).toBe("Allowed teaser");
  expect(denied.data).toBeUndefined();
  const member = f.as(f.ids.denied);
  const admitted = await member.query(reference("getForRender"), { postId: f.ids.post, refreshKey: "fresh_authenticated_read" });
  expect(admitted.state).toBe("ready");
  expect(admitted.viewerSubject).toBe(String(f.ids.denied));
  await expect(member.query(reference("getForRender"), { postId: f.ids.post, refreshKey: "invalid/key" })).rejects.toThrow();
  await f.t.run(async ctx => { await ctx.db.patch("membership_grants", grant, { status: "revoked" }); });
  const revoked = await member.query(reference("getForRender"), { postId: f.ids.post });
  expect(revoked.state).toBe("restricted");
  expect(revoked.viewerSubject).toBe(String(f.ids.denied));
  expect(revoked.document.blocks).toBeUndefined();
  expect(revoked.resources).toBeUndefined();
});

test("canonical publication is capability/CAS guarded and published content remains editable and publicly renderable", async () => {
  const f = await fixture();
  const initial = await initialize(f);
  const publication = { postId: f.ids.post, expectedRevision: initial.revision, status: "publish" };
  await expect(f.client.mutation(reference("setPublication", "mutation"), publication)).rejects.toThrow();
  await f.t.run(async ctx => {
    const user = await ctx.db.get("users", f.ids.user);
    const role = await ctx.db.get("roles", user!.roleId!);
    await ctx.db.patch("roles", role!._id, { capabilities: [...role!.capabilities, "page.publish"] });
  });
  const published = await f.client.mutation(reference("setPublication", "mutation"), publication);
  expect(published.revision).toBe(initial.revision + 1);
  expect((await f.t.query(reference("getForRender"), { postId: f.ids.post })).state).toBe("ready");
  let current = await f.client.query(reference("get"), { postId: f.ids.post });
  expect(current.document.status).toBe("publish");
  const saved = await f.client.mutation(reference("save", "mutation"), { postId: f.ids.post, expectedRevision: published.revision, title: "Updated published title", blocks: current.document.blocks });
  current = await f.t.query(reference("getForRender"), { postId: f.ids.post });
  expect(current.document.title).toBe("Updated published title");
  await expect(f.client.mutation(reference("setPublication", "mutation"), publication)).rejects.toThrow();
  const draft = await f.client.mutation(reference("setPublication", "mutation"), { postId: f.ids.post, expectedRevision: saved.revision, status: "draft" });
  expect(draft.revision).toBe(saved.revision + 1);
  expect(await f.t.query(reference("getForRender"), { postId: f.ids.post })).toBeNull();
});

test("legacy publication metadata writers cannot expose canonical content or change its scheduled deadline", async () => {
  const f = await fixture();
  await initialize(f);
  for (const patch of [{ visibility: "private" }, { visibility: "password", password: "other" }, { scheduledAt: Date.now() + 100000 }, { status: "publish" }]) {
    const outcome = await code(() => f.client.mutation(makeFunctionReference<any, any, any>("pages/mutations:update"), { pageId: f.ids.post, ...patch }));
    expect({ patch, denied: outcome !== null }).toEqual({ patch, denied: true });
  }
  const post = await f.t.run(ctx => ctx.db.get("posts", f.ids.post));
  expect(post!.status).toBe("draft");
  expect(post!.visibility).toBe("public");
  expect(post!.password).toBeUndefined();
  expect(post!.scheduledAt).toBeUndefined();
});

test("canonical scheduling reopens the actual deadline and cancels superseded or withdrawn jobs", async () => {
  const f = await fixture();
  const initial = await initialize(f);
  await f.t.run(async ctx => {
    const user = await ctx.db.get("users", f.ids.user);
    const role = await ctx.db.get("roles", user!.roleId!);
    await ctx.db.patch("roles", role!._id, { capabilities: [...role!.capabilities, "page.publish"] });
  });
  const deadline = Date.now() + 3600000;
  const first = await f.client.mutation(reference("setPublication", "mutation"), { postId: f.ids.post, expectedRevision: initial.revision, status: "future", scheduledAt: deadline });
  const jobId = async () => f.t.run(async ctx => {
    const meta = await ctx.db.query("postMeta").withIndex("by_post_key", q => q.eq("postId", f.ids.post).eq("key", "_scheduled_fn")).unique();
    return JSON.parse(meta!.value).functionId;
  });
  const firstJob = await jobId();
  const opened = await f.client.query(reference("get"), { postId: f.ids.post });
  expect(opened.document.status).toBe("future");
  expect(opened.document.scheduledAt).toBe(deadline);
  expect(await f.t.query(reference("getForRender"), { postId: f.ids.post })).toBeNull();
  const second = await f.client.mutation(reference("setPublication", "mutation"), { postId: f.ids.post, expectedRevision: first.revision, status: "future", scheduledAt: deadline + 3600000 });
  const secondJob = await jobId();
  expect((await f.t.run(ctx => ctx.db.system.get(firstJob)))!.state.kind).toBe("canceled");
  expect((await f.t.run(ctx => ctx.db.system.get(secondJob)))!.state.kind).toBe("pending");
  await f.client.mutation(reference("setPublication", "mutation"), { postId: f.ids.post, expectedRevision: second.revision, status: "draft" });
  expect((await f.t.run(ctx => ctx.db.system.get(secondJob)))!.state.kind).toBe("canceled");
  expect((await f.client.query(reference("get"), { postId: f.ids.post })).document.scheduledAt).toBeNull();
});

test("canonical scheduled execution validates the current body, exact deadline and author before publishing once", async () => {
  const f = await fixture();
  const initial = await initialize(f);
  const deadline = Date.now() - 1000;
  const run = (expectedScheduledAt?: number) => f.t.mutation(makeFunctionReference<any, any, any>("posts/internals:publishScheduled"), { postId: f.ids.post, ...(expectedScheduledAt === undefined ? {} : { expectedScheduledAt }) });
  await f.t.run(ctx => ctx.db.patch("posts", f.ids.post, { status: "future", scheduledAt: deadline }));
  await run();
  await run(deadline - 1);
  expect((await f.t.run(ctx => ctx.db.get("posts", f.ids.post)))!.status).toBe("future");
  await f.t.run(ctx => ctx.db.patch("users", f.ids.user, { status: "banned" }));
  await expect(run(deadline)).rejects.toThrow();
  expect((await f.t.run(ctx => ctx.db.get("posts", f.ids.post)))!.blocksRevision).toBe(initial.revision);
  await f.t.run(ctx => ctx.db.patch("users", f.ids.user, { status: "active" }));
  const original = await f.t.run(ctx => ctx.db.get("posts", f.ids.post));
  await f.t.run(ctx => ctx.db.patch("posts", f.ids.post, { blocks: [{ id: "invalid", name: "unknown/unsafe", version: 1, attrs: {} }] }));
  await expect(run(deadline)).rejects.toThrow();
  expect((await f.t.run(ctx => ctx.db.get("posts", f.ids.post)))!.status).toBe("future");
  await f.t.run(ctx => ctx.db.patch("posts", f.ids.post, { blocks: original!.blocks }));
  await run(deadline);
  const published = await f.t.run(ctx => ctx.db.get("posts", f.ids.post));
  expect(published!.status).toBe("publish");
  expect(published!.blocksRevision).toBe(initial.revision + 1);
  expect((await f.t.query(reference("getForRender"), { postId: f.ids.post })).state).toBe("ready");
  await run(deadline);
  expect(await f.t.run(ctx => ctx.db.get("posts", f.ids.post))).toEqual(published);
});

test("publication rolls back the document and history if complete listener inventory exceeds budget", async () => {
  const f = await fixture();
  const initial = await initialize(f);
  await f.t.run(async ctx => {
    const user = await ctx.db.get("users", f.ids.user);
    const role = await ctx.db.get("roles", user!.roleId!);
    await ctx.db.patch("roles", role!._id, { capabilities: [...role!.capabilities, "page.publish"] });
    for (let i = 0; i < 1001; i++) await ctx.db.insert("eventListeners", { eventCode: "unrelated.event", name: `Fixture ${i}`, handlerModule: "unused", handlerFunction: "unused", handlerType: "internal", priority: 10, isActive: true, maxRetries: 0, retryDelayMs: 0, retryBackoff: "linear", system: "fixture", createdAt: 1, updatedAt: 1 });
  });
  const before = await f.t.run(async ctx => ({ post: await ctx.db.get("posts", f.ids.post), revisions: await ctx.db.query("revisions").collect(), events: await ctx.db.query("events").collect() }));
  expect(await code(() => f.client.mutation(reference("setPublication", "mutation"), { postId: f.ids.post, expectedRevision: initial.revision, status: "publish" }))).toBe("EVENT_LISTENER_BUDGET");
  expect(await f.t.run(async ctx => ({ post: await ctx.db.get("posts", f.ids.post), revisions: await ctx.db.query("revisions").collect(), events: await ctx.db.query("events").collect() }))).toEqual(before);
});

test("canonical duplication copies complete authoring and grouped restrictions as a fresh draft through both APIs", async () => {
  const f = await fixture();
  const initial = await initialize(f);
  await f.t.run(async ctx => {
    const user = await ctx.db.get("users", f.ids.user);
    const role = await ctx.db.get("roles", user!.roleId!);
    await ctx.db.patch("roles", role!._id, { capabilities: [...role!.capabilities, "post.duplicate"] });
    await ctx.db.patch("posts", f.ids.post, { status: "private", password: "protected-copy", pagePrompt: "Keep this prompt", layoutId: "authored-layout", scheduledAt: 100, publishedAt: 50 });
    await ctx.db.insert("postMeta", { postId: f.ids.post, key: "seo", value: "Keep metadata" });
    await ctx.db.insert("postMeta", { postId: f.ids.post, key: "_scheduled_fn", value: "Do not copy job" });
    await ctx.db.insert("fieldValues", { entityType: "page", entityId: String(f.ids.post), fieldKey: "intro", fieldName: "intro", value: "Authored field", updatedBy: "source", updatedAt: 1 });
    for (const target of [{ resourceType: "page", resourceIdOrKey: String(f.ids.post) }, { resourceType: "route", resourceIdOrKey: "/draft" }]) await ctx.db.insert("membership_restriction_rules", { ...target, ruleMode: "allow_only", planIds: [], requiredCapabilities: [target.resourceType === "page" ? "direct.access" : "route.access"], teaserMode: "hide", loginRequired: true, createdAt: 1, updatedAt: 1 });
  });
  const before = await f.t.run(ctx => ctx.db.get("posts", f.ids.post));
  const listing = await f.client.query(makeFunctionReference<any, any, any>("posts/queries:list"), { type: "page" });
  expect(listing.posts.find((post: any) => post._id === f.ids.post)).toMatchObject({ blocksVersion: 2, blocksRevision: initial.revision });
  const copied = await f.client.mutation(reference("duplicate", "mutation"), { postId: f.ids.post, expectedRevision: initial.revision });
  expect(copied.postId === f.ids.post).toBe(false);
  expect(copied.revision).toBe(1);
  const opened = await f.client.query(reference("get"), { postId: copied.postId });
  expect(opened.document.blocks).toEqual(before!.blocks);
  expect(opened.document.digest).toBe(copied.digest);
  expect(opened.document.status).toBe("draft");
  const state = await f.t.run(async ctx => ({ post: await ctx.db.get("posts", copied.postId), meta: await ctx.db.query("postMeta").withIndex("by_post", q => q.eq("postId", copied.postId)).collect(), rules: await ctx.db.query("membership_restriction_rules").withIndex("by_resource", q => q.eq("resourceType", "page").eq("resourceIdOrKey", copied.postId)).collect(), fields: await ctx.db.query("fieldValues").withIndex("by_entity", q => q.eq("entityType", "page").eq("entityId", copied.postId)).collect() }));
  expect(state.post).toMatchObject({ blocksVersion: 2, blocksRevision: 1, contentMode: "blocks", pagePrompt: "Keep this prompt", layoutId: "authored-layout", visibility: "private", password: "protected-copy", authorId: f.ids.user });
  expect(state.post!.scheduledAt).toBeUndefined();
  expect(state.post!.publishedAt).toBeUndefined();
  expect(state.meta.map(row => row.key)).toEqual(["seo"]);
  expect(state.fields[0].value).toBe("Authored field");
  expect(state.rules).toHaveLength(2);
  expect(new Set(state.rules.map(row => row.policyGroup)).size).toBe(2);
  expect(await f.t.run(ctx => ctx.db.get("posts", f.ids.post))).toEqual(before);
  const secondId = await f.client.mutation(makeFunctionReference<any, any, any>("posts/mutations:duplicate"), { postId: f.ids.post, expectedRevision: initial.revision });
  expect((await f.t.run(ctx => ctx.db.get("posts", secondId)))!.blocksVersion).toBe(2);
  await expect(f.client.mutation(makeFunctionReference<any, any, any>("posts/mutations:duplicate"), { postId: f.ids.post })).rejects.toThrow();
});

test("canonical duplication refuses missing capability, stale revision and incomplete metadata without inserts", async () => {
  const f = await fixture();
  const initial = await initialize(f);
  const args = { postId: f.ids.post, expectedRevision: initial.revision };
  await expect(f.client.mutation(reference("duplicate", "mutation"), args)).rejects.toThrow();
  await f.t.run(async ctx => {
    const user = await ctx.db.get("users", f.ids.user);
    const role = await ctx.db.get("roles", user!.roleId!);
    await ctx.db.patch("roles", role!._id, { capabilities: [...role!.capabilities, "post.duplicate"] });
  });
  expect(await code(() => f.client.mutation(reference("duplicate", "mutation"), { ...args, expectedRevision: initial.revision - 1 }))).toBe("CONFLICT");
  await f.t.run(async ctx => { for (let i = 0; i < 257; i++) await ctx.db.insert("postMeta", { postId: f.ids.post, key: `extra-${i}`, value: "Data" }); });
  await expect(f.client.mutation(reference("duplicate", "mutation"), args)).rejects.toThrow();
  expect(await f.t.run(ctx => ctx.db.query("posts").collect())).toHaveLength(1);
});

test("canonical duplication rolls back a copied unavailable custom-field attachment and retains its source", async () => {
  const f = await fixture();
  const initial = await initialize(f);
  await f.t.run(async ctx => {
    const user = await ctx.db.get("users", f.ids.user);
    const role = await ctx.db.get("roles", user!.roleId!);
    await ctx.db.patch("roles", role!._id, { capabilities: [...role!.capabilities, "post.duplicate"] });
    const media = await ctx.db.insert("media", { title: "Unavailable", fileName: "fixture.png", slug: "fixture", url: "https://example.invalid/fixture.png", mimeType: "image/png", fileSize: 68, mediaType: "image", status: "trashed", uploadedBy: f.ids.user, createdAt: 1, updatedAt: 1 });
    await ctx.db.insert("fieldValues", { entityType: "page", entityId: String(f.ids.post), fieldKey: "image", fieldName: "image", value: JSON.stringify(media), updatedBy: "source", updatedAt: 1 });
  });
  const before = await f.t.run(async ctx => ({ posts: await ctx.db.query("posts").collect(), fields: await ctx.db.query("fieldValues").collect(), events: await ctx.db.query("events").collect() }));
  expect(await code(() => f.client.mutation(reference("duplicate", "mutation"), { postId: f.ids.post, expectedRevision: initial.revision }))).toBe("MEDIA_UNAVAILABLE");
  expect(await f.t.run(async ctx => ({ posts: await ctx.db.query("posts").collect(), fields: await ctx.db.query("fieldValues").collect(), events: await ctx.db.query("events").collect() }))).toEqual(before);
});

test("migration recovery restores original authoring and supports exact-source canonical undo without revision ABA", async () => {
  const f = await fixture();
  const originalContent = JSON.stringify({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Original marked recovery", marks: [{ type: "bold" }] }] }] });
  const protectedRule = await f.t.run(ctx => ctx.db.insert("membership_restriction_rules", { resourceType: "page", resourceIdOrKey: String(f.ids.post), ruleMode: "deny_if_missing", planIds: [], requiredCapabilities: ["private.reader"], teaserMode: "hide", loginRequired: true, createdAt: 1, updatedAt: 1 }));
  const originalPolicy = await f.t.run(ctx => ctx.db.get("membership_restriction_rules", protectedRule));
  await f.t.run(async ctx => {
    await ctx.db.patch("posts", f.ids.post, { contentMode: "article", content: originalContent, pagePrompt: "Original prompt", layoutId: "original-layout", hideFooter: true, excerpt: "Original excerpt" });
    const user = await ctx.db.get("users", f.ids.user);
    const role = await ctx.db.get("roles", user!.roleId!);
    await ctx.db.patch("roles", role!._id, { capabilities: [...role!.capabilities, "page.publish"] });
  });
  const review = await f.client.query(reference("prepareMigration"), { postId: f.ids.post });
  const migrated = await f.client.mutation(reference("migrate", "mutation"), { postId: f.ids.post, expectedRevision: review.source.revision, expectedAuthoringDigest: review.source.authoringDigest, expectedCandidateDigest: review.candidate.document.digest, expectedPresentationRevision: review.candidate.presentation.revision });
  const history = await f.client.query(reference("pageRevisions"), { postId: f.ids.post, paginationOpts: { cursor: null, numItems: 20 } });
  const original = history.page.find((row: any) => row.blocksVersion !== 2);
  expect(original.action).toBe("recover-legacy");
  expect(original.restorable).toBe(true);
  await f.t.run(ctx => ctx.db.patch("posts", f.ids.post, { status: "private", password: "Current secret", path: "/current-route" }));
  const recovered = await f.client.mutation(reference("recoverLegacy", "mutation"), { postId: f.ids.post, revisionId: original.id, expectedRevision: migrated.revision });
  expect(recovered.blocksVersion).toBe(1);
  expect(recovered.revision).toBe(migrated.revision + 1);
  const post = await f.t.run(ctx => ctx.db.get("posts", f.ids.post));
  expect(post).toMatchObject({ content: originalContent, contentMode: "article", pagePrompt: "Original prompt", layoutId: "original-layout", hideFooter: true, excerpt: "Original excerpt", status: "private", password: "Current secret", path: "/current-route", blocksVersion: 1, blocksRevision: recovered.revision });
  const legacy = await f.client.query(reference("get"), { postId: f.ids.post });
  expect(legacy.contract).toBe("canonical-initialization-v1");
  expect(legacy.document.authoringDigest).toBe(recovered.authoringDigest);
  expect(legacy.initialization.reason).toBe("not-draft");
  const after = await f.client.query(reference("pageRevisions"), { postId: f.ids.post, paginationOpts: { cursor: null, numItems: 20 } });
  const canonical = after.page.find((row: any) => row.action === "restore-canonical");
  expect(canonical).toBeDefined();
  const restore = { postId: f.ids.post, revisionId: canonical.id, expectedRevision: recovered.revision, expectedAuthoringDigest: recovered.authoringDigest };
  await f.t.run(ctx => ctx.db.patch("posts", f.ids.post, { content: JSON.stringify({ type: "doc", content: [] }) }));
  expect(await code(() => f.client.mutation(reference("restore", "mutation"), restore))).toBe("CONFLICT");
  const fresh = await f.client.query(reference("get"), { postId: f.ids.post });
  const restored = await f.client.mutation(reference("restore", "mutation"), { ...restore, expectedAuthoringDigest: fresh.document.authoringDigest });
  expect(restored.revision).toBe(recovered.revision + 1);
  const reopened = await f.client.query(reference("get"), { postId: f.ids.post });
  expect(reopened.document.blocks).toEqual(review.candidate.document.blocks);
  expect(reopened.document.status).toBe("private");
  expect((await f.t.run(ctx => ctx.db.get("posts", f.ids.post)))!.password).toBe("Current secret");
  expect(await f.t.run(ctx => ctx.db.get("membership_restriction_rules", protectedRule))).toEqual(originalPolicy);
});

test("legacy recovery refuses stale source, unrelated or unrepresented history and revoked restore capability without writes", async () => {
  const f = await fixture();
  const first = await initialize(f);
  const revision = await f.t.run(async ctx => ctx.db.insert("revisions", { parentId: f.ids.post, parentType: "page", snapshotVersion: 2, title: "Unsafe legacy", content: "<script>not a supported editor document</script>", contentMode: "article", blocksVersion: 1, authorId: f.ids.user, revisionNumber: 20, type: "manual", changedFields: ["content"], contentLength: 52, createdAt: 1 }));
  const args = { postId: f.ids.post, revisionId: revision, expectedRevision: first.revision };
  const before = await f.t.run(async ctx => ({ post: await ctx.db.get("posts", f.ids.post), revisions: await ctx.db.query("revisions").collect() }));
  expect(await code(() => f.client.mutation(reference("recoverLegacy", "mutation"), { ...args, expectedRevision: 0 }))).toBe("CONFLICT");
  await expect(f.client.mutation(reference("recoverLegacy", "mutation"), args)).rejects.toThrow();
  expect(await f.t.run(async ctx => ({ post: await ctx.db.get("posts", f.ids.post), revisions: await ctx.db.query("revisions").collect() }))).toEqual(before);
  await f.t.run(async ctx => {
    const user = await ctx.db.get("users", f.ids.user);
    const role = await ctx.db.get("roles", user!.roleId!);
    await ctx.db.patch("roles", role!._id, { capabilities: role!.capabilities.filter(value => value !== "revision.restore") });
  });
  await expect(f.client.mutation(reference("recoverLegacy", "mutation"), args)).rejects.toThrow();
  expect(await f.t.run(async ctx => ({ post: await ctx.db.get("posts", f.ids.post), revisions: await ctx.db.query("revisions").collect() }))).toEqual(before);
});

test("registered canonical get resolves navigation from the current saved title and authoritatively public settings", async () => {
 const f=await fixture();
 const first=await initialize(f);
 const navigation=[
  {id:"heading",name:"core/heading",version:2,attrs:{text:{type:"doc",content:[{type:"paragraph",content:[{type:"text",text:"Current heading"}]}]},anchor:"current-heading"}},
  ...["core/breadcrumbs","core/anchor-nav","core/table-of-contents","core/site-info","core/child-pages"].map((name,index)=>({id:`nav${index}`,name,version:1,attrs:{}})),
 ];
 await f.t.run(async ctx=>{await ctx.db.insert("settings",{section:"general",values:{siteTitle:"Actual installation",tagline:"Public tagline",privateKey:"must-never-project"},updatedAt:1,updatedBy:f.ids.user});});
 const saved=await f.client.mutation(reference("save","mutation"),{postId:f.ids.post,expectedRevision:first.revision,title:"Prepared current title",blocks:navigation});
 const current=await f.client.query(reference("get"),{postId:f.ids.post});
 expect(current.document.revision).toBe(saved.revision);
 expect(current.data.dataByBlock.nav0.resolver).toBe("content.breadcrumbs");
 expect(current.data.dataByBlock.nav0.data.items.at(-1).label).toBe("Prepared current title");
 expect(current.data.dataByBlock.nav2.data.items).toEqual([{label:"Current heading",anchor:"current-heading",level:2}]);
 expect(current.data.dataByBlock.nav3.data).toEqual({name:"Actual installation",tagline:"Public tagline",logo:null});
 expect(current.data.dataByBlock.nav4.data).toEqual({parentLabel:"Prepared current title",items:[]});
 expect(JSON.stringify(current.data).includes("must-never-project")).toBe(false);
 expect(await code(()=>f.as(f.ids.denied).query(reference("get"),{postId:f.ids.post}))).toBe("FORBIDDEN");
});

test('canonical menu references and locations save, publish and recheck viewer visibility through registered endpoints',async()=>{
 const f=await fixture();const first=await initialize(f);
 const menu=await f.t.run(async ctx=>{
  const user=await ctx.db.get('users',f.ids.user),role=await ctx.db.get('roles',user!.roleId!);
  await ctx.db.patch('roles',role!._id,{capabilities:[...role!.capabilities,'page.publish']});
  const menu=await ctx.db.insert('menus',{name:'Site navigation',slug:'site-navigation',description:'PRIVATE_EDITOR_NOTES',createdBy:f.ids.user,createdAt:1,updatedAt:1});
  await ctx.db.insert('menuLocations',{slug:'primary',name:'Primary',menuId:menu,createdAt:1,updatedAt:1});
  await ctx.db.insert('menuItems',{menuId:menu,itemType:'custom',label:'Visit',url:'/page/visit',position:0,createdAt:1,updatedAt:1});
  await ctx.db.insert('menuItems',{menuId:menu,itemType:'custom',label:'Account',url:'/dashboard',visibility:'signedIn',position:1,createdAt:1,updatedAt:1});
  return menu;
 });
 const options=await f.client.query(reference('menuOptions'),{postId:f.ids.post,paginationOpts:{cursor:null,numItems:20}});
 expect(options.page).toEqual([{id:menu,name:'Site navigation',slug:'site-navigation'}]);
 expect(await code(()=>f.as(f.ids.denied).query(reference('menuOptions'),{postId:f.ids.post,paginationOpts:{cursor:null,numItems:20}}))).toBe('FORBIDDEN');
 const blocks=[{id:'selected',name:'core/menu',version:1,attrs:{source:'menu',menu}},{id:'location',name:'core/menu',version:1,attrs:{source:'location',location:'primary'}}];
 const saved=await f.client.mutation(reference('save','mutation'),{postId:f.ids.post,expectedRevision:first.revision,title:'Menu integration',blocks});
 const current=await f.client.query(reference('get'),{postId:f.ids.post});
 expect(current.data.dataByBlock.selected.data.menu.id).toBe(menu);
 expect(current.data.dataByBlock.location.data.items.map((item:any)=>item.label)).toEqual(['Visit','Account']);
 await f.client.mutation(reference('setPublication','mutation'),{postId:f.ids.post,expectedRevision:saved.revision,status:'publish'});
 const publicRead=await f.t.query(reference('getForRender'),{postId:f.ids.post});
 expect(publicRead.state).toBe('ready');
 expect(publicRead.data.dataByBlock.selected.data.items.map((item:any)=>item.label)).toEqual(['Visit']);
 expect(JSON.stringify(publicRead)).not.toContain('PRIVATE_EDITOR_NOTES');
 await f.t.run(ctx=>ctx.db.insert('menuItems',{menuId:menu,itemType:'custom',label:'Section label',url:'#',position:2,createdAt:1,updatedAt:1}));
 const placeholder=await f.t.query(reference('getForRender'),{postId:f.ids.post});
 expect(placeholder.data.dataByBlock.selected.data.items.at(-1)).toMatchObject({kind:'heading',label:'Section label',href:null});
 await f.t.run(ctx=>ctx.db.delete('menus',menu));
 const removed=await f.t.query(reference('getForRender'),{postId:f.ids.post});
 expect(removed.data.dataByBlock.selected.data).toEqual({menu:null,items:[]});
});

test('latest posts use authorized taxonomy choices and survive canonical save, publication and source revocation',async()=>{
 const f=await fixture(),first=await initialize(f);
 const source=await f.t.run(async ctx=>{
  const user=await ctx.db.get('users',f.ids.user),role=await ctx.db.get('roles',user!.roleId!);
  await ctx.db.patch('roles',role!._id,{capabilities:[...role!.capabilities,'page.publish']});
  const add=(name:string,taxonomy:'category'|'post_tag')=>ctx.db.insert('terms',{name,slug:name.toLowerCase(),taxonomy,count:100,isDefault:false,createdAt:1,updatedAt:1,description:'PRIVATE_TERM_NOTES'});
  const category=await add('Field','category');await add('Garden','category');await add('Studio','category');await add('Field','post_tag');
  const post=await ctx.db.insert('posts',{type:'post',title:'A real source story',slug:'source-story',status:'publish',visibility:'public',authorId:f.ids.user,content:'PRIVATE_BODY',excerpt:'An exact public excerpt',commentStatus:'closed',publishedAt:10,createdAt:1,updatedAt:1});
  await ctx.db.insert('termRelationships',{postId:post,termId:category});return post;
 });
 const opts={postId:f.ids.post,taxonomy:'category',paginationOpts:{cursor:null,numItems:2}};
 const choices=await f.client.query(reference('termOptions'),opts);
 expect(choices.page.map((item:any)=>item.slug)).toEqual(['field','garden']);expect(choices.isDone).toBe(false);
 const next=await f.client.query(reference('termOptions'),{...opts,paginationOpts:{cursor:choices.continueCursor,numItems:2}});
 expect(next.page.map((item:any)=>item.slug)).toEqual(['studio']);
 expect(JSON.stringify(choices)).not.toContain('PRIVATE_TERM_NOTES');
 expect(await code(()=>f.as(f.ids.denied).query(reference('termOptions'),opts))).toBe('FORBIDDEN');
 const blocks=[{id:'latest',name:'core/latest-posts',version:2,attrs:{heading:'Latest stories',categorySlug:'field',count:1,showAuthors:false}}];
 const saved=await f.client.mutation(reference('save','mutation'),{postId:f.ids.post,expectedRevision:first.revision,title:'Latest integration',blocks});
 await f.client.mutation(reference('setPublication','mutation'),{postId:f.ids.post,expectedRevision:saved.revision,status:'publish'});
 const result=await f.t.query(reference('getForRender'),{postId:f.ids.post});
 expect(result.state).toBe('ready');expect(result.data.dataByBlock.latest.resolver).toBe('content.latestPosts');
 expect(result.data.dataByBlock.latest.data.items).toEqual([{id:source,title:'A real source story',href:'/blog/source-story',excerpt:'An exact public excerpt',publishedAt:10,author:null,image:null}]);
 expect(JSON.stringify(result)).not.toContain('PRIVATE_BODY');
 await f.t.run(ctx=>ctx.db.patch('posts',source,{visibility:'private'}));
 const hidden=await f.t.query(reference('getForRender'),{postId:f.ids.post});
 expect(hidden.data.dataByBlock.latest.data.items).toEqual([]);
});

test('registered grids bind independent cursors to the current document and recheck visibility',async()=>{
 const f=await fixture(),first=await initialize(f);
 const sources=await f.t.run(async ctx=>{
  const user=await ctx.db.get('users',f.ids.user),role=await ctx.db.get('roles',user!.roleId!);
  await ctx.db.patch('roles',role!._id,{capabilities:[...role!.capabilities,'page.publish']});
  const ids=[];
  for(let n=0;n<5;n++) ids.push(await ctx.db.insert('posts',{type:'post',title:`Story ${n}`,slug:`grid-${n}`,content:'SOURCE_BODY_MUST_NOT_LEAK',excerpt:`Excerpt ${n}`,status:'publish',visibility:'public',authorId:f.ids.user,commentStatus:'closed',publishedAt:100+n,createdAt:1,updatedAt:1}));
  return ids;
 });
 const blocks=['one','two'].map(id=>({id,name:'core/post-grid',version:1,attrs:{query:{author:f.ids.user},limit:2,showExcerpt:false}}));
 const saved=await f.client.mutation(reference('save','mutation'),{postId:f.ids.post,expectedRevision:first.revision,title:'Two grids',blocks});
 await f.client.mutation(reference('setPublication','mutation'),{postId:f.ids.post,expectedRevision:saved.revision,status:'publish'});
 const initial=await f.t.query(reference('getForRender'),{postId:f.ids.post});
 expect(initial.state).toBe('ready');
 const ids=(value:any,key='one')=>value.data.dataByBlock[key].data.items.map((item:any)=>item.id);
 expect(ids(initial)).toEqual([sources[4],sources[3]]);
 const cursor=initial.data.dataByBlock.one.data.nextCursor;
 expect(typeof cursor).toBe('string');
 const request={one:cursor};
 const next=await f.t.query(reference('getForRender'),{postId:f.ids.post,request});
 expect(next.data.request).toEqual(request);
 expect(ids(next)).toEqual([sources[2],sources[1]]);
 expect(ids(next,'two')).toEqual([sources[4],sources[3]]);
 expect(next.data.dataByBlock.one.data.items.every((item:any)=>item.excerpt===null)).toBe(true);
 expect(JSON.stringify(next)).not.toContain('SOURCE_BODY_MUST_NOT_LEAK');
 await expect(f.t.query(reference('getForRender'),{postId:f.ids.post,request:{missing:cursor}})).rejects.toThrow();
 await expect(f.t.query(reference('getForRender'),{postId:f.ids.post,request:{one:'x'.repeat(4097)}})).rejects.toThrow();
 await f.t.run(ctx=>ctx.db.patch('posts',sources[2],{visibility:'private'}));
 expect(ids(await f.t.query(reference('getForRender'),{postId:f.ids.post,request}))).toEqual([sources[1],sources[0]]);
 await f.t.run(ctx=>ctx.db.patch('posts',f.ids.post,{status:'draft'}));
 expect(await f.t.query(reference('getForRender'),{postId:f.ids.post,request})).toBeNull();
});

test('author choices paginate public site identities without exposing account details',async()=>{
 const f=await fixture();
 await f.t.run(async ctx=>{
  await ctx.db.patch('users',f.ids.user,{displayName:'Public writer'});
  await ctx.db.insert('users',{authSource:'management',displayName:'Hidden controller',email:'PRIVATE_CONTROLLER_EMAIL',emailVerified:true,status:'active',createdAt:1,updatedAt:1});
  await ctx.db.insert('users',{authSource:'local',displayName:'Inactive writer',email:'PRIVATE_INACTIVE_EMAIL',emailVerified:true,status:'inactive',createdAt:1,updatedAt:1});
 });
 const opts={postId:f.ids.post,paginationOpts:{cursor:null as string|null,numItems:1}};
 const rows:Array<{id:string;displayName:string}>=[];
 for(let n=0;n<10;n++) {
  const result=await f.client.query(reference('authorOptions'),opts);
  expect(result.page.length).toBeLessThanOrEqual(1);rows.push(...result.page);
  if(result.isDone) break;opts.paginationOpts.cursor=result.continueCursor;
 }
 expect(rows.some(row=>row.displayName==='Public writer')).toBe(true);
 expect(rows.some(row=>row.displayName==='Hidden controller'||row.displayName==='Inactive writer')).toBe(false);
 for(const row of rows) expect(Object.keys(row).sort()).toEqual(['displayName','id']);
 await expect(f.t.query(reference('authorOptions'),opts)).rejects.toThrow();
 expect(await code(()=>f.as(f.ids.denied).query(reference('authorOptions'),opts))).toBe('FORBIDDEN');
});

test('Upcoming Events survives canonical save and public reads with exact plugin and source policy',async()=>{
 const f=await fixture(),first=await initialize(f);
 const event=await f.t.run(async ctx=>{
  const user=await ctx.db.get('users',f.ids.user),role=await ctx.db.get('roles',user!.roleId!);
  await ctx.db.patch('roles',role!._id,{capabilities:[...role!.capabilities,'page.publish']});
  const setting=await ctx.db.query('settings').withIndex('by_section',q=>q.eq('section','plugins')).unique();
  await ctx.db.patch('settings',setting!._id,{values:{eventsEnabled:true,membershipEnabled:false}});
  const startsAt=Date.now()+86400000;
  return ctx.db.insert('extension_events',{title:'Real studio gathering',slug:'studio-gathering',description:'An authored event summary',startsAt,endsAt:startsAt+3600000,timeZone:'America/Denver',venue:'Workroom',venueAddress:'PRIVATE_ADDRESS',registrationUrl:'https://private-registration.example.invalid',status:'published',createdBy:f.ids.user,createdAt:1,updatedAt:1});
 });
 const blocks=[{id:'gatherings',name:'events/upcoming',version:1,attrs:{count:1,showDescription:false}}];
 const saved=await f.client.mutation(reference('save','mutation'),{postId:f.ids.post,expectedRevision:first.revision,title:'Gatherings',blocks});
 await f.client.mutation(reference('setPublication','mutation'),{postId:f.ids.post,expectedRevision:saved.revision,status:'publish'});
 const shown=await f.t.query(reference('getForRender'),{postId:f.ids.post});
 expect(shown.state).toBe('ready');expect(shown.data.dataByBlock.gatherings.data.items[0]).toMatchObject({id:event,title:'Real studio gathering',href:'/events/studio-gathering',description:null});
 expect(JSON.stringify(shown)).not.toContain('PRIVATE_ADDRESS');expect(JSON.stringify(shown)).not.toContain('private-registration');
 await f.t.run(ctx=>ctx.db.patch('extension_events',event,{status:'draft'}));
 const hidden=await f.t.query(reference('getForRender'),{postId:f.ids.post});expect(hidden.data.dataByBlock.gatherings.data.items).toEqual([]);
 await f.t.run(async ctx=>{const setting=await ctx.db.query('settings').withIndex('by_section',q=>q.eq('section','plugins')).unique();await ctx.db.patch('settings',setting!._id,{values:{eventsEnabled:false,membershipEnabled:false}});});
 await expect(f.t.query(reference('getForRender'),{postId:f.ids.post})).rejects.toThrow();
});

test('event category choices are document-authorized, plugin-bound and return no event or audit payload',async()=>{
 const f=await fixture();
 const ids=await f.t.run(async ctx=>{
  const setting=await ctx.db.query('settings').withIndex('by_section',q=>q.eq('section','plugins')).unique();await ctx.db.patch(setting!._id,{values:{eventsEnabled:true}});
  const category=await ctx.db.insert('extension_event_categories',{name:'Workshops',slug:'workshops',createdAt:1,updatedAt:1});
  await ctx.db.insert('terms',{name:'Blog category',slug:'workshops',taxonomy:'category',count:0,isDefault:false,createdAt:1,updatedAt:1});
  return {category,settings:setting!._id};
 });
 const args={postId:f.ids.post,paginationOpts:{cursor:null,numItems:20}};
 await expect(f.t.query(reference('eventCategoryOptions'),args)).rejects.toThrow();
 await expect(f.as(f.ids.denied).query(reference('eventCategoryOptions'),args)).rejects.toThrow();
 const result=await f.client.query(reference('eventCategoryOptions'),args);
 expect(result.page).toEqual([{id:ids.category,name:'Workshops',slug:'workshops'}]);
 await f.t.run(ctx=>ctx.db.patch('settings',ids.settings,{values:{eventsEnabled:false}}));
 await expect(f.client.query(reference('eventCategoryOptions'),args)).rejects.toThrow('Enable Events');
});
test('the registered Next Event query binds category, source status and the published page',async()=>{
 const f=await fixture();
 const selected=await f.t.run(async ctx=>{
  const user=await ctx.db.get(f.ids.user);await ctx.db.patch(user!.roleId!,{capabilities:['page.update','page.publish']});
  const setting=await ctx.db.query('settings').withIndex('by_section',q=>q.eq('section','plugins')).unique();await ctx.db.patch(setting!._id,{values:{eventsEnabled:true}});
  const category=await ctx.db.insert('extension_event_categories',{name:'Workshops',slug:'workshops',createdAt:1,updatedAt:1});
  const fields={description:'Real event summary',startsAt:Date.now()+86400000,endsAt:Date.now()+90000000,timeZone:'America/Denver',venue:'Studio',venueAddress:'NOT_IN_CARD',status:'published' as const,createdBy:f.ids.user,createdAt:1,updatedAt:1};
  await ctx.db.insert('extension_events',{...fields,title:'Unrelated',slug:'unrelated',startsAt:fields.startsAt-1000});
  const event=await ctx.db.insert('extension_events',{...fields,title:'Category gathering',slug:'category-gathering',categoryId:category});return {category,event};
 });
 const first=await initialize(f);
 const saved=await f.client.mutation(reference('save','mutation'),{postId:f.ids.post,expectedRevision:first.revision,title:'Our next gathering',blocks:[{id:'next',name:'events/next-event',version:1,attrs:{category:selected.category}}]});
 await f.client.mutation(reference('setPublication','mutation'),{postId:f.ids.post,expectedRevision:saved.revision,status:'publish'});
 const shown=await f.t.query(reference('getForRender'),{postId:f.ids.post});expect(shown.state).toBe('ready');
 expect(shown.data.dataByBlock.next.data).toMatchObject({categoryId:selected.category,event:{id:selected.event,title:'Category gathering'}});expect(JSON.stringify(shown)).not.toContain('NOT_IN_CARD');
 await f.t.run(ctx=>ctx.db.patch('extension_events',selected.event,{status:'cancelled'}));
 expect((await f.t.query(reference('getForRender'),{postId:f.ids.post})).data.dataByBlock.next.data.event).toBeNull();
});
import {eventIntervalBucket} from '../foundation/eventIntervalIndex';
import {calendarWindow} from '../foundation/calendarContracts';
test('registered Calendar documents preserve independent month pages and current publication access',async()=>{
 const f=await fixture(),month='2026-09',window=calendarWindow(month,'America/Denver');
 const events=await f.t.run(async ctx=>{
  const user=await ctx.db.get(f.ids.user);await ctx.db.patch(user!.roleId!,{capabilities:['page.update','page.publish']});
  const setting=await ctx.db.query('settings').withIndex('by_section',q=>q.eq('section','plugins')).unique();await ctx.db.patch(setting!._id,{values:{eventsEnabled:true}});
  const ids=[];for(let n=0;n<3;n++){const startsAt=window.startsAt+n*3600000,endsAt=startsAt+3600000;ids.push(await ctx.db.insert('extension_events',{title:`Calendar gathering ${n}`,slug:`calendar-gathering-${n}`,description:'Public calendar summary',startsAt,endsAt,calendarBucket:eventIntervalBucket(startsAt,endsAt),timeZone:'America/Denver',venue:'Studio',venueAddress:'CALENDAR_PRIVATE_SOURCE',status:'published',createdBy:f.ids.user,createdAt:1,updatedAt:1}));}return ids;
 });
 const initial=await initialize(f),blocks=['one','two'].map(id=>({id,name:'events/calendar',version:1,attrs:{limit:1,timeZone:'America/Denver'}}));
 const saved=await f.client.mutation(reference('save','mutation'),{postId:f.ids.post,expectedRevision:initial.revision,title:'Gatherings calendar',blocks});
 await f.client.mutation(reference('setPublication','mutation'),{postId:f.ids.post,expectedRevision:saved.revision,status:'publish'});
 const request={one:JSON.stringify({month,cursor:null}),two:JSON.stringify({month,cursor:null})};
 const shown=await f.t.query(reference('getForRender'),{postId:f.ids.post,request});expect(shown.state).toBe('ready');expect(shown.data.dataByBlock.one.data.items[0].id).toBe(events[0]);expect(JSON.stringify(shown)).not.toContain('CALENDAR_PRIVATE_SOURCE');
 const nextRequest={...request,one:JSON.stringify({month,cursor:shown.data.dataByBlock.one.data.nextCursor})};
 const next=await f.t.query(reference('getForRender'),{postId:f.ids.post,request:nextRequest});expect(next.data.dataByBlock.one.data.items[0].id).toBe(events[1]);expect(next.data.dataByBlock.two.data.items[0].id).toBe(events[0]);
 await f.t.run(ctx=>ctx.db.patch('extension_events',events[1],{status:'cancelled'}));
 expect((await f.t.query(reference('getForRender'),{postId:f.ids.post,request:nextRequest})).data.dataByBlock.one.data.items[0].id).toBe(events[2]);
 await f.t.run(ctx=>ctx.db.patch('posts',f.ids.post,{status:'draft'}));expect(await f.t.query(reference('getForRender'),{postId:f.ids.post,request})).toBeNull();
});

test('form choices are document-authorized, paginated, plugin-bound and exclude draft forms and private settings', async () => {
 const f = await fixture();
 const ids = await f.t.run(async ctx => {
  const setting = await ctx.db.query('settings').withIndex('by_section', q => q.eq('section', 'plugins')).unique();
  await ctx.db.patch('settings', setting!._id, {values: {formsEnabled: true, membershipEnabled: false}});
  const ids = [];
  for(let i=0;i<23;i++) ids.push(await ctx.db.insert('forms', {title: `Public form ${i}`, slug: `form-${i}`, status:'published', settings:'{"notificationRefs":["PRIVATE_FORM_CONFIG"]}', createdBy:f.ids.user, createdAt:1, updatedAt:1}));
  await ctx.db.insert('forms', {title:'PRIVATE_DRAFT', slug:'draft', status:'draft', settings:'{}', createdBy:f.ids.user, createdAt:1, updatedAt:1});
  return ids;
 });
 const args={postId:f.ids.post,paginationOpts:{cursor:null,numItems:20}};
 await expect(f.t.query(reference('formOptions'),args)).rejects.toThrow();
 await expect(f.as(f.ids.denied).query(reference('formOptions'),args)).rejects.toThrow();
 const first=await f.client.query(reference('formOptions'),args);
 const second=await f.client.query(reference('formOptions'),{...args,paginationOpts:{cursor:first.continueCursor,numItems:20}});
 expect(first.page).toHaveLength(20);expect(second.page).toHaveLength(3);
 expect(second.isDone).toBe(true);
 expect(new Set([...first.page,...second.page].map((row:{id:string})=>row.id))).toEqual(new Set(ids));
 expect(JSON.stringify([first,second])).not.toContain('PRIVATE');
 expect(Object.keys(first.page[0]).sort()).toEqual(['id','slug','title']);
 await f.t.run(async ctx=>{const setting=await ctx.db.query('settings').withIndex('by_section',q=>q.eq('section','plugins')).unique();await ctx.db.patch('settings',setting!._id,{values:{formsEnabled:false}});});
 await expect(f.client.query(reference('formOptions'),args)).rejects.toThrow('Enable Forms');
});
test('embedded form is saved, published and revoked with its real source form', async () => {
 const f=await fixture(); const initialized=await initialize(f);
 const form=await f.t.run(async ctx=>{
  const setting=await ctx.db.query('settings').withIndex('by_section',q=>q.eq('section','plugins')).unique();
  await ctx.db.patch('settings',setting!._id,{values:{formsEnabled:true,membershipEnabled:false}});
  return ctx.db.insert('forms',{title:'An authored form',slug:'authored-form',status:'published',settings:'{"notificationRefs":["PRIVATE_FORM_CONFIG"]}',createdBy:f.ids.user,createdAt:1,updatedAt:1});
 });
 const blocks=[{id:'form',name:'core/form',version:1,attrs:{form}}];
 await f.client.mutation(reference('save','mutation'),{postId:f.ids.post,expectedRevision:initialized.revision,title:'Form page',blocks});
 await f.t.run(ctx=>ctx.db.patch('posts',f.ids.post,{status:'publish',publishedAt:1}));
 const shown=await f.t.query(reference('getForRender'),{postId:f.ids.post});
 expect(shown.state).toBe('ready');expect(shown.data.dataByBlock.form.data.form._id).toBe(form);
 expect(JSON.stringify(shown)).not.toContain('PRIVATE_FORM_CONFIG');
 expect(await f.t.run(ctx=>ctx.db.query('form_submissions').collect())).toEqual([]);
 await f.t.run(ctx=>ctx.db.patch('forms',form,{status:'draft'}));
 const revoked=await f.t.query(reference('getForRender'),{postId:f.ids.post});
 expect(revoked.data.dataByBlock.form.data.form).toBeNull();
});


test("public static membership documents carry exact start/end/grace deadlines and recheck without a grant write", async () => {
  const now = 1800000000000;
  setSystemTime(now);
  try {
    const f = await fixture(); await initialize(f);
    const grant = await f.t.run(async ctx => {
      await ctx.db.patch("posts", f.ids.post, { status: "publish" });
      const plugin = await ctx.db.query("settings").withIndex("by_section", q => q.eq("section", "plugins")).unique();
      await ctx.db.patch("settings", plugin!._id, { values: { membershipEnabled: true } });
      const plan = await ctx.db.insert("membership_plans", { title: "Timed access", slug: "timed-access", status: "active", grantMode: "manual", priority: 1, createdAt: now, updatedAt: now });
      await ctx.db.insert("membership_restriction_rules", { resourceType: "page", resourceIdOrKey: f.ids.post, ruleMode: "allow_only", planIds: [plan], teaserMode: "hide", loginRequired: true, createdAt: now, updatedAt: now });
      return ctx.db.insert("membership_grants", { userId: f.ids.denied, planId: plan, sourceType: "manual", status: "active", startsAt: now + 2000, endsAt: now + 5000, createdAt: now, updatedAt: now });
    });
    const member = f.as(f.ids.denied);
    const read = (key: string) => member.query(reference("getForRender"), { postId: f.ids.post, refreshKey: key });
    let result = await read("before_start");
    expect(result.state).toBe("restricted");
    expect(result.accessLease).toEqual({ evaluatedAt: now, expiresAt: now + 2000 });
    setSystemTime(now + 2000);
    result = await read("at_start"); expect(result.state).toBe("ready");
    expect(result.accessLease).toEqual({ evaluatedAt: now + 2000, expiresAt: now + 5000 });
    setSystemTime(now + 5000);
    result = await read("at_expiry"); expect(result.state).toBe("restricted");
    expect(result.document.blocks).toBeUndefined();
    expect((await f.t.run(ctx => ctx.db.get("membership_grants", grant)))!.status).toBe("active");
    await f.t.run(ctx => ctx.db.patch("membership_grants", grant, { status: "grace", graceEndsAt: now + 7000 }));
    result = await read("in_grace"); expect(result.state).toBe("ready");
    expect(result.accessLease.expiresAt).toBe(now + 7000);
    setSystemTime(now + 7000);
    result = await read("at_grace_expiry"); expect(result.state).toBe("restricted");
    expect(result.document.blocks).toBeUndefined();
    expect(result.accessLease.expiresAt - result.accessLease.evaluatedAt).toBe(60000);
  } finally { setSystemTime(); }
});


test("registered Contact save, publish, duplicate, submit and restore preserve source identity and private configuration",async()=>{
 const f=await fixture();await initialize(f);
 await f.t.run(async ctx=>{
  const user=await ctx.db.get("users",f.ids.user);await ctx.db.patch("roles",user!.roleId!,{capabilities:["page.update","page.publish","post.update","post.duplicate","revision.restore","form.create","form.update"]});
  const plugin=await ctx.db.query("settings").withIndex("by_section",q=>q.eq("section","plugins")).unique();await ctx.db.patch("settings",plugin!._id,{values:{formsEnabled:true,membershipEnabled:false}});
 });
 const blocks=[{id:"contact",name:"core/contact-form",version:2,attrs:{heading:"Talk to us",recipientEmail:"private-studio@example.invalid",successMessage:"Your message arrived.",fields:[{name:"email",label:"Email",type:"email",required:true}]}}];
 let receipt=await f.client.mutation(reference("save","mutation"),{postId:f.ids.post,expectedRevision:1,title:"Contact page",blocks});
 const saved=await f.client.query(reference("get"),{postId:f.ids.post});expect(saved.policy.disabledBlocks).not.toContain("core/contact-form");
 expect(saved.document.blocks[0].attrs.recipientEmail).toBe("private-studio@example.invalid");expect(saved.data.dataByBlock.contact.data.form).toBeNull();
 const original=await f.t.run(ctx=>ctx.db.query("forms").withIndex("by_contact_source",q=>q.eq("contactPostId",f.ids.post).eq("contactBlockId","contact")).unique());expect(original).not.toBeNull();
 receipt=await f.client.mutation(reference("setPublication","mutation"),{postId:f.ids.post,expectedRevision:receipt.revision,status:"publish"});
 const shown=await f.t.query(reference("getForRender"),{postId:f.ids.post});expect(shown.state).toBe("ready");expect(JSON.stringify(shown)).not.toContain("private-studio");expect(shown.data.dataByBlock.contact.data.form._id).toBe(original!._id);
 const copy=await f.client.mutation(reference("duplicate","mutation"),{postId:f.ids.post,expectedRevision:receipt.revision});
 const copied=await f.t.run(ctx=>ctx.db.query("forms").withIndex("by_contact_source",q=>q.eq("contactPostId",copy.postId).eq("contactBlockId","contact")).unique());expect(copied!._id).not.toBe(original!._id);
 const submissionArgs={formId:original!._id,values:[{fieldKey:`field_contact_${original!._id}_email`,value:"visitor@example.invalid"}],isComplete:true,startedAt:Date.now()-10000,honeypot:""};
 const submitted=await f.t.mutation(makeFunctionReference<any,any,any>("extensions/forms/mutations:submit"),submissionArgs);expect(submitted.isComplete).toBe(true);
 const confirmation=await f.t.query(makeFunctionReference<any,any,any>("extensions/forms/confirmations:resolveConfirmation"),{formId:original!._id,submissionId:submitted.submissionId,confirmationToken:submitted.confirmationToken});expect(confirmation.renderedMessage).toContain("Your message arrived.");
 receipt=await f.client.mutation(reference("save","mutation"),{postId:f.ids.post,expectedRevision:receipt.revision,title:"Contact page",blocks:[]});
 await expect(f.t.mutation(makeFunctionReference<any,any,any>("extensions/forms/mutations:submit"),submissionArgs)).rejects.toThrow("not available");
 const history=await f.client.query(reference("pageRevisions"),{postId:f.ids.post,paginationOpts:{cursor:null,numItems:20}});
 const previous=history.page.find((item:any)=>item.blocksVersion===2);
 expect(previous).toBeDefined();
 await f.client.mutation(reference("restore","mutation"),{postId:f.ids.post,revisionId:previous.id,expectedRevision:receipt.revision});
 const restored=await f.t.query(reference("getForRender"),{postId:f.ids.post});expect(restored.data.dataByBlock.contact.data.form._id).toBe(original!._id);
 expect(await f.t.run(ctx=>ctx.db.query("form_submissions").collect())).toHaveLength(1);
});

test("product choices are document-authorized, bounded, paginated and public-field-only", async () => {
  const f = await fixture();
  await f.t.run(async ctx => {
    const setting = await ctx.db.query("settings").withIndex("by_section", q => q.eq("section", "plugins")).unique();
    await ctx.db.patch(setting!._id, { values: { commerceEnabled: true, membershipEnabled: false } });
    for (let index=0;index<26;index++) await ctx.db.insert("commerce_products", {
      title:`Product ${index}`,slug:`product-${index}`,status:index===25?"draft":"publish",productType:"simple",authorId:f.ids.user,
      categoryIds:[],galleryMediaIds:[],basePrice:{amount:2500,currencyCode:"USD"},trackInventory:false,allowBackorders:false,isVirtual:true,isDownloadable:false,
      createdAt:index+1,updatedAt:1,publishedAt:index===24?Date.now()+3600000:1,rawSourceMeta:"private-import-marker",
    });
  });
  const args={postId:f.ids.post,paginationOpts:{cursor:null,numItems:20}};
  await expect(f.t.query(reference("productOptions"),args)).rejects.toThrow();
  await expect(f.as(f.ids.denied).query(reference("productOptions"),args)).rejects.toThrow();
  const first=await f.client.query(reference("productOptions"),args);
  expect(first.isDone).toBe(false);expect(first.page).toHaveLength(19);
  expect(JSON.stringify(first)).not.toContain("private-import-marker");
  const second=await f.client.query(reference("productOptions"),{...args,paginationOpts:{cursor:first.continueCursor,numItems:20}});
  expect(second.isDone).toBe(true);
  const all=[...first.page,...second.page];expect(all).toHaveLength(24);expect(new Set(all.map((item:any)=>item.id)).size).toBe(24);
  expect(all.map((item:any)=>item.title)).not.toContain("Product 24");expect(all.map((item:any)=>item.title)).not.toContain("Product 25");
  await expect(f.client.query(reference("productOptions"),{...args,paginationOpts:{cursor:null,numItems:21}})).rejects.toThrow();
  await f.t.run(async ctx=>{const setting=await ctx.db.query("settings").withIndex("by_section",q=>q.eq("section","plugins")).unique();await ctx.db.patch(setting!._id,{values:{commerceEnabled:false}});});
  await expect(f.client.query(reference("productOptions"),args)).rejects.toThrow("Enable Commerce");
});

test("registered product block authoring, publication and revision restore retain source identity", async () => {
  const f=await fixture();
  const productId=await f.t.run(async ctx=>{
    const user=await ctx.db.get(f.ids.user);await ctx.db.patch(user!.roleId!,{capabilities:["page.update","page.publish","revision.restore"]});
    const setting=await ctx.db.query("settings").withIndex("by_section",q=>q.eq("section","plugins")).unique();await ctx.db.patch(setting!._id,{values:{commerceEnabled:true,membershipEnabled:false}});
    return ctx.db.insert("commerce_products",{title:"Handmade mug",slug:"handmade-mug",status:"publish",productType:"simple",authorId:f.ids.user,categoryIds:[],galleryMediaIds:[],basePrice:{amount:2500,currencyCode:"USD"},salePrice:{amount:0,currencyCode:"USD"},trackInventory:false,allowBackorders:false,isVirtual:true,isDownloadable:false,createdAt:1,updatedAt:1,publishedAt:1});
  });
  const initial=await initialize(f),blocks=[{id:"products",name:"core/featured-products",version:2,attrs:{heading:"From the studio",productIds:[productId],count:1,showPrice:true}}];
  let saved=await f.client.mutation(reference("save","mutation"),{postId:f.ids.post,expectedRevision:initial.revision,title:"Studio objects",blocks});
  const editor=await f.client.query(reference("get"),{postId:f.ids.post});
  expect(editor.policy.disabledBlocks).not.toContain("core/featured-products");expect(editor.data.dataByBlock.products.data.items[0].id).toBe(productId);
  expect(await f.t.query(reference("getForRender"),{postId:f.ids.post})).toBeNull();
  saved=await f.client.mutation(reference("setPublication","mutation"),{postId:f.ids.post,expectedRevision:saved.revision,status:"publish"});
  const published=await f.t.query(reference("getForRender"),{postId:f.ids.post});
  expect(published.state).toBe("ready");expect(published.data.dataByBlock.products.data.items[0].pricing.salePrice.amount).toBe(0);
  saved=await f.client.mutation(reference("save","mutation"),{postId:f.ids.post,expectedRevision:saved.revision,title:"Studio objects",blocks:[]});
  const history=await f.client.query(reference("pageRevisions"),{postId:f.ids.post,paginationOpts:{cursor:null,numItems:20}});
  const previous=history.page.find((entry:any)=>entry.blocksVersion===2);expect(previous).toBeDefined();
  await f.client.mutation(reference("restore","mutation"),{postId:f.ids.post,revisionId:previous.id,expectedRevision:saved.revision});
  const restored=await f.t.query(reference("getForRender"),{postId:f.ids.post});expect(restored.document.blocks[0].attrs.productIds).toEqual([productId]);expect(restored.data.dataByBlock.products.data.items[0].id).toBe(productId);
  await f.t.run(ctx=>ctx.db.patch("commerce_products",productId,{status:"draft"}));
  const hidden=await f.t.query(reference("getForRender"),{postId:f.ids.post});expect(hidden.data.dataByBlock.products.data.items).toEqual([]);expect(hidden.document.blocks[0].attrs.productIds).toEqual([productId]);
});

test("product taxonomy choices stay in commerce, preserve bounded cursors and require current document authority", async () => {
  const f = await fixture();
  const ids = await f.t.run(async ctx => {
    const setting = await ctx.db.query("settings").withIndex("by_section", q => q.eq("section", "plugins")).unique();
    await ctx.db.patch(setting!._id, { values: { commerceEnabled: true, membershipEnabled: false } });
    // An entire hidden page must not terminate pagination or trigger an unbounded refill.
    for (let i = 0; i < 20; i++) await ctx.db.insert("commerce_product_tags", { name: `Hidden ${i}`, slug: `a-${String(i).padStart(2,"0")}`, isVisible: false, createdAt: 1, updatedAt: 1 });
    const tag = await ctx.db.insert("commerce_product_tags", { name: "Studio", slug: "studio", isVisible: true, createdAt: 1, updatedAt: 1 });
    const category = await ctx.db.insert("commerce_product_categories", { name: "Studio objects", slug: "studio", productCount: 0, description: "private-catalog-marker", createdAt: 1, updatedAt: 1 });
    await ctx.db.insert("commerce_product_categories", { name: "Hidden category", slug: "hidden", productCount: 0, isVisible: false, createdAt: 1, updatedAt: 1 });
    await ctx.db.insert("terms", { name: "Editorial studio", slug: "studio", taxonomy: "post_tag", count: 0, isDefault: false, createdAt: 1, updatedAt: 1 });
    return { tag, category };
  });
  const args = { postId: f.ids.post, taxonomy: "productTag", paginationOpts: { cursor: null, numItems: 20 } };
  await expect(f.t.query(reference("productTermOptions"), args)).rejects.toThrow();
  await expect(f.as(f.ids.denied).query(reference("productTermOptions"), args)).rejects.toThrow();
  const first = await f.client.query(reference("productTermOptions"), args);
  expect(first.page).toEqual([]); expect(first.isDone).toBe(false);
  const nextArgs = { ...args, paginationOpts: { cursor: first.continueCursor, numItems: 20 } };
  const second = await f.client.query(reference("productTermOptions"), nextArgs);
  expect(second.isDone).toBe(true);
  expect(second.page).toEqual([{ id: ids.tag, name: "Studio", slug: "studio", taxonomy: "productTag" }]);
  const categories = await f.client.query(reference("productTermOptions"), { ...args, taxonomy: "productCategory" });
  expect(categories.page).toEqual([{ id: ids.category, name: "Studio objects", slug: "studio", taxonomy: "productCategory" }]);
  expect(JSON.stringify(categories)).not.toContain("private-catalog-marker");
  await expect(f.client.query(reference("productTermOptions"), { ...args, paginationOpts: { cursor: null, numItems: 21 } })).rejects.toThrow();
  await expect(f.client.query(reference("productTermOptions"), { ...args, taxonomy: "tag" })).rejects.toThrow();
  await f.t.run(async ctx => {
    const setting = await ctx.db.query("settings").withIndex("by_section", q => q.eq("section", "plugins")).unique();
    await ctx.db.patch(setting!._id, { values: { commerceEnabled: false } });
  });
  await expect(f.client.query(reference("productTermOptions"), nextArgs)).rejects.toThrow("Enable Commerce");
  await f.t.run(async ctx => { const user = await ctx.db.get(f.ids.user); await ctx.db.patch(user!.roleId!, { capabilities: [] }); });
  await expect(f.client.query(reference("productTermOptions"), nextArgs)).rejects.toThrow();
});

test("registered Product Collection saves grouped references and restores their public source data",async()=>{
  const f=await fixture();
  const productId=await f.t.run(async ctx=>{
    const user=await ctx.db.get(f.ids.user);await ctx.db.patch(user!.roleId!,{capabilities:["page.update","page.publish","revision.restore"]});
    const setting=await ctx.db.query("settings").withIndex("by_section",q=>q.eq("section","plugins")).unique();await ctx.db.patch(setting!._id,{values:{commerceEnabled:true,membershipEnabled:false}});
    return ctx.db.insert("commerce_products",{title:"Studio cup",slug:"studio-cup",status:"publish",productType:"simple",authorId:f.ids.user,categoryIds:[],galleryMediaIds:[],basePrice:{amount:2500,currencyCode:"USD"},trackInventory:false,allowBackorders:false,isVirtual:true,isDownloadable:false,createdAt:1,updatedAt:1,publishedAt:1});
  });
  const initial=await initialize(f),blocks=[{id:"collection",name:"blocks/product-collection",version:2,attrs:{heading:"For the everyday",productIds:[productId],groups:[{label:"Kitchen",productIds:[productId],products:[]}]}}];
  let saved=await f.client.mutation(reference("save","mutation"),{postId:f.ids.post,expectedRevision:initial.revision,title:"Studio collection",blocks});
  const editor=await f.client.query(reference("get"),{postId:f.ids.post});
  expect(editor.policy.disabledBlocks).not.toContain("blocks/product-collection");
  expect(editor.data.dataByBlock.collection.data.groups[0].items[0].id).toBe(productId);
  saved=await f.client.mutation(reference("setPublication","mutation"),{postId:f.ids.post,expectedRevision:saved.revision,status:"publish"});
  const published=await f.t.query(reference("getForRender"),{postId:f.ids.post});expect(published.state).toBe("ready");expect(published.data.dataByBlock.collection.data.items[0].title).toBe("Studio cup");
  const history=await f.client.query(reference("pageRevisions"),{postId:f.ids.post,paginationOpts:{cursor:null,numItems:20}});
  const previous=history.page.find((entry:any)=>entry.blocksVersion===2);
  saved=await f.client.mutation(reference("save","mutation"),{postId:f.ids.post,expectedRevision:saved.revision,title:"Studio collection",blocks:[]});
  await f.client.mutation(reference("restore","mutation"),{postId:f.ids.post,revisionId:previous.id,expectedRevision:saved.revision});
  const restored=await f.t.query(reference("getForRender"),{postId:f.ids.post});expect(restored.document.blocks[0].attrs.groups[0].productIds).toEqual([productId]);
  await f.t.run(ctx=>ctx.db.patch(productId,{status:"draft"}));
  const withdrawn=await f.t.query(reference("getForRender"),{postId:f.ids.post});expect(withdrawn.data.dataByBlock.collection.data.items).toEqual([]);expect(withdrawn.data.dataByBlock.collection.data.groups[0].items).toEqual([]);
});

test("registered native and public reads complete large category counts without changing saved blocks",async()=>{
 const originalKey=process.env.AUTH_PRIVATE_KEY, originalEpoch=process.env.MEDIA_REFERENCE_INDEX_EPOCH;
 process.env.AUTH_PRIVATE_KEY="synthetic-native-count-test-key-".repeat(4);
 process.env.MEDIA_REFERENCE_INDEX_EPOCH="mi_ready_native_count_fixture";
 try {
  const f=await fixture();
  const category=await f.t.run(async ctx=>{
   const user=(await ctx.db.get(f.ids.user))!;await ctx.db.patch(user.roleId!,{capabilities:["page.update","page.publish"]});
   const setting=await ctx.db.query("settings").withIndex("by_section",q=>q.eq("section","plugins")).unique();await ctx.db.patch(setting!._id,{values:{commerceEnabled:true,membershipEnabled:false}});
   const id=await ctx.db.insert("commerce_product_categories",{name:"Field",slug:"field",isVisible:true,sortOrder:1,productCount:999,createdAt:1,updatedAt:1});
   for(let i=0;i<175;i++)await ctx.db.insert("commerce_products",{title:`Object ${i}`,slug:`object-${i}`,status:"publish",productType:"simple",authorId:f.ids.user,categoryIds:[id,id],galleryMediaIds:[],basePrice:{amount:100,currencyCode:"USD"},trackInventory:false,allowBackorders:false,isVirtual:true,isDownloadable:false,createdAt:1,updatedAt:1});
   return id;
  });
  const initial=await initialize(f),blocks=[{id:"categories",name:"commerce/category-tiles",version:2,attrs:{categorySlugs:["field"],showCounts:true}}];
  const saved=await f.client.mutation(reference("save","mutation"),{postId:f.ids.post,expectedRevision:initial.revision,title:"Large collections",blocks});
  await f.client.mutation(reference("setPublication","mutation"),{postId:f.ids.post,expectedRevision:saved.revision,status:"publish"});
  for(const [client,name] of [[f.client,"get"],[f.t,"getForRender"]] as const){
   let request:Record<string,string>={},pages=0,value:any;
   do {
    value=await client.query(reference(name),{postId:f.ids.post,request});
    const data=value.data.dataByBlock.categories.data;
    expect(value.document.blocks[0].attrs.categorySlugs).toEqual(["field"]);expect(value.data.request ?? {}).toEqual(request);
    expect(++pages).toBeLessThan(12);
    if(data.nextCursor) {expect(data.items[0].productCount).toBeNull();request={categories:data.nextCursor};}else break;
   }while(true);
   expect(pages).toBeGreaterThan(2);expect(value.data.dataByBlock.categories.data.items.map((item:any)=>[item.id,item.productCount])).toEqual([[category,175]]);
  }
 } finally {if(originalKey===undefined)delete process.env.AUTH_PRIVATE_KEY;else process.env.AUTH_PRIVATE_KEY=originalKey;if(originalEpoch===undefined)delete process.env.MEDIA_REFERENCE_INDEX_EPOCH;else process.env.MEDIA_REFERENCE_INDEX_EPOCH=originalEpoch;}
});

test("Category Tiles is authorable, publishes selected shop categories and restores their references", async () => {
  const f = await fixture();
  const category = await f.t.run(async ctx => {
    const user = await ctx.db.get(f.ids.user);
    await ctx.db.patch(user!.roleId!, { capabilities: ["page.update", "page.publish", "revision.restore"] });
    const setting = await ctx.db.query("settings").withIndex("by_section", q => q.eq("section", "plugins")).unique();
    await ctx.db.patch(setting!._id, { values: { commerceEnabled: true, membershipEnabled: false } });
    return ctx.db.insert("commerce_product_categories", { name: "Field essentials", slug: "field-essentials", productCount: 999, isVisible: true, createdAt: 1, updatedAt: 1 });
  });
  const initial = await initialize(f);
  const editor = await f.client.query(reference("get"), { postId: f.ids.post });
  expect(editor.policy.disabledBlocks).not.toContain("commerce/category-tiles");
  const blocks = [{ id: "categories", name: "commerce/category-tiles", version: 2, attrs: { heading: "Find your everyday", categorySlugs: ["field-essentials"], showCounts: true } }];
  let saved = await f.client.mutation(reference("save", "mutation"), { postId: f.ids.post, expectedRevision: initial.revision, title: "Collection index", blocks });
  saved = await f.client.mutation(reference("setPublication", "mutation"), { postId: f.ids.post, expectedRevision: saved.revision, status: "publish" });
  const published = await f.t.query(reference("getForRender"), { postId: f.ids.post });
  expect(published.state).toBe("ready");
  expect(published.data.dataByBlock.categories.data.items.map((item: any) => [item.id, item.productCount])).toEqual([[category, 0]]);
  const history = await f.client.query(reference("pageRevisions"), { postId: f.ids.post, paginationOpts: { cursor: null, numItems: 20 } });
  const revision = history.page.find((entry: any) => entry.blocksVersion === 2);
  saved = await f.client.mutation(reference("save", "mutation"), { postId: f.ids.post, expectedRevision: saved.revision, title: "Collection index", blocks: [] });
  await f.client.mutation(reference("restore", "mutation"), { postId: f.ids.post, revisionId: revision.id, expectedRevision: saved.revision });
  const restored = await f.t.query(reference("getForRender"), { postId: f.ids.post });
  expect(restored.document.blocks[0].attrs.categorySlugs).toEqual(["field-essentials"]);
  await f.t.run(ctx => ctx.db.patch(category, { isVisible: false }));
  const hidden = await f.t.query(reference("getForRender"), { postId: f.ids.post });
  expect(hidden.data.dataByBlock.categories.data.items).toEqual([]);
  expect(hidden.document.blocks[0].attrs.categorySlugs).toEqual(["field-essentials"]);
});

test("public recently-viewed history is request-local, source-authorized and cannot change manual block selections",async()=>{
  const f=await fixture();
  const products=await f.t.run(async ctx=>{
    const user=await ctx.db.get(f.ids.user);await ctx.db.patch(user!.roleId!,{capabilities:["page.update","page.publish","revision.restore"]});
    const setting=await ctx.db.query("settings").withIndex("by_section",q=>q.eq("section","plugins")).unique();await ctx.db.patch(setting!._id,{values:{commerceEnabled:true,membershipEnabled:false}});
    const ids=[];
    for(const [title,status] of [["Cup","publish"],["Journal","publish"],["Draft","draft"]] as const)ids.push(await ctx.db.insert("commerce_products",{title,slug:title.toLowerCase(),status,productType:"simple",authorId:f.ids.user,categoryIds:[],galleryMediaIds:[],basePrice:{amount:1000,currencyCode:"USD"},trackInventory:false,allowBackorders:false,isVirtual:true,isDownloadable:false,createdAt:1,updatedAt:1,publishedAt:1}));
    return ids;
  });
  const initial=await initialize(f),blocks=[{id:"history",name:"blocks/product-collection",version:2,attrs:{mode:"recentlyViewed",count:4}},{id:"manual",name:"blocks/product-collection",version:2,attrs:{productIds:[products[0]]}}];
  let saved=await f.client.mutation(reference("save","mutation"),{postId:f.ids.post,expectedRevision:initial.revision,title:"Your discoveries",blocks});
  saved=await f.client.mutation(reference("setPublication","mutation"),{postId:f.ids.post,expectedRevision:saved.revision,status:"publish"});
  const history=[products[1],products[2],products[0],products[1]];
  const personalized=await f.t.query(reference("getForRender"),{postId:f.ids.post,recentlyViewedIds:history});
  expect(personalized.data.dataByBlock.history.data.items.map((item:any)=>item.id)).toEqual([products[1],products[0]]);
  expect(personalized.data.dataByBlock.manual.data.items.map((item:any)=>item.id)).toEqual([products[0]]);
  const anonymousSSR=await f.t.query(reference("getForRender"),{postId:f.ids.post});expect(anonymousSSR.data.dataByBlock.history.data.items).toEqual([]);expect(anonymousSSR.historyDigest).not.toBe(personalized.historyDigest);
  expect(personalized.document.blocks[0].attrs).not.toHaveProperty("recentlyViewedIds");
  await expect(f.t.query(reference("getForRender"),{postId:f.ids.post,recentlyViewedIds:Array(49).fill(products[0])})).rejects.toThrow();
  await f.t.run(ctx=>ctx.db.patch(products[1]!,{status:"draft"}));
  const withdrawn=await f.t.query(reference("getForRender"),{postId:f.ids.post,recentlyViewedIds:history});expect(withdrawn.data.dataByBlock.history.data.items.map((item:any)=>item.id)).toEqual([products[0]]);
  await f.client.mutation(reference("setPublication","mutation"),{postId:f.ids.post,expectedRevision:saved.revision,status:"draft"});
  expect(await f.t.query(reference("getForRender"),{postId:f.ids.post,recentlyViewedIds:history})).toBeNull();
});

const settingsWrite = (settings: any, changes: Record<string, unknown> = {}) => ({
  postId:settings.postId,expectedRevision:settings.revision,expectedSettingsDigest:settings.settingsDigest,
  slug:settings.slug,pageTemplate:settings.pageTemplate,hideHeader:settings.hideHeader,hideFooter:settings.hideFooter,...changes,
});
test("canonical settings preserve authored blocks, snapshot layouts, keep URLs through restore and reject stale writers", async () => {
  const f=await fixture();await initialize(f);
  const first=await f.client.query(reference("getSettings"),{postId:f.ids.post});
  const receipt=await f.client.mutation(reference("setSettings","mutation"),settingsWrite(first,{slug:"collection-studio",pageTemplate:"full-width",hideHeader:true}));
  expect(receipt.revision).toBe(first.revision+1);
  let row=await f.t.run(ctx=>ctx.db.get(f.ids.post));expect(row?.path).toBe("/collection-studio");expect(row?.blocks).toEqual(tree);expect(row?.pageTemplate).toBe("full-width");expect(row?.hideHeader).toBe(true);
  const history=await f.client.query(reference("pageRevisions"),{postId:f.ids.post,paginationOpts:{numItems:20,cursor:null}});
  const previous=history.page.find((r:any)=>r.blocksVersion===2);expect(previous).toBeDefined();
  await expect(f.client.mutation(reference("setSettings","mutation"),settingsWrite(first,{slug:"stale"}))).rejects.toThrow("changed");
  const current=await f.client.query(reference("getSettings"),{postId:f.ids.post});
  const before=await f.t.run(ctx=>ctx.db.query("revisions").take(20));
  expect((await f.client.mutation(reference("setSettings","mutation"),settingsWrite(current))).changed).toBe(false);
  expect(await f.t.run(ctx=>ctx.db.query("revisions").take(20))).toEqual(before);
  await f.client.mutation(reference("restore","mutation"),{postId:f.ids.post,revisionId:previous.id,expectedRevision:receipt.revision});
  row=await f.t.run(ctx=>ctx.db.get(f.ids.post));expect(row?.slug).toBe("collection-studio");expect(row?.path).toBe("/collection-studio");expect(row?.hideHeader).toBeUndefined();expect(row?.pageTemplate).toBeUndefined();
});
test("settings enforce authority and exact settings digest even when a legacy URL writer did not advance the block revision",async()=>{
  const f=await fixture();await initialize(f);
  const current=await f.client.query(reference("getSettings"),{postId:f.ids.post});
  await expect(f.t.query(reference("getSettings"),{postId:f.ids.post})).rejects.toThrow();
  await expect(f.as(f.ids.denied).mutation(reference("setSettings","mutation"),settingsWrite(current,{hideFooter:true}))).rejects.toThrow();
  await f.t.run(ctx=>ctx.db.patch(f.ids.post,{slug:"external",path:"/external"}));
  await expect(f.client.mutation(reference("setSettings","mutation"),settingsWrite(current,{hideFooter:true}))).rejects.toThrow("changed");
  expect((await f.t.run(ctx=>ctx.db.get(f.ids.post)))?.hideFooter).toBeUndefined();
});
test("canonical permalink changes reject reserved and duplicate routes and atomically update descendants",async()=>{
  const f=await fixture();await initialize(f);
  const child=await f.t.run(async ctx=>{
    const {_id,_creationTime,...post}=(await ctx.db.get(f.ids.post))!;
    return ctx.db.insert("posts",{...post,slug:"child",path:"/draft/child",parentId:f.ids.post,depth:1});
  });
  const current=await f.client.query(reference("getSettings"),{postId:f.ids.post});
  for(const slug of ["products","document-preview","bad/path",""])
    await expect(f.client.mutation(reference("setSettings","mutation"),settingsWrite(current,{slug}))).rejects.toThrow();
  await expect(f.client.mutation(reference("setSettings","mutation"),settingsWrite(current,{slug:"child"}))).rejects.toThrow("already used");
  expect((await f.t.run(ctx=>ctx.db.get(f.ids.post)))?.path).toBe("/draft");
  await f.client.mutation(reference("setSettings","mutation"),settingsWrite(current,{slug:"studio"}));
  expect((await f.t.run(ctx=>ctx.db.get(child)))?.path).toBe("/studio/child");
  expect((await f.t.run(ctx=>ctx.db.get(child)))?.depth).toBe(1);
});
test("a descendant route collision rolls back both layout and URL changes",async()=>{
  const f=await fixture();await initialize(f);
  await f.t.run(async ctx=>{
    await ctx.db.insert("settings",{section:"dashboard",values:{basePath:"studio/child"},updatedAt:1,updatedBy:f.ids.user});
    const {_id,_creationTime,...post}=(await ctx.db.get(f.ids.post))!;
    await ctx.db.insert("posts",{...post,slug:"child",path:"/draft/child",parentId:f.ids.post,depth:1});
  });
  const current=await f.client.query(reference("getSettings"),{postId:f.ids.post});
  await expect(f.client.mutation(reference("setSettings","mutation"),settingsWrite(current,{slug:"studio",hideHeader:true}))).rejects.toThrow("built-in website route");
  expect(await f.client.query(reference("getSettings"),{postId:f.ids.post})).toEqual(current);
});
test("post permalinks remain under blog and page-only layouts cannot be applied to posts",async()=>{
  const f=await fixture();await f.t.run(ctx=>ctx.db.patch(f.ids.post,{type:"post",path:undefined}));await initialize(f);
  const current=await f.client.query(reference("getSettings"),{postId:f.ids.post});
  await expect(f.client.mutation(reference("setSettings","mutation"),settingsWrite(current,{pageTemplate:"blank"}))).rejects.toThrow("apply to pages");
  await f.client.mutation(reference("setSettings","mutation"),settingsWrite(current,{slug:"field-notes",hideFooter:true}));
  const next=await f.client.query(reference("getSettings"),{postId:f.ids.post});expect(next.path).toBe("/blog/field-notes");expect(next.hideFooter).toBe(true);
});


test("Product Hero saves, publishes and restores one authorized product without replacing a withdrawn selection",async()=>{
 const f=await fixture();
 const product=await f.t.run(async ctx=>{
  const user=await ctx.db.get(f.ids.user);await ctx.db.patch(user!.roleId!,{capabilities:["page.update","page.publish","revision.restore"]});
  const setting=await ctx.db.query("settings").withIndex("by_section",q=>q.eq("section","plugins")).unique();await ctx.db.patch(setting!._id,{values:{commerceEnabled:true,membershipEnabled:false}});
  const attrs={status:"publish" as const,productType:"simple" as const,authorId:f.ids.user,categoryIds:[],galleryMediaIds:[],basePrice:{amount:2400,currencyCode:"USD"},trackInventory:false,allowBackorders:false,isVirtual:true,isDownloadable:false,createdAt:1,updatedAt:1};
  const id=await ctx.db.insert("commerce_products",{...attrs,title:"Notebook",slug:"notebook"});await ctx.db.insert("commerce_products",{...attrs,title:"Other product",slug:"other-product"});return id;
 });
 const initial=await initialize(f),editor=await f.client.query(reference("get"),{postId:f.ids.post});expect(editor.policy.disabledBlocks).not.toContain("commerce/product-hero");
 const blocks=[{id:"hero",name:"commerce/product-hero",version:1,attrs:{product,title:"Kept close."}}];
 let saved=await f.client.mutation(reference("save","mutation"),{postId:f.ids.post,expectedRevision:initial.revision,title:"One good thing",blocks});
 saved=await f.client.mutation(reference("setPublication","mutation"),{postId:f.ids.post,expectedRevision:saved.revision,status:"publish"});
 const publicRead=()=>f.t.query(reference("getForRender"),{postId:f.ids.post});
 const live=await publicRead();expect(live.data.dataByBlock.hero.data.items.map((p:any)=>p.id)).toEqual([product]);expect(live.data.dataByBlock.hero.data.items[0].cart).toEqual({kind:"add",productId:product});
 const history=await f.client.query(reference("pageRevisions"),{postId:f.ids.post,paginationOpts:{cursor:null,numItems:20}});const revision=history.page.find((entry:any)=>entry.blocksVersion===2);
 saved=await f.client.mutation(reference("save","mutation"),{postId:f.ids.post,expectedRevision:saved.revision,title:"One good thing",blocks:[]});
 await f.client.mutation(reference("restore","mutation"),{postId:f.ids.post,revisionId:revision.id,expectedRevision:saved.revision});expect((await publicRead()).document.blocks[0].attrs.product).toBe(product);
 await f.t.run(ctx=>ctx.db.patch(product,{status:"draft"}));const withdrawn=await publicRead();expect(withdrawn.data.dataByBlock.hero.data.items).toEqual([]);expect(withdrawn.document.blocks[0].attrs.product).toBe(product);
});

test("Product Showcase saves, publishes and restores one authorized product without replacing a withdrawn selection",async()=>{
 const f=await fixture();
 const product=await f.t.run(async ctx=>{
  const user=await ctx.db.get(f.ids.user);await ctx.db.patch(user!.roleId!,{capabilities:["page.update","page.publish","revision.restore"]});
  const setting=await ctx.db.query("settings").withIndex("by_section",q=>q.eq("section","plugins")).unique();await ctx.db.patch(setting!._id,{values:{commerceEnabled:true,membershipEnabled:false}});
  const attrs={status:"publish" as const,productType:"simple" as const,authorId:f.ids.user,categoryIds:[],galleryMediaIds:[],basePrice:{amount:2400,currencyCode:"USD"},trackInventory:false,allowBackorders:false,isVirtual:true,isDownloadable:false,createdAt:1,updatedAt:1};
  const id=await ctx.db.insert("commerce_products",{...attrs,title:"Notebook",slug:"notebook"});await ctx.db.insert("commerce_products",{...attrs,title:"Other product",slug:"other-product"});return id;
 });
 const initial=await initialize(f),editor=await f.client.query(reference("get"),{postId:f.ids.post});expect(editor.policy.disabledBlocks).not.toContain("commerce/product-showcase");
 const blocks=[{id:"hero",name:"commerce/product-showcase",version:2,attrs:{source:"slugs",productSlugs:["missing","notebook"],heading:"Kept close."}}];
 let saved=await f.client.mutation(reference("save","mutation"),{postId:f.ids.post,expectedRevision:initial.revision,title:"One good thing",blocks});
 saved=await f.client.mutation(reference("setPublication","mutation"),{postId:f.ids.post,expectedRevision:saved.revision,status:"publish"});
 const publicRead=()=>f.t.query(reference("getForRender"),{postId:f.ids.post});
 const live=await publicRead();expect(live.data.dataByBlock.hero.data.items.map((p:any)=>p.id)).toEqual([product]);expect(live.data.dataByBlock.hero.data.items[0].cart).toEqual({kind:"add",productId:product});
 const history=await f.client.query(reference("pageRevisions"),{postId:f.ids.post,paginationOpts:{cursor:null,numItems:20}});const revision=history.page.find((entry:any)=>entry.blocksVersion===2);
 saved=await f.client.mutation(reference("save","mutation"),{postId:f.ids.post,expectedRevision:saved.revision,title:"One good thing",blocks:[]});
 await f.client.mutation(reference("restore","mutation"),{postId:f.ids.post,revisionId:revision.id,expectedRevision:saved.revision});expect((await publicRead()).document.blocks[0].attrs.productSlugs).toEqual(["missing","notebook"]);
 await f.t.run(ctx=>ctx.db.patch(product,{status:"draft"}));const withdrawn=await publicRead();expect(withdrawn.data.dataByBlock.hero.data.items).toEqual([]);expect(withdrawn.document.blocks[0].attrs.productSlugs).toEqual(["missing","notebook"]);
});


test("recipe choices require document authority and preserve bounded published pagination",async()=>{
 const f=await fixture();await f.t.run(async ctx=>{
  const setting=await ctx.db.query("settings").withIndex("by_section",q=>q.eq("section","plugins")).unique();await ctx.db.patch(setting!._id,{values:{recipesEnabled:true,membershipEnabled:false}});
  for(let i=0;i<23;i++)await ctx.db.insert("recipes",{title:`Recipe ${i}`,slug:`recipe-${i}`,status:i===22?"draft":"publish",authorId:f.ids.user,categoryIds:[],ingredients:[],instructions:[],scannedText:"private-recipe-scan",aiExtractedFromScan:false,isFeatured:false,publishedAt:i===21?Date.now()+3600000:1,createdAt:1,updatedAt:1});
 });const args={postId:f.ids.post,paginationOpts:{cursor:null,numItems:20}};
 await expect(f.t.query(reference("recipeOptions"),args)).rejects.toThrow();await expect(f.as(f.ids.denied).query(reference("recipeOptions"),args)).rejects.toThrow();
 const first=await f.client.query(reference("recipeOptions"),args);expect(first.isDone).toBe(false);const second=await f.client.query(reference("recipeOptions"),{...args,paginationOpts:{cursor:first.continueCursor,numItems:20}});
 const items=[...first.page,...second.page];expect(items).toHaveLength(21);expect(new Set(items.map((item:any)=>item.id)).size).toBe(21);expect(JSON.stringify(items)).not.toContain("private-recipe-scan");expect(items.map((item:any)=>item.title)).not.toContain("Recipe 21");expect(items.map((item:any)=>item.title)).not.toContain("Recipe 22");
 await expect(f.client.query(reference("recipeOptions"),{...args,paginationOpts:{cursor:null,numItems:21}})).rejects.toThrow();
 await f.t.run(async ctx=>{const setting=await ctx.db.query("settings").withIndex("by_section",q=>q.eq("section","plugins")).unique();await ctx.db.patch(setting!._id,{values:{recipesEnabled:false}});});await expect(f.client.query(reference("recipeOptions"),args)).rejects.toThrow("Enable Recipes");
});
test("membership plans save, paginate and restore through registered document endpoints",async()=>{
 const f=await fixture();const ids=await f.t.run(async ctx=>{
  const user=await ctx.db.get(f.ids.user);await ctx.db.patch(user!.roleId!,{capabilities:["page.update","page.publish","revision.restore"]});
  const setting=await ctx.db.query("settings").withIndex("by_section",q=>q.eq("section","plugins")).unique();await ctx.db.patch(setting!._id,{values:{membershipEnabled:true}});
  const plans=[];for(let i=0;i<8;i++)plans.push(await ctx.db.insert("membership_plans",{title:`Studio ${i}`,slug:`studio-${i}`,status:"active",grantMode:"manual",priority:i,createdAt:1,updatedAt:1}));return plans;
 });
 const initial=await initialize(f),blocks=[{id:"plans",name:"membership/plans",version:1,attrs:{limit:3}}];
 let saved=await f.client.mutation(reference("save","mutation"),{postId:f.ids.post,expectedRevision:initial.revision,title:"Studio plans",blocks});
 const editor=await f.client.query(reference("get"),{postId:f.ids.post});expect(editor.policy.disabledBlocks).not.toContain("membership/plans");expect(editor.data.dataByBlock.plans.data.items.map((p:any)=>p.id)).toEqual(ids.slice(0,3));
 saved=await f.client.mutation(reference("setPublication","mutation"),{postId:f.ids.post,expectedRevision:saved.revision,status:"publish"});
 const first=await f.t.query(reference("getForRender"),{postId:f.ids.post});const cursor=first.data.dataByBlock.plans.data.nextCursor;expect(cursor).toBeString();
 const second=await f.t.query(reference("getForRender"),{postId:f.ids.post,request:{plans:cursor}});expect(second.data.dataByBlock.plans.data.items.map((p:any)=>p.id)).toEqual(ids.slice(3,6));
 const selected=[{...blocks[0],attrs:{selection:"selected",plans:[ids[7],ids[0]],limit:3}}];saved=await f.client.mutation(reference("save","mutation"),{postId:f.ids.post,expectedRevision:saved.revision,title:"Studio plans",blocks:selected});
 expect((await f.t.query(reference("getForRender"),{postId:f.ids.post})).data.dataByBlock.plans.data.items.map((p:any)=>p.id)).toEqual([ids[7],ids[0]]);
 await expect(f.t.query(reference("getForRender"),{postId:f.ids.post,request:{plans:cursor}})).rejects.toThrow();
 saved=await f.client.mutation(reference("save","mutation"),{postId:f.ids.post,expectedRevision:saved.revision,title:"Studio plans",blocks:[]});
 const history=await f.client.query(reference("pageRevisions"),{postId:f.ids.post,paginationOpts:{cursor:null,numItems:20}});const previous=history.page.find((entry:any)=>entry.blocksVersion===2);expect(previous).toBeDefined();
 await f.client.mutation(reference("restore","mutation"),{postId:f.ids.post,revisionId:previous.id,expectedRevision:saved.revision});expect((await f.t.query(reference("getForRender"),{postId:f.ids.post})).document.blocks[0].attrs.plans).toEqual([ids[7],ids[0]]);
});
test("membership teaser saves through the editor and public data carries the viewer's grant expiry",async()=>{
 setSystemTime(100000);
 try {
  const f=await fixture();const planId=await f.t.run(async ctx=>{
   const user=await ctx.db.get(f.ids.user);await ctx.db.patch(user!.roleId!,{capabilities:["page.update","page.publish","revision.restore"]});
   const setting=await ctx.db.query("settings").withIndex("by_section",q=>q.eq("section","plugins")).unique();await ctx.db.patch(setting!._id,{values:{membershipEnabled:true}});
   const plan=await ctx.db.insert("membership_plans",{title:"Studio Circle",slug:"studio-circle",status:"active",grantMode:"manual",priority:0,createdAt:1,updatedAt:1});
   await ctx.db.insert("membership_grants",{userId:f.ids.denied,planId:plan,sourceType:"manual",status:"active",startsAt:1,endsAt:101000,createdAt:1,updatedAt:1});return plan;
  });
  const initial=await initialize(f),blocks=[{id:"membership",name:"membership/gated-teaser",version:1,attrs:{requiredPlan:planId,teaserText:"A public preview",upgradeLink:"/membership-options"}}];
  let saved=await f.client.mutation(reference("save","mutation"),{postId:f.ids.post,expectedRevision:initial.revision,title:"Studio membership",blocks});
  const editor=await f.client.query(reference("get"),{postId:f.ids.post});expect(editor.policy.disabledBlocks).not.toContain("membership/gated-teaser");expect(editor.data.dataByBlock.membership.data.state).toBe("missing-plan");
  saved=await f.client.mutation(reference("setPublication","mutation"),{postId:f.ids.post,expectedRevision:saved.revision,status:"publish"});
  const publicView=await f.t.query(reference("getForRender"),{postId:f.ids.post});expect(publicView.state).toBe("ready");expect(publicView.data.dataByBlock.membership.data.state).toBe("signed-out");
  const member=await f.as(f.ids.denied).query(reference("getForRender"),{postId:f.ids.post});expect(member.data.dataByBlock.membership.data.state).toBe("granted");expect(member.accessLease.expiresAt).toBe(101000);
  setSystemTime(101000);expect((await f.as(f.ids.denied).query(reference("getForRender"),{postId:f.ids.post})).data.dataByBlock.membership.data.state).toBe("missing-plan");
  saved=await f.client.mutation(reference("save","mutation"),{postId:f.ids.post,expectedRevision:saved.revision,title:"Studio membership",blocks:[]});
  const history=await f.client.query(reference("pageRevisions"),{postId:f.ids.post,paginationOpts:{cursor:null,numItems:20}});const previous=history.page.find((entry:any)=>entry.blocksVersion===2);expect(previous).toBeDefined();
  await f.client.mutation(reference("restore","mutation"),{postId:f.ids.post,revisionId:previous.id,expectedRevision:saved.revision});
  const restored=await f.t.query(reference("getForRender"),{postId:f.ids.post});expect(restored.document.blocks[0].attrs.requiredPlan).toBe(planId);
  await f.t.run(ctx=>ctx.db.patch(planId,{status:"archived"}));expect((await f.t.query(reference("getForRender"),{postId:f.ids.post})).data.dataByBlock.membership.data).toEqual({state:"unavailable",plan:null});
 } finally {setSystemTime();}
});
test("recipe block saves, publishes, restores and withdraws exact source content",async()=>{
 const f=await fixture();const recipeId=await f.t.run(async ctx=>{
  const user=await ctx.db.get(f.ids.user);await ctx.db.patch(user!.roleId!,{capabilities:["page.update","page.publish","revision.restore"]});
  const setting=await ctx.db.query("settings").withIndex("by_section",q=>q.eq("section","plugins")).unique();await ctx.db.patch(setting!._id,{values:{recipesEnabled:true,membershipEnabled:false}});
  return ctx.db.insert("recipes",{title:"Sunday beans",slug:"sunday-beans",status:"publish",authorId:f.ids.user,categoryIds:[],ingredients:["Beans"],instructions:["Cook until tender."],aiExtractedFromScan:false,isFeatured:false,publishedAt:1,createdAt:1,updatedAt:1});
 });const initial=await initialize(f),blocks=[{id:"recipe",name:"gallery/recipe-card",version:1,attrs:{recipe:recipeId}}];
 let saved=await f.client.mutation(reference("save","mutation"),{postId:f.ids.post,expectedRevision:initial.revision,title:"Sunday table",blocks});
 const editor=await f.client.query(reference("get"),{postId:f.ids.post});expect(editor.policy.disabledBlocks).not.toContain("gallery/recipe-card");expect(editor.data.dataByBlock.recipe.data.recipe.id).toBe(recipeId);
 saved=await f.client.mutation(reference("setPublication","mutation"),{postId:f.ids.post,expectedRevision:saved.revision,status:"publish"});
 expect((await f.t.query(reference("getForRender"),{postId:f.ids.post})).data.dataByBlock.recipe.data.recipe.ingredients).toEqual(["Beans"]);
 saved=await f.client.mutation(reference("save","mutation"),{postId:f.ids.post,expectedRevision:saved.revision,title:"Sunday table",blocks:[]});
 const history=await f.client.query(reference("pageRevisions"),{postId:f.ids.post,paginationOpts:{cursor:null,numItems:20}});const previous=history.page.find((entry:any)=>entry.blocksVersion===2);expect(previous).toBeDefined();
 await f.client.mutation(reference("restore","mutation"),{postId:f.ids.post,revisionId:previous.id,expectedRevision:saved.revision});
 const restored=await f.t.query(reference("getForRender"),{postId:f.ids.post});expect(restored.document.blocks[0].attrs.recipe).toBe(recipeId);expect(restored.data.dataByBlock.recipe.data.recipe.id).toBe(recipeId);
 await f.t.run(ctx=>ctx.db.patch(recipeId,{status:"draft"}));const hidden=await f.t.query(reference("getForRender"),{postId:f.ids.post});expect(hidden.data.dataByBlock.recipe.data.recipe).toBeNull();expect(hidden.document.blocks[0].attrs.recipe).toBe(recipeId);
});


test('instructor picker requires document authority and pages only active site teachers; canonical save and public read use the selected teacher',async()=>{
 const f=await fixture();
 await f.t.run(async ctx=>{
  const setting=await ctx.db.query('settings').withIndex('by_section',q=>q.eq('section','plugins')).unique();await ctx.db.patch(setting!._id,{values:{lmsEnabled:true}});
  await ctx.db.patch(f.ids.user,{displayName:'Public instructor'});
  const {insertWithMediaReferences}=await import('../../media/attachmentGuard');
  await insertWithMediaReferences(ctx,'lms_courses',{title:'A public course',slug:'public-course',descriptionDoc:{text:'PRIVATE LESSON MATERIAL'},status:'published',accessMode:'open',authorId:f.ids.user,createdAt:1,updatedAt:1});
  for(let i=0;i<8;i++)await ctx.db.insert('users',{authSource:'management',displayName:'Hidden operator',email:'PRIVATE_OPERATOR',emailVerified:true,status:'active',createdAt:1,updatedAt:1});
 });
 const args={postId:f.ids.post,paginationOpts:{cursor:null as string|null,numItems:20}};
 await expect(f.t.query(reference('instructorOptions'),args)).rejects.toThrow();
 expect(await code(()=>f.as(f.ids.denied).query(reference('instructorOptions'),args))).toBe('FORBIDDEN');
 const rows=[];for(let i=0;i<10;i++){const page=await f.client.query(reference('instructorOptions'),args);expect(page.page.length).toBeLessThanOrEqual(6);rows.push(...page.page);if(page.isDone)break;args.paginationOpts.cursor=page.continueCursor;}
 expect(rows).toEqual([{id:f.ids.user,displayName:'Public instructor'}]);
 const blocks=[{id:'teacher',name:'lms/instructor',version:1,attrs:{instructor:f.ids.user}}];
 const current=await initialize(f);
 await f.client.mutation(reference('save','mutation'),{postId:f.ids.post,expectedRevision:current.revision,title:'Instructor study',blocks});
 await f.t.run(ctx=>ctx.db.patch(f.ids.post,{status:'publish'}));
 const rendered=await f.t.query(reference('getForRender'),{postId:f.ids.post});
 expect(rendered.data.dataByBlock.teacher.data.instructor.name).toBe('Public instructor');
 expect(rendered.data.dataByBlock.teacher.data.courses.map((c:any)=>c.title)).toEqual(['A public course']);
 expect(JSON.stringify(rendered)).not.toContain('PRIVATE LESSON MATERIAL');
});


test('learner progress course picker, canonical save and anonymous versus authenticated rendering use actual viewer authority',async()=>{
 const f=await fixture(),initial=await initialize(f);
 const course=await f.t.run(async ctx=>{
  const setting=await ctx.db.query('settings').withIndex('by_section',q=>q.eq('section','plugins')).unique();await ctx.db.patch(setting!._id,{values:{lmsEnabled:true}});
  const {insertWithMediaReferences}=await import('../../media/attachmentGuard');
  return insertWithMediaReferences(ctx,'lms_courses',{title:'Progress course',slug:'progress-course',descriptionDoc:{text:'PRIVATE COURSE BODY'},status:'published',accessMode:'open',authorId:f.ids.user,createdAt:1,updatedAt:1});
 });
 const args={postId:f.ids.post,paginationOpts:{cursor:null,numItems:6}};
 const options=await f.client.query(reference('courseOptions'),args);expect(options.page).toEqual([{id:course,title:'Progress course',slug:'progress-course'}]);
 await expect(f.t.query(reference('courseOptions'),args)).rejects.toThrow();expect(await code(()=>f.as(f.ids.denied).query(reference('courseOptions'),args))).toBe('FORBIDDEN');
 const blocks=[{id:'learning',name:'lms/progress',version:1,attrs:{scope:'course',course}}];
 await f.client.mutation(reference('save','mutation'),{postId:f.ids.post,expectedRevision:initial.revision,title:'Learning study',blocks});
 await f.t.run(ctx=>ctx.db.patch(f.ids.post,{status:'publish'}));
 const anonymous=await f.t.query(reference('getForRender'),{postId:f.ids.post});expect(anonymous.data.dataByBlock.learning.data).toEqual({state:'signedOut',items:[],cursor:null,nextCursor:null});
 const own=await f.client.query(reference('getForRender'),{postId:f.ids.post});expect(own.data.dataByBlock.learning.data.items[0].progress).toEqual({completed:0,total:0,percent:0});expect(JSON.stringify(own)).not.toContain('PRIVATE COURSE BODY');
 await f.t.run(ctx=>ctx.db.patch(course,{accessMode:'buy'}));const withdrawn=await f.client.query(reference('getForRender'),{postId:f.ids.post});expect(withdrawn.data.dataByBlock.learning.data.items).toEqual([]);
});


test('curriculum course selection persists through canonical save and public rendering without private lesson fields',async()=>{
 const f=await fixture(),initial=await initialize(f);
 const course=await f.t.run(async ctx=>{
  const setting=await ctx.db.query('settings').withIndex('by_section',q=>q.eq('section','plugins')).unique();await ctx.db.patch(setting!._id,{values:{lmsEnabled:true}});
  const {insertWithMediaReferences}=await import('../../media/attachmentGuard');
  const course=await insertWithMediaReferences(ctx,'lms_courses',{title:'Curriculum course',slug:'curriculum-course',descriptionDoc:{text:'PRIVATE COURSE BODY'},status:'published',accessMode:'buy',authorId:f.ids.user,createdAt:1,updatedAt:1});
  const topic=await ctx.db.insert('lms_nodes',{courseId:course,kind:'topic',title:'Foundations',position:0,createdAt:1,updatedAt:1});
  await ctx.db.insert('lms_nodes',{courseId:course,parentId:topic,kind:'lesson',title:'First steps',position:0,bodyDoc:{text:'PRIVATE LESSON BODY'},videoUrl:'https://private.invalid/lesson.mp4',createdAt:1,updatedAt:1});
  return course;
 });
 const options=await f.client.query(reference('courseOptions'),{postId:f.ids.post,paginationOpts:{cursor:null,numItems:6}});expect(options.page).toContainEqual({id:course,title:'Curriculum course',slug:'curriculum-course'});
 await f.client.mutation(reference('save','mutation'),{postId:f.ids.post,expectedRevision:initial.revision,title:'Curriculum study',blocks:[{id:'outline',name:'lms/curriculum',version:1,attrs:{course,expanded:true}}]});
 await f.t.run(ctx=>ctx.db.patch(f.ids.post,{status:'publish'}));
 const rendered=await f.t.query(reference('getForRender'),{postId:f.ids.post}),data=rendered.data.dataByBlock.outline.data;
 expect(data.course.id).toBe(course);expect(data.groups[0].topic.title).toBe('Foundations');expect(data.groups[0].entries[0].title).toBe('First steps');expect(JSON.stringify(rendered)).not.toContain('PRIVATE');expect(JSON.stringify(rendered)).not.toContain('lesson.mp4');
 await f.t.run(ctx=>ctx.db.patch(course,{status:'draft'}));const hidden=await f.t.query(reference('getForRender'),{postId:f.ids.post});expect(hidden.data.dataByBlock.outline.data.course).toBeNull();
});


test("help category picker is document-authorized and paginated; saved search keeps its category through publication and withdrawal", async () => {
  const f = await fixture(), initial = await initialize(f);
  const categories = await f.t.run(async ctx => {
    const setting = await ctx.db.query("settings").withIndex("by_section", q => q.eq("section", "plugins")).unique();
    await ctx.db.patch(setting!._id, { values: { knowledgeBaseEnabled: true } });
    const categories = [];
    for (let i = 0; i < 25; i++) categories.push(await ctx.db.insert("kb_categories", {
      name: `Help category ${i}`, slug: `help-${i}`, order: i, isActive: true, isPublished: true,
      articleCount: 0, createdAt: 1, updatedAt: 1,
    }));
    await ctx.db.insert("kb_categories", {
      name: "PRIVATE DRAFT", slug: "private-draft", order: -1, isActive: true, isPublished: false,
      articleCount: 0, createdAt: 1, updatedAt: 1,
    });
    return categories;
  });
  const args = { postId: f.ids.post, paginationOpts: { cursor: null as string | null, numItems: 10 } };
  await expect(f.t.query(reference("kbCategoryOptions"), args)).rejects.toThrow();
  expect(await code(() => f.as(f.ids.denied).query(reference("kbCategoryOptions"), args))).toBe("FORBIDDEN");
  const found: string[] = [];
  for (let i = 0; i < 4; i++) {
    const page = await f.client.query(reference("kbCategoryOptions"), args);
    expect(page.page.length).toBeLessThanOrEqual(10);
    expect(JSON.stringify(page)).not.toContain("PRIVATE DRAFT");
    found.push(...page.page.map((category: { id: string }) => category.id));
    if (page.isDone) break;
    args.paginationOpts.cursor = page.continueCursor;
  }
  expect(found).toEqual(categories);
  await f.client.mutation(reference("save", "mutation"), {
    postId: f.ids.post, expectedRevision: initial.revision, title: "Help library",
    blocks: [{ id: "help", name: "support/kb-search", version: 1, attrs: { category: categories[0], placeholder: "Search the guides" } }],
  });
  await f.t.run(ctx => ctx.db.patch(f.ids.post, { status: "publish" }));
  const rendered = await f.t.query(reference("getForRender"), { postId: f.ids.post });
  expect(rendered.document.blocks[0].attrs.category).toBe(categories[0]);
  expect(rendered.data.dataByBlock.help.data).toEqual({
    available: true, category: { id: categories[0], name: "Help category 0", slug: "help-0" }, articles: [],
  });
  await f.t.run(ctx => ctx.db.patch(categories[0], { isPublished: false }));
  const withdrawn = await f.t.query(reference("getForRender"), { postId: f.ids.post });
  expect(withdrawn.document.blocks[0].attrs.category).toBe(categories[0]);
  expect(withdrawn.data.dataByBlock.help.data).toEqual({ available: false, category: null, articles: [] });
});


test("album choices require document authority and preserve public-only pagination",async()=>{
 const f=await fixture();await f.t.run(async ctx=>{
  const setting=await ctx.db.query("settings").withIndex("by_section",q=>q.eq("section","plugins")).unique();await ctx.db.patch(setting!._id,{values:{galleryEnabled:true,membershipEnabled:false}});
  for(let i=0;i<24;i++)await ctx.db.insert("gallery_albums",{title:`Album ${i}`,slug:`album-${i}`,status:i===23?"draft":"publish",visibility:i===22?"private":"public",authorId:f.ids.user,categoryIds:[],description:"private-source-description",layoutPreset:"grid",columnsDesktop:3,columnsTablet:2,columnsMobile:1,lightboxEnabled:true,captionsEnabled:true,downloadEnabled:false,itemCount:0,publishedAt:i===21?Date.now()+3600000:1,createdAt:1,updatedAt:1});
 });const args={postId:f.ids.post,paginationOpts:{cursor:null,numItems:20}};
 await expect(f.t.query(reference("albumOptions"),args)).rejects.toThrow();await expect(f.as(f.ids.denied).query(reference("albumOptions"),args)).rejects.toThrow();
 const first=await f.client.query(reference("albumOptions"),args);expect(first.isDone).toBe(false);const second=await f.client.query(reference("albumOptions"),{...args,paginationOpts:{cursor:first.continueCursor,numItems:20}});
 const items=[...first.page,...second.page];expect(items).toHaveLength(21);expect(new Set(items.map((item:any)=>item.id)).size).toBe(21);expect(JSON.stringify(items)).not.toContain("private-source-description");
 for(const title of ["Album 21","Album 22","Album 23"])expect(items.map((item:any)=>item.title)).not.toContain(title);
 await expect(f.client.query(reference("albumOptions"),{...args,paginationOpts:{cursor:null,numItems:21}})).rejects.toThrow();
 await f.t.run(async ctx=>{const setting=await ctx.db.query("settings").withIndex("by_section",q=>q.eq("section","plugins")).unique();await ctx.db.patch(setting!._id,{values:{galleryEnabled:false}});});await expect(f.client.query(reference("albumOptions"),args)).rejects.toThrow("Enable Gallery");
});


test("album block saves, publishes, restores and withdraws its selected album through document endpoints",async()=>{
 const f=await fixture();const album=await f.t.run(async ctx=>{
  const user=await ctx.db.get(f.ids.user);await ctx.db.patch(user!.roleId!,{capabilities:["page.update","page.publish","revision.restore"]});
  const setting=await ctx.db.query("settings").withIndex("by_section",q=>q.eq("section","plugins")).unique();await ctx.db.patch(setting!._id,{values:{galleryEnabled:true,membershipEnabled:false}});
  return ctx.db.insert("gallery_albums",{title:"Collected moments",slug:"collected-moments",status:"publish",visibility:"public",authorId:f.ids.user,categoryIds:[],layoutPreset:"grid",columnsDesktop:3,columnsTablet:2,columnsMobile:1,lightboxEnabled:true,captionsEnabled:true,downloadEnabled:false,itemCount:0,publishedAt:1,createdAt:1,updatedAt:1});
 });
 const initial=await initialize(f),editor=await f.client.query(reference("get"),{postId:f.ids.post});expect(editor.policy.disabledBlocks).not.toContain("gallery/album");
 const blocks=[{id:"album-block",name:"gallery/album",version:1,attrs:{album}}];
 let saved=await f.client.mutation(reference("save","mutation"),{postId:f.ids.post,expectedRevision:initial.revision,title:"A weekend",blocks});
 saved=await f.client.mutation(reference("setPublication","mutation"),{postId:f.ids.post,expectedRevision:saved.revision,status:"publish"});
 const publicRead=()=>f.t.query(reference("getForRender"),{postId:f.ids.post});const live=await publicRead();expect(live.data.dataByBlock["album-block"].data.album.id).toBe(album);
 const history=await f.client.query(reference("pageRevisions"),{postId:f.ids.post,paginationOpts:{cursor:null,numItems:20}});const revision=history.page.find((entry:any)=>entry.blocksVersion===2);
 saved=await f.client.mutation(reference("save","mutation"),{postId:f.ids.post,expectedRevision:saved.revision,title:"A weekend",blocks:[]});
 await f.client.mutation(reference("restore","mutation"),{postId:f.ids.post,revisionId:revision.id,expectedRevision:saved.revision});expect((await publicRead()).document.blocks[0].attrs.album).toBe(album);
 await f.t.run(ctx=>ctx.db.patch(album,{visibility:"private"}));const withdrawn=await publicRead();expect(withdrawn.data.dataByBlock["album-block"].data.album).toBeNull();expect(withdrawn.document.blocks[0].attrs.album).toBe(album);
});


test("related content saves, publishes and restores through canonical endpoints with current document authority",async()=>{
 const f=await fixture();const candidate=await f.t.run(async ctx=>{
  const user=await ctx.db.get(f.ids.user);await ctx.db.patch(user!.roleId!,{capabilities:["page.update","page.publish","revision.restore"]});
  const term=await ctx.db.insert("terms",{name:"Design",slug:"design",taxonomy:"post_tag",count:1,isDefault:false,createdAt:1,updatedAt:1});
  await ctx.db.insert("termRelationships",{postId:f.ids.post,termId:term});
  const candidate=await ctx.db.insert("posts",{type:"post",title:"Related story",slug:"related-story",excerpt:"A public introduction",content:"PRIVATE SOURCE BODY",status:"publish",visibility:"public",authorId:f.ids.user,commentStatus:"closed",publishedAt:1,createdAt:1,updatedAt:1});
  await ctx.db.insert("termRelationships",{postId:candidate,termId:term});return candidate;
 });
 const initial=await initialize(f),editor=await f.client.query(reference("get"),{postId:f.ids.post});expect(editor.policy.disabledBlocks).not.toContain("core/related-content");
 const blocks=[{id:"related",name:"core/related-content",version:1,attrs:{type:"post",limit:3}}];
 let saved=await f.client.mutation(reference("save","mutation"),{postId:f.ids.post,expectedRevision:initial.revision,title:"Related study",blocks});
 expect(await f.t.query(reference("getForRender"),{postId:f.ids.post})).toBeNull();
 saved=await f.client.mutation(reference("setPublication","mutation"),{postId:f.ids.post,expectedRevision:saved.revision,status:"publish"});
 const publicRead=()=>f.t.query(reference("getForRender"),{postId:f.ids.post});const live=await publicRead();expect(live.data.dataByBlock.related.data.items[0].id).toBe(candidate);expect(JSON.stringify(live)).not.toContain("PRIVATE SOURCE BODY");
 const history=await f.client.query(reference("pageRevisions"),{postId:f.ids.post,paginationOpts:{cursor:null,numItems:20}});const revision=history.page.find((entry:any)=>entry.blocksVersion===2);
 saved=await f.client.mutation(reference("save","mutation"),{postId:f.ids.post,expectedRevision:saved.revision,title:"Related study",blocks:[]});
 await f.client.mutation(reference("restore","mutation"),{postId:f.ids.post,revisionId:revision.id,expectedRevision:saved.revision});expect((await publicRead()).document.blocks[0].name).toBe("core/related-content");
 await f.t.run(ctx=>ctx.db.patch(candidate,{visibility:"private"}));expect((await publicRead()).data.dataByBlock.related.data.items).toEqual([]);
});


test("archive list saves, publishes and restores its grouping through canonical endpoints",async()=>{
 const f=await fixture();await f.t.run(async ctx=>{
  const user=await ctx.db.get(f.ids.user);await ctx.db.patch(user!.roleId!,{capabilities:["page.update","page.publish","revision.restore"]});
  await ctx.db.insert("posts",{type:"post",title:"Archived story",slug:"archived-story",content:"PRIVATE ARCHIVE BODY",status:"publish",visibility:"public",authorId:f.ids.user,commentStatus:"closed",publishedAt:Date.UTC(2026,2,15),createdAt:1,updatedAt:1});
 });
 const initial=await initialize(f),editor=await f.client.query(reference("get"),{postId:f.ids.post});expect(editor.policy.disabledBlocks).not.toContain("core/archive-list");
 const blocks=[{id:"dates",name:"core/archive-list",version:1,attrs:{groupBy:"year",limit:3}}];
 let saved=await f.client.mutation(reference("save","mutation"),{postId:f.ids.post,expectedRevision:initial.revision,title:"Archive study",blocks});
 saved=await f.client.mutation(reference("setPublication","mutation"),{postId:f.ids.post,expectedRevision:saved.revision,status:"publish"});
 const publicRead=()=>f.t.query(reference("getForRender"),{postId:f.ids.post});const live=await publicRead();expect(live.data.dataByBlock.dates.data.items).toEqual([{year:2026,month:null,href:"/archive?year=2026"}]);expect(JSON.stringify(live)).not.toContain("PRIVATE ARCHIVE BODY");
 const history=await f.client.query(reference("pageRevisions"),{postId:f.ids.post,paginationOpts:{cursor:null,numItems:20}});const revision=history.page.find((entry:any)=>entry.blocksVersion===2);
 saved=await f.client.mutation(reference("save","mutation"),{postId:f.ids.post,expectedRevision:saved.revision,title:"Archive study",blocks:[]});
 await f.client.mutation(reference("restore","mutation"),{postId:f.ids.post,revisionId:revision.id,expectedRevision:saved.revision});expect((await publicRead()).document.blocks[0].attrs.groupBy).toBe("year");
});


test("language switcher survives canonical save, publication and revision restoration",async()=>{
 const f=await fixture();await f.t.run(async ctx=>{const user=await ctx.db.get(f.ids.user);await ctx.db.patch(user!.roleId!,{capabilities:["page.update","page.publish","revision.restore"]});});
 const initial=await initialize(f),editor=await f.client.query(reference("get"),{postId:f.ids.post});expect(editor.policy.disabledBlocks).not.toContain("core/language-switcher");
 const blocks=[{id:"languages",name:"core/language-switcher",version:1,attrs:{}}];let saved=await f.client.mutation(reference("save","mutation"),{postId:f.ids.post,expectedRevision:initial.revision,title:"Language study",blocks});saved=await f.client.mutation(reference("setPublication","mutation"),{postId:f.ids.post,expectedRevision:saved.revision,status:"publish"});
 const publicRead=()=>f.t.query(reference("getForRender"),{postId:f.ids.post});expect((await publicRead()).data.dataByBlock.languages.data).toEqual({enabled:false,currentLocale:null,items:[]});
 const history=await f.client.query(reference("pageRevisions"),{postId:f.ids.post,paginationOpts:{cursor:null,numItems:20}}),revision=history.page.find((entry:any)=>entry.blocksVersion===2);
 saved=await f.client.mutation(reference("save","mutation"),{postId:f.ids.post,expectedRevision:saved.revision,title:"Language study",blocks:[]});await f.client.mutation(reference("restore","mutation"),{postId:f.ids.post,revisionId:revision.id,expectedRevision:saved.revision});expect((await publicRead()).document.blocks[0].name).toBe("core/language-switcher");
});

test("RSVP event choices enforce document authority, pagination and enabled future events",async()=>{
 const f=await fixture();await f.t.run(async ctx=>{
  const setting=await ctx.db.query("settings").withIndex("by_section",q=>q.eq("section","plugins")).unique();await ctx.db.patch(setting!._id,{values:{eventsEnabled:true,formsEnabled:true,membershipEnabled:false}});
  for(let i=0;i<24;i++)await ctx.db.insert("extension_events",{title:`RSVP event ${i}`,slug:`rsvp-event-${i}`,description:"private-source-description",startsAt:i===20?1:Date.now()+86400000+i,endsAt:Date.now()+90000000+i,timeZone:"America/Denver",venue:"Studio",venueAddress:"",status:i===23?"draft":i===22?"cancelled":"published",rsvp:{mode:i===21?"closed":"guests",capacity:3,closesAt:null},createdBy:f.ids.user,createdAt:1,updatedAt:1});
 });const args={postId:f.ids.post,paginationOpts:{cursor:null,numItems:20}};
 await expect(f.t.query(reference("eventOptions"),args)).rejects.toThrow();await expect(f.as(f.ids.denied).query(reference("eventOptions"),args)).rejects.toThrow();
 const first=await f.client.query(reference("eventOptions"),args);expect(first.isDone).toBe(false);const second=await f.client.query(reference("eventOptions"),{...args,paginationOpts:{cursor:first.continueCursor,numItems:20}}),items=[...first.page,...second.page];expect(items).toHaveLength(20);expect(new Set(items.map((item:any)=>item.id)).size).toBe(20);expect(JSON.stringify(items)).not.toContain("private-source-description");for(const i of [20,21,22,23])expect(items.map((item:any)=>item.title)).not.toContain(`RSVP event ${i}`);
 await expect(f.client.query(reference("eventOptions"),{...args,paginationOpts:{cursor:null,numItems:21}})).rejects.toThrow();
 await f.t.run(async ctx=>{const setting=await ctx.db.query("settings").withIndex("by_section",q=>q.eq("section","plugins")).unique();await ctx.db.patch(setting!._id,{values:{eventsEnabled:true,formsEnabled:false}});});await expect(f.client.query(reference("eventOptions"),args)).rejects.toThrow("Enable Forms and an event plugin");
});

test("RSVP block saves, publishes, restores and withdraws its event through canonical endpoints",async()=>{
 const f=await fixture();const event=await f.t.run(async ctx=>{
  const setting=await ctx.db.query("settings").withIndex("by_section",q=>q.eq("section","plugins")).unique();await ctx.db.patch(setting!._id,{values:{eventsEnabled:true,formsEnabled:true,membershipEnabled:false}});const user=await ctx.db.get(f.ids.user);await ctx.db.patch(user!.roleId!,{capabilities:["page.update","page.publish","revision.restore"]});
  return ctx.db.insert("extension_events",{title:"Meet the makers",slug:"meet-the-makers",description:"",startsAt:Date.now()+86400000,endsAt:Date.now()+90000000,timeZone:"America/Denver",venue:"Studio",venueAddress:"",status:"published",rsvp:{mode:"guests",capacity:3,closesAt:null},createdBy:f.ids.user,createdAt:1,updatedAt:1});
 });const initial=await initialize(f),blocks=[{id:"rsvp",name:"core/event-rsvp",version:1,attrs:{event}}];
 const editor=await f.client.query(reference("get"),{postId:f.ids.post});expect(editor.policy.disabledBlocks).not.toContain("core/event-rsvp");
 let saved=await f.client.mutation(reference("save","mutation"),{postId:f.ids.post,expectedRevision:initial.revision,title:"Join us",blocks});
 saved=await f.client.mutation(reference("setPublication","mutation"),{postId:f.ids.post,expectedRevision:saved.revision,status:"publish"});const read=()=>f.t.query(reference("getForRender"),{postId:f.ids.post});expect((await read()).data.dataByBlock.rsvp.data.rsvp.eventId).toBe(event);
 const history=await f.client.query(reference("pageRevisions"),{postId:f.ids.post,paginationOpts:{cursor:null,numItems:20}}),revision=history.page.find((row:any)=>row.blocksVersion===2);
 saved=await f.client.mutation(reference("save","mutation"),{postId:f.ids.post,expectedRevision:saved.revision,title:"Join us",blocks:[]});await f.client.mutation(reference("restore","mutation"),{postId:f.ids.post,revisionId:revision.id,expectedRevision:saved.revision});expect((await read()).document.blocks[0].attrs.event).toBe(event);
 await f.t.run(ctx=>ctx.db.patch(event,{status:"draft"}));expect((await read()).data.dataByBlock.rsvp.data.rsvp).toBeNull();
});

test("authenticated preview filters gated roots but preserves raw authoring through save and reopen", async () => {
  const f = await fixture(), initial = await initialize(f);
  const blocks = [
    { id: "visible-preview", name: "core/paragraph", version: 2, attrs: {} },
    { id: "hidden-preview", name: "core/paragraph", version: 2, attrs: { body: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "KEEP_AUTHORED_SECRET" }] }] } } },
  ];
  await f.t.run(async ctx => {
    const plugins = (await ctx.db.query("settings").withIndex("by_section", q => q.eq("section", "plugins")).unique())!;
    await ctx.db.patch("settings", plugins._id, { values: { membershipEnabled: true } });
    const plan = await ctx.db.insert("membership_plans", { title: "Private preview", slug: "private-preview", status: "active", grantMode: "manual", priority: 1, createdAt: 1, updatedAt: 1 });
    await ctx.db.insert("membership_restriction_rules", { resourceType: "block", resourceIdOrKey: "hidden-preview", ruleMode: "allow_only", planIds: [plan], loginRequired: true, teaserMode: "hide", createdAt: 1, updatedAt: 1 });
  });
  await f.client.mutation(reference("save", "mutation"), { postId: f.ids.post, expectedRevision: initial.revision, title: "Preview page", blocks });
  const read = await f.client.query(reference("get"), { postId: f.ids.post });
  expect(read.document.blocks).toHaveLength(2);expect(JSON.stringify(read.document.blocks)).toContain("KEEP_AUTHORED_SECRET");
  expect(read.displayBlocks.map((row: {id:string}) => row.id)).toEqual(["visible-preview"]);
  expect(read.displayLease.expiresAt - read.displayLease.evaluatedAt).toBe(60000);
  expect(read.data.dataByBlock).toEqual({});expect(read.resources.media).toEqual({});
  const saved = await f.client.mutation(reference("save", "mutation"), { postId: f.ids.post, expectedRevision: read.document.revision, title: read.document.title, blocks: read.document.blocks });
  expect(saved.changed).toBe(false);
  const reopened = await f.client.query(reference("get"), { postId: f.ids.post });expect(reopened.document.blocks).toEqual(read.document.blocks);expect(reopened.document.digest).toBe(read.document.digest);
  for (const client of [f.t]) await expect(client.query(reference("get"), { postId: f.ids.post })).rejects.toThrow();
});

test("authenticated display expiry carries timed membership without changing authored revision", async () => {
  const f = await fixture(), now = Date.now();
  await initialize(f);
  await f.t.run(async ctx => {
    const plugins = (await ctx.db.query("settings").withIndex("by_section", q => q.eq("section", "plugins")).unique())!;
    await ctx.db.patch("settings", plugins._id, { values: { membershipEnabled: true } });
    await ctx.db.patch("posts", f.ids.post, { blocks: [{ id: "timed-preview", name: "core/paragraph", version: 2, attrs: {} }] });
    const plan = await ctx.db.insert("membership_plans", { title: "Preview", slug: "preview", status: "active", grantMode: "manual", priority: 1, createdAt: now, updatedAt: now });
    await ctx.db.insert("membership_grants", { userId: f.ids.user, planId: plan, sourceType: "manual", status: "active", startsAt: now - 1000, endsAt: now + 500, createdAt: now, updatedAt: now });
    await ctx.db.insert("membership_restriction_rules", { resourceType: "block", resourceIdOrKey: "timed-preview", ruleMode: "allow_only", planIds: [plan], loginRequired: true, teaserMode: "hide", createdAt: now, updatedAt: now });
  });
  try {
    setSystemTime(now);
    const before = await f.client.query(reference("get"), { postId: f.ids.post });expect(before.displayBlocks).toHaveLength(1);expect(before.displayLease.expiresAt).toBe(now + 500);
    setSystemTime(now + 500);
    const after = await f.client.query(reference("get"), { postId: f.ids.post });expect(after.displayBlocks).toEqual([]);expect(after.document).toEqual(before.document);
  } finally { setSystemTime(); }
});

test("gated authored media stays repairable without exposing a URL or bypassing save validation", async () => {
  const f = await fixture(); await initialize(f);
  await f.t.run(async ctx => {
    const plugins = (await ctx.db.query("settings").withIndex("by_section", q => q.eq("section", "plugins")).unique())!;
    await ctx.db.patch("settings", plugins._id, { values: { membershipEnabled: true } });
    const plan = await ctx.db.insert("membership_plans", { title: "Private media", slug: "private-media", status: "active", grantMode: "manual", priority: 1, createdAt: 1, updatedAt: 1 });
    await ctx.db.insert("membership_restriction_rules", { resourceType: "block", resourceIdOrKey: "hidden-image", ruleMode: "allow_only", planIds: [plan], loginRequired: true, teaserMode: "hide", createdAt: 1, updatedAt: 1 });
    await ctx.db.patch("posts", f.ids.post, { blocks: [{ id: "hidden-image", name: "core/image", version: 2, attrs: { mediaId: "invalid-private-image" } }] });
  });
  const read = await f.client.query(reference("get"), { postId: f.ids.post });
  expect(read.document.blocks[0].attrs.mediaId).toBe("invalid-private-image");expect(read.displayBlocks).toEqual([]);expect(read.resources.media).toEqual({});
  const before = await f.t.run(ctx => ctx.db.get("posts", f.ids.post));
  await expect(f.client.mutation(reference("save", "mutation"), { postId: f.ids.post, expectedRevision: read.document.revision, title: read.document.title, blocks: read.document.blocks })).rejects.toThrow();
  expect(await f.t.run(ctx => ctx.db.get("posts", f.ids.post))).toEqual(before);
});


test("ordinary editor drafts preview without AI permission and never write content or history", async () => {
  const f = await fixture();
  await f.t.run(ctx => ctx.db.patch("posts", f.ids.post, { contentMode: "blocks", blocksVersion: 2, blocksRevision: 3, blocks: [] }));
  const before = await f.t.run(async ctx => ({ post: await ctx.db.get("posts", f.ids.post), history: await ctx.db.query("revisions").collect() }));
  const args = { postId: f.ids.post, expectedRevision: 3, title: "Unsaved title", blocks: [{ id: "preview-heading", name: "core/heading", version: 2, attrs: {} }] };
  const result = await f.client.query(reference("previewDraft"), args);
  expect(result.document.title).toBe("Unsaved title");
  expect(result.document.blocks[0].id).toBe("preview-heading");
  expect(result.document.revision).toBe(3);
  expect(result.displayLease.expiresAt).toBeGreaterThan(Date.now());
  await expect(f.client.query(reference("previewDraft"), { ...args, expectedRevision: 2 })).rejects.toThrow();
  await expect(f.as(f.ids.denied).query(reference("previewDraft"), args)).rejects.toThrow();
  await expect(f.t.query(reference("previewDraft"), args)).rejects.toThrow();
  await expect(f.client.query(reference("previewDraft"), { ...args, blocks: [{ ...args.blocks[0], attrs: { unexpected: true } }] })).rejects.toThrow();
  expect(await f.t.run(async ctx => ({ post: await ctx.db.get("posts", f.ids.post), history: await ctx.db.query("revisions").collect() }))).toEqual(before);
});

for (const type of ["page", "post"] as const) test(`canonical ${type} visibility and write-only password changes preserve content and enforce access`, async () => {
  const f = await fixture();
  await f.t.run(async ctx => {
    await ctx.db.patch("posts", f.ids.post, { type });
    const user = await ctx.db.get("users", f.ids.user);
    const role = await ctx.db.get("roles", user!.roleId!);
    await ctx.db.patch("roles", role!._id, { capabilities: [...role!.capabilities, `${type}.publish`] });
  });
  const initial = await initialize(f);
  await f.client.mutation(reference("setPublication", "mutation"), { postId: f.ids.post, expectedRevision: initial.revision, status: "publish" });
  const first = await f.client.query(reference("getSettings"), { postId: f.ids.post });
  expect(first.visibility).toBe("public"); expect(first.hasPassword).toBe(false);
  await expect(f.client.mutation(reference("setSettings", "mutation"), settingsWrite(first, { visibility: "password" }))).rejects.toThrow("Enter a password");
  await f.client.mutation(reference("setSettings", "mutation"), settingsWrite(first, { visibility: "password", password: "first-secret" }));
  const protectedSettings = await f.client.query(reference("getSettings"), { postId: f.ids.post });
  expect(protectedSettings.hasPassword).toBe(true); expect(protectedSettings).not.toHaveProperty("password"); expect(JSON.stringify(protectedSettings)).not.toContain("first-secret");
  expect((await f.t.query(reference("getForRender"), { postId: f.ids.post })).state).toBe("restricted");
  expect((await f.t.query(reference("getForRender"), { postId: f.ids.post, password: "first-secret" })).state).toBe("ready");
  await f.client.mutation(reference("setSettings", "mutation"), settingsWrite(protectedSettings, { password: "second-secret" }));
  await expect(f.client.mutation(reference("setSettings", "mutation"), settingsWrite(protectedSettings, { visibility: "public" }))).rejects.toThrow("changed");
  expect((await f.t.query(reference("getForRender"), { postId: f.ids.post, password: "first-secret" })).state).toBe("restricted");
  expect((await f.t.query(reference("getForRender"), { postId: f.ids.post, password: "second-secret" })).state).toBe("ready");
  const current = await f.client.query(reference("getSettings"), { postId: f.ids.post });
  await f.client.mutation(reference("setSettings", "mutation"), settingsWrite(current, { visibility: "private" }));
  expect(await f.t.query(reference("getForRender"), { postId: f.ids.post, password: "second-secret" })).toBeNull();
  let row = await f.t.run(ctx => ctx.db.get("posts", f.ids.post));
  expect(row?.password).toBeUndefined(); expect(row?.blocks).toEqual(tree); expect(row?.status).toBe("publish");
  const history = await f.client.query(reference("pageRevisions"), { postId: f.ids.post, paginationOpts: { numItems: 20, cursor: null } });
  expect(JSON.stringify(history)).not.toContain("first-secret"); expect(JSON.stringify(history)).not.toContain("second-secret");
  const privateSettings = await f.client.query(reference("getSettings"), { postId: f.ids.post });
  await f.client.mutation(reference("restore", "mutation"), { postId: f.ids.post, revisionId: history.page[0].id, expectedRevision: privateSettings.revision });
  row = await f.t.run(ctx => ctx.db.get("posts", f.ids.post)); expect(row?.visibility).toBe("private"); expect(row?.password).toBeUndefined();
  const restored = await f.client.query(reference("getSettings"), { postId: f.ids.post });
  await f.client.mutation(reference("setSettings", "mutation"), settingsWrite(restored, { visibility: "public" }));
  expect((await f.t.query(reference("getForRender"), { postId: f.ids.post })).state).toBe("ready");
});
test("canonical access changes require publishing authority without blocking ordinary layout changes", async () => {
  const f = await fixture(); await initialize(f);
  const current = await f.client.query(reference("getSettings"), { postId: f.ids.post });
  await expect(f.client.mutation(reference("setSettings", "mutation"), settingsWrite(current, { visibility: "private" }))).rejects.toThrow();
  await expect(f.client.mutation(reference("setSettings", "mutation"), settingsWrite(current, { visibility: "password", password: "secret" }))).rejects.toThrow();
  await expect(f.client.mutation(reference("setSettings", "mutation"), settingsWrite(current, { visibility: "public", password: "secret" }))).rejects.toThrow("Choose password protection");
  expect((await f.client.mutation(reference("setSettings", "mutation"), settingsWrite(current, { hideFooter: true }))).changed).toBe(true);
  const row = await f.t.run(ctx => ctx.db.get("posts", f.ids.post)); expect(row?.status).toBe("draft"); expect(row?.visibility).toBe("public"); expect(row?.password).toBeUndefined();
});

test("canonical writes and recovery notify content listeners, while no-ops and conflicts stay silent", async () => {
  for (const type of ["page", "post"] as const) {
    const f = await fixture();
    await f.t.run(ctx => ctx.db.patch("posts", f.ids.post, { type }));
    const updates = () => f.t.run(async ctx => (await ctx.db.query("events").take(30)).filter(event => event.code === `${type}.updated`));
    const first = await initialize(f);
    expect(await updates()).toHaveLength(1);
    await f.client.mutation(reference("save", "mutation"), { postId: f.ids.post, expectedRevision: first.revision, title: "Disposable draft", blocks: tree });
    expect(await updates()).toHaveLength(1);
    const saved = await f.client.mutation(reference("save", "mutation"), { postId: f.ids.post, expectedRevision: first.revision, title: "Searchable changed title", blocks: tree });
    expect(await updates()).toHaveLength(2);
    await expect(f.client.mutation(reference("save", "mutation"), { postId: f.ids.post, expectedRevision: first.revision, title: "Stale title", blocks: tree })).rejects.toThrow();
    expect(await updates()).toHaveLength(2);
    const history = await f.client.query(reference("pageRevisions"), { postId: f.ids.post, paginationOpts: { cursor: null, numItems: 20 } });
    const original = history.page.find((row: any) => row.action === "restore-canonical")!;
    const restored = await f.client.mutation(reference("restore", "mutation"), { postId: f.ids.post, revisionId: original.id, expectedRevision: saved.revision });
    expect(await updates()).toHaveLength(3);
    const settings = await f.client.query(reference("getSettings"), { postId: f.ids.post });
    const settingsArgs = { postId: f.ids.post, expectedRevision: restored.revision, expectedSettingsDigest: settings.settingsDigest, slug: settings.slug + "-updated", pageTemplate: settings.pageTemplate, hideHeader: true, hideFooter: false };
    const changed = await f.client.mutation(reference("setSettings", "mutation"), settingsArgs);
    expect(await updates()).toHaveLength(4);
    expect(JSON.parse((await updates())[3]!.payload).changes).toContainEqual({ field: "slug", oldValue: settings.slug, newValue: settings.slug + "-updated" });
    const current = await f.client.query(reference("getSettings"), { postId: f.ids.post });
    await f.client.mutation(reference("setSettings", "mutation"), { ...settingsArgs, expectedRevision: current.revision, expectedSettingsDigest: current.settingsDigest });
    expect(await updates()).toHaveLength(4);
    const legacy = history.page.find((row: any) => row.action === "recover-legacy")!;
    await f.client.mutation(reference("recoverLegacy", "mutation"), { postId: f.ids.post, revisionId: legacy.id, expectedRevision: changed.revision });
    const events = await updates();
    expect(events).toHaveLength(5);
    for (const event of events) {
      expect(event.system).toBe(type);
      expect(JSON.parse(event.payload)).toMatchObject({ postId: f.ids.post, ...(type === "page" ? { pageId: f.ids.post } : {}) });
      expect(JSON.parse(event.payload)).not.toHaveProperty("blocks");
      expect(JSON.parse(event.payload)).not.toHaveProperty("content");
    }
  }
});


test("inactive legacy settings require exact reviewed acknowledgement and remain fully recoverable", async () => {
  const f=await fixture();
  const blocks=[{id:"old-heading",name:"core/heading",version:1,attrs:{text:"Preserve this appearance",level:2},layout:{tone:"contrast" as const,padding:"spacious" as const},lock:{edit:true,move:true}}];
  await f.t.run(ctx=>ctx.db.patch("posts",f.ids.post,{contentMode:"blocks",blocksVersion:1,blocks,content:"Hidden source"}));
  const review=await f.client.query(reference("prepareMigration"),{postId:f.ids.post});
  expect(review.inactiveSettings).toEqual([{blockId:"old-heading",name:"core/heading",layout:blocks[0].layout,lock:blocks[0].lock}]);
  expect(review.candidate.document.blocks[0].layout).toBeUndefined();
  expect(review.candidate.document.blocks[0].lock).toBeUndefined();
  const args={postId:f.ids.post,expectedRevision:review.source.revision,expectedAuthoringDigest:review.source.authoringDigest,expectedCandidateDigest:review.candidate.document.digest,expectedPresentationRevision:review.candidate.presentation.revision};
  for(const acknowledge of [undefined,false]) await expect(f.client.mutation(reference("migrate","mutation"),{...args,...(acknowledge===undefined?{}:{preserveInactiveSettings:acknowledge})})).rejects.toThrow();
  expect(await f.t.run(ctx=>ctx.db.query("revisions").collect())).toHaveLength(0);
  await f.t.run(ctx=>ctx.db.patch("posts",f.ids.post,{blocks:[{...blocks[0],lock:{edit:false}}]}));
  await expect(f.client.mutation(reference("migrate","mutation"),{...args,preserveInactiveSettings:true})).rejects.toThrow();
  await f.t.run(ctx=>ctx.db.patch("posts",f.ids.post,{blocks}));
  await expect(f.as(f.ids.denied).mutation(reference("migrate","mutation"),{...args,preserveInactiveSettings:true})).rejects.toThrow();
  const receipt=await f.client.mutation(reference("migrate","mutation"),{...args,preserveInactiveSettings:true});
  const history=await f.client.query(reference("pageRevisions"),{postId:f.ids.post,paginationOpts:{numItems:20,cursor:null}});
  expect(history.page[0].restorable).toBe(true);
  const stored=await f.t.run(ctx=>ctx.db.get("revisions",history.page[0].id));
  expect(stored!.blocks).toEqual(blocks);
  await f.client.mutation(reference("recoverLegacy","mutation"),{postId:f.ids.post,revisionId:history.page[0].id,expectedRevision:receipt.revision});
  const restored=await f.t.run(ctx=>ctx.db.get("posts",f.ids.post));
  expect(restored!.blocks).toEqual(blocks);
  expect(restored!.content).toBe("Hidden source");
  expect(restored!.blocksVersion).toBe(1);
});


test("long article paragraphs migrate, save, reopen and recover without splitting their authored structure", async () => {
  for (const structured of [false,true]) {
    const f=await fixture();
    const text="An article worth keeping. ".repeat(240);
    const originalBody={type:"doc",content:[{type:"paragraph",content:[{type:"text",text,marks:[{type:"italic"}]},{type:"hardBreak"},{type:"text",text:"Source",marks:[{type:"link",attrs:{href:"https://example.org/source"}}]}]}]};
    const originalContent=JSON.stringify(originalBody);
    await f.t.run(ctx=>ctx.db.patch("posts",f.ids.post,{type:"post",contentMode:"article",content:originalContent,...(structured?{hero:{content:text+"https://example.org/source"}}:{})}));
    const review=await f.client.query(reference("prepareMigration"),{postId:f.ids.post});
    const receipt=await f.client.mutation(reference("migrate","mutation"),{postId:f.ids.post,expectedRevision:review.source.revision,expectedAuthoringDigest:review.source.authoringDigest,expectedCandidateDigest:review.candidate.document.digest,expectedPresentationRevision:review.candidate.presentation.revision});
    const reopened=await f.client.query(reference("get"),{postId:f.ids.post});
    const block=structured?reopened.document.blocks[0].children[0]:reopened.document.blocks[0];
    expect(block.name).toBe("core/paragraph");
    expect(block.attrs.body.content).toHaveLength(1);
    if(!structured) expect(block.attrs.body).toEqual(originalBody);
    else expect(block.attrs.body.content[0].content.map((node:{text?:string})=>node.text??"").join("")).toBe(text+"https://example.org/source");
    block.attrs.body.content[0].content[0].text+="An editorial addition.";
    const saved=await f.client.mutation(reference("save","mutation"),{postId:f.ids.post,expectedRevision:receipt.revision,title:reopened.document.title,blocks:reopened.document.blocks});
    const savedRead=await f.client.query(reference("get"),{postId:f.ids.post});
    expect(savedRead.document.blocks).toEqual(reopened.document.blocks);
    const history=await f.client.query(reference("pageRevisions"),{postId:f.ids.post,paginationOpts:{numItems:20,cursor:null}});
    const original=history.page.find((row:{action:string})=>row.action==="recover-legacy");expect(original).toBeDefined();
    await f.client.mutation(reference("recoverLegacy","mutation"),{postId:f.ids.post,revisionId:original.id,expectedRevision:saved.revision});
    const restored=await f.t.run(ctx=>ctx.db.get("posts",f.ids.post));expect(restored!.content).toBe(originalContent);
    expect(restored!.hero).toEqual(structured?{content:text+"https://example.org/source"}:undefined);
  }
});


test("revision restore and original-editor recovery honor saved locks before creating history", async () => {
  const f = await fixture();
  await initialize(f);
  const before = await f.client.query(reference("get"), { postId: f.ids.post });
  const locked = before.document.blocks.map((block: any) => ({ ...block, lock: { edit: true, move: true, remove: true } }));
  // Change content before locking, so the older canonical revision is protected too.
  locked[0].anchor = "protected-revision";
  const saved = await f.client.mutation(reference("save", "mutation"), { postId: f.ids.post, expectedRevision: before.document.revision, title: before.document.title, blocks: locked });
  const history = await f.client.query(reference("pageRevisions"), { postId: f.ids.post, paginationOpts: { cursor: null, numItems: 20 } });
  const canonical = history.page.find((row: any) => row.action === "restore-canonical");
  const legacy = history.page.find((row: any) => row.action === "recover-legacy");
  expect(canonical).toBeDefined(); expect(legacy).toBeDefined();
  const stored = await f.t.run(ctx => ctx.db.get("posts", f.ids.post));
  for (const [name, revision] of [["restore", canonical], ["recoverLegacy", legacy]] as const) {
    await expect(f.client.mutation(reference(name, "mutation"), { postId: f.ids.post, revisionId: revision.id, expectedRevision: saved.revision })).rejects.toThrow();
    expect(await f.t.run(ctx => ctx.db.get("posts", f.ids.post))).toEqual(stored);
    expect(await f.client.query(reference("pageRevisions"), { postId: f.ids.post, paginationOpts: { cursor: null, numItems: 20 } })).toEqual(history);
  }
  const unlocked = await f.client.mutation(reference("save", "mutation"), { postId: f.ids.post, expectedRevision: saved.revision, title: before.document.title, blocks: locked.map((block: any) => ({ ...block, lock: {} })) });
  const restored = await f.client.mutation(reference("restore", "mutation"), { postId: f.ids.post, revisionId: canonical.id, expectedRevision: unlocked.revision });
  expect((await f.client.query(reference("get"), { postId: f.ids.post })).document.blocks).toEqual(before.document.blocks);
  await f.client.mutation(reference("recoverLegacy", "mutation"), { postId: f.ids.post, revisionId: legacy.id, expectedRevision: restored.revision });
  expect((await f.t.run(ctx => ctx.db.get("posts", f.ids.post)))!.blocksVersion).toBe(1);
});


test("audience visibility prunes public ancestors and resources while authorized editing retains every block", async () => {
  const f = await fixture(); await initialize(f);
  const heading = (id: string, text: string) => ({ id, name: "core/heading", version: 2, attrs: { text: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] } } });
  const blocks = [heading("everyone", "Everyone sees this"),
    { ...heading("members", "MEMBER_ONLY_COPY"), visibility: "signedIn" },
    { ...heading("guests", "GUEST_ONLY_COPY"), visibility: "signedOut" },
    { id: "member-section", name: "core/section", version: 1, attrs: {}, visibility: "signedIn", children: [heading("inherited", "INHERITED_MEMBER_COPY")] }];
  const saved = await f.client.mutation(reference("save", "mutation"), { postId: f.ids.post, expectedRevision: 1, title: "Audience controls", blocks });
  const editor = await f.client.query(reference("get"), { postId: f.ids.post });
  expect(editor.document.blocks.map((node: any) => node.id)).toEqual(blocks.map(node => node.id));
  expect(editor.displayBlocks.map((node: any) => node.id)).toEqual(blocks.map(node => node.id));
  await f.t.run(ctx => ctx.db.patch("posts", f.ids.post, { status: "publish", publishedAt: 1 }));
  const publicRead = (client = f.t) => client.query(reference("getForRender"), { postId: f.ids.post });
  const anonymous = await publicRead();
  expect(anonymous.document.blocks.map((node: any) => node.id)).toEqual(["everyone", "guests"]);
  expect(JSON.stringify(anonymous)).not.toContain("MEMBER_ONLY_COPY");
  expect(JSON.stringify(anonymous)).not.toContain("INHERITED_MEMBER_COPY");
  const signedIn = await publicRead(f.as(f.ids.denied));
  expect(signedIn.document.blocks.map((node: any) => node.id)).toEqual(["everyone", "members", "member-section"]);
  expect(JSON.stringify(signedIn)).not.toContain("GUEST_ONLY_COPY");
  expect(signedIn.document.blocks[2].children[0].id).toBe("inherited");
  await f.t.run(ctx => ctx.db.patch("users", f.ids.denied, { status: "inactive" }));
  expect((await publicRead(f.as(f.ids.denied))).document.blocks).toEqual(anonymous.document.blocks);
  const stale = f.t.withIdentity({ subject: "unmapped-customer", issuer: "https://fixture.clerk.accounts.dev" });
  expect((await publicRead(stale)).document.blocks).toEqual(anonymous.document.blocks);
  // Hidden media IDs must not trigger a resource lookup or appear in the DTO.
  await f.t.run(ctx => ctx.db.patch("posts", f.ids.post, { blocks: [...blocks, { id: "private-image", name: "core/image", version: 2, attrs: { mediaId: "invalid-hidden-media-id", alt: "PRIVATE_MEDIA" }, visibility: "signedIn" }] }));
  const withoutMedia = await publicRead();
  expect(JSON.stringify(withoutMedia)).not.toContain("invalid-hidden-media-id");
  expect(JSON.stringify(withoutMedia)).not.toContain("PRIVATE_MEDIA");
  expect(withoutMedia.resources.media).toEqual({});
  expect(saved.revision).toBe(2);
});

for(const membershipEnabled of [false,true])test(`registered reads retain an 80-page directory alongside selected and assigned nested menus (membership ${membershipEnabled})`, async () => {
  const f=await fixture();await initialize(f);
  const navigation = await f.t.run(async ctx=>{
    const plugins=await ctx.db.query('settings').withIndex('by_section',q=>q.eq('section','plugins')).unique();if(!plugins)throw Error();await ctx.db.patch('settings',plugins._id,{values:{membershipEnabled}});
    const pages=[];
    for(let i=0;i<80;i++)pages.push(await ctx.db.insert('posts',{type:'page',title:`Directory page ${i}`,slug:`entry-${i}`,path:`/draft/entry-${i}`,parentId:f.ids.post,menuOrder:i,status:'publish',visibility:'public',authorId:f.ids.user,commentStatus:'closed',createdAt:1,updatedAt:1}));
    const menu=await ctx.db.insert('menus',{name:'Directory links',slug:'directory-links',createdBy:f.ids.user,createdAt:1,updatedAt:1});
    const location = await ctx.db.insert('menuLocations',{slug:'sidebar',name:'Sidebar',menuId:menu,createdAt:1,updatedAt:1});
    for(let i=0;i<4;i++)await ctx.db.insert('menuItems',{menuId:menu,itemType:'custom',label:`Menu link ${i}`,url:'/draft',position:i,createdAt:1,updatedAt:1});
    let parentItemId;
    for(let i=0;i<6;i++)parentItemId=await ctx.db.insert('menuItems',{menuId:menu,itemType:'page',objectId:pages[i],label:`Nested ${i}`,parentItemId,position:i+4,createdAt:1,updatedAt:1});
    await ctx.db.patch('posts',f.ids.post,{status:'publish',publishedAt:1,blocks:[
      {id:'selected',name:'core/menu',version:1,attrs:{source:'menu',menu}},
      {id:'assigned',name:'core/menu',version:1,attrs:{source:'location',location:'sidebar'}},
      {id:'directory',name:'core/child-pages',version:1,attrs:{depth:4}},
    ]});
    return { pages, location };
  });
  const sessionId = await f.t.run(async ctx => {
    const user = (await ctx.db.get('users', f.ids.user))!, role = (await ctx.db.get('roles', user.roleId!))!, now = Date.now();
    await ctx.db.patch('roles', role._id, {capabilities:[...role.capabilities,'page.publish']});
    const managed = await ctx.db.insert('users', {email:'broker@example.invalid',emailVerified:true,status:'active',authSource:'management',roleId:role._id,createdAt:now,updatedAt:now});
    const authorityId = await ctx.db.insert('convexpress_managementAuthorities', {controllerId:'fixture',keyId:'key',publicKeyPem:'fixture',fingerprintSha256:'fixture',websiteKey:'fixture',instanceKey:'fixture-stage',capabilities:[],capabilityRevision:1,status:'active',notBefore:now-1000,enrolledAt:now,updatedAt:now});
    const bindingId = await ctx.db.insert('convexpress_managementBindings', {authorityId,controllerId:'fixture',syntheticOperatorId:'broker',userId:managed,capabilityRevision:1,status:'active',createdAt:now,updatedAt:now});
    return ctx.db.insert('convexpress_managementSessions', {authorityId,bindingId,userId:managed,tokenHash:'fixture',websiteKey:'fixture',instanceKey:'fixture-stage',capabilities:[],siteRoleSlug:'editor',siteCapabilities:[...role.capabilities,'page.publish'],capabilityRevision:1,expiresAt:now+60000,status:'active',createdAt:now});
  });
  const broker = f.t.withIdentity({subject:sessionId,issuer:'https://convexpress-management.local'});
  for(const client of [f.client,f.t,broker]){
    const result=await client.query(reference(client===f.t?'getForRender':'get'),{postId:f.ids.post});
    expect(result.data.dataByBlock.directory.data.items).toHaveLength(80);
    expect(result.data.dataByBlock.selected.data.items).toHaveLength(10);
    expect(result.data.dataByBlock.assigned.data).toEqual(result.data.dataByBlock.selected.data);
  }
  await f.t.run(ctx => ctx.db.patch('posts', f.ids.post, {status:'draft'}));
  const beforePublication = await broker.query(reference('get'), {postId:f.ids.post});
  const published = await broker.mutation(reference('setPublication','mutation'), {postId:f.ids.post,expectedRevision:beforePublication.document.revision,status:'publish'});
  expect(published.changed).toBe(true);
  // A new request must recheck both menu assignment and the current source's
  // visibility, even when the previous request shared its menu projection.
  await f.t.run(async ctx => {
    await ctx.db.patch('posts', navigation.pages[0], {visibility:'private'});
    await ctx.db.patch('menuLocations', navigation.location, {menuId:undefined});
  });
  const changed = await broker.query(reference('get'), {postId:f.ids.post});
  expect(changed.data.dataByBlock.directory.data.items).toHaveLength(79);
  expect(changed.data.dataByBlock.selected.data.items).toHaveLength(4);
  expect(changed.data.dataByBlock.assigned.data).toEqual({menu:null,items:[]});
});

test('author bio resolves an exact active site author and withdraws it without disclosing account fields', async () => {
  const f = await fixture(); await initialize(f);
  await f.t.run(async ctx => {
    await ctx.db.patch('users', f.ids.denied, {displayName:'Public author',bio:'A public biography',slug:'public-author'});
    await ctx.db.patch('posts', f.ids.post, {status:'publish',blocks:[{id:'bio',name:'core/author-bio',version:2,attrs:{userId:f.ids.denied}}]});
  });
  const read = () => f.t.query(reference('getForRender'), {postId:f.ids.post});
  const result = await read();
  expect(result.data.dataByBlock.bio.data.author).toEqual({id:f.ids.denied,name:'Public author',bio:'A public biography',href:'/author/public-author',image:null});
  expect(JSON.stringify(result)).not.toContain('denied@example.invalid');
  await f.t.run(ctx => ctx.db.patch('users', f.ids.denied, {status:'inactive'}));
  expect((await read()).data.dataByBlock.bio.data.author).toBeNull();
  await f.t.run(ctx => ctx.db.patch('users', f.ids.denied, {status:'active',authSource:'management'}));
  expect((await read()).data.dataByBlock.bio.data.author).toBeNull();
});
test('author bio selected and manual cards survive actual save, preview, restore and publication',async()=>{
 const f=await fixture();await initialize(f);
 await f.t.run(async ctx=>{
  const user=(await ctx.db.get('users',f.ids.user))!;await ctx.db.patch('roles',user.roleId!,{capabilities:['page.update','page.publish','revision.restore']});
  await ctx.db.patch('users',f.ids.denied,{displayName:'Public writer',bio:'Current profile',slug:'writer'});
 });
 const blocks=[{id:'selected',name:'core/author-bio',version:2,attrs:{userId:f.ids.denied,name:'Authored name',role:'Guest',bio:'Authored biography',links:[{label:'Notes',href:'/notes'}]}},{id:'manual',name:'core/author-bio',version:2,attrs:{name:'Manual writer',bio:'Manual card'}},{id:'current',name:'core/author-bio',version:2,attrs:{useCurrentAuthor:true}}];
 let opened=await f.client.query(reference('get'),{postId:f.ids.post});
 expect(opened.policy.disabledBlocks).not.toContain('core/author-bio');
 const args={postId:f.ids.post,expectedRevision:opened.document.revision,title:opened.document.title,blocks};
 const preview=await f.client.query(reference('previewDraft'),args);expect(preview.data.dataByBlock.selected.data.author.id).toBe(f.ids.denied);
 const saved=await f.client.mutation(reference('save','mutation'),args);
 opened=await f.client.query(reference('get'),{postId:f.ids.post});const first=opened.document.blocks;expect(first[0].attrs).toMatchObject(blocks[0].attrs);
 const changed=structuredClone(first);changed[0].attrs.name='Changed name';
 const edited=await f.client.mutation(reference('save','mutation'),{...args,blocks:changed,expectedRevision:saved.revision});
 const history=await f.client.query(reference('pageRevisions'),{postId:f.ids.post,paginationOpts:{cursor:null,numItems:20}});
 const prior=history.page.find((row:any)=>row.revisionNumber===edited.revision);expect(prior).toBeDefined();
 const restored=await f.client.mutation(reference('restore','mutation'),{postId:f.ids.post,expectedRevision:edited.revision,revisionId:prior.id});
 expect((await f.client.query(reference('get'),{postId:f.ids.post})).document.blocks).toEqual(first);
 await f.client.mutation(reference('setPublication','mutation'),{postId:f.ids.post,expectedRevision:restored.revision,status:'publish'});
 const rendered=await f.t.query(reference('getForRender'),{postId:f.ids.post});expect(rendered.data.dataByBlock.selected.data.author.name).toBe('Public writer');expect(rendered.data.dataByBlock.manual.data.author).toBeNull();expect(rendered.data.dataByBlock.current.data.author.id).toBe(f.ids.user);
});
test('current author follows the authorized host document and never silently changes existing manual cards',async()=>{
 const f=await fixture();await initialize(f);
 await f.t.run(async ctx=>{await ctx.db.patch('users',f.ids.denied,{displayName:'Current post writer',slug:'current-writer'});});
 let opened=await f.client.query(reference('get'),{postId:f.ids.post});
 const blocks=[{id:'current',name:'core/author-bio',version:2,attrs:{useCurrentAuthor:true}},{id:'manual',name:'core/author-bio',version:2,attrs:{name:'Preserved manual author'}}];
 await f.client.mutation(reference('save','mutation'),{postId:f.ids.post,expectedRevision:opened.document.revision,title:opened.document.title,blocks});
 await f.t.run(ctx=>ctx.db.patch('posts',f.ids.post,{authorId:f.ids.denied,status:'publish'}));
 let result=await f.t.query(reference('getForRender'),{postId:f.ids.post});expect(result.data.dataByBlock.current.data.author.id).toBe(f.ids.denied);expect(result.data.dataByBlock.manual.data.author).toBeNull();
 await f.t.run(ctx=>ctx.db.patch('posts',f.ids.post,{authorId:f.ids.user}));result=await f.t.query(reference('getForRender'),{postId:f.ids.post});expect(result.data.dataByBlock.current.data.author.id).toBe(f.ids.user);
 await f.t.run(ctx=>ctx.db.patch('users',f.ids.user,{authSource:'management'}));expect((await f.t.query(reference('getForRender'),{postId:f.ids.post})).data.dataByBlock.current.data.author).toBeNull();
});
