/**
 * Page System - Queries
 *
 * All read operations for pages:
 *   list          - Paginated page list with filters (admin)
 *   get           - Single page by ID, slug, or path
 *   getTree       - Full hierarchical page tree
 *   getByPath     - Public page lookup by URL path (website routing)
 *   getChildren   - Direct children of a page
 *   getBreadcrumbs - Ancestor chain for breadcrumb navigation
 *   counts        - Count pages by status
 *   getTemplates  - List available page templates (static data)
 *   getFrontPage  - Get the designated static front page
 *
 * Authorization:
 *   - list: Requires auth (admin list view)
 *   - get: Conditional (private pages require auth + read_private_pages)
 *   - getTree: Public for published, auth-required for all statuses
 *   - getByPath: Public (published only), private pages gated
 *   - getChildren: Public (published only)
 *   - getBreadcrumbs: Public
 *   - counts: Requires auth (admin status tabs)
 *   - getTemplates: Public (static data)
 *   - getFrontPage: Public
 *
 * Pages live in the shared `posts` table with `type: "page"`.
 * All queries filter by `type === "page"` to avoid mixing with posts.
 */

import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import { query } from "../_generated/server";
import { currentUserCan, getCurrentUser } from "../helpers/permissions";
import { evaluateMembershipAccess } from "../membership/access";
import {
	getBreadcrumbsArgs,
	getChildrenArgs,
	getPageArgs,
	getPageByPathArgs,
	getPageTreeArgs,
	listPagesArgs,
} from "./validators";

// ─── Types ───────────────────────────────────────────────────────────────────

/** Shape of a node in the hierarchical page tree. */
interface PageTreeNode {
	_id: string;
	title: string;
	slug: string;
	status: string;
	depth: number;
	menuOrder: number;
	path: string;
	parentId?: string;
	children: PageTreeNode[];
}

// ─── List ────────────────────────────────────────────────────────────────────

/**
 * List pages with filters and pagination.
 *
 * Returns a paginated list of pages along with status counts
 * for the admin "All Pages" tab filter.
 *
 * Filters:
 *   - status: filter by specific status
 *   - parentId: filter by parent page
 *   - pageTemplate: filter by template
 *   - search: search title and slug
 *   - authorId: filter by author
 *
 * Sort:
 *   - menuOrder (default), title, date, author
 *
 * Auth: Required (admin list view).
 */
