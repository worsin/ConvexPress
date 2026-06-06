import { convexQuery } from "@convex-dev/react-query";
import { api } from "@convexpress-website/backend/generated/api";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { NotFoundPage } from "@/components/blog/NotFoundPage";
import { ProductReviews } from "@/components/commerce/ProductReviews";
import { WishlistButton } from "@/components/commerce/WishlistButton";
import { MediaImage } from "@/components/media/MediaImage";
import { UpgradeCTA } from "@/components/membership/UpgradeCTA";
import { useSettings } from "@/contexts/SettingsContext";
import { useCommerceSessionToken } from "@/hooks/useCommerceSessionToken";
import { useProductAccess } from "@/hooks/useProductAccess";
import { buildSeoHead, normalizeSiteUrl, toAbsoluteUrl } from "@/lib/seo/head";
import {
	findMatchingVariant,
	getInitialSelectedOptions,
	isOptionValueEnabled,
} from "./-variantSelection";

export const Route = createFileRoute("/_marketing/products/$slug")({
	loader: async ({ context: { queryClient }, params }) => {
		const publicSettings = await queryClient.ensureQueryData(
			convexQuery(api.settings.queries.getPublic, {}),
		);
		const siteUrl = normalizeSiteUrl(
			(publicSettings as { siteUrl?: string | null })?.siteUrl,
		);
		if ((publicSettings as any)?.plugins?.commerceEnabled !== true) {
			return {
				seoHead: buildSeoHead({
					title: "Product - ConvexPress",
					canonical: toAbsoluteUrl(`/products/${params.slug}`, siteUrl),
				}),
			};
		}

		const product = await queryClient.ensureQueryData(
			convexQuery(api.commerce.products.getBySlug, {
				slug: params.slug,
			}),
		);

		return {
			seoHead: buildSeoHead({
				title: `${product?.title ?? params.slug} - Product - ConvexPress`,
				description:
					product?.excerpt ||
					`Browse ${product?.title ?? params.slug} in the ConvexPress store.`,
				canonical: toAbsoluteUrl(`/products/${params.slug}`, siteUrl),
			}),
		};
	},
	head: ({ loaderData }) => loaderData?.seoHead ?? {},
	component: ProductDetailPage,
});

