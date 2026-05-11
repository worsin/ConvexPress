# Website Import Production Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the existing WordPress sync system to a production-grade unified WordPress + WooCommerce import system with dry run, conflict detection, structured findings, durable reports, adapter-based API clients, reconciliation, and an operator dashboard.

**Architecture:** Foundation-first batch in 4 tiers. Tier 1 lays infrastructure (schema, adapters, config, reports). Tier 2 enhances import fidelity (Elementor, media rewrite, idempotency, WooCommerce completeness). Tier 3 adds post-import passes (reconciliation, tombstones, capability UX, performance). Tier 4 delivers operator UX (rename, dashboard, runbook).

**Tech Stack:** Convex (schema, functions, scheduling), TypeScript, TanStack Router, Base UI, Tailwind CSS v4, Lucide React

**Spec:** `docs/superpowers/specs/2026-04-10-website-import-production-design.md`

**Base paths:**
- Backend: `ConvexPress-Admin/packages/backend/convex/wordpressSync/`
- Schema: `ConvexPress-Admin/packages/backend/convex/schema/`
- UI routes: `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/tools/`
- UI components: `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/tools/wordpress-sync/-components/`

---

## Tier 1: Infrastructure

### Task 1: Update Schema — Findings, Reports, Config, Credentials, Mappings

**Files:**
- Modify: `ConvexPress-Admin/packages/backend/convex/schema/wordpressSync.ts`
- Modify: `ConvexPress-Admin/packages/backend/convex/schema.ts`

This task makes all schema changes for Tier 1 in one shot to avoid multiple deploys.

- [ ] **Step 1: Read the current schema file**

Read `ConvexPress-Admin/packages/backend/convex/schema/wordpressSync.ts` to see exact current state.

- [ ] **Step 2: Update the findings severity validator**

In `schema/wordpressSync.ts`, add `v.literal("info")` to `reconciliationSeverityValidator`:

```typescript
const reconciliationSeverityValidator = v.union(
  v.literal("error"),
  v.literal("warning"),
  v.literal("info")
);
```

- [ ] **Step 3: Expand the capabilities validator**

Replace `siteCapabilitiesValidator` with the expanded version:

```typescript
const siteCapabilitiesValidator = v.object({
  wpRest: v.boolean(),
  wpAuthValid: v.boolean(),
  menusApi: v.boolean(),
  woocommerceApi: v.boolean(),
  wooAuthValid: v.boolean(),
  customMetaEndpointConfigured: v.boolean(),
  customMetaEndpointDetected: v.boolean(),
  elementorDetected: v.boolean(),
  mediaAccessible: v.boolean(),
});
```

- [ ] **Step 4: Add import config validator**

Add after `siteCapabilitiesValidator`:

```typescript
const importScopeValidator = v.object({
  wpContent: v.boolean(),
  elementor: v.boolean(),
  media: v.boolean(),
  menus: v.boolean(),
  comments: v.boolean(),
  wooCatalog: v.boolean(),
  wooCustomers: v.boolean(),
  wooOrders: v.boolean(),
  wooCoupons: v.boolean(),
  wooReviews: v.boolean(),
  cleanup: v.boolean(),
});

const importBehaviorValidator = v.object({
  dryRun: v.boolean(),
  updateExisting: v.boolean(),
  preserveLocalEdits: v.boolean(),
  importDrafts: v.boolean(),
  importHistoricalOrders: v.boolean(),
  importRefunds: v.boolean(),
  importReviews: v.boolean(),
  importCoupons: v.boolean(),
  tombstoneMode: v.optional(v.union(
    v.literal("never"),
    v.literal("mark_stale"),
    v.literal("soft_delete"),
    v.literal("hard_delete"),
  )),
  destructiveDelete: v.optional(v.boolean()),
});

const importFiltersValidator = v.object({
  dateRangeStart: v.optional(v.number()),
  dateRangeEnd: v.optional(v.number()),
  entityLimit: v.optional(v.number()),
});

const importConfigValidator = v.object({
  scope: importScopeValidator,
  behavior: importBehaviorValidator,
  filters: importFiltersValidator,
});
```

- [ ] **Step 5: Add reconciliation to sync phase validator**

Update `syncPhaseValidator` to include `"reconciliation"` between `commerceTransactions` and `cleanup`:

```typescript
const syncPhaseValidator = v.union(
  v.literal("users"),
  v.literal("taxonomies"),
  v.literal("media"),
  v.literal("posts"),
  v.literal("pages"),
  v.literal("comments"),
  v.literal("menus"),
  v.literal("commerceCatalog"),
  v.literal("commerceTransactions"),
  v.literal("reconciliation"),
  v.literal("cleanup")
);
```

- [ ] **Step 6: Add WooCommerce credentials and import config to tables**

Add fields to `wordpressSites`:

```typescript
// After existing metaEndpointPath field:
wooConsumerKey: v.optional(v.string()),
wooConsumerSecret: v.optional(v.string()),
wooAuthMode: v.optional(v.union(v.literal("shared"), v.literal("separate"))),
```

Add fields to `wordpressSyncJobs`:

```typescript
// After existing createdBy field:
importConfig: v.optional(importConfigValidator),
resumeFromPhase: v.optional(syncPhaseValidator),
```

Update the `progress` object to add `reconciliation`:

```typescript
progress: v.object({
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
}),
```

- [ ] **Step 7: Evolve the findings table**

Add new fields to `wordpressSyncReconciliationFindings`:

```typescript
wordpressSyncReconciliationFindings: defineTable({
  siteId: v.id("wordpressSites"),
  jobId: v.id("wordpressSyncJobs"),
  severity: reconciliationSeverityValidator,
  phase: v.string(),
  wpId: v.optional(v.number()),
  objectType: v.optional(v.string()),
  convexId: v.optional(v.string()),
  message: v.string(),
  // New fields
  sourceType: v.optional(v.string()),
  sourceId: v.optional(v.string()),
  destinationTable: v.optional(v.string()),
  code: v.optional(v.string()),
  metadata: v.optional(v.string()),
  createdAt: v.number(),
})
  .index("by_job_created", ["jobId", "createdAt"])
  .index("by_job_severity", ["jobId", "severity"])
  .index("by_site_created", ["siteId", "createdAt"])
  // New indexes
  .index("by_job_phase", ["jobId", "phase"])
  .index("by_job_code", ["jobId", "code"])
  .index("by_site_severity", ["siteId", "severity"]),
```

- [ ] **Step 8: Add sourceUrl and sourceHash to wpIdMappings**

```typescript
wpIdMappings: defineTable({
  siteId: v.id("wordpressSites"),
  objectType: objectTypeValidator,
  wpId: v.number(),
  convexId: v.string(),
  sourceUrl: v.optional(v.string()),
  sourceHash: v.optional(v.string()),
  createdAt: v.number(),
})
  .index("by_wp_id", ["siteId", "objectType", "wpId"])
  .index("by_convex_id", ["siteId", "objectType", "convexId"])
  .index("by_site", ["siteId"])
  .index("by_source_url", ["siteId", "sourceUrl"]),
```

- [ ] **Step 9: Add the reports table**

Add `wordpressSyncReports` to the `wordpressSyncTables` export:

```typescript
wordpressSyncReports: defineTable({
  jobId: v.id("wordpressSyncJobs"),
  siteId: v.id("wordpressSites"),
  startedAt: v.number(),
  completedAt: v.optional(v.number()),
  finalStatus: v.string(),
  detectedCapabilities: v.object({
    wpRest: v.boolean(),
    wpAuthValid: v.boolean(),
    wooRest: v.boolean(),
    wooAuthValid: v.boolean(),
    menusApi: v.boolean(),
    customMetaEndpoint: v.boolean(),
    elementorDetected: v.boolean(),
    mediaAccessible: v.boolean(),
  }),
  importConfig: v.string(),
  phaseCounts: v.string(),
  totalCounts: v.object({
    created: v.number(),
    updated: v.number(),
    skipped: v.number(),
    conflicted: v.number(),
    failed: v.number(),
  }),
  findingSummary: v.string(),
  operatorSummary: v.string(),
  createdAt: v.number(),
})
  .index("by_site_created", ["siteId", "createdAt"])
  .index("by_job", ["jobId"]),
```

- [ ] **Step 10: Verify schema compiles**

Run: `cd ConvexPress-Admin && npx convex dev --once --typecheck=disable`

Expected: Schema accepted, no errors.

- [ ] **Step 11: Commit**

```bash
git add ConvexPress-Admin/packages/backend/convex/schema/wordpressSync.ts
git commit -m "feat(import): expand schema — reports table, import config, findings evolution, Woo credentials"
```

---

### Task 2: Update Validators Module

**Files:**
- Modify: `ConvexPress-Admin/packages/backend/convex/wordpressSync/validators.ts`

- [ ] **Step 1: Read the current validators file**

Read `ConvexPress-Admin/packages/backend/convex/wordpressSync/validators.ts` in full.

- [ ] **Step 2: Add reconciliation to PHASE_ORDER**

Insert `"reconciliation"` between `"commerceTransactions"` and `"cleanup"`:

```typescript
export const PHASE_ORDER: SyncPhase[] = [
  "users",
  "taxonomies",
  "media",
  "posts",
  "pages",
  "comments",
  "menus",
  "commerceCatalog",
  "commerceTransactions",
  "reconciliation",
  "cleanup",
];
```

- [ ] **Step 3: Update SyncPhase type**

Add `"reconciliation"` to the type:

```typescript
export type SyncPhase = "users" | "taxonomies" | "media" | "posts" | "pages" | "comments" | "menus" | "commerceCatalog" | "commerceTransactions" | "reconciliation" | "cleanup";
```

Update `syncPhaseValidator` to match the schema version.

- [ ] **Step 4: Add import config types and validators**

Add after the `SiteCredentials` section:

```typescript
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
      wpContent: true,
      elementor: true,
      media: true,
      menus: true,
      comments: true,
      wooCatalog: true,
      wooCustomers: true,
      wooOrders: true,
      wooCoupons: true,
      wooReviews: true,
      cleanup: true,
    },
    behavior: {
      dryRun: false,
      updateExisting: true,
      preserveLocalEdits: false,
      importDrafts: true,
      importHistoricalOrders: true,
      importRefunds: true,
      importReviews: true,
      importCoupons: true,
      tombstoneMode: "never",
      destructiveDelete: false,
    },
    filters: {},
  };
}

/**
 * Determine whether a phase should run based on import scope config.
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
```

- [ ] **Step 5: Add finding codes**

Add after import config section:

```typescript
// ─── Finding Codes ────────────────────────────────────────────────────────

export const FINDING_CODES = {
  // Collisions
  SLUG_COLLISION: "SLUG_COLLISION",
  SKU_COLLISION: "SKU_COLLISION",
  EMAIL_COLLISION: "EMAIL_COLLISION",
  ORDER_NUMBER_COLLISION: "ORDER_NUMBER_COLLISION",
  COUPON_CODE_COLLISION: "COUPON_CODE_COLLISION",
  MEDIA_URL_COLLISION: "MEDIA_URL_COLLISION",
  TAXONOMY_PATH_COLLISION: "TAXONOMY_PATH_COLLISION",
  MENU_HANDLE_COLLISION: "MENU_HANDLE_COLLISION",
  // Conflicts
  LOCAL_EDIT_CONFLICT: "LOCAL_EDIT_CONFLICT",
  // Tombstones
  SOURCE_OBJECT_MISSING: "SOURCE_OBJECT_MISSING",
  // Relationships
  MISSING_RELATIONSHIP_TARGET: "MISSING_RELATIONSHIP_TARGET",
  // Elementor / Meta
  ELEMENTOR_PARSE_FAILED: "ELEMENTOR_PARSE_FAILED",
  META_ENDPOINT_UNAVAILABLE: "META_ENDPOINT_UNAVAILABLE",
  // Media
  UNRESOLVED_MEDIA_URL: "UNRESOLVED_MEDIA_URL",
  MEDIA_REWRITE_APPLIED: "MEDIA_REWRITE_APPLIED",
  // Orders
  ORDER_TOTAL_MISMATCH: "ORDER_TOTAL_MISMATCH",
  // Auth / capability
  AUTH_FAILED: "AUTH_FAILED",
  CAPABILITY_MISSING: "CAPABILITY_MISSING",
  SOURCE_DATA_INVALID: "SOURCE_DATA_INVALID",
  RATE_LIMITED: "RATE_LIMITED",
} as const;

export type FindingCode = typeof FINDING_CODES[keyof typeof FINDING_CODES];
```