export const list = query({
	args: listPagesArgs,
	handler: async (ctx, args) => {
		const user = await getCurrentUser(ctx);
		if (!user) {
			return {
				pages: [],
				pagination: { page: 1, perPage: 20, total: 0, totalPages: 0 },
				counts: {
					all: 0,
					publish: 0,
					draft: 0,
					pending: 0,
					private: 0,
					trash: 0,
					future: 0,
				},
			};
		}

		const page = args.page ?? 1;
		const perPage = args.perPage ?? 20;
		const orderBy = args.orderBy ?? "menuOrder";
		const orderDir = args.orderDir ?? "asc";

		// ── Fetch all pages once (used for both list results and counts) ─────
		// Single table scan to avoid M-4 double table scan issue.
		const allPagesUnfiltered = await ctx.db
			.query("posts")
			.withIndex("by_type", (q) => q.eq("type", "page"))
			.collect();

		// Compute status counts from the unfiltered set (before any filtering)
		const counts = {
			all: allPagesUnfiltered.filter((p) => p.status !== "trash").length,
			publish: allPagesUnfiltered.filter((p) => p.status === "publish").length,
			draft: allPagesUnfiltered.filter(
				(p) => p.status === "draft" || p.status === "auto-draft",
			).length,
			pending: allPagesUnfiltered.filter((p) => p.status === "pending").length,
			private: allPagesUnfiltered.filter((p) => p.status === "private").length,
			trash: allPagesUnfiltered.filter((p) => p.status === "trash").length,
			future: allPagesUnfiltered.filter((p) => p.status === "future").length,
		};

		// Apply status filter
		let allPages;
		if (args.status) {
			allPages = allPagesUnfiltered.filter((p) => p.status === args.status);
		} else {
			// Default: all pages except trash
			allPages = allPagesUnfiltered.filter((p) => p.status !== "trash");
		}

		// ── Apply additional filters in-memory ──────────────────────────────
		let filtered = allPages;

		if (args.parentId) {
			filtered = filtered.filter((p) => p.parentId === args.parentId);
		}

		if (args.pageTemplate) {
			filtered = filtered.filter((p) => p.pageTemplate === args.pageTemplate);
		}

		if (args.authorId) {
			filtered = filtered.filter((p) => p.authorId === args.authorId);
		}

		if (args.search) {
			const searchLower = args.search.toLowerCase();
			filtered = filtered.filter(
				(p) =>
					p.title.toLowerCase().includes(searchLower) ||
					p.slug.toLowerCase().includes(searchLower),
			);
		}

		// ── Sort ─────────────────────────────────────────────────────────────
		filtered.sort((a, b) => {
			let cmp = 0;

			switch (orderBy) {
				case "title":
					cmp = a.title.localeCompare(b.title);
					break;
				case "date":
					cmp = (a.createdAt ?? 0) - (b.createdAt ?? 0);
					break;
				case "author":
					cmp = (a.authorId ?? "").localeCompare(b.authorId ?? "");
					break;
				case "menuOrder":
				default:
					cmp = ((a.menuOrder as number) ?? 0) - ((b.menuOrder as number) ?? 0);
					// Secondary sort by title for same menuOrder
					if (cmp === 0) {
						cmp = a.title.localeCompare(b.title);
					}
					break;
			}

			return orderDir === "desc" ? -cmp : cmp;
		});

		// ── Paginate ─────────────────────────────────────────────────────────
		const total = filtered.length;
		const totalPages = Math.ceil(total / perPage);
		const offset = (page - 1) * perPage;
		const paginatedPages = filtered.slice(offset, offset + perPage);

		// ── Denormalize author data ───────────────────────────────────────────
		const pagesWithAuthors = await Promise.all(
			paginatedPages.map(async (pg) => {
				const author = pg.authorId
					? await ctx.db.get("users", pg.authorId)
					: null;
				return {
					...pg,
					author: author
						? {
								_id: author._id,
								// displayName may not be in the generated TypeScript types yet,
								// but it exists on the users schema. Using optional chaining.
								displayName:
									(author as { displayName?: string }).displayName ??
									author.email,
								email: author.email,
							}
						: null,
				};
			}),
		);

		// Counts were already computed from the single unfiltered fetch above.

		return {
			pages: pagesWithAuthors,
			pagination: { page, perPage, total, totalPages },
			counts,
		};
	},
});

// ─── Get ─────────────────────────────────────────────────────────────────────

/**
 * Get a single page by ID, slug, or path.
 *
 * Priority: pageId > slug > path
 *
 * For admin use: returns the page regardless of status (with auth).
 * For public use: returns only published/private pages.
 *
 * Private pages require auth + `read_private_pages` capability.
 * Password-protected pages return without content (with isPasswordProtected flag).
 *
 * Enriches the response with parent info and direct children.
 */
