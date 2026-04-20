# Shipping v2 — Post-Launch Fixes & Cutover Plan (COMPLETED)

> **✅ ALL TIERS LANDED.** Tiers 1.1–1.3, 2.1–2.3, 3.1–3.3, 4.1–4.2 and
> Phases 13.1–13.7 have all shipped. Subsequent Codex + internal audit
> rounds surfaced additional gaps (compile errors, credential decryption,
> quote persistence, multi-package labels, UPS v2 rates, class/ship-from
> wiring, UPS/FedEx void + manifests, label storage, registry cleanup) —
> all now closed. Remaining work lives in per-subsystem PRDs and the
> `README.md` "Status (post-cutover)" section.

**Original goal:** Close every known compromise before legacy code is deleted.
**Order:** Strict tier order. Tier N+1 starts only after Tier N exits cleanly.
**Tracking:** Tasks #68–#100 in the task list mirror this doc one-to-one.

---

## Tier 1 — Production blockers (do FIRST, before tester rollout)

### 1.1 OAuth token cache table
**Why:** Current cache lives in an in-process Map. Each cold action invocation refetches OAuth tokens from UPS/USPS/FedEx, thrashing carrier rate limits under load.
**Files to touch:**
- `convex/schema/shipping.ts` — add `shipping_provider_oauth_tokens` table (connectionId, accessToken, expiresAt, refreshedAt)
- `convex/shipping/v2/providers/ups/auth.ts` — replace tokenCache Map with `internal.shipping.v2.providers.tokens.*` mutations
- `convex/shipping/v2/providers/usps/auth.ts` — same
- `convex/shipping/v2/providers/fedex/auth.ts` — same
- New: `convex/shipping/v2/providers/_shared/tokenCache.ts` (mutations: getTokenForConnection, setTokenForConnection)
**Acceptance:** OAuth call hits the carrier exactly once per (connectionId, TTL window) regardless of how many concurrent rate calls fire.

### 1.2 Per-connection webhook secrets
**Why:** Webhook signature verification reads `process.env.SHIPSTATION_WEBHOOK_SECRET`. Multi-tenant deployments need per-merchant secrets.
**Files to touch:**
- `convex/schema/shipping.ts` — add `webhookSecret: v.optional(v.string())` to `shipping_provider_connections`
- `convex/shipping/v2/webhooks.ts` — look up the connection by tracking number lookup, read secret from connection row
- ShipStation/UPS provider credential pages — add a "Webhook Secret" input field
**Acceptance:** Two ShipStation accounts on different merchants can use different webhook secrets without env-var conflict.

### 1.3 Bootstrap shipping email templates
**Why:** `maybeNotifyCustomer` calls `queueEmail` with template slugs `shipping_picked_up`, `shipping_delivered`, etc. If templates don't exist, the queue logs a warning and skips. Customers get zero notifications silently.
**Files to touch:**
- `convex/emails/templateDefaults.ts` — add 5 default templates with sensible copy + variables
- `convex/shipping/v2/bootstrap.ts` (new) — internal mutation that upserts shipping templates if missing
- Hook the bootstrap into `settings:updateSection` mutation: when v2Enabled flips true, call bootstrap
**Acceptance:** Toggling v2 on creates 5 email templates the merchant can edit. Customer notifications fire on delivered status without any merchant setup.

---

## Tier 2 — UX completeness (during tester feedback loop)

### 2.1 Method editor forms (per type)
**Why:** Method cards on the zone-method page are read-only summaries. Merchants can add/delete but not edit tier tables.
**Files to touch:**
- New routes: `apps/web/src/routes/_authenticated/_admin/commerce/settings.shipping.zones_.$zoneId.methods_.$methodId.tsx` (or modal in existing page)
- One form component per method type: `WeightTierEditor`, `PriceTierEditor`, `QuantityTierEditor`, `FlatRateForm`, `FreeShippingForm`, `LocalPickupForm`, `LocalDeliveryForm`, `TableRateForm` (reuses RuleBuilder from Tier 4)
- Wire to existing `shipping.v2.methods.mutations.updateMethod`
**Acceptance:** Tester can create a weight-based method with three tiers via UI without touching the Convex dashboard.

