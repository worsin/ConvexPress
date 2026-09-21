import { expect, test } from "bun:test";
import { makeFunctionReference as ref } from "convex/server";
import { fixture } from "./ownership.test";
const recent = ref<"query">("commerceWishlists/queries:getRecentActivity");
async function adminFixture() {
	const f = await fixture();
	await f.t.run(async (ctx) => {
		const role = await ctx.db.insert("roles", {
			name: "Wishlist manager",
			slug: "wishlist-manager",
			description: "Test role",
			level: 10,
			type: "internal",
			isDefault: false,
			isProtected: false,
			capabilities: ["commerce.wishlists.manage"],
			pageAccess: [],
			status: "active",
			createdAt: 1,
			updatedAt: 1,
		});
		await ctx.db.patch(f.ids.owner, { roleId: role, isInternal: true });
	});
	return f;
}
test("recent Wishlist activity bounds requested limits instead of slicing an entire table", async () => {
	const { owner } = await adminFixture();
	for (const limit of [0, -1, 1.5, 101])
		await expect(owner.query(recent, { limit })).rejects.toThrow();
});
test("recent Wishlist activity follows addedAt order, limits its result, and requires current management access", async () => {
	const { t, owner, other, ids } = await adminFixture();
	await t.run(async (ctx) => {
		for (let i = 60; i > 0; i--)
			await ctx.db.insert("commerce_wishlist_items", {
				wishlistId: ids.wishlist,
				productId: ids.product,
				addedAt: i,
			});
	});
	const values = await owner.query(recent, { limit: 3 });
	expect(values.map((x) => x.addedAt)).toEqual([60, 59, 58]);
	expect(Object.keys(values[0]).sort()).toEqual([
		"_id",
		"addedAt",
		"productName",
		"productSlug",
		"userName",
	]);
	await expect(other.query(recent, { limit: 3 })).rejects.toThrow();
	await t.run((ctx) => ctx.db.patch(ids.owner, { status: "inactive" }));
	await expect(owner.query(recent, { limit: 3 })).rejects.toThrow();
});
