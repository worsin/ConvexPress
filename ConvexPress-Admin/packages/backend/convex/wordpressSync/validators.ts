/**
 * WordPress Sync System - Validators
 *
 * Shared argument validators for all sync system functions.
 */

import { v } from "convex/values";

// ─── Site Status ───────────────────────────────────────────────────────────

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const siteStatusValidator = v.union(
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  v.literal("active"),
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  v.literal("inactive"),
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  v.literal("error")
);

export type SiteStatus = "active" | "inactive" | "error";

// ─── Job Status ────────────────────────────────────────────────────────────

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const jobStatusValidator = v.union(
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  v.literal("pending"),
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  v.literal("running"),
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  v.literal("paused"),
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  v.literal("completed"),
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  v.literal("failed"),
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  v.literal("cancelled")
);

export type JobStatus = "pending" | "running" | "paused" | "completed" | "failed" | "cancelled";

// ─── Sync Phase ────────────────────────────────────────────────────────────

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const syncPhaseValidator = v.union(
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  v.literal("users"),
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  v.literal("taxonomies"),
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  v.literal("media"),
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  v.literal("posts"),
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  v.literal("pages"),
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  v.literal("comments"),
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  v.literal("menus"),
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  v.literal("commerceCatalog"),
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  v.literal("commerceTransactions"),
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  v.literal("reconciliation"),
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  v.literal("cleanup")
);

export type SyncPhase = "users" | "taxonomies" | "media" | "posts" | "pages" | "comments" | "menus" | "commerceCatalog" | "commerceTransactions" | "reconciliation" | "cleanup";

// Phase execution order (dependencies matter!)
export const PHASE_ORDER: SyncPhase[] = [
  "users",                // Must be first - posts reference authors
  "taxonomies",           // Must be before posts - posts reference terms
  "media",                // Must be before posts - posts reference featured images
  "posts",                // Main content
  "pages",                // Pages (separate because Elementor handling)
  "comments",             // After posts - references post IDs
  "menus",                // Last content - references posts/pages/categories
  "commerceCatalog",      // WooCommerce products, attributes, variations
  "commerceTransactions", // WooCommerce orders, customers, coupons, reviews
  "reconciliation",       // Cross-phase integrity checks and conflict resolution
  "cleanup",              // Finalization
];

// ─── Object Type ───────────────────────────────────────────────────────────

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const objectTypeValidator = v.union(
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  v.literal("user"),
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  v.literal("post"),
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  v.literal("page"),
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  v.literal("category"),
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  v.literal("tag"),
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  v.literal("media"),
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  v.literal("comment"),
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  v.literal("menu"),
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  v.literal("menuItem")
);

export type ObjectType = "user" | "post" | "page" | "category" | "tag" | "media" | "comment" | "menu" | "menuItem";

// ─── Phase Progress ────────────────────────────────────────────────────────

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const phaseProgressValidator = v.object({
  total: v.number(),
  imported: v.number(),
  failed: v.number(),
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  cursor: v.optional(v.number()),
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  created: v.optional(v.number()),
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  updated: v.optional(v.number()),
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  skipped: v.optional(v.number()),
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  conflicted: v.optional(v.number()),
});

export interface PhaseProgress {
  total: number;
  imported: number;
  failed: number;
  cursor?: number;
  created?: number;
  updated?: number;
  skipped?: number;
  conflicted?: number;
}

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const progressValidator = v.object({
  users: phaseProgressValidator,
  categories: phaseProgressValidator,
  tags: phaseProgressValidator,
  media: phaseProgressValidator,
  posts: phaseProgressValidator,
  pages: phaseProgressValidator,
  comments: phaseProgressValidator,
  menus: phaseProgressValidator,
  commerceCatalog: phaseProgressValidator,
  commerceTransactions: phaseProgressValidator,
  reconciliation: phaseProgressValidator,
  cleanup: phaseProgressValidator,
});

