import { useLiveConnection } from "../../../hooks/useLiveConnection";
/** Bounded list preview with an exact maintained owner total. */
import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
	useConvexAuth,
	useMutation,
	useQuery,
} from "convex/react";
import { Heart } from "lucide-react";
import { api } from "@convexpress-website/backend/generated/api";
import { useSettings } from "@/contexts/SettingsContext";
import { useAuth } from "@/lib/auth/clerk";
import { getSiteRuntime } from "@/lib/site-runtime";
import { useWishlistLease } from "@/lib/commerce/wishlist-pagination";
import type {
	DashboardWidgetModule,
	DashboardWidgetProps,
} from "../../contracts";
import { WidgetEmpty, WidgetSkeleton } from "../../grid/WidgetCard";
import { useDashboardShell } from "../../shell/DashboardShellContext";
import { ViewAllLink, rowsForSize } from "../_shared";

function WishlistWidget(props: DashboardWidgetProps) {
	const settings = useSettings(),
		auth = useAuth(),
		convexAuth = useConvexAuth(),
		instanceKey = getSiteRuntime().instanceKey;
	const enabled =
		settings?.plugins?.commerceEnabled === true &&
		settings?.plugins?.commerceWishlistsEnabled === true;
	if (!enabled) return <WidgetEmpty icon="heart" title="Wishlists are off" />;
	if (!auth.isLoaded || convexAuth.isLoading)
		return <WidgetSkeleton rows={3} />;
	if (!auth.isSignedIn || !convexAuth.isAuthenticated || !instanceKey)
		return (
			<WidgetEmpty icon="heart" title="Sign in to see your saved products" />
		);
	return (
		<OwnerWishlistWidget
			key={`${instanceKey}:${auth.userId}:${auth.sessionId}`}
			{...props}
			instanceKey={instanceKey}
		/>
	);
}
function OwnerWishlistWidget({
	size,
	instanceKey,
}: DashboardWidgetProps & { instanceKey: string }) {
	const { to } = useDashboardShell(),
		connection = useLiveConnection();
	const [refreshKey, setRefreshKey] = useState("initial"),
		[repairFailed, setRepairFailed] = useState(false);
	const result = useQuery(api.commerceWishlists.queries.getMyWishlists, {
		instanceKey,
		refreshKey,
		paginationOpts: { numItems: rowsForSize(size, 4), cursor: null },
	});
	const lease = useWishlistLease(result),
		ensure = useMutation(api.commerceWishlists.ownerMaintenance.ensure),
		requested = useRef(false),
		mounted = useRef(true);
	useEffect(() => {
		mounted.current = true;
		return () => {
			mounted.current = false;
		};
	}, []);
	useEffect(() => setRefreshKey(lease.refreshKey), [lease.refreshKey]);
	const data = lease.fresh;
	useEffect(() => {
		if (
			data?.summary.state !== "preparing" ||
			!connection.isWebSocketConnected ||
			requested.current
		)
			return;
		requested.current = true;
		void ensure({ instanceKey })
			.then(() => {
				if (mounted.current) setRepairFailed(false);
			})
			.catch(() => {
				requested.current = false;
				if (mounted.current) setRepairFailed(true);
			});
	}, [
		data?.summary.state,
		data?.expiresAt,
		connection.isWebSocketConnected,
		ensure,
		instanceKey,
	]);
	if (!connection.isWebSocketConnected)
		return <WidgetEmpty icon="heart" title="Reconnecting to saved products" />;
	if (data === undefined) return <WidgetSkeleton rows={3} />;
	if (data === null)
		return <WidgetEmpty icon="heart" title="Saved products unavailable" />;
	const total = data.summary.totalItems;
	if (data.summary.state === "ready" && total === 0)
		return (
			<WidgetEmpty
				icon="heart"
				title="Nothing saved yet"
				description="Tap the heart on a product to save it for later."
				action={
					<Link
						to="/products"
						className="font-medium text-primary hover:underline"
					>
						Browse the shop
					</Link>
				}
			/>
		);
	return (
		<div className="space-y-2">
			<p className="text-xs text-muted-foreground" role="status">
				{total === null ? (
					repairFailed ? (
						"Totals unavailable. Retrying…"
					) : (
						"Counting saved products…"
					)
				) : (
					<>
						<span className="text-sm font-semibold text-foreground">
							{total}
						</span>{" "}
						saved item{total === 1 ? "" : "s"}
					</>
				)}
			</p>
			<ul role="list" className="divide-y divide-border">
				{data.page.map((list) => (
					<li key={list._id}>
						<Link
							to={to("/wishlist")}
							className="flex min-h-11 items-center gap-2 py-1.5 text-xs transition-colors motion-reduce:transition-none hover:bg-muted/40 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
						>
							<Heart
								className="size-3.5 shrink-0 text-muted-foreground"
								aria-hidden="true"
							/>
							<span className="min-w-0 flex-1 truncate text-foreground">
								{list.name}
							</span>
							<span className="shrink-0 text-[10px] text-muted-foreground">
								{list.itemCount === undefined
									? "Counting…"
									: `${list.itemCount} item${list.itemCount === 1 ? "" : "s"}`}
							</span>
						</Link>
					</li>
				))}
			</ul>
		</div>
	);
}
function Actions() {
	const { to } = useDashboardShell();
	return <ViewAllLink to={to("/wishlist")} />;
}
const module: DashboardWidgetModule = {
	id: "wishlist",
	Widget: WishlistWidget,
	Actions,
};
export default module;