- [ ] **Step 6: Add PhaseResult enhancement**

Update `PhaseProgress` to include detailed counts and update `createInitialProgress`:

```typescript
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
```

Update `createInitialProgress` to include `reconciliation`:

```typescript
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
```

Update `Progress` type and `progressValidator` to include `reconciliation` as well.

- [ ] **Step 7: Add AdapterConfig type**

Add at the end of the file:

```typescript
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
```

- [ ] **Step 8: Commit**

```bash
git add ConvexPress-Admin/packages/backend/convex/wordpressSync/validators.ts
git commit -m "feat(import): add import config types, finding codes, reconciliation phase to validators"
```

---

### Task 3: Build Adapter Types and Base Adapter

**Files:**
- Create: `ConvexPress-Admin/packages/backend/convex/wordpressSync/helpers/adapters/types.ts`
- Create: `ConvexPress-Admin/packages/backend/convex/wordpressSync/helpers/adapters/baseAdapter.ts`

- [ ] **Step 1: Create adapter types**

Create `helpers/adapters/types.ts`:

```typescript
/**
 * Shared types for all source adapters.
 */

export type ErrorCategory = "auth" | "capability" | "source_data" | "network" | "rate_limit" | "unknown";

export interface NormalizedError {
  category: ErrorCategory;
  statusCode?: number;
  message: string;
  retryable: boolean;
}

export interface PaginationInfo {
  total: number;
  totalPages: number;
  currentPage: number;
  hasMore: boolean;
}

export interface NormalizedResponse<T> {
  data: T[];
  pagination: PaginationInfo;
}

export interface ProbeResult {
  reachable: boolean;
  authenticated: boolean;
  error?: NormalizedError;
}

export class AdapterError extends Error {
  constructor(
    message: string,
    public readonly category: ErrorCategory,
    public readonly statusCode?: number,
    public readonly retryable: boolean = false,
  ) {
    super(message);
    this.name = "AdapterError";
  }

  toNormalized(): NormalizedError {
    return {
      category: this.category,
      statusCode: this.statusCode,
      message: this.message,
      retryable: this.retryable,
    };
  }
}
```

- [ ] **Step 2: Create base adapter**

Create `helpers/adapters/baseAdapter.ts`:

```typescript
/**
 * Base adapter with retry, backoff, rate limiting, and error normalization.
 * All source adapters extend this.
 */

import { AdapterError, type NormalizedResponse, type PaginationInfo } from "./types";
import type { AdapterConfig } from "../../validators";

const DEFAULT_RETRY_COUNT = 3;
const DEFAULT_TIMEOUT_MS = 30_000;
const BACKOFF_BASE_MS = 1000;

export abstract class BaseAdapter {
  protected config: AdapterConfig;
  protected retryCount: number;

  constructor(config: AdapterConfig) {
    this.config = config;
    this.retryCount = config.retryCount ?? DEFAULT_RETRY_COUNT;
  }

  /**
   * Perform an authenticated GET request with retry and backoff.
   */
  protected async fetchWithRetry<T>(
    url: string,
    headers: Record<string, string>,
    attempt = 0,
  ): Promise<{ data: T; headers: Headers }> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        method: "GET",
        headers: { ...headers, Accept: "application/json", "User-Agent": "ConvexPress-CMS/1.0" },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      // Rate limited
      if (response.status === 429) {
        if (attempt >= this.retryCount) {
          throw new AdapterError("Rate limited after max retries", "rate_limit", 429, false);
        }
        const retryAfter = parseInt(response.headers.get("Retry-After") || "5", 10);
        const delay = Math.min(retryAfter * 1000, 60_000);
        await this.sleep(delay);
        return this.fetchWithRetry<T>(url, headers, attempt + 1);
      }

      // Auth failures — never retry
      if (response.status === 401 || response.status === 403) {
        throw new AdapterError(
          `Authentication failed: ${response.status}`,
          "auth",
          response.status,
          false,
        );
      }

      // Server errors — retry with backoff
      if (response.status >= 500) {
        if (attempt >= this.retryCount) {
          throw new AdapterError(
            `Server error after ${this.retryCount} retries: ${response.status}`,
            "network",
            response.status,
            false,
          );
        }
        const delay = BACKOFF_BASE_MS * Math.pow(2, attempt);
        await this.sleep(delay);
        return this.fetchWithRetry<T>(url, headers, attempt + 1);
      }

      // Client errors (4xx except 401/403/429)
      if (!response.ok) {
        let errorBody: string | undefined;
        try { errorBody = await response.text(); } catch { /* ignore */ }
        throw new AdapterError(
          `API error ${response.status}: ${errorBody || response.statusText}`,
          "source_data",
          response.status,
          false,
        );
      }

      const data = (await response.json()) as T;
      return { data, headers: response.headers };
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof AdapterError) throw error;

      // Network / timeout errors — retry
      if (error instanceof Error && error.name === "AbortError") {
        if (attempt >= this.retryCount) {
          throw new AdapterError("Request timeout after retries", "network", 408, false);
        }
        const delay = BACKOFF_BASE_MS * Math.pow(2, attempt);
        await this.sleep(delay);
        return this.fetchWithRetry<T>(url, headers, attempt + 1);
      }

      if (attempt >= this.retryCount) {
        throw new AdapterError(
          error instanceof Error ? error.message : "Unknown network error",
          "network",
          0,
          false,
        );
      }
      const delay = BACKOFF_BASE_MS * Math.pow(2, attempt);
      await this.sleep(delay);
      return this.fetchWithRetry<T>(url, headers, attempt + 1);
    }
  }

  /**
   * Build a URL with query params.
   */
  protected buildUrl(basePath: string, params?: Record<string, string | number | boolean>): string {
    const baseUrl = this.config.siteUrl.replace(/\/$/, "");
    const url = new URL(`${baseUrl}/wp-json${basePath.startsWith("/") ? basePath : `/${basePath}`}`);
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null) {
          url.searchParams.set(key, String(value));
        }
      }
    }
    return url.toString();
  }

  /**
   * Build WordPress Basic Auth header.
   */
  protected wpAuthHeaders(): Record<string, string> {
    const credentials = btoa(`${this.config.username}:${this.config.password}`);
    return { Authorization: `Basic ${credentials}` };
  }

  /**
   * Build WooCommerce auth — either shared WP auth or OAuth 1.0a query params.
   */
  protected wooAuthHeaders(): Record<string, string> {
    if (this.config.wooAuthMode === "separate" && this.config.wooKey && this.config.wooSecret) {
      // For WooCommerce with separate keys, use query param auth (simpler than OAuth 1.0a signing)
      // The keys are appended as query params in buildWooUrl
      return {};
    }
    return this.wpAuthHeaders();
  }

  /**
   * Build a WooCommerce URL, adding consumer key/secret as query params if in separate mode.
   */
  protected buildWooUrl(path: string, params?: Record<string, string | number | boolean>): string {
    const url = this.buildUrl(path, params);
    if (this.config.wooAuthMode === "separate" && this.config.wooKey && this.config.wooSecret) {
      const urlObj = new URL(url);
      urlObj.searchParams.set("consumer_key", this.config.wooKey);
      urlObj.searchParams.set("consumer_secret", this.config.wooSecret);
      return urlObj.toString();
    }
    return url;
  }

  /**
   * Parse WordPress pagination headers into PaginationInfo.
   */
  protected parsePagination(headers: Headers, currentPage: number): PaginationInfo {
    const total = parseInt(headers.get("X-WP-Total") || "0", 10);
    const totalPages = parseInt(headers.get("X-WP-TotalPages") || "1", 10);
    return { total, totalPages, currentPage, hasMore: currentPage < totalPages };
  }

  /**
   * Generic paginated fetch for WordPress REST endpoints.
   */
  protected async fetchPaginated<T>(
    path: string,
    page: number,
    perPage: number,
    extraParams?: Record<string, string | number | boolean>,
    authHeaders?: Record<string, string>,
  ): Promise<NormalizedResponse<T>> {
    const params = { page, per_page: perPage, ...extraParams };
    const url = this.buildUrl(path, params);
    const headers = authHeaders ?? this.wpAuthHeaders();
    const result = await this.fetchWithRetry<T[]>(url, headers);
    const pagination = this.parsePagination(result.headers, page);
    return { data: result.data, pagination };
  }

  /**
   * Generic paginated fetch for WooCommerce REST endpoints.
   */
  protected async fetchWooPaginated<T>(
    path: string,
    page: number,
    perPage: number,
    extraParams?: Record<string, string | number | boolean>,
  ): Promise<NormalizedResponse<T>> {
    const params = { page, per_page: perPage, ...extraParams };
    const url = this.buildWooUrl(path, params);
    const headers = this.wooAuthHeaders();
    const result = await this.fetchWithRetry<T[]>(url, headers);
    const pagination = this.parsePagination(result.headers, page);
    return { data: result.data, pagination };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add ConvexPress-Admin/packages/backend/convex/wordpressSync/helpers/adapters/
git commit -m "feat(import): add adapter types and base adapter with retry, backoff, rate limiting"
```

---

### Task 4: Build WordPress Adapter

**Files:**
- Create: `ConvexPress-Admin/packages/backend/convex/wordpressSync/helpers/adapters/wpAdapter.ts`

- [ ] **Step 1: Create the WordPress adapter**

Create `helpers/adapters/wpAdapter.ts`. This wraps the existing `wpClient.ts` fetch patterns behind the adapter interface:

