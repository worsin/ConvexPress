/**
 * Routing System - Queries
 *
 * All read operations for the routing system:
 *   getRedirects    - Admin redirect list (paginated, filterable by source/enabled/search)
 *   getRedirectById - Single redirect detail
 *   get404Log       - 404 log listing (paginated, filterable by resolved/minHits)
 *   getRedirectStats - Summary statistics for the admin dashboard
 *
 * Authorization:
 *   - All queries require authentication and Administrator role
 *   - getRedirects / getRedirectById: routing.view_redirects capability
 *   - get404Log: routing.view_redirects capability
 *   - getRedirectStats: routing.view_redirects capability
 */

import { query } from "../_generated/server";
import { requireCan } from "../helpers/permissions";
import {
  getRedirectsArgs,
  getRedirectByIdArgs,
  get404LogArgs,
  DEFAULT_PER_PAGE,
  MAX_PER_PAGE,
} from "./validators";

// ─── Get Redirects (Admin) ──────────────────────────────────────────────────

/**
 * Paginated redirect list with filters for the admin "Redirects" screen.
 *
 * Requires Administrator with routing.view_redirects capability.
 *
 * Supports filtering by source type, enabled status, and text search.
 * Supports sorting by sourceUrl, hitCount, createdAt, or lastHitAt.
 */
export const getRedirects = query({
  args: getRedirectsArgs,
  handler: async (ctx, args) => {
    await requireCan(ctx, "routing.view_redirects");

    const page = Math.max(1, args.page ?? 1);
    const perPage = Math.min(
      MAX_PER_PAGE,
      Math.max(1, args.perPage ?? DEFAULT_PER_PAGE),
    );
    const sortBy = args.sortBy ?? "createdAt";
    const sortOrder = args.sortOrder ?? "desc";

    // ── Build query based on filters ────────────────────────────────────
    let allRedirects;

    if (args.source !== undefined) {
      allRedirects = await ctx.db
        .query("redirects")
        .withIndex("by_source", (q) => q.eq("source", args.source!))
        .collect();
    } else if (args.enabled !== undefined) {
      allRedirects = await ctx.db
        .query("redirects")
        .withIndex("by_enabled", (q) => q.eq("enabled", args.enabled!))
        .collect();
    } else {
      allRedirects = await ctx.db.query("redirects").collect();
    }

    // ── Apply cross-filters ─────────────────────────────────────────────
    let filtered = allRedirects;

    // Cross-filter: source + enabled
    if (args.source !== undefined && args.enabled !== undefined) {
      filtered = filtered.filter((r) => r.enabled === args.enabled);
    }

    // Text search across sourceUrl, targetUrl, and note
    if (args.search && args.search.trim()) {
      const searchLower = args.search.trim().toLowerCase();
      filtered = filtered.filter(
        (r) =>
          r.sourceUrl.toLowerCase().includes(searchLower) ||
          r.targetUrl.toLowerCase().includes(searchLower) ||
          (r.note && r.note.toLowerCase().includes(searchLower)),
      );
    }

    // ── Sort ────────────────────────────────────────────────────────────
    filtered.sort((a, b) => {
      let aVal: number | string;
      let bVal: number | string;

      switch (sortBy) {
        case "sourceUrl":
          aVal = a.sourceUrl;
          bVal = b.sourceUrl;
          if (typeof aVal === "string" && typeof bVal === "string") {
            return sortOrder === "asc"
              ? aVal.localeCompare(bVal)
              : bVal.localeCompare(aVal);
          }
          return 0;
        case "hitCount":
          aVal = a.hitCount;
          bVal = b.hitCount;
          break;
        case "lastHitAt":
          aVal = a.lastHitAt ?? 0;
          bVal = b.lastHitAt ?? 0;
          break;
        case "createdAt":
        default:
          aVal = a.createdAt;
          bVal = b.createdAt;
          break;
      }

      return sortOrder === "asc"
        ? (aVal as number) - (bVal as number)
        : (bVal as number) - (aVal as number);
    });

    // ── Paginate ────────────────────────────────────────────────────────
    const total = filtered.length;
    const totalPages = Math.ceil(total / perPage);
    const offset = (page - 1) * perPage;
    const redirects = filtered.slice(offset, offset + perPage);

    return { redirects, total, page, perPage, totalPages };
  },
});

// ─── Get Redirect By ID ─────────────────────────────────────────────────────

