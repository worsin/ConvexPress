import { createContext, useContext, type ReactNode } from "react";

export type SavedProduct = {
	_id: string;
	productId: string;
	variantId?: string;
	addedAt: number;
	effectivePrice: number;
	currencyCode: string | null;
	isAvailable: boolean;
	purchaseMode: "add" | "chooseOptions" | "unavailable";
	image: { src: string; alt: string } | null;
	product: {
		_id: string;
		title: string;
		slug: string;
		status: "publish";
		featuredMediaId?: string;
	} | null;
	variant: { _id: string; name: string } | null;
};
export type WishlistList = { id: string; name: string; isDefault: boolean };
export type WishlistPager = {
	previous: (() => void) | null;
	next: (() => void) | null;
};
export type WishlistHost =
	| { state: "unavailable" }
	| { state: "loading" }
	| { state: "signed-out" }
	| {
			state: "ready";
			lists: WishlistList[];
			selected: string | null;
			select: (id: string) => void;
			listsPager: WishlistPager;
			itemsPager: WishlistPager;
			items: SavedProduct[];
			itemsLoading: boolean;
			busy: string | null;
			canMove: boolean;
			message: string;
			remove: (id: string) => Promise<void>;
			move: (id: string) => Promise<void>;
	  };
type HostProps = { children: (value: WishlistHost) => ReactNode };
const Context = createContext<(props: HostProps) => ReactNode>(({ children }) =>
	children({ state: "unavailable" }),
);
/** Private visitor data belongs to the live host, never to the saved block. */
export function WishlistProvider({
	host,
	children,
}: {
	host: (props: HostProps) => ReactNode;
	children: ReactNode;
}) {
	return <Context value={host}>{children}</Context>;
}
export function WishlistHostView(props: HostProps) {
	const Host = useContext(Context);
	return <Host {...props} />;
}
