# Website Import Production Design

Spec for upgrading the existing WordPress sync system to a production-grade unified WordPress + WooCommerce import system.

**Date:** 2026-04-10
**Source strategy:** `.codex/docs/WORDPRESS-WOOCOMMERCE-SYNC-PRODUCTION-STRATEGY.md`
**Approach:** Foundation-first batch (4 tiers)

---

## Current State

The existing system (~10K lines, 30 files) provides:
- 4 schema tables: `wordpressSites`, `wordpressSyncJobs`, `wpIdMappings`, `wordpressSyncReconciliationFindings`
- 10 import phases: users, taxonomies, media, posts, pages, comments, menus, commerceCatalog, commerceTransactions, cleanup
- 2 API clients: `wpClient.ts` (WordPress REST), `wooClient.ts` (WooCommerce REST)
- 3 data parsers: `elementor.ts`, `acfParser.ts`, `yoastParser.ts`
- Batch processing with cursor pagination and scheduled continuation
- AES-256-GCM credential encryption
- Admin UI with dashboard, site detail, progress tracking, job history, error log

## Implementation Tiers

### Tier 1: Infrastructure (Items 2, 3, 4, 5, 15, 16, 18)

#### 1.1 Evolve Findings Table

Rename concept from `wordpressSyncReconciliationFindings` to a general-purpose findings model. The table name stays unchanged to avoid migration, but gains new fields:

**New fields:**
- `sourceType: v.optional(v.string())` -- e.g., "product", "order", "post"
- `sourceId: v.optional(v.string())` -- WP ID, slug, SKU, email, or other identifier
- `destinationTable: v.optional(v.string())` -- target ConvexPress table name
- `code: v.optional(v.string())` -- structured finding code (see conflict detection codes below)
- `metadata: v.optional(v.string())` -- JSON string for arbitrary context

**New severity level:**
- Add `v.literal("info")` to existing `error | warning` union

**New indexes:**
- `by_job_phase: ["jobId", "phase"]`
- `by_job_code: ["jobId", "code"]`
- `by_site_severity: ["siteId", "severity"]`

Existing indexes (`by_job_created`, `by_job_severity`, `by_site_created`) remain.

#### 1.2 Import Reports Table

New table `wordpressSyncReports`:

```
jobId: v.id("wordpressSyncJobs")
siteId: v.id("wordpressSites")
startedAt: v.number()
completedAt: v.optional(v.number())
finalStatus: v.string()  // completed | failed | cancelled
detectedCapabilities: v.object({
  wpRest: v.boolean(),
  wpAuthValid: v.boolean(),
  wooRest: v.boolean(),
  wooAuthValid: v.boolean(),
  menusApi: v.boolean(),
  customMetaEndpoint: v.boolean(),
  elementorDetected: v.boolean(),
  mediaAccessible: v.boolean(),
})
importConfig: v.string()  // JSON snapshot of selected config
phaseCounts: v.string()   // JSON: { [phase]: { created, updated, skipped, conflicted, failed } }
totalCounts: v.object({
  created: v.number(),
  updated: v.number(),
  skipped: v.number(),
  conflicted: v.number(),
  failed: v.number(),
})
findingSummary: v.string()  // JSON: { bySeverity: {...}, byCode: {...} }
operatorSummary: v.string() // Auto-generated text summary
createdAt: v.number()
```

**Indexes:** `by_site_created: ["siteId", "createdAt"]`, `by_job: ["jobId"]`

**Lifecycle:** Report is created when a job starts (with config snapshot), updated as phases complete, finalized when job completes/fails/cancels. Reports survive job cleanup.

#### 1.3 Import Configuration

Add `importConfig` field to `wordpressSyncJobs`:

```
importConfig: v.optional(v.object({
  scope: v.object({
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
  }),
  behavior: v.object({
    dryRun: v.boolean(),
    updateExisting: v.boolean(),
    preserveLocalEdits: v.boolean(),
    importDrafts: v.boolean(),
    importHistoricalOrders: v.boolean(),
    importRefunds: v.boolean(),
    importReviews: v.boolean(),
    importCoupons: v.boolean(),
  }),
  filters: v.object({
    dateRangeStart: v.optional(v.number()),
    dateRangeEnd: v.optional(v.number()),
    entityLimit: v.optional(v.number()),
  }),
}))
```

Default config (when omitted): all scopes enabled, no dry run, update existing, no date filters.

Phase runner checks `importConfig.scope` to decide whether to run each phase. The `startSync` action accepts config and stores it on the job.

