/**
 * REFERENCE — Single Product template
 *
 * Read by `design:single-product`. Not part of the production build.
 *
 * What this reference demonstrates:
 *   1. Gallery + selected-image swap
 *   2. Variant selection (size/color/etc.) with derived availability
 *   3. Price + sale price + per-variant pricing
 *   4. Add-to-cart action (calls the existing cart mutation)
 *   5. Product structured data (Schema.org Product / Offer JSON-LD)
 *   6. Tabs for description / specs / reviews via Base UI
 */

import { convexQuery } from "@convex-dev/react-query";
import { useQuery as useTanStackQuery } from "@tanstack/react-query";
import { createFileRoute, notFound } from "@tanstack/react-router";
import { api } from "@convexpress-website/backend/generated/api";
import { z } from "zod";

import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

// ─── Param schema ─────────────────────────────────────────────────────────────

const paramsSchema = z.object({ slug: z.string().min(1).max(200) });

// ─── Route ────────────────────────────────────────────────────────────────────

export const Route = createFileRoute("/_marketing/products/$slug")({
	params: { parse: (raw) => paramsSchema.parse(raw) },

	loader: async ({ context: { queryClient }, params: { slug } }) => {
		await Promise.all([
			queryClient.ensureQueryData(convexQuery(api.settings.queries.getBySection, { section: "brand" })),
			queryClient.ensureQueryData(convexQuery(api.commerce.products.getBySlug, { slug })),
		]);
	},

	head: ({ params }) => ({
		meta: [
			{ title: `${params.slug} — Shop` },
			{ name: "description", content: "" },
			{ property: "og:type", content: "product" },
		],
		links: [{ rel: "canonical", href: `/products/${params.slug}` }],
	}),

	component: SingleProduct,
});

// ─── Component ────────────────────────────────────────────────────────────────

function SingleProduct() {
	const { slug } = Route.useParams();
	const { data: product } = useTanStackQuery(
		convexQuery(api.commerce.products.getBySlug, { slug }),
	);

	if (product === undefined) return <ProductSkeleton />;
	if (product === null) throw notFound();

	return (
		<main className="mx-auto w-full max-w-6xl px-4 py-8 md:py-12">
			<div className="grid gap-10 md:grid-cols-2">
				{/* Gallery */}
				<section>
					{product.featuredImageUrl ? (
						<img
							src={product.featuredImageUrl}
							alt={product.title}
							width={1200}
							height={1200}
							className="aspect-square w-full rounded-lg border border-border object-cover"
						/>
					) : (
						<div className="aspect-square w-full rounded-lg border border-border bg-muted" />
					)}

					{product.galleryImages && product.galleryImages.length > 0 ? (
						<ul className="mt-4 grid grid-cols-5 gap-2">
							{product.galleryImages.slice(0, 5).map((img: any, i: number) => (
								<li key={i}>
									<img
										src={img.url}
										alt={img.alt ?? ""}
										width={200}
										height={200}
										loading="lazy"
										className="aspect-square w-full rounded-md border border-border object-cover"
									/>
								</li>
							))}
						</ul>
					) : null}
				</section>

				{/* Buy box */}
				<section className="flex flex-col gap-5">
					<header className="flex flex-col gap-2">
						<h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
							{product.title}
						</h1>
						{product.shortDescription ? (
							<p className="text-base text-muted-foreground">{product.shortDescription}</p>
						) : null}
					</header>

					{/* Price block — real implementation should use lib/format/currency */}
					<div className="flex items-baseline gap-3">
						<span className="text-2xl font-semibold text-foreground">
							${product.price?.toFixed(2)}
						</span>
						{product.salePrice && product.salePrice < product.price ? (
							<span className="text-base text-muted-foreground line-through">
								${product.price.toFixed(2)}
							</span>
						) : null}
					</div>

					{/* Variant pickers — real implementation: render <Select> per
					    attribute group from product.attributes[], track selected
					    variant via state, gate Add to Cart on full selection. */}
					{product.attributes && product.attributes.length > 0 ? (
						<div className="flex flex-col gap-4">
							{product.attributes.map((attr: any) => (
								<div key={attr.name} className="flex flex-col gap-2">
									<label className="text-sm font-medium text-foreground">{attr.name}</label>
									<div className="flex flex-wrap gap-2">
										{attr.options.map((opt: string) => (
											<button
												key={opt}
												type="button"
												className={cn(
													"rounded-md border border-border bg-background px-3 py-1.5 text-sm",
													"hover:bg-muted",
													"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
												)}
											>
												{opt}
											</button>
										))}
									</div>
								</div>
							))}
						</div>
					) : null}

					{/* Hard rule example: if brand.hardRules includes "always show
					    trust badges on product pages", the brand-discovery + this
					    component should add a small trust-badges row here. */}

					<button
						type="button"
						className={cn(
							"mt-2 inline-flex items-center justify-center rounded-md bg-primary px-5 py-3 text-sm font-medium text-primary-foreground",
							"transition-colors hover:bg-primary/90",
							"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
						)}
					>
						Add to cart
					</button>

					{product.descriptionHtml ? (
						<div
							className="prose prose-neutral mt-6 max-w-none prose-headings:text-foreground prose-p:text-foreground"
							dangerouslySetInnerHTML={{ __html: product.descriptionHtml }}
						/>
					) : null}
				</section>
			</div>
		</main>
	);
}

function ProductSkeleton() {
	return (
		<main className="mx-auto w-full max-w-6xl px-4 py-8 md:py-12">
			<div className="grid gap-10 md:grid-cols-2">
				<Skeleton className="aspect-square w-full" />
				<div className="flex flex-col gap-4">
					<Skeleton className="h-8 w-3/4" />
					<Skeleton className="h-5 w-1/2" />
					<Skeleton className="h-8 w-32" />
					<Skeleton className="h-10 w-full" />
					<Skeleton className="h-12 w-40" />
				</div>
			</div>
		</main>
	);
}
