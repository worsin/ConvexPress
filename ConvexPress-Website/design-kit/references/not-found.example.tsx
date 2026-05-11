/**
 * REFERENCE — 404 / Not Found template
 *
 * Read by `design:not-found`. Not part of the production build.
 *
 * The 404 component is referenced from `routes/__root.tsx` as
 * `notFoundComponent`. This file shows what that component should look like.
 *
 * What this reference demonstrates:
 *   1. Clear primary message + secondary guidance
 *   2. Strong CTAs back to home + search
 *   3. Optional "recently published" hint to recover the visitor's intent
 *   4. noindex in head (404 pages shouldn't index)
 *   5. Brand-consistent styling via CSS variables
 */

import { Link } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { api } from "@convexpress-website/backend/generated/api";
import { Home, Search as SearchIcon } from "lucide-react";

import { cn } from "@/lib/utils";

export function NotFoundTemplate() {
	const recent = useQuery(api.posts.queries.listPublished, {
		paginationOpts: { numItems: 3, cursor: null },
	});

	return (
		<main className="mx-auto flex min-h-[60vh] w-full max-w-3xl flex-col items-center justify-center gap-6 px-4 py-16 text-center">
			<p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
				404
			</p>
			<h1 className="text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
				We couldn&apos;t find that page.
			</h1>
			<p className="max-w-prose text-muted-foreground">
				The link may be old or mistyped. Try the homepage or search the site.
			</p>

			<div className="flex flex-wrap items-center justify-center gap-3">
				<Link
					to="/"
					className={cn(
						"inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground",
						"hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
					)}
				>
					<Home className="size-4" />
					Home
				</Link>
				<Link
					to="/search"
					className={cn(
						"inline-flex items-center gap-2 rounded-md border border-border bg-background px-4 py-2 text-sm font-medium text-foreground",
						"hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
					)}
				>
					<SearchIcon className="size-4" />
					Search
				</Link>
			</div>

			{recent && recent.page && recent.page.length > 0 ? (
				<section className="mt-8 w-full max-w-md">
					<h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
						Recent posts
					</h2>
					<ul className="flex flex-col gap-2 text-left">
						{recent.page.map((p: any) => (
							<li key={p._id}>
								<Link
									to="/blog/$slug"
									params={{ slug: p.slug }}
									className="text-sm text-foreground hover:underline"
								>
									{p.title}
								</Link>
							</li>
						))}
					</ul>
				</section>
			) : null}
		</main>
	);
}

/**
 * Note on SEO:
 *   The 404 page should set `<meta name="robots" content="noindex" />`.
 *   In TanStack Start, the `notFoundComponent` doesn't define its own
 *   `head:`, so the root route's `head:` should add the noindex tag
 *   conditionally, OR the component renders a <Helmet>-style head update
 *   via the route's head hooks. Real implementation should set HTTP 404
 *   status via the server response too (router supports `throw notFound()`).
 */
