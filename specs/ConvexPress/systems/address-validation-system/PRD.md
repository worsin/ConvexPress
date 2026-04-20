# Address Validation Service — PRD

**System ID:** `address-validation-system`
**Layer:** A — Core Infrastructure (Shipping)
**Status:** Draft
**Owner:** Shipping Platform
**Related PRDs:** `shipping-zones-system` (A2), `shipping-classes-system` (A3), `shipping-packages-system` (A4), `ship-from-locations-system` (A5), `shipping-rules-engine` (A6), `rate-calculation-pipeline` (A7), `shipping-providers-shipstation` (C1), `shipping-providers-ups` (C2), `shipping-providers-usps` (C3), `shipping-providers-fedex` (C4), `shipping-providers-dhl` (C5), `shipping-labels-system` (D1), `checkout-system`, `settings-system`, `event-dispatcher-system`, `audit-log-system`

---

## 1. Context & Intent

The Address Validation Service is a Layer A (Core Infrastructure) shipping primitive that verifies, normalizes, and standardizes destination (and origin) postal addresses *before* any rate calculation, label purchase, or order confirmation. It is the gatekeeper that prevents ConvexPress from quoting, shipping to, or purchasing labels for addresses that cannot be delivered.

**Business intent.**
- Carriers (USPS, UPS, FedEx, DHL) charge **address correction surcharges** — typically $15–$20 per package — any time their systems auto-correct or refuse a label for a malformed destination. These fees are charged *after* the label has been purchased and appear on the weekly carrier invoice, often long after the order has shipped. A single validation call upstream of label purchase eliminates the vast majority of these fees.
- Failed deliveries (wrong apartment number, transposed digits in ZIP, non-existent street) generate **Return-to-Sender** costs (re-label, re-pack, customer service time) typically 3–5x the original shipping cost, plus brand damage and potential refund fraud exposure.
- Residential vs. commercial classification directly impacts quoted rates on UPS and FedEx (residential surcharge, rural surcharge, Saturday delivery eligibility) — a wrong classification at rate time produces a billed-rate mismatch later.
- Merchants consistently rate "prevents bad-address shipments" as the single highest-ROI automation available in shipping software.

**Technical intent.**
- Provide a single, provider-agnostic action `validateAddress` that any caller (checkout, admin tools, bulk import) can invoke.
- Insulate callers from the specifics of USPS / SmartyStreets / Google / carrier-native APIs — the caller hands in a `commerceAddressValidator` shape and gets back a normalized `ValidationResult`.
- Aggressively cache results keyed by an **address fingerprint** so that the same shopper at the same address across multiple checkout attempts (or re-quote cycles after cart changes) pays for at most one external API call per 30 days.
- Fail-open by default so that a provider outage never blocks checkout, with an explicit merchant opt-in to fail-closed for high-fraud / high-cost shipments.
- Surface correction suggestions to the shopper inline at checkout so typos are fixed by the shopper themselves, *before* the order is placed.

This PRD defines the service contract, the schema, the provider abstraction, the cache, the admin UX, the checkout integration, and the observability required to take this from spec to production.

---

## 2. Scope

### 2.1 In Scope

1. **Address validation** against one or more third-party providers in a configurable priority order.
2. **Normalization** — returning a carrier-standard form of the address (upper-cased street, USPS-standardized directionals and suffixes, 5+4 ZIP, etc.).
3. **Correction detection** — returning a structured diff when the provider rewrote the input (e.g. `Mian St` → `Main St`, ZIP `90210` → `90210-4817`).
4. **Residential vs. commercial classification** (DPV indicator on USPS, RDI flag on Google/SmartyStreets, carrier-native hints on UPS/FedEx).
5. **Deliverability flags** — vacant, no-mail-stop, PO box, military, uncoded, multiple matches.
6. **Result caching** keyed by a deterministic address fingerprint with a 30-day TTL.
7. **Provider priority list** with automatic fallback to the next provider on error.
8. **Fail-open / fail-closed policy** (merchant-configurable).
9. **Inline correction suggestions** surfaced to the storefront checkout UI (PRD `checkout-system` consumes).
10. **Admin settings UI** at `/admin/commerce/settings/shipping/address-validation`.
11. **Admin validation log / stats** (coverage, cache hit rate, correction rate, invalid rate) per provider.
12. **Event emission** on every validation attempt (successful, corrected, invalid).
13. **Residential flag propagation** into the Rate Calculation Pipeline (PRD A7) so all downstream rate requests see the same classification.
14. **Bulk re-validation** tooling for customer addresses stored in the customer address book.
15. **US, Canada, Mexico, UK, EU, AU/NZ** — the union of what our provider set supports (see §2.2 for exclusions).

### 2.2 Out of Scope

