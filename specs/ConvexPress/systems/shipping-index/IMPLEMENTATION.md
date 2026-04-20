# ConvexPress Shipping System — Implementation Instructions

**Status:** Ready to execute
**Prereq:** All 25 PRDs in this directory tree are design-complete and consistency-audited
**Scope:** Build order, per-PRD acceptance criteria, migration strategy, rollout plan
**Last Updated:** 2026-04-14

---

## How to Use This Document

This is the **single execution plan** for building the shipping system. It assumes the 25 PRDs (listed in `README.md`) are the source of truth for WHAT to build. This document tells you WHEN, in WHAT ORDER, and HOW to verify each step is done before moving to the next.

**Treat each PRD as a ticket.** Each PRD becomes one "epic" for the engineering team. The acceptance criteria in this document are the definition-of-done for closing each ticket.

**Use the expert system.** Each PRD maps to an existing ConvexPress expert (see §11). Dispatch work by invoking the appropriate expert with the PRD path as input.

---

## §1 — Build Order (High-Level)

```
Phase 0 (Prep)         → Phase 1 (Layer A)     → Phase 2 (Layer B)
                                                        │
                                                        ▼
Phase 5 (Polish)       ← Phase 4 (Layer D)    ← Phase 3 (Layer C)
```

| Phase | What Gets Built | Duration Estimate | Exit Criteria |
|-------|----------------|-------------------|---------------|
| **Phase 0** | Prep work: feature flag, migration scaffold, test harness | 2–3 days | Feature flag live, harness green on existing code |
| **Phase 1** | All 7 Layer A PRDs (zones, classes, packages, ship-from, address validation, rules engine, rate pipeline) | 3–4 weeks | Rate pipeline returns quotes from built-in methods; no live rates yet |
| **Phase 2** | All 10 Layer B PRDs (method types) | 3–4 weeks | WooCommerce parity: every non-live-rate method configurable |
| **Phase 3** | All 5 Layer C PRDs (providers) | 3–4 weeks | Live rates from all 5 carriers via normalized pipeline |
| **Phase 4** | All 3 Layer D PRDs (labels, tracking, manifests) | 2–3 weeks | Full fulfillment loop: buy label, track, manifest |
| **Phase 5** | Migration cutover, legacy `actions.ts` deletion, documentation, monitoring | 1–2 weeks | Old code removed, dashboards green |

**Total wall-clock: 3–4 months for a single engineer. 6–8 weeks for a team of 3 working in parallel where phases allow.**

---

## §2 — Phase 0: Prep Work (MUST DO FIRST)

Before touching any shipping code, set up the scaffolding. Nothing in Phases 1–4 should start until Phase 0 exits.

### 2.1 Feature Flag

Add a setting: `shipping.v2.enabled` (boolean, default `false`).

- Location: `convex/schema/settings.ts` → extend `PluginsSettings` or add new `ShippingSettings` section
- Default: `false` for existing installs, `true` for new installs
- Effect: when `true`, checkout uses the new rate pipeline (A7); when `false`, checkout uses the legacy `convex/shipping/actions.ts` flow
- Admin UI: toggle in Settings → Commerce → Shipping → "Use new shipping engine"
- The flag lives for all of Phases 1–4. Removed in Phase 5.

### 2.2 Dual-Write Branch

Create a feature branch: `feat/shipping-v2`

- All new files land in `convex/shipping/v2/` during phases 1–4 (parallel to legacy `convex/shipping/`)
- Legacy code is **not** deleted or modified (except to emit v1 vs v2 dispatch based on feature flag) until Phase 5
- This isolates risk: if v2 breaks, turn off the flag

### 2.3 Test Harness

Build a shipping-specific test harness at `convex/shipping/v2/_test/`:

- **Carrier sandboxes:** env-var credentials for UPS, USPS, FedEx, DHL, ShipStation sandboxes
- **Mock server:** node-based mock of all 5 provider APIs (returns deterministic fixture responses) — used for unit tests that must not hit external APIs
- **Fixture data:** sample carts (single-item light, multi-item heavy, cross-border, residential, commercial), sample addresses (US, Canada, EU, APO, PO Box)
- **Rate pipeline probe:** CLI or admin page that runs the pipeline against a fixture and prints the full diagnostic trace

### 2.4 Schema Migration Scaffold

Phase 0 introduces NO schema changes (to avoid disturbing production). Instead, prepare the migration tooling:

- Document the existing shipping schema (9 tables per `convex/schema/shipping.ts`)
- List every new table the PRDs will add (see §9)
- Confirm Convex deployment process with `--typecheck=disable` during incremental migrations (per project CLAUDE.md convention)

### 2.5 Event Dispatcher Registration

Every PRD declares events in §14. Pre-register the namespace:

- Register `shipping.*` event family in the Event Dispatcher System
- Phase 0 just registers the namespace; individual events are registered as their owning PRDs land

### 2.6 Acceptance Criteria for Phase 0

- [ ] `shipping.v2.enabled` flag exists, default `false`, admin-togglable
- [ ] `convex/shipping/v2/` directory created, empty except for a `README.md` that links to this doc
- [ ] Test harness runs against existing code without regressions
- [ ] Carrier sandbox credentials documented in `.env.example` and confirmed working
- [ ] Event namespace `shipping.*` registered with event dispatcher

---

## §3 — Phase 1: Layer A (Core Infrastructure)

**Goal:** Build the foundation. At the end of Phase 1, the new rate pipeline can run end-to-end with only manual/built-in methods (no live rates, no carrier APIs).

### 3.1 Internal Build Order Within Phase 1

Within Phase 1, the dependency order matters. Follow it strictly:

