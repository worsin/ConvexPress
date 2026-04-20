# ConvexPress Shipping System — Master Index

**Status:** PRD set complete (25 PRDs + this index)
**Last Updated:** 2026-04-14
**Scope:** Entire shipping subsystem of `commerce` — from zone configuration to label purchase to end-of-day manifests
**Model:** WooCommerce parity baseline + modern multi-carrier stack (Shopify/ShipStation patterns)

---

## Purpose

This index is the **single entry point** for the ConvexPress shipping system. It answers:

1. Where is the PRD for subsystem X?
2. What depends on what? (dependency graph)
3. In what order should things be built?
4. What does each subsystem do? (glossary)
5. Which PRD covers a specific merchant feature?

Read the linked PRDs for full implementation detail. Each PRD is independently executable and contains its own schema, API, admin UX, edge cases, and success criteria.

---

## The 25 PRDs

### Layer A — Core Infrastructure (7)

Foundational. Every method type and provider depends on these. Build first.

| ID | System | PRD | Status |
|----|--------|-----|--------|
| A1 | Shipping Zones | [shipping-zones-system/PRD.md](../shipping-zones-system/PRD.md) | Design complete |
| A2 | Shipping Classes | [shipping-classes-system/PRD.md](../shipping-classes-system/PRD.md) | Design complete |
| A3 | Shipping Packages & Box Templates | [shipping-packages-system/PRD.md](../shipping-packages-system/PRD.md) | Design complete |
| A4 | Ship-From Locations (Warehouses) | [ship-from-locations-system/PRD.md](../ship-from-locations-system/PRD.md) | Design complete |
| A5 | Address Validation Service | [address-validation-system/PRD.md](../address-validation-system/PRD.md) | Design complete |
| A6 | Shipping Rules Engine | [shipping-rules-engine/PRD.md](../shipping-rules-engine/PRD.md) | Design complete |
| A7 | Rate Calculation Pipeline | [rate-calculation-pipeline/PRD.md](../rate-calculation-pipeline/PRD.md) | Design complete |

### Layer B — Shipping Method Types (10)

Rate calculation strategies. Each is a pluggable method type a merchant can attach to a zone.

| ID | Method | PRD | Status |
|----|--------|-----|--------|
| B1 | Flat Rate Shipping | [shipping-method-flat-rate/PRD.md](../shipping-method-flat-rate/PRD.md) | Design complete |
| B2 | Weight-Based Shipping | [shipping-method-weight-based/PRD.md](../shipping-method-weight-based/PRD.md) | Design complete |
| B3 | Dimensional (DIM Weight) Shipping | [shipping-method-dimensional/PRD.md](../shipping-method-dimensional/PRD.md) | Design complete |
| B4 | Price-Based Shipping | [shipping-method-price-based/PRD.md](../shipping-method-price-based/PRD.md) | Design complete |
| B5 | Quantity-Based Shipping | [shipping-method-quantity-based/PRD.md](../shipping-method-quantity-based/PRD.md) | Design complete |
| B6 | Free Shipping | [shipping-method-free/PRD.md](../shipping-method-free/PRD.md) | Design complete |
| B7 | Local Pickup | [shipping-method-local-pickup/PRD.md](../shipping-method-local-pickup/PRD.md) | Design complete |
| B8 | Local Delivery | [shipping-method-local-delivery/PRD.md](../shipping-method-local-delivery/PRD.md) | Design complete |
| B9 | Table Rate Shipping | [shipping-method-table-rate/PRD.md](../shipping-method-table-rate/PRD.md) | Design complete |
| B10 | Live Rate Shipping (Abstract Contract) | [shipping-method-live-rate/PRD.md](../shipping-method-live-rate/PRD.md) | Design complete |

### Layer C — Shipping Providers (5)

Each is a concrete implementation of the Live Rate contract (B10).

| ID | Provider | PRD | Capabilities | Status |
|----|----------|-----|--------------|--------|
| C1 | ShipStation (ShipEngine API) | [shipping-provider-shipstation/PRD.md](../shipping-provider-shipstation/PRD.md) | rates✓ labels✓ tracking✓ manifests✓ addr-val✓ | Design complete |
| C2 | UPS | [shipping-provider-ups/PRD.md](../shipping-provider-ups/PRD.md) | rates✓ labels✓ tracking✓ manifests✗ addr-val✓ | Design complete |
| C3 | USPS | [shipping-provider-usps/PRD.md](../shipping-provider-usps/PRD.md) | rates✓ labels✗* tracking✓ manifests✗ addr-val✓ | Design complete |
| C4 | FedEx | [shipping-provider-fedex/PRD.md](../shipping-provider-fedex/PRD.md) | rates✓ labels✓ tracking✓ manifests✗ addr-val✓ | Design complete |
| C5 | DHL Express | [shipping-provider-dhl/PRD.md](../shipping-provider-dhl/PRD.md) | rates✓ labels✗ tracking✗ manifests✗ addr-val✗ | Design complete |

