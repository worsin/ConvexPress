import { readCompletedWishlistCount } from "./counts";
import {
	paginationOptsValidator,
	type PaginationOptions,
	type RegisteredQuery,
} from "convex/server";
import { ConvexError, v } from "convex/values";
import { query, type QueryCtx } from "../_generated/server";
import { isPluginEnabled } from "../helpers/plugins";
import { RequestReadLedger } from "../helpers/requestReadLedger";
import { SourceByteLedger } from "../canonicalDocuments/sourceBudget";
import { getActiveWishlistUser } from "./helpers";
import { createWishlistItemProjector } from "./publicItems";
import {
	wishlistPublicItemValidator,
	type WishlistPublicItem,
} from "./validators";
import type { GenericId } from "convex/values";

type WishlistPageArgs = {
	instanceKey: string;
	refreshKey: string;
	paginationOpts: PaginationOptions;
};
type WishlistPage<T> = {
	isDone: boolean;
	continueCursor: string;
	expiresAt: number;
	page: T[];
};
type WishlistListItem = {
	id: GenericId<"commerce_wishlists">;
	name: string;
	isDefault: boolean;
};
type WishlistDashboardItem = {
	itemCount?: number;
	_id: GenericId<"commerce_wishlists">;
	name: string;
	isDefault: boolean;
	isPublic: boolean;
	shareToken: string;
	createdAt: number;
};
type SharedWishlistPage = WishlistPage<WishlistPublicItem> & {
	_id: GenericId<"commerce_wishlists">;
	name: string;
	ownerName: string;
};

const bindingArgs = { instanceKey: v.string(), refreshKey: v.string() };
const pageFields = {
	isDone: v.boolean(),
	continueCursor: v.string(),
	expiresAt: v.number(),
};
const listValidator = v.object({
	id: v.id("commerce_wishlists"),
	name: v.string(),
	isDefault: v.boolean(),
});

export async function isWishlistInstallationEnabled(
	ctx: QueryCtx,
	instanceKey: string,
) {
	if (!instanceKey || instanceKey.length > 256) return false;
	const identity = await ctx.db
		.query("convexpress_siteIdentity")
		.withIndex("by_identity_key", (q) => q.eq("identityKey", "site-identity"))
		.unique();
	return (
		identity?.instanceKey === instanceKey &&
		(await isPluginEnabled(ctx, "commerce")) &&
		(await isPluginEnabled(ctx, "commerceWishlists"))
	);
}
function boundedPage(
	options: { numItems: number; cursor: string | null },
	refreshKey: string,
) {
	if (
		!Number.isSafeInteger(options.numItems) ||
		options.numItems < 1 ||
		options.numItems > 24 ||
		(options.cursor?.length ?? 0) > 8192 ||
		refreshKey.length > 128
	)
		throw new ConvexError({
			code: "invalid_wishlist_page",
			message: "Invalid saved-products page.",
		});
	// Do not accept caller-supplied scan limits. Each request has one indexed page.
	return {
		numItems: options.numItems,
		cursor: options.cursor,
		maximumRowsRead: 24,
		maximumBytesRead: 256 * 1024,
	};
}

/** Private metadata, with no share tokens or other customers' list IDs. */
export const listMine: RegisteredQuery<
	"public",
	WishlistPageArgs,
	Promise<WishlistPage<WishlistListItem> | null>
> = query({
	args: { ...bindingArgs, paginationOpts: paginationOptsValidator },
	returns: v.union(
		v.null(),
		v.object({ ...pageFields, page: v.array(listValidator) }),
	),
	handler: async (
		ctx,
		args,
	): Promise<WishlistPage<WishlistListItem> | null> => {
		const options = boundedPage(args.paginationOpts, args.refreshKey);
		if (!(await isWishlistInstallationEnabled(ctx, args.instanceKey)))
			return null;
		const user = await getActiveWishlistUser(ctx);
		if (!user) return null;
		const result = await ctx.db
			.query("commerce_wishlists")
			.withIndex("by_user", (q) => q.eq("userId", user._id))
			.paginate(options);
		return {
			isDone: result.isDone,
			continueCursor: result.continueCursor,
			expiresAt: Date.now() + 15_000,
			page: result.page.map((row) => ({
				id: row._id,
				name: row.name,
				isDefault: row.isDefault,
			})),
		};
	},
});

/** Management metadata is private to the active owner. Item totals are not
 * obtained by scanning every saved item; only completed maintained counts are exposed. */
export const dashboard: RegisteredQuery<
	"public",
	WishlistPageArgs,
	Promise<WishlistPage<WishlistDashboardItem> | null>
