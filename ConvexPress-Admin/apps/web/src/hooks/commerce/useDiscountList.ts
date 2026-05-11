/**
 * Commerce — Discount List Query Hook
 */

import { useQuery } from "convex-helpers/react/cache";
import { api } from "@backend/convex/_generated/api";
import {
  DISCOUNT_SORT_FIELD_MAP,
  type DiscountListItem,
  type DiscountListResult,
} from "@/lib/commerce/discountTypes";
import type { PaginatedResult } from "@/types/list-table";

export interface UseDiscountListParams {
  status?: string;
  discountType?: string;
  search?: string;
  orderBy?: string;
  orderDir?: "asc" | "desc";
  page?: number;
  perPage?: number;
}

export function useDiscountList(params: UseDiscountListParams) {
  const orderBy = params.orderBy
    ? (DISCOUNT_SORT_FIELD_MAP[params.orderBy] ?? "updatedAt")
    : "updatedAt";

  const queryArgs: Record<string, unknown> = {
    page: params.page ?? 1,
    perPage: params.perPage ?? 20,
    orderBy,
    orderDir: params.orderDir ?? "desc",
  };
  // Status tab: "all" doesn't filter; "scheduled"/"expired" are date-derived (handled client side later)
  if (params.status && params.status !== "all" && params.status !== "scheduled" && params.status !== "expired") {
    queryArgs.status = params.status;
  }
  if (params.discountType) queryArgs.discountType = params.discountType;
  if (params.search) queryArgs.search = params.search;

  const result = useQuery((api as any)["commerce/discounts"].list, queryArgs) as
    | DiscountListResult
    | undefined;

  // Apply scheduled/expired filter client-side since backend status is binary active/inactive
  let processed = result;
  if (result && (params.status === "scheduled" || params.status === "expired")) {
    const now = Date.now();
    const items =
      params.status === "scheduled"
        ? result.items.filter((d) => d.startsAt && d.startsAt > now)
        : result.items.filter((d) => d.endsAt && d.endsAt < now);
    processed = { ...result, items, total: items.length, totalPages: Math.ceil(items.length / (params.perPage ?? 20)) };
  }

  const data: PaginatedResult<DiscountListItem> | undefined = processed
    ? {
        items: processed.items,
        total: processed.total,
        page: processed.page,
        perPage: processed.perPage,
        totalPages: processed.totalPages,
      }
    : undefined;

  return {
    data,
    isLoading: result === undefined,
  };
}
