import { test, expect } from "bun:test";
import { fixture } from "./ownership.test";
import {
	beginWishlistCountRepair,
	advanceWishlistCountRepair,
	insertCountedWishlist,
	insertCountedWishlistItem,
	deleteCountedWishlist,
	patchCountedWishlist,
	type WishlistCountTask,
} from "../counts";
import {
	beginOwnerSummaryRepair,
	advanceOwnerSummaryRepair,
	readOwnerSummary,
	type OwnerSummaryTask,
} from "../ownerTotals";
async function listCount(
	f: Awaited<ReturnType<typeof fixture>>,
	id = f.ids.wishlist,
	force = false,
) {
	let task: WishlistCountTask | null = await f.t.run((ctx) =>
		beginWishlistCountRepair(ctx, id, force),
	);
	while (task)
		task = await f.t.run((ctx) => advanceWishlistCountRepair(ctx, task!));
}
async function finish(
	f: Awaited<ReturnType<typeof fixture>>,
	initial: OwnerSummaryTask | null,
) {
	let task = initial,
		pages = 0;
	while (task) {
		task = await f.t.run((ctx) => advanceOwnerSummaryRepair(ctx, task!));
		if (++pages > 100) throw Error("Owner summary did not converge");
	}
	return pages;
}
const summary = (f: Awaited<ReturnType<typeof fixture>>, id = f.ids.owner) =>
	f.t.run((ctx) => readOwnerSummary(ctx, id));
test("unknown child counts never become an account total of zero", async () => {
	const f = await fixture();
	await finish(
		f,
		await f.t.run((ctx) => beginOwnerSummaryRepair(ctx, f.ids.owner)),
	);
	expect(await summary(f)).toEqual({
		state: "preparing",
		totalLists: null,
		totalItems: null,
	});
	await listCount(f);
	expect(await summary(f)).toEqual({
		state: "ready",
		totalLists: 1,
		totalItems: 1,
	});
});
test("owner backfill stays exact under writes on both sides of its frontier and horizon", async () => {
	const f = await fixture();
	await listCount(f);
	const ids = await f.t.run(async (ctx) => {
		const lists = [];
		for (let i = 0; i < 40; i++) {
			const id = await insertCountedWishlist(ctx, {
				userId: f.ids.owner,
				name: `List ${i}`,
				isPublic: false,
				isDefault: false,
				shareToken: `owner-count-${i}`,
				createdAt: i,
				updatedAt: i,
			});
			await insertCountedWishlistItem(ctx, {
				wishlistId: id,
				productId: f.ids.product,
				addedAt: i,
			});
			lists.push(id);
		}
		return lists;
	});
	let task = await f.t.run((ctx) => beginOwnerSummaryRepair(ctx, f.ids.owner));
	const generation = task!.generation;
	task = await f.t.run((ctx) => advanceOwnerSummaryRepair(ctx, task!));
	await f.t.run(async (ctx) => {
		await deleteCountedWishlist(ctx, ids[0]);
		await deleteCountedWishlist(ctx, ids[39]);
		const future = await insertCountedWishlist(ctx, {
			userId: f.ids.owner,
			name: "Future",
			isPublic: false,
			isDefault: false,
			shareToken: "future",
			createdAt: 1,
			updatedAt: 1,
		});
		await insertCountedWishlistItem(ctx, {
			wishlistId: future,
			productId: f.ids.product,
			addedAt: 1,
		});
		await insertCountedWishlistItem(ctx, {
			wishlistId: ids[1],
			productId: f.ids.product,
			addedAt: 1,
		});
	});
	const stale = task!;
	task = await f.t.run((ctx) => advanceOwnerSummaryRepair(ctx, stale));
	expect(
		await f.t.run((ctx) => advanceOwnerSummaryRepair(ctx, stale)),
	).toBeNull();
	if (task) expect(task.generation).toBe(generation);
	await finish(f, task);
	expect(await summary(f)).toEqual({
		state: "ready",
		totalLists: 40,
		totalItems: 41,
	});
});
test("forced per-list rebuild masks the account total until that list is ready again", async () => {
	const f = await fixture();
	await listCount(f);
	await finish(
		f,
		await f.t.run((ctx) => beginOwnerSummaryRepair(ctx, f.ids.owner)),
	);
	let task = await f.t.run((ctx) =>
		beginWishlistCountRepair(ctx, f.ids.wishlist, true),
	);
	expect((await summary(f)).state).toBe("preparing");
	while (task)
		task = await f.t.run((ctx) => advanceWishlistCountRepair(ctx, task!));
	expect(await summary(f)).toEqual({
		state: "ready",
		totalLists: 1,
		totalItems: 1,
	});
});
test("list ownership transfers and deletion update both owners immediately", async () => {
	const f = await fixture();
	await listCount(f);
	await finish(
		f,
		await f.t.run((ctx) => beginOwnerSummaryRepair(ctx, f.ids.owner)),
	);
	await finish(
		f,
		await f.t.run((ctx) => beginOwnerSummaryRepair(ctx, f.ids.other)),
	);
	await f.t.run((ctx) =>
		patchCountedWishlist(ctx, f.ids.wishlist, { userId: f.ids.other }),
	);
	expect(await summary(f)).toEqual({
		state: "ready",
		totalLists: 0,
		totalItems: 0,
	});
	expect(await summary(f, f.ids.other)).toEqual({
		state: "ready",
		totalLists: 1,
		totalItems: 1,
	});
	await f.t.run((ctx) => deleteCountedWishlist(ctx, f.ids.wishlist));
	expect(await summary(f, f.ids.other)).toEqual({
		state: "ready",
		totalLists: 0,
		totalItems: 0,
	});
	expect(await f.t.run((ctx) => ctx.db.get(f.ids.item))).not.toBeNull();
});
test("an empty legacy owner is proven empty with a bounded indexed read", async () => {
	const f = await fixture();
	expect(await summary(f, f.ids.other)).toEqual({
		state: "ready",
		totalLists: 0,
		totalItems: 0,
	});
});

