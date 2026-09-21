// Resolve through Vite's module graph: an HTML ../src link escapes the demo root
// in development and receives the HTML fallback instead of the Website CSS.
import "../src/index.css";
import { useState, type ComponentType } from "react";
import { createRoot } from "react-dom/client";
import {
	createRootRoute,
	createRoute,
	createRouter,
	createMemoryHistory,
	RouterProvider,
} from "@tanstack/react-router";
import type {
	SurfaceProps,
	TemplateManifest,
} from "../src/templates/sdk/types";
import type {
	DashboardWishlistSurfaceData,
	DashboardWishlistItem,
} from "../src/templates/packs/core/surfaces/dashboard.wishlist";
import type { SharedWishlistSurfaceData } from "../src/templates/packs/core/surfaces/wishlist.shared";
import { demoTheme } from "./themes";
import mug from "./assets/aster-house-camp-mug.png";
import notebook from "./assets/aster-house-field-notebook.png";

const dashboardModules = import.meta.glob<
	ComponentType<SurfaceProps<DashboardWishlistSurfaceData>>
>("../src/templates/packs/*/surfaces/dashboard.wishlist.tsx", {
	eager: true,
	import: "default",
});
const sharedModules = import.meta.glob<
	ComponentType<SurfaceProps<SharedWishlistSurfaceData>>
>("../src/templates/packs/*/surfaces/wishlist.shared.tsx", {
	eager: true,
	import: "default",
});
const manifests = Object.values(
	import.meta.glob<TemplateManifest>("../src/templates/packs/*/template.json", {
		eager: true,
		import: "default",
	}),
);
const products: DashboardWishlistItem[] = [
	{
		_id: "saved-forest",
		productId: "mug",
		variantId: "forest",
		effectivePrice: 3800,
		isAvailable: true,
		purchaseMode: "add",
		currencyCode: "USD",
		image: { src: mug, alt: "Forest ceramic mug" },
		product: {
			_id: "mug",
			title: "The morning mug",
			slug: "demo-product-mug",
			status: "publish",
		},
		variant: { _id: "forest", name: "Forest" },
	},
	{
		_id: "saved-notebook",
		productId: "notebook",
		effectivePrice: 2400,
		isAvailable: false,
		purchaseMode: "chooseOptions",
		currencyCode: "USD",
		image: { src: notebook, alt: "Field notebook" },
		product: {
			_id: "notebook",
			title: "Field notes",
			slug: "demo-product-notebook",
			status: "publish",
		},
	},
	{
		_id: "saved-hidden",
		productId: "hidden",
		effectivePrice: 0,
		isAvailable: false,
		purchaseMode: "unavailable",
		currencyCode: null,
		image: null,
		product: null,
	},
];
const lastProduct: DashboardWishlistItem = {
	...products[0]!,
	_id: "last-saved",
	product: {
		_id: "last",
		title: "Last saved product",
		slug: "last-saved",
		status: "publish",
	},
};

