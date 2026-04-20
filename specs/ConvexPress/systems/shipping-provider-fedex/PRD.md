# PRD: FedEx Provider (Direct REST API)

**System ID:** `shipping-provider-fedex`
**Layer:** C (Shipping Provider Adapter)
**Status:** Draft
**Owner:** Commerce / Shipping Domain
**Last Updated:** 2026-04-14

---

## 1. Context & Intent

### 1.1 What This Is

The FedEx Provider is a direct **Layer C** shipping provider adapter that implements the `LiveRateProvider` contract defined in `shipping-method-live-rate` (B10) on top of **FedEx's public REST API** (`https://apis.fedex.com`). Unlike the `shipping-provider-shipstation` aggregator (C1), which brokers FedEx rates through a third-party platform, this adapter speaks directly to FedEx using the merchant's own FedEx account number, negotiated rates, and OAuth client credentials. It is a peer of `shipping-provider-ups` (C2), `shipping-provider-usps` (C3), and `shipping-provider-dhl` (C5) — each direct carrier adapter encapsulates one carrier's REST surface and normalizes every response into the shapes declared in B10.

FedEx exposes a large API surface (Rate, Ship, Track, Address Validation, Pickup, Tariff, Trade Documents, Returns, Freight, Mail), but the v1 scope of this adapter is tightly limited to the four capabilities that the Rate Calculation Pipeline (A7), Checkout (A8), and the post-purchase fulfillment flow require: **rates**, **labels (create + void)**, **tracking**, and **address validation**. Pickup scheduling, freight, returns RMA workflows, and customs trade documents are out of scope and deferred to follow-on PRDs.

### 1.2 Why It Exists