1. **ISO-level international address parsing** — we do not implement libpostal, do not guess country-specific line ordering beyond what the providers themselves normalize.
2. **Carriers not in our provider set** — no India Post, no Japan Post, no China Post validation. If a shipment is quoted by a carrier we do not have an address API for, validation is skipped.
3. **Rooftop-precision geocoding** — this PRD returns a `deliveryPoint` only when the provider returns one; no lat/lng is calculated, enriched, or persisted beyond what a provider gives back.
4. **Tax jurisdiction lookup** — tax-nexus resolution is the Tax System's responsibility; any ZIP/county mapping for tax is not done here (though the normalized postal code may be *consumed* by Tax).
5. **Fraud scoring** — address-based fraud signals (velocity, mismatched billing/shipping, shipping to a known fraud ZIP) are the Fraud System's responsibility. This PRD surfaces the raw `deliveryPoint` and `isResidential` but does not score.
6. **Phone number validation** — the `phone` field on `commerceAddressValidator` is passed through untouched. Phone validation is a separate concern.
7. **Email validation** — same.
8. **Batch/bulk validation** for non-customer sources (e.g. CSV imports of third-party mailing lists). In-app customer address-book re-validation is in scope; generic list-cleaning is not.
9. **Address autocomplete / typeahead as the shopper types.** A future enhancement may use the same provider set for autocomplete; this PRD covers only *full-address verification at submit time*.

---

## 3. Dependencies

### 3.1 Upstream (this system needs them first)

| Dependency | Why |
|---|---|
| `settings-system` | Stores provider priority, per-provider API credentials, fail-open/closed policy, and enable/disable flag. |
| `event-dispatcher-system` | Emits `shipping.address.validated`, `shipping.address.corrected`, `shipping.address.invalid` for listeners. |
| `audit-log-system` | Records admin changes to provider config and bulk re-validation runs. |
| `role-capability-system` | Gates the settings page and bulk tools behind `shipping.settings.manage`. |
| `shipping-providers-ups` (C2) | UPS Address Validation Street Level API (optional, provider-native). |
| `shipping-providers-usps` (C3) | USPS OAuth token flow in `convex/shipping/actions.ts` is reused for the USPS Addresses API v3 (same client_id / client_secret). |
| `shipping-providers-fedex` (C4) | FedEx Address Validation API (optional, provider-native). |
| `shipping-providers-dhl` (C5) | DHL Address Validate API (optional). |

### 3.2 Downstream (they consume this system)

| Consumer | Why |
|---|---|
| `rate-calculation-pipeline` (A7) | Must validate destination before quoting. Uses `isResidential` flag when building rate requests so residential surcharges are accurate at quote time, not label time. |
| `shipping-labels-system` (D1) | Must re-check the validation cache right before label purchase. If the cached result is `invalid` or `corrected-but-not-accepted`, label purchase is refused. |
| `checkout-system` | Calls validation during the shipping-address step, surfaces corrections to the shopper, and blocks forward progress on `invalid` addresses when the merchant policy is fail-closed. |
| `commerceOrders` / order mutations in `convex/commerce/checkout.ts` | `completeCheckout` re-verifies the cached validation exists and is fresh before writing the order. |
| `user-profile-system` / customer address book | Re-validates saved addresses on a schedule and marks stale/invalid entries. |
| `shipping-rules-engine` (A6) | May condition shipping rules on `isResidential` or on validation state. |

### 3.3 Provider Dependencies

| Provider | Endpoint | Auth | Cost |
|---|---|---|---|
| USPS Addresses API v3 | `/addresses/v3/address` | OAuth2 (reuse from shipping-providers-usps) | Free |
| SmartyStreets US Street API | `/street-address` | Auth-Id + Auth-Token | Paid (tiered) |
| SmartyStreets International API | `/verify` | Auth-Id + Auth-Token | Paid (per-lookup) |
| Google Address Validation API | `addressvalidation:v1` | API key | Paid (per-call above free tier) |
| UPS Address Validation Street Level | `/addressvalidation/v2` | OAuth2 (shared with UPS rating) | Included with UPS account |
| FedEx Address Validation | `/address/v1/addresses/resolve` | OAuth2 (shared with FedEx rating) | Included with FedEx account |

---

## 4. Schema

### 4.1 New table: `commerce_address_validations`

Defined in `convex/schema/shipping.ts` (grouped with shipping because it is consumed almost exclusively by shipping; the `commerce_` prefix is retained for cross-table join readability).

```
commerce_address_validations:
  fingerprint           : string           # sha256 of normalized input; the cache key
  inputAddress          : commerceAddressValidator
  normalizedAddress     : commerceAddressValidator | null
  provider              : union("usps", "smartystreets", "google", "ups", "fedex", "dhl", "skipped")
  providerRequestId     : optional string  # provider-returned correlation id for support tickets
  status                : union("valid", "corrected", "invalid", "ambiguous", "unsupported_country", "skipped")
  isResidential         : optional boolean
  deliveryPoint         : optional string  # USPS DPV code / provider "match quality" string
  warnings              : array(string)    # e.g. ["missing_secondary", "po_box", "vacant"]
  corrections           : array(object)    # structured diff: [{field, from, to}]
  rawProviderResponse   : optional any     # trimmed provider payload for debugging
  latencyMs             : number
  createdAt             : number
  expiresAt             : number           # createdAt + 30 days (TTL)

indexes:
  by_fingerprint        (["fingerprint"])
  by_expiresAt          (["expiresAt"])           # for cache sweep
  by_provider_status    (["provider", "status"])  # for admin stats
  by_createdAt          (["createdAt"])           # for admin log view
```

### 4.2 Extensions to `commerce_addresses`

The existing customer address-book table (`commerce_addresses`, if present; otherwise defined when the customer-address-book system lands) is extended with:

