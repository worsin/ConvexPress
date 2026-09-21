import { expect, test } from "bun:test";
import { makeFunctionReference as ref, getFunctionName } from "convex/server";
import { fixture } from "./ownership.test";
import { deleteWishlist } from "../mutations";
const shared = ref<"query">("commerceWishlists/pages:shared");
const pageArgs = {
	instanceKey: "test-instance",
	refreshKey: "delete",
	paginationOpts: { numItems: 12, cursor: null },
	shareToken: "private-share-token",
};
async function deleteFixture() {
	const f = await fixture();
	await f.t.run(async (ctx) => {
		await ctx.db.patch(f.ids.wishlist, { isPublic: true });
		for (let i = 0; i < 100; i++)
			await ctx.db.insert("commerce_wishlist_items", {
				wishlistId: f.ids.wishlist,
				productId: f.ids.product,
				addedAt: i,
			});
	});
	const queued: Array<{ name: string; args: any }> = [];
	const wrap = (ctx: any) => ({
		...ctx,
		scheduler: {
			runAfter: async (_delay: number, fn: any, args: any) => {
				queued.push({ name: getFunctionName(fn), args });
				return "scheduled";
			},
		},
	});
	const start = () =>
		f.owner.run((ctx) =>
			(deleteWishlist as any)._handler(wrap(ctx), {
				wishlistId: f.ids.wishlist,
			}),
		);
	return { ...f, queued, wrap, start };
}
test("large Wishlist deletion revokes access immediately and commits only a bounded first batch", async () => {
	const { t, ids, owner, queued, start } = await deleteFixture();
	expect(await start()).toBe(ids.wishlist);
	expect(await t.run((ctx) => ctx.db.get(ids.wishlist))).toBeNull();
	expect(await t.query(shared, pageArgs)).toBeNull();
	const remaining = await t.run((ctx) =>
		ctx.db
			.query("commerce_wishlist_items")
			.withIndex("by_wishlist", (q) => q.eq("wishlistId", ids.wishlist))
			.collect(),
	);
	expect(remaining.length).toBeGreaterThan(0);
	expect(remaining.length).toBeLessThan(101);
	expect(queued).toHaveLength(1);
	await expect(
		owner.mutation(ref<"mutation">("commerceWishlists/mutations:addItem"), {
			wishlistId: ids.wishlist,
			productId: ids.product,
		}),
	).rejects.toThrow();
});

