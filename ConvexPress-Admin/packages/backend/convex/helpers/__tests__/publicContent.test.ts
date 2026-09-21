// @ts-ignore Bun tests execute registered Convex handlers with an in-memory DB.
import { describe, expect, test } from "bun:test";
import * as posts from "../../posts/queries";
import * as pages from "../../pages/queries";
import * as feeds from "../../feeds/queries";
import * as search from "../../search/queries";
import * as postHttp from "../../posts/httpInternals";
import * as pageHttp from "../../pages/httpInternals";
import { getFunctionName } from "convex/server";
import * as policyReads from "../../membership/policyReads";
import * as profiles from "../../profiles/queries";

type Row = Record<string, any>;
const SECRET = "UNRELEASED_BODY_MARKER";
const PRIVATE_FIELDS = [
	"password",
	"autosaveContent",
	"autosaveTitle",
	"autosavedAt",
	"pagePrompt",
	"wpSourceSiteId",
];
const BODY_FIELDS = [
	"content",
	"blocks",
	"pageSections",
	"hero",
	"topics",
	"summary",
	"sources",
	"tableOfContents",
];

function document(overrides: Row = {}): Row {
	return {
		_id: "post1",
		_creationTime: 1,
		type: "post",
		status: "publish",
		visibility: "public",
		title: "Public title",
		slug: "public-title",
		path: "/public-title",
		authorId: "author",
		content: SECRET,
		excerpt: "Public teaser",
		contentMode: "blocks",
		blocks: [
			{ id: "b1", name: "core/text", version: 1, attrs: { text: SECRET } },
		],
		pageSections: [{ content: SECRET }],
		hero: { content: SECRET },
		topics: [{ content: SECRET }],
		summary: { content: SECRET },
		sources: SECRET,
		tableOfContents: SECRET,
		password: "synthetic-password",
		autosaveContent: SECRET,
		autosaveTitle: SECRET,
		autosavedAt: 2,
		pagePrompt: SECRET,
		wpSourceSiteId: "private-source",
		commentStatus: "open",
		isSticky: true,
		createdAt: 1,
		updatedAt: 1,
		publishedAt: 1,
		...overrides,
	};
}