1. **A1 Shipping Zones** (no deps) — START HERE
2. **A2 Shipping Classes** (no shipping deps — parallel with A3)
3. **A3 Shipping Packages & Box Templates** (no shipping deps — parallel)
4. **A4 Ship-From Locations** (no shipping deps — parallel)
5. **A5 Address Validation Service** (no shipping deps — parallel)
6. **A6 Shipping Rules Engine** (no shipping deps — parallel)
7. **A7 Rate Calculation Pipeline** (depends on A1–A6 — **must be last in Phase 1**)

Items 2–6 can be built in parallel by different engineers. Item 7 integrates them all.

### 3.2 Per-PRD Acceptance Criteria — Phase 1

**A1 Shipping Zones** ([shipping-zones-system/PRD.md](../shipping-zones-system/PRD.md))
- [ ] `commerce_shipping_zones` table created per §4 of PRD A1
- [ ] CRUD mutations, list/match queries, reorder mutation
- [ ] Admin UI at `/admin/commerce/settings/shipping/zones` with list + editor
- [ ] Postcode matching supports: exact, wildcards, ranges, CSV lists (grammar per PRD §5)
- [ ] Fallback zone (priority 0) works — matches addresses no other zone claims
- [ ] `matchZoneForAddress(country, state, postcode)` internal query returns matched zone
- [ ] 4 events fire: created, updated, deleted, reordered
- [ ] Capability: `admin.shipping.zones.manage` + `admin.shipping.zones.read` enforced
- [ ] Unit tests cover all 15 edge cases listed in PRD A1 §10
- [ ] Convex deploy passes with typecheck enabled

**A2 Shipping Classes** ([shipping-classes-system/PRD.md](../shipping-classes-system/PRD.md))
- [ ] `commerce_shipping_classes` table created
- [ ] `shippingClassId` field added to `commerce_products` and `commerce_product_variants` (variant can inherit or override)
- [ ] CRUD mutations, bulk assign, resolveForCartLine / resolveBatch internals
- [ ] Admin UI: class list + inline edit, product editor field, variant picker with "inherit"
- [ ] Mixed-cart rule setting: `per_class_sum` (default) vs `highest_class`
- [ ] 4 events fire: created, updated, deleted, assigned
- [ ] Capability: `admin.shipping.classes.manage` enforced
- [ ] Deleting a class in use forces reassignment (no orphaned references)
- [ ] Convex deploy passes

**A3 Shipping Packages & Box Templates** ([shipping-packages-system/PRD.md](../shipping-packages-system/PRD.md))
- [ ] Existing `commerce_shipping_packages` extended with new fields per PRD A3 §4
- [ ] Carrier-native package catalog seeded (USPS Flat Rate, UPS Express Box, FedEx One Rate, DHL Express Envelope)
- [ ] Bin-packing helper at `convex/shipping/v2/helpers/binPacking.ts` — First-Fit Decreasing
- [ ] Replaces the two hardcodes in legacy `shipping/actions.ts` (line 861 USPS 0.1×0.1×0.1 and line 1320 DHL 20×15×10) — dimensions now sourced from A3
- [ ] Admin UI at `/admin/commerce/settings/shipping/packages` with package editor
- [ ] Product editor: `preferredPackageId` override field
- [ ] Unit tests for bin-packing: single item fits smallest, items exceed all packages (multi-box split), items without dimensions (weight-proxy fallback)
- [ ] 3 events fire
- [ ] Convex deploy passes

**A4 Ship-From Locations** ([ship-from-locations-system/PRD.md](../ship-from-locations-system/PRD.md))
- [ ] `commerce_ship_from_locations` table created
- [ ] Each product/variant can specify available locations; fallback to default location
- [ ] Per-location timezone field (IANA) — used by D3 Manifests
- [ ] `isPickupEnabled` flag (consumed by B7 Local Pickup)
- [ ] Geocoding via A5 Address Validation at location save (lat/lng stored) — consumed by B8 Local Delivery
- [ ] Admin UI at `/admin/commerce/settings/shipping/locations`
- [ ] Events: created, updated, deleted, default_changed
- [ ] Capability: `admin.shipping.locations.manage`

**A5 Address Validation Service** ([address-validation-system/PRD.md](../address-validation-system/PRD.md))
- [ ] `commerce_address_validations` cache table with 30-day TTL (24h for invalid)
- [ ] Extend `commerce_addresses` with validation fields
- [ ] Node action calls external providers (USPS → SmartyStreets → Google → skip) in priority order
- [ ] Fail-open by default (merchant setting controls fail-open vs fail-closed)
- [ ] Admin settings at `/admin/commerce/settings/shipping/address-validation`
- [ ] Checkout integration: address correction suggestion UI ("Did you mean...?")
- [ ] Cache hit rate measured — target >60%
- [ ] 3 events: validated, corrected, invalid

**A6 Shipping Rules Engine** ([shipping-rules-engine/PRD.md](../shipping-rules-engine/PRD.md))
- [ ] Rule AST types defined at `convex/shipping/v2/rulesEngine/types.ts`
- [ ] Evaluator at `convex/shipping/v2/rulesEngine/evaluator.ts` — pure function, no side effects
- [ ] Validator at `convex/shipping/v2/rulesEngine/validator.ts` — rejects malformed rules at save
- [ ] All 16 operators supported per PRD A6 §5 (eq, neq, gt, gte, lt, lte, in, not_in, contains, not_contains, starts_with, regex_match, between, exists, and, or, not)
- [ ] All documented fields usable (cart.*, shipping.*, customer.*)
- [ ] Depth cap enforced (8 levels max) — reject deeper rules
- [ ] Admin UI: RuleBuilder component (reused by B6, B8, B9)
- [ ] "Test your rule" preview with sample cart context
- [ ] Extensive unit test suite: every operator, every field, compound rules, edge cases

