import { expect, test } from "bun:test";
import { planCanonicalData } from "./planner";
import { resolveCanonicalData, validateCanonicalData } from "./resolve";
import { resolveCanonicalPageData } from "./server";
import { DATA_LIMITS } from "./contracts";
import { commerceHarness } from "../convex/commerce/__tests__/handlerHarness.test-support";
const scope = { websiteKey: "website_alpha", instanceKey: "instance_staging" };
const policy = {
	enabledPlugins: [],
	capabilities: ["reference.targetResolution", "tree.children"],
	disabledBlocks: [],
};
const featured = (id = "block1", page?: string) => ({
	id,
	name: "core/featured-page",
	version: 1,
	attrs: page ? { page } : {},
});
const card = (id: string) => ({
	page: {
		id,
		title: "A public page",
		href: "/public-page",
		excerpt: "Public summary",
		image: null,
	},
});
test("trusted generated args, dedup and matching trust envelope are exact", async () => {
	const calls: unknown[] = [];
	const tree = [
		featured("first", "page"),
		featured("second", "page"),
		featured("empty"),
	];
	const result = await resolveCanonicalData(
		tree,
		scope,
		policy,
		async (args) => {
			calls.push(args);
			return args.page ? card(args.page) : { page: null };
		},
	);
	expect(calls).toEqual([{ page: "page" }, {}]);
	expect(Object.keys(result.dataByBlock)).toEqual(["first", "second", "empty"]);
	expect(validateCanonicalData(tree, scope, policy, result)).toEqual(result);
	for (const foreign of [
		{ ...result, scope: { ...scope, instanceKey: "live" } },
		{
			...result,
			dataByBlock: { ...result.dataByBlock, extra: result.dataByBlock.first },
		},
		{
			...result,
			dataByBlock: {
				...result.dataByBlock,
				first: { ...result.dataByBlock.first, bindingKey: "forged" },
			},
		},
	])
		expect(() => validateCanonicalData(tree, scope, policy, foreign)).toThrow();
	expect(() =>
		validateCanonicalData(
			[
				featured("first", "changed"),
				featured("second", "page"),
				featured("empty"),
			],
			scope,
			policy,
			result,
		),
	).toThrow();
});
test("all tree/policy/budget refusals happen before any reader is called", async () => {
	const badTrees = [
		[featured(), featured()],
		[{ ...featured(), version: 2 }],
		[{ ...featured(), data: { resolver: "arbitrary:function", args: {} } }],
		[{ ...featured(), innerBlocks: [] }],
		[{ ...featured(), attrs: { page: "page", args: { secret: true } } }],
		[{ id: "posts", name: "core/post-grid", version: 1, attrs: {} }],
		Array.from({ length: DATA_LIMITS.nodes + 1 }, (_, i) => featured(`b${i}`)),
		Array.from({ length: DATA_LIMITS.uniqueCalls + 1 }, (_, i) =>
			featured(`b${i}`, `page${i}`),
		),
		Array.from({ length: 9 }, (_, i) => featured(`b${i}`, "same-page")),
		[{ ...featured(), attrs: { ctaLabel: "x".repeat(DATA_LIMITS.treeBytes) } }],
	];
	let nested: unknown = featured();
	for (let i = 0; i < 8; i++)
		nested = {
			id: `group${i}`,
			name: "core/stack",
			version: 1,
			attrs: {},
			children: [nested],
		};
	badTrees.push([nested] as any);
	for (const tree of badTrees) {
		let reads = 0;
		await expect(
			resolveCanonicalData(tree, scope, policy, async () => {
				reads++;
				return { page: null };
			}),
		).rejects.toBeDefined();
		expect(reads).toBe(0);
	}
	for (const restrictive of [
		{ ...policy, capabilities: [] },
		{ ...policy, disabledBlocks: ["core/featured-page"] },
	])
		expect(() => planCanonicalData([featured()], scope, restrictive)).toThrow();
	expect(
		planCanonicalData(
			Array.from({ length: 80 }, (_, i) => featured(`b${i}`)),
			scope,
			policy,
		).jobs,
	).toHaveLength(1);
	expect(
		planCanonicalData(
			Array.from({ length: 8 }, (_, i) => featured(`b${i}`, `page${i}`)),
			scope,
			policy,
		).jobs,
	).toHaveLength(8);
});
test("server rejects unpublished, restricted, deleted, non-page and foreign IDs without exposing private payloads", async () => {
	for (const state of [
		"public",
		"draft",
		"private",
		"password",
		"resource",
		"route",
		"homepage",
		"deleted",
		"nonpage",
		"foreign",
	]) {
		const ctx = commerceHarness(
			{
				convexpress_siteIdentity: [{ identityKey: "site-identity", ...scope }],
				posts:
					state === "deleted"
						? []
						: [
								{
									_id: "page",
									type: state === "nonpage" ? "post" : "page",
									title: "Public title",
									slug: "public-page",
									path: "/public-page",
									status: state === "draft" ? "draft" : "publish",
									visibility:
										state === "private"
											? "private"
											: state === "password"
												? "password"
												: "public",
									excerpt: "Public summary",
									content: "Never return body",
									blocks: [],
									password: "Never return password",
								},
							],
			},
			null,
		);
		if (["resource", "route", "homepage"].includes(state)) {
			ctx.tables.settings[0].values.membershipEnabled = true;
			ctx.tables.membership_restriction_rules = [
				{
					resourceType: state === "resource" ? "page" : "route",
					resourceIdOrKey:
						state === "resource"
							? "page"
							: state === "homepage"
								? "/"
								: "/public-page",
					ruleMode: "allow_only",
					planIds: ["required"],
					teaserMode: "excerpt",
				},
			];
			if (state === "homepage")
				ctx.tables.settings.push({
					section: "reading",
					values: { homepageDisplays: "static_page", homepageId: "page" },
				});
		}
		let postReads = 0;
		const get = ctx.db.get;
		ctx.db.get = async (...args: any[]) => {
			if (args[0] === "posts") postReads++;
			return get(...args);
		};
		const result = await resolveCanonicalPageData(
			ctx,
			[
				featured("a", state === "foreign" ? "foreign-site-page" : "page"),
				featured("b", state === "foreign" ? "foreign-site-page" : "page"),
			],
			scope,
			policy,
		);
		expect(postReads).toBe(1);
		expect(result.dataByBlock.a.data.page === null).toBe(state !== "public");
		expect(JSON.stringify(result)).not.toContain("Never return");
	}
});
test("identity mismatch, malformed targets and leaking or oversized DTOs fail closed", async () => {
	const ctx = commerceHarness({
		convexpress_siteIdentity: [
			{ identityKey: "site-identity", ...scope, instanceKey: "other" },
		],
	});
	await expect(
		resolveCanonicalPageData(ctx, [featured("a", "page")], scope, policy),
	).rejects.toMatchObject({ code: "SCOPE_MISMATCH" });
	for (const result of [
		{ ...card("page"), secret: "forbidden" },
		card("wrong-page"),
		{
			page: {
				...card("page").page,
				title: "x".repeat(DATA_LIMITS.resultBytes + 1),
			},
		},
	])
		await expect(
			resolveCanonicalData(
				[featured("a", "page")],
				scope,
				policy,
				async () => result,
			),
		).rejects.toBeDefined();
	const invalid = commerceHarness({
		convexpress_siteIdentity: [{ identityKey: "site-identity", ...scope }],
	});
	invalid.db.normalizeId = () => null;
	expect(
		(
			await resolveCanonicalPageData(
				invalid,
				[featured("a", "not-a-real-id")],
				scope,
				policy,
			)
		).dataByBlock.a.data.page,
	).toBeNull();
});
test("shared policy read failures propagate instead of becoming an unrestricted page", async () => {
  const ctx = commerceHarness({
    convexpress_siteIdentity: [{ identityKey: "site-identity", ...scope }],
    posts: [{ _id: "page", type: "page", title: "Public", slug: "public", status: "publish", visibility: "public" }],
  }, null);
  ctx.tables.settings[0].values.membershipEnabled = true;
  const query = ctx.db.query;
  ctx.db.query = (table: string) => {
    const builder = query(table);
    if (table === "membership_restriction_rules") {
      builder.collect = async () => { throw Error("POLICY_READ_REFUSED"); };
      builder.paginate = async () => { throw Error("POLICY_READ_REFUSED"); };
    }
    return builder;
  };
  await expect(resolveCanonicalPageData(ctx, [featured("a", "page")], scope, policy)).rejects.toThrow("POLICY_READ_REFUSED");
});