/** Implements DB operations, not access logic; all authorization runs in production handlers. */
function fixture(
	docs: Row[],
	options: {
		actor?: "subscriber" | "editor";
		restricted?: boolean;
		member?: boolean;
	} = {},
) {
	const user = {
		_id: "reader",
		clerkUserId: "clerk_reader",
		email: "synthetic@example.invalid",
		authSource: options.actor === "editor" ? "local" : "clerk",
		roleId: "role1",
		status: "active",
	};
	const tables: Record<string, Row[]> = {
		posts: docs,
		users: options.actor ? [user] : [],
		roles: [
			{
				_id: "role1",
				slug: options.actor,
				status: "active",
				type: options.actor === "editor" ? "internal" : "customer",
				level: options.actor === "editor" ? 80 : 10,
				capabilities:
					options.actor === "editor"
						? [
								"post.read",
								"post.update",
								"page.read",
								"page.update",
								"page.read_private",
							]
						: [],
			},
		],
		settings: [
			{
				_id: "plugins",
				section: "plugins",
				values: { membershipEnabled: Boolean(options.restricted) },
			},
			{
				_id: "reading",
				section: "reading",
				values: { homepageDisplays: "static_page", homepageId: docs[0]?._id },
			},
		],
		membership_restriction_rules: options.restricted
			? docs.map((doc) => ({
					_id: `rule_${doc._id}`,
					resourceType: doc.type,
					resourceIdOrKey: doc._id,
					ruleMode: "allow_only",
					planIds: ["plan1"],
					teaserMode: "excerpt",
				}))
			: [],
		membership_grants: options.member
			? [{ _id: "grant1", userId: "reader", planId: "plan1", startsAt: 0, status: "active" }]
			: [],
		membership_plans: [{ _id: "plan1", status: "active" }],
		searchIndex: docs.map((doc) => ({
			_id: `index_${doc._id}`,
			contentType: doc.type,
			contentId: doc._id,
			title: doc.title,
			content: SECRET,
			excerpt: SECRET,
			status: "publish",
			url: doc.path,
			authorName: "Public author",
			indexedAt: 1,
			updatedAt: 1,
		})),
		comments: docs.map((doc) => ({
			_id: `comment_${doc._id}`,
			postId: doc._id,
			content: SECRET,
			status: "approved",
			authorName: "Reader",
			createdAt: 1,
			updatedAt: 1,
		})),
		postMeta: [
			{
				_id: "meta1",
				postId: docs[0]?._id,
				key: "_scheduled_fn",
				value: SECRET,
			},
		],
	};
	function query(table: string) {
		let rows = [...(tables[table] ?? [])];
		const builder = {
			eq(field: string, value: unknown) {
				rows = rows.filter((r) => r[field] === value);
				return builder;
			},
			search(_field: string, _value: string) {
				return builder;
			},
		};
		const q: any = {
			withIndex(_name: string, cb?: (b: any) => any) {
				cb?.(builder);
				return q;
			},
			withSearchIndex(_name: string, cb: (b: any) => any) {
				cb(builder);
				return q;
			},
			order() {
				return q;
			},
			filter(cb: (b: any) => (r: Row) => boolean) {
				const expressions = {
					field: (name: string) => (r: Row) => r[name],
					eq: (a: any, b: any) => (r: Row) =>
						(typeof a === "function" ? a(r) : a) ===
						(typeof b === "function" ? b(r) : b),
				};
				rows = rows.filter(cb(expressions));
				return q;
			},
			first: async () => rows[0] ?? null,
			unique: async () => rows[0] ?? null,
			collect: async () => rows,
			take: async (n: number) => rows.slice(0, n),
			paginate: async ({ cursor, numItems }: { cursor: string | null; numItems: number }) => {
				const start = Number(cursor ?? 0), end = start + numItems;
				return { page: rows.slice(start, end), isDone: end >= rows.length, continueCursor: String(end) };
			},
		};
		return q;
	}
	const ctx: any = {
		db: {
			normalizeId: (table: string, id: string) => (tables[table] ?? []).some(row => row._id === id) ? id : null,
			query,
			get: async (tableOrId: string, id?: string) =>
				id
					? ((tables[tableOrId] ?? []).find((r) => r._id === id) ?? null)
					: (Object.values(tables)
							.flat()
							.find((r) => r._id === tableOrId) ?? null),
		},
		auth: {
			getUserIdentity: async () =>
				options.actor
					? {
							subject: options.actor === "editor" ? user._id : user.clerkUserId,
							tokenIdentifier:
								options.actor === "editor"
									? `https://convexpress-admin.local|${user._id}`
									: `https://synthetic.clerk|${user.clerkUserId}`,
						}
					: null,
		},
		storage: { getUrl: async () => null },
	};
	ctx.runQuery = async (reference: any, args: any) => {
		const name = getFunctionName(reference);
		const handler = name === "membership/policyReads:rules" ? policyReads.rules : name === "membership/policyReads:grants" ? policyReads.grants : null;
		if (!handler) throw new Error(`Unsupported internal query in public-content fixture: ${name}`);
		return (handler as any)._handler(ctx, args);
	};
	return { ctx, tables };
}

const invoke = (fn: any, ctx: any, args: any = {}) => fn._handler(ctx, args);
function safe(data: any, bodyAllowed: boolean) {
	expect(data).not.toBeNull();
	for (const key of PRIVATE_FIELDS) expect(data[key]).toBeUndefined();
	if (!bodyAllowed)
		for (const key of BODY_FIELDS) expect(data[key]).toBeUndefined();
	else {
		expect(data.content).toBe(SECRET);
		expect(data.blocks[0].attrs.text).toBe(SECRET);
	}
}

