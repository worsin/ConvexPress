import type { Doc } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import type { RequestReadLedger } from "../helpers/requestReadLedger";
import type { SourceByteLedger } from "../canonicalDocuments/sourceBudget";
import { createMembershipAccessEvaluator } from "../membership/access";
import { readPublicCardVariant } from "./publicProductVariant";

/** Shared publication authority for product detail, archives and canonical cards.
 * This closure belongs to one query snapshot, never a process or viewer cache.
 * Callers separately enforce Commerce and their bundle/collection selection. */
export function createPublicProductAccessReader(ctx: QueryCtx, budget?: RequestReadLedger,
  sources?: SourceByteLedger, now = Date.now()) {
  const evaluateAccess = createMembershipAccessEvaluator(ctx, budget);
  return async (product: Doc<"commerce_products"> | null): Promise<{
    variant: Doc<"commerce_product_variants"> | null;
  } | null> => {
    if (!product || product.status !== "publish") return null;
    budget?.noteAuthorizationBoundary(product.publishedAt, now);
    if (product.publishedAt !== undefined && product.publishedAt > now) return null;
    const href = `/products/${encodeURIComponent(product.slug)}`;
    for (const target of [
      { resourceType: "product" as const, resourceIdOrKey: String(product._id) },
      { resourceType: "route" as const, resourceIdOrKey: href },
    ]) if (!(await evaluateAccess(target)).allowed) return null;
    const variant = product.productType === "variable"
      ? await readPublicCardVariant(ctx, product._id, budget, sources) : null;
    if (product.productType === "variable" && !variant) return null;
    return { variant };
  };
}
