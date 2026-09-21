import { createContext, useContext, useState, type ReactNode } from "react";
import {
	WishlistProvider,
	type WishlistHost,
	type SavedProduct,
} from "../src/templates/sdk/block-renderer/wishlist";
import mug from "./assets/aster-house-camp-mug.png";
import notebook from "./assets/aster-house-field-notebook.png";
const specimens: SavedProduct[] = [
	{
		_id: "saved-mug",
		productId: "mug",
		addedAt: 1,
		effectivePrice: 3800,
		currencyCode: "USD",
		isAvailable: true,
		purchaseMode: "add",
		image: { src: mug, alt: "Green ceramic mug on warm stone" },
		product: {
			_id: "mug",
			title: "The morning mug",
			slug: "demo-product-mug",
			status: "publish",
		},
		variant: null,
	},
	{
		_id: "saved-notebook",
		productId: "notebook",
		addedAt: 2,
		effectivePrice: 2400,
		currencyCode: "USD",
		isAvailable: false,
		purchaseMode: "chooseOptions",
		image: { src: notebook, alt: "A green notebook and pencil" },
		product: {
			_id: "notebook",
			title: "Field notes, kept close",
			slug: "demo-product-notebook",
			status: "publish",
		},
		variant: null,
	},
	{
		_id: "saved-hidden",
		productId: "hidden",
		addedAt: 3,
		effectivePrice: 0,
		currencyCode: null,
		isAvailable: false,
		purchaseMode: "unavailable",
		image: null,
		product: null,
		variant: null,
	},
];
const DemoContext = createContext<WishlistHost>({ state: "unavailable" });
function DemoHost({
	children,
}: {
	children: (value: WishlistHost) => ReactNode;
}) {
	return children(useContext(DemoContext));
}
export function WishlistDemo({ children }: { children: ReactNode }) {
	const [state, setState] = useState("ready"),
		[items, setItems] = useState(specimens),
		[message, setMessage] = useState("");
	const value: WishlistHost =
		state === "ready" || state === "empty"
			? {
					state: "ready",
					lists: [
						{ id: "favourites", name: "Everyday favourites", isDefault: true },
					],
					selected: "favourites",
					select: () => {},
					listsPager: { previous: null, next: null },
					itemsPager: { previous: null, next: null },
					items: state === "empty" ? [] : items,
					itemsLoading: false,
					busy: null,
					canMove: true,
					message,
					remove: async (id) => {
						setItems((rows) => rows.filter((row) => row._id !== id));
						setMessage("Removed from your saved products.");
					},
					move: async (id) => {
						setItems((rows) => rows.filter((row) => row._id !== id));
						setMessage(
							"Moved to your basket. Demo only; no real basket changed.",
						);
					},
				}
			: { state: state as "signed-out" | "loading" | "unavailable" };
	return (
		<>
			<label className="assistant-demo-control">
				Synthetic saved-products fixture
				<select
					value={state}
					onChange={(event) => {
						setState(event.target.value);
						setItems(specimens);
						setMessage("");
					}}
				>
					<option value="ready">Saved products</option>
					<option value="empty">Empty collection</option>
					<option value="signed-out">Signed out</option>
					<option value="loading">Loading / account switch</option>
					<option value="unavailable">Unavailable</option>
				</select>
			</label>
			<DemoContext value={value}>
				<WishlistProvider host={DemoHost}>{children}</WishlistProvider>
			</DemoContext>
		</>
	);
}
