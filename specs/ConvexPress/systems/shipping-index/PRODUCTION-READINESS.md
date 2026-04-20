# Shipping System — Production Readiness Roadmap (ARCHIVED)

> **⚠️ ARCHIVED — POST-CUTOVER:** This doc was written pre-Phase-13 with
> assumptions that no longer hold (v2 folder prefix, `v2Enabled` feature
> flag, split legacy/v2 paths). The cutover has since landed: folders
> renamed, flag removed, legacy rate fetchers deleted, providers decrypt
> credentials correctly, UPS v2 rates live, quotes persist, class and
> ship-from resolution wired into the pipeline. For the current state,
> see `README.md` "Status (post-cutover)" and `POST-LAUNCH-FIXES.md`.

---

## Pre-flight status — PRE-CUTOVER SNAPSHOT

| Layer | Status |
|-------|--------|
| 25 PRDs designed + consistency-audited | DONE |
| Schema (18 tables) deployed-ready | DONE |
| Layer A backend (zones, classes, packages, ship-from, address-validation, rules, rate pipeline) | DONE |
| Layer B method calculators (10 method types) | DONE |
| Layer C provider adapter shells (5 providers) | SHELL ONLY — no real HTTP |
| Layer D backend (labels, tracking, manifests) | MUTATIONS/QUERIES DONE — actions/webhooks/crons missing |
| Capability registry (34 caps) | DONE |
| Feature flag `v2Enabled` + checkout dispatch | DONE |
| Audit fixes preserved across migration | DONE |

**The v2 pipeline runs end-to-end but returns empty live-rate quotes** because providers don't talk to carriers. Fixing that is Phase 6 below.

---

## Build order — what comes next, in strict sequence

Each phase is gated. Do not start phase N+1 until phase N's exit criteria pass. Some items within a phase parallelize.

### Phase 6 — Make providers actually work (highest ROI)

**Goal:** v2 returns real live rates from at least one provider end-to-end.