**A7 Rate Calculation Pipeline** ([rate-calculation-pipeline/PRD.md](../rate-calculation-pipeline/PRD.md))
- [ ] Main pipeline action at `convex/shipping/v2/rates/pipeline.ts`
- [ ] Replaces the legacy `fetchCheckoutRates` action (legacy kept alive behind feature flag)
- [ ] 10-stage pipeline per PRD A7 §6 diagram
- [ ] Per-stage timing captured in `commerce_rate_pipeline_runs` diagnostic table
- [ ] Parallel provider calls with per-provider timeout (default 5s)
- [ ] Ranking: isCheapest, isFastest, isBestValue (weighted 0.6 cost / 0.4 speed)
- [ ] Address/cart fingerprinting (addressKey, cartKey) — reuse existing `computeAddressKey` / `computeCartKey` in `convex/commerce/checkout.ts`
- [ ] Multi-package splitting when A3 bin-packing returns >1 box
- [ ] Zone-based method filtering: only methods attached to matched zone considered
- [ ] `fallbackToManualRates === true` (explicit opt-in only)
- [ ] Admin diagnostic page at `/admin/commerce/settings/shipping/test-rates`
- [ ] 3 events: rates.calculated, rates.failed, rates.fell_back_to_manual
- [ ] Capability: `admin.shipping.diagnostics.view`, `admin.shipping.test_rates.run`

### 3.3 Phase 1 Exit Criteria

- [ ] All 7 Layer A PRDs marked done per above criteria
- [ ] Integration test: fixture cart → pipeline produces normalized quotes from zero methods (expect empty result, no errors)
- [ ] Diagnostic page shows per-stage timings
- [ ] Feature flag still controls v1 vs v2 dispatch — v2 is reachable but produces empty results
- [ ] No regressions on legacy v1 flow (existing shops still work)

---

## §4 — Phase 2: Layer B (Shipping Method Types)

**Goal:** Merchants can configure every non-live-rate shipping method. WooCommerce parity achieved.

### 4.1 Internal Build Order

Methods can be built mostly in parallel. Suggested sequencing based on merchant demand:

**Wave 1 (highest-demand, simplest):**
- B1 Flat Rate
- B2 Weight-Based ⭐ (most requested — **prioritize**)
- B4 Price-Based
- B6 Free Shipping

**Wave 2 (moderate complexity):**
- B5 Quantity-Based
- B3 Dimensional (depends on B2 tier structure)
- B7 Local Pickup (depends on A4 Ship-From)
- B8 Local Delivery (depends on A4 Ship-From + A5 Address Validation geocoding)

**Wave 3 (highest complexity, build last):**
- B10 Live Rate Contract (abstract — defines the interface for Phase 3)
- B9 Table Rate (most complex method; heavy consumer of A6 Rules Engine)

### 4.2 Universal Method-Type Acceptance Criteria

Every Layer B PRD shares these criteria:

- [ ] Schema table created: `commerce_shipping_method_{type}` with fields per PRD §4
- [ ] Method handler at `convex/shipping/v2/methods/{type}.ts` implementing the `MethodRateCalculator` contract defined in A7
- [ ] CRUD mutations (create, update, delete, reorder within zone)
- [ ] Rate calc internal function returns `NormalizedShippingQuote` shape from B10
- [ ] Admin UI embedded in zone editor (users add method instances to zones)
- [ ] Preview: worked example displayed in editor ("Cart with X → rate $Y")
- [ ] Shared events: `shipping.method.created`, `shipping.method.updated`, `shipping.method.deleted` fire
- [ ] Method-specific events per PRD §14
- [ ] Capability `admin.shipping.methods.manage` enforced on all writes
- [ ] Capability `admin.shipping.methods.read` enforced on all reads
- [ ] Unit tests cover every edge case enumerated in PRD §10
- [ ] Integration test: method attached to zone → pipeline (A7) produces a quote
- [ ] Convex deploy passes

### 4.3 Method-Specific Criteria

**B1 Flat Rate** — 3 modes (per_order, per_item, per_shipping_class), class overrides, min/max cost clamps. Merchant can configure in <60s.

**B2 Weight-Based** — Tier table with {minWeight, maxWeight, cost, incrementalCost, incrementalWeight}; per-class override tables; weight unit conversion (oz/g/lb/kg); open-ended top tier. **Match WooCommerce Weight Based Shipping plugin capability.**

**B3 Dimensional** — Reuses B2 tier structure with billable weight as key; DIM divisor per zone (default 139 US, 166 international, 5000 DHL metric); billable = max(actual, DIM); per-package billable summed across multi-package shipments; replaces hardcoded-dimension errors in legacy code.

**B4 Price-Based** — Subtotal-tiered; `useDiscountedSubtotal` boolean (default true); currency-aware; coexists with B6.

**B5 Quantity-Based** — 3 count modes (total_items, total_line_items, per_shipping_class); tier structure mirrors B2 with count as key.

**B6 Free Shipping** — 6 condition types (always, min_amount, coupon, min_amount_or_coupon, min_amount_and_coupon, rule); class exclusions; customer tag requirements; coexists with paid methods.

**B7 Local Pickup** — Reuses A4 ship-from locations with `isPickupEnabled=true`; pickup status workflow (pending → ready_for_pickup → picked_up); customer notification on "ready" status; optional handling fee.

