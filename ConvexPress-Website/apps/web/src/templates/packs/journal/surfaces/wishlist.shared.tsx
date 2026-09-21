import { WishlistPageNavigation } from "@/lib/commerce/wishlist-pagination";
/**
 * Journal · wishlist.shared — a wishlist shared by link: the owner in an
 * eyebrow, the list name in display type, the count in small caps, then a
 * three-up boutique grid (4:5 image, display-type title, variant, price)
 * with a quiet "Add to cart" pill per item. Same states as Core: loading,
 * private / invalid link, empty list; each pill waits on its own add.
 */
import { Link } from "@tanstack/react-router";
import { useState } from "react";

import { MediaImage } from "@/components/media/MediaImage";
import type {
	SharedWishlistItem,
	SharedWishlistSurfaceData,
} from "@/templates/packs/core/surfaces/wishlist.shared";
import type { SurfaceProps } from "@/templates/sdk/types";

import {
	Container,
	EmptyState,
	Eyebrow,
	LinkButton,
	Price,
	Rule,
	SkeletonBlock,
	SmallCaps,
	buttonClasses,
} from "../parts";

export default function JournalSharedWishlist({
	data,
}: SurfaceProps<SharedWishlistSurfaceData>) {
	const { wishlist, currencyCode, onAddToCart } = data;

	return (
		<Container
			data-slot="shared-wishlist"
			className="flex flex-col gap-14 py-6 md:gap-20 md:py-10"
		>
			{wishlist === undefined ? (
				<div className="flex flex-col gap-14" aria-hidden="true">
					<div className="flex flex-col items-center gap-4">
						<SkeletonBlock className="h-3 w-32 rounded-full" />
						<SkeletonBlock className="h-12 w-72" />
					</div>
					<div className="grid grid-cols-1 gap-x-8 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
						{Array.from({ length: 3 }).map((_, index) => (
							<div key={index} className="flex flex-col gap-4">
								<SkeletonBlock className="aspect-[4/5] rounded-2xl" />
								<SkeletonBlock className="h-6 w-2/3" />
								<SkeletonBlock className="h-4 w-1/3 rounded-full" />
							</div>
						))}
					</div>
				</div>
			) : !wishlist ? (
				<EmptyState
					eyebrow="Not found"
					title="This wishlist may have been made private, or the link is invalid."
					action={
						<LinkButton to="/products" variant="ghost">
							Browse the shop
						</LinkButton>
					}
				/>
			) : (
				<>
					<header className="flex flex-col items-center gap-4 text-center">
						<Eyebrow>Wishlist by {wishlist.ownerName}</Eyebrow>
						<h1 className="font-display text-4xl leading-[1.02] tracking-tight text-foreground text-balance md:text-6xl">
							{wishlist.name}
						</h1>
						<SmallCaps className="tabular-nums">
							{wishlist.items.length}{" "}
							{wishlist.items.length === 1 ? "item" : "items"}
							{data.pagination ? " on this page" : ""}
						</SmallCaps>
					</header>

					{wishlist.items.length === 0 ? (
						<EmptyState
							eyebrow="Empty"
							title="No available products on this page."
						/>
					) : (
						<div className="grid grid-cols-1 gap-x-8 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
							{wishlist.items.map((item) => (
								<SharedItem
									key={item._id}
									item={item}
									currencyCode={currencyCode}
									onAddToCart={onAddToCart}
									canAdd={data.canAdd !== false}
								/>
							))}
						</div>
					)}

					<Rule />
					<div>
						<Link to="/products" className={buttonClasses("ghost")}>
							Continue shopping
						</Link>
					</div>
				</>
			)}
			<WishlistPageNavigation
				pagination={data.pagination}
				label="Shared wishlist pages"
			/>
		</Container>
	);
}

function SharedItem({
	item,
	currencyCode,
	onAddToCart,
	canAdd,
}: {
	item: SharedWishlistItem;
	currencyCode: string;
	onAddToCart: (item: SharedWishlistItem) => Promise<void>;
	canAdd: boolean;
}) {
	const [busy, setBusy] = useState(false);
	const product = item.product;
	if (!product) return null;

	async function add() {
		setBusy(true);
		try {
			await onAddToCart(item);
		} finally {
			setBusy(false);
		}
	}

	const image = (
		<div className="aspect-[4/5] w-full">
			{item.image ? (
				<img
					src={item.image.src}
					alt={item.image.alt}
					className="h-full w-full object-cover"
					loading="lazy"
					decoding="async"
				/>
			) : product.featuredMediaId ? (
				<MediaImage
					mediaId={product.featuredMediaId as any}
					alt={product.title}
					className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.02]"
					preferredSize="large"
					sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
				/>
			) : (
				<div className="flex h-full items-center justify-center px-6 text-center font-display text-lg text-muted-foreground">
					{product.title}
				</div>
			)}
		</div>
	);

	return (
		<article
			data-slot="journal-product-card"
			className="group flex flex-col gap-4"
		>
			{product.slug ? (
				<Link
					to="/products/$slug"
					params={{ slug: product.slug }}
					className="block overflow-hidden rounded-2xl bg-muted"
					aria-label={product.title}
				>
					{image}
				</Link>
			) : (
				<div className="overflow-hidden rounded-2xl bg-muted">{image}</div>
			)}
			<div className="flex flex-col gap-1.5">
				<h2 className="font-display text-xl leading-snug tracking-tight text-foreground">
					{product.slug ? (
						<Link
							to="/products/$slug"
							params={{ slug: product.slug }}
							className="transition-colors hover:text-primary"
						>
							{product.title}
						</Link>
					) : (
						product.title
					)}
				</h2>
				{item.variant?.name ? (
					<p className="text-sm leading-6 text-muted-foreground">
						{item.variant.name}
					</p>
				) : null}
				<div className="mt-1 flex items-center justify-between gap-3">
					<Price
						amount={item.effectivePrice}
						currency={item.currencyCode ?? currencyCode}
						size="sm"
					/>
					{item.purchaseMode === "chooseOptions" && product.slug ? (
						<a
							className="inline-flex min-h-11 items-center px-3 text-sm underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-primary"
							href={`/products/${encodeURIComponent(product.slug)}`}
						>
							Choose options
						</a>
					) : item.purchaseMode !== "add" ? (
						<p className="text-sm text-muted-foreground">
							Currently unavailable
						</p>
					) : (
						<button
							type="button"
							onClick={() => void add()}
							disabled={busy || !canAdd}
							className="inline-flex min-h-11 items-center justify-center rounded-full border border-border bg-transparent px-4 text-sm font-medium text-foreground transition-colors hover:border-primary hover:bg-primary hover:text-primary-foreground disabled:opacity-50"
						>
							{busy ? "Adding…" : "Add to cart"}
						</button>
					)}
				</div>
			</div>
		</article>
	);
}