export type Progress = {
  users: PhaseProgress;
  categories: PhaseProgress;
  tags: PhaseProgress;
  media: PhaseProgress;
  posts: PhaseProgress;
  pages: PhaseProgress;
  comments: PhaseProgress;
  menus: PhaseProgress;
  commerceCatalog: PhaseProgress;
  commerceTransactions: PhaseProgress;
  reconciliation: PhaseProgress;
  cleanup: PhaseProgress;
};

// ─── Sync Error ────────────────────────────────────────────────────────────

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const syncErrorValidator = v.object({
  phase: v.string(),
  wpId: v.number(),
  message: v.string(),
  timestamp: v.number(),
});

export interface SyncError {
  phase: string;
  wpId: number;
  message: string;
  timestamp: number;
}

// ─── Site Credentials ──────────────────────────────────────────────────────

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const siteCredentialsValidator = v.object({
  siteUrl: v.string(),
  username: v.string(),
  applicationPassword: v.string(),
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  wooConsumerKey: v.optional(v.string()),
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  wooConsumerSecret: v.optional(v.string()),
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  wooAuthMode: v.optional(v.union(v.literal("shared"), v.literal("separate"))),
});

export interface SiteCredentials {
  siteUrl: string;
  username: string;
  applicationPassword: string;
  wooConsumerKey?: string;
  wooConsumerSecret?: string;
  wooAuthMode?: "shared" | "separate";
}

// ─── Import Config ────────────────────────────────────────────────────────

export interface ImportScope {
  wpContent: boolean;
  elementor: boolean;
  media: boolean;
  menus: boolean;
  comments: boolean;
  wooCatalog: boolean;
  wooCustomers: boolean;
  wooOrders: boolean;
  wooCoupons: boolean;
  wooReviews: boolean;
  cleanup: boolean;
}

export type TombstoneMode = "never" | "mark_stale" | "soft_delete" | "hard_delete";

export interface ImportBehavior {
  dryRun: boolean;
  updateExisting: boolean;
  preserveLocalEdits: boolean;
  importDrafts: boolean;
  importHistoricalOrders: boolean;
  importRefunds: boolean;
  importReviews: boolean;
  importCoupons: boolean;
  tombstoneMode?: TombstoneMode;
  destructiveDelete?: boolean;
}

export interface ImportFilters {
  dateRangeStart?: number;
  dateRangeEnd?: number;
  entityLimit?: number;
}

export interface ImportConfig {
  scope: ImportScope;
  behavior: ImportBehavior;
  filters: ImportFilters;
}

export function createDefaultImportConfig(): ImportConfig {
  return {
    scope: {
      wpContent: true, elementor: true, media: true, menus: true, comments: true,
      wooCatalog: true, wooCustomers: true, wooOrders: true, wooCoupons: true,
      wooReviews: true, cleanup: true,
    },
    behavior: {
      dryRun: false, updateExisting: true, preserveLocalEdits: false,
      importDrafts: true, importHistoricalOrders: true, importRefunds: true,
      importReviews: true, importCoupons: true, tombstoneMode: "never",
      destructiveDelete: false,
    },
    filters: {},
  };
}

function pickBooleans<T extends object>(
  defaults: T,
  input: unknown,
): T {
  const source = input && typeof input === "object" ? input as Record<string, unknown> : {};
  const result = { ...defaults } as T;
  for (const key of Object.keys(defaults) as Array<keyof T>) {
    const value = source[key as string];
    if (
      typeof (defaults as Record<string, unknown>)[key as string] === "boolean" &&
      typeof value === "boolean"
    ) {
      result[key] = value as T[typeof key];
    }
  }
  return result;
}

