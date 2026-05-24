# PRD: WordPress Sync System

> **Project:** ConvexPress — unified CMS + commerce (WordPress + WooCommerce replacement).
> **Two-app architecture:** Admin (Convex Auth) + Website (Clerk).
> **Roles:** WordPress-standard.
> **Stack:** Bun, Base UI, Tailwind v4.
> **Canonical path:** `specs/ConvexPress/systems/wordpress-sync-system/PRD.md`
> **Airtable Record:** `[redacted-airtable-record-id]`
> **Expert:** `/experts:wordpress-sync-system` (to be created)
> **Status:** Deeply-built import pipeline; ~92% feature-complete. Remaining gaps are polish + edge-case field round-trip (esp. WooCommerce Product Add-Ons + coupons).

---

## Integration with ConvexPress

**Positioning:** internal extension (`wordpressSync`) gated by a settings section + admin tool.
**Code lives at:** `convex/wordpressSync/` — 27 files (internals, mutations, queries, actions, validators, schema) + phase runners in `phases/` subdirectory (commerceCatalog, commerceTransactions, taxonomies, reconciliation).
**Admin UI:** `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/tools/wordpress-sync/` (multi-phase import panel with error log + sync job card).

**Consumes these ConvexPress systems:**

- **Post System / Page System** — imports WP posts + pages with Tiptap-converted content.
- **Taxonomy System** — imports WP categories + tags as ConvexPress taxonomies.
- **Product System / Product Variants / Product Bundles** — imports WooCommerce products + variations.
- **Product Category System** — imports `product_cat` taxonomy.
- **Order System** — imports `shop_order` post-type.
- **Customer System** — imports WP `users` with customer profile.
- **Media System** — imports WP `attachment` post-type + downloads binaries.
- **Discount System** — imports WooCommerce coupons.
- **Commerce Subscriptions** — imports WooCommerce Subscriptions (Automattic) where present.
- **Settings System** — `integrations.wordpress_sync` section holds credentials + phase preferences.
- **Event Dispatcher** — emits `wp.sync_started / .phase_completed / .sync_completed / .sync_failed`.
- **Audit Log** — every phase run writes a job summary.

**WordPress / WooCommerce analog:** official WP REST API (`/wp-json/wp/v2/*`) + WooCommerce REST API (`/wp-json/wc/v3/*`). We consume these as the import data source; ConvexPress is the destination, not a peer.

---

## 1. Overview

### 1.1 Purpose

Import content and commerce data from an existing WordPress +
WooCommerce site into ConvexPress. Designed to be **idempotent** (re-
runnable), **phase-aware** (run categories first, then products, then
orders), and **lossless** (every field preserved in first-class ConvexPress
schema where possible; unmapped fields round-tripped via `rawSourceMeta`).

### 1.2 Scope