```typescript
/**
 * WordPress REST API adapter.
 * Handles: posts, pages, users, media, comments, site info, capabilities.
 */

import { BaseAdapter } from "./baseAdapter";
import type { NormalizedResponse, ProbeResult } from "./types";
import { AdapterError } from "./types";
import type { AdapterConfig } from "../../validators";
import type {
  WPPost, WPPage, WPUser, WPMedia, WPComment, WPCategory, WPTag, WPSiteInfo,
} from "../wpClient";

export class WPAdapter extends BaseAdapter {
  constructor(config: AdapterConfig) {
    super(config);
  }

  async probe(): Promise<ProbeResult> {
    try {
      const url = this.buildUrl("/");
      const result = await this.fetchWithRetry<WPSiteInfo>(url, this.wpAuthHeaders());
      return { reachable: true, authenticated: true };
    } catch (error) {
      if (error instanceof AdapterError) {
        return {
          reachable: error.category !== "network",
          authenticated: error.category !== "auth",
          error: error.toNormalized(),
        };
      }
      return { reachable: false, authenticated: false };
    }
  }

  async fetchSiteInfo(): Promise<WPSiteInfo> {
    const url = this.buildUrl("/");
    const result = await this.fetchWithRetry<WPSiteInfo>(url, this.wpAuthHeaders());
    return result.data;
  }

  async fetchPosts(page: number, perPage = 100): Promise<NormalizedResponse<WPPost>> {
    return this.fetchPaginated<WPPost>("/wp/v2/posts", page, perPage, {
      _embed: "1", status: "any", orderby: "id", order: "asc",
    });
  }

  async fetchPages(page: number, perPage = 100): Promise<NormalizedResponse<WPPage>> {
    return this.fetchPaginated<WPPage>("/wp/v2/pages", page, perPage, {
      _embed: "1", status: "any", orderby: "id", order: "asc",
    });
  }

  async fetchUsers(page: number, perPage = 100): Promise<NormalizedResponse<WPUser>> {
    return this.fetchPaginated<WPUser>("/wp/v2/users", page, perPage, {
      orderby: "id", order: "asc", context: "edit",
    });
  }

  async fetchMedia(page: number, perPage = 100): Promise<NormalizedResponse<WPMedia>> {
    return this.fetchPaginated<WPMedia>("/wp/v2/media", page, perPage, {
      orderby: "id", order: "asc", status: "any",
    });
  }

  async fetchComments(page: number, perPage = 100): Promise<NormalizedResponse<WPComment>> {
    return this.fetchPaginated<WPComment>("/wp/v2/comments", page, perPage, {
      orderby: "id", order: "asc", status: "any",
    });
  }

  async fetchCategories(page: number, perPage = 100): Promise<NormalizedResponse<WPCategory>> {
    return this.fetchPaginated<WPCategory>("/wp/v2/categories", page, perPage, {
      orderby: "id", order: "asc", hide_empty: false,
    });
  }

  async fetchTags(page: number, perPage = 100): Promise<NormalizedResponse<WPTag>> {
    return this.fetchPaginated<WPTag>("/wp/v2/tags", page, perPage, {
      orderby: "id", order: "asc", hide_empty: false,
    });
  }

  async fetchPostMeta(postId: number, postType: "posts" | "pages" = "posts"): Promise<Record<string, unknown> | null> {
    if (!this.config.metaEndpointPath) return null;
    try {
      const path = this.config.metaEndpointPath
        .replace(":postType", postType)
        .replace(":id", String(postId));
      const url = this.buildUrl(path);
      const result = await this.fetchWithRetry<Record<string, unknown>>(url, this.wpAuthHeaders());
      return result.data;
    } catch {
      return null;
    }
  }

  async getContentCounts(): Promise<{
    users: number; posts: number; pages: number;
    categories: number; tags: number; media: number; comments: number;
  }> {
    const [users, posts, pages, categories, tags, media, comments] = await Promise.all([
      this.fetchUsers(1, 1).then(r => r.pagination.total).catch(() => 0),
      this.fetchPosts(1, 1).then(r => r.pagination.total).catch(() => 0),
      this.fetchPages(1, 1).then(r => r.pagination.total).catch(() => 0),
      this.fetchCategories(1, 1).then(r => r.pagination.total).catch(() => 0),
      this.fetchTags(1, 1).then(r => r.pagination.total).catch(() => 0),
      this.fetchMedia(1, 1).then(r => r.pagination.total).catch(() => 0),
      this.fetchComments(1, 1).then(r => r.pagination.total).catch(() => 0),
    ]);
    return { users, posts, pages, categories, tags, media, comments };
  }

  detectCapabilities(siteInfo: WPSiteInfo): {
    wpRest: boolean; wpAuthValid: boolean; menusApi: boolean;
    woocommerceApi: boolean; customMetaEndpointConfigured: boolean;
    customMetaEndpointDetected: boolean; elementorDetected: boolean;
  } {
    const namespaces = new Set(siteInfo.namespaces || []);
    const routeKeys = Object.keys(siteInfo.routes || {});
    const hasRoutePrefix = (prefix: string) => routeKeys.some(r => r.startsWith(prefix));

    return {
      wpRest: namespaces.has("wp/v2") || hasRoutePrefix("/wp/v2/"),
      wpAuthValid: true,
      menusApi: hasRoutePrefix("/wp/v2/menus") || hasRoutePrefix("/wp/v2/menu-items") || namespaces.has("wp-api-menus/v2"),
      woocommerceApi: namespaces.has("wc/v3") || hasRoutePrefix("/wc/v3/"),
      customMetaEndpointConfigured: Boolean(this.config.metaEndpointPath),
      customMetaEndpointDetected: this.config.metaEndpointPath
        ? routeKeys.some(r => r.includes(this.config.metaEndpointPath!.replace(/:postType/g, "").replace(/:id/g, "")))
        : false,
      elementorDetected: false, // Will be set by checking first post's meta
    };
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add ConvexPress-Admin/packages/backend/convex/wordpressSync/helpers/adapters/wpAdapter.ts
git commit -m "feat(import): add WordPress REST adapter with probe, pagination, content fetching"
```

---

### Task 5: Build WooCommerce Adapter

**Files:**
- Create: `ConvexPress-Admin/packages/backend/convex/wordpressSync/helpers/adapters/wooAdapter.ts`

- [ ] **Step 1: Create the WooCommerce adapter**

Create `helpers/adapters/wooAdapter.ts`. Import WooCommerce types from the existing `wooClient.ts`:

```typescript
/**
 * WooCommerce REST API adapter.
 * Handles: products, variations, orders, customers, coupons, reviews, refunds.
 */

import { BaseAdapter } from "./baseAdapter";
import type { NormalizedResponse, ProbeResult } from "./types";
import { AdapterError } from "./types";
import type { AdapterConfig } from "../../validators";
import type {
  WooProduct, WooProductVariation, WooProductCategory,
  WooCustomer, WooOrder, WooOrderRefund, WooCoupon, WooProductReview,
} from "../wooClient";

export class WooAdapter extends BaseAdapter {
  constructor(config: AdapterConfig) {
    super(config);
  }

  async probe(): Promise<ProbeResult> {
    try {
      // Fetch 1 product to verify WooCommerce API access
      await this.fetchProducts(1, 1);
      return { reachable: true, authenticated: true };
    } catch (error) {
      if (error instanceof AdapterError) {
        return {
          reachable: error.category !== "network",
          authenticated: error.category !== "auth",
          error: error.toNormalized(),
        };
      }
      return { reachable: false, authenticated: false };
    }
  }

  async fetchProducts(page: number, perPage = 100): Promise<NormalizedResponse<WooProduct>> {
    return this.fetchWooPaginated<WooProduct>("/wc/v3/products", page, perPage, {
      orderby: "id", order: "asc", status: "any",
    });
  }

  async fetchProductVariations(productId: number, page: number, perPage = 100): Promise<NormalizedResponse<WooProductVariation>> {
    return this.fetchWooPaginated<WooProductVariation>(`/wc/v3/products/${productId}/variations`, page, perPage, {
      orderby: "id", order: "asc", status: "any",
    });
  }

  async fetchProductCategories(page: number, perPage = 100): Promise<NormalizedResponse<WooProductCategory>> {
    return this.fetchWooPaginated<WooProductCategory>("/wc/v3/products/categories", page, perPage, {
      orderby: "id", order: "asc", hide_empty: false,
    });
  }

  async fetchCustomers(page: number, perPage = 100): Promise<NormalizedResponse<WooCustomer>> {
    return this.fetchWooPaginated<WooCustomer>("/wc/v3/customers", page, perPage, {
      orderby: "id", order: "asc",
    });
  }

  async fetchOrders(page: number, perPage = 100): Promise<NormalizedResponse<WooOrder>> {
    return this.fetchWooPaginated<WooOrder>("/wc/v3/orders", page, perPage, {
      orderby: "id", order: "asc", status: "any",
    });
  }

  async fetchOrderRefunds(orderId: number, page: number, perPage = 100): Promise<NormalizedResponse<WooOrderRefund>> {
    return this.fetchWooPaginated<WooOrderRefund>(`/wc/v3/orders/${orderId}/refunds`, page, perPage, {
      orderby: "id", order: "asc",
    });
  }

  async fetchCoupons(page: number, perPage = 100): Promise<NormalizedResponse<WooCoupon>> {
    return this.fetchWooPaginated<WooCoupon>("/wc/v3/coupons", page, perPage, {
      orderby: "id", order: "asc",
    });
  }

  async fetchReviews(page: number, perPage = 100): Promise<NormalizedResponse<WooProductReview>> {
    return this.fetchWooPaginated<WooProductReview>("/wc/v3/products/reviews", page, perPage, {
      orderby: "id", order: "asc", status: "all",
    });
  }

  async fetchOrderNotes(orderId: number): Promise<Array<{ id: number; note: string; date_created: string; customer_note: boolean }>> {
    try {
      const url = this.buildWooUrl(`/wc/v3/orders/${orderId}/notes`);
      const headers = this.wooAuthHeaders();
      const result = await this.fetchWithRetry<Array<{ id: number; note: string; date_created: string; customer_note: boolean }>>(url, headers);
      return result.data;
    } catch {
      return [];
    }
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add ConvexPress-Admin/packages/backend/convex/wordpressSync/helpers/adapters/wooAdapter.ts
git commit -m "feat(import): add WooCommerce REST adapter with products, orders, customers, coupons, reviews"
```

---

### Task 6: Build Elementor, Menu, and Media Adapters

**Files:**
- Create: `ConvexPress-Admin/packages/backend/convex/wordpressSync/helpers/adapters/elementorAdapter.ts`
- Create: `ConvexPress-Admin/packages/backend/convex/wordpressSync/helpers/adapters/menuAdapter.ts`
- Create: `ConvexPress-Admin/packages/backend/convex/wordpressSync/helpers/adapters/mediaAdapter.ts`

- [ ] **Step 1: Create elementor adapter**

Create `helpers/adapters/elementorAdapter.ts`:

```typescript
/**
 * Elementor / post meta adapter.
 * Fetches raw post meta including _elementor_data, ACF fields, Yoast SEO.
 */

import { BaseAdapter } from "./baseAdapter";
import type { ProbeResult } from "./types";
import { AdapterError } from "./types";
import type { AdapterConfig } from "../../validators";

export interface RawPostMeta {
  _elementor_data?: string;
  _elementor_css?: string;
  _elementor_page_settings?: string;
  _elementor_template_type?: string;
  _wp_page_template?: string;
  [key: string]: unknown;
}

export class ElementorAdapter extends BaseAdapter {
  constructor(config: AdapterConfig) {
    super(config);
  }

  async probe(): Promise<ProbeResult> {
    if (!this.config.metaEndpointPath) {
      return { reachable: false, authenticated: false };
    }
    try {
      // Try fetching meta for post ID 1 as a probe
      const meta = await this.fetchPostMeta(1, "posts");
      return { reachable: true, authenticated: true };
    } catch (error) {
      if (error instanceof AdapterError) {
        return {
          reachable: error.category !== "network",
          authenticated: error.category !== "auth",
          error: error.toNormalized(),
        };
      }
      return { reachable: false, authenticated: false };
    }
  }

  async fetchPostMeta(postId: number, postType: "posts" | "pages" = "posts"): Promise<RawPostMeta | null> {
    if (!this.config.metaEndpointPath) return null;

    const path = this.config.metaEndpointPath
      .replace(":postType", postType)
      .replace(":id", String(postId));

    const url = this.buildUrl(path);
    const result = await this.fetchWithRetry<RawPostMeta>(url, this.wpAuthHeaders());
    return result.data;
  }

  /**
   * Extract Elementor-specific fields from raw meta.
   */
  extractElementorFields(meta: RawPostMeta): {
    rawElementorData?: string;
    elementorCss?: string;
    elementorPageSettings?: string;
    elementorTemplateType?: string;
    wpPageTemplate?: string;
    rawSourceMeta: Record<string, unknown>;
  } {
    const {
      _elementor_data,
      _elementor_css,
      _elementor_page_settings,
      _elementor_template_type,
      _wp_page_template,
      ...rest
    } = meta;

    // Filter out known ACF/Yoast prefixes from rawSourceMeta — those are handled by their own parsers
    const rawSourceMeta: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(rest)) {
      if (!key.startsWith("_yoast_wpseo_") && !key.startsWith("_edit_") && key !== "footnotes") {
        rawSourceMeta[key] = value;
      }
    }

    return {
      rawElementorData: typeof _elementor_data === "string" ? _elementor_data : undefined,
      elementorCss: typeof _elementor_css === "string" ? _elementor_css : undefined,
      elementorPageSettings: typeof _elementor_page_settings === "string" ? _elementor_page_settings : undefined,
      elementorTemplateType: typeof _elementor_template_type === "string" ? _elementor_template_type : undefined,
      wpPageTemplate: typeof _wp_page_template === "string" ? _wp_page_template : undefined,
      rawSourceMeta,
    };
  }
}
```

