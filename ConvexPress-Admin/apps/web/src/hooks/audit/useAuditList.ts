/**
 * useAuditList Hook
 *
 * Wraps useQuery(api.auditLogs.queries.list) with filter state management
 * and cursor-based pagination. Filter state is synced to URL search params.
 */

import { useState, useCallback, useMemo } from "react";
import { useQuery } from "convex/react";
import { useSearch, useNavigate } from "@tanstack/react-router";

import { api } from "@backend/convex/_generated/api";
import type { AuditSeverity, AuditObjectType, AuditFilter } from "@/lib/audit/types";
import { DEFAULT_PAGE_SIZE } from "@/lib/audit/constants";

interface UseAuditListOptions {
  /** Override default page size */
  pageSize?: number;
}

export function useAuditList(options?: UseAuditListOptions) {
  const navigate = useNavigate();
  const searchParams = useSearch({ strict: false }) as Record<
    string,
    string | undefined
  >;

  const pageSize = options?.pageSize ?? DEFAULT_PAGE_SIZE;

  // Build query args from URL search params
  const queryArgs = useMemo(
    () => ({
      severity: (searchParams.severity as AuditSeverity) || undefined,
      system: searchParams.system || undefined,
      actorId: searchParams.actorId || undefined,
      objectType: (searchParams.objectType as AuditObjectType) || undefined,
      eventCode: searchParams.eventCode || undefined,
      search: searchParams.search || undefined,
      dateFrom: searchParams.dateFrom
        ? Number(searchParams.dateFrom)
        : undefined,
      dateTo: searchParams.dateTo ? Number(searchParams.dateTo) : undefined,
      cursor: searchParams.cursor || undefined,
      limit: pageSize,
      direction: "older" as const,
    }),
    [searchParams, pageSize],
  );

  const result = useQuery(api.auditLogs.queries.list, queryArgs);

  // Update a filter in URL search params (resets cursor)
  const updateFilter = useCallback(
    (key: string, value: string | undefined) => {
      navigate({
        search: (prev: Record<string, unknown>) => {
          const next = { ...prev, [key]: value, cursor: undefined };
          for (const k of Object.keys(next)) {
            if (next[k] === undefined || next[k] === "") delete next[k];
          }
          return next;
        },
        replace: true,
      });
    },
    [navigate],
  );

  // Set multiple filters at once
  const setFilters = useCallback(
    (filters: Partial<AuditFilter>) => {
      navigate({
        search: (prev: Record<string, unknown>) => {
          const next: Record<string, unknown> = {
            ...prev,
            ...filters,
            cursor: undefined,
          };
          for (const k of Object.keys(next)) {
            if (next[k] === undefined || next[k] === "") delete next[k];
          }
          return next;
        },
        replace: true,
      });
    },
    [navigate],
  );

  // Clear all filters
  const clearFilters = useCallback(() => {
    navigate({
      search: {},
      replace: true,
    });
  }, [navigate]);

  // Pagination: go to next page
  const goToNextPage = useCallback(() => {
    if (result?.nextCursor) {
      navigate({
        search: (prev: Record<string, unknown>) => ({
          ...prev,
          cursor: result.nextCursor,
        }),
        replace: true,
      });
    }
  }, [result?.nextCursor, navigate]);

  // Check if any filters are active
  const hasActiveFilters = useMemo(
    () =>
      !!(
        searchParams.severity ||
        searchParams.system ||
        searchParams.actorId ||
        searchParams.objectType ||
        searchParams.eventCode ||
        searchParams.search ||
        searchParams.dateFrom ||
        searchParams.dateTo
      ),
    [searchParams],
  );

  return {
    // Data
    entries: result?.entries ?? [],
    nextCursor: result?.nextCursor,
    isLoading: result === undefined,

    // Filters
    filters: {
      severity: searchParams.severity as AuditSeverity | undefined,
      system: searchParams.system,
      actorId: searchParams.actorId,
      objectType: searchParams.objectType as AuditObjectType | undefined,
      eventCode: searchParams.eventCode,
      search: searchParams.search,
      dateFrom: searchParams.dateFrom,
      dateTo: searchParams.dateTo,
    },
    updateFilter,
    setFilters,
    clearFilters,
    hasActiveFilters,

    // Pagination
    hasCursor: !!searchParams.cursor,
    goToNextPage,
    hasNextPage: !!result?.nextCursor,
  };
}