/**
 * Get a single redirect by ID for the edit screen.
 *
 * Returns null if not found (instead of throwing) for graceful handling.
 */
export const getRedirectById = query({
  args: getRedirectByIdArgs,
  handler: async (ctx, args) => {
    await requireCan(ctx, "routing.view_redirects");

    const redirect = await ctx.db.get("redirects", args.redirectId);
    if (!redirect) {
      return null;
    }

    return redirect;
  },
});

// ─── Get 404 Log ────────────────────────────────────────────────────────────

/**
 * Paginated 404 log listing for the admin "404 Log" screen.
 *
 * Requires Administrator with routing.view_redirects capability.
 *
 * Supports filtering by resolved status and minimum hit count.
 * Supports sorting by hitCount, lastHitAt, or url.
 */
export const get404Log = query({
  args: get404LogArgs,
  handler: async (ctx, args) => {
    await requireCan(ctx, "routing.view_redirects");

    const page = Math.max(1, args.page ?? 1);
    const perPage = Math.min(
      MAX_PER_PAGE,
      Math.max(1, args.perPage ?? DEFAULT_PER_PAGE),
    );
    const sortBy = args.sortBy ?? "lastHitAt";
    const sortOrder = args.sortOrder ?? "desc";

    // ── Build query based on filters ────────────────────────────────────
    let allEntries;

    if (args.resolved !== undefined) {
      allEntries = await ctx.db
        .query("notFound")
        .withIndex("by_resolved", (q) => q.eq("resolved", args.resolved!))
        .collect();
    } else {
      allEntries = await ctx.db.query("notFound").collect();
    }

    // ── Apply minimum hit count filter ──────────────────────────────────
    let filtered = allEntries;

    if (args.minHits !== undefined && args.minHits > 0) {
      filtered = filtered.filter((e) => e.hitCount >= args.minHits!);
    }

    // ── Sort ────────────────────────────────────────────────────────────
    filtered.sort((a, b) => {
      let aVal: number | string;
      let bVal: number | string;

      switch (sortBy) {
        case "url":
          aVal = a.url;
          bVal = b.url;
          if (typeof aVal === "string" && typeof bVal === "string") {
            return sortOrder === "asc"
              ? aVal.localeCompare(bVal)
              : bVal.localeCompare(aVal);
          }
          return 0;
        case "hitCount":
          aVal = a.hitCount;
          bVal = b.hitCount;
          break;
        case "lastHitAt":
        default:
          aVal = a.lastHitAt;
          bVal = b.lastHitAt;
          break;
      }

      return sortOrder === "asc"
        ? (aVal as number) - (bVal as number)
        : (bVal as number) - (aVal as number);
    });

    // ── Paginate ────────────────────────────────────────────────────────
    const total = filtered.length;
    const totalPages = Math.ceil(total / perPage);
    const offset = (page - 1) * perPage;
    const entries = filtered.slice(offset, offset + perPage);

    return { entries, total, page, perPage, totalPages };
  },
});

// ─── Get Redirect Stats ─────────────────────────────────────────────────────

/**
 * Summary statistics for the admin redirect dashboard.
 *
 * Returns:
 *   - totalRedirects: total redirect count
 *   - activeRedirects: enabled redirect count
 *   - totalHits: sum of all redirect hits
 *   - total404s: total 404 entries
 *   - unresolved404s: unresolved 404 count
 *   - topRedirects: top 10 redirects by hit count
 */
export const getRedirectStats = query({
  args: {},
  handler: async (ctx) => {
    await requireCan(ctx, "routing.view_redirects");

    // ── Get all redirects ───────────────────────────────────────────────
    const allRedirects = await ctx.db.query("redirects").collect();

    const totalRedirects = allRedirects.length;
    const activeRedirects = allRedirects.filter((r) => r.enabled).length;
    const totalHits = allRedirects.reduce((sum, r) => sum + r.hitCount, 0);

    // Top 10 by hit count
    const topRedirects = [...allRedirects]
      .sort((a, b) => b.hitCount - a.hitCount)
      .slice(0, 10);

    // ── Get 404 stats ───────────────────────────────────────────────────
    const allNotFound = await ctx.db.query("notFound").collect();
    const total404s = allNotFound.length;
    const unresolved404s = allNotFound.filter((e) => !e.resolved).length;

    return {
      totalRedirects,
      activeRedirects,
      totalHits,
      total404s,
      unresolved404s,
      topRedirects,
    };
  },
});
