/**
 * Commerce — Customer Counts Query Hook
 */

import { useQuery } from "convex-helpers/react/cache";
import { api } from "@backend/convex/_generated/api";
import type { CustomerCounts } from "@/lib/commerce/customerTypes";

export function useCustomerCounts(params: { search?: string } = {}) {
  const args: Record<string, unknown> = {};
  if (params.search) args.search = params.search;

  const counts = useQuery((api as any).commerce.customers.counts, args) as
    | CustomerCounts
    | undefined;

  return {
    counts: counts as Record<string, number> | undefined,
    isLoading: counts === undefined,
  };
}