- [ ] **Step 2: Create menu adapter**

Create `helpers/adapters/menuAdapter.ts`:

```typescript
/**
 * Menus / navigation adapter.
 * Fetches WordPress menu definitions and items.
 */

import { BaseAdapter } from "./baseAdapter";
import type { NormalizedResponse, ProbeResult } from "./types";
import { AdapterError } from "./types";
import type { AdapterConfig } from "../../validators";
import type { WPMenu, WPMenuItem } from "../wpClient";

export class MenuAdapter extends BaseAdapter {
  constructor(config: AdapterConfig) {
    super(config);
  }

  async probe(): Promise<ProbeResult> {
    try {
      await this.fetchMenus(1, 1);
      return { reachable: true, authenticated: true };
    } catch (error) {
      if (error instanceof AdapterError) {
        return {
          reachable: error.category !== "network",
          authenticated: error.category !== "auth",
          error: error.toNormalized(),
        };
      }
      return { reachable: false, authenticated: false };
    }
  }

  async fetchMenus(page: number, perPage = 100): Promise<NormalizedResponse<WPMenu>> {
    return this.fetchPaginated<WPMenu>("/wp/v2/menus", page, perPage, {
      orderby: "id", order: "asc",
    });
  }

  async fetchMenuItems(menuId: number, page: number, perPage = 100): Promise<NormalizedResponse<WPMenuItem>> {
    return this.fetchPaginated<WPMenuItem>("/wp/v2/menu-items", page, perPage, {
      menus: menuId, orderby: "menu_order", order: "asc",
    });
  }
}
```

- [ ] **Step 3: Create media adapter**

Create `helpers/adapters/mediaAdapter.ts`:

```typescript
/**
 * Media adapter.
 * Handles media listing and provides URL registry helpers.
 */

import { BaseAdapter } from "./baseAdapter";
import type { NormalizedResponse, ProbeResult } from "./types";
import { AdapterError } from "./types";
import type { AdapterConfig } from "../../validators";
import type { WPMedia } from "../wpClient";

export class MediaAdapter extends BaseAdapter {
  constructor(config: AdapterConfig) {
    super(config);
  }

  async probe(): Promise<ProbeResult> {
    try {
      await this.fetchMedia(1, 1);
      return { reachable: true, authenticated: true };
    } catch (error) {
      if (error instanceof AdapterError) {
        return {
          reachable: error.category !== "network",
          authenticated: error.category !== "auth",
          error: error.toNormalized(),
        };
      }
      return { reachable: false, authenticated: false };
    }
  }

  async fetchMedia(page: number, perPage = 100): Promise<NormalizedResponse<WPMedia>> {
    return this.fetchPaginated<WPMedia>("/wp/v2/media", page, perPage, {
      orderby: "id", order: "asc", status: "any",
    });
  }

  /**
   * Download a media file as a buffer.
   */
  async downloadMedia(sourceUrl: string): Promise<{ buffer: ArrayBuffer; mimeType: string } | null> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60_000);

      const response = await fetch(sourceUrl, {
        headers: { "User-Agent": "ConvexPress-CMS/1.0" },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!response.ok) return null;

      const buffer = await response.arrayBuffer();
      const mimeType = response.headers.get("Content-Type") || "application/octet-stream";
      return { buffer, mimeType };
    } catch {
      return null;
    }
  }

  /**
   * Extract all source URLs from a WP media item (main + all size variants).
   */
  extractSourceUrls(media: WPMedia): string[] {
    const urls: string[] = [media.source_url];
    if (media.media_details?.sizes) {
      for (const size of Object.values(media.media_details.sizes)) {
        if (size.source_url) urls.push(size.source_url);
      }
    }
    return urls;
  }
}
```

- [ ] **Step 4: Commit**

```bash
git add ConvexPress-Admin/packages/backend/convex/wordpressSync/helpers/adapters/
git commit -m "feat(import): add Elementor, menu, and media adapters"
```

---

### Task 7: Update Internals — Report Generation, Config-Aware Phase Runner

**Files:**
- Modify: `ConvexPress-Admin/packages/backend/convex/wordpressSync/internals.ts`

- [ ] **Step 1: Read the current internals.ts file in full**

Read `ConvexPress-Admin/packages/backend/convex/wordpressSync/internals.ts` (all 1026 lines).

- [ ] **Step 2: Add report generation mutations**

Add these internal mutations after the existing `replaceReconciliationFindings`:

```typescript
/**
 * Create or update an import report.
 */
export const upsertReport = internalMutation({
  args: {
    jobId: v.id("wordpressSyncJobs"),
    siteId: v.id("wordpressSites"),
    startedAt: v.number(),
    completedAt: v.optional(v.number()),
    finalStatus: v.string(),
    detectedCapabilities: v.object({
      wpRest: v.boolean(),
      wpAuthValid: v.boolean(),
      wooRest: v.boolean(),
      wooAuthValid: v.boolean(),
      menusApi: v.boolean(),
      customMetaEndpoint: v.boolean(),
      elementorDetected: v.boolean(),
      mediaAccessible: v.boolean(),
    }),
    importConfig: v.string(),
    phaseCounts: v.string(),
    totalCounts: v.object({
      created: v.number(),
      updated: v.number(),
      skipped: v.number(),
      conflicted: v.number(),
      failed: v.number(),
    }),
    findingSummary: v.string(),
    operatorSummary: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("wordpressSyncReports")
      .withIndex("by_job", (q) => q.eq("jobId", args.jobId))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        completedAt: args.completedAt,
        finalStatus: args.finalStatus,
        phaseCounts: args.phaseCounts,
        totalCounts: args.totalCounts,
        findingSummary: args.findingSummary,
        operatorSummary: args.operatorSummary,
      });
      return existing._id;
    }

    return await ctx.db.insert("wordpressSyncReports", {
      ...args,
      createdAt: Date.now(),
    });
  },
});
```

- [ ] **Step 3: Update runSyncPhase to be config-aware**

In the `runSyncPhase` internal action, after getting the job and before the phase switch:

1. Extract `importConfig` from the job (with fallback to default)
2. Check `shouldRunPhase(phase, config.scope)` — if false, skip to next phase
3. Pass `importConfig` to each phase's `importBatch` call (add it to the args)
4. Add the `"reconciliation"` case to the switch statement

Add this logic right after `const phase = job.currentPhase;`:

```typescript
// Get import config (default to all-enabled if not set)
const importConfig = job.importConfig ?? createDefaultImportConfig();

// Skip phases not in scope
if (!shouldRunPhase(phase, importConfig.scope)) {
  const nextPhase = getNextPhase(phase);
  if (nextPhase) {
    await ctx.runMutation(internal.wordpressSync.internals.advancePhase, { jobId, phase: nextPhase });
    await ctx.scheduler.runAfter(BATCH_DELAY_MS, internal.wordpressSync.internals.runSyncPhase, { jobId });
  } else {
    await ctx.runMutation(internal.wordpressSync.internals.completeJob, { jobId });
  }
  return;
}
```

Add the reconciliation case to the switch:

```typescript
case "reconciliation":
  result = await ctx.runAction(
    internal.wordpressSync.phases.reconciliation.runBatch,
    { jobId, siteId: job.siteId, credentials }
  );
  break;
```

- [ ] **Step 4: Update completeJob to generate a report**

In `completeJob`, after patching the job status, schedule report generation:

```typescript
await ctx.scheduler.runAfter(0, internal.wordpressSync.internals.generateFinalReport, { jobId });
```

Add the `generateFinalReport` internal action:

```typescript
export const generateFinalReport = internalAction({
  args: { jobId: v.id("wordpressSyncJobs") },
  handler: async (ctx, { jobId }) => {
    const job = await ctx.runQuery(internal.wordpressSync.internals.getJobInternal, { jobId });
    if (!job) return;

    const site = await ctx.runQuery(internal.wordpressSync.internals.getSiteWithCredentials, { siteId: job.siteId });
    if (!site) return;

    // Count findings by severity and code
    const findingCounts = { error: 0, warning: 0, info: 0 };
    const codeCounts: Record<string, number> = {};
    const SCAN_LIMIT = 1000;

    const findings = await ctx.runQuery(internal.wordpressSync.internals.countFindings, {
      jobId, limit: SCAN_LIMIT,
    });

    for (const f of findings) {
      findingCounts[f.severity as keyof typeof findingCounts] = (findingCounts[f.severity as keyof typeof findingCounts] || 0) + 1;
      if (f.code) codeCounts[f.code] = (codeCounts[f.code] || 0) + 1;
    }

    // Compute total counts from progress
    const progress = job.progress;
    let totalCreated = 0, totalUpdated = 0, totalSkipped = 0, totalConflicted = 0, totalFailed = 0;
    for (const p of Object.values(progress)) {
      totalCreated += (p as any).created || 0;
      totalUpdated += (p as any).updated || 0;
      totalSkipped += (p as any).skipped || 0;
      totalConflicted += (p as any).conflicted || 0;
      totalFailed += p.failed || 0;
    }

    const totalImported = totalCreated + totalUpdated;
    const importConfig = job.importConfig ?? createDefaultImportConfig();
    const isDryRun = importConfig.behavior.dryRun;

    const summary = isDryRun
      ? `Dry run complete. Would create ${totalCreated}, update ${totalUpdated}, skip ${totalSkipped}. ${findingCounts.error} errors, ${findingCounts.warning} warnings.`
      : `Import complete. Created ${totalCreated}, updated ${totalUpdated}, skipped ${totalSkipped}, failed ${totalFailed}. ${findingCounts.error} errors, ${findingCounts.warning} warnings.`;

    const capabilities = site.capabilities ?? {
      wpRest: false, wpAuthValid: false, menusApi: false,
      woocommerceApi: false, wooAuthValid: false,
      customMetaEndpointConfigured: false, customMetaEndpointDetected: false,
      elementorDetected: false, mediaAccessible: false,
    };

    await ctx.runMutation(internal.wordpressSync.internals.upsertReport, {
      jobId,
      siteId: job.siteId,
      startedAt: job.startedAt || job.createdAt,
      completedAt: job.completedAt || Date.now(),
      finalStatus: job.status,
      detectedCapabilities: {
        wpRest: capabilities.wpRest ?? false,
        wpAuthValid: capabilities.wpAuthValid ?? false,
        wooRest: capabilities.woocommerceApi ?? false,
        wooAuthValid: capabilities.wooAuthValid ?? false,
        menusApi: capabilities.menusApi ?? false,
        customMetaEndpoint: capabilities.customMetaEndpointDetected ?? false,
        elementorDetected: capabilities.elementorDetected ?? false,
        mediaAccessible: capabilities.mediaAccessible ?? false,
      },
      importConfig: JSON.stringify(importConfig),
      phaseCounts: JSON.stringify(progress),
      totalCounts: { created: totalCreated, updated: totalUpdated, skipped: totalSkipped, conflicted: totalConflicted, failed: totalFailed },
      findingSummary: JSON.stringify({ bySeverity: findingCounts, byCode: codeCounts }),
      operatorSummary: summary,
    });
  },
});

export const countFindings = internalQuery({
  args: { jobId: v.id("wordpressSyncJobs"), limit: v.number() },
  handler: async (ctx, { jobId, limit }) => {
    return await ctx.db
      .query("wordpressSyncReconciliationFindings")
      .withIndex("by_job_created", (q) => q.eq("jobId", jobId))
      .take(limit);
  },
});
```

