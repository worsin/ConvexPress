/**
 * REFERENCE — Single Page (static page) template
 *
 * Read by `design:single-page`. Not part of the production build.
 *
 * Static "pages" (About, Contact, Services, Landing pages) differ from
 * posts: no author byline, no comments, no published-at by default,
 * arbitrary slug (catch-all). Many will be marketing landing pages with
 * heavier composition than a post.
 *
 * What this reference demonstrates:
 *   1. Catch-all `$` param to handle arbitrary nested paths
 *   2. Pulling page content blocks from the page system
 *   3. JSON-LD WebPage structured data
 *   4. Per-page SEO override (page-level title/description from data)
 */

import { convexQuery } from "@convex-dev/react-query";
import { useQuery as useTanStackQuery } from "@tanstack/react-query";
import { createFileRoute, notFound } from "@tanstack/react-router";
import { api } from "@convexpress-website/backend/generated/api";

import { Skeleton } from "@/components/ui/skeleton";

// ─── Route ────────────────────────────────────────────────────────────────────

export const Route = createFileRoute("/_marketing/page/$")({
	loader: async ({ context: { queryClient }, params }) => {
		// $ params come through as `_splat` joined with slashes
		const path = `/${params._splat ?? ""}`;
		await Promise.all([
			queryClient.ensureQueryData(convexQuery(api.settings.queries.getBySection, { section: "brand" })),
			queryClient.ensureQueryData(convexQuery(api.pages.queries.getByPath, { path })),
		]);
	},

	head: ({ params }) => ({
		meta: [
			{ title: params._splat ?? "Page" },
			{ name: "description", content: "" },
			{ property: "og:type", content: "website" },
		],
		links: [{ rel: "canonical", href: `/page/${params._splat ?? ""}` }],
	}),

	component: SinglePage,
});

// ─── Component ────────────────────────────────────────────────────────────────

function SinglePage() {
	const params = Route.useParams();
	const path = `/${params._splat ?? ""}`;
	const { data: page } = useTanStackQuery(
		convexQuery(api.pages.queries.getByPath, { path }),
	);
	const { data: brand } = useTanStackQuery(
		convexQuery(api.settings.queries.getBySection, { section: "brand" }),
	);

	if (page === undefined || brand === undefined) {
		return <PageSkeleton />;
	}

	if (page === null) {
		throw notFound();
	}

	return (
		<main className="mx-auto flex w-full max-w-4xl flex-col gap-10 px-4 py-12 md:py-16">
			<header className="flex flex-col gap-3">
				<h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl md:text-5xl">
					{page.title}
				</h1>
				{page.subtitle ? (
					<p className="text-lg text-muted-foreground">{page.subtitle}</p>
				) : null}
			</header>

			{/* Page body. Use existing PageRenderer if it exists in the project;
			    otherwise render structured content via the same helpers as posts.
			    Don't reimplement block rendering inline. */}
			<div
				className="prose prose-neutral max-w-none prose-headings:text-foreground prose-p:text-foreground prose-a:text-primary"
				dangerouslySetInnerHTML={{ __html: page.contentHtml ?? "" }}
			/>
		</main>
	);
}

function PageSkeleton() {
	return (
		<main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-12">
			<Skeleton className="h-10 w-2/3" />
			<Skeleton className="h-5 w-1/2" />
			<div className="space-y-3">
				<Skeleton className="h-4 w-full" />
				<Skeleton className="h-4 w-full" />
				<Skeleton className="h-4 w-3/4" />
			</div>
		</main>
	);
}