```
commerce_addresses (new fields):
  validatedAt           : optional number
  validationProvider    : optional string
  validationStatus      : optional union("valid", "corrected", "invalid", "ambiguous", "skipped")
  validationFingerprint : optional string        # links to commerce_address_validations.fingerprint
  isResidential         : optional boolean
  normalizedAddress     : optional commerceAddressValidator
```

### 4.3 Extensions to `commerce_orders` and `commerce_carts`

Both the cart and the order persist a pointer to the validation result that was in effect at the moment the rate was quoted / order was placed. This is what label purchase reads — *not* a fresh validation — so that the rate the customer paid and the label we purchase agree on residential classification.

```
commerce_carts.shippingAddressValidation:
  fingerprint : string
  status      : union("valid", "corrected", "invalid", "ambiguous", "skipped")
  isResidential : optional boolean
  validatedAt : number

commerce_orders.shippingAddressValidation:
  (same shape — snapshotted at order creation)
```

### 4.4 Extensions to `commerceAddressValidator`

The canonical validator in `convex/schema/commerce.ts` (lines 51–62) stays the source of truth for inbound address shape. No new required fields are added — we only *annotate* on output. Optional output-only fields are introduced as a sibling validator:

```
commerceNormalizedAddressValidator:
  ...all fields of commerceAddressValidator
  addressLine1Standardized : optional string
  addressLine2Standardized : optional string
  cityStandardized         : optional string
  stateStandardized        : optional string    # 2-letter for US/CA
  postalCodeExtended       : optional string    # 5+4 for US, full postcode for UK/CA
  countryCodeISO2          : optional string
  uspsDeliveryPointCode    : optional string    # DPV 2-digit
  uspsCarrierRoute         : optional string
```

---

## 5. Data Model

### 5.1 Validation States

| State | Meaning | Checkout behavior | Label behavior |
|---|---|---|---|
| `unchecked` | No validation has been run (pre-submit). | Run validation on shipping-step submit. | Block. |
| `valid` | Provider accepted input as-is (or with cosmetic-only changes e.g. casing). | Proceed. | Allow. |
| `corrected` | Provider returned a materially different address. | Surface suggestion to shopper; require Accept or Override. | Allow only if shopper accepted or merchant policy allows override. |
| `ambiguous` | Provider returned >1 possible match and could not disambiguate. | Surface up-to-5 matches to shopper; require pick. | Block until picked. |
| `invalid` | Provider returned DPV code indicating undeliverable / non-existent. | Fail-open: warn + proceed. Fail-closed: block. | Fail-open: allow with warning. Fail-closed: block. |
| `unsupported_country` | No provider in the priority list covers this country. | Skip validation; proceed. | Allow. |
| `skipped` | All providers errored / timed out. Fail-open path. | Proceed (warning logged). | Allow with warning. |

### 5.2 Cache TTL

