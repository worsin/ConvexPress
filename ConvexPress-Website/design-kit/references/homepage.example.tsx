/**
 * REFERENCE — Homepage template
 *
 * This file is NOT shipped to production. It's a working pattern reference
 * read by `design:homepage` (see `.claude/skills/design-homepage/SKILL.md`).
 *
 * What this reference demonstrates:
 *   1. The SSR loader pattern (prefetch via TanStack Query + Convex)
 *   2. Reading the brand doc + acting on it
 *   3. Pulling featured posts + featured products as data
 *   4. Rendering with CSS-variable-driven styling (no color literals)
 *   5. The required `head:` for SEO
 *   6. Skeleton, empty, and not-found states
 *
 * When you generate a real homepage, use this structure but make every
 * visual decision fresh from the brand doc. Don't preserve any of the
 * specific layout choices here — they're shown for completeness, not
 * style.
 */

import { convexQuery } from "@convex-dev/react-query";
import { useQuery as useTanStackQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { api } from "@convexpress-website/backend/generated/api";

import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

// ─── Route ────────────────────────────────────────────────────────────────────

export const Route = createFileRoute("/_marketing/")({
	loader: async ({ context: { queryClient } }) => {
		// Prefetch every query the page needs. Each ensureQueryData uses the
		// same query key the component will read, so React hydrates rather
		// than refetching client-side.
		await Promise.all([
			queryClient.ensureQueryData(convexQuery(api.settings.queries.getBrand, {})),
			queryClient.ensureQueryData(convexQuery(api.settings.queries.getSiteIdentity, {})),
			queryClient.ensureQueryData(
				convexQuery(api.posts.queries.listFeatured, { limit: 3 }),
			),
		]);
	},

	head: () => ({
		meta: [
			{ title: "Home" },
			{
				name: "description",
				content: "The site's homepage.",
			},
			{ property: "og:title", content: "Home" },
			{ property: "og:type", content: "website" },
		],
		links: [{ rel: "canonical", href: "/" }],
	}),

	component: HomePage,
});

// ─── Component ────────────────────────────────────────────────────────────────

function HomePage() {
	const { data: brand } = useTanStackQuery(
		convexQuery(api.settings.queries.getBrand, {}),
	);
	const { data: site } = useTanStackQuery(
		convexQuery(api.settings.queries.getSiteIdentity, {}),
	);
	const { data: featured } = useTanStackQuery(
		convexQuery(api.posts.queries.listFeatured, { limit: 3 }),
	);

	// Loading: the loader ran, but in dev/HMR scenarios queries can still be
	// undefined for a tick. Render skeleton to avoid empty layout flash.
	if (brand === undefined || site === undefined || featured === undefined) {
		return <HomeSkeleton />;
	}

	// Brand missing: the user hasn't run design:brand-discovery yet.
	// (Real templates should still render *something* here — the site's name
	// at minimum — so visitors don't see a broken page. The example shows
	// a defensive but non-empty default.)
	const headline = site?.tagline ?? "Welcome.";
	const subhead =
		brand?.moodPrompt?.slice(0, 140) ??
		"A site built with ConvexPress.";

	return (
		<main className="mx-auto flex w-full max-w-6xl flex-col gap-16 px-4 py-12 sm:py-16 md:gap-24 md:py-24">
			{/* Hero */}
			<section className="flex flex-col gap-6">
				<h1 className="text-4xl font-semibold tracking-tight text-foreground sm:text-5xl md:text-6xl">
					{headline}
				</h1>
				<p className="max-w-2xl text-base text-muted-foreground sm:text-lg">
					{subhead}
				</p>
				<div className="flex flex-wrap gap-3">
					<Link
						to="/blog"
						className={cn(
							"inline-flex items-center rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground",
							"transition-colors hover:bg-primary/90",
							"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
						)}
					>
						Read the blog
					</Link>
					<Link
						to="/products"
						className={cn(
							"inline-flex items-center rounded-md border border-border bg-background px-4 py-2.5 text-sm font-medium text-foreground",
							"transition-colors hover:bg-muted",
							"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
						)}
					>
						Browse products
					</Link>
				</div>
			</section>

			{/* Featured posts */}
			{featured && featured.length > 0 ? (
				<section className="flex flex-col gap-6">
					<header className="flex items-baseline justify-between gap-4">
						<h2 className="text-2xl font-semibold tracking-tight text-foreground">
							Featured writing
						</h2>
						<Link
							to="/blog"
							className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
						>
							All posts →
						</Link>
					</header>

					<ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
						{featured.map((post) => (
							<li key={post._id}>
								<article className="flex h-full flex-col gap-3 rounded-lg border border-border bg-card p-5 transition-colors hover:bg-muted/50">
									{post.featuredImageUrl ? (
										<img
											src={post.featuredImageUrl}
											alt={post.featuredImageAlt ?? ""}
											width={640}
											height={360}
											loading="lazy"
											className="aspect-video w-full rounded-md object-cover"
										/>
									) : null}
									<h3 className="text-lg font-medium text-card-foreground">
										<Link
											to="/blog/$slug"
											params={{ slug: post.slug }}
											className="hover:underline"
										>
											{post.title}
										</Link>
									</h3>
									{post.excerpt ? (
										<p className="line-clamp-3 text-sm text-muted-foreground">
											{post.excerpt}
										</p>
									) : null}
								</article>
							</li>
						))}
					</ul>
				</section>
			) : null}
		</main>
	);
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function HomeSkeleton() {
	return (
		<main className="mx-auto flex w-full max-w-6xl flex-col gap-16 px-4 py-12 sm:py-16 md:gap-24 md:py-24">
			<section className="flex flex-col gap-6">
				<Skeleton className="h-12 w-3/4" />
				<Skeleton className="h-6 w-2/3" />
				<div className="flex gap-3">
					<Skeleton className="h-10 w-32" />
					<Skeleton className="h-10 w-32" />
				</div>
			</section>
			<section className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
				{[0, 1, 2].map((i) => (
					<div key={i} className="flex flex-col gap-3 rounded-lg border border-border p-5">
						<Skeleton className="aspect-video w-full" />
						<Skeleton className="h-5 w-3/4" />
						<Skeleton className="h-4 w-full" />
						<Skeleton className="h-4 w-2/3" />
					</div>
				))}
			</section>
		</main>
	);
}
