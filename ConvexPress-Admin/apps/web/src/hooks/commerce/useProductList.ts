/**
 * Commerce — Product List Query Hook
 */

import { useQuery } from "convex-helpers/react/cache";
import { api } from "@backend/convex/_generated/api";
import {
  PRODUCT_SORT_FIELD_MAP,
  type ProductListItem,
  type ProductListResult,
} from "@/lib/commerce/productTypes";
import type { PaginatedResult } from "@/types/list-table";

export interface UseProductListParams {
  status?: string;
  search?: string;
  productType?: string;
  authorId?: string;
  orderBy?: string;
  orderDir?: "asc" | "desc";
  page?: number;
  perPage?: number;
}

export function useProductList(params: UseProductListParams) {
  const orderBy = params.orderBy
    ? (PRODUCT_SORT_FIELD_MAP[params.orderBy] ?? "updatedAt")
    : "updatedAt";

  const queryArgs: Record<string, unknown> = {
    page: params.page ?? 1,
    perPage: params.perPage ?? 20,
    orderBy,
    orderDir: params.orderDir ?? "desc",
  };
  if (params.status && params.status !== "all") queryArgs.status = params.status;
  if (params.search) queryArgs.search = params.search;
  if (params.productType) queryArgs.productType = params.productType;
  if (params.authorId) queryArgs.authorId = params.authorId;

  const result = useQuery((api as any)["commerce/products"].list, queryArgs) as
    | ProductListResult
    | undefined;

  const data: PaginatedResult<ProductListItem> | undefined = result
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