export const get = query({
	args: getPageArgs,
	handler: async (ctx, args) => {
		let page;

		// ── Resolve page ──────────────────────────────────────────────────────
		if (args.pageId) {
			page = await ctx.db.get("posts", args.pageId);
		} else if (args.slug) {
			page = await ctx.db
				.query("posts")
				.withIndex("by_type_slug", (q) =>
					q.eq("type", "page").eq("slug", args.slug!),
				)
				.unique();
		} else if (args.path) {
			const normalizedPath = args.path.startsWith("/")
				? args.path
				: `/${args.path}`;
			page = await ctx.db
				.query("posts")
				.withIndex("by_path", (q) => q.eq("path", normalizedPath))
				.first();

			// Verify it's actually a page (path index isn't type-scoped)
			if (page && page.type !== "page") {
				page = null;
			}
		}

		if (!page || page.type !== "page") {
			return null;
		}

		// ── Visibility checks ─────────────────────────────────────────────────
		const user = await getCurrentUser(ctx);
		const isAdmin = !!user;

		// Non-admin: only published and private pages are visible
		if (!isAdmin) {
			if (page.status !== "publish" && page.status !== "private") {
				return null;
			}
		}

		// Private pages require specific capability (read_private_pages in WordPress terms)
		if (page.visibility === "private" || page.status === "private") {
			if (!user) return null;
			const canReadPrivate = await currentUserCan(ctx, "page.read_private");
			if (!canReadPrivate) return null;
		}

		// Password-protected pages: return without content for public.
		// Exclude the password field from the response for security.
		if (page.visibility === "password" && !isAdmin) {
			return {
				...page,
				content: undefined,
				password: undefined,
				isPasswordProtected: true,
			};
		}

		// ── Enrich with parent info ───────────────────────────────────────────
		let parentInfo = null;
		if (page.parentId) {
			const parent = await ctx.db.get("posts", page.parentId as Id<"posts">);
			if (parent && parent.type === "page") {
				parentInfo = {
					_id: parent._id,
					title: parent.title,
					slug: parent.slug,
					path: parent.path,
				};
			}
		}

		// ── Fetch direct children ─────────────────────────────────────────────
		const childrenQuery = await ctx.db
			.query("posts")
			.withIndex("by_type_parent", (q) =>
				q.eq("type", "page").eq("parentId", page._id),
			)
			.collect();

		// Filter children: admin sees all non-trash, public sees published only
		const children = childrenQuery
			.filter((c) => (isAdmin ? c.status !== "trash" : c.status === "publish"))
			.sort(
				(a, b) =>
					((a.menuOrder as number) ?? 0) - ((b.menuOrder as number) ?? 0),
			)
			.map((c) => ({
				_id: c._id,
				title: c.title,
				slug: c.slug,
				status: c.status,
				menuOrder: c.menuOrder,
				path: c.path,
			}));

		// Exclude password field from public responses for security.
		// Admin users can still see it in the dashboard data.
		const { password: _pw, ...safePageData } = page;

		return {
			...safePageData,
			parent: parentInfo,
			children,
		};
	},
});

// ─── Get Tree ────────────────────────────────────────────────────────────────

/**
 * Get the full hierarchical page tree.
 *
 * Returns a nested tree structure for:
 *   - Admin: parent dropdown in Page Attributes metabox
 *   - Admin: hierarchical page list
 *   - Website: navigation menu building
 *
 * Args:
 *   - status "publish": only published pages (for website/public use)
 *   - status "all" or undefined: all non-trash pages (for admin use)
 *
 * Pages are sorted by menuOrder within each level.
 */
export const getTree = query({
	args: getPageTreeArgs,
	handler: async (ctx, args) => {
		const showPublishedOnly = args.status === "publish";

		// Fetch all pages
		const allPages = await ctx.db
			.query("posts")
			.withIndex("by_type", (q) => q.eq("type", "page"))
			.collect();

		// Filter by status
		const filteredPages = allPages.filter((p) =>
			showPublishedOnly ? p.status === "publish" : p.status !== "trash",
		);

		// Sort by menuOrder then title
		filteredPages.sort((a, b) => {
			const orderCmp =
				((a.menuOrder as number) ?? 0) - ((b.menuOrder as number) ?? 0);
			if (orderCmp !== 0) return orderCmp;
			return a.title.localeCompare(b.title);
		});

		// Build tree: two-pass algorithm
		// Pass 1: Create node map
		const nodeMap = new Map<string, PageTreeNode>();
		for (const p of filteredPages) {
			nodeMap.set(p._id, {
				_id: p._id,
				title: p.title,
				slug: p.slug,
				status: p.status,
				depth: (p.depth as number) ?? 0,
				menuOrder: (p.menuOrder as number) ?? 0,
				path: (p.path as string) ?? `/${p.slug}`,
				parentId: p.parentId as string | undefined,
				children: [],
			});
		}

		// Pass 2: Link children to parents
		const rootNodes: PageTreeNode[] = [];
		for (const node of nodeMap.values()) {
			if (node.parentId && nodeMap.has(node.parentId)) {
				nodeMap.get(node.parentId)!.children.push(node);
			} else {
				rootNodes.push(node);
			}
		}

		return rootNodes;
	},
});