test("full raw post and media documents are charged before dependent reads", async () => {
  const { SOURCE_LIMITS } = await import("./sourceBudget");
  const publicPost = { _id: "page", type: "page", title: "Public", slug: "public", status: "publish", visibility: "public", featuredImageId: "image" };
  for (const kind of ["post", "media"] as const) {
    const ctx = commerceHarness({
      convexpress_siteIdentity: [{ identityKey: "site-identity", ...scope }],
      posts: [{ ...publicPost, content: kind === "post" ? "x".repeat(SOURCE_LIMITS.post) : "A small body" }],
      media: [{ _id: "image", status: "ready", storageId: "stored", url: "https://example.invalid/image.png", metadata: { ignored: kind === "media" ? "x".repeat(SOURCE_LIMITS.media) : "" } }],
    }, null);
    const trace: string[] = [];
    const get = ctx.db.get, query = ctx.db.query;
    ctx.db.get = async (...args: any[]) => { trace.push(`get:${args[0]}`); return get(...args); };
    ctx.db.query = (table: string) => { trace.push(`query:${table}`); return query(table); };
    ctx.storage = { getUrl: async () => { trace.push("storage-url"); return "https://example.invalid/stored.png"; } };
    await expect(resolveCanonicalPageData(ctx, [featured("a", "page")], scope, policy)).rejects.toMatchObject({ code: "SOURCE_DOCUMENT_BUDGET", path: kind });
    expect(trace.at(-1)).toBe(`get:${kind === "post" ? "posts" : "media"}`);
    expect(trace).not.toContain("storage-url");
  }
});