function ProductDetailPage() {
	const settings = useSettings();
	const currencyCode = settings?.commerceConfig?.currencyCode || "USD";
	const { slug } = Route.useParams();
	const router = useRouter();
	const { sessionToken, isReady } = useCommerceSessionToken();
	const addToCart = useMutation(api.commerce.cart.addItem);
	const { data: product } = useSuspenseQuery(
		convexQuery(api.commerce.products.getBySlug, { slug }) as any,
	) as {
		data: {
			_id: string;
			title: string;
			slug: string;
			description?: string;
			excerpt?: string;
			productType?: "simple" | "variable" | "external";
			displayPrice?: number;
			featuredMediaId?: string;
			sku?: string;
			stockQuantity?: number;
			trackInventory?: boolean;
			isVirtual?: boolean;
			isDownloadable?: boolean;
			categories?: Array<{ _id: string; name: string; slug: string }>;
			optionTypes?: Array<{
				id: string;
				name: string;
				values?: Array<{ id: string; label: string }>;
			}>;
			variants?: Array<{
				_id: string;
				title: string;
				sku?: string;
				optionSummary?: string;
				stockQuantity?: number;
				isDefault?: boolean;
				featuredMediaId?: string;
				price?: { amount: number };
				salePrice?: { amount: number };
				selections?: Array<{
					optionTypeId: string;
					optionValueId: string;
					optionValueLabel: string;
				}>;
				stockStatus?: "instock" | "outofstock" | "onbackorder";
				backorders?: "yes" | "no" | "notify";
				description?: string;
				salePriceFrom?: number;
				salePriceTo?: number;
				manageStock?: "yes" | "no" | "parent";
				status?: string;
			}>;
		} | null;
	};

	const [selectedOptions, setSelectedOptions] = useState<
		Record<string, string>
	>({});
	const optionTypes = product?.optionTypes ?? [];
	const variants = product?.variants ?? [];
	const defaultVariant =
		variants.find((variant) => variant.isDefault) ?? variants[0] ?? null;
	const isVariableProduct =
		product?.productType === "variable" && optionTypes.length > 0;

	// Membership restriction: hide "Add to cart" if the product is gated.
	const productAccess = useProductAccess(product?._id ?? undefined);

	useEffect(() => {
		if (!product || !isVariableProduct || !defaultVariant?.selections?.length)
			return;
		setSelectedOptions(getInitialSelectedOptions(defaultVariant));
	}, [defaultVariant, isVariableProduct, product]);

	const selectedVariant = useMemo(() => {
		if (!product || !isVariableProduct) return null;
		return findMatchingVariant(optionTypes, variants, selectedOptions);
	}, [isVariableProduct, optionTypes, product, selectedOptions, variants]);

	if (!product) {
		return <NotFoundPage />;
	}

	const currentVariant = selectedVariant ?? defaultVariant;
	const displayMediaId =
		currentVariant?.featuredMediaId ?? product.featuredMediaId;
	const currentSku = currentVariant?.sku ?? product.sku;
	const currentStockQuantity =
		currentVariant?.stockQuantity ?? product.stockQuantity;
	const requiresVariantSelection = isVariableProduct && !selectedVariant;

	// WooCommerce-style stock status from variant fields
	const currentStockStatus = currentVariant?.stockStatus ?? "instock";
	const currentBackorders = currentVariant?.backorders ?? "no";
	const isOutOfStock = currentStockStatus === "outofstock";

	function formatPrice(amount?: number) {
		if (typeof amount !== "number") return "Price unavailable";
		return new Intl.NumberFormat("en-US", {
			style: "currency",
			currency: currencyCode,
		}).format(amount / 100);
	}

	function isVariantOnSale(variant: {
		salePrice?: { amount: number };
		salePriceFrom?: number;
		salePriceTo?: number;
	} | null | undefined): boolean {
		if (!variant?.salePrice?.amount) return false;
		const now = Date.now();
		if (variant.salePriceFrom && variant.salePriceFrom > now) return false;
		if (variant.salePriceTo && variant.salePriceTo < now) return false;
		return true;
	}

	// Compute effective price considering scheduled sales
	const currentVariantOnSale = isVariantOnSale(currentVariant);
	const currentPrice = currentVariant
		? currentVariantOnSale
			? currentVariant.salePrice!.amount
			: (currentVariant.price?.amount ?? product.displayPrice)
		: product.displayPrice;
	const currentRegularPrice = currentVariant?.price?.amount;

	// Price range for variable products when no variant is selected
	const priceRange = useMemo(() => {
		if (!isVariableProduct || variants.length === 0) return null;
		const variantPrices = variants
			.filter(
				(v) =>
					v.status !== "draft" &&
					v.status !== "private" &&
					v.price?.amount,
			)
			.map((v) => {
				const onSale = isVariantOnSale(v);
				return onSale ? v.salePrice!.amount : v.price!.amount;
			});
		if (variantPrices.length === 0) return null;
		const minPrice = Math.min(...variantPrices);
		const maxPrice = Math.max(...variantPrices);
		return { minPrice, maxPrice };
	}, [isVariableProduct, variants]);

	function optionValueEnabled(optionTypeId: string, optionValueId: string) {
		if (!isVariableProduct) return true;
		return isOptionValueEnabled(
			optionTypeId,
			optionValueId,
			selectedOptions,
			variants,
		);
	}

	async function handleAddToCart() {
		if (!isReady || !sessionToken || !product) return;

		try {
			await addToCart({
				sessionToken,
				productId: product._id,
				variantId: isVariableProduct ? selectedVariant?._id : undefined,
				quantity: 1,
			});
			toast.success("Added to cart");
			router.navigate({ to: "/cart" });
		} catch (error) {
			toast.error(
				(error as { data?: { message?: string } })?.data?.message ??
					"Failed to add item to cart",
			);
		}
	}

	return (
		<div className="mx-auto flex w-full max-w-[1440px] flex-col gap-10 py-10 lg:py-12">
			<div className="flex items-center gap-2 text-sm text-muted-foreground">
				<Link to="/products" className="hover:text-foreground">
					Products
				</Link>
				<span>/</span>
				<span className="text-foreground">{product.title}</span>
			</div>

			<div className="grid gap-8 xl:grid-cols-[minmax(0,1.35fr)_minmax(420px,600px)] xl:items-start">
				<div className="overflow-hidden rounded-[2rem] border border-border bg-card shadow-sm xl:sticky xl:top-28">
					<div className="aspect-[4/3] bg-muted/40">
						{displayMediaId ? (
							<MediaImage
								mediaId={displayMediaId as any}
								alt={product.title}
								className="h-full w-full object-cover"
								preferredSize="large"
								sizes="(max-width: 1024px) 100vw, 60vw"
								loading="eager"
							/>
						) : (
							<div className="flex h-full items-center justify-center bg-gradient-to-br from-primary/10 to-primary/5 text-sm text-primary">
								{slug}
							</div>
						)}
					</div>
				</div>

				<div className="flex flex-col gap-6 rounded-[2rem] border border-border bg-card p-8 shadow-sm">
					<div className="flex flex-wrap gap-2">
						{(product.categories ?? []).map((category) => (
							<span
								key={category._id}
								className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary"
							>
								{category.name}
							</span>
						))}
					</div>

					<div className="space-y-3">
						<h1 className="text-4xl font-semibold tracking-tight text-foreground">
							{product.title}
						</h1>
						{product.excerpt ? (
							<p className="text-base leading-7 text-muted-foreground">
								{product.excerpt}
							</p>
						) : null}
					</div>

					<div className="text-3xl font-semibold text-foreground">
						{requiresVariantSelection && priceRange ? (
							priceRange.minPrice !== priceRange.maxPrice ? (
								<>
									{formatPrice(priceRange.minPrice)} &ndash;{" "}
									{formatPrice(priceRange.maxPrice)}
								</>
							) : (
								formatPrice(priceRange.minPrice)
							)
						) : currentVariantOnSale && currentRegularPrice ? (
							<>
								<span className="text-xl text-muted-foreground line-through mr-2">
									{formatPrice(currentRegularPrice)}
								</span>
								{formatPrice(currentPrice)}
							</>
						) : (
							formatPrice(currentPrice)
						)}
					</div>

					{isVariableProduct ? (
						<div className="space-y-4 rounded-2xl border border-border bg-muted/20 p-4">
							{optionTypes.map((optionType) => (
								<div key={optionType.id} className="space-y-2">
									<p className="text-sm font-medium text-foreground">
										{optionType.name}
									</p>
									<div className="flex flex-wrap gap-2">
										{(optionType.values ?? []).map((value) => {
											const selected =
												selectedOptions[optionType.id] === value.id;
											const enabled = optionValueEnabled(
												optionType.id,
												value.id,
											);

											return (
												<button
													key={value.id}
													type="button"
													disabled={!enabled}
													onClick={() =>
														setSelectedOptions((current) => ({
															...current,
															[optionType.id]: value.id,
														}))
													}
													className={`rounded-full border px-3 py-1.5 text-sm transition ${
														selected
															? "border-primary bg-primary text-primary-foreground"
															: "border-border bg-background text-foreground"
													} disabled:cursor-not-allowed disabled:opacity-40`}
												>
													{value.label}
												</button>
											);
										})}
									</div>
								</div>
							))}
							<p className="text-sm text-muted-foreground">
								{selectedVariant
									? selectedVariant.optionSummary || selectedVariant.title
									: "Select one value from each option to choose a variant."}
							</p>
						</div>
					) : null}

					{currentVariant?.description ? (
						<p className="text-sm text-muted-foreground">
							{currentVariant.description}
						</p>
					) : null}

					{!requiresVariantSelection ? (
						<div className="flex items-center gap-2 text-sm">
							{currentStockStatus === "instock" ? (
								<span className="text-primary font-medium">
									In stock
								</span>
							) : currentStockStatus === "outofstock" ? (
								<span className="text-destructive font-medium">
									Out of stock
								</span>
							) : currentStockStatus === "onbackorder" &&
							  currentBackorders === "notify" ? (
								<span className="text-primary font-medium">
									Available on backorder
								</span>
							) : null}
						</div>
					) : null}

					{!productAccess.allowed ? (
						/* Membership gate: replace add-to-cart with an upgrade prompt */
						<UpgradeCTA
							matchingPlanIds={productAccess.matchingPlanIds as any}
							title="Members-only product"
							description="This product is available to members only. Upgrade your plan to purchase."
						/>
					) : (
						<div className="flex flex-wrap items-center gap-3">
							<button
								type="button"
								onClick={() => void handleAddToCart()}
								disabled={!isReady || isOutOfStock || requiresVariantSelection}
								className="inline-flex items-center justify-center rounded-xl bg-primary px-5 py-3 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
							>
								{requiresVariantSelection
									? "Select options"
									: isOutOfStock
										? "Out of stock"
										: "Add to cart"}
							</button>
							<Link
								to="/cart"
								className="inline-flex items-center justify-center rounded-xl border border-border px-5 py-3 text-sm font-medium text-foreground hover:bg-muted/60"
							>
								View cart
							</Link>
							{!isVariableProduct || selectedVariant ? (
								<WishlistButton
									productId={product._id}
									variantId={isVariableProduct ? selectedVariant?._id : undefined}
									className="inline-flex items-center justify-center rounded-xl border border-border px-5 py-3 text-sm font-medium text-foreground hover:bg-muted/60 disabled:cursor-not-allowed disabled:opacity-50"
								/>
							) : null}
						</div>
					)}

					<dl className="grid gap-3 text-sm sm:grid-cols-2">
						<div className="rounded-2xl bg-muted/40 p-4">
							<dt className="text-muted-foreground">SKU</dt>
							<dd className="mt-1 font-medium text-foreground">
								{currentSku || "—"}
							</dd>
						</div>
						<div className="rounded-2xl bg-muted/40 p-4">
							<dt className="text-muted-foreground">Availability</dt>
							<dd className="mt-1 font-medium text-foreground">
								{currentStockStatus === "instock"
									? currentStockQuantity != null
										? `${currentStockQuantity} in stock`
										: "In stock"
									: currentStockStatus === "outofstock"
										? "Out of stock"
										: currentStockStatus === "onbackorder"
											? "On backorder"
											: product.trackInventory === false
												? "Not tracked"
												: (currentStockQuantity ?? "Out of stock")}
							</dd>
						</div>
						<div className="rounded-2xl bg-muted/40 p-4">
							<dt className="text-muted-foreground">Delivery</dt>
							<dd className="mt-1 font-medium text-foreground">
								{product.isDownloadable
									? "Digital"
									: product.isVirtual
										? "Virtual service"
										: "Physical"}
							</dd>
						</div>
						<div className="rounded-2xl bg-muted/40 p-4">
							<dt className="text-muted-foreground">Slug</dt>
							<dd className="mt-1 font-medium text-foreground">
								{product.slug}
							</dd>
						</div>
					</dl>

					{currentVariant?.title ? (
						<div className="rounded-2xl border border-dashed border-border p-4">
							<p className="text-sm leading-6 text-muted-foreground">
								Selected variant:{" "}
								<span className="font-medium text-foreground">
									{currentVariant.optionSummary || currentVariant.title}
								</span>
							</p>
							{currentVariant.sku ? (
								<p className="mt-1 text-xs text-muted-foreground">
									SKU: {currentVariant.sku}
								</p>
							) : null}
						</div>
					) : null}
				</div>
			</div>

			{product.description ? (
				<section className="rounded-[2rem] border border-border bg-card p-8 shadow-sm">
					<h2 className="text-2xl font-semibold tracking-tight">Description</h2>
					<p className="mt-4 whitespace-pre-wrap text-base leading-8 text-muted-foreground">
						{product.description}
					</p>
				</section>
			) : null}

			<ProductReviews productId={product._id} />
		</div>
	);
}
