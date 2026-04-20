import { ConvexError } from "convex/values";

import type { QueryCtx, MutationCtx } from "../_generated/server";
import {
  isCommerceReturnsEnabled,
  requireCommerceEnabled,
} from "../commerce/helpers";

type ReturnsCtx = QueryCtx | MutationCtx;

export async function requireCommerceReturnsEnabled(
  ctx: ReturnsCtx,
): Promise<void> {
  await requireCommerceEnabled(ctx);

  if (!(await isCommerceReturnsEnabled(ctx))) {
    throw new ConvexError({
      code: "commerce_returns_disabled",
      message: "Commerce Returns plugin is disabled.",
    });
  }
}