test("duplicate continuation delivery and repeated delete acknowledgement finish once with exact progress", async () => {
	const { t, ids, owner, other, queued, wrap, start } = await deleteFixture();
	const { page } = await import("../cleanup");
	await start();
	const first = queued[0];
	await expect(
		other.mutation(
			ref<"mutation">("commerceWishlists/mutations:deleteWishlist"),
			{ wishlistId: ids.wishlist },
		),
	).rejects.toThrow();
	expect(await start()).toBe(ids.wishlist);
	queued.push(first);
	let calls = 0;
	while (queued.length) {
		if (++calls > 10) throw Error("Cleanup failed to converge");
		const task = queued.shift()!;
		await t.run((ctx) => (page as any)._handler(wrap(ctx), task.args));
	}
	const status = ref<"query">("commerceWishlists/cleanup:getStatus");
	expect(await owner.query(status, { wishlistId: ids.wishlist })).toMatchObject(
		{ state: "complete", deletedItems: 101 },
	);
	expect(await other.query(status, { wishlistId: ids.wishlist })).toBeNull();
	expect(await t.query(status, { wishlistId: ids.wishlist })).toBeNull();
	expect(
		await t.run((ctx) =>
			ctx.db
				.query("commerce_wishlist_items")
				.withIndex("by_wishlist", (q) => q.eq("wishlistId", ids.wishlist))
				.collect(),
		),
	).toEqual([]);
	expect(await start()).toBe(ids.wishlist);
	expect(
		await t.run((ctx) => (page as any)._handler(wrap(ctx), first.args)),
	).toEqual({ state: "complete", deleted: 0 });
});
test("scheduler failure rolls back list access, items and the deletion receipt", async () => {
	const { t, owner, ids } = await deleteFixture();
	await expect(
		owner.run((ctx) =>
			(deleteWishlist as any)._handler(
				{
					...ctx,
					scheduler: {
						runAfter: async () => {
							throw Error("scheduler failed");
						},
					},
				},
				{ wishlistId: ids.wishlist },
			),
		),
	).rejects.toThrow("scheduler failed");
	expect(await t.run((ctx) => ctx.db.get(ids.wishlist))).not.toBeNull();
	expect(
		await t.run((ctx) => ctx.db.query("commerce_wishlist_items").collect()),
	).toHaveLength(101);
	expect(
		await t.run((ctx) => ctx.db.query("commerce_wishlist_deletions").collect()),
	).toEqual([]);
	expect(await t.query(shared, pageArgs)).not.toBeNull();
});
test("recovery replaces a lost continuation and finishes after account/plugin revocation", async () => {
	const { t, ids, owner, queued, wrap, start } = await deleteFixture();
	const { page, recover } = await import("../cleanup");
	await start();
	const task = queued.pop()!;
	await t.run(async (ctx) => {
		const settings = await ctx.db
			.query("settings")
			.withIndex("by_section", (q) => q.eq("section", "plugins"))
			.unique();
		await ctx.db.patch(settings!._id, {
			values: { ...settings!.values, commerceWishlistsEnabled: false },
		});
		await ctx.db.patch(ids.owner, { status: "inactive" });
		await ctx.db.patch(task.args.jobId, { updatedAt: Date.now() - 120_000 });
	});
	expect(
		await t.run((ctx) => (recover as any)._handler(wrap(ctx), {})),
	).toEqual({ resumed: 1, pruned: 0 });
	expect(queued[0].args).toEqual(task.args);
	let calls = 0;
	while (queued.length) {
		if (++calls > 10) throw Error("Recovery failed to converge");
		const next = queued.shift()!;
		await t.run((ctx) => (page as any)._handler(wrap(ctx), next.args));
	}
	expect(await t.run((ctx) => ctx.db.get(task.args.jobId))).toMatchObject({
		state: "complete",
		deletedItems: 101,
	});
	expect(
		await owner.query(ref<"query">("commerceWishlists/cleanup:getStatus"), {
			wishlistId: ids.wishlist,
		}),
	).toBeNull();
});
test("cleanup refuses a live restored list and a fresh authorized deletion supersedes old tasks", async () => {
	const { t, ids, wrap, start, queued } = await deleteFixture();
	const { page } = await import("../cleanup");
	const jobId = await t.run((ctx) =>
		ctx.db.insert("commerce_wishlist_deletions", {
			wishlistId: ids.wishlist,
			requestedBy: ids.owner,
			generation: 1,
			state: "pending",
			deletedItems: 0,
			createdAt: 1,
			updatedAt: 1,
		}),
	);
	const old = { jobId, generation: 1 };
	expect(await t.run((ctx) => (page as any)._handler(wrap(ctx), old))).toEqual({
		state: "blocked",
		deleted: 0,
	});
	expect(
		await t.run((ctx) => ctx.db.query("commerce_wishlist_items").collect()),
	).toHaveLength(101);
	await start();
	expect(queued[0].args.generation).toBe(2);
	const remaining = await t.run((ctx) =>
		ctx.db.query("commerce_wishlist_items").collect(),
	);
	expect(await t.run((ctx) => (page as any)._handler(wrap(ctx), old))).toEqual({
		state: "obsolete",
		deleted: 0,
	});
	expect(
		await t.run((ctx) => ctx.db.query("commerce_wishlist_items").collect()),
	).toEqual(remaining);
});
test("receipt retention is bounded and leaves pending or blocked deletions recoverable", async () => {
	const { t, ids, wrap } = await deleteFixture();
	const { recover } = await import("../cleanup");
	const stale = Date.now() - 31 * 24 * 60 * 60 * 1000;
	await t.run(async (ctx) => {
		for (let i = 0; i < 72; i++) {
			const wishlistId = await ctx.db.insert("commerce_wishlists", {
				userId: ids.owner,
				name: `Deleted ${i}`,
				isDefault: false,
				isPublic: false,
				shareToken: `retention-${i}`,
				createdAt: stale,
				updatedAt: stale,
			});
			await ctx.db.delete(wishlistId);
			const state =
				i < 70
					? ("complete" as const)
					: i === 70
						? ("pending" as const)
						: ("blocked" as const);
			await ctx.db.insert("commerce_wishlist_deletions", {
				wishlistId,
				requestedBy: ids.owner,
				generation: 1,
				state,
				deletedItems: 1,
				createdAt: stale,
				updatedAt: state === "pending" ? Date.now() : stale,
			});
		}
	});
	expect(
		await t.run((ctx) => (recover as any)._handler(wrap(ctx), {})),
	).toEqual({ resumed: 0, pruned: 64 });
	expect(
		await t.run((ctx) => (recover as any)._handler(wrap(ctx), {})),
	).toEqual({ resumed: 0, pruned: 6 });
	const retained = await t.run((ctx) =>
		ctx.db.query("commerce_wishlist_deletions").collect(),
	);
	expect(retained.map((x) => x.state).sort()).toEqual(["blocked", "pending"]);
});

test("an owner can resume a blocked receipt after the restored list has been removed again", async () => {
	const { t, ids, wrap, start, queued } = await deleteFixture();
	const { page } = await import("../cleanup");
	const jobId = await t.run(async (ctx) => {
		const id = await ctx.db.insert("commerce_wishlist_deletions", {
			wishlistId: ids.wishlist,
			requestedBy: ids.owner,
			generation: 1,
			state: "blocked",
			deletedItems: 10,
			createdAt: 1,
			updatedAt: 1,
		});
		await ctx.db.delete(ids.wishlist);
		return id;
	});
	await start();
	expect(await t.run((ctx) => ctx.db.get(jobId))).toMatchObject({
		state: "pending",
		generation: 2,
		deletedItems: 32,
	});
	expect(queued[0].args).toEqual({ jobId, generation: 2 });
	expect(
		await t.run((ctx) =>
			(page as any)._handler(wrap(ctx), { jobId, generation: 1 }),
		),
	).toEqual({ state: "obsolete", deleted: 0 });
});