describe("public content endpoints", () => {
	test("active site editors retain their deliberate public profile without exposing account fields", async () => {
		const { ctx, tables } = fixture([document()]);
		tables.users.push({ _id: "author", slug: "public-editor", displayName: "Public pen name", email: "private@example.invalid", status: "active", authSource: "local", isInternal: true, internalRole: "editor" });
		const post = await invoke(posts.getPublished, ctx, { slug: "public-title" });
		expect(post.author.displayName).toBe("Public pen name");
		expect(post.author.email).toBeUndefined();
		const feed = await invoke(feeds.getPublishedPosts, ctx, { limit: 10 });
		expect(JSON.stringify(feed)).toContain("Public pen name");
		expect(JSON.stringify(feed)).not.toContain("private@example.invalid");
		expect((await invoke(profiles.getUserBySlug, ctx, { slug: "public-editor" })).displayName).toBe("Public pen name");
	});
	for (const author of [
		{ status: "active", authSource: "management" },
		{ status: "active", authSource: "local", internalRole: "management" },
		{ status: "inactive", authSource: "local" },
		{ status: "banned", authSource: "clerk" },
	]) {
		test(`non-public author does not become a byline or archive: ${JSON.stringify(author)}`, async () => {
			const { ctx, tables } = fixture([document()]);
			tables.users.push({ _id: "author", slug: "internal-person", displayName: "INTERNAL_AUTHOR_MARKER", email: "private@example.invalid", ...author });
			for (const [fn, args] of [
				[posts.getPublished, { slug: "public-title" }],
				[postHttp.getInternal, { postId: "post1" }],
			] as const) {
				const result = await invoke(fn, ctx, args);
				expect(result.title).toBe("Public title");
				expect(result.author).toBeNull();
			}
			const list = await invoke(posts.listPublished, ctx);
			expect(list.posts[0].author).toBeNull();
			const feed = await invoke(feeds.getPublishedPosts, ctx, { limit: 10 });
			expect(JSON.stringify(feed)).not.toContain("INTERNAL_AUTHOR_MARKER");
			expect(JSON.stringify(feed)).not.toContain("internal-person");
			expect(await invoke(profiles.getUserBySlug, ctx, { slug: "internal-person" })).toBeNull();
			expect(await invoke(profiles.getUser, ctx, { userId: "author" })).toBeNull();
			expect(await invoke(feeds.getPostsByAuthor, ctx, { authorSlug: "internal-person", limit: 10 })).toBeNull();
		});
	}
	for (const [name, fn, args] of [
		["post get", posts.get, { postId: "post1" }],
		["published post", posts.getPublished, { slug: "public-title" }],
	] as const) {
		test(`${name} never leaks passwords, autosaves or gated block/structured content`, async () => {
			const { ctx } = fixture([document({ visibility: "password" })]);
			if (fn === pages.verifyPassword) tables.posts[0].visibility = "password";
      safe(await invoke(fn, ctx, args), false);
		});
		test(`${name} enforces membership and preserves its teaser`, async () => {
			const { ctx } = fixture([document()], { restricted: true });
			const result = await invoke(fn, ctx, args);
			safe(result, false);
			expect(result.isMembershipRestricted).toBe(true);
		});
		test(`${name} preserves published SDK content while stripping authoring fields`, async () => {
			safe(await invoke(fn, fixture([document()]).ctx, args), true);
		});
	}
	for (const [name, fn] of [
		["list", posts.listPublished],
		["sticky", posts.getSticky],
	] as const) {
		test(`${name} cannot bypass membership with a full document spread`, async () => {
			const result = await invoke(
				fn,
				fixture([document()], { restricted: true }).ctx,
			);
			safe((result.posts ?? result)[0], false);
		});
	}
	for (const [name, fn, args] of [
		["page get", pages.get, { pageId: "post1" }],
		["page path", pages.getByPath, { path: "/public-title" }],
		["front page", pages.getFrontPage, {}],
	] as const) {
		test(`${name} strips protected page body and authoring data`, async () => {
			safe(
				await invoke(
					fn,
					fixture([document({ type: "page", visibility: "password" })]).ctx,
					args,
				),
				false,
			);
		});
		test(`${name} withholds every membership-restricted content representation`, async () => {
			safe(
				await invoke(
					fn,
					fixture([document({ type: "page" })], { restricted: true }).ctx,
					args,
				),
				false,
			);
		});
	}
	test("ordinary customer cannot read another author's draft page", async () => {
		const { ctx } = fixture([document({ type: "page", status: "draft" })], {
			actor: "subscriber",
		});
		expect(await invoke(pages.get, ctx, { pageId: "post1" })).toBeNull();
	});
	test("ordinary customer still needs the page password", async () => {
		const { ctx } = fixture(
			[document({ type: "page", visibility: "password" })],
			{ actor: "subscriber" },
		);
		safe(await invoke(pages.get, ctx, { pageId: "post1" }), false);
	});
	test("authorized editor retains draft fields needed for editing", async () => {
		const { ctx } = fixture([document({ type: "page", status: "draft" })], {
			actor: "editor",
		});
		const data = await invoke(pages.get, ctx, { pageId: "post1" });
		expect(data.content).toBe(SECRET);
		expect(data.autosaveContent).toBe(SECRET);
	});
	for (const [name, fn, args, type] of [
		[
			"post",
			posts.verifyPostPassword,
			{ slug: "public-title", password: "synthetic-password" },
			"post",
		],
		[
			"page",
			pages.verifyPassword,
			{ pageId: "post1", password: "synthetic-password" },
			"page",
		],
	] as const) {
		test(`correct ${name} password does not bypass membership`, async () => {
			safe(
				await invoke(
					fn,
					fixture([document({ type, visibility: "password" })], {
						restricted: true,
					}).ctx,
					args,
				),
				false,
			);
		});
		test(`correct ${name} password unlocks only public DTO fields`, async () => {
			safe(
				await invoke(
					fn,
					fixture([document({ type, visibility: "password" })]).ctx,
					args,
				),
				true,
			);
		});
	}
	test("entitled member can receive block content", async () => {
		safe(
			await invoke(
				posts.getPublished,
				fixture([document()], {
					restricted: true,
					actor: "subscriber",
					member: true,
				}).ctx,
				{ slug: "public-title" },
			),
			true,
		);
	});
	test("generic public metadata never exposes scheduler internals", async () => {
		expect(
			await invoke(posts.getMetaByPost, fixture([document()]).ctx, {
				postId: "post1",
			}),
		).toEqual([]);
	});
	test("customer cannot use editorial preview to read unpublished autosaves", async () => {
		const { ctx } = fixture([document()], { actor: "subscriber" });
		await expect(
			invoke(posts.preview, ctx, { postId: "post1" }),
		).rejects.toThrow();
	});
	test("customer cannot enumerate full draft pages in the admin list", async () => {
		const { ctx } = fixture([document({ type: "page", status: "draft" })], {
			actor: "subscriber",
		});
		expect((await invoke(pages.list, ctx)).pages).toEqual([]);
	});
	test("customer cannot use the admin post list to read an owned post's authoring secrets", async () => {
		const { ctx } = fixture([document({ authorId: "reader" })], {
			actor: "subscriber",
		});
		await expect(invoke(posts.list, ctx)).rejects.toThrow();
	});
});