// ─── Get By Path ─────────────────────────────────────────────────────────────

/**
 * Get a page by its full URL path.
 *
 * This is the primary query for website page rendering / SSR routing.
 * Uses the `by_path` index for O(1) lookup.
 *
 * Returns:
 *   - The page document if found and published
 *   - A stub with isPasswordProtected=true if password-protected
 *   - null if not found, not published, or private without auth
 */
export const getByPath = query({
	args: getPageByPathArgs,
	handler: async (ctx, args) => {
		// Normalize path: ensure leading slash
		const normalizedPath = args.path.startsWith("/")
			? args.path
			: `/${args.path}`;

		// Remove trailing slash (except for root "/")
		const cleanPath =
			normalizedPath === "/"
				? normalizedPath
				: normalizedPath.replace(/\/$/, "");

		// Lookup by path index
		const page = await ctx.db
			.query("posts")
			.withIndex("by_path", (q) => q.eq("path", cleanPath))
			.first();

		// Must be a page and published/private
		if (!page || page.type !== "page") {
			return null;
		}

		if (page.status !== "publish" && page.status !== "private") {
			return null;
		}

		// ── Private page access ───────────────────────────────────────────────
		// Requires read_private_pages capability (WordPress: read_private_pages)
		if (page.status === "private" || page.visibility === "private") {
			const user = await getCurrentUser(ctx);
			if (!user) return null;

			const canReadPrivate = await currentUserCan(ctx, "page.read_private");
			if (!canReadPrivate) return null;
		}

		// ── Resolve featured image URL ─────────────────────────────────────────
		let featuredImageUrl: string | undefined;
		let featuredImageAlt: string | undefined;
		if (page.featuredImageId) {
			const media = await ctx.db.get("media", page.featuredImageId);
			if (media) {
				featuredImageUrl = media.url;
				featuredImageAlt = media.altText;
			}
		}

		const membershipAccess = await evaluateMembershipAccess(ctx, {
			resourceType: "page",
			resourceIdOrKey: String(page._id),
		});

		// ── Password-protected page ───────────────────────────────────────────
		if (page.visibility === "password") {
			return {
				_id: page._id,
				title: page.title,
				slug: page.slug,
				path: page.path,
				status: page.status,
				pageTemplate: page.pageTemplate,
				featuredImageId: page.featuredImageId,
				featuredImageUrl,
				featuredImageAlt,
				isPasswordProtected: true,
				isMembershipRestricted: !membershipAccess.allowed,
				membershipAccess,
				// Content intentionally omitted
			};
		}

		// Exclude password field from public responses for security
		const { password: _pw, ...safePageData } = page;

		if (!membershipAccess.allowed) {
			return {
				...safePageData,
				content: undefined,
				featuredImageUrl,
				featuredImageAlt,
				isMembershipRestricted: true,
				membershipAccess,
			};
		}

		return {
			...safePageData,
			featuredImageUrl,
			featuredImageAlt,
			isMembershipRestricted: false,
			membershipAccess,
		};
	},
});

// ─── Get Children ────────────────────────────────────────────────────────────

/**
 * Get direct children of a page.
 *
 * Public query for website use (published only) and admin use (all non-trash).
 * Sorted by menuOrder then title.
 */
