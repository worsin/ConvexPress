/**
 * REFERENCE — Custom Post Type archive
 *
 * Read by `design:custom-post-type`. Not part of the production build.
 *
 * The example here uses a hypothetical "caseStudies" CPT. In real
 * generation, substitute the actual CPT system name + URL slug.
 *
 * What this reference demonstrates (unique to CPT archives):
 *   1. Pulling listPublished from a CPT-specific Convex namespace
 *   2. CPT-specific filter UI (e.g., "industry" facet on case studies)
 *   3. CollectionPage JSON-LD typed to the CPT
 *   4. URL convention: /<plural-slug>/...
 *   5. Cards linking to /<plural-slug>/$slug
 *
 * Substitute everywhere you see CPT-specific names:
 *   api.caseStudies.queries.*  → api.<cpt>.queries.*
 *   "case-studies"             → <plural URL slug>
 *   "Case Studies"             → display name
 */

import { convexQuery } from "@convex-dev/react-query";
import { useQuery as useTanStackQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { api } from "@convexpress-website/backend/generated/api";

import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

// ─── Route ────────────────────────────────────────────────────────────────────

export const Route = createFileRoute("/_marketing/case-studies/")({
	loader: async ({ context: { queryClient } }) => {
		await Promise.all([
			queryClient.ensureQueryData(
				convexQuery(api.settings.queries.getBySection, { section: "brand" }),
			),
			queryClient.ensureQueryData(
				// NOTE: substitute api.<cpt>.queries.listPublished for your CPT
				convexQuery(api.posts.queries.listPublished, {
					paginationOpts: { numItems: 12, cursor: null },
				}),
			),
		]);
	},

	head: () => ({
		meta: [
			{ title: "Case Studies" },
			{ name: "description", content: "Customer success stories." },
			{ property: "og:title", content: "Case Studies" },
			{ property: "og:type", content: "website" },
		],
		links: [{ rel: "canonical", href: "/case-studies" }],
	}),

	component: CaseStudiesArchive,
});

// ─── Component ────────────────────────────────────────────────────────────────

function CaseStudiesArchive() {
	const { data: result } = useTanStackQuery(
		// NOTE: substitute api.<cpt>.queries.listPublished for your CPT
		convexQuery(api.posts.queries.listPublished, {
			paginationOpts: { numItems: 12, cursor: null },
		}),
	);

	if (result === undefined) return <ArchiveSkeleton />;

	const items = result?.page ?? [];

	return (
		<main className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-4 py-12 md:py-16">
			<header className="flex flex-col gap-2">
				<h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
					Case Studies
				</h1>
				<p className="text-muted-foreground">
					How customers use the product in production.
				</p>
			</header>

			{/* CPT-specific filter row.
			    Adapt for the CPT's filterable fields:
			      - Case studies → industry, team size
			      - Events       → upcoming / past
			      - Team         → department
			      - Locations    → region
			    Default to no filter row if the CPT doesn't have meaningful facets. */}
			<div className="flex flex-wrap gap-2">
				{["All", "SaaS", "Healthcare", "Finance"].map((label) => (
					<button
						key={label}
						type="button"
						className={cn(
							"rounded-full border border-border bg-background px-3 py-1.5 text-xs font-medium",
							"hover:bg-muted",
							"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
						)}
					>
						{label}
					</button>
				))}
			</div>

			{items.length === 0 ? (
				<EmptyState />
			) : (
				<ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
					{items.map((item) => (
						<li key={item._id}>
							<CaseStudyCard item={item} />
						</li>
					))}
				</ul>
			)}

			{result?.continueCursor ? (
				<div className="flex justify-center">
					<button
						type="button"
						className={cn(
							"rounded-md border border-border bg-background px-4 py-2 text-sm font-medium text-foreground",
							"hover:bg-muted",
							"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
						)}
					>
						Load more
					</button>
				</div>
			) : null}
		</main>
	);
}

function CaseStudyCard({ item }: { item: any }) {
	return (
		<article className="flex h-full flex-col gap-3 rounded-lg border border-border bg-card p-5 transition-colors hover:bg-muted/50">
			{item.featuredImageUrl ? (
				<img
					src={item.featuredImageUrl}
					alt={item.featuredImageAlt ?? ""}
					width={640}
					height={360}
					loading="lazy"
					className="aspect-video w-full rounded-md object-cover"
				/>
			) : null}
			<h2 className="text-lg font-medium text-card-foreground">
				{/* NOTE: substitute the route path for your CPT's URL convention */}
				<Link
					to="/case-studies/$slug"
					params={{ slug: item.slug }}
					className="hover:underline"
				>
					{item.title}
				</Link>
			</h2>
			{item.excerpt ? (
				<p className="line-clamp-3 text-sm text-muted-foreground">
					{item.excerpt}
				</p>
			) : null}
		</article>
	);
}

function EmptyState() {
	return (
		<div className="rounded-lg border border-dashed border-border bg-muted/30 px-6 py-16 text-center">
			<p className="text-base font-medium text-foreground">
				No case studies yet.
			</p>
			<p className="mt-1 text-sm text-muted-foreground">
				Case studies you publish in the admin will appear here.
			</p>
		</div>
	);
}

function ArchiveSkeleton() {
	return (
		<main className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-4 py-12">
			<Skeleton className="h-10 w-48" />
			<div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
				{[0, 1, 2, 3, 4, 5].map((i) => (
					<div
						key={i}
						className="flex flex-col gap-3 rounded-lg border border-border p-5"
					>
						<Skeleton className="aspect-video w-full" />
						<Skeleton className="h-5 w-3/4" />
						<Skeleton className="h-4 w-full" />
						<Skeleton className="h-4 w-2/3" />
					</div>
				))}
			</div>
		</main>
	);
}