- [ ] **6.1 Port ShipStation rate fetching** — copy logic from legacy `actions.ts:2216-2415` into `v2/providers/shipstation/rates.ts`. Drop @ts-nocheck. Consume PRD A3 packed boxes for dimensions. Preserve audit fixes (rate_response.rates parse path).
- [ ] **6.2 Wire pipeline → providers** — in `v2/rates/pipeline.ts`, after zone match, load enabled providers from `shipping_provider_connections`, call each provider's `fetchRates()` in parallel with 5s timeout, aggregate, rank.
- [ ] **6.3 Smoke test ShipStation** — toggle `v2Enabled=true` on local install, run a real cart through checkout against ShipStation sandbox. Confirm ranked normalized quotes appear.
- [ ] **6.4 Port UPS rates + OAuth + token cache** — `actions.ts:110-186 + 525-794` → `v2/providers/ups/{auth,rates,tokenCache}.ts`. 4h token cache.
- [ ] **6.5 Port USPS rates + OAuth** — `actions.ts:188-262 + 796-999` → `v2/providers/usps/{auth,rates}.ts`. Preserve required fields fix + rateOptions parse.
- [ ] **6.6 Port FedEx rates + OAuth + token cache** — `actions.ts:264-372 + 1001-1231` → `v2/providers/fedex/{auth,rates,tokenCache}.ts`. 1h token cache (NEW — wasn't cached in legacy).
- [ ] **6.7 Port DHL rates + Basic Auth** — `actions.ts:290-321 + 1233-1430` → `v2/providers/dhl/{auth,rates}.ts`. Dimensions from A3, not 20×15×10.
- [ ] **6.8 Pipeline → method calculators** — in pipeline, after providers, also iterate enabled non-live methods (zones×methods join), call B1-B9 calculators with cart context.
- [ ] **6.9 Multi-package splitting** — when A3 bin-packing returns N boxes, send rate request per box and sum. Already designed in pipeline; needs wiring.
- [ ] **6.10 Address fingerprint + cart fingerprint stamping** — verify every quote leaving the pipeline has addressKey + cartKey set (already implemented in helpers; verify pipeline propagates).

**Phase 6 exit:** real rates from all 5 providers visible in checkout when v2 flag enabled. ~3000 lines of port work.

### Phase 7 — Operational layers fully working (labels, tracking, manifests)

**Goal:** merchant can buy a label, customer sees tracking, end-of-day manifest closes.

- [ ] **7.1 Port label purchase actions** — `actions.ts:2417-2559 (ShipStation)`, `1645-1884 (UPS)`, `1886-2114 (FedEx)` → `v2/providers/{provider}/labels.ts`. Plus generic `v2/labels/actions.ts` action that dispatches by provider.
- [ ] **7.2 Label storage in Convex `_storage`** — implement label binary upload using ctx.storage.store(). Return storage ID, store on commerce_shipment_labels.labelFileStorageId.
- [ ] **7.3 Rate-reconfirmation on purchase** — verify quote not expired, addressKey/cartKey still valid before purchase. Throws STALE_SHIPPING_RATE if changed.
- [ ] **7.4 Void label flow** — for each provider that supports void, port void endpoint + refund-tracking polling.
- [ ] **7.5 Webhook handler routes in `convex/http.ts`** — `/webhooks/shipstation`, `/webhooks/fedex`, `/webhooks/ups` (where supported). HMAC signature verification per provider.
- [ ] **7.6 Tracking sync action** — `v2/tracking/actions.ts` calls each provider's trackShipment() for in-transit shipments. Calls recordTrackingEvent (already built).
- [ ] **7.7 Cron: tracking sync** — `convex/crons.ts` schedules trackingSync every 4h for in-transit shipments, daily for delivered (30d retention).
- [ ] **7.8 Order auto-status update** — after recordTrackingEvent → "delivered" for all shipment packages, patch order.fulfillmentStatus = "fulfilled".
- [ ] **7.9 Customer notification on tracking events** — emit event → email notification system → customer email.
- [ ] **7.10 Public tracking page on website app** — `ConvexPress-Website/apps/web/src/routes/_marketing/track.$token.tsx`. Uses publicTracking query (already built). Timeline UI.
- [ ] **7.11 Manifest auto-close cron** — `convex/crons.ts` runs hourly, checks each location/carrier combo for cutoff time in location timezone, calls closeManifest.
- [ ] **7.12 Manifest provider submission** — `v2/manifests/actions.ts` per-provider submit endpoint. ShipStation `/v1/manifests`, UPS End-of-Day, FedEx Ground Manifest.
- [ ] **7.13 SCAN form PDF generation** — for USPS via ShipStation, generate SCAN form PDF binary, store in Convex `_storage`.

**Phase 7 exit:** full fulfillment loop works in sandbox: cart → label → tracking events → delivery → manifest closed.

### Phase 8 — Observability (events + audit log wiring)

**Goal:** every state change traceable. Required before production.

- [ ] **8.1 Decide event namespace** — extend dispatcher to allow 3-segment OR map all PRD names to 2-segment. **Recommendation:** map to 2-segment (`shipping.zone_created`) — smaller change, no other system needs 3-segment.
- [ ] **8.2 Add event constants** — `convex/events/constants.ts` gets ~50 new shipping event names.
- [ ] **8.3 Wire emitEvent in v2 mutations** — find every `// TODO(shipping-v2 events/audit pass)` marker, insert emitEvent call. Per PRD §14 of each system.
- [ ] **8.4 Wire audit log writes** — same locations, write audit log row with actor, action, target, before/after.
- [ ] **8.5 Verify event flow** — fire each event manually, confirm it appears in event dispatcher, audit log.

**Phase 8 exit:** every shipping mutation emits an event AND writes an audit row.

### Phase 9 — Admin UI (the largest block)

**Goal:** merchants can configure everything via the UI, no code or convex calls required.

This phase parallelizes well — different engineers can take different routes simultaneously.

**9.A Settings infrastructure**

- [ ] **9.A.1 Settings nav extensions** — add Shipping subsection to `apps/web/src/lib/admin-shell/nav-config.ts`: Zones, Classes, Packages, Locations, Address Validation, Rules, Test Rates, Manifests.

**9.B Layer A admin pages**

- [ ] **9.B.1 Zones list + editor** at `/admin/commerce/settings/shipping/zones`
- [ ] **9.B.2 Classes manager** at `/admin/commerce/settings/shipping/classes`
- [ ] **9.B.3 Packages list + editor** at `/admin/commerce/settings/shipping/packages` (already stub exists)
- [ ] **9.B.4 Ship-from locations** at `/admin/commerce/settings/shipping/locations`
- [ ] **9.B.5 Address validation settings** at `/admin/commerce/settings/shipping/address-validation`
- [ ] **9.B.6 Rule builder component** in `apps/web/src/components/shipping/RuleBuilder.tsx` — reusable
- [ ] **9.B.7 Test rates page** at `/admin/commerce/settings/shipping/test-rates`

**9.C Layer B method editors (embedded under Zone editor)**

- [ ] **9.C.1 Method type selector + B1-B10 editor cards** — under each zone, list attached methods, "Add Method" picker. Each method type has its own form component reused as needed.

**9.D Layer C provider pages**

- [ ] **9.D.1 ShipStation credentials page** at `/admin/settings/integrations/shipping/shipstation`
- [ ] **9.D.2 UPS credentials page** — same pattern
- [ ] **9.D.3 USPS credentials page**
- [ ] **9.D.4 FedEx credentials page**
- [ ] **9.D.5 DHL credentials page**

**9.E Layer D operational pages**

- [ ] **9.E.1 Order detail Labels tab** — purchase, void, reprint, multi-package
- [ ] **9.E.2 Orders list bulk actions** — "Print Labels", "Void Labels"
- [ ] **9.E.3 Batch Labels page** at `/admin/commerce/shipping/labels`
- [ ] **9.E.4 Order detail Tracking tab** — timeline of events
- [ ] **9.E.5 Tracking health dashboard**
- [ ] **9.E.6 Manifests page** at `/admin/commerce/shipping/manifests`

**Product editor extensions (cross-cutting)**

- [ ] **9.F.1 Add shipping class field** to product editor
- [ ] **9.F.2 Add preferredPackageId field** to product editor
- [ ] **9.F.3 Add shipsInOwnBox toggle** to product editor
- [ ] **9.F.4 Add per-variant shipping class override** to variant table

**Phase 9 exit:** full admin UI for all 25 PRDs. Merchant can do everything from the UI.

### Phase 10 — Tests

**Goal:** confidence to flip the feature flag in production.

- [ ] **10.1 Helper unit tests** — zone postcode grammar, bin-packing, distance, address fingerprint, status normalization (5 carrier mappings)
- [ ] **10.2 Rules engine operator matrix** — every operator × representative inputs
- [ ] **10.3 Method calculator tests** — every B1-B9 method × every documented edge case from PRD §10
- [ ] **10.4 Pipeline integration tests** — fixture cart + zone + methods → expected ranked quotes
- [ ] **10.5 Provider contract compliance tests** — each C1-C5 passes the same B10 contract test suite
- [ ] **10.6 Provider sandbox tests** — gated behind env vars; runs against real carrier sandboxes (CI nightly)
- [ ] **10.7 E2E checkout test** — cart → checkout → label → tracking webhook (mocked) → fulfillment status update
- [ ] **10.8 Stale-rate regression tests** — verify addressKey/cartKey changes invalidate quotes (regression against the money-bug fix)

**Phase 10 exit:** test suite green, including sandbox runs.

### Phase 11 — Pre-production validation

**Goal:** verify nothing breaks before exposing to merchants.

- [ ] **11.1 Load test** — 100 concurrent rate requests across 5 providers. Target: p95 <3s, cache hit rate >40%.
- [ ] **11.2 Address fingerprint regression run** — confirm STALE_SHIPPING_RATE fires on address/cart change.
- [ ] **11.3 Convex deploy test** — full deploy with --typecheck=disable succeeds. Confirm all 18 new tables visible.
- [ ] **11.4 Capability assignment** — administrator role gets all `shipping.*` caps; shop_manager gets all except `providers.*.manage`.
- [ ] **11.5 Settings UI walkthrough** — open every shipping admin page, set up a working configuration end-to-end (1 zone, 1 class, 1 package, 1 location, 1 method per type).
- [ ] **11.6 Documentation pass** — operator guide for setting up shipping (single page, screenshot-light).

**Phase 11 exit:** clean test run + load test pass + working sandbox configuration.

### Phase 12 — Tester rollout (controlled)

**Goal:** put it in front of the user's tester safely.

- [ ] **12.1 Enable v2Enabled on tester install only** — direct database flip or admin toggle.
- [ ] **12.2 Tester smoke test plan** — written checklist for the tester: configure zones, configure 3 method types (flat / weight / live), place test order, verify rate, verify label purchase, verify tracking webhook, verify order fulfillment update.
- [ ] **12.3 Bug triage queue** — Linear or Airtable bucket for tester-reported issues.
- [ ] **12.4 Hot-fix iteration** — daily review of tester reports, patch within 24h.

**Phase 12 exit:** tester signs off OR list of remaining bugs prioritized.

### Phase 13 — Production cutover (per IMPLEMENTATION.md §7)

- [ ] **13.1** Enable for new installs (default `true`)
- [ ] **13.2** Roll to 10% existing installs (7 day soak)
- [ ] **13.3** Roll to 100%
- [ ] **13.4** Delete legacy `convex/shipping/actions.ts` (~3,400 lines)
- [ ] **13.5** Move v2 → shipping (drop v2 prefix)
- [ ] **13.6** Remove feature flag
- [ ] **13.7** Tag cutover commit
- [ ] **13.8** Update CLAUDE.md expert registry: add Shipping Core / Methods / Providers experts
- [ ] **13.9** Deprecate `.codex/docs/COMMERCE-SHIPPING-INTEGRATIONS-ARCHITECTURE.md`

---

## Estimated effort

| Phase | Sequential (1 eng) | Parallel (3 eng) |
|-------|-------------------|-----------------|
| 6 — Provider implementations | 2-3 weeks | 1 week |
| 7 — Operational layers | 2-3 weeks | 1.5 weeks |
| 8 — Events + audit | 2-3 days | 1 day |
| 9 — Admin UI | 4-5 weeks | 2 weeks |
| 10 — Tests | 1-2 weeks | 1 week |
| 11 — Pre-production | 3-5 days | 2 days |
| 12 — Tester rollout | 1-2 weeks (depends on tester) | same |
| 13 — Cutover | 2 weeks (with soak periods) | same |
| **Total** | **~3-4 months** | **~7-9 weeks** |

---

## Decision log

- **Event format:** map PRD 3-segment names to dispatcher's 2-segment format. Reason: smaller change, no other system needs 3-segment. Done at phase 8.1.
- **Capability prefix:** kept project's existing `shipping.*` (not `admin.shipping.*` from PRDs). Reason: matches existing `post.create`, `media.upload` convention. Documented in ALL_CAPABILITIES array.
- **Provider migration:** copy from legacy → typed v2 adapters, leave legacy intact behind feature flag until phase 13. Reason: zero-downtime cutover.
- **Convex type-depth:** deploy with `--typecheck=disable` per project convention. Reason: schema growth triggers TS2589 in unrelated commerceBundles/commerceReturns files; not blocking.
- **Address validation:** stub fail-open until USPS Addresses v3 is wired in phase 6.5. Reason: avoids checkout breakage during build.

---

## Working principles for execution

1. **Phase exit gates are real.** Don't start phase N+1 until N's exit criteria pass.
2. **Within a phase, parallelize aggressively.** Items marked separately can be different engineers / sessions.
3. **Every PR small.** One numbered item = one PR. No mega-PRs.
4. **Feature flag stays until phase 13.** Anything goes wrong, flip the flag.
5. **Test as you build.** Don't accumulate test debt — write tests in the same PR as the code.
6. **Update this doc.** Each completed item: check the box, commit the doc update.
