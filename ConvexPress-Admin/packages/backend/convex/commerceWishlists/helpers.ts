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
