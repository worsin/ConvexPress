/**
 * Commerce — Discount Counts Query Hook
 */

import { useQuery } from "convex-helpers/react/cache";
import { api } from "@backend/convex/_generated/api";
import type { DiscountCounts } from "@/lib/commerce/discountTypes";

export function useDiscountCounts(params: { search?: string; discountType?: string } = {}) {
  const args: Record<string, unknown> = {};
  if (params.search) args.search = params.search;
  if (params.discountType) args.discountType = params.discountType;

  const counts = useQuery((api as any)["commerce/discounts"].counts, args) as
    | DiscountCounts
    | undefined;

  return {
    counts: counts as Record<string, number> | undefined,
    isLoading: counts === undefined,
  };
}
