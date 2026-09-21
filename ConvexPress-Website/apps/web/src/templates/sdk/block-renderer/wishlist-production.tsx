import { useEffect, useRef, useState, type ReactNode } from "react";
import { makeFunctionReference } from "convex/server";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import type { Id } from "@convexpress-website/backend/generated/dataModel";
import { useAuth } from "../../../lib/auth/clerk";
import { getSiteRuntime } from "../../../lib/site-runtime";
import { useCommerceSessionToken } from "../../../hooks/useCommerceSessionToken";
import {
	WishlistProvider,
	type SavedProduct,
	type WishlistHost,
	type WishlistList,
	type WishlistPager,
} from "./wishlist";

type Page<T> = {
	page: T[];
	isDone: boolean;
	continueCursor: string;
	expiresAt: number;
};
type PageArgs = {
	instanceKey: string;
	refreshKey: string;
	paginationOpts: { cursor: string | null; numItems: number };
};
const listQuery = makeFunctionReference<
	"query",
	PageArgs,
	Page<WishlistList> | null
>("commerceWishlists/pages:listMine");
const itemsQuery = makeFunctionReference<
	"query",
	PageArgs & { wishlistId: Id<"commerce_wishlists"> },
	Page<SavedProduct> | null
>("commerceWishlists/pages:items");
const removeMutation = makeFunctionReference<
	"mutation",
	{ itemId: Id<"commerce_wishlist_items"> },
	Id<"commerce_wishlist_items">
>("commerceWishlists/mutations:removeItem");
const moveMutation = makeFunctionReference<
	"mutation",
	{
		itemId: Id<"commerce_wishlist_items">;
		sessionToken: string;
		quantity: number;
	},
	{ success: boolean }
>("commerceWishlists/mutations:moveToCart");
type HostProps = { children: (value: WishlistHost) => ReactNode };

