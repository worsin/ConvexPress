import { expect, test } from "bun:test";
import { makeFunctionReference as ref } from "convex/server";
import { fixture } from "./ownership.test";

const lookup = ref<"query">("commerceWishlists/queries:isInWishlist");
const pageArgs = {
	instanceKey: "test-instance",
	paginationOpts: { numItems: 24, cursor: null },
};

test("product lookup advances through bounded owner-list pages without reporting an early absence", async () => {
	const { t, ids, owner } = await fixture();
	await t.run(async (ctx) => {
		await ctx.db.delete(ids.item);
		for (let i = 0; i < 30; i++) {
			const wishlistId = await ctx.db.insert("commerce_wishlists", {
				userId: ids.owner,
				name: `List ${i}`,
				isDefault: false,
				isPublic: false,
				shareToken: `lookup-${i}`,
				createdAt: i,
				updatedAt: i,
			});
			if (i === 29)
				await ctx.db.insert("commerce_wishlist_items", {
					wishlistId,
					productId: ids.product,
					addedAt: i,
				});
		}
	});
	const first = await owner.query(lookup, {
		...pageArgs,
		productId: ids.product,
	});
	expect(first.page).toEqual([]);
	expect(first.isDone).toBe(false);
	const second = await owner.query(lookup, {
		...pageArgs,
		productId: ids.product,
		paginationOpts: { numItems: 24, cursor: first.continueCursor },
	});
	expect(second.isDone).toBe(true);
	expect(second.page).toHaveLength(1);
	expect(second.page[0].state).toBe("saved");
});

test("lookup matches any saved option when unspecified and the exact option when specified", async () => {
	const { t, ids, owner } = await fixture();
	const variant = await t.run(async (ctx) => {
		const product = await ctx.db.get(ids.product);
		if (!product) throw Error("fixture product missing");
		// An ID from this table is enough for the saved-item identity: lookup does
		// not expose product/variant details or override save/cart availability.
		const variantId = await ctx.db.insert("commerce_product_variants", {
			productId: ids.product,
			title: "Ink",
			optionSummary: "Ink",
			price: { amount: 1200, currencyCode: "USD" },
			isDefault: true,
			status: "publish",
			createdAt: 1,
			updatedAt: 1,
		});
		await ctx.db.patch(ids.item, { variantId });
		return variantId;
	});
	const any = await owner.query(lookup, {
		...pageArgs,
		productId: ids.product,
	});
	const exact = await owner.query(lookup, {
		...pageArgs,
		productId: ids.product,
		variantId: variant,
	});
	expect(any.page[0].itemId).toBe(ids.item);
	expect(exact.page).toEqual(any.page);
});

test("lookup never returns another owner's private item and clears after deletion or revocation", async () => {
	const { t, ids, owner, other } = await fixture();
	expect(
		(await other.query(lookup, { ...pageArgs, productId: ids.product })).page,
	).toEqual([]);
	expect(
		(await t.query(lookup, { ...pageArgs, productId: ids.product })).page,
	).toEqual([{ state: "unavailable" }]);
	expect(
		(
			await owner.query(lookup, {
				...pageArgs,
				instanceKey: "another-site",
				productId: ids.product,
			})
		).page,
	).toEqual([{ state: "unavailable" }]);
	expect(
		(await owner.query(lookup, { ...pageArgs, productId: ids.product })).page[0]
			.itemId,
	).toBe(ids.item);
	await owner.mutation(
		ref<"mutation">("commerceWishlists/mutations:deleteWishlist"),
		{ wishlistId: ids.wishlist },
	);
	expect(
		(await owner.query(lookup, { ...pageArgs, productId: ids.product })).page,
	).toEqual([]);
	await t.run((ctx) => ctx.db.patch(ids.owner, { status: "inactive" }));
	expect(
		(await owner.query(lookup, { ...pageArgs, productId: ids.product })).page,
	).toEqual([{ state: "unavailable" }]);
});

test("lookup refuses invalid pagination bounds", async () => {
	const { ids, owner } = await fixture();
	for (const numItems of [0, 25, 1.5])
		await expect(
			owner.query(lookup, {
				...pageArgs,
				productId: ids.product,
				paginationOpts: { numItems, cursor: null },
			}),
		).rejects.toThrow();
});