export const getChildren = query({
	args: getChildrenArgs,
	handler: async (ctx, args) => {
		const showPublishedOnly = args.status !== "all";
		const user = await getCurrentUser(ctx);
		const isAdmin = !!user;

		const children = await ctx.db
			.query("posts")
			.withIndex("by_type_parent", (q) =>
				q.eq("type", "page").eq("parentId", args.pageId),
			)
			.collect();

		// Filter by status
		const filtered = children.filter((c) => {
			if (showPublishedOnly || !isAdmin) {
				return c.status === "publish";
			}
			return c.status !== "trash";
		});

		// Sort by menuOrder then title
		filtered.sort((a, b) => {
			const orderCmp =
				((a.menuOrder as number) ?? 0) - ((b.menuOrder as number) ?? 0);
			if (orderCmp !== 0) return orderCmp;
			return a.title.localeCompare(b.title);
		});

		return filtered.map((c) => ({
			_id: c._id,
			title: c.title,
			slug: c.slug,
			status: c.status,
			menuOrder: c.menuOrder,
			path: c.path,
			depth: c.depth,
			pageTemplate: c.pageTemplate,
		}));
	},
});

// ─── Get Breadcrumbs ─────────────────────────────────────────────────────────

/**
 * Get the ancestor chain for breadcrumb navigation.
 *
 * Returns an array from root to the specified page:
 *   [{ title: "Services", slug: "services", path: "/services" },
 *    { title: "Web Design", slug: "web-design", path: "/services/web-design" }]
 *
 * Public query: only includes published ancestors.
 */
export const getBreadcrumbs = query({
	args: getBreadcrumbsArgs,
	handler: async (ctx, args) => {
		const breadcrumbs: Array<{
			_id: string;
			title: string;
			slug: string;
			path: string;
		}> = [];

		const page = await ctx.db.get("posts", args.pageId);
		if (!page || page.type !== "page") {
			return breadcrumbs;
		}

		// Walk up the parent chain
		const ancestors: Array<{
			_id: string;
			title: string;
			slug: string;
			path: string;
		}> = [];

		let currentParentId = page.parentId as Id<"posts"> | undefined;
		let safetyCounter = 0;

		while (currentParentId) {
			if (safetyCounter++ > 10) break;

			const ancestor = await ctx.db.get("posts", currentParentId);
			if (!ancestor || ancestor.type !== "page") break;

			// Only include published ancestors in breadcrumbs
			if (ancestor.status === "publish") {
				ancestors.unshift({
					_id: ancestor._id,
					title: ancestor.title,
					slug: ancestor.slug,
					path: (ancestor.path as string) ?? `/${ancestor.slug}`,
				});
			}

			currentParentId = ancestor.parentId as Id<"posts"> | undefined;
		}

		// Add ancestors then the current page
		breadcrumbs.push(...ancestors);
		breadcrumbs.push({
			_id: page._id,
			title: page.title,
			slug: page.slug,
			path: (page.path as string) ?? `/${page.slug}`,
		});

		return breadcrumbs;
	},
});

// ─── Counts ──────────────────────────────────────────────────────────────────

/**
 * Get page counts by status.
 *
 * Used by the admin "All Pages" status filter tabs to show count badges.
 * Requires authentication.
 */
export const counts = query({
	args: {},
	handler: async (ctx) => {
		const user = await getCurrentUser(ctx);
		if (!user) {
			return {
				all: 0,
				publish: 0,
				draft: 0,
				pending: 0,
				private: 0,
				trash: 0,
				future: 0,
			};
		}

		const allPages = await ctx.db
			.query("posts")
			.withIndex("by_type", (q) => q.eq("type", "page"))
			.collect();

		return {
			all: allPages.filter((p) => p.status !== "trash").length,
			publish: allPages.filter((p) => p.status === "publish").length,
			draft: allPages.filter(
				(p) => p.status === "draft" || p.status === "auto-draft",
			).length,
			pending: allPages.filter((p) => p.status === "pending").length,
			private: allPages.filter((p) => p.status === "private").length,
			trash: allPages.filter((p) => p.status === "trash").length,
			future: allPages.filter((p) => p.status === "future").length,
		};
	},
});