describe("REST content projections", () => {
  for (const [type, module, args] of [
    ["post", postHttp, { postId: "post1" }],
    ["page", pageHttp, { pageId: "post1" }],
  ] as const) {
    test(`${type} REST get cannot bypass a password`, async () => {
      safe(await invoke(module.getInternal, fixture([document({ type, visibility: "password" })]).ctx, args), false);
    });
    test(`${type} REST get omits draft content without editorial identity`, async () => {
      expect(await invoke(module.getInternal, fixture([document({ type, status: "draft" })]).ctx, args)).toBeNull();
    });
    test(`${type} REST get applies membership to every content representation`, async () => {
      safe(await invoke(module.getInternal, fixture([document({ type })], { restricted: true }).ctx, args), false);
    });
    test(`${type} REST list does not include membership-only bodies`, async () => {
      const result = await invoke(module.listPublishedInternal, fixture([document({ type })], { restricted: true }).ctx);
      expect(JSON.stringify(result)).not.toContain(SECRET);
    });
  }
});

describe("public discovery channels", () => {
  test("ordinary public articles still appear in feeds and search", async () => {
    const { ctx } = fixture([document()]);
    expect((await invoke(feeds.getPublishedPosts, ctx, { limit: 10 }))[0].content).toBe(SECRET);
    expect((await invoke(search.search, ctx, { q: "Public" })).results[0].title).toBe("Public title");
    expect((await invoke(search.suggest, ctx, { q: "Public" })).suggestions[0].text).toBe("Public title");
  });
	for (const visibility of ["password", "private"] as const) {
		test(`feed excludes ${visibility} articles and their comments`, async () => {
			const { ctx } = fixture([document({ visibility })]);
			expect(await invoke(feeds.getPublishedPosts, ctx, { limit: 10 })).toEqual(
				[],
			);
			expect(await invoke(feeds.getRecentComments, ctx, { limit: 10 })).toEqual(
				[],
			);
			expect(
				await invoke(feeds.getPostComments, ctx, {
					postSlug: "public-title",
					limit: 10,
				}),
			).toBeNull();
		});
		test(`search and suggestions exclude currently ${visibility} sources even with a stale public index`, async () => {
			const { ctx } = fixture([document({ visibility })]);
			expect(
				(await invoke(search.search, ctx, { q: "Public" })).results,
			).toEqual([]);
			expect(
				(await invoke(search.suggest, ctx, { q: "Public" })).suggestions,
			).toEqual([]);
		});
	}
	test("feeds and search exclude membership-denied source content", async () => {
		const { ctx } = fixture([document()], { restricted: true });
		expect(await invoke(feeds.getPublishedPosts, ctx, { limit: 10 })).toEqual(
			[],
		);
		expect((await invoke(search.search, ctx, { q: "Public" })).results).toEqual(
			[],
		);
	});
	test("public tree cannot expose drafts by requesting all statuses", async () => {
		expect(
			await invoke(
				pages.getTree,
				fixture([document({ type: "page", status: "draft" })]).ctx,
				{},
			),
		).toEqual([]);
	});
});

