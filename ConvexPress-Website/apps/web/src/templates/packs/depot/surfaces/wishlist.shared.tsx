import { WishlistPageNavigation } from "@/lib/commerce/wishlist-pagination";
/**
 * Depot · wishlist.shared — a wishlist shared by link as a dense card grid:
 * square image, title, variant, price, full-width "Add to cart" with its own
 * busy state. Same links and empty / invalid states as Core.
 */
import { Heart, Package, ShoppingCart } from "lucide-react";
import { useState } from "react";

import { MediaImage } from "@/components/media/MediaImage";
import type {
	SharedWishlistItem,
	SharedWishlistSurfaceData,
} from "@/templates/packs/core/surfaces/wishlist.shared";
import type { SurfaceProps } from "@/templates/sdk/types";

import {
	Button,
	Card,
	Container,
	EmptyState,
	Label,
	LinkButton,
	Price,
	Skeleton,
} from "../parts";
import { PageHeader } from "../parts/extra-commerce";

const GRID =
	"grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5";

export default function DepotSharedWishlist({
	data,
}: SurfaceProps<SharedWishlistSurfaceData>) {
	const { wishlist, currencyCode, onAddToCart } = data;

	return (
		<Container
			padded={false}
			data-slot="shared-wishlist"
			className="flex flex-col gap-4 py-6 md:py-8"
		>
			{wishlist === undefined ? (
				<>
					<Skeleton className="h-16 max-w-md" />
					<div className={GRID}>
						{Array.from({ length: 5 }).map((_, index) => (
							<Skeleton key={index} className="aspect-[3/4]" />
						))}
					</div>
				</>
			) : !wishlist ? (
				<EmptyState
					title="Wishlist not found"
					description="This wishlist may have been made private or the link is invalid."
					action={
						<LinkButton to="/products" variant="secondary">
							Browse shop
						</LinkButton>
					}
				/>
			) : (
				<>
					<PageHeader
						label={
							<span className="inline-flex items-center gap-1">
								<Heart className="size-3 text-destructive" aria-hidden="true" />
								Wishlist by {wishlist.ownerName}
							</span>
						}
						title={wishlist.name}
						meta={`${wishlist.items.length} ${wishlist.items.length === 1 ? "item" : "items"}${data.pagination ? " on this page" : ""}`}
					/>

					{wishlist.items.length === 0 ? (
						<EmptyState title="No available products on this page." />
					) : (
						<div className={GRID}>
							{wishlist.items.map((item) => (
								<SharedItemCard
									key={item._id}
									item={item}
									currencyCode={currencyCode}
									onAddToCart={onAddToCart}
									canAdd={data.canAdd !== false}
								/>
							))}
						</div>
					)}

					<div>
						<LinkButton to="/products" variant="secondary">
							Continue shopping
						</LinkButton>
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

function SharedItemCard({
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

	return (
		<Card as="article" className="flex flex-col overflow-hidden">
			<div className="aspect-square bg-muted/40">
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
						className="h-full w-full object-cover"
						preferredSize="medium"
						sizes="(max-width: 768px) 50vw, (max-width: 1280px) 33vw, 20vw"
					/>
				) : (
					<div className="flex h-full items-center justify-center text-muted-foreground">
						<Package className="size-8" aria-hidden="true" />
					</div>
				)}
			</div>
			<div className="flex flex-1 flex-col gap-1.5 p-3">
				<Label>{item.variant?.name ?? " "}</Label>
				<h3 className="line-clamp-2 text-sm font-semibold leading-5 text-foreground">
					{product.title}
				</h3>
				<div className="mt-auto flex flex-col gap-2 pt-1">
					<Price
						amount={item.effectivePrice}
						currency={item.currencyCode ?? currencyCode}
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
						<Button
							onClick={() => void add()}
							disabled={busy || !canAdd}
							className="w-full"
						>
							<ShoppingCart className="size-4" aria-hidden="true" />
							{busy ? "Adding..." : "Add to cart"}
						</Button>
					)}
				</div>
			</div>
		</Card>
	);
}
