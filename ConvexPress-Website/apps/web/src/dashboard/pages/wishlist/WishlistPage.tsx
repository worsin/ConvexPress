/** Owner-scoped paginated collections and items. Account transitions discard all private state. */
import {
	useCallback,
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { makeFunctionReference } from "convex/server";
import { toast } from "sonner";
import { api } from "@convexpress-website/backend/generated/api";
import type { Id } from "@convexpress-website/backend/generated/dataModel";
import { PublicPluginGate } from "@/components/plugins/PublicPluginGate";
import { useSettings } from "@/contexts/SettingsContext";
import { useCommerceSessionToken } from "@/hooks/useCommerceSessionToken";
import { useAuth } from "@/lib/auth/clerk";
import { getSiteRuntime } from "@/lib/site-runtime";
import {
	useWishlistCursor,
	useWishlistLease,
	type WishlistPage,
	type WishlistPageArgs,
} from "@/lib/commerce/wishlist-pagination";
import CoreDashboardWishlist, {
	type DashboardWishlistDetail,
	type DashboardWishlistSummary,
	type DashboardWishlistSurfaceData,
} from "@/templates/packs/core/surfaces/dashboard.wishlist";
import type { SavedProduct } from "@/templates/sdk/block-renderer/wishlist";
import { Surface } from "@/templates/sdk/Surface";
const dashboardQuery = makeFunctionReference<
	"query",
	WishlistPageArgs,
	WishlistPage<DashboardWishlistSummary> | null
>("commerceWishlists/pages:dashboard");
const itemsQuery = makeFunctionReference<
	"query",
	WishlistPageArgs & { wishlistId: Id<"commerce_wishlists"> },
	WishlistPage<SavedProduct> | null
>("commerceWishlists/pages:items");

function WishlistDetailSubscription({
	wishlist,
	instanceKey,
	onChange,
}: {
	wishlist: DashboardWishlistSummary;
	instanceKey: string;
	onChange: (
		id: string,
		detail: DashboardWishlistDetail | null | undefined,
	) => void;
}) {
	const cursor = useWishlistCursor(),
		[refreshKey, setRefreshKey] = useState("initial");
	const result = useQuery(itemsQuery, {
		instanceKey,
		wishlistId: wishlist._id as Id<"commerce_wishlists">,
		refreshKey,
		paginationOpts: { cursor: cursor.current, numItems: 12 },
	});
	const lease = useWishlistLease(result);
	useEffect(() => setRefreshKey(lease.refreshKey), [lease.refreshKey]);
	const detail = useMemo<DashboardWishlistDetail | null | undefined>(() => {
		const fresh = lease.fresh;
		return fresh
			? {
					_id: wishlist._id,
					name: wishlist.name,
					isPublic: wishlist.isPublic,
					shareToken: wishlist.shareToken,
					items: fresh.page,
					expiresAt: fresh.expiresAt,
					pagination: {
						previous: cursor.previous,
						next: fresh.isDone ? null : () => cursor.next(fresh.continueCursor),
					},
				}
			: fresh;
	}, [lease.fresh, wishlist, cursor.previous, cursor.next]);
	useLayoutEffect(
		() => onChange(wishlist._id, detail),
		[wishlist._id, detail, onChange],
	);
	useEffect(
		() => () => onChange(wishlist._id, undefined),
		[wishlist._id, onChange],
	);
	return null;
}
export function DashboardWishlistPage() {
	const auth = useAuth(),
		convexAuth = useConvexAuth(),
		instanceKey = getSiteRuntime().instanceKey;
	if (!auth.isLoaded || convexAuth.isLoading)
		return <p role="status">Loading your wishlists…</p>;
	if (!auth.isSignedIn || !convexAuth.isAuthenticated || !instanceKey)
		return <p role="status">Sign in to manage your wishlists.</p>;
	return (
		<PublicPluginGate pluginId="commerceWishlists">
			<DashboardWishlistContent
				key={`${instanceKey}:${auth.userId}:${auth.sessionId}`}
				instanceKey={instanceKey}
			/>
		</PublicPluginGate>
	);
}
function DashboardWishlistContent({ instanceKey }: { instanceKey: string }) {
	const settings = useSettings(),
		cursor = useWishlistCursor(),
		[refreshKey, setRefreshKey] = useState("initial");
	const currencyCode = settings?.commerceConfig?.currencyCode || "USD";
	const result = useQuery(dashboardQuery, {
		instanceKey,
		refreshKey,
		paginationOpts: { cursor: cursor.current, numItems: 12 },
	});
	const lease = useWishlistLease(result);
	useEffect(() => setRefreshKey(lease.refreshKey), [lease.refreshKey]);
	const retained = useRef<DashboardWishlistSummary[]>([]);
	if (lease.fresh) retained.current = lease.fresh.page;
	const createWishlist = useMutation(
		(api as any).commerceWishlists.mutations.createWishlist,
	);
	const removeItem = useMutation(
		(api as any).commerceWishlists.mutations.removeItem,
	);
	const moveToCart = useMutation(
		(api as any).commerceWishlists.mutations.moveToCart,
	);
	const toggleShare = useMutation(
		(api as any).commerceWishlists.mutations.toggleShare,
	);
	const deleteWishlist = useMutation(
		(api as any).commerceWishlists.mutations.deleteWishlist,
	);
	const { sessionToken, isReady } = useCommerceSessionToken();

	const [expandedIds, setExpandedIds] = useState<string[]>([]);
	const [details, setDetails] = useState<
		Record<string, DashboardWishlistDetail | null | undefined>
	>({});

	const onDetailChange = useCallback(
		(
			wishlistId: string,
			detail: DashboardWishlistDetail | null | undefined,
		) => {
			setDetails((prev) => {
				if (prev[wishlistId] === detail) return prev;
				const next = { ...prev };
				if (detail === undefined) delete next[wishlistId];
				else next[wishlistId] = detail;
				return next;
			});
		},
		[],
	);

	const hasCurrentItem = useCallback(
		(itemId: string, forMove = false) => {
			if (!lease.fresh) return false;
			return lease.fresh.page.some((list) => {
				const detail = details[list._id];
				return (
					detail &&
					detail.expiresAt !== undefined &&
					detail.expiresAt > Date.now() &&
					detail.items.some(
						(item) =>
							item._id === itemId && (!forMove || item.purchaseMode === "add"),
					)
				);
			});
		},
		[lease.fresh, details],
	);

	const actions: DashboardWishlistSurfaceData["actions"] = useMemo(
		() => ({
			canMove: isReady && Boolean(sessionToken),
			toggleExpanded: (wishlistId) => {
				setExpandedIds((prev) =>
					prev.includes(wishlistId)
						? prev.filter((id) => id !== wishlistId)
						: [...prev, wishlistId],
				);
			},
			create: async (name, isPublic) => {
				if (!name.trim()) {
					toast.error("Please enter a name for your wishlist");
					return false;
				}
				try {
					await createWishlist({ name: name.trim(), isPublic });
					toast.success("Wishlist created");
					return true;
				} catch (error) {
					toast.error(
						(error as { data?: { message?: string } })?.data?.message ??
							"Failed to create wishlist",
					);
					return false;
				}
			},
			removeItem: async (itemId) => {
				if (!hasCurrentItem(itemId)) return;
				try {
					await removeItem({ itemId: itemId as any });
					toast.success("Item removed from wishlist");
				} catch (error) {
					toast.error(
						(error as { data?: { message?: string } })?.data?.message ??
							"Failed to remove item",
					);
				}
			},
			moveToCart: async (itemId) => {
				if (!isReady || !sessionToken || !hasCurrentItem(itemId, true)) return;
				try {
					await moveToCart({
						itemId: itemId as any,
						sessionToken,
						quantity: 1,
					});
					toast.success("Moved to cart");
				} catch (error) {
					toast.error(
						(error as { data?: { message?: string } })?.data?.message ??
							"Failed to move item to cart",
					);
				}
			},
			toggleShare: async (wishlistId) => {
				try {
					const result = await toggleShare({ wishlistId: wishlistId as any });
					if ((result as any)?.isPublic) {
						toast.success("Wishlist is now public");
					} else {
						toast.success("Wishlist is now private");
					}
				} catch (error) {
					toast.error(
						(error as { data?: { message?: string } })?.data?.message ??
							"Failed to toggle sharing",
					);
				}
			},
			deleteWishlist: async (wishlistId) => {
				if (!confirm("Delete this wishlist and all its items?")) return;
				try {
					await deleteWishlist({ wishlistId: wishlistId as any });
					toast.success("Wishlist deleted");
				} catch (error) {
					toast.error(
						(error as { data?: { message?: string } })?.data?.message ??
							"Failed to delete wishlist",
					);
				}
			},
			copyShareLink: (shareToken) => {
				const url = `${window.location.origin}/wishlist/${shareToken}`;
				navigator.clipboard.writeText(url).then(
					() => toast.success("Share link copied to clipboard"),
					() => toast.error("Failed to copy link"),
				);
			},
		}),
		[
			createWishlist,
			deleteWishlist,
			isReady,
			moveToCart,
			removeItem,
			sessionToken,
			toggleShare,
			hasCurrentItem,
		],
	);

	if (lease.fresh === null)
		return <p role="status">Your wishlists are not available.</p>;
	const data: DashboardWishlistSurfaceData = {
		wishlists: lease.fresh?.page,
		currencyCode,
		expandedIds,
		detailFor: (id) => {
			const detail = details[id];
			return detail &&
				detail.expiresAt !== undefined &&
				detail.expiresAt <= Date.now()
				? undefined
				: detail;
		},
		actions,
		pagination: {
			previous: cursor.previous,
			next:
				lease.fresh && !lease.fresh.isDone
					? () => cursor.next(lease.fresh!.continueCursor)
					: null,
		},
		canMove: isReady && Boolean(sessionToken),
	};
	return (
		<>
			{retained.current
				.filter((wishlist) => expandedIds.includes(wishlist._id))
				.map((wishlist) => (
					<WishlistDetailSubscription
						key={wishlist._id}
						wishlist={wishlist}
						instanceKey={instanceKey}
						onChange={onDetailChange}
					/>
				))}
			<Surface
				name="dashboard.wishlist"
				data={data}
				fallback={CoreDashboardWishlist}
			/>
		</>
	);
}