for (const restrictedPath of ["/", "/public-title"]) {
  test(`homepage alias ${restrictedPath} remains protected through page and password channels`, async () => {
    const { ctx, tables } = fixture([document({ type: "page" })], { restricted: true });
    tables.membership_restriction_rules = [{ _id: "routeRule", resourceType: "route", resourceIdOrKey: restrictedPath, ruleMode: "allow_only", planIds: ["plan1"], teaserMode: "excerpt" }];
    for (const [fn, args] of [[pages.getFrontPage, {}], [pages.getByPath, { path: "/public-title" }], [pages.verifyPassword, { pageId: "post1", password: "synthetic-password" }]] as const) {
      if (fn === pages.verifyPassword) tables.posts[0].visibility = "password";
      safe(await invoke(fn, ctx, args), false);
    }
  });
}

test("homepage SDK carries authored imagery only after its content gate", async () => {
  const { ctx, tables } = fixture([document({ type: "page", featuredImageId: "cover" })]);
  tables.media = [{ _id: "cover", status: "active", url: "https://example.invalid/cover.jpg", altText: "Synthetic cover" }];
  const page = await invoke(pages.getFrontPage, ctx);
  expect(page.featuredImageUrl).toBe("https://example.invalid/cover.jpg");
  expect(page.featuredImageAlt).toBe("Synthetic cover");
  tables.posts[0].visibility = "password";
  expect((await invoke(pages.getFrontPage, ctx)).featuredImageUrl).toBeUndefined();
  const unlocked = await invoke(pages.verifyPassword, ctx, { pageId: "post1", password: "synthetic-password" });
  expect(unlocked.featuredImageUrl).toBe("https://example.invalid/cover.jpg");
});

test("legacy public page/post channels expose only the v2 discriminator, never raw canonical or fallback bodies", async () => {
  for (const [fn, args, type] of [[posts.getPublished, { slug: "public-title" }, "post"], [pages.getByPath, { path: "/public-title" }, "page"], [pages.getFrontPage, {}, "page"]] as const) {
    const value = await invoke(fn, fixture([document({ type, blocksVersion: 2 })]).ctx, args);
    expect(value.blocksVersion).toBe(2);
    for (const field of BODY_FIELDS) expect(value[field]).toBeUndefined();
    expect(value.title).toBe("Public title");
    expect(value.excerpt).toBe("Public teaser");
  }
});


