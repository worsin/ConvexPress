import { test, expect } from "bun:test";
import { fixture } from "./ownership.test";
import {
	beginWishlistCountRepair,
	advanceWishlistCountRepair,
	readCompletedWishlistCount,
	insertCountedWishlist,
	insertCountedWishlistItem,
	patchCountedWishlistItem,
	deleteCountedWishlistItem,
	type WishlistCountTask,
} from "../counts";
import {
	insertDynamicWithMediaReferences,
	patchDynamicWithMediaReferences,
	deleteDynamicWithMediaReferences,
} from "../../media/attachmentGuard";
async function finish(
	t: Awaited<ReturnType<typeof fixture>>["t"],
	initial: WishlistCountTask | null,
) {
	let task = initial,
		pages = 0;
	while (task) {
		task = await t.run((ctx) => advanceWishlistCountRepair(ctx, task!));
		if (++pages > 100) throw Error("Repair did not converge");
	}
	return pages;
}
test("legacy list count is unknown until bounded repair finishes", async () => {
	const f = await fixture();
	await f.t.run(async (ctx) => {
		for (let i = 0; i < 99; i++)
			await ctx.db.insert("commerce_wishlist_items", {
				wishlistId: f.ids.wishlist,
				productId: f.ids.product,
				addedAt: i,
			});
	});
	expect(
		await f.t.run((ctx) => readCompletedWishlistCount(ctx, f.ids.wishlist)),
	).toBeNull();
	expect(
		await finish(
			f.t,
			await f.t.run((ctx) => beginWishlistCountRepair(ctx, f.ids.wishlist)),
		),
	).toBeGreaterThan(3);
	expect(
		await f.t.run((ctx) => readCompletedWishlistCount(ctx, f.ids.wishlist)),
	).toBe(100);
});
test("backfill maintains exact counts across concurrent changes without restarting", async () => {
	const f = await fixture();
	const entries = await f.t.run(async (ctx) => {
		const rows = [];
		for (let i = 0; i < 90; i++)
			rows.push(
				await ctx.db.insert("commerce_wishlist_items", {
					wishlistId: f.ids.wishlist,
					productId: f.ids.product,
					addedAt: i,
				}),
			);
		return rows;
	});
	let task = await f.t.run((ctx) =>
		beginWishlistCountRepair(ctx, f.ids.wishlist),
	);
	const generation = task!.generation;
	task = await f.t.run((ctx) => advanceWishlistCountRepair(ctx, task!));
	await f.t.run(async (ctx) => {
		await deleteCountedWishlistItem(ctx, entries[0]);
		await deleteCountedWishlistItem(ctx, entries[70]);
		await insertCountedWishlistItem(ctx, {
			wishlistId: f.ids.wishlist,
			productId: f.ids.product,
			addedAt: 1,
		});
	});
	const stale = task!;
	task = await f.t.run((ctx) => advanceWishlistCountRepair(ctx, stale));
	expect(task!.generation).toBe(generation);
	expect(
		await f.t.run((ctx) => advanceWishlistCountRepair(ctx, stale)),
	).toBeNull();
	await finish(f.t, task);
	expect(
		await f.t.run((ctx) => readCompletedWishlistCount(ctx, f.ids.wishlist)),
	).toBe(90);
});
test("normal and dynamic item writes maintain both sides of a transfer and clean deleted-list state", async () => {
	const f = await fixture();
	await finish(
		f.t,
		await f.t.run((ctx) => beginWishlistCountRepair(ctx, f.ids.wishlist)),
	);
	await f.t.run(async (ctx) => {
		const other = await insertCountedWishlist(ctx, {
			userId: f.ids.owner,
			name: "New list",
			isPublic: false,
			isDefault: false,
			shareToken: "count-test",
			createdAt: 1,
			updatedAt: 1,
			itemCountReady: true,
		});
		expect(await readCompletedWishlistCount(ctx, other)).toBe(0);
		await patchCountedWishlistItem(ctx, f.ids.item, { wishlistId: other });
		expect(await readCompletedWishlistCount(ctx, other)).toBe(1);
		expect(await readCompletedWishlistCount(ctx, f.ids.wishlist)).toBe(0);
		const imported = await insertDynamicWithMediaReferences(
			ctx,
			"commerce_wishlist_items",
			{ wishlistId: other, productId: f.ids.product, addedAt: 1 },
		);
		expect(await readCompletedWishlistCount(ctx, other)).toBe(2);
		await patchDynamicWithMediaReferences(ctx, imported, {
			wishlistId: f.ids.wishlist,
		});
		expect(await readCompletedWishlistCount(ctx, other)).toBe(1);
		expect(await readCompletedWishlistCount(ctx, f.ids.wishlist)).toBe(1);
		await deleteDynamicWithMediaReferences(ctx, imported);
		expect(await readCompletedWishlistCount(ctx, f.ids.wishlist)).toBe(0);
		await deleteDynamicWithMediaReferences(ctx, other);
		expect(await readCompletedWishlistCount(ctx, other)).toBeNull();
		await deleteCountedWishlistItem(ctx, f.ids.item);
		expect(await readCompletedWishlistCount(ctx, other)).toBeNull();
	});
});
test("byte bounded pages survive a deleted frontier and exactly full final pages", async () => {
	for (const size of [32, 64]) {
		const f = await fixture();
		await f.t.run(async (ctx) => {
			for (let i = 1; i < size; i++)
				await ctx.db.insert("commerce_wishlist_items", {
					wishlistId: f.ids.wishlist,
					productId: f.ids.product,
					addedAt: i,
				});
		});
		await finish(
			f.t,
			await f.t.run((ctx) => beginWishlistCountRepair(ctx, f.ids.wishlist)),
		);
		expect(
			await f.t.run((ctx) => readCompletedWishlistCount(ctx, f.ids.wishlist)),
		).toBe(size);
	}
	const f = await fixture();
	await f.t.run(async (ctx) => {
		for (let i = 0; i < 10; i++)
			await ctx.db.insert("commerce_wishlist_items", {
				wishlistId: f.ids.wishlist,
				productId: f.ids.product,
				notes: "x".repeat(200000),
				addedAt: i,
			});
	});
	let task = await f.t.run((ctx) =>
		beginWishlistCountRepair(ctx, f.ids.wishlist),
	);
	task = await f.t.run((ctx) => advanceWishlistCountRepair(ctx, task!));
	expect(task).not.toBeNull();
	await f.t.run((ctx) =>
		deleteCountedWishlistItem(ctx, task!.afterId as typeof f.ids.item),
	);
	await finish(f.t, task);
	expect(
		await f.t.run((ctx) => readCompletedWishlistCount(ctx, f.ids.wishlist)),
	).toBe(10);
});

