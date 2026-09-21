import { useCallback, useEffect, useState } from "react";

export type WishlistPagination = {
	previous: (() => void) | null;
	next: (() => void) | null;
};
export type WishlistPage<T> = {
	page: T[];
	isDone: boolean;
	continueCursor: string;
	expiresAt: number;
};
export type WishlistPageArgs = {
	instanceKey: string;
	refreshKey: string;
	paginationOpts: { cursor: string | null; numItems: number };
};

/** A clock boundary invalidates visible rows even when no reactive write occurs. */
export function useWishlistLease<T extends { expiresAt: number }>(
	page: T | null | undefined,
) {
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
export function useWishlistCursor() {
	const [cursors, setCursors] = useState<(string | null)[]>([null]);
	const previous = useCallback(
		() =>
			setCursors((values) =>
				values.length > 1 ? values.slice(0, -1) : values,
			),
		[],
	);
	const next = useCallback(
		(cursor: string) =>
			setCursors((values) =>
				values.at(-1) === cursor ? values : [...values, cursor],
			),
		[],
	);
	return {
		current: cursors.at(-1) ?? null,
		previous: cursors.length > 1 ? previous : null,
		next,
	};
}
export function WishlistPageNavigation({
	pagination,
	label,
}: {
	pagination?: WishlistPagination;
	label: string;
}) {
	if (!pagination || (!pagination.previous && !pagination.next)) return null;
	return (
		<nav
			aria-label={label}
			className="flex flex-wrap items-center justify-end gap-3 py-4"
		>
			<button
				type="button"
				className="min-h-11 rounded-lg border border-border px-4 text-sm text-foreground disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
				disabled={!pagination.previous}
				onClick={() => pagination.previous?.()}
			>
				Previous
			</button>
			<button
				type="button"
				className="min-h-11 rounded-lg border border-border px-4 text-sm text-foreground disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
				disabled={!pagination.next}
				onClick={() => pagination.next?.()}
			>
				Next
			</button>
		</nav>
	);
}
