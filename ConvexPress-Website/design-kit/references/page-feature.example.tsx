/**
 * REFERENCE — Page with custom functionality
 *
 * Read by `design:page-feature`. Not part of the production build.
 *
 * The example shows a `/find-a-dealer` page: a Page record holds the
 * title / intro / SEO meta, and a bespoke store-locator widget renders
 * below it.
 *
 * What this reference demonstrates:
 *   1. Named route file overrides the catch-all `/page/$` for this URL
 *   2. Pulling the Page record so SEO and intro stay editable in admin
 *   3. Custom React feature layered below the page intro
 *   4. The custom feature can pull its own Convex queries (e.g., a
 *      list of dealers) — verify those exist before referencing
 *
 * Substitute everywhere you see:
 *   "find-a-dealer" → your page slug
 *   StoreLocator    → your feature component
 */

import { convexQuery } from "@convex-dev/react-query";
import { useQuery as useTanStackQuery } from "@tanstack/react-query";
import { createFileRoute, notFound } from "@tanstack/react-router";
import { api } from "@convexpress-website/backend/generated/api";

import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

// ─── Route ────────────────────────────────────────────────────────────────────
//
// TanStack Router precedence: this named file resolves BEFORE the
// catch-all at `/_marketing/page/$.tsx` for the URL `/find-a-dealer`.
// No router config needed — just the file path.

export const Route = createFileRoute("/_marketing/find-a-dealer")({
	loader: async ({ context: { queryClient } }) => {
		await Promise.all([
			queryClient.ensureQueryData(
				convexQuery(api.settings.queries.getBySection, { section: "brand" }),
			),
			queryClient.ensureQueryData(
				convexQuery(api.pages.queries.getByPath, { path: "/find-a-dealer" }),
			),
			// Custom-feature data — verify any queries you add here exist
			// in DATA-API.md. If they don't, that's a backend gap to flag.
			// (Placeholder shown commented out — your feature wires whatever
			// Convex queries it needs.)
			// queryClient.ensureQueryData(convexQuery(api.dealers.queries.list, {})),
		]);
	},

	head: () => ({
		// Title + description come from the Page record at render time so
		// the editor controls SEO. We set defaults here for the head-only
		// pass; the in-component <title>-style update isn't needed since
		// TanStack Start's head:() runs before render.
		meta: [
			{ title: "Find a Dealer" },
			{ name: "description", content: "Find a local dealer near you." },
			{ property: "og:type", content: "website" },
		],
		links: [{ rel: "canonical", href: "/find-a-dealer" }],
	}),

	component: FindADealerPage,
});

// ─── Component ────────────────────────────────────────────────────────────────

function FindADealerPage() {
	const { data: page } = useTanStackQuery(
		convexQuery(api.pages.queries.getByPath, { path: "/find-a-dealer" }),
	);

	if (page === undefined) return <PageFeatureSkeleton />;
	if (page === null) throw notFound();

	return (
		<main className="mx-auto flex w-full max-w-5xl flex-col gap-10 px-4 py-12 md:py-16">
			{/* ── Page header (sourced from the Page record) ─────────────── */}
			<header className="flex flex-col gap-3">
				<h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl md:text-5xl">
					{page.title}
				</h1>
				{page.subtitle ? (
					<p className="text-lg text-muted-foreground">{page.subtitle}</p>
				) : null}

				{/* Optional intro copy from the page's content. Keep this
				    light — the editor uses this for short context, not for
				    the bulk of the page. */}
				{page.contentHtml ? (
					<div
						className={cn(
							"prose prose-neutral max-w-none",
							"prose-p:text-foreground prose-a:text-primary",
						)}
						dangerouslySetInnerHTML={{ __html: page.contentHtml }}
					/>
				) : null}
			</header>

			{/* ── Custom feature: store locator ─────────────────────────── */}
			{/* This is the whole point of design:page-feature — bespoke React
			    that lives only on this route. Build the feature against real
			    data. Don't fake it. If a backend query is missing, flag it
			    in your generation report and design around the gap. */}
			<StoreLocator />
		</main>
	);
}

// ─── Custom feature component ────────────────────────────────────────────────
//
// The feature can live inline in the route file OR be extracted to
// apps/web/src/components/<feature-area>/<Feature>.tsx. Inline is fine
// for single-use features; extract if the same feature might appear on
// more than one page.

function StoreLocator() {
	// In a real implementation:
	//   const { data: dealers } = useTanStackQuery(
	//     convexQuery(api.dealers.queries.list, {})
	//   );
	// Show a filter / search input, a map (lazy-loaded), and a list of
	// results that the user can click to highlight on the map.

	return (
		<section
			aria-label="Store locator"
			className="flex flex-col gap-4 rounded-lg border border-border bg-card p-6"
		>
			<div className="flex flex-col gap-2">
				<label
					htmlFor="zip"
					className="text-sm font-medium text-card-foreground"
				>
					Enter your ZIP or city
				</label>
				<div className="flex gap-2">
					<input
						id="zip"
						type="text"
						placeholder="90210"
						className={cn(
							"min-w-0 flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground",
							"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
						)}
					/>
					<button
						type="submit"
						className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
					>
						Search
					</button>
				</div>
			</div>

			{/* Map area — wire to your chosen library at generation time.
			    Lazy-load to avoid bloating the initial bundle. */}
			<div
				className="grid h-72 place-items-center rounded-md border border-dashed border-border bg-muted/30 text-sm text-muted-foreground"
				aria-label="Map of dealer locations"
			>
				Map renders here
			</div>

			{/* Results list — pulls from your dealer query. */}
			<ul className="flex flex-col divide-y divide-border">
				{/* {dealers?.map(d => <li>…</li>)} */}
			</ul>
		</section>
	);
}

function PageFeatureSkeleton() {
	return (
		<main className="mx-auto flex w-full max-w-5xl flex-col gap-10 px-4 py-12">
			<div className="flex flex-col gap-3">
				<Skeleton className="h-10 w-3/4" />
				<Skeleton className="h-5 w-1/2" />
				<Skeleton className="h-4 w-full" />
			</div>
			<Skeleton className="h-96 w-full" />
		</main>
	);
}