FedEx is the **second-largest parcel carrier in the United States** and the primary international parcel carrier for high-value goods. ConvexPress merchants who have negotiated FedEx accounts — typically tier-2 merchants doing $1M+ GMV who have a FedEx rep and discounted rate tables — must be able to surface those negotiated rates at checkout without routing through an aggregator. Every dollar of aggregator markup on a FedEx label is a dollar off the merchant's margin, and enterprise merchants reject aggregators on principle because aggregators cannot guarantee that the merchant's specific account rates (and not the aggregator's pooled rates) are what render at checkout.

The `rateRequestType: ["ACCOUNT"]` flag in the FedEx Rate API is the critical primitive here: it tells FedEx to return the *merchant's own negotiated rates* rather than list rates. This adapter uses `ACCOUNT` by default and exposes a capability toggle so merchants can optionally add `LIST` for reference or audit purposes.

### 1.3 Relationship to Existing Code

ConvexPress already contains a partially-structured FedEx implementation in `ConvexPress-Admin/packages/backend/convex/shipping/actions.ts`. The existing call sites are:

- OAuth token acquisition: lines **264–372**
- Service code map: lines **387–400**
- Rate fetching: lines **1001–1231**
- Tracking: lines **1528–1643**
- Label purchase + void: lines **1886–2114**

Recent audit fixes to this code are **load-bearing and must survive the refactor**:

1. The `recipient.address.residential` flag on label creation was previously hardcoded to `true`. An audit corrected this to be **dynamic** — derived from whether the recipient supplied a company name (commercial) versus no company (residential). The refactor must preserve this dynamic derivation in both the rate request path and the label request path.
2. The service-code map treats `GROUND_HOME_DELIVERY` and `FEDEX_HOME_DELIVERY` as aliases for the same service. Both must round-trip correctly.

### 1.4 Known Audit Gaps Addressed by This PRD

The current implementation has one material production gap that this PRD specifies the fix for:

- **No OAuth token caching.** Every rate request, label request, track request, and verify-connection call currently fetches a fresh OAuth token via `POST /oauth/token`. FedEx access tokens are valid for 3600 seconds (1 hour). At checkout scale (even modest traffic), this is hundreds of unnecessary token requests per hour per merchant connection, burns FedEx OAuth endpoint rate limit, and adds 200–600 ms of avoidable latency to every outbound FedEx call. The refactor introduces a per-connection token cache with a 55-minute TTL (5-minute safety buffer before the 60-minute server-side expiry) stored in a dedicated `fedex_oauth_tokens` table keyed by `connectionId`.

### 1.5 Design Philosophy

1. **Contract-driven.** Nothing in this adapter deviates from the `LiveRateProvider` shape declared in B10. FedEx-specific response fields are normalized at the boundary; the Pipeline never sees a FedEx payload.
2. **Account-specific by default.** `rateRequestType` defaults to `["ACCOUNT"]` to return the merchant's negotiated rates. `LIST` is opt-in via provider config.
3. **Residential vs commercial is dynamic.** Both rate and label requests derive the `residential` flag from the recipient's company-name presence, never from a hardcoded default. Misclassifying a commercial address as residential triggers a FedEx residential surcharge (and vice-versa triggers a FedEx commercial correction post-ship); both are costly and both are avoidable.
4. **Degrade, don't fail.** A rate call that returns three services when five were expected returns the three. The adapter emits `shipping.rates.partial` for observability but never blocks checkout.
5. **Zero silent failures.** Every 4xx/5xx response is classified, mapped to a normalized `ShippingProviderError`, emitted as an event, and surfaced on the admin integration page.
6. **Cache tokens aggressively.** Every outbound FedEx call goes through `getAccessToken(connectionId)`, which reads from the cache, refreshes if within 5 minutes of expiry, and handles concurrent-refresh races with a per-connection lock.

### 1.6 Non-Goals (Explicit)

- **Pickup scheduling.** `POST /pickup/v1/pickups` is deferred to a dedicated Pickup system.
- **Freight (LTL, FedEx Freight Priority/Economy).** Freight rate structures require dimensional freight class, NMFC codes, and accessorials that are outside the small-parcel data model.
- **FedEx Returns (RMA flow).** Return-label generation is technically supported by the Ship API, but the RMA workflow belongs in a dedicated Returns system.
- **Trade documents (commercial invoice, CoO generation).** International documents are staged for a later iteration.
- **FedEx Mail / SmartPost.** `SMART_POST` is a recognized service code but requires a separate Hub ID configuration that v1 does not surface.
- **Legacy SOAP endpoints.** This adapter targets REST only. FedEx has announced the retirement of legacy Web Services SOAP APIs; see §15.

---

## 2. Scope

### 2.1 In Scope

1. **Rates.** Account-specific negotiated rates via `POST /rate/v1/rates/quotes` with `rateRequestType: ["ACCOUNT"]`. Optional `LIST` for reference display.
2. **Labels — purchase.** `POST /ship/v1/shipments` with `labelResponseOptions: "URL_ONLY"` returning a FedEx-hosted label URL plus the tracking number.
3. **Labels — void.** `PUT /ship/v1/shipments/cancel` referenced by tracking number.
4. **Tracking.** `POST /track/v1/trackingnumbers` with 2-letter status code normalization (see §10.4).
5. **Address validation (optional capability).** `POST /address/v1/addresses/resolve` surfaced to the Address Validation System (A5) when routed through this provider.
6. **Connection verification.** `verifyConnection` acquires (or refreshes) an OAuth token and pings a lightweight endpoint; failure reports into `shipping_provider_connections.status`.
7. **OAuth token caching.** Per-connection token cache with 55-minute TTL, concurrent-refresh lock, automatic invalidation on `401 Unauthorized`, and observability event on refresh.
8. **Service-code mapping.** Canonical map from FedEx service codes to ConvexPress service identifiers, including the `GROUND_HOME_DELIVERY` ↔ `FEDEX_HOME_DELIVERY` alias pair.
9. **Dynamic residential flag.** Both rate and label payloads derive `recipient.address.residential` from the company-name presence on the recipient address.
10. **Error classification and retry.** All HTTP errors map to B10's `ShippingProviderError`; retry policy per status class (5xx retry with backoff; 401 refresh-then-retry-once; 4xx validation surfaces to caller).
11. **Admin integration UX.** Settings → Integrations → Shipping → FedEx page with client ID, client secret, account number, sandbox toggle, test-connection button, last-verified timestamp, cache status, and error log.
12. **Capability flag advertisement.** `{ rates: true, labels: true, tracking: true, addressValidation: true, manifests: false, pickup: false, returns: false }`.

### 2.2 Out of Scope

- **Pickup scheduling** (future — dedicated Pickup system).
- **FedEx Freight / LTL** (future — separate freight adapter).
- **Returns RMA workflow** (future — Returns system will call this adapter's `purchaseReturnLabel` method once added).
- **Trade documents (commercial invoice generation, CoO)** (future).
- **Batch label purchase** — labels are one-per-call in v1.
- **SmartPost / FedEx Mail services.**
- **Hold-at-location / evening delivery / Saturday delivery toggles beyond what is exposed as raw service codes.**

### 2.3 Boundary Tests

- *"Merchant wants to show FedEx rates but has no FedEx account."* → They cannot use this adapter. Either use C1 (ShipStation) with FedEx connected there, or sign up for a FedEx account. Out of scope.
- *"Show both list rates and negotiated rates for comparison."* → Provider config exposes `rateRequestType: ["ACCOUNT", "LIST"]`; normalized quote includes both as separate entries differentiated by `rateType`. In scope.
- *"Print end-of-day FedEx Ground manifest."* → FedEx Ground does not require an electronic manifest like USPS SCAN forms; pickup is scheduled separately. Out of scope for v1.
- *"Schedule a FedEx pickup after label purchase."* → Out of scope; deferred to Pickup system. Event `shipping.label.purchased` carries enough data for the future Pickup system to react.
- *"International shipment to Canada with customs."* → In scope for rates/label with basic customs line items. Advanced trade documents out of scope.
- *"Residential delivery surcharge appearing post-ship."* → This is exactly what the dynamic residential flag prevents; see §10.2.

---

## 3. Dependencies

### 3.1 Upstream (Required Before This Ships)

| System | PRD ID | Why It's Required |
|--------|--------|-------------------|
| Live Rate Contract | B10 (`shipping-method-live-rate`) | Defines `LiveRateProvider` interface, `NormalizedShippingQuote`, `ShippingProviderError`, capability flag shape, event namespace, TTL/fingerprint helpers. This adapter implements B10 verbatim. |
| Packages | A3 (`shipping-packages-system`) | Rate and label requests carry package dimensions/weight; packages resolve by code from `commerce_shipping_packages` and serialize into FedEx's `requestedShipment.requestedPackageLineItems[]`. |
| Address Validation | A5 (`address-validation-system`) | Ship-from and ship-to addresses are structurally validated before being sent to FedEx. A5's normalized `Address` is what this adapter consumes. |
| Rate Calculation Pipeline | A7 (`rate-calculation-pipeline`) | The Pipeline calls `fetchRates`. It owns TTL caching at the quote level, fingerprinting, and ranking. This adapter produces normalized quotes. |
| Ship-From Locations | `ship-from-locations-system` | Origin addresses on rate/label requests resolve through the active ship-from profile. |
| Settings System | `settings-system` | API credentials storage follows the settings-first pattern (DB first, env fallback). |
| Event Dispatcher | `event-dispatcher-system` | The adapter emits events (`shipping.rates.returned`, `shipping.label.purchased`, `shipping.tracking.updated`, `shipping.provider.fedex.oauth_refreshed`) through the central dispatcher. |
| Audit Log | `audit-log-system` | Connection config changes, label purchases, and label voids are audit-logged. |

### 3.2 Downstream (Consumers)

- **Rate Calculation Pipeline (A7)** — calls `fetchRates` during checkout.
- **Checkout (A8)** — renders quotes produced by the Pipeline.
- **Fulfillment / Orders** — calls `purchaseLabel` post-order.
- **Returns system (future)** — will call `purchaseReturnLabel`.
- **Customer-facing tracking page** — reads normalized tracking records produced by `trackShipment`.

### 3.3 Peer Provider Adapters

The adapter shares a common shape with `shipping-provider-shipstation` (C1), `shipping-provider-ups` (C2), `shipping-provider-usps` (C3), and `shipping-provider-dhl` (C5). Helpers extracted for C1 (error mapping, rate normalization, retry wrapper) are reused; FedEx-specific helpers live only under `convex/shipping/providers/fedex/`.

---

## 4. Schema

FedEx does not introduce new top-level tables. It reuses the provider tables established by B10 and C1 with `provider = "fedex"`, plus one **FedEx-specific auxiliary table** for the OAuth token cache.

### 4.1 Reused Tables (from B10 / C1)

| Table | Used For |
|-------|----------|
| `shipping_provider_connections` | Stores merchant's FedEx credentials (client ID, client secret, account number, sandbox flag, meter number if supplied). One row per connected FedEx account. |
| `shipping_provider_accounts` | One row per FedEx connection. (FedEx is single-carrier, so connection ↔ account is 1:1 — unlike aggregators, which are 1:N.) |
| `shipping_provider_rate_cache` | Optional TTL cache of normalized quotes at the Pipeline level. |
| `shipping_provider_errors` | Classified error rows for the admin error log. |
| `shipping_labels` | Purchased labels (tracking number, label URL, cost, service, void status). |
| `shipping_tracking_events` | Per-scan tracking event history. |

### 4.2 New Table: `fedex_oauth_tokens`

A dedicated per-connection token cache. Kept as a standalone table (not stashed inside `shipping_provider_connections`) so that (a) credentials and transient tokens have different sensitivity profiles and different audit requirements, and (b) race-free cache refresh is clearer with a dedicated record.

Fields (types only, no code):

- `connectionId: Id<"shipping_provider_connections">`
- `accessToken: string` (encrypted at rest via settings system's `secret` column type)
- `tokenType: string` (always `"bearer"` for FedEx)
- `scope: string | null`
- `expiresAt: number` (unix ms; derived from `expires_in` seconds at acquisition time)
- `refreshLockId: string | null` (advisory lock token for concurrent refresh)
- `refreshLockExpiresAt: number | null` (lock expiry; 30 s)
- `lastRefreshedAt: number`
- `refreshCount: number` (cumulative; for observability)

Indexes:

- `by_connection` on `[connectionId]` (one row per connection; upserted on refresh)
- `by_expiry` on `[expiresAt]` (for background expiry sweep, optional)

Schema file: `ConvexPress-Admin/packages/backend/convex/schema/fedexOauth.ts`, exporting `fedexOauthTables` and spread into `schema.ts` per project convention.

### 4.3 Schema File Placement

Per the modular schema convention:

- `convex/schema/fedexOauth.ts` — new, above
- `convex/schema/shippingProviders.ts` — existing (from B10); unchanged

This PRD does not modify any existing schema file.

---

## 5. Data Model

### 5.1 Auth Model

FedEx uses **OAuth 2.0 Client Credentials** grant. Tokens are acquired via a **form-encoded POST**, not JSON:

- Endpoint: `POST {baseUrl}/oauth/token`
- `Content-Type: application/x-www-form-urlencoded`
- Body (as `URLSearchParams`): `grant_type=client_credentials&client_id={CLIENT_ID}&client_secret={CLIENT_SECRET}`
- Response: `{ access_token, token_type: "bearer", expires_in: 3600, scope }`

This is a critical shape detail — sending JSON instead of form-encoded returns `400 Bad Request` with an opaque `NOT.AUTHORIZED.ERROR`.

Tokens are valid for **3600 seconds**. The cache TTL is **55 minutes (3300 seconds)** — a 5-minute buffer before server-side expiry so that in-flight requests that start just before the buffer do not fail. On a `401 Unauthorized` from any downstream call, the token is invalidated and the request is retried once with a fresh token.

### 5.2 Base URLs

| Environment | Base URL |
|-------------|----------|
| Production | `https://apis.fedex.com` |
| Sandbox | `https://apis-sandbox.fedex.com` |

The `sandbox` flag on `shipping_provider_connections` selects the base URL. All endpoint paths are identical across environments.

### 5.3 Credentials

Stored on `shipping_provider_connections`:

- `clientId: string` — required
- `clientSecret: string` — required, encrypted
- `accountNumber: string` — required (FedEx payer account)
- `meterNumber: string | null` — optional; still required by some legacy endpoints, unused by v1 REST flows but captured
- `sandbox: boolean` — default `true` at create; flipped explicitly when moving to production

### 5.4 Capability Flags

Advertised by the adapter's `getCapabilities()` method per B10:

| Capability | Value | Notes |
|------------|-------|-------|
| `rates` | `true` | Core |
| `labels` | `true` | Core |
| `tracking` | `true` | Core |
| `addressValidation` | `true` | Via `/address/v1/addresses/resolve` |
| `manifests` | `false` | FedEx Ground/Express do not require electronic manifests |
| `pickup` | `false` | Deferred |
| `returns` | `false` | Deferred |
| `negotiatedRates` | `true` | `rateRequestType: ["ACCOUNT"]` |
| `residentialDetection` | `true` | Dynamic based on company-name presence |

### 5.5 Rate Request Structure

(Types only; no code.)

Top-level request body shape for `POST /rate/v1/rates/quotes`:

- `accountNumber: { value: string }` — merchant's FedEx account number
- `rateRequestControlParameters`:
  - `returnTransitTimes: true` — so quotes carry `estimatedDeliveryDate`
  - `servicesNeededOnRateFailure: true` — degrade gracefully
  - `variableOptions: []`
  - `rateSortOrder: "SERVICENAMETRADITIONAL"`
- `requestedShipment`:
  - `shipper.address`:
    - `streetLines: string[]` (array; line 1 / line 2)
    - `city: string`
    - `stateOrProvinceCode: string`
    - `postalCode: string`
    - `countryCode: string` (ISO-2)
  - `recipient.address` (**singular** for Rate API — note plural vs singular divergence from Ship API, §5.6):
    - Same shape as shipper address plus
    - `residential: boolean` — **dynamic**: `true` if no company name on recipient, `false` if company name supplied
  - `pickupType: "DROPOFF_AT_FEDEX_LOCATION"` (default; overridable)
  - `packagingType: "YOUR_PACKAGING"` (default) or a specific FedEx packaging code (see §10.5)
  - `rateRequestType: ["ACCOUNT"]` (default; `["ACCOUNT", "LIST"]` when both are requested)
  - `requestedPackageLineItems[]`:
    - `weight: { units: "LB", value: number }`
    - `dimensions: { length, width, height, units: "IN" }`

### 5.6 Label Request Structure

Top-level request body shape for `POST /ship/v1/shipments`:

- `accountNumber: { value: string }`
- `labelResponseOptions: "URL_ONLY"` (we store/serve the FedEx-hosted URL; `LABEL` returns base64 inline — not used v1)
- `requestedShipment`:
  - `shipper.address`: same shape as rate request
  - **`recipients: Address[]`** — **PLURAL ARRAY** for Ship API (contrast: Rate API uses singular `recipient`)
    - Each recipient has `address` with `residential: boolean` — **dynamic** per audit fix
  - `shipDatestamp: "YYYY-MM-DD"`
  - `serviceType: string` — specific FedEx service code (see §5.8)
  - `packagingType: string` — "YOUR_PACKAGING" or specific FedEx packaging
  - `shippingChargesPayment`:
    - `paymentType: "SENDER"` (always v1; "RECIPIENT" / "THIRD_PARTY" deferred)
    - `payor.responsibleParty.accountNumber.value: string`
  - `labelSpecification`:
    - `labelFormatType: "COMMON2D"`
    - `imageType: "PDF" | "PNG" | "ZPL"` (default `"PDF"`; `"ZPL"` for thermal printers)
    - `labelStockType: "PAPER_4X6"` (default; most common merchant printer)
  - `requestedPackageLineItems[]`: weight, dimensions, and optional `customerReferences[]` for order number / PO number

### 5.7 Label Void Request

`PUT /ship/v1/shipments/cancel`:

- Body: `{ accountNumber: { value }, trackingNumber: string, emailShipment: false, senderCountryCode: string }`
- Success: `{ cancelledShipment: true }`

### 5.8 Service Codes

Canonical map — both FedEx codes and canonical ConvexPress service identifiers. The alias pair `GROUND_HOME_DELIVERY` ↔ `FEDEX_HOME_DELIVERY` both map to the same normalized service; either variant from FedEx must round-trip to the same internal name. Lives in `convex/shipping/providers/fedex/serviceCodes.ts`.

| FedEx Service Code | Normalized Name | Category | International |
|--------------------|-----------------|----------|---------------|
| `FEDEX_GROUND` | FedEx Ground | Ground (commercial) | — |
| `FEDEX_HOME_DELIVERY` | FedEx Home Delivery | Ground (residential) | — |
| `GROUND_HOME_DELIVERY` | FedEx Home Delivery | Ground (residential) — **alias of above** | — |
| `FEDEX_EXPRESS_SAVER` | FedEx Express Saver | Express (3-day) | — |
| `FEDEX_2_DAY` | FedEx 2Day | Express (2-day) | — |
| `FEDEX_2_DAY_AM` | FedEx 2Day AM | Express (2-day AM) | — |
| `STANDARD_OVERNIGHT` | FedEx Standard Overnight | Express (overnight) | — |
| `PRIORITY_OVERNIGHT` | FedEx Priority Overnight | Express (overnight morning) | — |
| `FIRST_OVERNIGHT` | FedEx First Overnight | Express (overnight early AM) | — |
| `FEDEX_INTERNATIONAL_ECONOMY` | FedEx International Economy | International | ✓ |
| `FEDEX_INTERNATIONAL_PRIORITY` | FedEx International Priority | International | ✓ |
| `FEDEX_INTERNATIONAL_FIRST` | FedEx International First | International (early AM) | ✓ |

Services not in this list are surfaced as raw `serviceType` strings with a generated display name; the map is conservative and grows as new services are validated.

### 5.9 Normalized Quote Shape (per B10)

Every FedEx rate quote is transformed at the adapter boundary into `NormalizedShippingQuote`:

- `providerId: "fedex"`
- `providerAccountId: Id<"shipping_provider_accounts">`
- `carrierCode: "fedex"`
- `serviceCode: string` (normalized per §5.8)
- `serviceName: string`
- `amount: { value: number, currency: string }`
- `rateType: "ACCOUNT" | "LIST"`
- `estimatedDeliveryDate: string | null`
- `transitDays: number | null`
- `deliveryDays: number | null` (business days)
- `surcharges: Array<{ type: string, amount: number }>` (e.g., residential, fuel, delivery area)
- `raw: object` (entire FedEx response item; retained for debugging, never shown to user)

---

## 6. Functions / API

All functions live under `convex/shipping/providers/fedex/` and are invoked through the adapter wrapper that implements `LiveRateProvider` at `convex/shipping/providers/fedex.ts`.

### 6.1 `fetchRates(ctx, input) → NormalizedShippingQuote[]`

Primary entry point called by the Rate Calculation Pipeline (A7).

Flow:

1. Resolve the connection by `providerAccountId`.
2. Acquire access token via `getAccessToken(connectionId)` (cache-first).
3. Derive `recipient.address.residential` dynamically from `input.recipient.company` presence.
4. Build rate request body per §5.5.
5. `POST {baseUrl}/rate/v1/rates/quotes` with `Authorization: Bearer {token}` and `X-locale: en_US`.
6. On `401`: invalidate cache, re-acquire token, retry **once**.
7. On `5xx`: retry with exponential backoff up to 2 times.
8. On success: transform `output.rateReplyDetails[]` → `NormalizedShippingQuote[]` per §5.9.
9. Emit `shipping.rates.returned` with quote count and duration.
10. On partial success (some services failed): emit `shipping.rates.partial`.

### 6.2 `purchaseLabel(ctx, input) → PurchasedLabel`

Called post-order by Fulfillment.

Flow:

1. Resolve connection + token.
2. Derive dynamic `residential` flag on the recipient (audit fix).
3. Build ship request body per §5.6 with **plural `recipients` array**.
4. `POST {baseUrl}/ship/v1/shipments`.
5. Parse response: extract `output.transactionShipments[0].pieceResponses[0].trackingNumber` and the `packageDocuments[0].url`.
6. Persist to `shipping_labels` with the FedEx-hosted URL, cost, service, and raw response.
7. Emit `shipping.label.purchased`.
8. Return `{ trackingNumber, labelUrl, cost, serviceCode, rawResponseId }`.

### 6.3 `voidLabel(ctx, input) → VoidResult`

Flow:

1. Resolve connection + token.
2. Build cancel body per §5.7.
3. `PUT {baseUrl}/ship/v1/shipments/cancel`.
4. Mark `shipping_labels.voided = true` and `voidedAt = now`.
5. Emit `shipping.label.voided`.

### 6.4 `trackShipment(ctx, input) → NormalizedTracking`

Flow:

1. Resolve connection + token.
2. `POST {baseUrl}/track/v1/trackingnumbers` with body `{ trackingInfo: [{ trackingNumberInfo: { trackingNumber } }], includeDetailedScans: true }`.
3. Normalize FedEx 2-letter status codes (see §10.4) to canonical `delivered | shipped | in_transit | exception | cancelled | pending`.
4. Persist scans to `shipping_tracking_events`.
5. Emit `shipping.tracking.updated`.

### 6.5 `verifyConnection(ctx, connectionId) → ConnectionHealth`

Flow:

1. Force-refresh the token (bypass cache once) to validate current credentials.
2. If refresh succeeds, mark `shipping_provider_connections.status = "connected"`, update `lastVerifiedAt`.
3. If refresh fails, mark `status = "error"`, store classified error.
4. Return `{ ok: boolean, message: string, verifiedAt: number }`.

### 6.6 `validateAddress(ctx, input) → NormalizedAddressResult` (optional capability)

Called by A5 when FedEx is selected as the validation provider.

1. `POST {baseUrl}/address/v1/addresses/resolve`.
2. Normalize response into A5's `AddressValidationResult` shape (includes `residential` classification, normalized lines, postal standardization).

### 6.7 Internal Helpers

- `getAccessToken(ctx, connectionId) → string` — cache-first; refreshes if within 5 min of expiry.
- `refreshAccessToken(ctx, connectionId) → TokenRecord` — acquires lock, POSTs `/oauth/token`, upserts `fedex_oauth_tokens`, emits `shipping.provider.fedex.oauth_refreshed`, releases lock.
- `invalidateToken(ctx, connectionId)` — called on `401`.
- `mapHttpError(response) → ShippingProviderError` — uniform error classification.
- `isResidential(address) → boolean` — returns `!address.company || address.company.trim() === ""`.

### 6.8 Public Convex Functions

| Function | Kind | Purpose |
|----------|------|---------|
| `shipping.providers.fedex.verifyConnection` | mutation (admin) | Test credentials from the admin integration page. |
| `shipping.providers.fedex.listServiceCodes` | query (admin) | Returns the service-code catalog for merchant service-enablement UI. |
| `shipping.providers.fedex.fetchRatesPreview` | action (admin) | Debug-only: run a rate request from the admin panel with a synthetic address. |
| `shipping.providers.fedex.purchaseLabel` | action | Called by Fulfillment. |
| `shipping.providers.fedex.voidLabel` | action | Called by Fulfillment. |
| `shipping.providers.fedex.trackShipment` | action | Called by tracking poller / customer tracking page. |

Internal functions (not client-callable):

- `shipping.providers.fedex.internals.getAccessToken`
- `shipping.providers.fedex.internals.refreshAccessToken`
- `shipping.providers.fedex.internals.fetchRates` (wrapper used by Pipeline)

---

## 7. Admin UX

Accessed at **Settings → Integrations → Shipping → FedEx**.

### 7.1 Connection Panel

Fields:

- **Client ID** (text)
- **Client Secret** (password / masked after first save; "Rotate" action replaces)
- **Account Number** (text)
- **Meter Number** (text, optional)
- **Sandbox Mode** (toggle; default on for new connections)

Buttons:

- **Test Connection** → invokes `verifyConnection`. Shows spinner, then green check with "Connected (sandbox)" or red error with classified message.
- **Save** → persists credentials, emits `shipping.provider.configured`.

Read-only display:

- Last verified timestamp.
- Last refresh timestamp from `fedex_oauth_tokens.lastRefreshedAt`.
- Token cache status: "Cached (expires in 42 min)" vs "Not cached".
- Refresh counter: "Refreshed 14 times in last 24 h".

### 7.2 Service Enablement

The merchant can enable/disable which FedEx services render at checkout. Unchecking a service suppresses its quote at normalization time (not at request time — the merchant's contract may still require the service to be active).

Default set on first connect: Ground, Home Delivery, 2Day, Standard Overnight, Priority Overnight. International services default off.

### 7.3 Rate Request Type

Radio group:

- **Account rates only** (default) — `rateRequestType: ["ACCOUNT"]`
- **Account + List for comparison** — `rateRequestType: ["ACCOUNT", "LIST"]` (shows both; merchant picks which to surface)

### 7.4 Label Defaults

- Image type: PDF (default) / PNG / ZPL
- Label stock: `PAPER_4X6` (default) / other FedEx stock types

### 7.5 Error Log

Last 50 classified errors from `shipping_provider_errors` filtered to `provider = "fedex"`, with timestamp, endpoint, status code, normalized code, and message. Expandable to show request fingerprint (never the full body, never credentials).

### 7.6 Capability Summary (Read-Only)

Renders the capability map from §5.4 so the merchant understands what this adapter can and cannot do.

### 7.7 No Modals for Content Management

Per project UI rules, credential editing happens in-place on the page; rotation uses a confirmation dialog (the one permitted modal pattern for destructive actions).

---

## 8. Merchant Workflow

### 8.1 First-Time Setup

1. Merchant navigates to Settings → Integrations → Shipping → FedEx.
2. Clicks **Connect FedEx**. Empty connection panel renders.
3. Merchant goes to the FedEx Developer Portal, creates (or reuses) a Production or Test project, copies **API Key (Client ID)** and **Secret Key (Client Secret)**, and obtains their **9-digit Account Number** from their FedEx account dashboard.
4. Pastes into the panel. Leaves Sandbox on.
5. Clicks **Test Connection**. Adapter runs `verifyConnection` → OAuth token request → green check.
6. Clicks **Save**. Connection row is persisted with `sandbox = true`.
7. Goes to **Service Enablement** tab, confirms the default service set.
8. Creates a Live Rate shipping method (B10) that references this provider.
9. Runs a test checkout. Rates render.
10. When ready for production, toggles Sandbox off, rotates to production credentials, re-verifies.

### 8.2 Ongoing Use

- Checkout: Pipeline calls `fetchRates`; rates return; merchant's negotiated rates render.
- Order placed: Pipeline caches the winning quote's fingerprint; a post-order workflow calls `purchaseLabel` with the winning `serviceCode`.
- Label printed by fulfillment staff from the FedEx-hosted URL.
- Tracking updates either polled (scheduled action) or on-demand from the customer tracking page.
- If a label was purchased in error, fulfillment clicks **Void** within the FedEx void window (typically same day); `voidLabel` runs.

### 8.3 Credential Rotation

1. Merchant rotates client secret in the FedEx Developer Portal.
2. Opens ConvexPress → FedEx panel → **Rotate Secret**.
3. Pastes new secret, saves.
4. Adapter invalidates the cached token, forces a fresh OAuth, confirms.

### 8.4 Production Cutover

Explicit two-click promotion: toggle sandbox off, re-enter production credentials (never auto-copied from sandbox), re-verify. This is intentional — it prevents an accidental "save" from sending a test-mode label to a real customer.

---

## 9. Storefront UX

### 9.1 Quote Rendering

Rates surface in checkout as normalized quotes (per B10). The Pipeline (A7) is the renderer; this adapter only produces data.

Each FedEx quote is rendered with:

- **Service name** (normalized per §5.8 — e.g., "FedEx Ground", "FedEx 2Day", "FedEx Priority Overnight").
- **Carrier branding**: small FedEx word-mark next to the service name. Purple/orange brand colors are reserved for this carrier icon only; surrounding layout uses CSS theme variables (no hardcoded colors per project rules).
- **Price** (from `amount.value` with `currency`).
- **ETA** when `estimatedDeliveryDate` is present ("Arrives Tuesday, Oct 14") or `transitDays` ("2 business days").
- **Negotiated-rate indicator** (subtle): a small badge "Your rate" when `rateType === "ACCOUNT"` and list rates are also shown. If only account rates are shown, no badge (the rate *is* the merchant's rate; it would be redundant).

### 9.2 Residential vs Commercial Pricing

FedEx charges a **residential surcharge** (~$5.65 at 2026 rates) on Ground deliveries to residential addresses, and a separate **delivery area surcharge** for certain ZIPs. Both are reflected in the returned `totalNetCharge` when `residential: true` is set on the rate request. The adapter does not separately display the surcharge line; it is baked into the quoted amount that the customer sees, matching carrier invoice practice.

Misclassifying residential/commercial is the single largest source of post-ship billing corrections on FedEx accounts. The dynamic detection rule (company name present → commercial; absent → residential) aligns with FedEx's own classification default and is the source of truth here.

### 9.3 Home Delivery vs Ground

For residential recipients, **`FEDEX_HOME_DELIVERY` / `GROUND_HOME_DELIVERY`** is the appropriate service; for commercial recipients, **`FEDEX_GROUND`** is appropriate. A single rate request with the right residential flag returns the correct one; the adapter does not need to pick between them.

### 9.4 International

International services (`FEDEX_INTERNATIONAL_ECONOMY`, `FEDEX_INTERNATIONAL_PRIORITY`, `FEDEX_INTERNATIONAL_FIRST`) carry **international surcharges** (fuel, customs processing, remote area delivery). These are included in the quote and not separately surfaced. v1 does not render a customs line-item editor; customs data is auto-populated from product fields at label time.

### 9.5 Zero-Quote Handling

If FedEx returns no quotes for a given shipment (e.g., international without customs data, address outside service area), the adapter emits `shipping.rates.empty` and returns an empty array. The Pipeline decides how to handle (fallback method, error message).

---

## 10. Edge Cases

### 10.1 OAuth Token Not Cached (Current Audit Gap)

**Status:** Gap identified in existing code. This PRD specifies the fix.

- **Problem:** Every outbound FedEx call today triggers a fresh `POST /oauth/token`. At even modest checkout volume this is hundreds of token requests per hour per merchant, adds 200–600 ms latency per call, and burns FedEx OAuth endpoint rate quota. A single high-traffic merchant can trigger FedEx-side throttling.
- **Fix:** Introduce `fedex_oauth_tokens` (§4.2). Every call routes through `getAccessToken(connectionId)`:
  - Read cache row by `connectionId`.
  - If `expiresAt > now + 5min`, return cached token.
  - Else acquire refresh lock (insert-if-absent on `refreshLockId`), refresh, upsert, release lock, return new token.
  - On `401` from any downstream call, call `invalidateToken` and retry **once**.
- **Concurrency:** The refresh lock prevents two concurrent checkout requests from both triggering an OAuth call. Whichever wins the lock refreshes; the other waits (short-poll with 100 ms jitter) for up to 2 s, then reads the refreshed token.
- **Observability:** Every refresh emits `shipping.provider.fedex.oauth_refreshed` with `{ connectionId, refreshCount, reason: "expired" | "invalidated" | "forced" }`.

### 10.2 Residential vs Commercial Surcharge

- **Root:** Hardcoding `residential: true` on labels (the pre-audit state) causes FedEx to charge the residential surcharge on every label, including ones going to commercial addresses that should not be charged.
- **Rule:** `residential = !recipient.company`. A recipient with a company name is treated as commercial; without a company name, residential. This mirrors FedEx's own classification default and is the same rule used by UPS (C2).
- **Applies to:** Both rate requests (§5.5) and label requests (§5.6). Both paths must call the same `isResidential()` helper.
- **Audit test:** Unit test that creates a rate and a label with and without a company name, asserts that `residential` is `true` in the no-company case and `false` in the company case across both payloads.

### 10.3 `GROUND_HOME_DELIVERY` vs `FEDEX_HOME_DELIVERY` Duplicate Mapping

- FedEx accepts both service codes and returns one of them depending on which version of the Rate API surface responds.
- **Rule:** Both codes normalize to the same internal service identifier (`fedex_home_delivery`). The service-code map (§5.8) lists both. When the merchant selects "Home Delivery" in service enablement, the label request sends `FEDEX_HOME_DELIVERY` (the newer, preferred form). When a rate comes back labeled `GROUND_HOME_DELIVERY`, it is displayed as "FedEx Home Delivery".
- This is a deliberate duplicate in the map, not a bug.

### 10.4 Tracking Status Code Normalization

FedEx returns **2-letter status codes** on track responses. Canonical map:

| FedEx | Meaning | Normalized |
|-------|---------|------------|
| `DL` | Delivered | `delivered` |
| `IT` | In Transit | `shipped` |
| `OD` | Out for Delivery | `shipped` |
| `DP` | Departed | `shipped` |
| `AR` | Arrived at facility | `shipped` |
| `PU` | Picked Up | `shipped` |
| `DE` | Delayed | `exception` |
| `CA` | Cancelled | `cancelled` |
| `SE` | Shipment Exception | `exception` |
| `HL` | Hold at Location | `exception` |
| `RS` | Returned to Shipper | `exception` |
| (unknown) | — | `in_transit` (safest fallback; never drop) |

Codes not in this table surface as `in_transit` with the raw code preserved in the event record for manual review. The mapping is conservative — it would rather mark something `exception` than claim delivery.

### 10.5 FedEx One Rate Packaging

FedEx **One Rate** services (flat-rate packaging program) require specific `packagingType` codes that match FedEx-branded boxes, not `YOUR_PACKAGING`:

- `FEDEX_SMALL_BOX`
- `FEDEX_MEDIUM_BOX`
- `FEDEX_LARGE_BOX`
- `FEDEX_EXTRA_LARGE_BOX`
- `FEDEX_PAK`
- `FEDEX_TUBE`
- `FEDEX_ENVELOPE`

When the merchant selects a FedEx-branded package in the A3 Packages system, the package's `carrierPackageCode` maps to the appropriate `packagingType` in the rate/label request. If the package is custom, `packagingType: "YOUR_PACKAGING"` is used and weight/dimensions are required.

### 10.6 International Surcharges & Customs

- International services charge fuel surcharges, remote-area surcharges, and customs processing fees that are baked into the returned `totalNetCharge`.
- Rate requests for international shipments do not currently send customs line-items — this yields a provisional rate. Label requests **do** include customs data pulled from product fields (description, country of origin, HS code if present).
- v1 captures but does not edit customs at checkout time; this is deferred to a Trade Documents iteration.

### 10.7 FedEx Account Number Format

- 9 digits, no formatting. Validation on save: must match `/^\d{9}$/`.
- Sandbox and production accounts are different numbers; they cannot be mixed with each other's credentials.

### 10.8 Sandbox Credentials in Production

The explicit two-click cutover (§8.4) prevents sandbox credentials leaking into production. Additionally, the adapter checks at label-purchase time: if the connection is sandbox but the order is a real customer order, it emits a warning event `shipping.provider.fedex.sandbox_on_live_order` — the label still purchases (merchant may be testing), but the event is loud.

### 10.9 Rate API Returns `recipient` Singular, Ship API Returns `recipients` Plural

- This is a real FedEx API quirk: the **Rate** API takes `requestedShipment.recipient` (singular), while the **Ship** API takes `requestedShipment.recipients` (plural, an array).
- Forgetting to pluralize on Ship returns a `422` validation error: "recipients is required".
- The adapter has two builders — `buildRateRequest` and `buildShipRequest` — and they are explicitly tested to produce the correct shape.

### 10.10 Token Refresh Lock Starvation

If an OAuth refresh call hangs (FedEx degraded), the 30-second lock TTL ensures no caller waits forever. After 30 s the lock expires and the next caller attempts a fresh refresh. Callers waiting for a lock give up after 2 s and attempt their own acquire.

### 10.11 4xx Validation Errors

FedEx validation errors come back with structured error arrays in `errors[].code` and `errors[].message`. The adapter maps these to B10's `ShippingProviderError` with `kind: "validation"` and includes the full error array in the normalized error so the admin error log can display FedEx's native messages verbatim.

### 10.12 Rate Limit (429)

FedEx applies per-endpoint and per-account rate limits. On `429`:

- Honor the `Retry-After` header when present.
- Fall back to exponential backoff (1 s, 2 s, 4 s) with jitter.
- After 3 retries, surface as `ShippingProviderError { kind: "rate_limited" }`.

### 10.13 Legacy API Retirement

FedEx has publicly scheduled the retirement of legacy SOAP Web Services APIs in 2026. This adapter is REST-only from day one; no migration required. References in §15.

---

## 11. Testing Requirements

### 11.1 Sandbox Environment

- Base URL: `https://apis-sandbox.fedex.com`
- Credentials: FedEx Developer Portal → Test Project → API Key + Secret Key + sandbox account number.
- All rate, label, track, address validation, and oauth flows must have integration tests against sandbox that run in CI on a nightly cadence (credentials stored in CI secrets, not committed).

### 11.2 Unit Tests (Required)

1. **OAuth body shape** — `getAccessToken` posts `application/x-www-form-urlencoded`, not JSON. Assert on the raw body string.
2. **Token cache hit** — second call within 55 min returns cached token without issuing HTTP.
3. **Token cache near-expiry refresh** — force `expiresAt` to `now + 4 min`, call `getAccessToken`, assert refresh occurred.
4. **Token invalidation on 401** — mock a 401, assert cache invalidated and refresh triggered.
5. **Concurrent refresh lock** — two simultaneous `getAccessToken` calls issue exactly one refresh.
6. **Residential dynamic — rate path** — no company → `residential: true`; company "Acme Inc" → `residential: false`.
7. **Residential dynamic — label path** — same assertions against the Ship API body (with `recipients` plural).
8. **Service code alias** — both `GROUND_HOME_DELIVERY` and `FEDEX_HOME_DELIVERY` normalize to the same internal ID.
9. **Tracking status map** — every 2-letter code in §10.4 produces the expected normalized status.
10. **Rate API singular vs Ship API plural** — `buildRateRequest` emits `recipient` (singular); `buildShipRequest` emits `recipients` (plural array).
11. **Error classification** — 401/422/429/500 each map to the correct `ShippingProviderError.kind`.
12. **FedEx One Rate package mapping** — a `FEDEX_MEDIUM_BOX` package serializes to `packagingType: "FEDEX_MEDIUM_BOX"`, not `"YOUR_PACKAGING"`.

### 11.3 Integration Tests (Nightly, Sandbox)

1. `verifyConnection` with valid credentials → `ok: true`.
2. `verifyConnection` with invalid secret → `ok: false` with classified error.
3. `fetchRates` for a CA→TX Ground shipment → ≥1 quote including Ground.
4. `fetchRates` for a US→CA international shipment → ≥1 quote including an international service.
5. `purchaseLabel` for a Ground shipment → tracking number issued, label URL fetchable, cost > 0.
6. `voidLabel` against the purchased label → succeeds.
7. `trackShipment` against a known sandbox tracking number → returns expected status.

### 11.4 Load / Concurrency Tests

- 50 concurrent `fetchRates` calls from the same connection result in ≤2 OAuth refreshes (ideally 1).
- 100 sequential `fetchRates` over 70 minutes result in exactly 2 OAuth refreshes (the initial acquisition + the 55-minute refresh).

### 11.5 Audit Regression Tests

Every fix in §1.3 / §10.1 / §10.2 has a named regression test so the original bug cannot reappear silently.

---

## 12. Success Criteria

### 12.1 Functional

- FedEx Ground, Home Delivery, 2Day, Standard Overnight, Priority Overnight, and international services quote at checkout with account-specific negotiated rates.
- Label purchase returns a valid FedEx-hosted label URL plus tracking number.
- Label void succeeds within the FedEx void window.
- Tracking returns normalized status reflecting the true shipment state.
- Address validation proxies cleanly through A5.

### 12.2 Operational

- OAuth token refreshed at most once per 55 minutes per connection under load.
- Zero silent failures: every FedEx API error appears in the admin error log within 5 seconds.
- `verifyConnection` completes in under 2 seconds p95.
- `fetchRates` completes in under 2.5 seconds p95 (cold) and 1.8 seconds p95 (warm, token cached).

### 12.3 Correctness

- Residential surcharge correctly applied (no false residential labels on commercial addresses; no false commercial on residential).
- `GROUND_HOME_DELIVERY` and `FEDEX_HOME_DELIVERY` both round-trip to the same service.
- Rate vs Ship payload singular/plural divergence never causes validation errors in production.

### 12.4 Observability

- All five capability events fire reliably and are visible in the event dispatcher inspector (B10 events + `shipping.provider.fedex.oauth_refreshed`).
- Token cache status is inspectable from the admin panel without opening a terminal.

### 12.5 Parity with C1

Feature parity with `shipping-provider-shipstation` (C1) on every capability advertised in §5.4 (except manifests, pickup, returns — each marked `false`).

---

## 13. Roles & Capabilities

Capabilities follow the Role & Capability System; only Administrator and Editor roles touch FedEx config.

| Capability | Administrator | Editor | Author | Contributor | Subscriber |
|------------|---------------|--------|--------|-------------|------------|
| `admin.shipping.providers.fedex.connect` | ✓ | — | — | — | — |
| `admin.shipping.providers.fedex.configure` | ✓ | — | — | — | — |
| `admin.shipping.providers.fedex.rotate_secret` | ✓ | — | — | — | — |
| `admin.shipping.providers.fedex.disconnect` | ✓ | — | — | — | — |
| `admin.shipping.providers.fedex.verify` | ✓ | ✓ | — | — | — |
| `admin.shipping.providers.fedex.purchase_label` | ✓ | ✓ | — | — | — |
| `admin.shipping.providers.fedex.void_label` | ✓ | ✓ | — | — | — |
| `admin.shipping.providers.fedex.view_error_log` | ✓ | ✓ | — | — | — |

Authors and Contributors have no shipping-provider capabilities. Subscribers see tracking status on their own orders only — that is a Customer Dashboard capability, not a FedEx provider capability.

---

## 14. Events Fired

All events flow through the Event Dispatcher (`event-dispatcher-system`) per the B10 namespace plus one FedEx-specific event for OAuth observability.

### 14.1 B10 Contract Events (Shared Across Providers)

| Event | Payload | When |
|-------|---------|------|
| `shipping.rates.requested` | `{ providerId: "fedex", shipmentFingerprint }` | Start of `fetchRates`. |
| `shipping.rates.returned` | `{ providerId, quoteCount, durationMs }` | Successful rate response. |
| `shipping.rates.partial` | `{ providerId, quoteCount, expectedCount }` | Some services failed. |
| `shipping.rates.empty` | `{ providerId, reason }` | No quotes returned. |
| `shipping.rates.error` | `{ providerId, normalizedError }` | Rate call failed outright. |
| `shipping.label.purchased` | `{ providerId, trackingNumber, cost, serviceCode }` | Label successfully purchased. |
| `shipping.label.voided` | `{ providerId, trackingNumber }` | Void success. |
| `shipping.label.error` | `{ providerId, normalizedError }` | Label or void failure. |
| `shipping.tracking.updated` | `{ providerId, trackingNumber, status, scans }` | Track poll or push update. |
| `shipping.provider.configured` | `{ providerId, connectionId }` | Credentials saved. |
| `shipping.provider.verified` | `{ providerId, connectionId, ok }` | Verify connection run. |

### 14.2 FedEx-Specific Event

| Event | Payload | When |
|-------|---------|------|
| `shipping.provider.fedex.oauth_refreshed` | `{ connectionId, refreshCount, reason: "expired" \| "invalidated" \| "forced", expiresAt, durationMs }` | Every OAuth token refresh. Lets the admin panel surface refresh cadence; lets ops alert on abnormal refresh frequency (a symptom of cache misconfiguration or clock drift). |

### 14.3 Warning Event

| Event | Payload | When |
|-------|---------|------|
| `shipping.provider.fedex.sandbox_on_live_order` | `{ connectionId, orderId }` | Label purchase attempted against a sandbox connection for a non-test order. Does not block; logs loudly. |

---

## 15. References

### 15.1 Internal PRDs

- **B10** `shipping-method-live-rate` — Live Rate Contract (this adapter implements it)
- **A3** `shipping-packages-system` — Package catalog
- **A5** `address-validation-system` — Address normalization
- **A7** `rate-calculation-pipeline` — Caller of `fetchRates`
- **A8** Checkout — Renders quotes
- **C1** `shipping-provider-shipstation` — Peer aggregator adapter (FedEx-via-aggregator)
- **C2** `shipping-provider-ups` — Peer direct carrier adapter (identical pattern)
- **C3** `shipping-provider-usps` — Peer direct carrier adapter
- **C5** `shipping-provider-dhl` — Peer direct carrier adapter
- `settings-system` — Credential storage pattern
- `event-dispatcher-system` — Event emission
- `audit-log-system` — Connection + label audit trail
- `ship-from-locations-system` — Origin address resolution

### 15.2 FedEx Developer Documentation

- **FedEx Developer Portal** — `https://developer.fedex.com/`
- **FedEx API Catalog** — `https://developer.fedex.com/api/en-us/catalog.html`
- **OAuth 2.0** — `https://developer.fedex.com/api/en-us/catalog/authorization.html` (client credentials flow, form-encoded body, 1-hour token TTL)
- **Rate API** — `https://developer.fedex.com/api/en-us/catalog/rate.html` (POST `/rate/v1/rates/quotes`; negotiated rates via `rateRequestType: ["ACCOUNT"]`)
- **Ship API** — `https://developer.fedex.com/api/en-us/catalog/ship.html` (POST `/ship/v1/shipments`; PUT `/ship/v1/shipments/cancel`; label options)
- **Track API** — `https://developer.fedex.com/api/en-us/catalog/track.html` (POST `/track/v1/trackingnumbers`; 2-letter status codes)
- **Address Validation API** — `https://developer.fedex.com/api/en-us/catalog/address-validation.html`
- **Pickup API** (deferred) — `https://developer.fedex.com/api/en-us/catalog/pickup.html`
- **Service Codes reference** — `https://developer.fedex.com/api/en-us/guides/api-reference.html#servicetypes`

### 15.3 FedEx Legacy API Retirement

- FedEx publicly announced retirement of legacy Web Services (SOAP) APIs in 2026. Consult `https://developer.fedex.com/api/en-us/announcements.html` for the current retirement schedule.
- This adapter is REST-only. No migration work is required when SOAP is sunset.
- Merchants migrating from legacy integrations (e.g., WooCommerce FedEx plugins that still use SOAP) inherit the REST surface automatically by connecting through this adapter.

### 15.4 FedEx Brand Guidelines

- Service name display follows FedEx style: "FedEx Ground", "FedEx 2Day", "FedEx Priority Overnight" — no periods, "FedEx" is one word with capital F and X.
- FedEx word-mark usage in checkout UI must follow FedEx brand guidelines (purple F, orange Ex for Express services; purple F, green Ex for Ground services). Brand guidelines: `https://www.fedex.com/en-us/trademarks.html`.

### 15.5 Related Airtable Blueprint Records

- System: `shipping-provider-fedex` (Systems table `tblmiSawf6mIf56V8`)
- Expert: FedEx Provider Expert (System Experts table `tblTubYOAFng8uVi6`)
- Capabilities: prefix `admin.shipping.providers.fedex.*` (Actions table `tblQTSboBXFiXSP3O`)
- Events: `shipping.provider.fedex.oauth_refreshed`, `shipping.provider.fedex.sandbox_on_live_order` (Events table `tblDQOlXXJO1aQapT`)

### 15.6 Implementation Files (Target Layout)

- `ConvexPress-Admin/packages/backend/convex/shipping/providers/fedex.ts` — adapter entry implementing `LiveRateProvider`.
- `ConvexPress-Admin/packages/backend/convex/shipping/providers/fedex/tokenCache.ts` — OAuth token cache and refresh lock.
- `ConvexPress-Admin/packages/backend/convex/shipping/providers/fedex/serviceCodes.ts` — canonical service-code map (§5.8).
- `ConvexPress-Admin/packages/backend/convex/shipping/providers/fedex/requestBuilders.ts` — `buildRateRequest`, `buildShipRequest`, `buildTrackRequest`, `buildVoidRequest`.
- `ConvexPress-Admin/packages/backend/convex/shipping/providers/fedex/normalize.ts` — response normalizers (rate → quote, track → normalized tracking, error → `ShippingProviderError`).
- `ConvexPress-Admin/packages/backend/convex/shipping/providers/fedex/residential.ts` — `isResidential()` helper, shared between rate and label paths.
- `ConvexPress-Admin/packages/backend/convex/schema/fedexOauth.ts` — schema for `fedex_oauth_tokens`.
- `ConvexPress-Admin/packages/backend/convex/shipping/actions.ts` — existing entry points remain as thin delegators to the adapter to preserve call-site compatibility during refactor.

---

**End of PRD.**