**B8 Local Delivery** — Postcode allowlist OR radius restriction; haversine distance calc; flat or distance-based pricing; delivery window scheduling; same-day cutoff in location timezone.

**B9 Table Rate** — Multi-condition rate table; rows with Rules Engine AST conditions + cost formulas (flat/per_weight/per_item/per_subtotal); match modes (first_match/all_matches_sum/cheapest_match); CSV import/export; **largest admin UI component** (reuses A6 RuleBuilder).

**B10 Live Rate Contract** — Abstract: defines `LiveRateProvider` interface, `NormalizedShippingQuote` type, capability flags; no concrete handler — sets up the contract all C1–C5 providers implement; shared helpers (normalizeQuote, rankQuotes, fingerprintQuote); contract compliance test suite that every C1–C5 must pass.

### 4.4 Phase 2 Exit Criteria

- [ ] All 10 Layer B PRDs pass their acceptance criteria
- [ ] Admin can configure: flat rate, weight tiers, DIM tiers, price tiers, qty tiers, free shipping, local pickup, local delivery, table rate — all via UI, no code
- [ ] Integration test: complex cart + zone with 3 methods configured → pipeline produces 3 ranked quotes
- [ ] WooCommerce Parity Checklist (from README §WooCommerce Parity Checklist) passes every row for Layer B methods
- [ ] Legacy v1 manual shipping methods still work (feature flag still allows v1)
- [ ] No regressions

---

## §5 — Phase 3: Layer C (Shipping Providers)

**Goal:** Live rates from all 5 carriers flow through the normalized pipeline. Merchants can enable ShipStation, UPS, USPS, FedEx, or DHL with OAuth credentials and see live rates at checkout.

### 5.1 Internal Build Order

Providers can be built in parallel once B10 contract is defined. Suggested sequence:

1. **C1 ShipStation** — **reference implementation** (build first; simplest auth, multi-carrier aggregator)
2. **C2 UPS** + **C4 FedEx** — major direct carriers (parallel; similar OAuth flow)
3. **C3 USPS** — direct carrier (rates + tracking first; labels deferred)
4. **C5 DHL** — direct carrier (rates only; labels and tracking deferred)

### 5.2 Universal Provider Acceptance Criteria

Every Layer C PRD shares these criteria:

- [ ] Provider adapter at `convex/shipping/v2/providers/{provider}.ts` implementing `LiveRateProvider` interface from B10
- [ ] All documented endpoints integrated (see per-provider PRD §5)
- [ ] Auth flow implemented per PRD (OAuth for UPS/USPS/FedEx; API key for ShipStation; Basic Auth for DHL)
- [ ] Token caching where applicable (UPS 4h, FedEx 1h — 5-min refresh buffer)
- [ ] Rate fetching returns normalized quotes with addressKey + cartKey fingerprints
- [ ] Every `NormalizedShippingQuote` field populated (see B10 §5)
- [ ] Capability flags declared per PRD §5
- [ ] Admin UI at `/admin/commerce/settings/integrations/shipping/{provider}` — credentials input, test connection, sync carriers/services, last-verified timestamp, error log
- [ ] Connection health tracked in `shipping_provider_connections` table
- [ ] Credentials stored encrypted per existing `shipping_provider_secrets` pattern
- [ ] All documented edge cases handled (per PRD §10)
- [ ] Contract compliance tests (from B10) pass
- [ ] Provider-specific sandbox tests pass
- [ ] 6 core events fire: rates_requested, rates_received, rates_failed, connection_healthy, connection_degraded, connection_error
- [ ] Capability `admin.shipping.providers.{provider}.manage` enforced

### 5.3 Provider-Specific Criteria

**C1 ShipStation** — `/v1/rates`, `/v1/labels`, `/v1/tracking`, `/v1/carriers` endpoints; status codes normalized (DE=delivered, IT=in_transit, etc. — audit fixes preserved); carriers response unwrapped `{carriers: [...]}`; webhook handler at `/webhooks/shipstation` with HMAC-SHA256 signature verification. **This is the reference implementation for C2–C5.**

**C2 UPS** — OAuth `/security/v1/oauth/token` (Basic auth + x-merchant-id); rating `/api/rating/v2409/Rate`; shipping `/api/shipments/v2409/ship`; tracking `/api/track/v1/details`; 12 service codes mapped; token cache with 4h TTL; negotiated rates via `RequestOption="Shop"` + `Shipper.ShipperNumber`.

**C3 USPS** — OAuth `/oauth2/v3/token` (JSON body, not form-encoded!); rates `/prices/v3/base-rates-list/search` with required fields (`processingCategory=MACHINABLE`, `rateIndicator=DR`, `destinationEntryFacilityType=NONE`); response parsed via `rateOptions[].rates[]` flatMap; service name from `rate.description` with fallback; dimensions sourced from A3 (not hardcoded); **labels NOT IMPLEMENTED in this phase** (deferred to future USPS Labels v3 integration).

**C4 FedEx** — OAuth `/oauth/token` (form-encoded); rate `/rate/v1/rates/quotes` with `rateRequestType=[ACCOUNT]` for negotiated; ship `/ship/v1/shipments` with `recipients` (plural!) array; residential flag dynamic (NOT hardcoded); tracking `/track/v1/trackingnumbers` with 2-letter status codes (DL, IT, OD, DP); token cache with 1h TTL (audit fix: was missing, now required).

**C5 DHL Express** — Basic Auth (username:password base64); `GET /rates` with all required query params (accountNumber, origin/destination country+postal+city, weight kg, dimensions cm, plannedShippingDate, isCustomsDeclarable, unitOfMeasurement=metric); weight conversion oz/35.274; dimensions from A3 (not hardcoded); **labels + tracking NOT IMPLEMENTED in this phase** (defer); service code map per audit fix (E=9:00, T=12:00 Doc, plus I/L/M/Q/V additions).