#### 1.4 Dry Run Mode

When `importConfig.behavior.dryRun === true`:
- Phase runners fetch source data, run validation, detect capabilities, resolve collisions
- Findings are written normally
- **No destination entity mutations** -- no inserts or updates to posts, products, orders, users, media, etc.
- Progress tracks what would happen: "would create", "would update", "would skip"
- Report is generated at completion with full dry-run projections
- Dry run may write to operational tables: jobs, reports, findings, mappings (for collision detection)
- Running dry run repeatedly has no destination side effects

**Implementation:** Each phase's `importBatch` function checks `config.dryRun` before calling `ctx.runMutation` for entity creation. The `PhaseResult` type gains `created`/`updated`/`skipped`/`conflicted` counts.

#### 1.5 Source Adapter Refactor

Replace `helpers/wpClient.ts` and `helpers/wooClient.ts` with structured adapters:

```
helpers/adapters/
  types.ts            -- NormalizedResponse<T>, NormalizedError, PaginatedResult<T>, ErrorCategory
  baseAdapter.ts      -- Pagination, retry (3x exponential: 1s/2s/4s), rate-limit backoff (429 + Retry-After), auth, error normalization
  wpAdapter.ts        -- WordPress REST: posts, pages, users, media, comments, site info, capabilities
  wooAdapter.ts       -- WooCommerce REST: products, variations, orders, customers, coupons, reviews
  elementorAdapter.ts -- Post meta: _elementor_data, _elementor_css, page settings, ACF, Yoast, raw meta
  menuAdapter.ts      -- Menus/navigation: menu definitions, menu items with hierarchy
  mediaAdapter.ts     -- Media: download, upload, URL registry
```

**Shared types:**
```typescript
interface NormalizedResponse<T> {
  data: T[];
  pagination: { total: number; totalPages: number; currentPage: number; hasMore: boolean };
}

interface NormalizedError {
  category: "auth" | "capability" | "source_data" | "network" | "rate_limit" | "unknown";
  statusCode?: number;
  message: string;
  retryable: boolean;
}

interface AdapterConfig {
  siteUrl: string;
  username: string;
  password: string;       // Decrypted WP application password
  wooKey?: string;        // Decrypted WooCommerce consumer key
  wooSecret?: string;     // Decrypted WooCommerce consumer secret
  wooAuthMode: "shared" | "separate";
  metaEndpointPath?: string;
  retryCount?: number;    // Default 3
  batchSize?: number;     // Default 100
}
```

Each adapter has a `probe()` method that tests connectivity and returns capability booleans.

**Fail-fast rules:**
- 401/403 → `NormalizedError { category: "auth", retryable: false }` → job fails immediately
- Missing required endpoint → `NormalizedError { category: "capability", retryable: false }` → skip phase with finding
- 429 → backoff with `Retry-After` header, up to 3 retries
- 5xx / timeout / network error → retry with exponential backoff

#### 1.6 Retry & Failure Semantics

- Adapters handle transient HTTP retries internally (transparent to phases)
- Phase cursors already checkpoint after each successful batch (existing behavior, no change needed)
- Add `resumeFromPhase` field to `wordpressSyncJobs` so failed jobs can restart from the last successful phase instead of from the beginning
- Errors categorized: auth, capability, source_data, destination_validation, unknown
- Operator can rerun a failed job, which creates a new job and resumes from the failed phase

#### 1.7 WooCommerce Credential Model

Add to `wordpressSites`:
```
wooConsumerKey: v.optional(v.string())     // AES-256-GCM encrypted
wooConsumerSecret: v.optional(v.string())  // AES-256-GCM encrypted
wooAuthMode: v.optional(v.union(v.literal("shared"), v.literal("separate")))
```

- `shared` (default): WooCommerce API uses WordPress application password auth (works when WP and Woo share auth)
- `separate`: WooCommerce API uses dedicated consumer key/secret (OAuth 1.0a)
- Credential validation probe runs during connection test
- Credentials never appear in logs, findings, reports, or UI output
- Site update flow supports rotating WooCommerce credentials independently

---

### Tier 2: Import Fidelity (Items 6, 7, 8, 9, 10, 11, 12)

#### 2.1 Elementor Fidelity