export function normalizeImportConfig(input: unknown): ImportConfig {
  const defaults = createDefaultImportConfig();
  if (!input || typeof input !== "object") {
    return defaults;
  }

  const source = input as Record<string, unknown>;
  const behaviorSource =
    source.behavior && typeof source.behavior === "object"
      ? source.behavior as Record<string, unknown>
      : {};
  const filtersSource =
    source.filters && typeof source.filters === "object"
      ? source.filters as Record<string, unknown>
      : {};

  const tombstoneMode = behaviorSource.tombstoneMode;
  const normalized: ImportConfig = {
    scope: pickBooleans(defaults.scope, source.scope),
    behavior: {
      ...pickBooleans(defaults.behavior, behaviorSource),
      tombstoneMode:
        tombstoneMode === "mark_stale" ||
        tombstoneMode === "soft_delete" ||
        tombstoneMode === "hard_delete" ||
        tombstoneMode === "never"
          ? tombstoneMode
          : defaults.behavior.tombstoneMode,
      destructiveDelete:
        typeof behaviorSource.destructiveDelete === "boolean"
          ? behaviorSource.destructiveDelete
          : defaults.behavior.destructiveDelete,
    },
    filters: {},
  };

  if (typeof filtersSource.dateRangeStart === "number") {
    normalized.filters.dateRangeStart = filtersSource.dateRangeStart;
  }
  if (typeof filtersSource.dateRangeEnd === "number") {
    normalized.filters.dateRangeEnd = filtersSource.dateRangeEnd;
  }
  if (typeof filtersSource.entityLimit === "number") {
    normalized.filters.entityLimit = filtersSource.entityLimit;
  }

  return normalized;
}

/**
 * Determine whether a given sync phase should run based on the import scope.
 */
export function shouldRunPhase(phase: SyncPhase, scope: ImportScope): boolean {
  switch (phase) {
    case "users": return scope.wpContent;
    case "taxonomies": return scope.wpContent;
    case "media": return scope.media;
    case "posts": return scope.wpContent;
    case "pages": return scope.wpContent;
    case "comments": return scope.comments;
    case "menus": return scope.menus;
    case "commerceCatalog": return scope.wooCatalog;
    case "commerceTransactions":
      return scope.wooCustomers || scope.wooOrders || scope.wooCoupons || scope.wooReviews;
    case "reconciliation": return true;
    case "cleanup": return scope.cleanup;
    default: return true;
  }
}

// ─── Finding Codes ────────────────────────────────────────────────────────

export const FINDING_CODES = {
  SLUG_COLLISION: "SLUG_COLLISION",
  SKU_COLLISION: "SKU_COLLISION",
  EMAIL_COLLISION: "EMAIL_COLLISION",
  ORDER_NUMBER_COLLISION: "ORDER_NUMBER_COLLISION",
  COUPON_CODE_COLLISION: "COUPON_CODE_COLLISION",
  MEDIA_URL_COLLISION: "MEDIA_URL_COLLISION",
  TAXONOMY_PATH_COLLISION: "TAXONOMY_PATH_COLLISION",
  MENU_HANDLE_COLLISION: "MENU_HANDLE_COLLISION",
  LOCAL_EDIT_CONFLICT: "LOCAL_EDIT_CONFLICT",
  SOURCE_OBJECT_MISSING: "SOURCE_OBJECT_MISSING",
  MISSING_RELATIONSHIP_TARGET: "MISSING_RELATIONSHIP_TARGET",
  ELEMENTOR_PARSE_FAILED: "ELEMENTOR_PARSE_FAILED",
  META_ENDPOINT_UNAVAILABLE: "META_ENDPOINT_UNAVAILABLE",
  UNRESOLVED_MEDIA_URL: "UNRESOLVED_MEDIA_URL",
  MEDIA_REWRITE_APPLIED: "MEDIA_REWRITE_APPLIED",
  ORDER_TOTAL_MISMATCH: "ORDER_TOTAL_MISMATCH",
  AUTH_FAILED: "AUTH_FAILED",
  CAPABILITY_MISSING: "CAPABILITY_MISSING",
  SOURCE_DATA_INVALID: "SOURCE_DATA_INVALID",
  RATE_LIMITED: "RATE_LIMITED",
} as const;

export type FindingCode = typeof FINDING_CODES[keyof typeof FINDING_CODES];

// ─── Adapter Config ───────────────────────────────────────────────────────