/** Expired snapshots disappear before the refresh completes, including offline. */
function usePageLease<T>(page: Page<T> | null | undefined) {
	const [refreshKey, setRefreshKey] = useState("initial");
	useEffect(() => {
		if (!page) return;
		const timer = setTimeout(
			() => setRefreshKey(crypto.randomUUID()),
			Math.max(0, page.expiresAt - Date.now()),
		);
		return () => clearTimeout(timer);
	}, [page]);
	return {
		refreshKey,
		fresh:
			page && page.expiresAt > Date.now()
				? page
				: page === null
					? null
					: undefined,
	};
}
function useCursor() {
	const [cursors, setCursors] = useState<(string | null)[]>([null]);
	return {
		current: cursors[cursors.length - 1]!,
		pager: (
			page: { isDone: boolean; continueCursor: string } | null | undefined,
		): WishlistPager => ({
			previous:
				cursors.length > 1
					? () => setCursors((values) => values.slice(0, -1))
					: null,
			next:
				page && !page.isDone
					? () => setCursors((values) => [...values, page.continueCursor])
					: null,
		}),
	};
}
function ProductionWishlistHost({ children }: HostProps) {
	const auth = useAuth(),
		convexAuth = useConvexAuth(),
		instanceKey = getSiteRuntime().instanceKey;
	if (!auth.isLoaded || convexAuth.isLoading)
		return children({ state: "loading" });
	if (!auth.isSignedIn) return children({ state: "signed-out" });
	if (!convexAuth.isAuthenticated || !auth.userId || !instanceKey)
		return children({ state: "unavailable" });
	return (
		<ListHost
			key={`${instanceKey}:${auth.userId}:${auth.sessionId}`}
			instanceKey={instanceKey}
		>
			{children}
		</ListHost>
	);
}
function ListHost({
	instanceKey,
	children,
}: HostProps & { instanceKey: string }) {
	const cursor = useCursor();
	const [refreshKey, setRefreshKey] = useState("initial");
	const result = useQuery(listQuery, {
		instanceKey,
		refreshKey,
		paginationOpts: { cursor: cursor.current, numItems: 12 },
	});
	const lease = usePageLease(result);
	useEffect(() => setRefreshKey(lease.refreshKey), [lease.refreshKey]);
	const [selected, setSelected] = useState<string | null>(null);
	const retained = useRef<Page<WishlistList> | null>(null);
	if (lease.fresh) retained.current = lease.fresh;
	if (lease.fresh === null) return children({ state: "unavailable" });
	const snapshot = lease.fresh ?? retained.current;
	if (!snapshot) return children({ state: "loading" });
	const lists = snapshot.page;
	const current =
		lists.find((list) => list.id === selected) ??
		lists.find((list) => list.isDefault) ??
		lists[0];
	return (
		<ItemsHost
			key={current?.id ?? "empty"}
			instanceKey={instanceKey}
			selected={current?.id ?? null}
			lists={lists}
			select={setSelected}
			listsPager={cursor.pager(lease.fresh)}
		>
			{lease.fresh ? children : () => children({ state: "loading" })}
		</ItemsHost>
	);
}
function ItemsHost({
	instanceKey,
	selected,
	lists,
	select,
	listsPager,
	children,
}: HostProps & {
	instanceKey: string;
	selected: string | null;
	lists: WishlistList[];
	select: (id: string) => void;
	listsPager: WishlistPager;
}) {
	const cursor = useCursor(),
		session = useCommerceSessionToken();
	const [refreshKey, setRefreshKey] = useState("initial");
	const result = useQuery(
		itemsQuery,
		selected
			? {
					instanceKey,
					wishlistId: selected as Id<"commerce_wishlists">,
					refreshKey,
					paginationOpts: { cursor: cursor.current, numItems: 12 },
				}
			: "skip",
	);
	const lease = usePageLease(result);
	useEffect(() => setRefreshKey(lease.refreshKey), [lease.refreshKey]);
	const remove = useMutation(removeMutation),
		move = useMutation(moveMutation);
	const [busy, setBusy] = useState<string | null>(null),
		[message, setMessage] = useState("");
	const active = useRef(true),
		inFlight = useRef(false);
	useEffect(() => {
		active.current = true;
		return () => {
			active.current = false;
		};
	}, []);
	async function act(id: string, kind: "remove" | "move") {
		if (
			!active.current ||
			inFlight.current ||
			!lease.fresh?.page.some((item) => item._id === id) ||
			(kind === "move" && (!session.isReady || !session.sessionToken))
		)
			return;
		inFlight.current = true;
		setBusy(id);
		setMessage("");
		try {
			if (kind === "remove")
				await remove({ itemId: id as Id<"commerce_wishlist_items"> });
			else
				await move({
					itemId: id as Id<"commerce_wishlist_items">,
					sessionToken: session.sessionToken!,
					quantity: 1,
				});
			if (active.current)
				setMessage(
					kind === "remove"
						? "Removed from your saved products."
						: "Moved to your basket.",
				);
		} catch {
			if (active.current)
				setMessage(
					kind === "move"
						? "We could not confirm the move. Check your basket before trying again."
						: "We could not confirm the removal. Check your saved products before trying again.",
				);
		} finally {
			inFlight.current = false;
			if (active.current) setBusy(null);
		}
	}
	if (selected && lease.fresh === null)
		return children({ state: "unavailable" });
	return children({
		state: "ready",
		lists,
		selected,
		select,
		listsPager,
		itemsPager: cursor.pager(lease.fresh),
		items: lease.fresh?.page ?? [],
		itemsLoading: Boolean(selected && !lease.fresh),
		busy,
		canMove: session.isReady && Boolean(session.sessionToken),
		message,
		remove: (id) => act(id, "remove"),
		move: (id) => act(id, "move"),
	});
}
export function ProductionWishlistProvider({
	children,
}: {
	children: ReactNode;
}) {
	return (
		<WishlistProvider host={ProductionWishlistHost}>
			{children}
		</WishlistProvider>
	);
}