**Preserve raw source data on posts/pages:**
- `rawElementorData: v.optional(v.string())` -- full `_elementor_data` JSON
- `elementorCss: v.optional(v.string())` -- `_elementor_css`
- `elementorPageSettings: v.optional(v.string())` -- `_elementor_page_settings` JSON
- `elementorTemplateType: v.optional(v.string())` -- `_elementor_template_type`
- `wpPageTemplate: v.optional(v.string())` -- `_wp_page_template`
- `rawSourceMeta: v.optional(v.string())` -- JSON bucket for all unrecognized postmeta keys

If the post/page schema doesn't have these fields, add them as optional fields.

**Error handling:**
- Elementor parse failures produce finding `code: ELEMENTOR_PARSE_FAILED` with the error message in metadata
- Missing custom meta endpoint produces finding `code: META_ENDPOINT_UNAVAILABLE`
- Neither failure kills the import -- the post/page is still imported with whatever content is available from the standard REST response

#### 2.2 Media URL Rewrite Registry

**Storage:** Add `sourceUrl: v.optional(v.string())` to `wpIdMappings`. During media import, store the original WordPress media URL alongside the WP ID → Convex ID mapping.

**Rewrite pass:** New internal action `rewriteMediaUrls` runs during the reconciliation phase (Tier 3). Processes entities in batches:

1. Query all media mappings for the site that have `sourceUrl` populated
2. Build a source URL → local URL lookup map
3. For each post/page: regex replace source URLs in HTML content, walk Elementor JSON for image URLs
4. For each product: replace image URLs, gallery URLs, variation image URLs
5. For each category: replace thumbnail URL

**Finding codes:**
- `UNRESOLVED_MEDIA_URL` -- source URL found in content but no matching media mapping
- `MEDIA_REWRITE_APPLIED` (info) -- URL was successfully rewritten

Rewrite is idempotent -- already-rewritten URLs won't match source patterns.

#### 2.3 Idempotency Strengthening

**Collision detection before insert:**

Before creating any entity, check for existing records that match on natural keys even without a mapping:

| Entity | Natural Key | Index Used |
|--------|-------------|------------|
| Post/page | slug | `by_slug` |
| Product | SKU | `by_sku` |
| User/customer | email | `by_email` |
| Order | order number / source ref | `by_orderNumber` |
| Coupon | code | `by_code` |
| Media | source URL | wpIdMappings `sourceUrl` |
| Category/tag | slug + parent | `by_slug` |
| Menu | slug | `by_slug` |

If collision found and no mapping exists: create a finding and skip (or update if `updateExisting` is true).

**Source hash tracking:**

Add `sourceHash: v.optional(v.string())` to `wpIdMappings`. Hash computed from key source fields (title, content, status, dates for posts; name, SKU, price for products; etc.). On rerun, if hash matches, skip entirely -- no update needed.

**Local edit detection:**

When `preserveLocalEdits` is true and a mapped entity exists locally:
- Compare local `updatedAt` against mapping `createdAt`
- If local is newer → finding `LOCAL_EDIT_CONFLICT`, skip the update
- If local is same/older → safe to update

#### 2.4 Conflict Detection

All conflict types produce structured findings:

| Code | Trigger |
|------|---------|
| `SLUG_COLLISION` | Existing post/page/product with same slug, no mapping |
| `SKU_COLLISION` | Existing product with same SKU, no mapping |
| `EMAIL_COLLISION` | Existing user/customer with same email, no mapping |
| `ORDER_NUMBER_COLLISION` | Existing order with same order number, no mapping |
| `COUPON_CODE_COLLISION` | Existing coupon with same code, no mapping |
| `MEDIA_URL_COLLISION` | Existing media with same source URL, no mapping |
| `TAXONOMY_PATH_COLLISION` | Existing term with same slug + parent, no mapping |
| `MENU_HANDLE_COLLISION` | Existing menu with same slug, no mapping |
| `LOCAL_EDIT_CONFLICT` | Mapped entity edited locally since import |

Import config `behavior.updateExisting` controls default resolution. Per-conflict override is not in scope for v1 -- global policy only.

#### 2.5 WooCommerce Product Fidelity

Enhancements to `commerceCatalog.ts`:

**Product types:** Store `productType` field (`simple`, `variable`, `grouped`, `external`). Type-specific handling:
- `variable`: fetch and import variations via `wooAdapter.fetchVariations(productId)`
- `grouped`: store `groupedProductIds` as WP ID array, resolve in reconciliation
- `external`: store `externalUrl`, `buttonText`