export interface AdapterConfig {
  siteUrl: string;
  username: string;
  password: string;
  wooKey?: string;
  wooSecret?: string;
  wooAuthMode: "shared" | "separate";
  metaEndpointPath?: string;
  retryCount?: number;
  batchSize?: number;
}

// ─── Create Site Args ──────────────────────────────────────────────────────

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const createSiteArgsValidator = v.object({
  name: v.string(),
  siteUrl: v.string(),
  username: v.string(),
  applicationPassword: v.string(),
});

// ─── Update Site Args ──────────────────────────────────────────────────────

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const updateSiteArgsValidator = v.object({
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  siteId: v.id("wordpressSites"),
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  name: v.optional(v.string()),
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  username: v.optional(v.string()),
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  applicationPassword: v.optional(v.string()),
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  status: v.optional(siteStatusValidator),
});

// ─── Batch Sizes ───────────────────────────────────────────────────────────

// Number of items to fetch per WordPress API request
export const WP_BATCH_SIZE = 100;

// Number of media items to process per batch (smaller due to downloads)
export const MEDIA_BATCH_SIZE = 25;

// Maximum errors per phase before stopping
export const MAX_PHASE_ERRORS = 50;

// Delay between batch operations (ms) to avoid overwhelming the API
export const BATCH_DELAY_MS = 100;

// ─── Helper Functions ──────────────────────────────────────────────────────

/**
 * Create initial progress object with all phases at zero.
 */
export function createInitialProgress(): Progress {
  return {
    users: { total: 0, imported: 0, failed: 0 },
    categories: { total: 0, imported: 0, failed: 0 },
    tags: { total: 0, imported: 0, failed: 0 },
    media: { total: 0, imported: 0, failed: 0 },
    posts: { total: 0, imported: 0, failed: 0 },
    pages: { total: 0, imported: 0, failed: 0 },
    comments: { total: 0, imported: 0, failed: 0 },
    menus: { total: 0, imported: 0, failed: 0 },
    commerceCatalog: { total: 0, imported: 0, failed: 0 },
    commerceTransactions: { total: 0, imported: 0, failed: 0 },
    reconciliation: { total: 0, imported: 0, failed: 0 },
    cleanup: { total: 0, imported: 0, failed: 0 },
  };
}

/**
 * Get the next phase in the sync process.
 */
export function getNextPhase(currentPhase: SyncPhase): SyncPhase | null {
  const currentIndex = PHASE_ORDER.indexOf(currentPhase);
  if (currentIndex === -1 || currentIndex === PHASE_ORDER.length - 1) {
    return null;
  }
  return PHASE_ORDER[currentIndex + 1];
}

/**
 * Calculate overall progress percentage.
 */
export function calculateOverallProgress(progress: Progress): number {
  const phases = Object.values(progress);
  let totalItems = 0;
  let completedItems = 0;

  for (const phase of phases) {
    totalItems += phase.total;
    completedItems += phase.imported + phase.failed;
  }

  if (totalItems === 0) return 0;
  return Math.round((completedItems / totalItems) * 100);
}

/**
 * Validate WordPress site URL format.
 */
export function validateSiteUrl(url: string): { valid: boolean; error?: string } {
  if (!url) {
    return { valid: false, error: "URL is required" };
  }

  try {
    const parsed = new URL(url);

    // Must be HTTPS (recommended for API auth)
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return { valid: false, error: "URL must use HTTP or HTTPS protocol" };
    }

    // Should not have a path beyond root (WP REST API is at /wp-json/)
    if (parsed.pathname !== "/" && parsed.pathname !== "") {
      return { valid: false, error: "URL should be the root domain (e.g., https://example.com)" };
    }

    return { valid: true };
  } catch {
    return { valid: false, error: "Invalid URL format" };
  }
}

/**
 * Normalize a WordPress site URL.
 */
export function normalizeSiteUrl(url: string): string {
  try {
    const parsed = new URL(url);
    // Return origin only (protocol + hostname + port)
    return parsed.origin;
  } catch {
    return url;
  }
}