*USPS labels pending USPS Labels v3 integration (see C3 PRD §2.2).

### Layer D — Operational Subsystems (3)

Post-checkout operations on top of providers.

| ID | System | PRD | Status |
|----|--------|-----|--------|
| D1 | Shipping Labels | [shipping-labels-system/PRD.md](../shipping-labels-system/PRD.md) | Design complete |
| D2 | Shipping Tracking | [shipping-tracking-system/PRD.md](../shipping-tracking-system/PRD.md) | Design complete |
| D3 | Shipping Manifests & End-of-Day | [shipping-manifests-system/PRD.md](../shipping-manifests-system/PRD.md) | Design complete |

---

## Dependency Graph

```
                                Checkout System
                                      │
                                      ▼
                     ┌────────────────────────────────┐
                     │  A7  Rate Calculation Pipeline │
                     └────────────────────────────────┘
                                      │
              ┌───────────────────────┼───────────────────────┐
              │                       │                       │
              ▼                       ▼                       ▼
     ┌────────────────┐      ┌────────────────┐     ┌────────────────┐
     │ Layer A core   │      │ Layer B methods│     │ Layer C provs  │
     │                │      │                │     │ (impl B10)     │
     │ A1 Zones       │      │ B1  Flat       │     │ C1 ShipStation │
     │ A2 Classes     │◄─────│ B2  Weight     │────►│ C2 UPS         │
     │ A3 Packages    │      │ B3  Dim        │     │ C3 USPS        │
     │ A4 ShipFrom    │      │ B4  Price      │     │ C4 FedEx       │
     │ A5 AddrVal     │      │ B5  Quantity   │     │ C5 DHL         │
     │ A6 Rules       │      │ B6  Free       │     └────────┬───────┘
     └────────────────┘      │ B7  LocalPickup│              │
                             │ B8  LocalDeliv │              │
                             │ B9  TableRate  │              │
                             │ B10 LiveRate*  │              │
                             └────────────────┘              │
                                                             ▼
                                                    ┌────────────────┐
                                                    │ Layer D ops    │
                                                    │                │
                                                    │ D1 Labels      │
                                                    │ D2 Tracking    │
                                                    │ D3 Manifests   │
                                                    └────────────────┘

* B10 = abstract contract only; concrete work in C1–C5
```

### Explicit Dependencies

**Layer A** has no upstream shipping-PRD dependencies (depends only on external systems: Product Catalog, Settings, Auth).

**Layer B** depends on Layer A:
- B1 Flat → A1, A2, A6, A7
- B2 Weight → A1, A2, A3, A6, A7
- B3 Dimensional → A1, A2, A3, A6, A7, B2 (sibling tier structure)
- B4 Price → A1, A6, A7
- B5 Quantity → A1, A2, A6, A7, B2 (sibling tier structure)
- B6 Free → A1, A2, A6, A7
- B7 Local Pickup → A1, A4, A6, A7
- B8 Local Delivery → A1, A4, A5 (geocoding), A6, A7
- B9 Table Rate → A1, A2, A3, A6 (heavy consumer), A7, B1–B5 (pricing formulas)
- B10 Live Rate (abstract) → A3, A5, A7

**Layer C** implements B10 and depends on Layer A:
- C1 ShipStation → B10, A3, A5, A7
- C2 UPS → B10, A3, A5, A7
- C3 USPS → B10, A3, A5, A7
- C4 FedEx → B10, A3, A5, A7
- C5 DHL → B10, A3, A5, A7

**Layer D** depends on Layers A and C:
- D1 Labels → A4, A5, B10, C1, C2, C4 (label-supporting providers), Order Management
- D2 Tracking → B10, C1, C2, C3, C4, D1, Order Management, Email Notification
- D3 Manifests → A4, C1, C2, C4 (manifest-supporting providers), D1

### No Cycles

The dependency graph is a DAG. Build order A → B → C → D is safe.

---

## Build Order

### Phase 1 — Foundation (Layer A)

Build in this order inside Phase 1:

1. **A1 Zones** (no deps)
2. **A2 Classes** (no shipping deps)
3. **A3 Packages** (no shipping deps — can run in parallel with A2)
4. **A4 Ship-From Locations** (no shipping deps — can run in parallel)
5. **A5 Address Validation** (no shipping deps — can run in parallel)
6. **A6 Rules Engine** (no shipping deps — can run in parallel)
7. **A7 Rate Calculation Pipeline** (depends on A1–A6 — must be last in Phase 1)

At end of Phase 1, the rate pipeline can run with only manual/built-in methods (no live rates yet).