**Additional fields to map:**
- `downloadable`, `virtual` boolean flags
- `stockQuantity`, `stockStatus`, `manageStock`, `backorders`
- `weight`, `length`, `width`, `height` (dimensions)
- `taxClass`, `taxStatus`
- `upsellIds`, `crossSellIds` (WP ID arrays, resolved in reconciliation)
- Product attributes array with `name`, `options`, `visible`, `variation` flags
- Global attributes mapped to shared attribute records

**Raw metadata:** Unrecognized WooCommerce product meta stored in `rawSourceMeta: v.optional(v.string())`.

**Relationship resolution deferred to Tier 3** (reconciliation phase handles upsells, cross-sells, grouped products).

#### 2.6 WooCommerce Order Fidelity

Enhancements to `commerceTransactions.ts`:

**Line items:** Full field capture: `productName`, `sku`, `quantity`, `subtotal`, `total`, `totalTax`, `price`, `variationId`, `meta`

**Additional order line types stored as JSON arrays on the order:**
- `taxLines`: `[{ rateCode, label, taxTotal, shippingTaxTotal }]`
- `shippingLines`: `[{ methodId, methodTitle, total, totalTax }]`
- `feeLines`: `[{ name, total, totalTax }]`
- `couponLines`: `[{ code, discount, discountTax }]`

**Guest orders:** Create a guest customer profile with `isGuest: true` flag. Guest profiles are deduplicated by email (same guest email across orders maps to one profile).

**Order notes:** Import via `wooAdapter.fetchOrderNotes(orderId)` if available, store as structured array on order metadata.

**Total reconciliation:** During cleanup, validate: `order.total === sum(lineItemTotals) + sum(taxLines) + sum(shippingLines) + sum(feeLines) - sum(couponLines)`. Mismatches produce finding `ORDER_TOTAL_MISMATCH`.

#### 2.7 Coupons, Reviews, Customers

**Coupons additions:**
- `usageLimit`, `usageLimitPerUser`, `limitUsageToXItems`
- `dateExpires` (timestamp)
- `productIds`, `excludedProductIds` (WP ID arrays, resolved in reconciliation)
- `categoryIds`, `excludedCategoryIds` (WP ID arrays, resolved in reconciliation)
- `rawMeta` for unrecognized fields

**Reviews additions:**
- `verified` boolean (verified purchase)
- `orderId` linkage where WooCommerce exposes it
- Guest reviewers: create guest user profile, dedup by email
- `rating`, `content`, `status` (approved/pending/spam)

**Customers additions:**
- Dedup by email across WordPress users table and WooCommerce customers
- Import billing and shipping addresses as structured objects
- Link to all imported orders for this customer
- Duplicate email across WP user and Woo customer → finding `EMAIL_COLLISION` with metadata showing both source records

---

### Tier 3: Post-Import (Items 13, 14, 17, 20)

#### 3.1 Hierarchy & Relationship Repair

New phase concept: `reconciliation` runs after all entity imports, before existing `cleanup` (integrity validation). Add `"reconciliation"` to `PHASE_ORDER` between `commerceTransactions` and `cleanup`.

**10 repair passes (processed in order, each resumable with cursor):**

1. Taxonomy parent/child -- resolve WP parent term IDs to local term IDs
2. Comment parent/child -- resolve threaded comment parent IDs
3. Menu item hierarchy -- resolve parent items and link targets (posts, pages, categories, custom URLs)
4. Product → variation parent -- ensure variation `parentProductId` points to local product ID
5. Order → customer -- link `customerId` to imported customer profile
6. Order item → product/variant -- resolve `productId` and `variantId` in line items
7. Refund → order/transaction -- link refund to parent order and payment transaction
8. Review → product/customer/order -- resolve product, reviewer, and purchase order references
9. Upsell/cross-sell resolution -- convert WP product ID arrays to local product ID arrays
10. Media URL rewrite -- the rewrite pass from 2.2

**Rules:**
- Each pass queries `wpIdMappings` filtered by `siteId` + relevant `objectType`
- Success: patch the local entity with resolved local ID
- Failure: finding `MISSING_RELATIONSHIP_TARGET` with source/destination context
- Same-site enforcement: relationships never connect entities imported from different sites
- Each pass is independently resumable (cursor per pass, encoded in cleanup cursor)

#### 3.2 Deletion & Tombstone Handling

Add `tombstoneMode` to import config behavior:

```
tombstoneMode: v.optional(v.union(
  v.literal("never"),
  v.literal("mark_stale"),
  v.literal("soft_delete"),
  v.literal("hard_delete"),
))
destructiveDelete: v.optional(v.boolean())  // Required true for hard_delete
```