describe("current-source public search projection", () => {
  test("search and autocomplete replace stale index text, URLs and private author metadata", async () => {
    const {ctx, tables} = fixture([document({content: "Current body", excerpt: "Current excerpt"})]);
    Object.assign(tables.searchIndex[0], {title: "REMOVED_TITLE", excerpt: "REMOVED_EXCERPT", content: "REMOVED_BODY", url: "https://untrusted.invalid/old", authorName: "private@example.invalid", categoryNames: ["REMOVED_CATEGORY"], tagNames: ["REMOVED_TAG"]});
    tables.users.push({_id: "author", status: "active", displayName: "Current author", email: "private@example.invalid"});
    const result = await invoke(search.search, ctx, {q: "Public"});
    expect(result.results[0]).toMatchObject({title: "Public title", excerpt: "Current excerpt", url: "/blog/public-title", authorName: "Current author"});
    expect(JSON.stringify(result)).not.toContain("REMOVED_");
    expect(JSON.stringify(result)).not.toContain("private@example.invalid");
    expect((await invoke(search.suggest, ctx, {q: "Public"})).suggestions[0].text).toBe("Public title");
  });
  test("canonical v2 documents never fall back to the legacy body for an excerpt", async () => {
    const {ctx} = fixture([document({blocksVersion: 2, excerpt: "", content: "OLD_LEGACY_BODY"})]);
    expect((await invoke(search.search, ctx, {q: "Public"})).results[0].excerpt).toBe("");
  });
  test("wrong-table cache identities and future publication dates are excluded", async () => {
    const {ctx, tables} = fixture([document({publishedAt: Date.now()+60000})]);
    tables.searchIndex.push({...tables.searchIndex[0], _id: "bad-index", contentId: "author"});
    expect((await invoke(search.search, ctx, {q: "Public"})).results).toEqual([]);
    expect((await invoke(search.suggest, ctx, {q: "Public"})).suggestions).toEqual([]);
  });
  test("published products require Commerce and current publication authority", async () => {
    const {ctx, tables} = fixture([]);
    tables.commerce_products = [{_id: "product1", status: "publish", productType: "simple", title: "Current product", slug: "current-product", excerpt: "Current product excerpt", description: "Current product body", authorId: "author", categoryIds: [], createdAt: 1}];
    tables.searchIndex = [{_id: "product-index", contentType: "product", contentId: "product1", title: "OLD_PRODUCT", content: "OLD_PRIVATE_PRODUCT", excerpt: "OLD_PRIVATE_PRODUCT", url: "/old-product", status: "publish", authorName: "OLD_AUTHOR"}];
    tables.settings[0].values.commerceEnabled = true;
    expect((await invoke(search.search, ctx, {q: "product"})).results[0]).toMatchObject({title: "Current product", excerpt: "Current <mark>product</mark> excerpt", url: "/products/current-product"});
    expect((await invoke(search.suggest, ctx, {q: "product"})).suggestions[0].text).toBe("Current product");
    tables.settings[0].values.commerceEnabled = false;
    expect((await invoke(search.search, ctx, {q: "product"})).results).toEqual([]);
    tables.settings[0].values.commerceEnabled = true;
    tables.commerce_products[0].status = "draft";
    expect((await invoke(search.search, ctx, {q: "product"})).results).toEqual([]);
  });
});


test("search uses current approved comments and active media, with the parent content gate", async () => {
  const {ctx, tables} = fixture([document()]);
  tables.comments[0].content = "Current comment";
  tables.media = [{_id: "media1", title: "Current image", status: "active", caption: "Current caption", attachedTo: "post1", mimeType: "image/png", createdAt: 1}];
  tables.searchIndex = [
    {contentType: "comment", contentId: "comment_post1"}, {contentType: "media", contentId: "media1"},
  ].map((row, i) => ({...row, _id: `cache${i}`, status: "publish", title: "OLD_TITLE", content: "OLD_BODY", excerpt: "OLD_EXCERPT", url: "/old", authorName: "PRIVATE_UPLOADER"}));
  const result = await invoke(search.search, ctx, {q: "Current"});
  expect(result.results).toHaveLength(2);
  expect(JSON.stringify(result)).not.toContain("OLD_");
  expect(JSON.stringify(result)).not.toContain("PRIVATE_UPLOADER");
  expect(result.results.find((item: Row) => item.contentType === "comment").title).toBe('Comment on "Public title"');
  tables.comments[0].status = "pending";
  tables.media[0].status = "processing";
  expect((await invoke(search.search, ctx, {q: "Current"})).results).toEqual([]);
  tables.comments[0].status = "approved";
  tables.media[0].status = "active";
  tables.posts[0].visibility = "password";
  expect((await invoke(search.search, ctx, {q: "Current"})).results).toEqual([]);
});