test("cumulative source budget refuses later jobs and resets for each request", async () => {
  const posts = Array.from({ length: 6 }, (_, i) => ({ _id: `page${i}`, type: "page", title: "Public", slug: `public-${i}`, status: "publish", visibility: "public", content: "x".repeat(450 * 1024) }));
  const ctx = commerceHarness({ convexpress_siteIdentity: [{ identityKey: "site-identity", ...scope }], posts }, null);
  const trace: string[] = [], get = ctx.db.get, query = ctx.db.query;
  ctx.db.get = async (...args: any[]) => { trace.push(`get:${args.at(-1)}`); return get(...args); };
  ctx.db.query = (table: string) => { trace.push(`query:${table}`); return query(table); };
  await expect(resolveCanonicalPageData(ctx, posts.map((row, i) => featured(`b${i}`, row._id)), scope, policy)).rejects.toMatchObject({ code: "SOURCE_TOTAL_BUDGET" });
  expect(trace.at(-1)).toBe("get:page4");
  expect(trace).not.toContain("get:page5");
  const result = await resolveCanonicalPageData(ctx, [featured("fresh", "page0")], scope, policy);
  expect(result.dataByBlock.fresh.data.page?.title).toBe("Public");
  expect(JSON.stringify(result)).not.toContain(posts[0].content);
});