### Phase 2 — Methods (Layer B)

Once Layer A is complete, methods can be built mostly in parallel:

- **B1 Flat** (simplest — start here)
- **B2 Weight-Based** (most requested — HIGH PRIORITY)
- **B4 Price-Based** (common pattern)
- **B5 Quantity-Based** (similar to B2)
- **B6 Free Shipping** (common pattern)
- **B3 Dimensional** (depends on B2 tier structure)
- **B7 Local Pickup**
- **B8 Local Delivery**
- **B10 Live Rate contract** (abstract — defines interface for Phase 3)
- **B9 Table Rate** (most complex — build last in Phase 2)

At end of Phase 2, merchants can configure every non-live-rate shipping method. WooCommerce parity achieved.

### Phase 3 — Providers (Layer C)

Implement B10 contract for each provider:

1. **C1 ShipStation** (reference implementation — first)
2. **C2 UPS**, **C4 FedEx** (major direct carriers — parallel)
3. **C3 USPS** (rates first; labels later)
4. **C5 DHL** (rates only initially)

Each provider can be built in parallel once B10 is defined.

### Phase 4 — Operations (Layer D)

1. **D1 Labels** (enables fulfillment)
2. **D2 Tracking** (enables post-ship visibility — depends on D1)
3. **D3 Manifests** (high-volume merchant feature — can be last)

---

## Quick Merchant Feature → PRD Lookup

| Merchant wants to... | PRD(s) |
|----------------------|--------|
| Charge $5 flat shipping everywhere | B1 Flat Rate |
| Charge different rates by cart weight | **B2 Weight-Based** |
| Charge DIM weight to match carrier pricing | B3 Dimensional |
| Offer free shipping over $X | B6 Free Shipping (or B4 Price-Based with $0 top tier) |
| Restrict shipping to certain countries/states | A1 Zones |
| Charge more for oversized/fragile items | A2 Classes + B1/B2/B3 |
| Offer same-day local delivery | B8 Local Delivery |
| Offer in-store pickup | B7 Local Pickup |
| Show live UPS/USPS/FedEx rates | B10 + C1–C5 |
| Use ShipStation for labels | C1 + D1 |
| Buy shipping labels in bulk | D1 Labels (batch workflow) |
| Print a USPS SCAN form for daily pickup | D3 Manifests |
| Let customers track their packages | D2 Tracking |
| Configure complex rules like "weight + zone + class" | B9 Table Rate (uses A6) |
| Validate addresses before shipping | A5 Address Validation |
| Ship from multiple warehouses | A4 Ship-From Locations |
| Use custom boxes for DIM calc | A3 Packages |
| Build conditions like "IF coupon + zone + tag" | A6 Rules Engine |

---

## WooCommerce Parity Checklist

Every shipping feature a WooCommerce merchant can configure out-of-the-box (no paid extensions) is covered:

| WooCommerce Feature | ConvexPress PRD |
|---------------------|-----------------|
| Shipping Zones | A1 |
| Shipping Classes | A2 |
| Flat Rate Shipping | B1 |
| Free Shipping | B6 |
| Local Pickup | B7 |
| Weight-Based (via Table Rate plugin) | B2 + B9 |
| DIM Weight (via third-party plugins) | B3 |
| Price-Based Min Amount | B4 / B6 |
| Qty-Based (via plugins) | B5 |
| Table Rate (paid plugin — Woo.com Table Rate Shipping) | B9 |
| Live Carrier Rates (WooCommerce Shipping plugin) | B10 + C1–C5 |

Beyond WooCommerce parity, ConvexPress also covers:

- Address validation (A5) — usually a paid extension in WooCommerce
- Multi-warehouse (A4) — paid extension in WooCommerce
- Rules Engine for all methods (A6) — only available via Table Rate in WooCommerce
- Unified label purchase across carriers (D1)
- End-of-day manifests (D3) — usually per-carrier plugins in WooCommerce

---

## Glossary