> = query({
	args: { ...bindingArgs, paginationOpts: paginationOptsValidator },
	returns: v.union(
		v.null(),
		v.object({
			...pageFields,
			page: v.array(
				v.object({
					_id: v.id("commerce_wishlists"),
                    itemCount: v.optional(v.number()),
					name: v.string(),
					isDefault: v.boolean(),
					isPublic: v.boolean(),
					shareToken: v.string(),
					createdAt: v.number(),
				}),
			),
		}),
	),
	handler: async (
		ctx,
		args,
	): Promise<WishlistPage<WishlistDashboardItem> | null> => {
		const options = boundedPage(args.paginationOpts, args.refreshKey);
		if (!(await isWishlistInstallationEnabled(ctx, args.instanceKey)))
			return null;
		const user = await getActiveWishlistUser(ctx);
		if (!user) return null;
		const result = await ctx.db
			.query("commerce_wishlists")
			.withIndex("by_user", (q) => q.eq("userId", user._id))
			.paginate(options);
		return {
			isDone: result.isDone,
			continueCursor: result.continueCursor,
			expiresAt: Date.now() + 15_000,
			page: await Promise.all(result.page.map(async (row) => ({
                itemCount: (await readCompletedWishlistCount(ctx,row._id)) ?? undefined,
				_id: row._id,
				name: row.name,
				isDefault: row.isDefault,
				isPublic: row.isPublic,
				shareToken: row.shareToken,
				createdAt: row.createdAt,
			}))),
		};
	},
});

export const shared: RegisteredQuery<
	"public",
	WishlistPageArgs & { shareToken: string },
	Promise<SharedWishlistPage | null>
> = query({
	args: {
		...bindingArgs,
		shareToken: v.string(),
		paginationOpts: paginationOptsValidator,
	},
	returns: v.union(
		v.null(),
		v.object({
			...pageFields,
			_id: v.id("commerce_wishlists"),
			name: v.string(),
			ownerName: v.string(),
			page: v.array(wishlistPublicItemValidator),
		}),
	),
	handler: async (ctx, args): Promise<SharedWishlistPage | null> => {
		const options = boundedPage(args.paginationOpts, args.refreshKey);
		if (
			!(await isWishlistInstallationEnabled(ctx, args.instanceKey)) ||
			!args.shareToken ||
			args.shareToken.length > 256
		)
			return null;
		const wishlist = await ctx.db
			.query("commerce_wishlists")
			.withIndex("by_share_token", (q) => q.eq("shareToken", args.shareToken))
			.unique();
		if (!wishlist?.isPublic) return null;
		const owner = await ctx.db.get("users", wishlist.userId);
		if (owner?.status !== "active") return null;
		const now = Date.now(),
			budget = new RequestReadLedger(),
			sources = new SourceByteLedger();
		budget.beforeRead();
		const result = await ctx.db
			.query("commerce_wishlist_items")
			.withIndex("by_wishlist", (q) => q.eq("wishlistId", wishlist._id))
			.paginate(options);
		const project = await createWishlistItemProjector(
			ctx,
			budget,
			sources,
			now,
		);
		const page = [];
		for (const item of result.page) {
			budget.record(item);
			const visible = await project(item);
			if (visible.product) page.push(visible);
		}
		return {
			_id: wishlist._id,
			name: wishlist.name,
			ownerName: owner.displayName || owner.firstName || "Someone",
			page,
			isDone: result.isDone,
			continueCursor: result.continueCursor,
			expiresAt: Math.min(
				now + 15_000,
				budget.authorizationRecheckAt ?? Infinity,
			),
		};
	},
});

/** Every page rechecks site, account, list ownership, product access and prices.
 * The client must discard this page at expiresAt, including while offline. */
export const items: RegisteredQuery<
	"public",
	WishlistPageArgs & { wishlistId: GenericId<"commerce_wishlists"> },
	Promise<WishlistPage<WishlistPublicItem> | null>
> = query({
	args: {
		...bindingArgs,
		wishlistId: v.id("commerce_wishlists"),
		paginationOpts: paginationOptsValidator,
	},
	returns: v.union(
		v.null(),
		v.object({ ...pageFields, page: v.array(wishlistPublicItemValidator) }),
	),
	handler: async (
		ctx,
		args,
	): Promise<WishlistPage<WishlistPublicItem> | null> => {
		const options = boundedPage(args.paginationOpts, args.refreshKey);
		if (!(await isWishlistInstallationEnabled(ctx, args.instanceKey)))
			return null;
		const user = await getActiveWishlistUser(ctx);
		if (!user) return null;
		const wishlist = await ctx.db.get("commerce_wishlists", args.wishlistId);
		if (!wishlist || wishlist.userId !== user._id) return null;
		const now = Date.now(),
			budget = new RequestReadLedger(),
			sources = new SourceByteLedger();
		budget.beforeRead();
		const result = await ctx.db
			.query("commerce_wishlist_items")
			.withIndex("by_wishlist", (q) => q.eq("wishlistId", wishlist._id))
			.paginate(options);
		const project = await createWishlistItemProjector(
			ctx,
			budget,
			sources,
			now,
		);
		const page = [];
		for (const item of result.page) {
			budget.record(item);
			page.push(await project(item));
		}
		return {
			isDone: result.isDone,
			continueCursor: result.continueCursor,
			expiresAt: Math.min(
				now + 15_000,
				budget.authorizationRecheckAt ?? Infinity,
			),
			page,
		};
	},
});