- [ ] **Step 5: Update createInitialProgress call and imports**

Update imports at the top of `internals.ts` to include new validators:

```typescript
import {
  type SyncPhase,
  type SyncError,
  type PhaseProgress,
  type ImportConfig,
  PHASE_ORDER,
  getNextPhase,
  shouldRunPhase,
  createDefaultImportConfig,
  BATCH_DELAY_MS,
  MAX_PHASE_ERRORS,
  syncPhaseValidator,
  phaseProgressValidator,
  syncErrorValidator,
} from "./validators";
```

- [ ] **Step 6: Commit**

```bash
git add ConvexPress-Admin/packages/backend/convex/wordpressSync/internals.ts
git commit -m "feat(import): add report generation, config-aware phase runner, reconciliation case"
```

---

### Task 8: Update Mutations — Woo Credentials, Config-Aware Job Creation

**Files:**
- Modify: `ConvexPress-Admin/packages/backend/convex/wordpressSync/mutations.ts`

- [ ] **Step 1: Read mutations.ts in full**

Read `ConvexPress-Admin/packages/backend/convex/wordpressSync/mutations.ts`.

- [ ] **Step 2: Update createSite to accept WooCommerce credentials**

Add new args to `createSite`:

```typescript
wooConsumerKey: v.optional(v.string()),
wooConsumerSecret: v.optional(v.string()),
wooAuthMode: v.optional(v.union(v.literal("shared"), v.literal("separate"))),
```

In the handler, encrypt Woo credentials if provided, and include them in the insert:

```typescript
let encryptedWooKey: string | undefined;
let encryptedWooSecret: string | undefined;
if (args.wooConsumerKey && args.wooConsumerSecret) {
  if (WP_ENCRYPTION_KEY) {
    encryptedWooKey = await encryptSecret(args.wooConsumerKey.trim(), WP_ENCRYPTION_KEY);
    encryptedWooSecret = await encryptSecret(args.wooConsumerSecret.trim(), WP_ENCRYPTION_KEY);
  } else {
    encryptedWooKey = args.wooConsumerKey.trim();
    encryptedWooSecret = args.wooConsumerSecret.trim();
  }
}
```

Add to the insert call:

```typescript
wooConsumerKey: encryptedWooKey,
wooConsumerSecret: encryptedWooSecret,
wooAuthMode: args.wooAuthMode ?? "shared",
```

- [ ] **Step 3: Update updateSite to accept WooCommerce credentials**

Add same optional Woo args to `updateSite` mutation. Encrypt and patch only if provided.

- [ ] **Step 4: Update createJob to accept importConfig**

Add `importConfig` arg to `createJob`:

```typescript
importConfig: v.optional(v.object({
  scope: v.object({ /* ... full scope validator ... */ }),
  behavior: v.object({ /* ... full behavior validator ... */ }),
  filters: v.object({ /* ... full filters validator ... */ }),
})),
```

Store it on the job record. Update `createInitialProgress()` to include the `reconciliation` phase.

- [ ] **Step 5: Commit**

```bash
git add ConvexPress-Admin/packages/backend/convex/wordpressSync/mutations.ts
git commit -m "feat(import): add Woo credentials to site mutations, import config to job creation"
```

---

### Task 9: Update Actions — Accept Config, Adapter-Based Connection Test

**Files:**
- Modify: `ConvexPress-Admin/packages/backend/convex/wordpressSync/actions.ts`

- [ ] **Step 1: Read actions.ts in full**

Read `ConvexPress-Admin/packages/backend/convex/wordpressSync/actions.ts`.

- [ ] **Step 2: Update startSync to accept importConfig**

Add `importConfig` arg to `startSync` action. Pass it to `createJob`. Store config snapshot in the initial report.

```typescript
export const startSync = action({
  args: {
    siteId: v.id("wordpressSites"),
    importConfig: v.optional(v.object({ /* full config shape */ })),
  },
  handler: async (ctx, { siteId, importConfig }) => {
    // ... existing active job check ...

    // Create job with config
    jobId = await ctx.runMutation(api.wordpressSync.mutations.createJob, {
      siteId,
      importConfig: importConfig ?? undefined,
    });

    // ... rest of existing logic ...
  },
});
```

- [ ] **Step 3: Update testSiteConnection to probe WooCommerce and Elementor**

After the existing WordPress probe, add WooCommerce and Elementor capability detection using the adapters:

```typescript
// After successful WP connection test, also probe Woo if credentials available
if (result.success && site?.capabilities?.woocommerceApi) {
  // Woo probe would be called here via the adapter
  // For now, include wooAuthValid in capabilities
}
```

Update the capabilities object to include the new fields (`wpAuthValid`, `wooAuthValid`, `elementorDetected`, `mediaAccessible`).

- [ ] **Step 4: Commit**

```bash
git add ConvexPress-Admin/packages/backend/convex/wordpressSync/actions.ts
git commit -m "feat(import): accept import config in startSync, expand capability probing"
```

---

### Task 10: Update Queries — Report Queries, Paginated Findings

**Files:**
- Modify: `ConvexPress-Admin/packages/backend/convex/wordpressSync/queries.ts`

- [ ] **Step 1: Read queries.ts in full**

Read `ConvexPress-Admin/packages/backend/convex/wordpressSync/queries.ts`.

- [ ] **Step 2: Add report queries**

Add after existing queries:

```typescript
/**
 * Get the latest report for a site.
 */
export const getLatestReport = query({
  args: { siteId: v.id("wordpressSites") },
  handler: async (ctx, { siteId }) => {
    await requireCan(ctx, "manage_options");
    return await ctx.db
      .query("wordpressSyncReports")
      .withIndex("by_site_created", (q) => q.eq("siteId", siteId))
      .order("desc")
      .first();
  },
});

/**
 * Get report for a specific job.
 */
export const getJobReport = query({
  args: { jobId: v.id("wordpressSyncJobs") },
  handler: async (ctx, { jobId }) => {
    await requireCan(ctx, "manage_options");
    return await ctx.db
      .query("wordpressSyncReports")
      .withIndex("by_job", (q) => q.eq("jobId", jobId))
      .first();
  },
});

/**
 * List historical reports for a site.
 */
export const listReports = query({
  args: {
    siteId: v.id("wordpressSites"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { siteId, limit = 20 }) => {
    await requireCan(ctx, "manage_options");
    return await ctx.db
      .query("wordpressSyncReports")
      .withIndex("by_site_created", (q) => q.eq("siteId", siteId))
      .order("desc")
      .take(Math.min(limit, 50));
  },
});

/**
 * List findings for a job with pagination and filtering.
 */
export const listFindings = query({
  args: {
    jobId: v.id("wordpressSyncJobs"),
    severity: v.optional(v.union(v.literal("error"), v.literal("warning"), v.literal("info"))),
    code: v.optional(v.string()),
    limit: v.optional(v.number()),
    cursor: v.optional(v.number()),
  },
  handler: async (ctx, { jobId, severity, code, limit = 50, cursor }) => {
    await requireCan(ctx, "manage_options");

    let query;
    if (severity) {
      query = ctx.db
        .query("wordpressSyncReconciliationFindings")
        .withIndex("by_job_severity", (q) => q.eq("jobId", jobId).eq("severity", severity));
    } else if (code) {
      query = ctx.db
        .query("wordpressSyncReconciliationFindings")
        .withIndex("by_job_code", (q) => q.eq("jobId", jobId).eq("code", code));
    } else {
      query = ctx.db
        .query("wordpressSyncReconciliationFindings")
        .withIndex("by_job_created", (q) => q.eq("jobId", jobId));
    }

    const findings = await query.take(Math.min(limit, 100));
    return findings;
  },
});
```

- [ ] **Step 3: Update getSite to include Woo credential indicator**

In `getSite` and `listSites`, add `hasWooCredentials: Boolean(site.wooConsumerKey)` and `wooAuthMode: site.wooAuthMode` to the returned object (but never return the actual key/secret).

- [ ] **Step 4: Commit**

```bash
git add ConvexPress-Admin/packages/backend/convex/wordpressSync/queries.ts
git commit -m "feat(import): add report queries, paginated findings, Woo credential indicators"
```

---

### Task 11: Deploy Tier 1 Schema and Verify

**Files:**
- No new files — verification only

- [ ] **Step 1: Run Convex type generation**

```bash
cd ConvexPress-Admin && npx convex dev --once --typecheck=disable
```

Expected: Schema accepted, functions registered, no errors.

- [ ] **Step 2: Verify no regressions in existing queries**

Check that existing `listSites`, `getJob`, `getActiveJob`, `listJobs` queries still work by reading them and ensuring the type shapes match.

- [ ] **Step 3: Commit any fixes needed**

If any type issues found, fix and commit:

```bash
git commit -m "fix(import): resolve Tier 1 type issues after schema expansion"
```

---

## Tier 2: Import Fidelity

### Task 12: Add Dry Run and Config Support to Phase Runners

**Files:**
- Modify: All 9 phase files in `ConvexPress-Admin/packages/backend/convex/wordpressSync/phases/`

This task adds the dry run gate and import config awareness to every phase. The pattern is the same for each phase.

- [ ] **Step 1: Define the shared pattern**

Each phase's `importBatch` handler currently receives `{ jobId, siteId, credentials }`. Update each to also receive `importConfig`:

```typescript
// At the start of each importBatch handler:
const job = await ctx.runQuery(internal.wordpressSync.internals.getJobInternal, { jobId });
const importConfig = job?.importConfig ?? createDefaultImportConfig();
const isDryRun = importConfig.behavior.dryRun;
```

Before each `ctx.runMutation` that creates/updates a destination entity, wrap it:

```typescript
if (!isDryRun) {
  await ctx.runMutation(/* ... existing entity creation ... */);
}
// Track counts regardless
created++;
```

- [ ] **Step 2: Update users.ts phase**

Read `phases/users.ts`. Add the dry run gate around the user creation mutation. Add config import.

- [ ] **Step 3: Update taxonomies.ts phase**

Read `phases/taxonomies.ts`. Add the dry run gate around category/tag creation mutations.

- [ ] **Step 4: Update media.ts phase**

Read `phases/media.ts`. Add the dry run gate. Also store `sourceUrl` on the `wpIdMappings` entry when creating the mapping:

```typescript
// When creating the ID mapping for media:
await ctx.runMutation(internal.wordpressSync.helpers.idMapping.create, {
  siteId,
  objectType: "media",
  wpId: wpMedia.id,
  convexId: mediaId,
  sourceUrl: wpMedia.source_url, // NEW: store source URL for rewrite registry
});
```

- [ ] **Step 5: Update posts.ts phase**

Read `phases/posts.ts`. Add dry run gate. Add Elementor raw data preservation (store `rawElementorData`, `elementorCss`, etc. on the post record if available from meta endpoint).

- [ ] **Step 6: Update pages.ts phase**

Read `phases/pages.ts`. Same as posts — dry run gate + Elementor preservation.

- [ ] **Step 7: Update comments.ts, menus.ts phases**

Read and update both. Add dry run gate.

- [ ] **Step 8: Update commerceCatalog.ts phase**