| Mode | Behavior |
|------|----------|
| `never` (default) | Missing source objects ignored |
| `mark_stale` | Finding `SOURCE_OBJECT_MISSING` created, no mutation |
| `soft_delete` | Mapped entity status set to `trashed`/`archived` |
| `hard_delete` | Entity deleted. Requires `destructiveDelete: true` or job fails |

Detection runs during reconciliation: for each object type, fetch all mappings for the site, then check whether the source ID still exists in the latest source fetch. Missing IDs are processed per the configured mode.

#### 3.3 Capability-Gated UX

Expand `wordpressSites.capabilities`:

```
capabilities: v.optional(v.object({
  wpRest: v.boolean(),
  wpAuthValid: v.boolean(),
  menusApi: v.boolean(),
  woocommerceApi: v.boolean(),
  wooAuthValid: v.boolean(),
  customMetaEndpointConfigured: v.boolean(),
  customMetaEndpointDetected: v.boolean(),
  elementorDetected: v.boolean(),
  mediaAccessible: v.boolean(),
}))
```

**UI behavior:**
- Capability card shows green/yellow/red per capability
- Impossible scopes are disabled with explanation tooltip
- Degraded scopes show warning (e.g., Elementor detected but no meta endpoint)
- Capability detection runs during connection test and can be re-probed

**Capability → scope mapping:**
| Capability | Enables |
|------------|---------|
| `wpRest + wpAuthValid` | wpContent, media, comments |
| `menusApi` | menus |
| `customMetaEndpointDetected` | elementor (full fidelity) |
| `elementorDetected` | elementor (partial -- standard content only if no meta endpoint) |
| `woocommerceApi + wooAuthValid` | wooCatalog, wooCustomers, wooOrders, wooCoupons, wooReviews |
| `mediaAccessible` | media downloads (vs. URL-only references) |

#### 3.4 Performance Hardening

- Enforce max batch sizes in all adapters (100 WP, 25 media, 25 commerce)
- Audit phase handlers: no unbounded in-memory arrays
- New indexes on findings: `by_job_phase`, `by_job_code` for paginated UI
- Reports store pre-computed counts -- dashboard reads report, not findings table
- Reconciliation uses `runAfter` continuation (existing pattern)
- Entity limit in config (`filters.entityLimit`) caps total entities per phase for test runs

---

### Tier 4: Operator UX (Items 1, 21, 22)

#### 4.1 System Rename

- Route: `/admin/tools/wordpress-sync/` → `/admin/tools/website-import/` (redirect from old path)
- All UI text: "WordPress Sync" → "Website Import" / "WordPress/WooCommerce Import"
- Internal table/function names unchanged
- Phase labels use human-readable names in UI
- WooCommerce presented as integral part, not add-on

#### 4.2 Post-Import Dashboard

Replace `WordPressSyncDashboard.tsx` with operator dashboard:

**Top bar:** Site name, latest run status badge, duration, scope summary

**4-card grid:**
1. Capabilities -- per-capability green/yellow/red indicators
2. Phase summary -- per-phase created/updated/skipped/conflicted/failed
3. Findings summary -- counts by severity, top 5 codes, "view all" link
4. Actions -- start import, rerun, historical reports, export

**Below grid:**
- Unresolved relationships (top 10 + "view all")
- Remaining remote media URLs (count + "view all")
- Auto-generated recommended next actions

**Historical reports:** Sub-route table of past runs with status, date, scope, totals.

#### 4.3 Operator Runbook

File: `plans/project/website-import-runbook.md`

Sections:
1. Prerequisites (WP app password, Woo API keys, meta endpoint plugin)
2. Credential setup (shared vs separate Woo auth)
3. Recommended workflow (test → capabilities → dry run → review → full import → resolve)
4. Import scopes and dependencies
5. Behavior options (dry run, update existing, preserve edits, tombstone modes)
6. Rerun behavior (idempotency, skip unchanged, conflict resolution)
7. Common errors (auth, capability, rate limiting, stale jobs)
8. Production cutover checklist

---

## Finding Codes Reference

