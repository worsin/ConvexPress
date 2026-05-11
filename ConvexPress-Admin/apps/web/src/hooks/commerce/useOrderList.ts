/**
 * Commerce — Order List Query Hook
 *
 * Wraps useQuery(api.commerce.orders.list) with filter/sort/pagination
 * state derived from route URL search params, returning the
 * PaginatedResult shape expected by useListTable.
 */

import { useQuery } from "convex-helpers/react/cache";
import { api } from "@backend/convex/_generated/api";
import {
  ORDER_SORT_FIELD_MAP,
  type OrderListItem,
  type OrderListResult,
} from "@/lib/commerce/orderTypes";
import type { PaginatedResult } from "@/types/list-table";

export interface UseOrderListParams {
  status?: string;
  search?: string;
  orderBy?: string;
  orderDir?: "asc" | "desc";
  page?: number;
  perPage?: number;
  customerId?: string;
  userId?: string;
  dateFrom?: number;
  dateTo?: number;
  paymentStatus?: string;
  fulfillmentStatus?: string;
}

export function useOrderList(params: UseOrderListParams) {
  const orderBy = params.orderBy
    ? (ORDER_SORT_FIELD_MAP[params.orderBy] ?? "createdAt")
    : "createdAt";

  const queryArgs: Record<string, unknown> = {
    page: params.page ?? 1,
    perPage: params.perPage ?? 20,
    orderBy,
    orderDir: params.orderDir ?? "desc",
  };

  if (params.status && params.status !== "all") queryArgs.status = params.status;
  if (params.search) queryArgs.search = params.search;
  if (params.customerId) queryArgs.customerId = params.customerId;
  if (params.userId) queryArgs.userId = params.userId;
  if (params.dateFrom) queryArgs.dateFrom = params.dateFrom;
  if (params.dateTo) queryArgs.dateTo = params.dateTo;
  if (params.paymentStatus) queryArgs.paymentStatus = params.paymentStatus;
  if (params.fulfillmentStatus) queryArgs.fulfillmentStatus = params.fulfillmentStatus;

  const result = useQuery((api as any).commerce.orders.list, queryArgs) as
    | OrderListResult
    | undefined;

  const data: PaginatedResult<OrderListItem> | undefined = result
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
