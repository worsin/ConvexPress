/**
 * Commerce — Customer List Query Hook
 */

import { useQuery } from "convex-helpers/react/cache";
import { api } from "@backend/convex/_generated/api";
import {
  CUSTOMER_SORT_FIELD_MAP,
  type CustomerListItem,
  type CustomerListResult,
} from "@/lib/commerce/customerTypes";
import type { PaginatedResult } from "@/types/list-table";

export interface UseCustomerListParams {
  status?: string; // "all" | "with_orders" | "no_orders" | "guests" | "registered"
  search?: string;
  orderBy?: string;
  orderDir?: "asc" | "desc";
  page?: number;
  perPage?: number;
}

export function useCustomerList(params: UseCustomerListParams) {
  const orderBy = params.orderBy
    ? (CUSTOMER_SORT_FIELD_MAP[params.orderBy] ?? "createdAt")
    : "createdAt";

  const queryArgs: Record<string, unknown> = {
    page: params.page ?? 1,
    perPage: params.perPage ?? 20,
    orderBy,
    orderDir: params.orderDir ?? "desc",
  };
  if (params.search) queryArgs.search = params.search;

  // Translate status tab → backend filter args
  switch (params.status) {
    case "with_orders":
      queryArgs.hasOrders = true;
      break;
    case "no_orders":
      queryArgs.hasOrders = false;
      break;
    case "guests":
      queryArgs.isGuest = true;
      break;
    case "registered":
      queryArgs.isGuest = false;
      break;
    // "all" or undefined → no extra filter
  }

  const result = useQuery((api as any).commerce.customers.list, queryArgs) as
    | CustomerListResult
    | undefined;

  const data: PaginatedResult<CustomerListItem> | undefined = result
    ? {
        items: result.items,
        total: result.total,
        page: result.page,
        perPage: result.perPage,
        totalPages: result.totalPages,
      }
    : undefined;

  return {
    data,
    isLoading: result === undefined,
  };
}
