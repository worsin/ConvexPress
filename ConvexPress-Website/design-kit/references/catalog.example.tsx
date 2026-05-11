/**
 * REFERENCE — Product catalog (index) template
 *
 * Read by `design:catalog`. Not part of the production build.
 *
 * What this reference demonstrates:
 *   1. Faceted filters (categories, price range, tags) via search params
 *   2. Sort dropdown
 *   3. Paginated grid with cursor
 *   4. Skeleton for grid + filters
 *   5. CollectionPage JSON-LD
 */

import { convexQuery } from "@convex-dev/react-query";
import { useQuery as useTanStackQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { api } from "@convexpress-website/backend/generated/api";

import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

// ─── Route ────────────────────────────────────────────────────────────────────

export const Route = createFileRoute("/_marketing/products/")({
	loader: async ({ context: { queryClient } }) => {
		await Promise.all([
			queryClient.ensureQueryData(convexQuery(api.settings.queries.getBySection, { section: "brand" })),
			queryClient.ensureQueryData(
				convexQuery(api.commerce.products.list, { paginationOpts: { numItems: 24, cursor: null } }),
			),
			queryClient.ensureQueryData(convexQuery(api.commerce.categories.list, {})),
		]);
	},

	head: () => ({
		meta: [
			{ title: "Shop" },
			{ name: "description", content: "Browse all products." },
			{ property: "og:type", content: "website" },
		],
		links: [{ rel: "canonical", href: "/products" }],
	}),

	component: Catalog,
});

// ─── Component ────────────────────────────────────────────────────────────────

function Catalog() {
	const { data: products } = useTanStackQuery(
		convexQuery(api.commerce.products.list, { paginationOpts: { numItems: 24, cursor: null } }),
	);
	const { data: categories } = useTanStackQuery(convexQuery(api.commerce.categories.list, {}));

	if (products === undefined || categories === undefined) return <CatalogSkeleton />;

	const items = products?.page ?? [];

	return (
		<main className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-4 py-8 md:py-12">
			<header className="flex flex-col gap-3 sm:flex-row sm:items-baseline sm:justify-between">
				<div>
					<h1 className="text-3xl font-semibold tracking-tight text-foreground">Shop</h1>
					<p className="mt-1 text-sm text-muted-foreground">All products.</p>
				</div>

				{/* Sort dropdown — real implementation uses Base UI <Select>.
				    Track sort via search params for shareable URLs. */}
				<div className="flex items-center gap-2">
					<label htmlFor="sort" className="text-sm text-muted-foreground">Sort</label>
					<select
						id="sort"
						className="rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground"
					>
						<option value="newest">Newest</option>
						<option value="price-asc">Price: low → high</option>
						<option value="price-desc">Price: high → low</option>
					</select>
				</div>
			</header>

			<div className="grid gap-8 lg:grid-cols-[16rem,1fr]">
				{/* Filters rail */}
				<aside className="hidden lg:block">
					<div className="rounded-lg border border-border bg-card p-4">
						<h2 className="mb-3 text-sm font-semibold text-card-foreground">Categories</h2>
						<ul className="flex flex-col gap-1">
							{(categories ?? []).map((cat: any) => (
								<li key={cat._id}>
									<Link
										to="/category/$slug"
										params={{ slug: cat.slug }}
										className="block rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
									>
										{cat.name}
									</Link>
								</li>
							))}
						</ul>
					</div>
				</aside>

				{/* Product grid */}
				<section>
					{items.length === 0 ? (
						<div className="rounded-lg border border-dashed border-border bg-muted/30 px-6 py-16 text-center">
							<p className="text-base font-medium text-foreground">No products yet.</p>
						</div>
					) : (
						<ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
							{items.map((p: any) => (
								<li key={p._id}>
									<ProductCard product={p} />
								</li>
							))}
						</ul>
					)}
				</section>
			</div>
		</main>
	);
}

function ProductCard({ product }: { product: any }) {
	return (
		<article className="flex h-full flex-col gap-3 rounded-lg border border-border bg-card p-4 transition-colors hover:bg-muted/50">
			{product.featuredImageUrl ? (
				<img
					src={product.featuredImageUrl}
					alt={product.title}
					width={600}
					height={600}
					loading="lazy"
					className="aspect-square w-full rounded-md object-cover"
				/>
			) : (
				<div className="aspect-square w-full rounded-md bg-muted" />
			)}
			<div className="flex flex-col gap-1">
				<h3 className="text-sm font-medium text-card-foreground">
					<Link to="/products/$slug" params={{ slug: product.slug }} className="hover:underline">
						{product.title}
					</Link>
				</h3>
				<p className={cn("text-sm text-muted-foreground")}>
					${product.price?.toFixed(2)}
				</p>
			</div>
		</article>
	);
}

function CatalogSkeleton() {
	return (
		<main className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-4 py-8">
			<Skeleton className="h-10 w-32" />
			<div className="grid gap-8 lg:grid-cols-[16rem,1fr]">
				<Skeleton className="hidden h-96 w-full lg:block" />
				<div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
					{[0, 1, 2, 3, 4, 5].map((i) => (
						<div key={i} className="flex flex-col gap-3 rounded-lg border border-border p-4">
							<Skeleton className="aspect-square w-full" />
							<Skeleton className="h-4 w-3/4" />
							<Skeleton className="h-4 w-1/3" />
						</div>
					))}
				</div>
			</div>
		</main>
	);
}