### 5.4 Phase 3 Exit Criteria

- [ ] All 5 Layer C PRDs pass acceptance criteria
- [ ] Integration test per provider: configured credentials → fetch rates → normalized quotes returned
- [ ] Rate pipeline (A7) calls all 5 providers in parallel → ranks → returns to checkout
- [ ] Admin can enable/disable/reorder providers in Settings → Integrations → Shipping
- [ ] Sandbox E2E: cart → checkout → live rates from ShipStation+UPS → select rate → complete checkout (no label purchase yet)
- [ ] Legacy v1 provider code still reachable behind feature flag

---

## §6 — Phase 4: Layer D (Operations)

**Goal:** Full fulfillment loop: buy labels, track shipments, manifest at end of day.

### 6.1 Internal Build Order

Must be sequential:

1. **D1 Labels** (first — must exist before tracking can work meaningfully)
2. **D2 Tracking** (depends on D1)
3. **D3 Manifests** (depends on D1 — can build in parallel with D2)

### 6.2 Per-PRD Acceptance Criteria

**D1 Shipping Labels** ([shipping-labels-system/PRD.md](../shipping-labels-system/PRD.md))
- [ ] `commerce_shipment_labels` table per PRD §4
- [ ] `commerce_label_batch_jobs` table for batch operations
- [ ] Rate reconfirmation at purchase (fingerprint validation — reuse addressKey/cartKey from B10)
- [ ] Label file storage via Convex `_storage` (PDF/PNG/ZPL — not inline)
- [ ] Multi-package workflow: single shipment → N labels, each with own tracking number
- [ ] Void window per carrier enforced (UPS 24h, FedEx 14 days, etc.)
- [ ] Refund tracking (separate from void status — carrier may accept void but refund days later)
- [ ] Reprint always available (just re-download stored label)
- [ ] Batch workflow: parallel provider calls, per-label error handling, partial success response
- [ ] Admin UI: order detail Labels tab, Orders list bulk actions, dedicated `/admin/commerce/shipping/labels` batch page
- [ ] 5+ events fire: purchased, voided, reprinted, refund_requested, refund_completed
- [ ] Idempotency keys prevent double-purchase on retry
- [ ] Uses providers C1 (ShipStation), C2 (UPS), C4 (FedEx) — USPS/DHL label support deferred

**D2 Shipping Tracking** ([shipping-tracking-system/PRD.md](../shipping-tracking-system/PRD.md))
- [ ] `commerce_shipment_tracking_events` table per PRD §4
- [ ] Webhook handlers at `convex/http.ts` for each provider (/webhooks/shipstation, /webhooks/ups, /webhooks/fedex)
- [ ] Webhook signature verification per provider
- [ ] Scheduled polling fallback: every 4h for in-transit, daily for delivered (for 30 days)
- [ ] Cross-carrier status normalization (7 states: pending, picked_up, in_transit, out_for_delivery, delivered, exception, returned)
- [ ] Event dedup by (eventId, timestamp)
- [ ] Out-of-order event handling (timestamp-sorted display)
- [ ] Customer notifications on status changes (email via Email Notification System)
- [ ] Multi-package order-level aggregation (order fulfillmentStatus="fulfilled" when all packages delivered)
- [ ] Public tracking page at `ConvexPress-Website/apps/web/src/routes/_marketing/track.$token.tsx` (uses `trackingToken` — no PII)
- [ ] Admin UI: order detail Tracking tab, Shipments list tracking column, tracking health dashboard
- [ ] 4 events fire: updated, delivered, exception, returned
- [ ] Cron job: `scheduleTrackingSync` every 4h

**D3 Shipping Manifests** ([shipping-manifests-system/PRD.md](../shipping-manifests-system/PRD.md))
- [ ] `commerce_shipment_manifests` table per PRD §4
- [ ] One manifest per {shipFromLocationId, carrierCode, date}
- [ ] Auto-close cron at per-carrier cutoff times (USPS 5pm, UPS 6pm, FedEx 7pm) in location timezone
- [ ] Manual close option for merchants
- [ ] SCAN form PDF generation (USPS) with barcode
- [ ] UPS End-of-Day + FedEx Ground Manifest via provider APIs
- [ ] ShipStation manifests via /v1/manifests
- [ ] DHL: SKIPPED (no manifest support — per capability flags)
- [ ] Labels added after manifest close create next-day manifest
- [ ] Rejected manifest retry flow (up to cutoff)
- [ ] Admin UI at `/admin/commerce/shipping/manifests`
- [ ] 6 events fire per PRD §14

### 6.3 Phase 4 Exit Criteria

- [ ] Full fulfillment loop works E2E in sandbox:
  - Customer places order (uses Phase 2+3 for rates)
  - Merchant buys label (D1)
  - Customer receives tracking notifications (D2)
  - Merchant closes end-of-day manifest (D3)
  - Tracking updates flow in via webhook and scheduled sync
  - Order auto-transitions to fulfilled on delivery
- [ ] All documented events fire and are visible in audit log
- [ ] Zero lost label spend (every purchased label accessible for reprint)

---

## §7 — Phase 5: Migration & Cutover

**Goal:** Remove the feature flag, delete legacy code, confirm production stability.

### 7.1 Pre-Cutover Verification

Before flipping the feature flag to `true` by default:

- [ ] All 25 PRDs fully implemented
- [ ] Every acceptance criterion above met
- [ ] Sandbox E2E passes for all 5 providers
- [ ] Load test: pipeline p95 latency <3s with 5 providers queried in parallel
- [ ] Load test: rate cache hit rate >40%
- [ ] All events visible in audit log
- [ ] Admin UX reviewed for accessibility
- [ ] Documentation published (operator guide, API reference)

### 7.2 Cutover Steps

**Day -14: Enable feature flag for new installs only.** Monitor for 1 week.

**Day -7: Enable feature flag for 10% of existing installs (stratified random sample — include at least 1 high-volume shop).** Monitor rate accuracy, error rates, and support tickets.

**Day 0: Enable feature flag for all remaining installs.** Monitor closely for 48h.

**Day +7: Delete legacy code.** Specifically:
- Remove `@ts-nocheck` from `convex/shipping/actions.ts`
- Delete legacy functions: old `fetchCheckoutRates`, `fetchUpsRatesInternal`, `fetchUspsRatesInternal`, `fetchFedexRatesInternal`, `fetchDhlRatesInternal`, `fetchShipStationRatesInternal`
- Move v2 code: `convex/shipping/v2/*` → `convex/shipping/*` (drop the v2 prefix)
- Delete the `shipping.v2.enabled` feature flag
- Delete redirect/dispatch shims in checkout that selected v1 vs v2

**Day +14: Sunset legacy code in VCS.** Tag the commit that removes legacy code. Update all documentation.

### 7.3 Rollback Plan

If production issues surface during cutover:

- **Immediate:** Flip feature flag off for affected installs (revert to v1)
- **Short-term:** Identify the specific PRD/subsystem failing; disable its capability flag; redeploy
- **Long-term:** Do NOT revert the v2 codebase. Instead, fix forward — the legacy code is documented as DEPRECATED and only exists as an emergency fallback

### 7.4 Post-Cutover Documentation

- [ ] Update `.claude/CLAUDE.md` expert registry: add 3 new experts (Shipping Core, Shipping Methods, Shipping Providers)
- [ ] Deprecate `.codex/docs/COMMERCE-SHIPPING-INTEGRATIONS-ARCHITECTURE.md` (replaced by 25 PRDs)
- [ ] Fold shipping sections from `docs/PRD-CHECKOUT-SYSTEM.md` into pointers to the new PRDs
- [ ] Add `docs/SHIPPING-OPERATOR-GUIDE.md` for merchants
- [ ] Publish API reference for extension developers

---

## §8 — Migration Strategy for Legacy `convex/shipping/actions.ts`

The legacy file is ~3,400 lines with `@ts-nocheck` and `"use node"`. It currently contains:

| Legacy Section | Lines | New Home |
|----------------|-------|----------|
| Credential fetching + decryption | 22–83 | `convex/shipping/v2/providers/_shared/credentials.ts` |
| UPS OAuth | 110–186 | `convex/shipping/v2/providers/ups/auth.ts` |
| USPS OAuth | 188–262 | `convex/shipping/v2/providers/usps/auth.ts` |
| FedEx OAuth | 264–372 | `convex/shipping/v2/providers/fedex/auth.ts` |
| DHL Basic Auth | 290–321 | `convex/shipping/v2/providers/dhl/auth.ts` |
| Service code maps | 374–418, 485–502 | `convex/shipping/v2/providers/{provider}/serviceCodes.ts` |
| UPS Rates | 525–794 | `convex/shipping/v2/providers/ups/rates.ts` |
| USPS Rates | 796–999 | `convex/shipping/v2/providers/usps/rates.ts` |
| FedEx Rates | 1001–1231 | `convex/shipping/v2/providers/fedex/rates.ts` |
| DHL Rates | 1233–1430 | `convex/shipping/v2/providers/dhl/rates.ts` |
| USPS Tracking | 1432–1526 | `convex/shipping/v2/providers/usps/tracking.ts` |
| FedEx Tracking | 1528–1643 | `convex/shipping/v2/providers/fedex/tracking.ts` |
| UPS Labels | 1645–1884 | `convex/shipping/v2/providers/ups/labels.ts` |
| FedEx Labels | 1886–2114 | `convex/shipping/v2/providers/fedex/labels.ts` |
| UPS Tracking | 2116–2214 | `convex/shipping/v2/providers/ups/tracking.ts` |
| ShipStation Rates | 2216–2415 | `convex/shipping/v2/providers/shipstation/rates.ts` |
| ShipStation Labels | 2417–2559 | `convex/shipping/v2/providers/shipstation/labels.ts` |
| ShipStation Tracking | 2561–2662 | `convex/shipping/v2/providers/shipstation/tracking.ts` |
| Provider verification endpoints | 2670+ | `convex/shipping/v2/providers/{provider}/verify.ts` |
| `fetchCheckoutRates` aggregator | 2782–3122 | Replaced by pipeline in `convex/shipping/v2/rates/pipeline.ts` |

Each extraction:
1. Copy logic to new location, refactor to match PRD contract
2. Add typed interfaces (drop the `@ts-nocheck`)
3. Preserve the audit fixes from the earlier session (status codes, response parsing, required fields, service code corrections, residential flag)
4. Add unit tests as the function is extracted
5. Route legacy function to call the new one (delegation) during transition
6. Delete legacy function in Phase 5

---

## §9 — Schema Migration Sequence

New Convex tables introduced, in order:

| Phase | PRD | New Tables |
|-------|-----|------------|
| 1 | A1 | `commerce_shipping_zones` (exists — extend) |
| 1 | A2 | `commerce_shipping_classes` + field on `commerce_products`, `commerce_product_variants` |
| 1 | A3 | `commerce_shipping_packages` (exists — extend) |
| 1 | A4 | `commerce_ship_from_locations` |
| 1 | A5 | `commerce_address_validations` + fields on `commerce_addresses` |
| 1 | A6 | `commerce_shipping_rules` |
| 1 | A7 | `commerce_rate_pipeline_runs` |
| 2 | B1 | `commerce_shipping_method_flat_rate` |
| 2 | B2 | `commerce_shipping_method_weight_based` |
| 2 | B3 | `commerce_shipping_method_dimensional` |
| 2 | B4 | `commerce_shipping_method_price_based` |
| 2 | B5 | `commerce_shipping_method_quantity_based` |
| 2 | B6 | `commerce_shipping_method_free` |
| 2 | B7 | `commerce_shipping_method_local_pickup` |
| 2 | B8 | `commerce_shipping_method_local_delivery` |
| 2 | B9 | `commerce_shipping_method_table_rate` |
| 2 | B10 | (no new tables — contract only) |
| 3 | C1–C5 | (use existing `shipping_provider_connections`, `shipping_provider_secrets`, `shipping_provider_accounts`, `shipping_provider_services`) |
| 4 | D1 | `commerce_shipment_labels` + `commerce_label_batch_jobs` + field extensions on `commerce_shipments` |
| 4 | D2 | `commerce_shipment_tracking_events` + `trackingToken` on shipments (exists) |
| 4 | D3 | `commerce_shipment_manifests` |

**Convention throughout:** All schema changes go into modular files under `convex/schema/shipping.ts` (or new `convex/schema/shipping-*.ts` splits as the file grows). Never modify top-level `schema.ts` — just spread imports. Deploy with `--typecheck=disable` during incremental migrations per project convention.

---

## §10 — Capability Registry

All shipping capabilities use the `admin.shipping.*` prefix (per consistency audit fix). Add these to the Role & Capability System as each PRD lands:

**Core (Phase 1):**
- `admin.shipping.zones.manage`, `admin.shipping.zones.read`
- `admin.shipping.classes.manage`, `admin.shipping.classes.read`
- `admin.shipping.packages.manage`, `admin.shipping.packages.read`
- `admin.shipping.locations.manage`, `admin.shipping.locations.read`
- `admin.shipping.address_validation.manage`, `admin.shipping.address_validation.read`
- `admin.shipping.rules.manage`, `admin.shipping.rules.read`
- `admin.shipping.diagnostics.view`, `admin.shipping.test_rates.run`

**Methods (Phase 2):**
- `admin.shipping.methods.manage`, `admin.shipping.methods.read`
- `admin.shipping.methods.preview`, `admin.shipping.methods.test`, `admin.shipping.methods.quote`

**Providers (Phase 3):**
- `admin.shipping.providers.manage`, `admin.shipping.providers.read`
- `admin.shipping.providers.{provider}.manage` (per C1–C5)
- `admin.shipping.providers.{provider}.test`

**Operations (Phase 4):**
- `admin.shipping.labels.purchase`, `admin.shipping.labels.void`, `admin.shipping.labels.reprint`, `admin.shipping.labels.batch`
- `admin.shipping.tracking.view`, `admin.shipping.tracking.sync`
- `admin.shipping.manifests.view`, `admin.shipping.manifests.close`, `admin.shipping.manifests.reprint`

**Role assignments:**
- Administrator: all capabilities
- Shop Manager: all admin.shipping.* except providers.*.manage (credentials protected)
- Editor/Author: none
- Subscriber: none

---

## §11 — Expert Assignment

Each PRD maps to a ConvexPress expert. Dispatch implementation work via the expert registry (see `.claude/CLAUDE.md`):

| PRD(s) | Existing Expert | Notes |
|--------|----------------|-------|
| A1, A2, A3, A4 | NEW: Shipping Core Expert | **Does not exist yet — create in Phase 5** |
| A5 | NEW: Shipping Core Expert | Same |
| A6 | NEW: Shipping Core Expert | Same |
| A7 | NEW: Shipping Core Expert | Same |
| B1–B10 | NEW: Shipping Methods Expert | **Create in Phase 5** |
| C1–C5 | NEW: Shipping Providers Expert | **Create in Phase 5** |
| D1, D2, D3 | NEW: Shipping Providers Expert | Or split into Shipping Operations Expert |
| Admin UI for all | `experts:admin-settings-ui`, `experts:admin-list-table-ui`, `experts:admin-editor-ui` | Existing |
| Website tracking page | `experts:website-blog-ui` or new `experts:website-tracking-ui` | Existing |
| Event registrations | `experts:event-dispatcher-system` | Existing |
| Role/capability registrations | `experts:role-capability-system` | Existing |
| Email notifications | `experts:email-notification-system` | Existing |
| Audit log entries | `experts:audit-log-system` | Existing |
| Convex deployment | `experts:convex-deployment` | Existing — runs after each phase |

**Action:** Before starting Phase 1, create the 3 new shipping experts via `/create-expert` slash command using the PRDs as input.

---

## §12 — Testing Strategy

### 12.1 Unit Tests

Per PRD: every edge case enumerated in §10 must have a unit test. Tests live alongside the code: `convex/shipping/v2/methods/__tests__/flatRate.test.ts`, etc.

### 12.2 Integration Tests

Per layer:
- **Layer A:** rate pipeline with zero methods → empty result, no errors
- **Layer B:** each method type configured → pipeline returns valid quote
- **Layer C:** each provider with sandbox credentials → live rates normalize correctly
- **Layer D:** full label → tracking → manifest E2E

### 12.3 Contract Compliance (B10)

