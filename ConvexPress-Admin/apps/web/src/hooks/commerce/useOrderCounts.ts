/**
 * Commerce — Order Counts Query Hook
 *
 * Returns counts for each status tab on the unified purchase ledger table.
 */

import { useQuery } from "convex-helpers/react/cache";
import { api } from "@backend/convex/_generated/api";
import type { OrderCounts } from "@/lib/commerce/orderTypes";

export interface UseOrderCountsParams {
  search?: string;
  customerId?: string;
  userId?: string;
  dateFrom?: number;
  dateTo?: number;
  sourceType?: string;
}

export function useOrderCounts(params: UseOrderCountsParams = {}) {
  const args: Record<string, unknown> = {};
  if (params.search) args.search = params.search;
  if (params.customerId) args.customerId = params.customerId;
  if (params.userId) args.userId = params.userId;
  if (params.dateFrom) args.dateFrom = params.dateFrom;
  if (params.dateTo) args.dateTo = params.dateTo;
  if (params.sourceType) args.sourceType = params.sourceType;

  const counts = useQuery((api as any).purchases.queries.counts, args) as
    | OrderCounts
    | undefined;

  return {
    counts: counts as Record<string, number> | undefined,
    isLoading: counts === undefined,
  };
}
