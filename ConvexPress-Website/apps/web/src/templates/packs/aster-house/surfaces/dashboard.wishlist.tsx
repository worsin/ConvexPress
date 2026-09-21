import { WishlistPageNavigation } from "@/lib/commerce/wishlist-pagination";
/**
 * Aster · dashboard.wishlist — the member's wishlists as rule-separated
 * rows: create (underline input, pill switch), expand to see items (loaded
 * lazily by the loader per expanded list), share / copy link, delete, move
 * items to the cart or remove them.
 */
import { useState } from "react";
import { ChevronDown } from "lucide-react";

import { MediaImage } from "@/components/media/MediaImage";
import { formatMoney } from "@/lib/commerce/format";
import { cn } from "@/lib/utils";
import type {
	DashboardWishlistDetail,
	DashboardWishlistItem,
	DashboardWishlistSummary,
	DashboardWishlistSurfaceData,
} from "@/templates/packs/core/surfaces/dashboard.wishlist";
import type { SurfaceProps } from "@/templates/sdk/types";

import {
	Badge,
	Button,
	EmptyState,
	LinkButton,
	SkeletonBlock,
	SmallCaps,
	UnderlineInput,
} from "../parts";
import {
	PageHeading,
	PillSwitch,
	Row,
	RowList,
	RowSkeleton,
	TextAction,
} from "../parts/extra-dashboard";

export default function AsterDashboardWishlist({
	data,
}: SurfaceProps<DashboardWishlistSurfaceData>) {
	const { wishlists, currencyCode, expandedIds, detailFor, actions } = data;
	const [showCreate, setShowCreate] = useState(false);

	return (
		<div data-slot="dashboard-wishlist" className="flex flex-col gap-10">
			<PageHeading
				eyebrow="Saved"
				title="Wishlists"
				lede="Save products for later and share your favorites with others."
				action={
					!showCreate ? (
						<Button
							variant="ghost"
							className="h-10 px-5"
							onClick={() => setShowCreate(true)}
						>
							New wishlist
						</Button>
					) : null
				}
			/>

			{showCreate ? (
				<CreateWishlistForm
					onDone={() => setShowCreate(false)}
					onCreate={actions.create}
				/>
			) : null}

			{wishlists === undefined ? (
				<RowSkeleton rows={2} />
			) : wishlists.length === 0 ? (
				<EmptyState
					eyebrow="No wishlists yet"
					title="Add products to your wishlist while browsing the shop, or create one above."
					action={
						<LinkButton to="/products" variant="ghost">
							Browse the shop
						</LinkButton>
					}
				/>
			) : (
				<RowList aria-label="Your wishlists">
					{wishlists.map((wishlist) => (
						<WishlistRow
							key={wishlist._id}
							wishlist={wishlist}
							expanded={expandedIds.includes(wishlist._id)}
							detail={detailFor(wishlist._id)}
							currencyCode={currencyCode}
							actions={actions}
						/>
					))}
				</RowList>
			)}
			<WishlistPageNavigation
				pagination={data.pagination}
				label="Wishlist collections"
			/>
		</div>
	);
}

function CreateWishlistForm({
	onDone,
	onCreate,
}: {
	onDone: () => void;
	onCreate: (name: string, isPublic: boolean) => Promise<boolean>;
}) {
	const [name, setName] = useState("");
	const [isPublic, setIsPublic] = useState(false);
	const [busy, setBusy] = useState(false);

	async function handleSubmit(event: React.FormEvent) {
		event.preventDefault();
		setBusy(true);
		try {
			const ok = await onCreate(name.trim(), isPublic);
			if (ok) {
				setName("");
				setIsPublic(false);
				onDone();
			}
		} finally {
			setBusy(false);
		}
	}

	return (
		<form
			onSubmit={(event) => void handleSubmit(event)}
			className="flex flex-col gap-6 border-t border-border pt-8"
		>
			<SmallCaps as="h2">New wishlist</SmallCaps>
			<div className="flex flex-col gap-1.5">
				<label
					htmlFor="wishlist-name"
					className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground"
				>
					Name
				</label>
				<UnderlineInput
					id="wishlist-name"
					type="text"
					value={name}
					onChange={(event) => setName(event.target.value)}
					placeholder="e.g. Birthday ideas"
				/>
			</div>
			<PillSwitch
				checked={isPublic}
				onCheckedChange={setIsPublic}
				label={isPublic ? "Public — anyone with the link can view" : "Private"}
			/>
			<div className="flex flex-wrap items-center gap-5">
				<Button
					type="submit"
					variant="primary"
					className="h-10 px-5"
					disabled={busy || !name.trim()}
				>
					{busy ? "Creating..." : "Create"}
				</Button>
				<TextAction onClick={onDone}>Cancel</TextAction>
			</div>
		</form>
	);
}