A B10 contract test suite that every C1–C5 provider must pass. Lives at `convex/shipping/v2/providers/__tests__/contract.test.ts`. Failures block provider PRD acceptance.

### 12.4 Sandbox Tests

Each provider has a sandbox credentials bundle in `.env.example`. CI runs nightly against all sandboxes. Flaky sandbox tests don't block merges but must be tracked.

### 12.5 Load Tests

Before Phase 5 cutover:
- Pipeline with 5 providers, 100 concurrent requests → p95 <3s
- Cache hit rate measurement over 1 week of simulated traffic → >40%
- Label purchase under load → no double-spends

---

## §13 — Monitoring & Observability

### 13.1 Metrics to Track

- Rate calc p50/p95/p99 latency
- Cache hit rate
- Per-provider success/fail counts
- Label purchase success/fail counts
- Void refund latency
- Tracking sync lag (time between carrier event and normalized event)
- Manifest close success rate
- Stale rate error rate (STALE_SHIPPING_RATE thrown at checkout completion)
- Fallback-to-manual rate (how often `fallbackToManualRates===true` fires)

### 13.2 Alerts

- Provider connection health = `error` for >10 min → page on-call
- Rate calc p95 >5s for 10 min → investigate
- Label purchase fail rate >5% per provider → investigate
- Tracking webhook signature verification fails (possible security issue)
- Manifest auto-close failure → notify ops (drivers arriving next morning)

### 13.3 Dashboards

- **Shipping Health Dashboard:** per-provider connection status, last-verified, error count
- **Rate Pipeline Dashboard:** latency, cache hit rate, provider timings
- **Fulfillment Dashboard:** labels purchased, manifests closed, deliveries per day
- **Support Dashboard:** failed deliveries, stale rate errors, customer-facing issues

---

## §14 — Go-Live Checklist

Final sign-off before Phase 5 cutover:

- [ ] All 25 PRDs implemented per acceptance criteria
- [ ] All events registered in Event Dispatcher
- [ ] All capabilities registered in Role & Capability System
- [ ] All cron jobs scheduled and verified
- [ ] All provider sandboxes green for 1 week
- [ ] Admin UX reviewed for accessibility (WCAG 2.1 AA)
- [ ] Load tests pass thresholds in §12.5
- [ ] Rollback plan rehearsed (flag flip in <5 min)
- [ ] Docs published (operator guide, API reference)
- [ ] 3 new experts registered in `.claude/CLAUDE.md`
- [ ] Legacy `@ts-nocheck` removed
- [ ] `.codex/docs/COMMERCE-SHIPPING-INTEGRATIONS-ARCHITECTURE.md` deprecated
- [ ] Support team trained on new admin UI
- [ ] Merchants in pilot cohort notified and onboarded

---

## §15 — Known Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Provider API breaking change mid-build | Medium | High | Provider adapters isolate change to one file; contract tests catch regressions |
| Carrier sandbox unavailable | Medium | Medium | Mock server at `convex/shipping/v2/_test/mockServer.ts` — tests don't depend on sandboxes |
| Performance regression at scale | Low | High | Load tests required before Phase 5; feature flag allows instant rollback |
| Schema migration conflict | Medium | Medium | Convex `--typecheck=disable` during incremental builds; deploy per-phase |
| Merchant data loss during cutover | Low | Critical | No destructive migrations; legacy data read-only during v2 transition |
| Customer overcharged/undercharged due to stale rate | Low | High | Fingerprint validation already implemented; STALE_SHIPPING_RATE error prevents bad checkout |
| Label purchase double-charge on retry | Medium | High | Idempotency keys required per PRD D1 |
| Webhook signature spoofing | Low | Critical | Signature verification mandatory per provider per PRD C1–C5 |
| Token refresh storms | Medium | Medium | Token caching with jittered refresh windows per PRD C2, C4 |

---

## §16 — Estimated Effort

| Phase | Sequential Effort (1 engineer) | Parallel Effort (3 engineers) |
|-------|-------------------------------|-------------------------------|
| Phase 0 (Prep) | 3 days | 3 days |
| Phase 1 (Layer A) | 4 weeks | 2 weeks |
| Phase 2 (Layer B) | 5 weeks | 2 weeks |
| Phase 3 (Layer C) | 5 weeks | 2 weeks |
| Phase 4 (Layer D) | 3 weeks | 1.5 weeks |
| Phase 5 (Cutover) | 2 weeks | 2 weeks |
| **Total** | **~5 months** | **~10 weeks** |

---

## §17 — Next Actions After Approval

**Immediately:**
1. Create feature branch `feat/shipping-v2`
2. Add `shipping.v2.enabled` setting (default `false`)
3. Create `convex/shipping/v2/` directory with README pointer to this doc
4. Dispatch `experts:convex-deployment` to verify schema deployability

**Within first week:**
1. Build test harness per §2.3
2. Create the 3 new shipping experts per §11
3. Start Phase 1 — begin with A1 Shipping Zones

**Ongoing:**
1. Every PRD completion: update this doc with acceptance status
2. After every phase exit: run regression suite against v1 (flag off)
3. Weekly: review monitoring metrics

---

## §18 — Source of Truth

- **WHAT to build:** 25 PRDs in this directory tree
- **WHEN / ORDER:** this document
- **HOW to integrate:** PRDs' §6 Functions/API sections + this doc's §8 Migration Strategy
- **VERIFICATION:** acceptance criteria per §3.2, §4.2, §5.2, §6.2
- **CUTOVER:** §7 Phase 5 playbook

Questions about a PRD → read the PRD. Questions about sequencing → read this doc. Questions about WooCommerce parity → `README.md` §WooCommerce Parity Checklist.
