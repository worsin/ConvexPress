/**
 * Commerce — Product Counts Query Hook
 */

import { useQuery } from "convex-helpers/react/cache";
import { api } from "@backend/convex/_generated/api";
import type { ProductCounts } from "@/lib/commerce/productTypes";

export interface UseProductCountsParams {
  search?: string;
  productType?: string;
  authorId?: string;
}

export function useProductCounts(params: UseProductCountsParams = {}) {
  const args: Record<string, unknown> = {};
  if (params.search) args.search = params.search;
  if (params.productType) args.productType = params.productType;
  if (params.authorId) args.authorId = params.authorId;

  const counts = useQuery((api as any)["commerce/products"].counts, args) as
    | ProductCounts
    | undefined;

  return {
    counts: counts as Record<string, number> | undefined,
    isLoading: counts === undefined,
  };
}