- **Default TTL: 30 days.** Configurable in settings (min 1 day, max 90 days) to balance provider cost against address staleness (occupants move, streets get renamed rarely).
- On `valid` or `corrected` results: cache full duration.
- On `invalid` results: cache only for 24 hours (a fix to USPS reference data may validate an address that was previously invalid — we don't want to hold a stale "invalid" for a month).
- On `skipped` results: do NOT cache. Next attempt retries providers.

### 5.3 Address Fingerprint

The cache key. Deterministic, case- and whitespace-insensitive, derived from the *input* address (pre-validation) so that identical inputs from different shoppers hit the same cache entry.

```
fingerprint = sha256(
  normalize(line1) + "|" +
  normalize(line2 || "") + "|" +
  normalize(city) + "|" +
  normalize(state || "") + "|" +
  normalize(postalCode) + "|" +
  normalize(countryCode)
)

normalize(s) = trim + collapse-whitespace + uppercase + strip-punctuation(., ,, ', #)
```

This is the same normalization and hash used by the Rate Calculation Pipeline (PRD A7) for its rate-cache invalidation, allowing a single shared helper in `convex/helpers/addressFingerprint.ts`.

### 5.4 Provider Selection Priority

The merchant configures an ordered list of providers in settings. Default:

```
1. usps              (free; US only; very high US accuracy)
2. smartystreets     (paid; international; very high accuracy)
3. google            (paid; global coverage)
4. (fallback: skip — fail-open / fail-closed per policy)
```

Selection algorithm at runtime:

1. Determine the destination country.
2. Walk the priority list. For each provider:
   a. Is it enabled and credentialed?
   b. Does it support the destination country?
   c. Is its per-day quota exhausted?
3. Call the first provider that passes all three checks. On 5xx / network error / 429, fall through to the next provider.
4. If all providers fall through, return `status: "skipped"` with `provider: "skipped"`.

### 5.5 Provider-Native vs. Third-Party

If a carrier-native provider (UPS, FedEx, DHL) is enabled *and* the rate that is ultimately chosen belongs to that carrier, the system will additionally verify against that carrier *before* label purchase. This covers the edge case where SmartyStreets says "valid" but UPS's internal database disagrees — the label-time check catches it. The label-time re-check uses the same cache with a *carrier-scoped* fingerprint: `sha256(fingerprint + "|" + carrierCode)`.

### 5.6 Residential Classification

`isResidential` is the single most load-bearing output of this system for rate accuracy. Rules:

- If provider returns an explicit residential/commercial flag, use it.
- If provider returns only a DPV code, map: `Y` (confirmed) + known commercial-indicator code → commercial; otherwise residential.
- If no provider signal is available, default to `true` (residential) — residential surcharges apply more broadly, so defaulting this way prevents a rate-time vs. label-time mismatch.
- If the merchant has marked a specific address in `commerce_addresses` as commercial via admin override, that override wins regardless of provider output.

### 5.7 Failure Policy

Two settings values:

| Setting key | Type | Default | Effect |
|---|---|---|---|
| `shipping.addressValidation.failurePolicy` | `"open" \| "closed"` | `"open"` | On `invalid`/`skipped`, either allow (open) or block (closed). |
| `shipping.addressValidation.correctionBehavior` | `"suggest" \| "auto_accept" \| "require_accept"` | `"require_accept"` | How corrections are handled in checkout. |

Fail-open is the default because a provider outage blocking all checkouts is a worse outcome than occasionally shipping to a bad address. Merchants with high average order value or high fraud risk can flip to fail-closed.

---

## 6. Functions / API

All functions live in `convex/shipping/addressValidation/`.

### 6.1 Action: `validateAddress`

**File:** `convex/shipping/addressValidation/actions.ts`
**Type:** `"use node"` action (external HTTP calls).

```
Args:
  address          : commerceAddressValidator
  purpose          : optional union("checkout", "label", "admin", "bulk")
                     # used for metrics and rate-limit scoping; default "checkout"
  forceRefresh     : optional boolean
                     # bypass cache; used by admin "re-validate" tool
  scopedToCarrier  : optional string
                     # e.g. "ups" — triggers a carrier-scoped cache lookup/write

Returns:
  ValidationResult {
    status            : "valid" | "corrected" | "invalid" | "ambiguous"
                      | "unsupported_country" | "skipped"
    valid             : boolean        # convenience: status in {valid, corrected}
    provider          : string
    fingerprint       : string
    normalizedAddress : commerceNormalizedAddressValidator | null
    corrections       : Array<{field, from, to}>
    alternatives      : optional Array<commerceNormalizedAddressValidator>  # for ambiguous
    isResidential     : optional boolean
    deliveryPoint     : optional string
    warnings          : string[]
    cachedAt          : optional number
    cacheHit          : boolean
  }

Behavior:
  1. Compute fingerprint.
  2. Lookup cache via internal query (fingerprint + optional carrier scope).
     If hit and not expired → return cached result with cacheHit: true.
  3. Resolve provider priority list from settings for destination country.
  4. Walk providers in order; first successful response wins.
  5. Persist via internal mutation saveValidationResult.
  6. Emit event shipping.address.validated (or .corrected / .invalid).
  7. Return result.
```

### 6.2 Mutation: `saveValidationResult` (internal)

**File:** `convex/shipping/addressValidation/internals.ts`

Upserts a row into `commerce_address_validations` keyed by fingerprint (+ optional carrier scope). Sets `createdAt`, computes `expiresAt` per §5.2. Called only by the `validateAddress` action.

### 6.3 Query: `getValidationForAddress`

**File:** `convex/shipping/addressValidation/queries.ts`

```
Args:
  address        : commerceAddressValidator
  scopedToCarrier: optional string
Returns:
  ValidationResult | null
```

Synchronous cache-only lookup. Used by the checkout UI during re-render (to show the last known validation state without triggering a new API call) and by the label mutation's pre-flight check.

### 6.4 Query: `listValidationsForAdmin`

Paginated list of recent validation entries for the admin log. Filters: provider, status, date range. Gated on `shipping.settings.manage`.

### 6.5 Query: `getValidationStats`

Aggregate stats over a time window: total, by provider, by status, cache-hit rate, mean / p50 / p95 latency, top-5 correction types. Powers the stats panel in the admin settings page.

### 6.6 Mutation: `overrideValidation` (admin)

Lets an administrator mark a specific address record as "manually verified" or "manually commercial" — bypasses future provider calls for that exact fingerprint. Writes an audit-log entry.

### 6.7 Action: `revalidateCustomerAddresses` (admin, scheduled)

Sweeps `commerce_addresses` where `validatedAt` is null or older than 90 days and re-runs validation. Bounded batch size (default 500 / run), throttled to respect provider quotas. Invokable manually from the admin stats page or on a weekly cron.

### 6.8 Action: `sweepExpiredCache` (internal, scheduled)

Nightly cron that deletes `commerce_address_validations` rows where `expiresAt < now`. Keeps the table bounded.

### 6.9 Helper: `computeAddressFingerprint`

**File:** `convex/helpers/addressFingerprint.ts`

Pure function used by this system, by Rate Calculation Pipeline (A7), and by any other consumer that needs a stable identity for an address. Exported so the rate cache and this cache share keys.

---

## 7. Admin UX

**Route:** `/admin/commerce/settings/shipping/address-validation`
**File:** `apps/web/src/routes/_authenticated/_admin/commerce/settings.shipping.address-validation.tsx`
**Capability:** `shipping.settings.manage`

### 7.1 Page Sections

1. **Enable / disable** — master toggle. When off, all calls to `validateAddress` return `{status: "skipped", cacheHit: false}` without hitting any provider.
2. **Provider priority list** — drag-and-drop ordered list of providers. For each provider:
   - Enabled checkbox
   - Credential status (green = configured, yellow = incomplete, red = last call failed)
   - "Configure credentials" button that navigates to the provider's settings page (credentials live on the provider PRD, not here).
   - "Test" button that runs a single canned validation against the provider's sandbox.
3. **Failure policy** — radio: *Fail open (recommended)* / *Fail closed*. Plain-language explanation of consequences under each option.
4. **Correction behavior** — radio: *Suggest to shopper (require accept)* / *Auto-accept silent* / *Do not surface; log only*.
5. **Cache TTL** — slider, 1–90 days, default 30.
6. **Per-country override table** — optional. Lets merchant say "for GB, use SmartyStreets only" or "for MX, skip validation entirely" (useful because Mexican addresses are notoriously hard and merchants may prefer to trust the shopper).
7. **Statistics panel (last 30 days):**
   - Total validations, cache hits, cache-hit rate.
   - Breakdown by status (valid / corrected / invalid / ambiguous / skipped).
   - Breakdown by provider.
   - p50 / p95 latency.
   - Estimated carrier-correction-fees avoided (corrections × $15 default, configurable).
8. **Recent activity** — paginated log of validations. Search by fingerprint, filter by status. Clicking a row opens a detail drawer with the full input, normalized output, corrections, raw provider response, and "Re-validate" button.
9. **Bulk re-validate customer addresses** — button that triggers `revalidateCustomerAddresses`. Shows live progress and final summary when complete.

### 7.2 Visual Conventions

- Uses the standard admin settings form pattern (see `admin-settings-ui` expert knowledge).
- Toggles are Base UI `Switch`, priority list is a Base UI `Collection` with drag handles.
- No modals for configuration; all changes inline with save bar at the top (WordPress settings convention).
- Status badges use semantic colors: `text-success` / `text-warning` / `text-destructive` — never hardcoded palette names.

---

## 8. Merchant Workflow

**Scenario:** *"How do I turn on USPS address validation so my shop stops eating $15 carrier-correction fees on typos?"*

1. Merchant navigates to **Commerce → Settings → Shipping → Address Validation**.
2. Toggles **Enable address validation** to On.
3. In the **Provider priority** list, sees USPS at the top with a yellow badge ("Credentials required").
4. Clicks **Configure credentials** on the USPS row → navigated to **Commerce → Settings → Shipping → Providers → USPS** (PRD C3).
5. Enters USPS Customer Registration ID (CRID) / client_id / client_secret. The same credentials unlock rating, label purchase, *and* address validation (single OAuth flow shared, see §3.3).
6. Returns to the Address Validation page. USPS row now shows a green badge.
7. Clicks **Test** on USPS row. A test dialog runs a canned `validateAddress` against the sandbox with `{line1: "1600 Pennsylvania Ave NW", city: "Washington", state: "DC", postalCode: "20500", countryCode: "US"}`. Expected result: status=valid, residential=false.
8. Leaves **Failure policy** on *Fail open (recommended)* — outage never blocks checkout.
9. Leaves **Correction behavior** on *Suggest to shopper (require accept)*.
10. Clicks **Save**. Settings persist; the setting change emits an audit-log entry.
11. Next checkout: shopper submits `123 Mian St`, USPS returns `123 Main St`, shopper sees the correction suggestion, clicks **Accept**, checkout proceeds with the normalized address. Carrier-correction fee avoided.
12. After 30 days, merchant returns to the Statistics panel and sees e.g. "Corrections: 47 · Estimated fees avoided: $705."

**Scenario 2:** *"I want to use SmartyStreets for better international coverage."*

1. On the provider list, drag SmartyStreets above USPS for international orders, or use the per-country override table to send GB/AU/NZ directly to SmartyStreets while leaving USPS first for US.
2. Configure SmartyStreets credentials under its own provider settings page (Auth-Id, Auth-Token).
3. Save.

**Scenario 3:** *"I want to re-check all my customers' saved addresses."*

1. Scroll to **Bulk re-validate customer addresses**.
2. Click **Start bulk re-validation**. Confirmation dialog warns about provider quota usage.
3. Confirm. Progress bar shows `X / Y addresses processed`.
4. When complete, a summary renders: counts by status, addresses that changed from valid to invalid (these are flagged in the customer address book for follow-up).

---

## 9. Storefront UX

**Consumer:** `checkout-system` (separate PRD) — this PRD defines the contract, the checkout PRD defines the pixels.

### 9.1 Flow

1. Shopper fills shipping address form on checkout. Client-side field validation (required, format) runs first.
2. On "Continue to shipping method", checkout calls `validateAddress` action.
3. **While the action is pending** (typically 200–400ms), the Continue button shows a loading state. A watchdog at 1500ms surfaces "Taking longer than expected…"; at 4000ms the checkout falls through to fail-open.
4. Response handling:

| Status | UI |
|---|---|
| `valid` | Silently proceed to shipping method selection. (No nag UI for "valid" — reduces friction.) |
| `corrected` | Inline panel appears between the form and the Continue button: "**Did you mean…?**" Shows side-by-side comparison: original (strikethrough) vs. suggested (bold). Two buttons: **Use suggested** (primary) and **Keep what I entered**. |
| `ambiguous` | Radio group of up-to-5 matches. Shopper must pick one to continue. A final "None of these" option falls back to fail-open behavior with an acknowledgement checkbox. |
| `invalid` + fail-open | Soft-warning banner: "We couldn't verify this address. Delivery may be delayed." Continue allowed. |
| `invalid` + fail-closed | Hard block: "We couldn't verify this address. Please review the fields above." No Continue until the shopper edits the form. |
| `skipped` / `unsupported_country` | Silently proceed. |

### 9.2 Accept / Override Semantics

- If shopper chooses **Use suggested**, the cart's `shippingAddress` is *replaced* with the normalized address and `shippingAddressValidation.status = "valid"` is written.
- If shopper chooses **Keep what I entered**, the cart's `shippingAddress` stays as typed and `shippingAddressValidation.status = "corrected"` is written with a `userOverride: true` flag. Rate Calculation Pipeline (A7) still runs on the typed address; labels system (D1) proceeds, but the order carries a `ship_as_typed` audit marker.
- Either way, no second API call is made on accept — the cached result is re-used.

### 9.3 Residential Flag Propagation

The `isResidential` from the validation result is passed into the immediately-following call to the Rate Calculation Pipeline. The rate quote the shopper sees reflects the correct residential surcharge from the start — no bait-and-switch at label purchase.

---

## 10. Edge Cases

| # | Case | Handling |
|---|---|---|
| E1 | **Provider API down (5xx or timeout).** | Fall through to next provider in priority. If all fall through, apply failure policy (fail-open default). Emit `shipping.address.validation.provider_down` event for ops alerting. |
| E2 | **Provider returns 401 / auth failure.** | Mark provider as "credential error" in settings UI. Fall through to next provider. Do NOT retry the broken provider for that run. Background health check (nightly) re-tests to auto-clear the error badge. |
| E3 | **Provider returns 429 rate-limited.** | Record the 429, do not count it as a validation, fall through to next provider. Back off the 429'd provider for 5 minutes before trying again in later requests. |
| E4 | **Ambiguous address — provider returns multiple matches.** | Persist full alternatives array. Checkout surfaces up-to-5 for shopper selection. If caller is not checkout (e.g. admin re-validate), store as `status: "ambiguous"` and do not auto-pick. |
| E5 | **International address, none of our providers cover the country.** | Return `status: "unsupported_country"`, do not cache. Caller treats as skipped. |
| E6 | **PO Box.** | Mark warning `po_box`. `isResidential: false`. Some carriers (UPS / FedEx) do not deliver to PO Boxes — the rate pipeline uses this warning to exclude those carriers. |
| E7 | **Military APO/FPO/DPO.** | Treat as valid if the provider returns valid DPV. Warning `military`. Only USPS delivers; the rate pipeline filters to USPS for these. |
| E8 | **Apartment/unit/suite suffix missing (USPS DPV code D).** | Status `valid`, warning `missing_secondary`. Checkout surfaces a gentle nudge: "Is there an apartment or unit number?" Shopper may add or proceed. |
| E9 | **Apartment suffix given but provider returns multiple matches.** | Status `ambiguous`. Treat per E4. |
| E10 | **ZIP code alone vs. full ZIP+4.** | On `valid`, the provider returns the ZIP+4 — we store it in `postalCodeExtended` and write it to the cart's address. This improves USPS rate accuracy. |
| E11 | **Country code mismatch (state "CA" with country "GB").** | Client-side form validation catches this before submit. If it slips through, provider returns an error; we normalize to `status: "invalid"`. |
| E12 | **Shopper edits address after validation.** | Fingerprint changes → cache miss → new validation runs on the edited address. Previous validation result is not deleted (useful for audit). |
| E13 | **Multiple carts for same shopper hitting the same address in parallel.** | Both carts compute the same fingerprint. Second call reads the cached result written by the first — correct by construction. |
| E14 | **Provider returns a correction that changes the country.** | Reject the correction; return `status: "invalid"` with warning `country_mismatch`. Country changes are never auto-accepted (high fraud potential). |
| E15 | **Provider returns a correction that changes the postal code by more than 3 digits.** | Surface the correction but add warning `large_zip_change` so checkout can show a more prominent nudge. |
| E16 | **Shopper uses autocomplete / saved address.** | Saved addresses in `commerce_addresses` carry `validationFingerprint`. If present and cache still fresh, validation is a cache hit (sub-10ms). If missing or stale, runs full validation. |
| E17 | **Address contains non-ASCII (accented) characters.** | Normalization strips accents for the fingerprint but preserves originals in storage. Providers receive the original. If a provider normalizes accents differently per call, the cache still works because the fingerprint is input-derived. |
| E18 | **Vacant / no-mail-stop.** | Provider returns status `valid` with DPV `V` (vacant). We record `status: "valid"` + warning `vacant`. Checkout proceeds; order carries the warning into admin for CSR awareness. |
| E19 | **Cache hit for an address that was valid yesterday but the merchant flipped providers.** | Cache is provider-agnostic — a valid result remains valid. On the next TTL expiration, the new provider will be used. Forcing re-validation requires explicit `forceRefresh: true`. |
| E20 | **Label-time re-check disagrees with checkout-time validation.** | Labels system (D1) treats this as a hard block and emits `shipping.address.label_time_mismatch`. Admin receives a notification; order status becomes `pending_address_confirmation`. |
| E21 | **Shopper selects "Keep what I entered" on a corrected address and address is later undeliverable.** | Not the system's problem — the override was made with informed consent. The `ship_as_typed` audit marker protects the merchant against chargebacks. |
| E22 | **Fingerprint collision.** | sha256 collisions are not a real-world concern at any scale ConvexPress will reach; no mitigation required beyond the hash itself. |

---

## 11. Testing Requirements

### 11.1 Unit (pure functions)

- `computeAddressFingerprint` — whitespace/case/punctuation invariance, country/state edge cases, stable across runs.
- Correction diff builder — field-by-field diff structure.
- DPV → residential classifier — exhaustive table of DPV codes × expected residential flag.
- Country-to-provider routing — each supported country picks correct provider given a priority list.

### 11.2 Integration (Convex-level with mocked provider HTTP)

- `validateAddress` cache hit: second identical call returns cached result with `cacheHit: true` and makes zero HTTP calls.
- `validateAddress` provider fallthrough: primary returns 503, secondary returns valid — final result is from secondary, `provider` field reflects secondary.
- `validateAddress` all-fail + fail-open: returns `status: "skipped"`, warning set, no error thrown.
- `validateAddress` all-fail + fail-closed: checkout caller receives the skipped result and surfaces a block (tested in checkout integration).
- `saveValidationResult` writes expected shape and TTL.
- `sweepExpiredCache` deletes only rows with `expiresAt < now`.
- `revalidateCustomerAddresses` respects batch size and provider quota.

### 11.3 Provider-contract (against each provider's sandbox)

A suite run monthly against each enabled provider's sandbox:

- Known-valid US residential (USPS + SmartyStreets + Google).
- Known-valid US commercial.
- Known-invalid US (nonexistent street number).
- Known-corrected US (typo: "Mian" → "Main").
- Known-ambiguous (secondary missing but provider returns multiple).
- PO Box.
- APO / FPO.
- Canada residential (SmartyStreets + Google, not USPS).
- UK residential (SmartyStreets + Google).
- Mexico residential (SmartyStreets + Google).

### 11.4 End-to-end (checkout + label flows)

- Shopper checkout with typo → correction surfaces → shopper accepts → order has normalized address.
- Shopper checkout with typo → correction surfaces → shopper overrides → order has typed address + `ship_as_typed` marker.
- Shopper checkout with invalid + fail-closed → checkout blocks.
- Shopper checkout with invalid + fail-open → checkout proceeds with warning.
- Label purchase reads cached validation — no second HTTP call.
- Label-time re-check with carrier-native provider disagreeing — label purchase blocked per E20.

### 11.5 Load / performance

- p95 latency of `validateAddress` on cache hit ≤ 20ms (Convex internal only).
- p95 latency on cache miss ≤ 500ms (one provider round-trip on warm connection).
- Cache-hit rate ≥ 60% after 30 days of typical traffic (see §12).

### 11.6 Chaos

- Provider timeout injection — verify fallthrough.
- Clock skew — verify TTL still respected when server time jumps ±1 hour.

---

## 12. Success Criteria

| # | Metric | Target | Measured by |
|---|---|---|---|
| S1 | Reduction in address-related failed deliveries (RTS due to bad address). | ≥ 80% vs. the 30 days before this system was enabled. | Compared against shipments-delivered-failed counts from the Shipments system. |
| S2 | `validateAddress` p95 latency (end-to-end, including cache + provider). | < 500ms. | Convex action logs, aggregated in the stats panel. |
| S3 | Cache hit rate. | > 60% steady-state after the 30-day warm-up. | Stats panel. |
| S4 | Carrier-correction-fee events. | < 1 per 1000 shipments. | Reconciliation against weekly carrier invoices (Carrier Reconciliation system). |
| S5 | Checkout abandonment increase attributable to validation UI. | < 0.5 percentage points absolute. | A/B flag at rollout — compare cohort with validation on vs. off for the first 14 days. |
| S6 | Provider uptime availability seen by ConvexPress (≥ 1 provider responsive). | ≥ 99.9%. | Synthetic probes every 15 minutes against each enabled provider. |
| S7 | Admin setting mis-configuration incidents (e.g. credentials stored incorrectly leading to 100% skipped). | 0 after GA. | Alerts when `skipped` rate > 20% for > 1h. |

---

## 13. Roles & Capabilities

Roles: per `role-capability-system`. New capabilities introduced by this system:

| Capability | Roles granted | Purpose |
|---|---|---|
| `shipping.address_validation.view` | Administrator, Editor | View the settings page and stats panel (read-only for Editor). |
| `shipping.address_validation.manage` | Administrator | Modify provider priority, failure policy, correction behavior, cache TTL, enable/disable. |
| `shipping.address_validation.override` | Administrator | Run `overrideValidation` to mark an address as manually verified or force residential/commercial. |
| `shipping.address_validation.bulk_run` | Administrator | Invoke `revalidateCustomerAddresses`. |

Existing `shipping.settings.manage` is an alias that implies all of the above except `.override` and `.bulk_run`, which require the explicit grants.

All capability strings are registered in `role-capability-system`'s capability registry; see that PRD for the master list.

---

## 14. Events Fired

All events are dispatched via `event-dispatcher-system`'s `emitEvent` helper. Listeners may subscribe via the standard listener registration flow.

| Event | Fired when | Payload |
|---|---|---|
| `shipping.address.validated` | Any `validateAddress` completes (including cache hits). | `{fingerprint, provider, status, cacheHit, latencyMs, purpose, userId?}` |
| `shipping.address.corrected` | `validateAddress` returns `status: "corrected"`. | `{fingerprint, provider, corrections, inputAddress, normalizedAddress, userId?}` |
| `shipping.address.invalid` | `validateAddress` returns `status: "invalid"`. | `{fingerprint, provider, inputAddress, warnings, userId?}` |
| `shipping.address.ambiguous` | `validateAddress` returns `status: "ambiguous"`. | `{fingerprint, provider, alternatives, userId?}` |
| `shipping.address.override_accepted` | Shopper clicks "Keep what I entered" on a correction. | `{fingerprint, inputAddress, suggestedAddress, userId}` |
| `shipping.address.validation.provider_down` | A provider returns 5xx or times out. | `{provider, error, nextProviderTried?}` |
| `shipping.address.validation.credentials_error` | A provider returns 401. | `{provider}` |
| `shipping.address.validation.quota_exhausted` | A provider returns 429 and backoff engaged. | `{provider, retryAfterMs}` |
| `shipping.address.label_time_mismatch` | Label-time re-check disagrees with checkout-time validation. | `{fingerprint, orderId, checkoutStatus, labelCheckStatus}` |
| `shipping.address.cache_swept` | Scheduled sweep deletes expired entries. | `{deletedCount}` |
| `shipping.address.bulk_revalidation_complete` | `revalidateCustomerAddresses` finishes a run. | `{processed, changedToValid, changedToInvalid, errors}` |

Events are also consumed by `audit-log-system` for admin-visible history and by `site-notification-system` to alert administrators to provider credential errors.

---

## 15. References

### 15.1 External provider documentation

- **USPS Addresses API v3** — `https://developer.usps.com/addressesv3`. OAuth2 flow reused from `shipping-providers-usps` (PRD C3). Endpoint: `GET /addresses/v3/address`. DPV codes documented at `https://postalpro.usps.com/node/221`.
- **SmartyStreets US Street API** — `https://www.smarty.com/docs/cloud/us-street-api`. Auth-Id + Auth-Token.
- **SmartyStreets International API** — `https://www.smarty.com/docs/cloud/international-street-api`.
- **Google Address Validation API** — `https://developers.google.com/maps/documentation/address-validation/overview`. Per-request API key.
- **UPS Address Validation Street Level** — `https://developer.ups.com/api/reference?loc=en_US#operation/AddressValidation`. OAuth2 shared with UPS rating (PRD C2).
- **FedEx Address Validation API** — `https://developer.fedex.com/api/en-us/catalog/address-validation.html`. OAuth2 shared with FedEx rating (PRD C4).
- **DHL Address Validate** — `https://developer.dhl.com/api-reference/address-validation`.

### 15.2 Internal references

- `ConvexPress-Admin/packages/backend/convex/schema/commerce.ts` (lines 51–62) — baseline `commerceAddressValidator` extended in §4.4.
- `ConvexPress-Admin/packages/backend/convex/commerce/checkout.ts` — integration point; the validation call sits immediately before rate calculation in `startCheckout` / `updateShippingAddress` and immediately before order write in `completeCheckout`.
- `ConvexPress-Admin/packages/backend/convex/shipping/actions.ts` — USPS OAuth token flow reused for USPS Addresses API v3. The token cache, refresh logic, and credential resolution should be factored into a shared helper (`convex/shipping/providers/usps/auth.ts`) at implementation time so address validation and rating share one token.
- `shipping-providers-usps` (PRD C3) — credential storage, quota handling.
- `rate-calculation-pipeline` (PRD A7) — consumes `isResidential` and `normalizedAddress`; shares fingerprint helper.
- `shipping-labels-system` (PRD D1) — performs the label-time re-check per §5.5 / E20.
- `checkout-system` PRD — owns the storefront UX defined in §9.
- `settings-system` PRD — owns the config storage referenced in §7.
- `event-dispatcher-system` PRD — consumes the events defined in §14.
- `role-capability-system` PRD — registers the capabilities defined in §13.
- `audit-log-system` PRD — consumes setting changes and admin overrides.

### 15.3 Open questions for implementation phase

1. Do we expose address autocomplete (typeahead) as a phase-2 feature on top of the same provider set? Decision deferred; schema and action names chosen to leave room.
2. Should `isResidential` overrides at the individual customer level be stored on `commerce_addresses` or on `commerce_customers`? Current plan: `commerce_addresses` (see §4.2). Revisit if business requires customer-wide classification.
3. Do we offer a self-serve "appeal" flow for shoppers whose address is flagged invalid but is in fact real (rural / new construction)? Out of scope for v1; shopper may use "Keep what I entered" override under fail-open.
4. Cost-allocation reporting (which merchant on multi-site instances consumed how many paid validations)? Needs multi-site accounting — captured separately under `multi-site-deployment`.

---

*End of PRD — Address Validation Service.*