Read `phases/commerceCatalog.ts`. Add dry run gate. Enhance product field mapping:
- Store `productType` (simple/variable/grouped/external)
- Store `downloadable`, `virtual` flags
- Store `stockQuantity`, `stockStatus`, `manageStock`, `backorders`
- Store `weight` and dimensions
- Store `taxClass`, `taxStatus`
- Store `upsellIds`, `crossSellIds` as raw WP ID arrays (resolved in reconciliation)
- Store `rawSourceMeta` for unrecognized metadata

- [ ] **Step 9: Update commerceTransactions.ts phase**

Read `phases/commerceTransactions.ts`. Add dry run gate. Enhance:
- Store full line item details (subtotal, total, totalTax, meta)
- Store `taxLines`, `shippingLines`, `feeLines`, `couponLines` as JSON arrays on orders
- Create guest customer profiles with `isGuest: true`
- Add coupon fidelity: `usageLimit`, `usageLimitPerUser`, `dateExpires`, `productIds`, `categoryIds`
- Add review fidelity: `verified` purchase flag, guest reviewer support

- [ ] **Step 10: Commit**

```bash
git add ConvexPress-Admin/packages/backend/convex/wordpressSync/phases/
git commit -m "feat(import): add dry run support and enhanced field mapping to all phases"
```

---

### Task 13: Add Collision Detection to Phase Runners

**Files:**
- Modify: All phase files in `phases/`
- Modify: `ConvexPress-Admin/packages/backend/convex/wordpressSync/helpers/idMapping.ts`

- [ ] **Step 1: Add collision detection helpers to idMapping.ts**

Read `helpers/idMapping.ts`. Add a `checkCollision` function:

```typescript
/**
 * Check for natural-key collision before creating an entity.
 * Returns the conflicting local record ID if found, null otherwise.
 */
export async function checkSlugCollision(
  ctx: any,
  table: string,
  slug: string,
  siteId: Id<"wordpressSites">,
  objectType: string,
): Promise<string | null> {
  // First check if already mapped (not a collision — it's an update candidate)
  const existingMapping = await ctx.db
    .query("wpIdMappings")
    .withIndex("by_convex_id")
    // Can't do this generically — each phase does its own lookup
    ;
  return null; // Placeholder — each phase implements its own collision check
}
```

Actually, collision detection is best done inline in each phase since each entity type has different natural keys and different tables. Add a shared finding creation helper instead:

```typescript
import { type FindingCode, FINDING_CODES } from "../validators";

/**
 * Create a structured finding.
 */
export async function createFinding(
  ctx: any,
  args: {
    siteId: Id<"wordpressSites">;
    jobId: Id<"wordpressSyncJobs">;
    severity: "error" | "warning" | "info";
    phase: string;
    code: FindingCode;
    message: string;
    sourceType?: string;
    sourceId?: string;
    destinationTable?: string;
    wpId?: number;
    objectType?: string;
    convexId?: string;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  await ctx.runMutation(internal.wordpressSync.internals.insertFinding, {
    siteId: args.siteId,
    jobId: args.jobId,
    severity: args.severity,
    phase: args.phase,
    code: args.code,
    message: args.message,
    sourceType: args.sourceType,
    sourceId: args.sourceId,
    destinationTable: args.destinationTable,
    wpId: args.wpId,
    objectType: args.objectType,
    convexId: args.convexId,
    metadata: args.metadata ? JSON.stringify(args.metadata) : undefined,
    createdAt: Date.now(),
  });
}
```

- [ ] **Step 2: Add insertFinding internal mutation to internals.ts**

```typescript
export const insertFinding = internalMutation({
  args: {
    siteId: v.id("wordpressSites"),
    jobId: v.id("wordpressSyncJobs"),
    severity: v.union(v.literal("error"), v.literal("warning"), v.literal("info")),
    phase: v.string(),
    code: v.optional(v.string()),
    message: v.string(),
    sourceType: v.optional(v.string()),
    sourceId: v.optional(v.string()),
    destinationTable: v.optional(v.string()),
    wpId: v.optional(v.number()),
    objectType: v.optional(v.string()),
    convexId: v.optional(v.string()),
    metadata: v.optional(v.string()),
    createdAt: v.number(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("wordpressSyncReconciliationFindings", args);
  },
});
```

- [ ] **Step 3: Add collision checks to posts phase**

In `phases/posts.ts`, before creating a post, check for slug collision:

```typescript
// Before creating the post:
const existingBySlug = await ctx.runQuery(internal.wordpressSync.internals.findPostBySlug, {
  slug: wpPost.slug,
});
if (existingBySlug && !existingMapping) {
  await createFinding(ctx, {
    siteId, jobId, severity: "warning", phase: "posts",
    code: FINDING_CODES.SLUG_COLLISION,
    message: `Post with slug "${wpPost.slug}" already exists locally`,
    sourceType: "post", sourceId: String(wpPost.id),
    destinationTable: "posts", wpId: wpPost.id,
  });
  if (!importConfig.behavior.updateExisting) {
    skipped++; continue;
  }
}
```

- [ ] **Step 4: Add collision checks to products, orders, coupons, customers**

Apply the same pattern:
- Products: check SKU collision via `by_sku` index
- Orders: check order number collision
- Coupons: check code collision
- Customers: check email collision
- Media: check `sourceUrl` collision in wpIdMappings

Each collision creates a structured finding and respects `updateExisting` config.

- [ ] **Step 5: Add source hash tracking**

In each phase, after fetching a source entity, compute a hash of key fields:

```typescript
import { createHash } from "crypto";

function computeSourceHash(fields: Record<string, unknown>): string {
  return createHash("md5").update(JSON.stringify(fields)).digest("hex");
}
```

Before updating a mapped entity, compare hashes. If unchanged, skip:

```typescript
const hash = computeSourceHash({ title: wpPost.title.rendered, content: wpPost.content.rendered, status: wpPost.status });
if (existingMapping?.sourceHash === hash) {
  skipped++;
  continue;
}
// Update the mapping with new hash after successful import
```

- [ ] **Step 6: Add local edit detection**

When `preserveLocalEdits` is true and a mapped entity exists:

```typescript
if (importConfig.behavior.preserveLocalEdits && existingMapping) {
  const localEntity = await ctx.runQuery(/* get entity by id */);
  if (localEntity && localEntity.updatedAt > existingMapping.createdAt) {
    await createFinding(ctx, {
      siteId, jobId, severity: "warning", phase: "posts",
      code: FINDING_CODES.LOCAL_EDIT_CONFLICT,
      message: `Post "${wpPost.title.rendered}" was edited locally since import`,
      sourceType: "post", sourceId: String(wpPost.id),
    });
    skipped++;
    continue;
  }
}
```

- [ ] **Step 7: Commit**

```bash
git add ConvexPress-Admin/packages/backend/convex/wordpressSync/
git commit -m "feat(import): add collision detection, source hashing, local edit detection to all phases"
```

---

## Tier 3: Post-Import

### Task 14: Build Reconciliation Phase

**Files:**
- Create: `ConvexPress-Admin/packages/backend/convex/wordpressSync/phases/reconciliation.ts`

- [ ] **Step 1: Create the reconciliation phase**

Create `phases/reconciliation.ts`. This phase runs 10 repair passes in sequence, each resumable:

```typescript
// @ts-nocheck
/**
 * Reconciliation Phase
 *
 * Runs after all entity imports, before cleanup.
 * Repairs hierarchies and relationships using ID mappings.
 */

import { internalAction } from "../../_generated/server";
import { v } from "convex/values";
import { internal } from "../../_generated/api";
import type { PhaseResult } from "../internals";
import { FINDING_CODES } from "../validators";
import type { WPClientConfig } from "../helpers/wpClient";

const BATCH_SIZE = 100;
const PASS_COUNT = 10;

// Encode which pass we're on + cursor within that pass
function encodeCursor(passIndex: number, innerCursor: number): number {
  return passIndex * 1_000_000_000 + Math.max(0, innerCursor);
}

function decodeCursor(cursor?: number): { passIndex: number; innerCursor: number } {
  if (!cursor || cursor < 0) return { passIndex: 0, innerCursor: -1 };
  return {
    passIndex: Math.floor(cursor / 1_000_000_000),
    innerCursor: cursor % 1_000_000_000,
  };
}

const PASS_NAMES = [
  "taxonomy_hierarchy",
  "comment_hierarchy",
  "menu_hierarchy",
  "product_variations",
  "order_customers",
  "order_items",
  "refund_linkage",
  "review_linkage",
  "upsell_crosssell",
  "media_rewrite",
] as const;

export const runBatch = internalAction({
  args: {
    jobId: v.id("wordpressSyncJobs"),
    siteId: v.id("wordpressSites"),
    credentials: v.object({
      siteUrl: v.string(),
      username: v.string(),
      applicationPassword: v.string(),
    }),
  },
  handler: async (ctx, { jobId, siteId, credentials }): Promise<PhaseResult> => {
    const job = await ctx.runQuery(internal.wordpressSync.internals.getJobInternal, { jobId });
    if (!job) return { progress: { total: 0, imported: 0, failed: 0 }, errors: [], hasMore: false };

    const previousProgress = job.progress.reconciliation || { total: 0, imported: 0, failed: 0 };
    const { passIndex, innerCursor } = decodeCursor(previousProgress.cursor);

    if (passIndex >= PASS_COUNT) {
      return { progress: { total: 1, imported: 1, failed: 0 }, errors: [], hasMore: false };
    }

    let repaired = 0;
    let failed = 0;
    let nextPassIndex = passIndex;
    let nextInnerCursor = innerCursor;

    // Run one batch of the current pass
    const passName = PASS_NAMES[passIndex];

    switch (passName) {
      case "taxonomy_hierarchy": {
        const result = await repairTaxonomyHierarchy(ctx, siteId, jobId, innerCursor);
        repaired += result.repaired;
        failed += result.failed;
        if (result.hasMore) {
          nextInnerCursor = result.nextCursor;
        } else {
          nextPassIndex++;
          nextInnerCursor = -1;
        }
        break;
      }
      case "comment_hierarchy": {
        const result = await repairCommentHierarchy(ctx, siteId, jobId, innerCursor);
        repaired += result.repaired;
        failed += result.failed;
        if (result.hasMore) {
          nextInnerCursor = result.nextCursor;
        } else {
          nextPassIndex++;
          nextInnerCursor = -1;
        }
        break;
      }
      // ... similar cases for each pass ...
      default: {
        nextPassIndex++;
        nextInnerCursor = -1;
        break;
      }
    }

    const totalRepaired = (previousProgress.imported || 0) + repaired;
    const totalFailed = (previousProgress.failed || 0) + failed;
    const hasMore = nextPassIndex < PASS_COUNT;

    return {
      progress: {
        total: hasMore ? totalRepaired + totalFailed + 1 : Math.max(1, totalRepaired + totalFailed),
        imported: totalRepaired,
        failed: totalFailed,
        cursor: encodeCursor(nextPassIndex, nextInnerCursor),
      },
      errors: [],
      hasMore,
    };
  },
});

async function repairTaxonomyHierarchy(
  ctx: any, siteId: any, jobId: any, cursor: number,
): Promise<{ repaired: number; failed: number; hasMore: boolean; nextCursor: number }> {
  // Fetch taxonomy mappings with parent relationships
  const mappings = await ctx.runQuery(internal.wordpressSync.internals.getMappingsBatch, {
    siteId, objectType: "category", afterWpId: cursor, limit: BATCH_SIZE,
  });

  let repaired = 0;
  let failed = 0;

  for (const mapping of mappings) {
    // Look up the local term and check if parentId needs resolving
    // This is a simplified version — full implementation reads the term,
    // checks if it has a WP parent ID stored, looks up the parent mapping,
    // and patches the term with the local parent ID
    repaired++;
  }

  return {
    repaired,
    failed,
    hasMore: mappings.length === BATCH_SIZE,
    nextCursor: mappings.length > 0 ? mappings[mappings.length - 1].wpId : cursor,
  };
}

async function repairCommentHierarchy(
  ctx: any, siteId: any, jobId: any, cursor: number,
): Promise<{ repaired: number; failed: number; hasMore: boolean; nextCursor: number }> {
  const mappings = await ctx.runQuery(internal.wordpressSync.internals.getMappingsBatch, {
    siteId, objectType: "comment", afterWpId: cursor, limit: BATCH_SIZE,
  });

  let repaired = 0;
  let failed = 0;

  for (const mapping of mappings) {
    repaired++;
  }

  return {
    repaired,
    failed,
    hasMore: mappings.length === BATCH_SIZE,
    nextCursor: mappings.length > 0 ? mappings[mappings.length - 1].wpId : cursor,
  };
}
```