### 2.2 Per-class tier override editors
**Why:** Schema and calculators support per-class tier tables. UI doesn't expose them.
**Files to touch:** Same files as 2.1 — add an "Add class override" button that opens a tier editor scoped to a chosen class.
**Acceptance:** Tester can set "Heavy class costs $10 above tier base" in the UI.

### 2.3 Wire packCart into pipeline
**Why:** Pipeline currently sends one combined-weight package per provider request. Carts with multiple bulky items get inaccurate quotes.
**Files to touch:**
- `convex/shipping/v2/rates/pipeline.ts` — call `packCart` with cart items + available packages, loop provider call per box, sum results
- `convex/shipping/v2/providers/{shipstation,usps,fedex,dhl}/rates.ts` — accept `packages[]` (already supported in signatures, just need to pass them)
**Acceptance:** A 3-item cart that bin-packs into 2 boxes fires 2 rate requests per provider and sums the amounts.

---

## Tier 3 — Cleanup that makes Phase 13 cutover possible

### 3.1 Port legacy label code to v2
**Why:** v2 label purchase delegates to legacy actions. Can't delete legacy until v2 has its own implementation.
**Files to touch:**
- `convex/shipping/v2/providers/shipstation/labels.ts` — port from `actions.ts:2455-2660`
- `convex/shipping/v2/providers/ups/labels.ts` — port from `actions.ts:1645-1884`
- `convex/shipping/v2/providers/fedex/labels.ts` — port from `actions.ts:1886-2114`
- `convex/shipping/v2/labels/actions.ts` — replace legacy-delegate calls with direct v2 carrier-specific functions
**Acceptance:** Buying a label through v2 makes zero calls to legacy `actions.ts` functions.

### 3.2 Delete legacy provider sections from actions.ts
**Why:** Once 3.1 lands and Phase 13 soak passes, the legacy provider code is dead.
**Files to touch:**
- `convex/shipping/actions.ts` — delete: `getUpsAccessToken`, `getUspsAccessToken`, `getFedexAccessToken`, `getDhlCredentials`, `fetchUpsRatesInternal`, `fetchUspsRatesInternal`, `fetchFedexRatesInternal`, `fetchDhlRatesInternal`, `fetchShipStationRatesInternal`, `createShipStationLabelForOrderInternal`, label internals for UPS/FedEx
- KEEP: `getRateContextForSession`, `getProviderSecret`, `updateConnectionHealth`, `getLabelContextForOrder`, `replaceCheckoutQuotes`, `syncProviderAccountsAndServices`, `createOrderShipmentFromLabel`, `updateShipmentTrackingFromProvider` — these are used by both legacy and v2
- Drop `@ts-nocheck` from the file once everything types cleanly
**Acceptance:** `actions.ts` shrinks from ~3,400 lines to ~600 lines (helpers only). Strict typecheck passes.

### 3.3 Typed settings getters per section
**Why:** v2 provider files cast settings to `any` because the generic getBySection doesn't return typed shapes.
**Files to touch:**
- `convex/settings/queries.ts` — add `getShippingIntegration`, `getShippingProvider(provider)` typed queries that return ShippingIntegrationSettings / ShippingProviderSettings respectively
- `convex/settings/internals.ts` — same internal variants for the v2 actions to call
- v2 provider rate files — replace `(await ctx.runQuery(...)) as any` with `await ctx.runQuery(internal.settings.internals.getShippingIntegrationInternal, {})`
**Acceptance:** Zero `any` casts on settings reads in the v2 codebase.

---

## Tier 4 — Polish (post-cutover)