test("course search enforces LMS and route membership without returning lesson or marketing bodies", async () => {
  const {ctx, tables} = fixture([]);
  tables.settings[0].values.lmsEnabled = true;
  tables.lms_courses = [{_id: "course1", status: "published", title: "Current course", slug: "current-course", excerpt: "Current course teaser", content: "PRIVATE_BODY", authorId: "author", publishedAt: 1}];
  tables.searchIndex = [{_id: "course-index", contentType: "course", contentId: "course1", title: "OLD_TITLE", content: "OLD_BODY", excerpt: "OLD_BODY", status: "publish", url: "/old", authorName: "OLD_AUTHOR"}];
  expect((await invoke(search.search, ctx, {q: "course"})).results[0]).toMatchObject({title: "Current course", excerpt: "Current <mark>course</mark> teaser", url: "/courses/current-course"});
  tables.settings[0].values.lmsEnabled = false;
  expect((await invoke(search.search, ctx, {q: "course"})).results).toEqual([]);
  tables.settings[0].values.lmsEnabled = true;
  tables.settings[0].values.membershipEnabled = true;
  tables.membership_restriction_rules = [{_id: "course-route-rule", resourceType: "route", resourceIdOrKey: "/courses", ruleMode: "allow_only", planIds: ["plan1"], teaserMode: "excerpt"}];
  expect((await invoke(search.search, ctx, {q: "course"})).results).toEqual([]);
  expect((await invoke(search.suggest, ctx, {q: "course"})).suggestions).toEqual([]);
});

test("product search honors current route restrictions, variant publication and bundle ownership", async () => {
  const {ctx, tables} = fixture([]);
  tables.settings[0].values.commerceEnabled = true;
  tables.commerce_products = [{_id: "product1", status: "publish", productType: "variable", title: "Current product", slug: "current-product", authorId: "author", categoryIds: []}];
  tables.searchIndex = [{_id: "product-index", contentType: "product", contentId: "product1", title: "Current product", content: "Current product", status: "publish", url: "/products/current-product", authorName: ""}];
  expect((await invoke(search.search, ctx, {q: "product"})).results).toEqual([]);
  tables.commerce_products[0].productType = "simple";
  tables.commerce_products[0].publishedAt = Date.now() + 60000;
  expect((await invoke(search.search, ctx, {q: "product"})).results).toEqual([]);
  delete tables.commerce_products[0].publishedAt;
  tables.commerce_bundles = [{_id: "bundle1", productId: "product1"}];
  expect((await invoke(search.search, ctx, {q: "product"})).results).toEqual([]);
  tables.commerce_bundles = [];
  tables.settings[0].values.membershipEnabled = true;
  tables.membership_restriction_rules = [{_id: "product-route-rule", resourceType: "route", resourceIdOrKey: "/products/current-product", ruleMode: "allow_only", planIds: ["plan1"], teaserMode: "excerpt"}];
  expect((await invoke(search.search, ctx, {q: "product"})).results).toEqual([]);
});


test("product search does not disclose descendants of hidden categories", async () => {
  const {ctx, tables} = fixture([]);
  tables.settings[0].values.commerceEnabled = true;
  tables.commerce_product_categories = [{_id: "parent", name: "Hidden parent", isVisible: false}, {_id: "child", parentId: "parent", name: "Hidden descendant", isVisible: true}];
  tables.commerce_products = [{_id: "product1", status: "publish", productType: "simple", title: "Product", slug: "product", authorId: "author", categoryIds: ["child"]}];
  tables.searchIndex = [{_id: "index", contentType: "product", contentId: "product1", title: "Product", content: "Product", status: "publish", url: "/products/product", authorName: ""}];
  expect((await invoke(search.search, ctx, {q: "Product"})).results[0].categoryNames).toEqual([]);
  tables.commerce_product_categories[0].isVisible = true;
  expect((await invoke(search.search, ctx, {q: "Product"})).results[0].categoryNames).toEqual(["Hidden descendant"]);
});