test("dashboard exposes only completed per-list counts and normal mutations keep them current", async () => {
	const f = await fixture();
	const { makeFunctionReference: ref } = await import("convex/server");
	const query = ref<"query">("commerceWishlists/pages:dashboard");
	const args = {
		instanceKey: "test-instance",
		refreshKey: "counts",
		paginationOpts: { numItems: 24, cursor: null },
	};
	expect((await f.owner.query(query, args)).page[0].itemCount).toBeUndefined();
	await finish(
		f.t,
		await f.t.run((ctx) => beginWishlistCountRepair(ctx, f.ids.wishlist)),
	);
	expect((await f.owner.query(query, args)).page[0].itemCount).toBe(1);
	const list = await f.owner.mutation(
		ref<"mutation">("commerceWishlists/mutations:createWishlist"),
		{ name: "Empty counted list" },
	);
	expect(
		(await f.owner.query(query, args)).page.find(
			(row: { _id: string }) => row._id === list,
		).itemCount,
	).toBe(0);
	const id = await f.owner.mutation(
		ref<"mutation">("commerceWishlists/mutations:addItem"),
		{ wishlistId: list, productId: f.ids.product },
	);
	await f.owner.mutation(
		ref<"mutation">("commerceWishlists/mutations:addItem"),
		{ wishlistId: list, productId: f.ids.product },
	);
	expect(
		(await f.owner.query(query, args)).page.find(
			(row: { _id: string }) => row._id === list,
		).itemCount,
	).toBe(1);
	await f.owner.mutation(
		ref<"mutation">("commerceWishlists/mutations:removeItem"),
		{ itemId: id },
	);
	expect(
		(await f.owner.query(query, args)).page.find(
			(row: { _id: string }) => row._id === list,
		).itemCount,
	).toBe(0);
	expect((await f.other.query(query, args)).page).toEqual([]);
});

test("old generations cannot overwrite a forced repair, and copied readiness cannot suppress backfill", async () => {
	const f = await fixture();
	const old = await f.t.run((ctx) =>
		beginWishlistCountRepair(ctx, f.ids.wishlist),
	);
	const fresh = await f.t.run((ctx) =>
		beginWishlistCountRepair(ctx, f.ids.wishlist, true),
	);
	expect(
		await f.t.run((ctx) => advanceWishlistCountRepair(ctx, old!)),
	).toBeNull();
	await finish(f.t, fresh);
	expect(
		await f.t.run((ctx) => readCompletedWishlistCount(ctx, f.ids.wishlist)),
	).toBe(1);
	await f.t.run(async (ctx) => {
		await patchDynamicWithMediaReferences(ctx, f.ids.wishlist, {
			itemCountReady: false,
			name: "Renamed",
		});
		expect((await ctx.db.get(f.ids.wishlist))?.itemCountReady).toBe(true);
	});
});
