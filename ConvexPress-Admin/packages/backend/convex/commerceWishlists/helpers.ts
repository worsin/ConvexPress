import type { Id } from "../_generated/dataModel";
import { getCurrentUser } from "../helpers/permissions";
import { createPublicProductAccessReader } from "../commerce/publicProductAccess";
import { isPublicVariant } from "../commerce/activePrice";
import { RequestReadLedger } from "../helpers/requestReadLedger";
import { SourceByteLedger } from "../canonicalDocuments/sourceBudget";
import { ConvexError } from "convex/values";

import type { QueryCtx, MutationCtx } from "../_generated/server";
import {
  isCommerceWishlistsEnabled,
  requireCommerceEnabled,
} from "../commerce/helpers";

type WishlistCtx = QueryCtx | MutationCtx;

export async function requireCommerceWishlistsEnabled(
  ctx: WishlistCtx,
): Promise<void> {
  await requireCommerceEnabled(ctx);

  if (!(await isCommerceWishlistsEnabled(ctx))) {
    throw new ConvexError({
      code: "commerce_wishlists_disabled",
      message: "Commerce Wishlists plugin is disabled.",
    });
  }
}

/** A valid token does not keep a suspended local/customer account active. */
export async function getActiveWishlistUser(ctx: WishlistCtx) {
  const user = await getCurrentUser(ctx);
  return user?.status === "active" ? user : null;
}

/** Saving a product must follow the same current storefront authority as reading
 * it. A supplied variant is always bound to that product and publicly visible. */
export async function requireSaveableWishlistProduct(ctx: WishlistCtx, productId: Id<"commerce_products">, variantId?: Id<"commerce_product_variants">) {
  const budget = new RequestReadLedger(), sources = new SourceByteLedger();
  budget.beforeRead();
  const product = budget.record(await ctx.db.get("commerce_products", productId));
  if (product) sources.record("product", product);
  const access = await createPublicProductAccessReader(ctx, budget, sources)(product);
  if (!access || !product) throw new ConvexError({code:"product_unavailable",message:"Product is not available."});
  if (variantId) {
    budget.beforeRead();
    const variant = budget.record(await ctx.db.get("commerce_product_variants", variantId));
    if (variant) sources.record("variant", variant);
    if (!variant || variant.productId !== productId || !isPublicVariant(variant) || product.productType !== "variable")
      throw new ConvexError({code:"product_unavailable",message:"Product option is not available."});
  }
  return product;
}