function App() {
	const [pack, setPack] = useState("core"),
		[kind, setKind] = useState("shared"),
		[state, setState] = useState("ready");
	const [itemPage, setItemPage] = useState(0),
		[listPage, setListPage] = useState(0),
		[removed, setRemoved] = useState<string[]>([]),
		[message, setMessage] = useState("");
	const [expanded, setExpanded] = useState(true);
	const theme = demoTheme(manifests.find((manifest) => manifest.id === pack)!);
	const rows = (itemPage ? [lastProduct] : products).filter(
		(item) => !removed.includes(item._id),
	);
	const pagination = {
		previous: itemPage ? () => setItemPage(0) : null,
		next: itemPage ? null : () => setItemPage(1),
	};
	const list = {
		_id: listPage ? "gifts" : "favourites",
		name: listPage ? "Gift ideas" : "Everyday favourites",
		isDefault: false,
		isPublic: true,
		shareToken: "synthetic-only",
		createdAt: 1,
	};
	const Dashboard =
		dashboardModules[
			`../src/templates/packs/${pack}/surfaces/dashboard.wishlist.tsx`
		]!;
	const Shared =
		sharedModules[
			`../src/templates/packs/${pack}/surfaces/wishlist.shared.tsx`
		]!;
	const dashboard: DashboardWishlistSurfaceData = {
		wishlists: state === "loading" ? undefined : [list],
		currencyCode: "USD",
		expandedIds: expanded ? [list._id] : [],
		detailFor: () => ({ ...list, items: rows, pagination }),
		pagination: {
			previous: listPage ? () => setListPage(0) : null,
			next: listPage ? null : () => setListPage(1),
		},
		actions: {
			canMove: state !== "session-pending",
			toggleExpanded: () => setExpanded((value) => !value),
			create: async () => true,
			removeItem: async (id) => {
				setRemoved((values) => [...values, id]);
				setMessage(`Removed ${id}`);
			},
			moveToCart: async (id) => {
				setRemoved((values) => [...values, id]);
				setMessage(`Moved ${id}`);
			},
			toggleShare: async () => {},
			deleteWishlist: async () => {},
			copyShareLink: () => {},
		},
	};
	const shared: SharedWishlistSurfaceData = {
		wishlist:
			state === "loading"
				? undefined
				: state === "unavailable"
					? null
					: {
							_id: list._id,
							name: list.name,
							ownerName: "Demo maker",
							items: rows.filter((item) => item.product),
						},
		currencyCode: "USD",
		pagination,
		canAdd: state !== "session-pending",
		onAddToCart: async (item) =>
			setMessage(`Added ${item._id} with variant ${item.variantId ?? "none"}`),
	};
	const reset = () => {
		setItemPage(0);
		setListPage(0);
		setRemoved([]);
		setMessage("");
		setExpanded(true);
		setState("ready");
	};
	return (
		<>
			<style>{theme.css}</style>
			<style>{`body { background: var(--background); color: var(--foreground); } .surface-controls { display:flex; flex-wrap:wrap; gap:1rem; padding:1rem; border-bottom:1px solid var(--border); } .surface-controls label { display:grid; gap:.4rem; } .surface-controls select { min-height:44px; border:1px solid var(--border); padding:.5rem; } #surface-canvas { max-width:1200px; padding:32px; margin:auto; } @media(max-width:600px) { #surface-canvas { padding:16px; } }`}</style>
			<div className="surface-controls">
				<label>
					Template
					<select
						id="surface-pack"
						value={pack}
						onChange={(event) => {
							setPack(event.target.value);
							reset();
						}}
					>
						{manifests.map((manifest) => (
							<option key={manifest.id} value={manifest.id}>
								{manifest.name}
							</option>
						))}
					</select>
				</label>
				<label>
					Surface
					<select
						id="surface-kind"
						value={kind}
						onChange={(event) => {
							setKind(event.target.value);
							reset();
						}}
					>
						<option value="shared">Shared wishlist</option>
						<option value="dashboard">Wishlist dashboard</option>
					</select>
				</label>
				<label>
					Fixture
					<select
						id="surface-state"
						value={state}
						onChange={(event) => setState(event.target.value)}
					>
						<option value="ready">Ready</option>
						<option value="loading">Loading</option>
						<option value="unavailable">Unavailable</option>
						<option value="session-pending">Shopping session pending</option>
					</select>
				</label>
			</div>
			<div id="surface-canvas" key={`${pack}:${kind}`}>
				{kind === "shared" ? (
					<Shared data={shared} packId={pack} />
				) : (
					<Dashboard data={dashboard} packId={pack} />
				)}
			</div>
			<p role="status" id="surface-receipt">
				{message}
			</p>
		</>
	);
}
const rootRoute = createRootRoute();
const indexRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/",
	component: App,
});
const router = createRouter({
	routeTree: rootRoute.addChildren([indexRoute]),
	history: createMemoryHistory({ initialEntries: ["/"] }),
});
createRoot(document.getElementById("root")!).render(
	<RouterProvider router={router} />,
);
