import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { makeFunctionReference } from "convex/server";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import type { Id } from "@convexpress-website/backend/generated/dataModel";
import { PublicPluginGate } from "@/components/plugins/PublicPluginGate";
import { useSettings } from "@/contexts/SettingsContext";
import { useCommerceSessionToken } from "@/hooks/useCommerceSessionToken";
import { useAuth } from "@/lib/auth/clerk";
import { getSiteRuntime } from "@/lib/site-runtime";
import { requirePublicPluginEnabled } from "@/lib/plugins/public-route-loader";
import {
	useWishlistCursor,
	useWishlistLease,
	type WishlistPage,
	type WishlistPageArgs,
} from "@/lib/commerce/wishlist-pagination";
import CoreSharedWishlist, {
	type SharedWishlistItem,
	type SharedWishlistSurfaceData,
} from "@/templates/packs/core/surfaces/wishlist.shared";
import { Surface } from "@/templates/sdk/Surface";

const sharedPage = makeFunctionReference<
	"query",
	WishlistPageArgs & { shareToken: string },
	| (WishlistPage<SharedWishlistItem> & {
			_id: string;
			name: string;
			ownerName: string;
	  })
	| null
>("commerceWishlists/pages:shared");
const addSharedItem = makeFunctionReference<
	"mutation",
	{
		instanceKey: string;
		shareToken: string;
		itemId: Id<"commerce_wishlist_items">;
		sessionToken: string;
	},
	Id<"commerce_carts">
>("commerceWishlists/shared:addToCart");
export const Route = createFileRoute("/_marketing/wishlist/$token")({
	loader: async ({ context: { queryClient } }) => {
		await requirePublicPluginEnabled(queryClient, "commerceWishlists");
	},
	component: SharedWishlistPage,
});
function SharedWishlistPage() {
	const { token } = Route.useParams(),
		auth = useAuth(),
		convexAuth = useConvexAuth(),
		instanceKey = getSiteRuntime().instanceKey;
	if (
		!auth.isLoaded ||
		convexAuth.isLoading ||
		Boolean(auth.isSignedIn) !== convexAuth.isAuthenticated
	)
		return <p role="status">Loading saved products…</p>;
	if (!instanceKey) return <p role="status">This wishlist is not available.</p>;
	return (
		<PublicPluginGate pluginId="commerceWishlists">
			<SharedWishlistContent
				key={`${instanceKey}:${token}:${auth.userId}:${auth.sessionId}`}
				instanceKey={instanceKey}
				token={token}
			/>
		</PublicPluginGate>
	);
}
function SharedWishlistContent({
	instanceKey,
	token,
}: {
	instanceKey: string;
	token: string;
}) {
	const settings = useSettings(),
		cursor = useWishlistCursor(),
		session = useCommerceSessionToken();
	const [refreshKey, setRefreshKey] = useState("initial");
	const result = useQuery(sharedPage, {
		instanceKey,
		shareToken: token,
		refreshKey,
		paginationOpts: { cursor: cursor.current, numItems: 12 },
	});
	const lease = useWishlistLease(result);
	useEffect(() => setRefreshKey(lease.refreshKey), [lease.refreshKey]);
	const addToCart = useMutation(addSharedItem),
		inFlight = useRef(false),
		active = useRef(true);
	useEffect(() => {
		active.current = true;
		return () => {
			active.current = false;
		};
	}, []);
	async function handleAddToCart(item: SharedWishlistItem) {
		if (
			!active.current ||
			inFlight.current ||
			!session.isReady ||
			!session.sessionToken ||
			!lease.fresh?.page.some(
				(row) => row._id === item._id && row.purchaseMode === "add",
			)
		)
			return;
		inFlight.current = true;
		try {
			await addToCart({
				instanceKey,
				shareToken: token,
				itemId: item._id as Id<"commerce_wishlist_items">,
				sessionToken: session.sessionToken,
			});
			if (active.current) toast.success("Added to basket");
		} catch {
			if (active.current)
				toast.error(
					"We could not confirm the add. Check your basket and this shared list before trying again.",
				);
		} finally {
			inFlight.current = false;
		}
	}
	const fresh = lease.fresh;
	const data: SharedWishlistSurfaceData = {
		wishlist: fresh
			? {
					_id: fresh._id,
					name: fresh.name,
					ownerName: fresh.ownerName,
					items: fresh.page,
				}
			: fresh,
		currencyCode: settings?.commerceConfig?.currencyCode || "USD",
		onAddToCart: handleAddToCart,
		pagination: {
			previous: cursor.previous,
			next:
				fresh && !fresh.isDone ? () => cursor.next(fresh.continueCursor) : null,
		},
		canAdd: session.isReady && Boolean(session.sessionToken),
	};
	return (
		<Surface name="wishlist.shared" data={data} fallback={CoreSharedWishlist} />
	);
}