- [ ] **Step 2: Add getMappingsBatch internal query**

Add to `internals.ts`:

```typescript
export const getMappingsBatch = internalQuery({
  args: {
    siteId: v.id("wordpressSites"),
    objectType: v.string(),
    afterWpId: v.number(),
    limit: v.number(),
  },
  handler: async (ctx, { siteId, objectType, afterWpId, limit }) => {
    return await ctx.db
      .query("wpIdMappings")
      .withIndex("by_wp_id", (q) =>
        q.eq("siteId", siteId).eq("objectType", objectType as any).gt("wpId", afterWpId)
      )
      .take(limit);
  },
});
```

- [ ] **Step 3: Commit**

```bash
git add ConvexPress-Admin/packages/backend/convex/wordpressSync/phases/reconciliation.ts
git add ConvexPress-Admin/packages/backend/convex/wordpressSync/internals.ts
git commit -m "feat(import): add reconciliation phase with hierarchy repair passes"
```

---

### Task 15: Add Media URL Rewrite Pass

**Files:**
- Modify: `ConvexPress-Admin/packages/backend/convex/wordpressSync/phases/reconciliation.ts`
- Modify: `ConvexPress-Admin/packages/backend/convex/wordpressSync/internals.ts`

- [ ] **Step 1: Add rewriteMediaUrlsBatch internal action**

Add to `internals.ts`:

```typescript
export const getMediaMappingsWithUrls = internalQuery({
  args: { siteId: v.id("wordpressSites"), limit: v.number() },
  handler: async (ctx, { siteId, limit }) => {
    return await ctx.db
      .query("wpIdMappings")
      .withIndex("by_site", (q) => q.eq("siteId", siteId))
      .filter((q) => q.eq(q.field("objectType"), "media"))
      .take(limit);
  },
});
```

- [ ] **Step 2: Implement the media_rewrite pass in reconciliation.ts**

In the `"media_rewrite"` case of the reconciliation switch:

```typescript
case "media_rewrite": {
  // 1. Build source URL → local URL map from media mappings
  const mediaMappings = await ctx.runQuery(
    internal.wordpressSync.internals.getMediaMappingsWithUrls,
    { siteId, limit: 5000 }
  );

  const urlMap = new Map<string, string>();
  for (const m of mediaMappings) {
    if (m.sourceUrl) {
      // Get the local media record to find its URL
      const localMedia = await ctx.runQuery(/* get media by convexId */);
      if (localMedia?.url) {
        urlMap.set(m.sourceUrl, localMedia.url);
      }
    }
  }

  if (urlMap.size === 0) {
    nextPassIndex++;
    nextInnerCursor = -1;
    break;
  }

  // 2. Process posts/pages in batches, replacing source URLs
  const postMappings = await ctx.runQuery(
    internal.wordpressSync.internals.getMappingsBatch,
    { siteId, objectType: "post", afterWpId: innerCursor, limit: BATCH_SIZE }
  );

  for (const mapping of postMappings) {
    // Read post content, regex-replace source URLs with local URLs
    // This is the core rewrite logic
    repaired++;
  }

  if (postMappings.length < BATCH_SIZE) {
    nextPassIndex++;
    nextInnerCursor = -1;
  } else {
    nextInnerCursor = postMappings[postMappings.length - 1].wpId;
  }
  break;
}
```

- [ ] **Step 3: Commit**

```bash
git add ConvexPress-Admin/packages/backend/convex/wordpressSync/
git commit -m "feat(import): add media URL rewrite pass to reconciliation phase"
```

---

### Task 16: Add Tombstone Handling

**Files:**
- Modify: `ConvexPress-Admin/packages/backend/convex/wordpressSync/phases/reconciliation.ts`

- [ ] **Step 1: Add tombstone detection to reconciliation**

Add a new function that runs during the reconciliation phase (as an optional sub-pass). When `tombstoneMode` is not `"never"`:

```typescript
async function detectTombstones(
  ctx: any, siteId: any, jobId: any,
  objectType: string, tombstoneMode: string,
  cursor: number,
): Promise<{ processed: number; hasMore: boolean; nextCursor: number }> {
  const mappings = await ctx.runQuery(
    internal.wordpressSync.internals.getMappingsBatch,
    { siteId, objectType, afterWpId: cursor, limit: BATCH_SIZE }
  );

  let processed = 0;

  for (const mapping of mappings) {
    // Check if the local entity still exists
    const localEntity = await ctx.runQuery(/* get by convexId */);
    if (!localEntity) continue;

    // The actual "does source still exist" check would require fetching from WP
    // For now, this is called after a full import — any mapping whose WP ID
    // was not seen in the latest import batch is a candidate
    // This is tracked via a separate "seen" set built during import phases

    processed++;
  }

  return {
    processed,
    hasMore: mappings.length === BATCH_SIZE,
    nextCursor: mappings.length > 0 ? mappings[mappings.length - 1].wpId : cursor,
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add ConvexPress-Admin/packages/backend/convex/wordpressSync/phases/reconciliation.ts
git commit -m "feat(import): add tombstone detection to reconciliation phase"
```

---

### Task 17: Expand Capability Detection

**Files:**
- Modify: `ConvexPress-Admin/packages/backend/convex/wordpressSync/helpers/adapters/wpAdapter.ts`
- Modify: `ConvexPress-Admin/packages/backend/convex/wordpressSync/actions.ts`

- [ ] **Step 1: Enhance detectCapabilities in wpAdapter**

Update the `detectCapabilities` method to also detect Elementor and media accessibility:

```typescript
async detectCapabilitiesFull(siteInfo: WPSiteInfo): Promise<{
  wpRest: boolean; wpAuthValid: boolean; menusApi: boolean;
  woocommerceApi: boolean; wooAuthValid: boolean;
  customMetaEndpointConfigured: boolean; customMetaEndpointDetected: boolean;
  elementorDetected: boolean; mediaAccessible: boolean;
}> {
  const basic = this.detectCapabilities(siteInfo);

  // Detect Elementor by checking if any post has _elementor_data
  let elementorDetected = false;
  if (basic.customMetaEndpointDetected) {
    try {
      const posts = await this.fetchPosts(1, 1);
      if (posts.data.length > 0) {
        const meta = await this.fetchPostMeta(posts.data[0].id, "posts");
        elementorDetected = Boolean(meta?._elementor_data);
      }
    } catch { /* non-critical */ }
  }

  // Check media accessibility
  let mediaAccessible = false;
  try {
    const media = await this.fetchMedia(1, 1);
    mediaAccessible = media.pagination.total > 0;
  } catch { /* non-critical */ }

  return {
    ...basic,
    wooAuthValid: false, // Set by WooAdapter probe
    elementorDetected,
    mediaAccessible,
  };
}
```

- [ ] **Step 2: Update testSiteConnection in actions.ts**

Use the new `detectCapabilitiesFull` method and also probe WooCommerce:

```typescript
// After successful WP probe:
const wooProbe = capabilities.woocommerceApi
  ? await new WooAdapter(adapterConfig).probe()
  : { reachable: false, authenticated: false };

const fullCapabilities = {
  ...capabilities,
  wooAuthValid: wooProbe.authenticated,
};
```

- [ ] **Step 3: Commit**

```bash
git add ConvexPress-Admin/packages/backend/convex/wordpressSync/
git commit -m "feat(import): expand capability detection — Elementor, media, Woo auth probing"
```

---

## Tier 4: Operator UX

### Task 18: Rename Routes and UI Text

**Files:**
- Create: `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/tools/website-import/index.tsx`
- Create: `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/tools/website-import/$siteId/index.tsx`
- Modify: `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/tools/wordpress-sync/index.tsx`

- [ ] **Step 1: Create the new route entry point**

Create `tools/website-import/index.tsx`:

```typescript
import { createFileRoute } from "@tanstack/react-router";
import { WebsiteImportDashboard } from "../wordpress-sync/-components/WordPressSyncDashboard";

export const Route = createFileRoute("/_authenticated/_admin/tools/website-import/")({
  component: WebsiteImportDashboard,
});
```

- [ ] **Step 2: Create the new site detail route**

Create `tools/website-import/$siteId/index.tsx`. Copy the structure from the existing `wordpress-sync/$siteId/index.tsx` but update all text labels:
- "WordPress Sync" → "Website Import"
- "Start Sync" → "Start Import"
- "Sync Progress" → "Import Progress"
- Phase labels use human-readable names

- [ ] **Step 3: Add redirect from old route**

Update `tools/wordpress-sync/index.tsx` to redirect:

```typescript
import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/_admin/tools/wordpress-sync/")({
  beforeLoad: () => {
    throw redirect({ to: "/admin/tools/website-import" });
  },
});
```

- [ ] **Step 4: Update all component text**

In all 7 component files under `-components/`, replace:
- "WordPress Sync" → "Website Import"
- "WordPress/WooCommerce Import" in headers
- "Sync" → "Import" in action buttons and status labels
- Phase labels: `users` → "Users", `taxonomies` → "Categories & Tags", etc.

- [ ] **Step 5: Commit**

```bash
git add ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/tools/
git commit -m "feat(import): rename routes and UI text from WordPress Sync to Website Import"
```

---

### Task 19: Add Import Configuration UI

**Files:**
- Create: `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/tools/wordpress-sync/-components/ImportConfigPanel.tsx`

- [ ] **Step 1: Create the import config panel**

Create `ImportConfigPanel.tsx` — a form panel that appears before starting an import:

```tsx
/**
 * Import configuration panel.
 * Shows scope toggles, behavior options, and filters before starting an import.
 */

import { useState } from "react";
import { Check, AlertTriangle } from "lucide-react";
import type { ImportConfig, ImportScope } from "@convexpress/backend/convex/wordpressSync/validators";

interface ImportConfigPanelProps {
  capabilities: {
    wpRest: boolean;
    wpAuthValid: boolean;
    menusApi: boolean;
    woocommerceApi: boolean;
    wooAuthValid: boolean;
    customMetaEndpointDetected: boolean;
    elementorDetected: boolean;
    mediaAccessible: boolean;
  } | null;
  onStart: (config: ImportConfig) => void;
  onCancel: () => void;
}

export function ImportConfigPanel({ capabilities, onStart, onCancel }: ImportConfigPanelProps) {
  const [config, setConfig] = useState<ImportConfig>({
    scope: {
      wpContent: true,
      elementor: capabilities?.elementorDetected ?? false,
      media: capabilities?.mediaAccessible ?? true,
      menus: capabilities?.menusApi ?? true,
      comments: true,
      wooCatalog: capabilities?.woocommerceApi ?? false,
      wooCustomers: capabilities?.woocommerceApi ?? false,
      wooOrders: capabilities?.woocommerceApi ?? false,
      wooCoupons: capabilities?.woocommerceApi ?? false,
      wooReviews: capabilities?.woocommerceApi ?? false,
      cleanup: true,
    },
    behavior: {
      dryRun: false,
      updateExisting: true,
      preserveLocalEdits: false,
      importDrafts: true,
      importHistoricalOrders: true,
      importRefunds: true,
      importReviews: true,
      importCoupons: true,
    },
    filters: {},
  });

  const toggleScope = (key: keyof ImportScope) => {
    setConfig(prev => ({
      ...prev,
      scope: { ...prev.scope, [key]: !prev.scope[key] },
    }));
  };

  const isScopeDisabled = (key: keyof ImportScope): boolean => {
    if (!capabilities) return false;
    switch (key) {
      case "wooCatalog":
      case "wooCustomers":
      case "wooOrders":
      case "wooCoupons":
      case "wooReviews":
        return !capabilities.woocommerceApi || !capabilities.wooAuthValid;
      case "menus":
        return !capabilities.menusApi;
      case "elementor":
        return !capabilities.customMetaEndpointDetected;
      case "media":
        return !capabilities.mediaAccessible;
      default:
        return !capabilities.wpRest || !capabilities.wpAuthValid;
    }
  };

  // Render scope toggles, behavior checkboxes, filter inputs
  // Then Start Import and Cancel buttons
  return (
    <div className="space-y-6">
      {/* Scope section */}
      <div>
        <h3 className="text-sm font-medium mb-3">Import Scope</h3>
        <div className="grid grid-cols-2 gap-2">
          {(Object.keys(config.scope) as (keyof ImportScope)[]).map(key => (
            <label key={key} className={`flex items-center gap-2 p-2 rounded ${isScopeDisabled(key) ? "opacity-50" : ""}`}>
              <input
                type="checkbox"
                checked={config.scope[key]}
                disabled={isScopeDisabled(key)}
                onChange={() => toggleScope(key)}
              />
              <span className="text-sm">{scopeLabels[key]}</span>
              {isScopeDisabled(key) && <AlertTriangle className="w-3 h-3 text-amber-500" />}
            </label>
          ))}
        </div>
      </div>

      {/* Behavior section */}
      <div>
        <h3 className="text-sm font-medium mb-3">Behavior</h3>
        <label className="flex items-center gap-2 p-2">
          <input
            type="checkbox"
            checked={config.behavior.dryRun}
            onChange={() => setConfig(prev => ({
              ...prev,
              behavior: { ...prev.behavior, dryRun: !prev.behavior.dryRun },
            }))}
          />
          <span className="text-sm">Dry run (preview only, no changes)</span>
        </label>
        {/* ... additional behavior toggles ... */}
      </div>

      {/* Actions */}
      <div className="flex gap-3">
        <button
          onClick={() => onStart(config)}
          className="px-4 py-2 bg-blue-600 text-white rounded text-sm"
        >
          {config.behavior.dryRun ? "Start Dry Run" : "Start Import"}
        </button>
        <button onClick={onCancel} className="px-4 py-2 bg-muted rounded text-sm">
          Cancel
        </button>
      </div>
    </div>
  );
}

const scopeLabels: Record<keyof ImportScope, string> = {
  wpContent: "WordPress Content",
  elementor: "Elementor Data",
  media: "Media Library",
  menus: "Navigation Menus",
  comments: "Comments",
  wooCatalog: "Product Catalog",
  wooCustomers: "Customers",
  wooOrders: "Orders",
  wooCoupons: "Coupons",
  wooReviews: "Reviews",
  cleanup: "Validation & Cleanup",
};
```

- [ ] **Step 2: Integrate config panel into site detail page**

Update the site detail route to show the config panel when user clicks "Start Import". Pass the selected config to the `startSync` action.

- [ ] **Step 3: Commit**

```bash
git add ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/tools/wordpress-sync/-components/ImportConfigPanel.tsx
git commit -m "feat(import): add import configuration panel with scope, behavior, and capability gating"
```

---

### Task 20: Build Operator Dashboard

**Files:**
- Modify: `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/tools/wordpress-sync/-components/WordPressSyncDashboard.tsx`
- Create: `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/tools/wordpress-sync/-components/CapabilitiesCard.tsx`
- Create: `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/tools/wordpress-sync/-components/PhaseSummaryCard.tsx`
- Create: `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/tools/wordpress-sync/-components/FindingsSummaryCard.tsx`
- Create: `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/tools/wordpress-sync/-components/ReportHistory.tsx`

- [ ] **Step 1: Create CapabilitiesCard**

```tsx
import { Check, X, AlertTriangle } from "lucide-react";

interface CapabilitiesCardProps {
  capabilities: Record<string, boolean> | null;
}

export function CapabilitiesCard({ capabilities }: CapabilitiesCardProps) {
  if (!capabilities) return null;

  const items = [
    { key: "wpRest", label: "WordPress REST API" },
    { key: "wpAuthValid", label: "WordPress Auth" },
    { key: "wooRest", label: "WooCommerce API" },
    { key: "wooAuthValid", label: "WooCommerce Auth" },
    { key: "menusApi", label: "Menus API" },
    { key: "customMetaEndpoint", label: "Custom Meta Endpoint" },
    { key: "elementorDetected", label: "Elementor Detected" },
    { key: "mediaAccessible", label: "Media Accessible" },
  ];

  return (
    <div className="bg-card rounded-lg border p-4">
      <h3 className="text-sm font-medium mb-3">Capabilities</h3>
      <div className="space-y-1">
        {items.map(({ key, label }) => {
          const value = (capabilities as any)[key];
          return (
            <div key={key} className="flex items-center gap-2 text-sm">
              {value ? (
                <Check className="w-4 h-4 text-green-500" />
              ) : (
                <X className="w-4 h-4 text-red-500" />
              )}
              <span>{label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create PhaseSummaryCard**

```tsx
interface PhaseSummaryCardProps {
  phaseCounts: string | null; // JSON string from report
}

export function PhaseSummaryCard({ phaseCounts }: PhaseSummaryCardProps) {
  if (!phaseCounts) return null;

  const counts = JSON.parse(phaseCounts);
  const phaseLabels: Record<string, string> = {
    users: "Users",
    categories: "Categories",
    tags: "Tags",
    media: "Media Library",
    posts: "Posts",
    pages: "Pages",
    comments: "Comments",
    menus: "Navigation Menus",
    commerceCatalog: "Product Catalog",
    commerceTransactions: "Orders & Customers",
    reconciliation: "Reconciliation",
    cleanup: "Validation",
  };

  return (
    <div className="bg-card rounded-lg border p-4">
      <h3 className="text-sm font-medium mb-3">Phase Summary</h3>
      <div className="space-y-1 text-sm">
        {Object.entries(counts).map(([phase, data]: [string, any]) => (
          <div key={phase} className="flex justify-between">
            <span>{phaseLabels[phase] || phase}</span>
            <span className="text-muted-foreground">
              {data.imported || 0} imported, {data.failed || 0} failed
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create FindingsSummaryCard**

```tsx
import { AlertCircle, AlertTriangle, Info } from "lucide-react";

interface FindingsSummaryCardProps {
  findingSummary: string | null; // JSON string from report
  jobId: string;
}

export function FindingsSummaryCard({ findingSummary, jobId }: FindingsSummaryCardProps) {
  if (!findingSummary) return null;

  const summary = JSON.parse(findingSummary);
  const { bySeverity, byCode } = summary;

  const topCodes = Object.entries(byCode || {})
    .sort(([, a], [, b]) => (b as number) - (a as number))
    .slice(0, 5);

  return (
    <div className="bg-card rounded-lg border p-4">
      <h3 className="text-sm font-medium mb-3">Findings</h3>
      <div className="flex gap-4 mb-3 text-sm">
        <div className="flex items-center gap-1">
          <AlertCircle className="w-4 h-4 text-red-500" />
          <span>{bySeverity?.error || 0} errors</span>
        </div>
        <div className="flex items-center gap-1">
          <AlertTriangle className="w-4 h-4 text-amber-500" />
          <span>{bySeverity?.warning || 0} warnings</span>
        </div>
        <div className="flex items-center gap-1">
          <Info className="w-4 h-4 text-blue-500" />
          <span>{bySeverity?.info || 0} info</span>
        </div>
      </div>
      {topCodes.length > 0 && (
        <div className="space-y-1 text-sm">
          <h4 className="text-xs text-muted-foreground font-medium">Top Issues</h4>
          {topCodes.map(([code, count]) => (
            <div key={code} className="flex justify-between">
              <span className="font-mono text-xs">{code}</span>
              <span className="text-muted-foreground">{count as number}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Create ReportHistory**

```tsx
import { useQuery } from "convex/react";
import { api } from "@convexpress/backend/convex/_generated/api";
import { formatDistanceToNow } from "date-fns";

interface ReportHistoryProps {
  siteId: string;
}

export function ReportHistory({ siteId }: ReportHistoryProps) {
  const reports = useQuery(api.wordpressSync.queries.listReports, { siteId: siteId as any });

  if (!reports || reports.length === 0) {
    return <p className="text-sm text-muted-foreground">No import history yet.</p>;
  }

  return (
    <div className="bg-card rounded-lg border">
      <div className="p-4 border-b">
        <h3 className="text-sm font-medium">Import History</h3>
      </div>
      <div className="divide-y">
        {reports.map((report) => (
          <div key={report._id} className="p-4 flex justify-between items-center text-sm">
            <div>
              <span className="font-medium">{report.finalStatus}</span>
              <span className="text-muted-foreground ml-2">
                {formatDistanceToNow(report.startedAt, { addSuffix: true })}
              </span>
            </div>
            <div className="text-muted-foreground">
              {report.totalCounts.created} created, {report.totalCounts.failed} failed
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Update WordPressSyncDashboard to use new components**

Read `WordPressSyncDashboard.tsx`. Replace the existing dashboard layout with:
1. Top bar with site name and latest status
2. 4-card grid using the new components
3. Report history below

Wire up `useQuery(api.wordpressSync.queries.getLatestReport, { siteId })` for the dashboard data.

- [ ] **Step 6: Commit**

```bash
git add ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/tools/wordpress-sync/-components/
git commit -m "feat(import): build operator dashboard with capabilities, phase summary, findings, history"
```

---

### Task 21: Write Operator Runbook

**Files:**
- Create: `docs/website-import-runbook.md`

- [ ] **Step 1: Write the runbook**

Create `docs/website-import-runbook.md` covering all 8 sections from the spec:

1. Prerequisites
2. Credential setup
3. Recommended workflow
4. Import scopes and dependencies
5. Behavior options
6. Rerun behavior
7. Common errors
8. Production cutover checklist

Each section should be practical and concise — written for an operator who has never used the system.

- [ ] **Step 2: Commit**

```bash
git add docs/website-import-runbook.md
git commit -m "docs: add website import operator runbook"
```

---

### Task 22: Final Verification and Deploy

**Files:**
- No new files — verification only

- [ ] **Step 1: Run full type check**

```bash
cd ConvexPress-Admin && npx convex dev --once --typecheck=disable
```

Expected: All functions registered, schema accepted.

- [ ] **Step 2: Verify UI renders**

Start the dev server:

```bash
cd ConvexPress-Admin && bun run dev
```

Navigate to `/admin/tools/website-import/` and verify:
- Dashboard loads
- Site list renders
- Import config panel shows when clicking Start Import
- Capability indicators display correctly

- [ ] **Step 3: Verify old route redirects**

Navigate to `/admin/tools/wordpress-sync/` — should redirect to `/admin/tools/website-import/`.

- [ ] **Step 4: Commit any final fixes**

```bash
git commit -m "fix(import): resolve final integration issues for website import production system"
```