### 4.1 Tracking health dashboard with real stats
**Why:** Current `/admin/commerce/shipping/tracking` page is static help text. No visibility into actual sync health.
**Files to touch:**
- New query `convex/shipping/v2/tracking/queries.ts:getHealthStats` — per-provider success rate over last 24h, last sync time, in-flight shipment count
- `apps/web/src/routes/_authenticated/_admin/commerce/shipping.tracking.tsx` — replace static content with live stats
**Acceptance:** Admin can see "ShipStation: 98% sync success, last sync 12 min ago, 47 shipments in transit" at a glance.

### 4.2 Webhook replay protection
**Why:** Current webhook handlers verify HMAC signature but don't track which (provider, eventId) tuples have been seen. Replay attack vector.
**Files to touch:**
- `convex/schema/shipping.ts` — add `shipping_webhook_nonces` table (provider, eventId, receivedAt, indexed by_expires)
- `convex/shipping/v2/webhooks.ts` — before recording event, check nonce table; reject if exists
- `convex/crons.ts` — daily purge of nonces older than 7 days
**Acceptance:** Replaying a captured webhook payload returns 200 OK but does not insert a duplicate tracking event.

---

## Phase 13 — Production cutover

### 13.1 Enable v2 default-on for new installs
**Action:** Edit `SHIPPING_INTEGRATION_DEFAULTS.v2Enabled` from `false` to `true` in `convex/settings/defaults.ts`. Existing installs keep their stored value (false unless admin toggled). Deploy.
**Soak:** 14 days. Watch error rate, support tickets, Convex logs.
**Rollback:** Flip default back to `false` and ship; tester installs flip their local toggle.

### 13.2 Roll v2 to 10% of existing installs
**Action:** Pick a stratified random sample. For each, run `bunx convex run "settings/mutations:updateSection"` with `v2Enabled: true`.
**Soak:** 7 days.
**Acceptance:** No critical bugs from the sample cohort.

### 13.3 Roll v2 to 100% of existing installs
**Action:** Same mutation for the rest. Watch closely for 48h.

### 13.4 Delete legacy convex/shipping/actions.ts
**Prereqs:** 3.1 and 3.2 completed; 100% rollout stable for 7d.
**Action:** `git rm convex/shipping/actions.ts` (or trim it down to a stub if some pieces are still needed). Run deploy. Run tests.

### 13.5 Move v2/* to shipping/* (drop v2 prefix)
**Action:**
1. `mv convex/shipping/v2/* convex/shipping/`
2. `rm -rf convex/shipping/v2`
3. Update every import: `from "../v2/..."` → `from "../..."`
4. Rename functions: `fetchShipStationRatesV2` → `fetchShipStationRates`, `getUpsAccessTokenV2` → `getUpsAccessToken`, etc.
5. Deploy + run tests.

### 13.6 Remove v2Enabled feature flag
**Action:**
- Drop `v2Enabled` field from `ShippingIntegrationSettings` in `convex/settings/defaults.ts`
- Drop the `if (integrationSettings.v2Enabled === true)` branch from the (now-stub) checkout dispatch — actually, since 13.4 deletes legacy entirely, this whole dispatch goes away
- Remove the v2 toggle UI from `settings.shipping.tsx`

### 13.7 Tag cutover commit + update CLAUDE.md
**Action:**
- `git tag shipping-v2-cutover-YYYY-MM-DD`
- Append to `.claude/CLAUDE.md` expert registry: Shipping Core Expert, Shipping Methods Expert, Shipping Providers Expert
- Add a deprecation note to `.codex/docs/COMMERCE-SHIPPING-INTEGRATIONS-ARCHITECTURE.md` pointing to the 25 PRDs

---

## Total estimated effort

| Tier | Sequential effort |
|------|-------------------|
| Tier 1 | ~5 hours |
| Tier 2 | ~6–8 days |
| Tier 3 | ~2 days |
| Tier 4 | ~1.5 days |
| Phase 13 | ~3 weeks elapsed (most is soak time, minutes of actual work) |

**Tier 1 ships before tester rollout.** Everything else can land iteratively as feedback comes in.
