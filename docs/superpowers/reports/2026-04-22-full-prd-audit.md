# Full PRD Audit — 72 Systems

**Date:** 2026-04-22

## Parity check: Airtable ↔ disk

- **Airtable Systems table:** 72 records ✅
- **`specs/ConvexPress/systems/<slug>/PRD.md`:** 72 files mapping 1:1 to Airtable systems ✅ (after slug overrides — see below)
- **Extra directories** (not backed by Airtable): 24 sub-specs under `specs/ConvexPress/systems/` — all legitimate shipping/product sub-docs rolling up under broader Airtable entries (e.g. the 11 `shipping-method-*` PRDs all live under Airtable's "Shipping Rate Engine").

## Slug mismatches (Airtable Name slug → disk path)

These mismatches are real and will break any automated link between Airtable records and PRD paths. Either rename disk dirs or rename Airtable records.

| Airtable slug | Disk slug |
|---|---|
| `reviews-and-ratings-system` | `reviews-ratings-system` |
| `role-and-capability-system` | `role-capability-system` |
| `shipping-zone-system` | `shipping-zones-system` |
| `dhl-express-integration` | `shipping-provider-dhl` |
| `fedex-direct-integration` | `shipping-provider-fedex` |
| `ups-direct-integration` | `shipping-provider-ups` |
| `usps-direct-integration` | `shipping-provider-usps` |
| `shipstation-integration` | `shipping-provider-shipstation` |
| `shipping-rate-engine` | `shipping-rules-engine` (best guess — may need manual disambiguation) |

## Two-tier PRD architecture

- **25 "real" PRDs** in `specs/ConvexPress/systems/<slug>/PRD.md` with full content (150-1600 lines each). These are the VexCart migrations + shipping/AI/page/etc.
- **47 "scaffold" PRDs** — 42-line canonical-path placeholders created during the Codex parity pass. Their real content lives in `.codex/docs/<NAME>.md` and/or `.claude/docs/<NAME>.md`.

## Coverage across all 3 doc locations

(PRD.md + `.codex/docs/` + `.claude/docs/` — best match per system)

- **53 systems covered** — at least one location has ≥100 lines of real content.
- **19 systems deficient** — every source is a stub (≤42 lines).

## The 19 systems with genuinely missing PRD content

These need real content written before implementation can proceed against them:

### Knowledge Base cluster (4)
- **KB Article System**
- **KB Category System**
- **KB Collections System**
- **KB Search & Analytics**

### Support + Ticketing cluster (6)
- **Support Analytics System**
- **Support Integration System**
- **Support Deflection System**
- **Ticket Agent Tools**
- **Ticket Lifecycle System**
- **Ticket Widget System**

### Commerce cluster (4)
- **Tax System**
- **Discount System**
- **Returns & Refunds System**
- **Subscription Billing System** (overlaps with Commerce Subscriptions — may be consolidable)

### Entitlement / access cluster (2)
- **Subscription Entitlement System** (overlaps with Membership + Commerce Subscriptions)
- **Content Restriction System** (overlaps with Membership)

### Integrations (2)
- **WordPress Sync System** (code exists, spec thin — see `.codex/docs/WORDPRESS-WOOCOMMERCE-SYNC-*` for partial content)
- **Airtable Sync System**

### Content (1)
- **Recipe System**

## Structural issues in the 25 real PRDs

The migrated commerce PRDs are in good shape after the 2026-04-22 tuning pass — Banner v2, Integration-with-ConvexPress sections, and cross-refs updated.

Remaining per-PRD work (body content, not structural):
- Business-context strings like "Virtual Overseer's virtual employee service" (subscription PRD) — residual VexCart use-case language.
- Capability codes: verify PRD tables against `capabilities.ts`.
- Schema table names: verify against `schema/commerce.ts`.
- Role slugs: some body text still uses `customer`/`admin`/`merchant` instead of WP-5.

## Recommended Wave 11 scope (refined)

Before any new feature work, address the two structural gaps:

1. **Slug reconciliation** — pick one (Airtable rename OR disk rename) for the 9 mismatches. Add a `specs/ConvexPress/systems/README.md` mapping table if ambiguity persists.
2. **Fill the 19 deficient PRDs.** Priority order by business impact + overlap with in-flight work:
   - **Tax System + Discount System** (next planned wave; commerce foundation)
   - **Returns & Refunds System** (commerce, legal obligation)
   - **Subscription Entitlement System + Content Restriction System** (consolidate into Membership Plan + Commerce Subscriptions — may become "delete these Airtable rows" rather than "write PRDs")
   - **Subscription Billing System** (same — consolidate into Commerce Subscriptions)
   - **WordPress Sync System** (has partial `.codex/docs/WORDPRESS-WOOCOMMERCE-SYNC-*` content to unify into a proper PRD)
   - **KB + Support + Ticket systems** (4+6 = 10 PRDs — these are related, should probably be speced together)
   - **Airtable Sync System + Recipe System** (low priority; niche)

Decision needed per pair: "write a full PRD" vs "consolidate into a sibling system and retire the Airtable record."
