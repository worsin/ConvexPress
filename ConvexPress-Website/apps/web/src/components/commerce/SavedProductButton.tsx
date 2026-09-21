import { useLiveConnection } from "../../hooks/useLiveConnection";
import { useEffect, useRef, useState } from "react";
import {
	useMutation,
	usePaginatedQuery,
} from "convex/react";
import { toast } from "sonner";
import { Heart } from "lucide-react";
import { api } from "@convexpress-website/backend/generated/api";
import type { Id } from "@convexpress-website/backend/generated/dataModel";
import type { WishlistButtonProps } from "./WishlistButton";
export function SavedProductButton({
	productId,
	variantId,
	size = "md",
	className,
	instanceKey,
}: WishlistButtonProps & { instanceKey: string }) {
	const addItem = useMutation(api.commerceWishlists.mutations.addItem);
	const removeItem = useMutation(api.commerceWishlists.mutations.removeItem);
	const connection = useLiveConnection();
	const { results, status, loadMore } = usePaginatedQuery(
		api.commerceWishlists.queries.isInWishlist,
		{
			instanceKey,
			productId: productId as Id<"commerce_products">,
			...(variantId
				? { variantId: variantId as Id<"commerce_product_variants"> }
				: {}),
		},
		{ initialNumItems: 24 },
	);
	const saved = results.find((entry) => entry.state === "saved");
	const unavailable =
		results.some((entry) => entry.state === "unavailable") ||
		!connection.isWebSocketConnected;
	const checking = !saved && status !== "Exhausted";
	const [busy, setBusy] = useState(false);
	const busyRef = useRef(false),
		mounted = useRef(true);
	useEffect(() => {
		mounted.current = true;
		return () => {
			mounted.current = false;
		};
	}, []);
	useEffect(() => {
		if (!saved && !unavailable && status === "CanLoadMore") loadMore(24);
	}, [saved, unavailable, status, loadMore]);

	async function toggle() {
		if (busyRef.current || checking || unavailable) return;
		busyRef.current = true;
		setBusy(true);
		try {
			if (saved?.state === "saved") await removeItem({ itemId: saved.itemId });
			else
				await addItem({
					productId: productId as Id<"commerce_products">,
					...(variantId
						? { variantId: variantId as Id<"commerce_product_variants"> }
						: {}),
				});
			if (mounted.current)
				toast.success(saved ? "Removed from wishlist" : "Added to wishlist");
		} catch (error) {
			if (mounted.current)
				toast.error(
					error instanceof Error
						? error.message
						: "Unable to update your wishlist. Please try again.",
				);
		} finally {
			busyRef.current = false;
			if (mounted.current) setBusy(false);
		}
	}
	const inWishlist = !!saved && !unavailable;
	const label = unavailable
		? "Wishlist unavailable"
		: checking
			? "Checking saved products"
			: inWishlist
				? "Remove from wishlist"
				: "Add to wishlist";
	return (
		<button
			type="button"
			onClick={() => void toggle()}
			disabled={busy || checking || unavailable}
			aria-label={label}
			aria-busy={busy || checking}
			aria-pressed={inWishlist}
			className={`inline-flex min-h-11 min-w-11 items-center justify-center rounded-full border transition-colors motion-reduce:transition-none disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary ${className ?? (inWishlist ? "border-primary bg-primary/10 text-primary hover:bg-primary/15" : "border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground")}`}
		>
			<Heart
				aria-hidden="true"
				className={`${size === "sm" ? "h-4 w-4" : "h-5 w-5"} ${inWishlist ? "fill-current" : "fill-none"}`}
			/>
		</button>
	);
}
