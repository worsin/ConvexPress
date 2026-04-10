import { ConvexError } from "convex/values";

import type { QueryCtx, MutationCtx } from "../_generated/server";
import {
  isCommerceReviewsEnabled,
  requireCommerceEnabled,
} from "../commerce/helpers";

type ReviewCtx = QueryCtx | MutationCtx;

export async function requireCommerceReviewsEnabled(
  ctx: ReviewCtx,
): Promise<void> {
  await requireCommerceEnabled(ctx);

  if (!(await isCommerceReviewsEnabled(ctx))) {
    throw new ConvexError({
      code: "commerce_reviews_disabled",
      message: "Commerce Reviews plugin is disabled.",
    });
  }
}