| Code | Severity | Description |
|------|----------|-------------|
| `SLUG_COLLISION` | warning | Unmapped entity with same slug exists |
| `SKU_COLLISION` | warning | Unmapped product with same SKU exists |
| `EMAIL_COLLISION` | warning | Unmapped user/customer with same email exists |
| `ORDER_NUMBER_COLLISION` | warning | Unmapped order with same number exists |
| `COUPON_CODE_COLLISION` | warning | Unmapped coupon with same code exists |
| `MEDIA_URL_COLLISION` | warning | Unmapped media with same source URL exists |
| `TAXONOMY_PATH_COLLISION` | warning | Unmapped term with same slug + parent exists |
| `MENU_HANDLE_COLLISION` | warning | Unmapped menu with same slug exists |
| `LOCAL_EDIT_CONFLICT` | warning | Mapped entity was edited locally since import |
| `SOURCE_OBJECT_MISSING` | warning | Mapped source object not found in latest fetch |
| `MISSING_RELATIONSHIP_TARGET` | error | Referenced entity not found in mappings |
| `ELEMENTOR_PARSE_FAILED` | warning | Elementor JSON parsing failed |
| `META_ENDPOINT_UNAVAILABLE` | warning | Custom meta endpoint not reachable |
| `UNRESOLVED_MEDIA_URL` | warning | Source media URL in content with no mapping |
| `MEDIA_REWRITE_APPLIED` | info | Media URL successfully rewritten |
| `ORDER_TOTAL_MISMATCH` | warning | Order total doesn't match line item sum |
| `AUTH_FAILED` | error | Authentication rejected by source |
| `CAPABILITY_MISSING` | warning | Required endpoint not available |
| `SOURCE_DATA_INVALID` | error | Source response failed validation |
| `RATE_LIMITED` | warning | Rate limit hit, backed off |

## Schema Changes Summary

**Modified tables:**
- `wordpressSyncReconciliationFindings` -- add `sourceType`, `sourceId`, `destinationTable`, `code`, `metadata` fields; add `info` severity; add indexes
- `wordpressSyncJobs` -- add `importConfig`, `resumeFromPhase` fields
- `wordpressSites` -- add `wooConsumerKey`, `wooConsumerSecret`, `wooAuthMode` fields; expand `capabilities` object
- `wpIdMappings` -- add `sourceUrl`, `sourceHash` fields

**New tables:**
- `wordpressSyncReports`

**Phase order change:**
`users → taxonomies → media → posts → pages → comments → menus → commerceCatalog → commerceTransactions → reconciliation → cleanup`

## File Changes Summary

**New files:**
- `convex/wordpressSync/helpers/adapters/types.ts`
- `convex/wordpressSync/helpers/adapters/baseAdapter.ts`
- `convex/wordpressSync/helpers/adapters/wpAdapter.ts`
- `convex/wordpressSync/helpers/adapters/wooAdapter.ts`
- `convex/wordpressSync/helpers/adapters/elementorAdapter.ts`
- `convex/wordpressSync/helpers/adapters/menuAdapter.ts`
- `convex/wordpressSync/helpers/adapters/mediaAdapter.ts`
- `convex/wordpressSync/phases/reconciliation.ts`
- `convex/schema/wordpressSyncReports.ts` (or add to existing schema file)
- `apps/web/src/routes/_authenticated/_admin/tools/website-import/` (new route with redirect)
- `plans/project/website-import-runbook.md`

**Modified files:**
- `convex/schema/wordpressSync.ts` -- new fields, new table, expanded validators
- `convex/wordpressSync/validators.ts` -- add reconciliation phase, import config validators, finding codes
- `convex/wordpressSync/internals.ts` -- reconciliation orchestration, report generation, media rewrite
- `convex/wordpressSync/actions.ts` -- accept import config, capability probing, dry run support
- `convex/wordpressSync/mutations.ts` -- create/update site with Woo credentials, config-aware job creation
- `convex/wordpressSync/queries.ts` -- report queries, paginated findings, capability queries
- All phase files in `convex/wordpressSync/phases/` -- adapter migration, dry run support, config-aware skipping, enhanced field mapping, collision detection
- `helpers/wpClient.ts` -- deprecated, replaced by adapters (can keep as thin wrapper initially)
- `helpers/wooClient.ts` -- deprecated, replaced by adapters
- All UI components in `apps/web/src/routes/_authenticated/_admin/tools/wordpress-sync/` -- rename, dashboard overhaul, config UI, report views

## Out of Scope

- Custom post type import beyond posts/pages
- Plugin-specific data beyond Elementor/ACF/Yoast
- Multi-site WordPress network import
- Real-time continuous sync (this is a batch import system)
- Per-conflict resolution override (v1 uses global policy only)
- Automated test suite with fixtures (item 19 from strategy doc -- deferred to follow-up)