function WishlistItemRow({
	item,
	currencyCode,
	actions,
}: {
	item: DashboardWishlistItem;
	currencyCode: string;
	actions: DashboardWishlistSurfaceData["actions"];
}) {
	const [busy, setBusy] = useState(false);

	async function handleRemove() {
		setBusy(true);
		try {
			await actions.removeItem(item._id);
		} finally {
			setBusy(false);
		}
	}

	async function handleMoveToCart() {
		setBusy(true);
		try {
			await actions.moveToCart(item._id);
		} finally {
			setBusy(false);
		}
	}

	const product = item.product;
	if (!product)
		return (
			<li className="flex items-center justify-between gap-4 py-4">
				<p className="text-sm text-muted-foreground">
					Product no longer available
				</p>
				<button
					type="button"
					disabled={busy}
					className="min-h-11 px-3 text-sm underline underline-offset-4 text-muted-foreground"
					onClick={() => void handleRemove()}
					aria-label="Remove unavailable product"
				>
					Remove
				</button>
			</li>
		);

	return (
		<li className="grid grid-cols-[4rem_minmax(0,1fr)] gap-4 py-4 sm:grid-cols-[4rem_minmax(0,1fr)_auto] sm:items-center sm:gap-6">
			<div className="overflow-hidden rounded-xl bg-muted">
				<div className="aspect-[4/5]">
					{item.image ? (
						<img
							src={item.image.src}
							alt={item.image.alt}
							className="h-full w-full object-cover"
							loading="lazy"
						/>
					) : product.featuredMediaId ? (
						<MediaImage
							mediaId={product.featuredMediaId as any}
							alt={product.title}
							className="h-full w-full object-cover"
							preferredSize="thumbnail"
							sizes="64px"
						/>
					) : null}
				</div>
			</div>
			<div className="flex min-w-0 flex-col gap-1">
				<p className="truncate text-base text-foreground">{product.title}</p>
				{item.variant?.name ? (
					<p className="text-sm text-muted-foreground">{item.variant.name}</p>
				) : null}
				<p className="font-display text-lg tabular-nums text-foreground">
					{formatMoney(item.effectivePrice, item.currencyCode ?? currencyCode)}
				</p>
				{item.purchaseMode === "unavailable" ? (
					<SmallCaps className="text-destructive">
						Currently unavailable
					</SmallCaps>
				) : null}
			</div>
			<div className="col-start-2 flex flex-wrap items-center gap-4 sm:col-start-auto">
				{item.purchaseMode === "chooseOptions" && product.slug && (
					<a
						className="inline-flex min-h-11 items-center px-2 text-sm underline underline-offset-4"
						href={`/products/${encodeURIComponent(product.slug)}`}
					>
						Choose options
					</a>
				)}
				{item.purchaseMode === "add" && (
					<Button
						variant="ghost"
						className="h-9 px-4"
						onClick={() => void handleMoveToCart()}
						disabled={
							busy || item.purchaseMode !== "add" || actions.canMove === false
						}
					>
						Move to cart
					</Button>
				)}
				<TextAction
					tone="destructive"
					onClick={() => void handleRemove()}
					disabled={busy}
					className="text-xs"
				>
					Remove
				</TextAction>
			</div>
		</li>
	);
}