**In Scope:**
- Multi-phase import: taxonomies → users → media → content (posts/pages) → products + variants → product categories → orders → customers → coupons → subscriptions.
- Idempotent upsert keyed on `wp_*_id` external ID fields.
- Error logging per phase with retry + resume.
- Admin "Sync Job" UI with progress bars and error log.
- Media binary download + re-upload to Convex Storage.
- Per-phase settings: skip / run / dry-run.
- Scheduled re-sync (optional daily cron).
- **NEW:** Full WooCommerce Product Add-Ons round-trip (per audit — Bundles + Add-Ons currently drop fields).
- **NEW:** Full WooCommerce coupon round-trip (per audit — Discount System's importer drops several fields).
- **NEW:** Reverse direction — export ConvexPress → WordPress for cases where the merchant wants to publish back.

**Out of Scope:**
- Live bidirectional sync (webhook-driven two-way) — separate future system. Current model is one-time or scheduled pull.
- Membership Plans / Commerce Subscriptions as entitlement carriers — imported as inert data; bridge wiring happens once admin reviews.
- Template / theme migration — ConvexPress has no themes; blocks are rebuilt AI-assisted after content imports.

### 1.3 Key Differentiators

- **Lossless field fidelity** — every Woo product field (attributes, add-ons, bundles, subscriptions) survives round-trip. `rawSourceMeta` bag catches anything unmapped.
- **Convex-native idempotency** — a Convex mutation either commits all rows for a phase or none; re-running converges safely.
- **Tiptap conversion** — WP block content converted to Tiptap JSON on import, preserving structure.

---

## 2. Data Model

### 2.1 Exists (partial listing)

```ts
// Schema in convex/schema/wordpressSync.ts
wordpress_sync_jobs           // job header
wordpress_sync_job_phases     // per-phase progress + errors
wordpress_sync_error_log      // granular error rows
wordpress_sync_external_ids   // maps ConvexPress._id ↔ wp_*_id (idempotency)
```

### 2.2 NEW for Wave 11

```ts
wordpress_sync_schedule: defineTable({
  siteUrl: v.string(),
  frequency: v.union(
    v.literal("manual"),
    v.literal("hourly"),
    v.literal("daily"),
    v.literal("weekly"),
  ),
  phases: v.array(v.string()),
  isActive: v.boolean(),
  lastRunAt: v.optional(v.number()),
  nextRunAt: v.optional(v.number()),
}).index("by_next_run", ["nextRunAt"]);
```

Plus `commerceAddOns` + `commerce_discount_codes` + `commerce_bundles`
get wired into the importer via new `phases/commerceAddOns.ts` and
importer-field expansions.

---

## 3. Functions

### 3.1 Exists
- `wordpressSync.mutations.startJob / cancelJob / retryPhase`
- `wordpressSync.actions.*` — phase runners (Node actions calling WP REST API)
- `wordpressSync.phases.commerceCatalog.importProducts / importVariants`
- `wordpressSync.phases.commerceTransactions.importOrders / importCoupons`
- `wordpressSync.phases.taxonomies.importCategoriesAndTags`
- `wordpressSync.phases.reconciliation.reconcileAfterImport`
- `wordpressSync.helpers.wpClient` + `wooClient` — fetchers
- `wordpressSync.helpers.phpUnserialize` — Woo serialized-meta decoder
- `wordpressSync.helpers.elementor` — Elementor block converter

### 3.2 Wave 11 new
- `actions.exportToWordPress(siteUrl, phase)` — reverse direction (optional, only for specific admin use cases)
- `phases.commerceAddOns.importAddOns` — full WooCommerce Product Add-Ons round-trip
- Expand `phases.commerceTransactions.importCoupons` to land all Woo coupon fields (product_ids exclude, usage_limit_per_user, individual_use, free_shipping, minimum_amount, maximum_amount)
- `internals.scheduleNextRun` — cron driver for `wordpress_sync_schedule`

---

## 4. Admin UI

### 4.1 Exists
- `/tools/wordpress-sync` — connect site, select phases, run job
- Job detail page with progress + error log
- Sync Job Card component
- Error Log component

### 4.2 Wave 11
- Schedule tab — configure frequency per site
- Field-fidelity report — for each phase, shows % of Woo fields mapped to first-class ConvexPress fields vs `rawSourceMeta`
- Reverse-export panel (behind an advanced toggle)

---

## 5. Events

- `wp.sync_started / .phase_started / .phase_completed / .sync_completed / .sync_failed`
- `wp.sync_scheduled / .scheduled_triggered`
- `wp.field_dropped` — NEW, fires when an unmapped field lands in `rawSourceMeta` (useful during audits)

---

## 6. Acceptance criteria

### 6.1 Existing (must not regress)
- [x] Multi-phase import of taxonomies, products, orders, customers
- [x] Idempotent re-runs converge
- [x] Error log per phase
- [x] Tiptap conversion of post/page content
- [x] Media binary download
- [x] Admin UI with progress

### 6.2 Wave 11 new
- [ ] WooCommerce Product Add-Ons round-trip (see `.codex/docs/COMMERCE-ADDONS-PLUGIN-PRD.md` for target field set)
- [ ] Full coupon round-trip (product_ids exclude, usage_limit_per_user, individual_use, free_shipping, minimum_amount, maximum_amount)
- [ ] Scheduled re-sync with `wordpress_sync_schedule` + cron driver
- [ ] Field-fidelity reporter
- [ ] Reverse-export happy path for one phase (optional but defines the contract)

---

## 7. Definition of Done

1. §6.2 boxes ticked.
2. Field-fidelity report shows ≥98% field mapping on a representative Woo site (the 2% diff lives in `rawSourceMeta` with `wp.field_dropped` events logged).
3. Scheduled daily sync runs for 7 consecutive days without manual intervention on a test site.
4. Bundles + Add-Ons + Subscriptions + Coupons all round-trip on a WooCommerce test site — export from ConvexPress → WordPress → re-import → diff shows no drift.

---

## 8. References

- Code: `convex/wordpressSync/*` (27 files)
- Admin UI: `apps/web/src/routes/.../tools/wordpress-sync/`
- Docs: `.codex/docs/WORDPRESS-WOOCOMMERCE-SYNC-IMPLEMENTATION-CHECKLIST.md`, `.codex/docs/WORDPRESS-WOOCOMMERCE-SYNC-PRODUCTION-STRATEGY.md`, `.codex/docs/WOOCOMMERCE-FIELD-FIDELITY-AND-CUSTOMER-CONTINUITY.md`
- Sibling PRDs: `post-system`, `page-system`, `taxonomy-system`, `product-system`, `product-variants-system`, `product-bundles-system`, `order-system`, `customer-system`, `discount-system`, `commerce-subscriptions`, `media-system`
- Airtable: `[redacted-airtable-base-id]` / Systems / `[redacted-airtable-record-id]`