// ─── Get Templates ───────────────────────────────────────────────────────────

/**
 * Get list of available page templates.
 *
 * This returns static data matching the frontend PAGE_TEMPLATES config.
 * Public query: no auth required.
 *
 * Templates are code-defined, not database-stored. This query provides
 * the data for the Page Template dropdown in the admin editor.
 *
 * IMPORTANT: This template list MUST stay in sync with the shared config at
 * `shared/config/page-templates.ts`. Any additions or modifications must be
 * made in BOTH places. The shared config is the canonical source for website
 * template rendering (PageRenderer component).
 */
export const getTemplates = query({
	args: {},
	handler: async () => {
		return [
			{
				id: "default",
				name: "Default Template",
				description: "Standard page layout with sidebar",
				supports: {
					featuredImage: true,
					excerpt: true,
					customFields: true,
					comments: true,
				},
			},
			{
				id: "full-width",
				name: "Full Width",
				description: "Full-width layout without sidebar",
				supports: {
					featuredImage: true,
					excerpt: true,
					customFields: true,
					comments: true,
				},
			},
			{
				id: "sidebar-left",
				name: "Sidebar Left",
				description: "Content with left sidebar",
				supports: {
					featuredImage: true,
					excerpt: true,
					customFields: true,
					comments: true,
				},
			},
			{
				id: "sidebar-right",
				name: "Sidebar Right",
				description: "Content with right sidebar",
				supports: {
					featuredImage: true,
					excerpt: true,
					customFields: true,
					comments: true,
				},
			},
			{
				id: "landing",
				name: "Landing Page",
				description: "Clean layout for landing pages, no header/footer nav",
				supports: {
					featuredImage: true,
					excerpt: false,
					customFields: true,
					comments: false,
				},
			},
			{
				id: "blank",
				name: "Blank Canvas",
				description: "Completely blank - only renders the content",
				supports: {
					featuredImage: false,
					excerpt: false,
					customFields: true,
					comments: false,
				},
			},
		];
	},
});

// ─── List Published ─────────────────────────────────────────────────────

/**
 * List published pages for public/website consumption.
 *
 * This is the public counterpart to the admin `list` query.
 * Returns only published pages with minimal fields needed for
 * website rendering (navigation menus, page widgets, sitemaps).
 *
 * Sorted by menuOrder (ascending), then title.
 * No authentication required.
 *
 * Used by:
 *   - PagesWidget (website sidebar widget)
 *   - HTTP API GET /api/v1/pages
 *   - Sitemap generation
 */
export const listPublished = query({
	args: {
		page: v.optional(v.number()),
		perPage: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const page = args.page ?? 1;
		const perPage = args.perPage ?? 100;

		// Fetch all published pages using the compound index
		const allPublished = await ctx.db
			.query("posts")
			.withIndex("by_type_status_published", (q) =>
				q.eq("type", "page").eq("status", "publish"),
			)
			.collect();

		// Sort by menuOrder then title
		allPublished.sort((a, b) => {
			const orderCmp =
				((a.menuOrder as number) ?? 0) - ((b.menuOrder as number) ?? 0);
			if (orderCmp !== 0) return orderCmp;
			return a.title.localeCompare(b.title);
		});

		// Paginate
		const total = allPublished.length;
		const totalPages = Math.ceil(total / perPage);
		const offset = (page - 1) * perPage;
		const paginated = allPublished.slice(offset, offset + perPage);

		// Return lightweight shape for public consumers
		const pages = paginated.map((p) => ({
			_id: p._id,
			title: p.title,
			slug: p.slug,
			path: p.path,
			depth: p.depth,
			menuOrder: p.menuOrder,
			parentId: p.parentId,
			pageTemplate: p.pageTemplate,
			excerpt: p.excerpt,
			featuredImageId: p.featuredImageId,
			publishedAt: p.publishedAt,
			createdAt: p.createdAt,
		}));

		return { pages, total, page, perPage, totalPages };
	},
});