| Term | Definition |
|------|-----------|
| **Zone** | Geographic region with country/state/postcode rules. Methods attach to zones. |
| **Shipping Class** | Per-product classification (e.g., "Fragile") for differentiated rates. |
| **Package** | Box template with dimensions and tare weight, used for DIM calc and carrier requests. |
| **Ship-From Location** | Warehouse / fulfillment origin. Merchant may have multiple. |
| **Method (Method Type)** | A rate calculation strategy. Merchants attach instances to zones. |
| **Provider (Carrier Adapter)** | External carrier API integration (UPS, USPS, FedEx, DHL, ShipStation). |
| **Quote** | A single rate result from a method or provider. Has fingerprints to detect staleness. |
| **Rate Calculation Pipeline** | The orchestrator that turns cart + address into quotes. |
| **Rules Engine** | Declarative predicate evaluator used by all methods for conditional logic. |
| **Billable Weight** | MAX(actual weight, DIM weight). What carriers actually charge for. |
| **DIM Weight** | Dimensional weight = (L × W × H) / divisor. Standard divisor 139 (US domestic). |
| **Bin-Packing** | Algorithm that assigns cart items to boxes, possibly splitting across multiple. |
| **Tier** | A row in a weight/price/quantity table: {minRange, maxRange, cost}. |
| **Match Mode** | How Table Rate picks among matching rows: first_match / all_matches_sum / cheapest_match. |
| **Fingerprint (addressKey / cartKey)** | Deterministic hash of address/cart used to detect stale quotes. |
| **Fallback to Manual Rates** | Merchant opt-in: when live rates fail, show manual methods. Default is fail-closed. |
| **Manifest / SCAN Form** | End-of-day document carriers need for bulk driver pickup. |
| **Residential Flag** | Whether destination is residential — affects carrier surcharges. |
| **Capability Flags** | Per-provider: supports_rates, supports_labels, supports_tracking, supports_manifests, supports_address_validation. |
| **Void Window** | Time period after label purchase during which merchant can void for refund. Varies by carrier (UPS ~24h, FedEx ~14d). |
| **NormalizedShippingQuote** | Universal quote shape produced by all methods and providers. See B10. |

---

## Total Scope Summary

| Metric | Count |
|--------|-------|
| Total PRDs | 25 |
| Total Layer A PRDs | 7 |
| Total Layer B PRDs | 10 |
| Total Layer C PRDs | 5 |
| Total Layer D PRDs | 3 |
| Total line count (approx) | ~17,500 lines |
| Shipping method types supported | 10 (flat, weight, dim, price, qty, free, pickup, local-deliv, table-rate, live-rate) |
| Shipping providers supported | 5 (ShipStation, UPS, USPS, FedEx, DHL) |
| Convex tables introduced across all PRDs | ~20 (zones, classes, class-assignments, packages, ship-from, address-validations, rules, rate-runs, 10 method tables, provider-connections, provider-secrets, provider-accounts, provider-services, rate-quotes, shipments, shipment-labels, tracking-events, manifests) |

---

## PRD Authoring Convention

Every PRD in this set follows the same 15-section template:

1. Context & Intent
2. Scope (in-scope / out-of-scope)
3. Dependencies (upstream / downstream by PRD ID)
4. Schema (Convex modular schema)
5. Data Model
6. Functions/API
7. Admin UX
8. Merchant Workflow
9. Storefront UX
10. Edge Cases & Error Handling
11. Testing Requirements
12. Success Criteria
13. Roles & Capabilities
14. Events Fired
15. References

Cross-references between PRDs always use PRD IDs (A1, B2, C3, etc.).

---

## What's NOT in This Set

The following are intentionally out of scope and belong in separate PRD sets:

- **Returns & RMAs** — belongs in `commerce-returns` system (not shipping-specific)
- **Customs declarations** — future enhancement (primarily DHL/UPS international)
- **Pickup scheduling with drivers** — future enhancement
- **Third-party courier integration (DoorDash Drive, Uber Direct)** — separate provider type, future PRD
- **Freight/LTL shipping** — out of scope (different carrier product entirely)
- **Dropshipping routing** — future commerce-dropshipping system
- **Shipping insurance** — optional per-shipment upsell, future PRD
- **Shipping-based tax calculation** — covered by `commerce-tax` system
- **Shipping invoicing / billing** — covered by `commerce-billing` / `commerce-payments`
- **Post-purchase delivery SMS notifications** — extension to D2 Tracking, future enhancement

---

## Status (post-cutover)

All 25 subsystems have landed under `convex/shipping/*`. The former
`convex/shipping/v2/` prefix was removed during Phase 13.5. Legacy
`actions.ts` has been shrunk from ~3,400 lines to ~2,000 lines: the dead
rate-fetcher aggregator is deleted; what remains is OAuth helpers, direct
carrier label purchase internals, tracking sync internals, and the verify
actions wired into the admin UI. The `v2Enabled` feature flag is gone —
checkout always routes through the rate pipeline.

Remaining architectural cleanup (tracked per subsystem PRD):

1. **Real address validation providers** — A5's USPS/SmartyStreets/Google
   chain remains a fail-open stub.
2. **Deprecate `.codex/docs/COMMERCE-SHIPPING-INTEGRATIONS-ARCHITECTURE.md`** —
   superseded by this PRD set.
3. **Expert registry additions** — Shipping Core (Layer A), Shipping
   Methods (Layer B), Shipping Providers (Layers C+D).
4. **WooCommerce parity audit** — verify every feature against the parity
   checklist once tester rollout produces real merchant feedback.