test("one authoritative discovery check preserves detail summary and featured-image behavior", async () => {
  const { readPublicContent, contentFeaturedImage } = await import("../convex/helpers/publicContent");
  for (const mediaState of ["stored", "url", "trashed", "missing"]) {
    const post = { _id: "page", type: "page", title: "A public summary", slug: "public", path: "/public", status: "publish", visibility: "public", excerpt: "Keep this exact text", content: "Do not project body", featuredImageId: "image" };
    const ctx = commerceHarness({
      convexpress_siteIdentity: [{ identityKey: "site-identity", ...scope }], posts: [post],
      media: mediaState === "missing" ? [] : [{ _id: "image", status: mediaState === "trashed" ? "trashed" : "ready", ...(mediaState === "stored" ? { storageId: "stored" } : {}), url: "https://example.invalid/authored.png", altText: "Authored image alternative" }],
    }, null);
    ctx.storage = { getUrl: async () => "https://example.invalid/storage.png" };
    const oldSummary = await readPublicContent(ctx, post as any);
    const oldImage = await contentFeaturedImage(ctx, post as any);
    let pluginReads = 0;
    const query = ctx.db.query;
    ctx.db.query = (table: string) => {
      const builder = query(table), index = builder.withIndex;
      builder.withIndex = (name: string, callback?: any) => {
        if (table === "settings") {
          const probe = { eq(field: string, value: string) { if (field === "section" && value === "plugins") pluginReads++; return probe; } };
          callback?.(probe);
        }
        return index.call(builder, name, callback);
      };
      return builder;
    };
    const result = (await resolveCanonicalPageData(ctx, [featured("a", "page")], scope, policy)).dataByBlock.a.data.page;
    expect(result).toEqual({ id: "page", title: oldSummary!.title, href: oldSummary!.path, excerpt: oldSummary!.excerpt, image: oldImage.featuredImageUrl ? { src: oldImage.featuredImageUrl, alt: oldImage.featuredImageAlt } : null });
    // Current page policy covers the resource, stored /public route and served
    // /page/public alias once each. A second detail projection would repeat them.
    expect(pluginReads).toBe(3);
  }
});

test("current member access is rechecked and revoked or password content never reads image URLs", async () => {
  const { readPublicContent } = await import("../convex/helpers/publicContent");
  const post = { _id: "page", type: "page", title: "Member summary", slug: "member", status: "publish", visibility: "public", excerpt: "Exact member excerpt", content: "Authored member body", featuredImageId: "image" };
  const ctx = commerceHarness({
    convexpress_siteIdentity: [{ identityKey: "site-identity", ...scope }], posts: [post],
    media: [{ _id: "image", status: "ready", storageId: "stored", altText: "Member image" }],
    membership_restriction_rules: [{ resourceType: "page", resourceIdOrKey: "page", ruleMode: "allow_only", planIds: ["plan"], teaserMode: "hide", loginRequired: true }],
    membership_plans: [{ _id: "plan", status: "active" }],
    membership_grants: [{ _id: "grant", userId: "admin", planId: "plan", status: "active", startsAt: 1 }],
  });
  ctx.tables.settings[0].values.membershipEnabled = true;
  let imageUrls = 0;
  ctx.storage = { getUrl: async () => { imageUrls++; return "https://example.invalid/member.png"; } };
  const before = await readPublicContent(ctx, post as any);
  expect(before?.membershipAccess.allowed).toBe(true);
  const allowed = (await resolveCanonicalPageData(ctx, [featured("a", "page")], scope, policy)).dataByBlock.a.data.page;
  expect(allowed?.excerpt).toBe(before?.excerpt);
  expect(allowed?.title).toBe(before?.title);
  expect(imageUrls).toBe(1);
  ctx.tables.membership_grants[0].status = "revoked";
  expect((await resolveCanonicalPageData(ctx, [featured("a", "page")], scope, policy)).dataByBlock.a.data.page).toBeNull();
  expect(imageUrls).toBe(1);
  ctx.tables.membership_grants[0].status = "active";
  ctx.tables.posts[0].visibility = "password";
  expect((await resolveCanonicalPageData(ctx, [featured("a", "page")], scope, policy)).dataByBlock.a.data.page).toBeNull();
  expect(imageUrls).toBe(1);
});

test("overlong authored summaries refuse without truncation or image work", async () => {
  const ctx = commerceHarness({
    convexpress_siteIdentity: [{ identityKey: "site-identity", ...scope }],
    posts: [{ _id: "page", type: "page", status: "publish", visibility: "public", title: "x".repeat(513), slug: "public", featuredImageId: "image" }],
  }, null);
  let mediaReads = 0;
  const get = ctx.db.get;
  ctx.db.get = async (...args: any[]) => { if (args[0] === "media") mediaReads++; return get(...args); };
  await expect(resolveCanonicalPageData(ctx, [featured("a", "page")], scope, policy)).rejects.toMatchObject({ code: "INVALID_RESOLVER_RESULT", path: "summary" });
  expect(mediaReads).toBe(0);
  expect(ctx.tables.posts[0].title.length).toBe(513);
});