function WishlistRow({
	wishlist,
	expanded,
	detail,
	currencyCode,
	actions,
}: {
	wishlist: DashboardWishlistSummary;
	expanded: boolean;
	detail: DashboardWishlistDetail | null | undefined;
	currencyCode: string;
	actions: DashboardWishlistSurfaceData["actions"];
}) {
	const [busy, setBusy] = useState(false);

	async function handleToggleShare() {
		setBusy(true);
		try {
			await actions.toggleShare(wishlist._id);
		} finally {
			setBusy(false);
		}
	}

	async function handleDelete() {
		setBusy(true);
		try {
			await actions.deleteWishlist(wishlist._id);
		} finally {
			setBusy(false);
		}
	}

	const isPublic = detail?.isPublic ?? wishlist.isPublic;
	const shareToken = detail?.shareToken ?? wishlist.shareToken;
	const panelId = `wishlist-${wishlist._id}`;

	return (
		<Row className="gap-0 py-0">
			<button
				type="button"
				onClick={() => actions.toggleExpanded(wishlist._id)}
				aria-expanded={expanded}
				aria-controls={panelId}
				className="group flex w-full items-center justify-between gap-4 py-5 text-left"
			>
				<div className="flex min-w-0 flex-col gap-1.5">
					<span className="flex flex-wrap items-center gap-3">
						<span className="font-display text-xl leading-snug text-foreground transition-colors group-hover:text-primary">
							{wishlist.name}
						</span>
						{wishlist.isDefault ? <Badge>Default</Badge> : null}
					</span>
					<span className="flex flex-wrap items-center gap-x-2 gap-y-1">
						<SmallCaps className="tabular-nums">
							{wishlist.itemCount === undefined
								? "Saved products"
								: `${wishlist.itemCount} ${wishlist.itemCount === 1 ? "item" : "items"}`}
						</SmallCaps>
						<span className="text-muted-foreground/60" aria-hidden="true">
							·
						</span>
						<SmallCaps className={isPublic ? "text-primary" : undefined}>
							{isPublic ? "Public" : "Private"}
						</SmallCaps>
					</span>
				</div>
				<ChevronDown
					className={cn(
						"size-4 shrink-0 text-muted-foreground transition-transform",
						expanded && "rotate-180",
					)}
					aria-hidden="true"
				/>
			</button>

			{expanded ? (
				<div
					id={panelId}
					className="flex flex-col gap-4 border-t border-border py-5"
				>
					<div className="flex flex-wrap items-center gap-x-5 gap-y-2">
						<TextAction
							tone={isPublic ? "primary" : "muted"}
							onClick={() => void handleToggleShare()}
							disabled={busy}
							aria-pressed={isPublic}
						>
							{isPublic ? "Shared" : "Share"}
						</TextAction>
						{isPublic && shareToken ? (
							<TextAction onClick={() => actions.copyShareLink(shareToken)}>
								Copy link
							</TextAction>
						) : null}
						{!wishlist.isDefault ? (
							<TextAction
								tone="destructive"
								onClick={() => void handleDelete()}
								disabled={busy}
								className="ml-auto"
							>
								Delete
							</TextAction>
						) : null}
					</div>

					{detail === undefined ? (
						<div className="flex flex-col gap-3" aria-hidden="true">
							<SkeletonBlock className="h-16" />
							<SkeletonBlock className="h-16" />
						</div>
					) : !detail || detail.items.length === 0 ? (
						<p className="py-4 text-sm leading-6 text-muted-foreground">
							No saved products on this page.
						</p>
					) : (
						<ul role="list" className="flex flex-col divide-y divide-border">
							{detail.items.map((item) => (
								<WishlistItemRow
									key={item._id}
									item={item}
									currencyCode={currencyCode}
									actions={actions}
								/>
							))}
						</ul>
					)}
				</div>
			) : null}
			{expanded && (
				<WishlistPageNavigation
					pagination={detail?.pagination}
					label={`${wishlist.name} product pages`}
				/>
			)}
		</Row>
	);
}
