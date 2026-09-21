import { expect, test } from "bun:test";
import { makeFunctionReference as ref } from "convex/server";
import { fixture } from "./ownership.test";
const merge = ref<"mutation">("commerceWishlists/mutations:mergeGuestWishlist");
async function extraProduct(
	t: any,
	ids: any,
	patch: Record<string, unknown> = {},
) {
	return t.run(async (ctx: any) => {
		const { _id, _creationTime, ...fields } = await ctx.db.get(ids.product);
		return ctx.db.insert("commerce_products", {
			...fields,
			slug: `extra-${Math.random()}`,
			...patch,
		});
	});
}
test("guest merge skips future publication and deduplicates visible products against the exact unselected identity", async () => {
	const { t, owner, ids } = await fixture();
	const future = await extraProduct(t, ids, {
		publishedAt: Date.now() + 60_000,
	});
	const visible = await extraProduct(t, ids);
	expect(
		await owner.mutation(merge, {
			guestProductIds: [future, visible, visible, ids.product],
		}),
	).toEqual({ merged: 1 });
	expect(
		await owner.mutation(merge, { guestProductIds: [visible, ids.product] }),
	).toEqual({ merged: 0 });
	const items = await t.run((ctx) =>
		ctx.db
			.query("commerce_wishlist_items")
			.withIndex("by_wishlist", (q) => q.eq("wishlistId", ids.wishlist))
			.collect(),
	);
	expect(items.map((x) => x.productId).sort()).toEqual(
		[ids.product, visible].sort(),
	);
});
test("oversized and unauthenticated guest merges perform no writes", async () => {
	const { t, owner, ids } = await fixture();
	const before = await t.run((ctx) =>
		ctx.db.query("commerce_wishlist_items").collect(),
	);
	await expect(
		owner.mutation(merge, { guestProductIds: Array(25).fill(ids.product) }),
	).rejects.toThrow();
	await expect(
		t.mutation(merge, { guestProductIds: [ids.product] }),
	).rejects.toThrow();
	expect(
		await t.run((ctx) => ctx.db.query("commerce_wishlist_items").collect()),
	).toEqual(before);
});
test("an empty or all-hidden guest batch does not create a list", async () => {
	const { t, other, ids } = await fixture();
	expect(await other.mutation(merge, { guestProductIds: [] })).toEqual({
		merged: 0,
	});
	const hidden = await extraProduct(t, ids, { status: "draft" });
	expect(await other.mutation(merge, { guestProductIds: [hidden] })).toEqual({
		merged: 0,
	});
	expect(
		await t.run((ctx) =>
			ctx.db
				.query("commerce_wishlists")
				.withIndex("by_user", (q) => q.eq("userId", ids.other))
				.collect(),
		),
	).toEqual([]);
});

test("guest merge enforces product and route membership rules for the current account", async () => {
	const { t, owner, ids } = await fixture();
	const restricted = await extraProduct(t, ids, { slug: "members-only" }),
		route = await extraProduct(t, ids, { slug: "protected-route" });
	const plan = await t.run(async (ctx) => {
		const settings = await ctx.db
			.query("settings")
			.withIndex("by_section", (q) => q.eq("section", "plugins"))
			.unique();
		await ctx.db.patch(settings!._id, {
			values: { ...settings!.values, membershipEnabled: true },
		});
		const plan = await ctx.db.insert("membership_plans", {
			title: "Members",
			slug: "members",
			status: "active",
			grantMode: "manual",
			priority: 1,
			createdAt: 1,
			updatedAt: 1,
		});
		for (const target of [
			{ resourceType: "product" as const, resourceIdOrKey: restricted },
			{
				resourceType: "route" as const,
				resourceIdOrKey: "/products/protected-route",
			},
		])
			await ctx.db.insert("membership_restriction_rules", {
				...target,
				ruleMode: "allow_only",
				planIds: [plan],
				teaserMode: "excerpt",
				loginRequired: true,
				createdAt: 1,
				updatedAt: 1,
			});
		return plan;
	});
	expect(
		await owner.mutation(merge, { guestProductIds: [restricted, route] }),
	).toEqual({ merged: 0 });
	await t.run((ctx) =>
		ctx.db.insert("membership_grants", {
			userId: ids.owner,
			planId: plan,
			sourceType: "manual",
			status: "active",
			startsAt: 1,
			createdAt: 1,
			updatedAt: 1,
		}),
	);
	expect(
		await owner.mutation(merge, { guestProductIds: [restricted, route] }),
	).toEqual({ merged: 2 });
});
test("a late source-budget refusal rolls back earlier inserts and the new default list", async () => {
	const { t, other, ids } = await fixture();
	const large = await extraProduct(t, ids, {
		rawSourceMeta: "x".repeat(270 * 1024),
	});
	await expect(
		other.mutation(merge, { guestProductIds: [ids.product, large] }),
	).rejects.toThrow();
	expect(
		await t.run((ctx) =>
			ctx.db
				.query("commerce_wishlists")
				.withIndex("by_user", (q) => q.eq("userId", ids.other))
				.collect(),
		),
	).toEqual([]);
	expect(
		await t.run((ctx) => ctx.db.query("commerce_wishlist_items").collect()),
	).toHaveLength(1);
});
test("a whole 24-product batch merges and a replay inserts nothing", async () => {
	const { t, other, ids } = await fixture();
	const products = [];
	for (let i = 0; i < 24; i++)
		products.push(await extraProduct(t, ids, { slug: `batch-${i}` }));
	expect(await other.mutation(merge, { guestProductIds: products })).toEqual({
		merged: 24,
	});
	expect(await other.mutation(merge, { guestProductIds: products })).toEqual({
		merged: 0,
	});
});