test("widget returns a small list page with the full owner total and rejects cross-account/site access", async () => {
	const f = await fixture();
	await listCount(f);
	await f.t.run(async (ctx) => {
		for (let i = 0; i < 30; i++) {
			const id = await insertCountedWishlist(ctx, {
				userId: f.ids.owner,
				name: `Widget list ${i}`,
				isPublic: false,
				isDefault: false,
				shareToken: `widget-${i}`,
				createdAt: i,
				updatedAt: i,
			});
			await insertCountedWishlistItem(ctx, {
				wishlistId: id,
				productId: f.ids.product,
				addedAt: i,
			});
		}
	});
	await finish(
		f,
		await f.t.run((ctx) => beginOwnerSummaryRepair(ctx, f.ids.owner)),
	);
	const { makeFunctionReference: ref } = await import("convex/server");
	const query = ref<"query">("commerceWishlists/queries:getMyWishlists");
	const args = {
		instanceKey: "test-instance",
		refreshKey: "owner-total",
		paginationOpts: { numItems: 4, cursor: null },
	};
	const result = await f.owner.query(query, args);
	expect(result.page).toHaveLength(4);
	expect(result.isDone).toBe(false);
	expect(result.summary).toEqual({
		state: "ready",
		totalLists: 31,
		totalItems: 31,
	});
	expect(
		result.page.reduce(
			(n: number, row: { itemCount: number }) => n + row.itemCount,
			0,
		),
	).toBe(4);
	expect(await f.t.query(query, args)).toBeNull();
	expect(
		await f.owner.query(query, { ...args, instanceKey: "wrong" }),
	).toBeNull();
	expect((await f.other.query(query, args)).summary).toEqual({
		state: "ready",
		totalLists: 0,
		totalItems: 0,
	});
	await f.t.run((ctx) => ctx.db.patch(f.ids.owner, { status: "inactive" }));
	expect(await f.owner.query(query, args)).toBeNull();
});

test("invalid stored totals refuse display and a fresh generation repairs them", async () => {
	const f = await fixture();
	await listCount(f);
	await finish(
		f,
		await f.t.run((ctx) => beginOwnerSummaryRepair(ctx, f.ids.owner)),
	);
	await f.t.run(async (ctx) => {
		const row = await ctx.db
			.query("commerce_wishlist_owner_totals")
			.withIndex("by_owner", (q) => q.eq("ownerId", f.ids.owner))
			.unique();
		if (!row) throw Error("Missing fixture summary");
		await ctx.db.patch(row._id, { totalItems: -1 });
	});
	expect((await summary(f)).state).toBe("preparing");
	const old = await f.t.run((ctx) => beginOwnerSummaryRepair(ctx, f.ids.owner));
	const fresh = await f.t.run((ctx) =>
		beginOwnerSummaryRepair(ctx, f.ids.owner, true),
	);
	expect(
		await f.t.run((ctx) => advanceOwnerSummaryRepair(ctx, old!)),
	).toBeNull();
	await finish(f, fresh);
	expect(await summary(f)).toEqual({
		state: "ready",
		totalLists: 1,
		totalItems: 1,
	});
});