// ─── Get Front Page ──────────────────────────────────────────────────────────

/**
 * Get the designated static front page.
 *
 * Reads the `reading` settings section to determine if a static front page
 * is configured. Primary keys are:
 *   - homepageDisplays: "latest_posts" | "static_page"
 *   - homepageId: page id or null
 *
 * For backward compatibility, legacy keys are also supported:
 *   - showOnFront: "posts" | "page"
 *   - pageOnFront: page id
 *
 * Returns null if:
 *   - Reading settings don't exist
 *   - No static front page is configured
 *   - The designated page doesn't exist or isn't published
 *
 * Public query: no auth required.
 */
export const getFrontPage = query({
	args: {},
	handler: async (ctx) => {
		// Look up reading settings
		let readingSettings;
		try {
			readingSettings = await ctx.db
				.query("settings")
				.withIndex("by_section", (q) => q.eq("section", "reading"))
				.unique();
		} catch {
			// Settings table may not exist yet
			return null;
		}

		if (!readingSettings || !readingSettings.values) {
			return null;
		}

		const values = readingSettings.values as {
			homepageDisplays?: "latest_posts" | "static_page";
			homepageId?: string | null;
			postsPageId?: string | null;
			// Legacy keys (kept for backwards compatibility with older data).
			showOnFront?: "posts" | "page";
			pageOnFront?: string;
			pageForPosts?: string;
			postsPerPage?: number;
		};

		const staticHomepageId =
			values.homepageDisplays === "static_page" && values.homepageId
				? values.homepageId
				: values.showOnFront === "page" && values.pageOnFront
					? values.pageOnFront
					: null;

		if (!staticHomepageId) {
			return null;
		}

		// Fetch the designated front page
		try {
			const frontPage = await ctx.db.get(
				"posts",
				staticHomepageId as Id<"posts">,
			);

			if (
				!frontPage ||
				frontPage.type !== "page" ||
				frontPage.status !== "publish"
			) {
				return null;
			}

			return frontPage;
		} catch {
			// Invalid ID or other error
			return null;
		}
	},
});

// ─── Verify Page Password ─────────────────────────────────────────────────────

/**
 * Verify a password-protected page's password and return the full page content.
 *
 * This query checks the provided password against the page's stored password.
 * If the password matches, the full page document (including content) is returned.
 * If it doesn't match, null is returned.
 *
 * This is a query (not a mutation) because it does not modify state.
 * The password comparison is a simple string equality check since page
 * passwords in WordPress are stored as plain text (not hashed).
 *
 * @returns Full page document if password is correct, null otherwise
 */
export const verifyPassword = query({
	args: {
		pageId: v.id("posts"),
		password: v.string(),
	},
	handler: async (ctx, args) => {
		const page = await ctx.db.get("posts", args.pageId);

		if (!page || page.type !== "page") {
			return null;
		}

		// Only applicable to password-protected pages
		if (page.visibility !== "password") {
			return null;
		}

		// Only published pages can be accessed via password
		if (page.status !== "publish") {
			return null;
		}

		// Constant-time comparison to prevent timing attacks
		const { timingSafeEquals } = await import("../helpers/timingSafe");
		if (!page.password || !timingSafeEquals(page.password, args.password)) {
			return null;
		}

		// Password correct: return the page document (without the password field)
		const { password: _pw, ...safePageData } = page;
		const membershipAccess = await evaluateMembershipAccess(ctx, {
			resourceType: "page",
			resourceIdOrKey: String(page._id),
		});

		if (!membershipAccess.allowed) {
			return {
				...safePageData,
				content: undefined,
				passwordVerified: true,
				isMembershipRestricted: true,
				membershipAccess,
			};
		}

		return {
			...safePageData,
			passwordVerified: true,
			isMembershipRestricted: false,
			membershipAccess,
		};
	},
});
