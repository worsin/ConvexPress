/**
 * REFERENCE — Search results template
 *
 * Read by `design:search`. Not part of the production build.
 *
 * What this reference demonstrates:
 *   1. Search query from URL search params (`?q=...`)
 *   2. Multi-type results (posts + products + pages) in a single view
 *   3. Empty state vs no-results state
 *   4. Per-result-type result cards with a shared shape
 *   5. noindex meta (search pages shouldn't be indexed)
 */

import { convexQuery } from "@convex-dev/react-query";
import { useQuery as useTanStackQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { api } from "@convexpress-website/backend/generated/api";
import { z } from "zod";

import { Skeleton } from "@/components/ui/skeleton";

// ─── Search param schema ──────────────────────────────────────────────────────

const searchSchema = z.object({
	q: z.string().optional(),
});

// ─── Route ────────────────────────────────────────────────────────────────────

export const Route = createFileRoute("/_marketing/search")({
	validateSearch: (raw) => searchSchema.parse(raw),

	loaderDeps: ({ search }) => ({ q: search.q ?? "" }),

	loader: async ({ context: { queryClient }, deps: { q } }) => {
		if (!q) return;
		await queryClient.ensureQueryData(convexQuery(api.search.queries.search, { query: q }));
	},

	head: ({ search }) => ({
		meta: [
			{ title: search.q ? `Search results for "${search.q}"` : "Search" },
			{ name: "description", content: "Search the site." },
			// Search pages should not be indexed
			{ name: "robots", content: "noindex, follow" },
		],
	}),

	component: SearchPage,
});

// ─── Component ────────────────────────────────────────────────────────────────

function SearchPage() {
	const { q } = Route.useSearch();
	const { data: results } = useTanStackQuery({
		...convexQuery(api.search.queries.search, { query: q ?? "" }),
		enabled: Boolean(q),
	});

	return (
		<main className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-12 md:py-16">
			<header className="flex flex-col gap-2">
				<h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
					Search
				</h1>
				{q ? (
					<p className="text-sm text-muted-foreground">
						Results for <span className="font-medium text-foreground">&ldquo;{q}&rdquo;</span>
					</p>
				) : null}
			</header>

			{!q ? (
				<EmptyPrompt />
			) : results === undefined ? (
				<SearchSkeleton />
			) : !results || results.length === 0 ? (
				<NoResults query={q} />
			) : (
				<ul className="flex flex-col divide-y divide-border">
					{results.map((r: any) => (
						<li key={`${r.type}-${r._id}`} className="py-4">
							<ResultRow result={r} />
						</li>
					))}
				</ul>
			)}
		</main>
	);
}

function ResultRow({ result }: { result: any }) {
	// Map result type → href
	const href =
		result.type === "post"
			? `/blog/${result.slug}`
			: result.type === "product"
				? `/products/${result.slug}`
				: result.type === "page"
					? `/page/${result.path ?? result.slug}`
					: "#";

	return (
		<article className="flex flex-col gap-1">
			<div className="text-xs uppercase tracking-wide text-muted-foreground">
				{result.type}
			</div>
			<h2 className="text-base font-medium text-foreground">
				<Link to={href} className="hover:underline">{result.title}</Link>
			</h2>
			{result.excerpt ? (
				<p className="line-clamp-2 text-sm text-muted-foreground">{result.excerpt}</p>
			) : null}
		</article>
	);
}

function EmptyPrompt() {
	return (
		<div className="rounded-lg border border-dashed border-border bg-muted/30 px-6 py-12 text-center">
			<p className="text-base font-medium text-foreground">Search anything on the site.</p>
			<p className="mt-1 text-sm text-muted-foreground">Try a topic, a product, or an idea.</p>
		</div>
	);
}

function NoResults({ query }: { query: string }) {
	return (
		<div className="rounded-lg border border-dashed border-border bg-muted/30 px-6 py-12 text-center">
			<p className="text-base font-medium text-foreground">
				Nothing matched &ldquo;{query}&rdquo;.
			</p>
			<p className="mt-1 text-sm text-muted-foreground">Try a different term.</p>
		</div>
	);
}

function SearchSkeleton() {
	return (
		<ul className="flex flex-col divide-y divide-border">
			{[0, 1, 2, 3].map((i) => (
				<li key={i} className="flex flex-col gap-2 py-4">
					<Skeleton className="h-3 w-16" />
					<Skeleton className="h-5 w-3/4" />
					<Skeleton className="h-4 w-full" />
				</li>
			))}
		</ul>
	);
}
