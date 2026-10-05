import { canonicalPaginationSearch } from "@/templates/sdk/block-public/pagination-search";
import { loadAnonymousCanonical } from "@/templates/sdk/block-public/anonymous-loader";
import { PublicCanonicalScope } from "@/templates/sdk/block-public/PublicCanonicalBody";
/**
 * Single Page Route - /_marketing/page/$
 *
 * Splat route that handles both flat and hierarchical page paths:
 *   /page/about           -> slug "about", path "/about"
 *   /page/services        -> slug "services", path "/services"
 *   /page/services/web-design -> path "/services/web-design"
 *
 * Uses the Convex `pages.queries.getByPath` query for path-based lookups
 * (supports both flat and hierarchical pages).
 *
 * Supports:
 *   - Template-based rendering via PageRenderer
 *   - Password-protected pages via PagePasswordForm
 *   - Breadcrumb navigation for hierarchical pages
 *   - SEO meta tags from page data
 *
 * Pages are fetched from the shared `posts` table with `type: "page"`.
 */

import { useAuth } from "@/lib/auth/clerk";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "@convexpress-website/backend/generated/api";
import type { Id } from "@convexpress-website/backend/generated/dataModel";
import { createFileRoute, notFound } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { useQuery as useTanStackQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import type { RestrictedTeaserMode } from "@/components/membership/RestrictedContent";
import { Skeleton } from "@/components/ui/skeleton";
import { usePageOverrides } from "@/contexts/PageOverridesContext";
import type { PageDetail } from "@/lib/blog/types";
import { buildSeoHead, humanizeSlug, siteTitled } from "@/lib/seo/head";
import CorePage from "@/templates/packs/core/surfaces/page";
import CoreNotFound from "@/templates/packs/core/surfaces/system.notFound";
import CorePasswordGate from "@/templates/packs/core/surfaces/system.passwordGate";
import CoreRestricted from "@/templates/packs/core/surfaces/system.restricted";
import { Surface } from "@/templates/sdk/Surface";

export const Route = createFileRoute("/_marketing/page/$")({
  validateSearch: canonicalPaginationSearch,
  loaderDeps: ({ search }) => ({ request: search.blockPages }),
	component: SinglePage,
	loader: async ({ context: { queryClient }, params, deps }) => {
		// Extract the full path from the splat param (mirrors component logic).
		const splatPath = params._splat ?? "";
		const segments = splatPath.split("/").filter(Boolean);
		const pagePath = `/${segments.join("/")}`;

		// Prefetch page lookup so SSR has data ready.
		const page = await queryClient.ensureQueryData(
			convexQuery(api.pages.queries.getByPath, { path: pagePath }),
		);
		// A rendered not-found surface alone leaves SSR at HTTP200. Signal the
		// router so missing, draft and private-denied documents return HTTP404.
		if (page === null) throw notFound();
		const canonical = await loadAnonymousCanonical(page, deps.request);
		// Metadata and canonical policy are separate reads. Do not return a
		// successful page if publication/access was revoked between them.
		if (canonical === null) throw notFound();

		// Prefetch the membership access decision. Same pattern as blog/$slug.
		if (page && typeof page === "object" && "_id" in page && page._id) {
			await queryClient.ensureQueryData(
				convexQuery(api.membership.queries.checkAccess, {
					resourceType: "page",
					resourceIdOrKey: page._id as string,
				}),
			);
		}

		return {
      canonical,
			seoHead: buildSeoHead({
				title:
					page && typeof page === "object" && "title" in page
						? siteTitled(`${page.title}`)
						: siteTitled(`${humanizeSlug(segments.at(-1) ?? "Page")}`),
				description:
					page && typeof page === "object" && "excerpt" in page
						? page.excerpt
						: undefined,
			}),
		};
	},
	head: ({ loaderData }) => loaderData?.seoHead ?? {},
});

function SinglePage() {
	const params = Route.useParams();
  const {canonical} = Route.useLoaderData();
  const {blockPages: request} = Route.useSearch();
	const { isSignedIn } = useAuth();

	// ── All hooks called unconditionally at the top ──────────────────────
	const [passwordError, setPasswordError] = useState<string | null>(null);
	const [submittedPassword, setSubmittedPassword] = useState<string | null>(
		null,
	);
	const [isVerifying, setIsVerifying] = useState(false);
	const { setOverrides } = usePageOverrides();

	// Extract the full path from the splat param
	const splatPath = params._splat ?? "";
	const segments = splatPath.split("/").filter(Boolean);

	// Build the page path for lookup (e.g., "/services/web-design")
	const pagePath = `/${segments.join("/")}`;

	// Primary lookup: getByPath handles both flat and hierarchical pages.
	// Read through the TanStack cache the loader filled, so the server and the
	// hydrating client render the same page instead of a skeleton vs. content.
	const { data: rawPageByPath } = useTanStackQuery(
		convexQuery(api.pages.queries.getByPath, { path: pagePath }) as any,
	) as { data: any };
	const rawPage = rawPageByPath;

	// Propagate per-page layout overrides (hideHeader/hideFooter) to parent layout
	useEffect(() => {
		if (rawPage && "_id" in rawPage) {
			const page = rawPage as Record<string, unknown>;
			setOverrides({
				hideHeader: (page.hideHeader as boolean) ?? false,
				hideFooter: (page.hideFooter as boolean) ?? false,
				layoutId: (page.layoutId as string) ?? undefined,
			});
		}
		return () => setOverrides({});
	}, [
		rawPage && "_id" in rawPage
			? (rawPage as Record<string, unknown>).hideHeader
			: undefined,
		rawPage && "_id" in rawPage
			? (rawPage as Record<string, unknown>).hideFooter
			: undefined,
		rawPage && "_id" in rawPage
			? (rawPage as Record<string, unknown>).layoutId
			: undefined,
		setOverrides,
	]);

	// Fetch breadcrumbs if we have a page ID
	const pageId = rawPage && "_id" in rawPage ? rawPage._id : undefined;
	const breadcrumbs = useQuery(
		api.pages.queries.getBreadcrumbs,
		pageId ? { pageId: pageId as Id<"posts"> } : "skip",
	);

	// Fetch direct children for the current page.
	const childPages = useQuery(
		api.pages.queries.getChildren,
		pageId
			? { pageId: pageId as Id<"posts">, status: "publish" as const }
			: "skip",
	);

	// Membership access check — skip until we know the page id. Backend
	// short-circuits with `reason: "plugin_disabled"` when the membership
	// plugin is off; we treat that as unrestricted (see gate logic below).
	const { data: access } = useTanStackQuery({
		...(convexQuery(api.membership.queries.checkAccess, {
			resourceType: "page" as const,
			resourceIdOrKey: (pageId ?? "") as string,
		}) as any),
		enabled: !!pageId,
	}) as { data: any };

	// Password verification query (skipped until password is submitted)
	const isPasswordProtected =
		rawPage && "isPasswordProtected" in rawPage && rawPage.isPasswordProtected;
	const verifiedPage = useQuery(
		api.pages.queries.verifyPassword,
		isPasswordProtected && submittedPassword
			? { pageId: rawPage._id as Id<"posts">, password: submittedPassword }
			: "skip",
	);

	// Handle password verification result via useEffect to avoid setState during render
	useEffect(() => {
		if (
			isPasswordProtected &&
			submittedPassword &&
			verifiedPage !== undefined
		) {
			if (verifiedPage === null && isVerifying) {
				setIsVerifying(false);
				setPasswordError("Incorrect password. Please try again.");
			} else if (verifiedPage !== null && isVerifying) {
				setIsVerifying(false);
			}
		}
	}, [isPasswordProtected, submittedPassword, verifiedPage, isVerifying]);

	// ── Render logic (conditional returns are safe after all hooks) ──────

	// Loading state (Convex returns undefined while loading)
	if (rawPageByPath === undefined) {
		return (
			<div className="mx-auto flex max-w-3xl flex-col gap-6 px-4">
				<Skeleton className="h-4 w-48" />
				<Skeleton className="h-8 w-3/4" />
				<div className="flex flex-col gap-3">
					<Skeleton className="h-3 w-full" />
					<Skeleton className="h-3 w-full" />
					<Skeleton className="h-3 w-2/3" />
					<Skeleton className="h-3 w-5/6" />
					<Skeleton className="h-3 w-full" />
				</div>
			</div>
		);
	}

	// Not found
	if (rawPage === null) {
		return <Surface name="system.notFound" data={{ kind: "page" }} fallback={CoreNotFound} />;
	}

	// Password-protected page: show password form until verified
	if (isPasswordProtected) {
		if (!verifiedPage) {
			return (
				<Surface
					name="system.passwordGate"
					data={{
						kind: "page",
						title: rawPage.title,
						onSubmit: (password: string) => {
							setPasswordError(null);
							setIsVerifying(true);
							setSubmittedPassword(password);
						},
						isVerifying: isVerifying && verifiedPage === undefined,
						error: passwordError ?? undefined,
					}}
					fallback={CorePasswordGate}
				/>
			);
		}
	}

	if (!rawPage) {
		return <Surface name="system.notFound" data={{ kind: "page" }} fallback={CoreNotFound} />;
	}

	// Use verified page data when password-protected page has been unlocked
	const resolvedPage = verifiedPage ?? rawPage;

	// Extract child pages for navigation / page templates.
	const children =
		childPages?.map((c: NonNullable<typeof childPages>[number]) => ({
			_id: c._id,
			title: c.title,
			slug: c.slug,
			path: c.path ?? `/${c.slug}`,
		})) ?? [];

	// Map Convex document to PageDetail shape
	const page: PageDetail = {
		_id: resolvedPage._id,
		title: resolvedPage.title,
		slug: resolvedPage.slug,
		path: resolvedPage.path ?? pagePath,
		content: null,
		featuredImageUrl:
			(resolvedPage as { featuredImageUrl?: string }).featuredImageUrl ??
			undefined,
		featuredImageAlt:
			(resolvedPage as { featuredImageAlt?: string }).featuredImageAlt ??
			undefined,
		template:
			(resolvedPage.pageTemplate as PageDetail["template"]) ?? "default",
		contentMode:
			((resolvedPage as { contentMode?: PageDetail["contentMode"] }).contentMode ??
				undefined),
		blocks:
			((resolvedPage as { blocks?: PageDetail["blocks"] }).blocks ?? undefined),
		blocksVersion:
			(resolvedPage as { blocksVersion?: number }).blocksVersion ?? undefined,
		blocksRevision:
			(resolvedPage as { blocksRevision?: number }).blocksRevision ?? undefined,
		parentId: resolvedPage.parentId as string | undefined,
		menuOrder: ("menuOrder" in resolvedPage
			? resolvedPage.menuOrder
			: undefined) as number | undefined,
		depth: ("depth" in resolvedPage ? resolvedPage.depth : undefined) as
			| number
			| undefined,
		isPasswordProtected: false,
		breadcrumbs: breadcrumbs ?? [],
		children: children ?? [],
	};

	// Membership gate: if the access check returned denied and the plugin is
	// enabled, render a restricted view instead of the full page template.
	// The page header (title + featured image handled inside PageContent) is
	// replaced with a lightweight header so the title still appears.
	const embeddedAccess =
		(resolvedPage && "membershipAccess" in resolvedPage
			? resolvedPage.membershipAccess
			: null) ??
		(rawPage && "membershipAccess" in rawPage
			? rawPage.membershipAccess
			: null);
	const effectiveAccess = embeddedAccess ?? access ?? null;
	const isAccessRestricted = Boolean(
		effectiveAccess &&
			effectiveAccess.allowed === false &&
			effectiveAccess.reason !== "plugin_disabled",
	);
	if (isAccessRestricted && effectiveAccess) {
		const teaserMode =
			(effectiveAccess.teaserMode as RestrictedTeaserMode | null | undefined) ??
			"hide";
		const restrictedExcerpt =
			teaserMode === "excerpt"
				? resolvedPage.excerpt?.trim() || undefined
				: undefined;

		return (
			<Surface
				name="system.restricted"
				data={{
					title: page.title,
					mode: teaserMode,
					rule: {
						teaserMode:
							effectiveAccess.teaserMode as RestrictedTeaserMode | null,
						customMessage: effectiveAccess.customMessage,
						matchingPlanIds: effectiveAccess.matchingPlanIds as
							| Id<"membership_plans">[]
							| null,
					},
					excerpt: restrictedExcerpt,
					userState: isSignedIn ? "logged_in_non_member" : "logged_out",
				}}
				fallback={CoreRestricted}
			/>
		);
	}

	return <PublicCanonicalScope request={request} documentId={page._id} initial={canonical} password={submittedPassword ?? undefined}><Surface name="page" data={{ page }} fallback={CorePage} /></PublicCanonicalScope>;
}
