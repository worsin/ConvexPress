# PRD: UPS Provider (Direct REST API)

**System ID:** `shipping-provider-ups`
**Layer:** C (Shipping Provider Adapter)
**Status:** Draft
**Owner:** Commerce / Shipping Domain
**Last Updated:** 2026-04-14
**API Version:** UPS v2409 (current as of 2026-04)

---

## 1. Context & Intent

### 1.1 What This Is

The UPS Provider is a Layer C carrier adapter that integrates **directly with the UPS REST API** (not via ShipStation, EasyPost, or any aggregator). It implements the `LiveRateProvider` contract defined in PRD B10 (`shipping-method-live-rate`) and is invoked by the Rate Calculation Pipeline (PRD A7, `rate-calculation-pipeline`) alongside any other registered providers.

Concretely, the UPS Provider is responsible for:

1. **OAuth 2.0 authentication** against UPS's token endpoint using client credentials (client ID, client secret, and merchant account number).
2. **Rate shopping** via the UPS Rating API v2409 — returns negotiated rates when the authenticated account has them, otherwise list rates.
3. **Label purchase** via the UPS Shipping API v2409 — returns label image data (GIF/PNG/ZPL/EPL/SPL) plus tracking number.
4. **Label void** via the UPS Shipping Void endpoint — only valid within 24 hours of label creation.
5. **Tracking** via the UPS Tracking API v1 — returns normalized status and activity history.
6. **Connection verification** — an OAuth round-trip plus a probe rate request to confirm credentials work.
7. **Account sync** — reads the connected account number and stamps provider-level capability flags.

### 1.2 Why It Exists

ConvexPress already ships a ShipStation provider (PRD C1, `shipping-provider-shipstation`) that proxies UPS rates through the ShipStation account. That is the right default for low-volume merchants: zero UPS contract required, ShipStation handles the account relationship, and rates are competitive.

However, ShipStation charges a per-label margin and does **not** expose a merchant's own negotiated UPS rates once the merchant has graduated to a direct UPS contract. Large-volume merchants who ship 1,000+ packages/month typically move to a **direct UPS account** because:

1. UPS offers **volume-tiered discounts** (negotiated rates) that can be 30–60% below published rates and are only returned when the merchant's own `AccountNumber` is on the rate request as the `Shipper.ShipperNumber`.
2. Freight-class surcharge handling, residential/commercial DAS logic, and dimensional weight divisor are applied against the merchant's contract, not the aggregator's.
3. The merchant owns the customer service relationship (claims, refunds, pickup scheduling) rather than filing through a reseller.

This PRD defines the adapter that makes that direct integration possible **without changing anything else in the stack**. A merchant installs the provider, enters their OAuth credentials and account number, and the Pipeline (A7) begins quoting UPS rates the same way it quotes ShipStation rates. The merchant can run both providers side-by-side, or disable ShipStation entirely.

### 1.3 Design Philosophy

The UPS Provider is a **thin translation layer** between the abstract `LiveRateProvider` contract (B10) and the UPS REST API. It does not own any business logic that is not UPS-specific:

- It does **not** decide which packages to use — that comes from the packaging solver (A3/A4).
- It does **not** decide whether a service is available for a destination — that is UPS's own response logic plus Pipeline rules (A6).
- It does **not** cache rate results — the Pipeline (A7) owns quote-level caching via `addressKey`/`cartKey` fingerprints.
- It **does** cache OAuth tokens, because UPS tokens are valid for 4 hours and re-issuing them on every rate call would burn latency and rate limits.
- It **does** translate error shapes and status descriptions into the normalized shapes the Pipeline, checkout, and tracking UI consume.

The adapter lives in `convex/shipping/providers/ups.ts` (refactored out of the current monolithic `convex/shipping/actions.ts`). Its public surface is the six functions required by B10: `fetchRates`, `purchaseLabel`, `voidLabel`, `trackShipment`, `verifyConnection`, `syncAccounts`.

### 1.4 Non-Goals (Explicit)

- **UPS Surveys / Quantum View.** Out of scope. Merchants who need carrier-side visibility tools continue to use UPS's own portal.
- **UPS Freight (LTL / FTL).** Out of scope. This provider only covers UPS Parcel / Small Package (service codes 01–65). LTL is a separate product line with a different API surface.
- **Pickup Scheduling.** Deferred to a future iteration. For now merchants schedule pickups directly via UPS.com or a standing daily pickup.
- **Paperless Invoicing / International Forms.** Out of scope for v1. The rate and label flows accept international destinations, but customs forms are assumed to be handled outside ConvexPress.
- **Saturday / Holiday delivery upsells.** Out of scope for v1. The adapter returns the services UPS returns; surcharge toggles (Saturday delivery, Hold for Pickup) are deferred.
- **Non-US origin accounts.** v1 assumes the merchant's UPS account is US-based. Canada/EU origin accounts work at the API level but have not been validated.

### 1.5 Relationship To Other Providers

| Provider | Adapter File | Auth Model | Returns Negotiated Rates | Best For |
|----------|--------------|------------|--------------------------|----------|
| ShipStation (C1) | `shipping-provider-shipstation` | API key + secret | Via ShipStation's account | Low/mid volume, multi-carrier simplicity |
| **UPS Direct (C2, this PRD)** | **`shipping-provider-ups`** | **OAuth 2.0 client credentials** | **Yes, via `Shipper.ShipperNumber`** | **Merchants with direct UPS contracts, 1k+ packages/mo** |
| USPS Direct (C3) | `shipping-provider-usps` | OAuth 2.0 | N/A (rates are published) | USPS-heavy flat rate / ground advantage |
| FedEx Direct (C4) | `shipping-provider-fedex` | OAuth 2.0 | Yes, via meter number | FedEx contract accounts |
| DHL Direct (C5) | `shipping-provider-dhl` | API key | Yes, via account number | International |

UPS is the second most commonly requested direct integration after ShipStation. FedEx is architecturally very similar to this PRD; the same patterns (OAuth caching, service code mapping, label format enum, void window) apply.

---

## 2. Scope

### 2.1 In Scope

1. **OAuth 2.0 client credentials flow** against `POST /security/v1/oauth/token` with in-memory + persisted token cache and 5-minute refresh buffer.
2. **Rate shopping** via `POST /api/rating/v2409/Rate?additionalinfo=timeintransit` with `RequestOption=Shop` to return all available services in one call.
3. **Negotiated rates** via setting `Shipper.ShipperNumber` to the merchant's account number and reading `NegotiatedRateCharges.TotalCharge` when present.
4. **Label purchase** via `POST /api/shipments/v2409/ship` with configurable `LabelImageFormat` (GIF, PNG, ZPL, EPL, SPL).
5. **Label void** via `POST /api/shipments/v2409/void`, honoring UPS's 24-hour void window.
6. **Tracking** via `GET /api/track/v1/details/{trackingNumber}` with status normalization from `currentStatus.description` (or fallback `activity[0].status`).
7. **Connection verification** — OAuth token acquisition + small rate probe against a sandbox-safe origin/destination pair.
8. **Account sync** — records the connected `accountNumber`, last-verified timestamp, and UPS-reported account description into the provider connection row.
9. **Complete service code table** — full catalogue of UPS parcel service codes 01, 02, 03, 07, 08, 11, 12, 13, 14, 54, 59, 65 with canonical display names (including the audit fix for code `65` = "UPS Worldwide Saver").
10. **Capability flags** — `supports_rates=true`, `supports_labels=true`, `supports_tracking=true`, `supports_manifests=false`, `supports_address_validation=true`.
11. **Admin settings UI** — full page under Settings → Integrations → Shipping → UPS (credentials, sandbox toggle, test connection, service code display). No modal dialogs.
12. **Sandbox vs production mode** — a single boolean flag selects base URL `https://wwwcie.ups.com` vs `https://onlinetools.ups.com`.
13. **OAuth refresh event** — `shipping.provider.ups.oauth_refreshed` fires on every token refresh for audit visibility.

### 2.2 Out of Scope

- UPS Surveys / Quantum View.
- UPS Freight (LTL / FTL).
- Pickup Scheduling API (deferred to future PRD).
- Paperless Invoicing / International Forms (future).
- Saturday / Hold for Pickup / COD add-on services (future).
- Non-US origin accounts (not validated in v1).
- Address correction workflow UI (the provider surfaces the surcharge; UI is deferred).
- UPS My Choice / Delivery Alerts for end customers.
- Manifest / end-of-day close-out API (UPS does not require a manifest for most package types; deferred).

### 2.3 Boundary Tests

- "Add Saturday delivery toggle." → ❌ Out of scope v1. Open a follow-up PRD.
- "Fix code `65` showing as 'UPS Saver' instead of 'UPS Worldwide Saver'." → ✅ In scope (audit fix documented in §5.4).
- "Allow merchants to enter multiple UPS account numbers." → ❌ Out of scope v1. One `accountNumber` per connection row. Multi-account support can be modeled later as multiple connections.
- "Pipeline caches quotes for 15 minutes." → ❌ Not this PRD; that is A7. This provider just returns fresh quotes with correct fingerprints.
- "Cache the OAuth token for 4 hours minus 5 minutes." → ✅ In scope. Defined in §5.2.
- "Translate UPS error code `110208` (invalid postal) into a user-readable string." → ✅ In scope (§10.3).

---

## 3. Dependencies

### 3.1 Upstream Dependencies (Required)

| Dependency | System ID | Why |
|------------|-----------|-----|
| Live Rate Contract | `shipping-method-live-rate` (B10) | Defines the `LiveRateProvider` interface this adapter implements (`fetchRates`, `purchaseLabel`, `voidLabel`, `trackShipment`, `verifyConnection`, `syncAccounts`) and the `NormalizedShippingQuote` shape returned. |
| Packages | `shipping-packages-system` (A3) | `RateContext.packages` supplies box dimensions and weight that this adapter serializes into the UPS `Package[]` array. |
| Address Validation | `address-validation-system` (A5) | `RateContext.toAddress.residential` determines whether UPS rates should price as residential (ResidentialAddressIndicator). |
| Rate Calculation Pipeline | `rate-calculation-pipeline` (A7) | Sole caller of `fetchRates`. Owns quote caching, rule application, ranking, and fallback. |
| Ship-From Locations | `ship-from-locations-system` (A2) | `RateContext.fromAddress` populates `Shipper`, `ShipFrom`, and `PhysicalSource` on the UPS request. |
| Settings System | `settings-system` | Stores encrypted UPS credentials, sandbox flag, last-verified timestamp under `shipping.providers.ups.*`. |
| Event Dispatcher | `event-dispatcher-system` | Emits `shipping.provider.ups.*` events (see §14). |
| Audit Log System | `audit-log-system` | Records credential rotation, sandbox toggle, connection verify, and token refresh events. |
| Role & Capability System | `role-capability-system` | `admin.shipping.providers.manage` capability gates access to the UPS settings page and test-connection action. |

### 3.2 Downstream Consumers

| Consumer | Why |
|----------|-----|
| Rate Calculation Pipeline (A7) | Calls `fetchRates` during quote assembly. |
| Fulfillment / Orders | Calls `purchaseLabel` when a fulfillment is created, `voidLabel` when a fulfillment is cancelled within 24h. |
| Order Tracking UI | Calls `trackShipment` to render the tracking page. |
| Admin Settings → Integrations → Shipping → UPS | Calls `verifyConnection` and `syncAccounts` from the settings page. |

### 3.3 External Dependencies

- **UPS Developer Portal account** — the merchant must register an app and generate OAuth client credentials. ConvexPress does not bundle a shared client.
- **UPS Carrier account number** — required for negotiated rates and for acting as the Shipper on label purchases.
- **Network egress to UPS endpoints** — Convex actions make outbound HTTP requests to `*.ups.com`. No special egress config needed in Convex; standard `fetch` works.

---

## 4. Schema

The UPS Provider uses the **existing provider tables** defined by B10 (`shipping-method-live-rate`). No new tables are introduced. All UPS-specific configuration lives inside the generic `shippingProviders` and `shippingProviderConnections` rows keyed by `provider: "ups"`.

### 4.1 `shippingProviders` row (one global registration)

| Field | Type | UPS Value |
|-------|------|-----------|
| `_id` | `Id<"shippingProviders">` | Generated |
| `provider` | `v.literal("ups")` | `"ups"` |
| `displayName` | `v.string()` | `"UPS"` |
| `description` | `v.string()` | `"Direct integration with United Parcel Service via the UPS REST API v2409."` |
| `logoUrl` | `v.string()` | Static path to UPS brand shield |
| `homepageUrl` | `v.string()` | `https://www.ups.com` |
| `developerDocsUrl` | `v.string()` | `https://developer.ups.com` |
| `apiVersion` | `v.string()` | `"v2409"` |
| `capabilities` | object | See §5.4 |
| `isEnabled` | `v.boolean()` | Merchant toggleable |
| `registeredAt` | `v.number()` | Timestamp |

### 4.2 `shippingProviderConnections` row (one per merchant connection)

| Field | Type | Notes |
|-------|------|-------|
| `_id` | `Id<"shippingProviderConnections">` | |
| `provider` | `v.literal("ups")` | |
| `name` | `v.string()` | Display label, e.g. "UPS Primary" |
| `mode` | `v.union(v.literal("production"), v.literal("sandbox"))` | Controls base URL |
| `credentials` | object (encrypted) | `{ clientId: string; clientSecret: string; accountNumber: string }` |
| `lastVerifiedAt` | `v.optional(v.number())` | From `verifyConnection` |
| `lastVerifyError` | `v.optional(v.string())` | Null on success |
| `health` | union | `"healthy" | "degraded" | "unhealthy" | "unverified"` |
| `accountSnapshot` | object | `{ accountNumber: string; accountDescription?: string; syncedAt: number }` from `syncAccounts` |
| `createdAt` | `v.number()` | |
| `updatedAt` | `v.number()` | |

### 4.3 `shippingProviderTokenCache` row (UPS-specific but uses generic table)

One row per connection caching the active OAuth bearer token. See §5.2 for the full caching contract.

| Field | Type | Notes |
|-------|------|-------|
| `connectionId` | `Id<"shippingProviderConnections">` | Indexed |
| `accessToken` | `v.string()` (encrypted at rest) | The bearer token |
| `tokenType` | `v.string()` | Always `"Bearer"` per UPS response |
| `issuedAt` | `v.number()` | `Date.now()` at acquisition |
| `expiresAt` | `v.number()` | `issuedAt + expires_in * 1000` |
| `scope` | `v.optional(v.string())` | UPS may include this |
| `refreshedBy` | `v.optional(v.id("users"))` | For audit when manually forced |

Index: `by_connection` on `connectionId`.

### 4.4 No Schema Changes Required

All three tables above are defined by B10 (`shipping-method-live-rate`) and shared across all Layer C providers. This PRD does **not** add UPS-specific tables.

---

## 5. Data Model

### 5.1 Authentication Model

UPS API v2409 uses **OAuth 2.0 client credentials grant**. This is a server-to-server flow; there is no end-user consent step.

**Token endpoint:** `POST /security/v1/oauth/token`

**Request shape:**

- Method: `POST`
- URL (production): `https://onlinetools.ups.com/security/v1/oauth/token`
- URL (sandbox): `https://wwwcie.ups.com/security/v1/oauth/token`
- Headers:
  - `Content-Type: application/x-www-form-urlencoded`
  - `Authorization: Basic <base64(clientId + ":" + clientSecret)>`
  - `x-merchant-id: <accountNumber>`
  - `Accept: application/json`
- Body (form-encoded): `grant_type=client_credentials`

**Response shape (200):**

- `token_type`: `"Bearer"`
- `issued_at`: string (epoch ms as string — UPS quirk)
- `client_id`: string
- `access_token`: string (JWT)
- `scope`: string
- `expires_in`: string (seconds, typically `"14400"` = 4 hours)
- `refresh_count`: string
- `status`: `"approved"`

**Error responses:** HTTP 401 with `response.errors[0].code` and `response.errors[0].message`. Typical failure codes:

- `10400` — invalid client credentials
- `10401` — merchant ID not recognized for this client
- `10500` — service temporarily unavailable

### 5.2 Token Caching Contract

UPS tokens are valid for **14,400 seconds (4 hours)**. Acquiring a token takes 200–500ms of latency; doing so on every rate call would make the UPS provider 2–3× slower than necessary and would exceed UPS's auth endpoint rate limits under load.

**Caching rules:**

1. Tokens are cached in `shippingProviderTokenCache`, keyed by `connectionId`.
2. On every outbound UPS call, the adapter reads the cache. If `expiresAt - Date.now() > 300_000` (5-minute buffer), the cached token is used.
3. If the cache is missing, expired, or within the 5-minute buffer, a fresh token is requested and the cache row is replaced (upsert).
4. Token refresh emits `shipping.provider.ups.oauth_refreshed` (§14) with `{ connectionId, issuedAt, expiresAt }`.
5. If a cached-token request fails with HTTP 401 (token revoked server-side before expiry), the adapter **invalidates the cache and retries exactly once** with a fresh token.
6. Token rows are never surfaced to the admin UI. The `tokenCache.ts` module is internal.

**Module location:** `convex/shipping/providers/ups/tokenCache.ts`

**Exported functions (internal-only):**

- `getValidToken(ctx, connectionId): Promise<string>` — returns a bearer token, refreshing if needed.
- `invalidateToken(ctx, connectionId): Promise<void>` — used when a 401 suggests the cached token is no longer valid.
- `forceRefresh(ctx, connectionId, userId?): Promise<TokenRecord>` — admin-initiated refresh (e.g. from settings page "Rotate token" action).

### 5.3 Base URLs

| Mode | Base URL |
|------|----------|
| Production | `https://onlinetools.ups.com` |
| Sandbox | `https://wwwcie.ups.com` |

Both hosts expose identical path structure. Mode is stored on the connection row (§4.2) and resolved once per call; it is never passed into individual endpoint helpers.

### 5.4 Capability Flags

The UPS Provider declares the following capabilities on its `shippingProviders` row:

| Flag | Value | Rationale |
|------|-------|-----------|
| `supports_rates` | `true` | Rating API v2409 is core |
| `supports_labels` | `true` | Shipping API v2409 returns label image |
| `supports_tracking` | `true` | Tracking API v1 returns full activity |
| `supports_manifests` | `false` | UPS does not require a manifest for most parcel types; deferred |
| `supports_address_validation` | `true` | UPS AV API v2 is available; wired in via A5 when this provider is the active AV source |

### 5.5 Service Code Catalogue (Complete)

UPS returns rates keyed by numeric service codes. The adapter must maintain a canonical mapping from code → display name to render quotes. The table below is the **complete v1 catalogue**; any other codes UPS returns are surfaced as `"UPS Service <code>"` until added here.

| Code | Canonical Display Name | Domestic/International | Typical Transit |
|------|------------------------|------------------------|-----------------|
| `01` | UPS Next Day Air | Domestic | 1 business day |
| `02` | UPS 2nd Day Air | Domestic | 2 business days |
| `03` | UPS Ground | Domestic | 1–5 business days |
| `07` | UPS Worldwide Express | International | 1–3 business days |
| `08` | UPS Worldwide Expedited | International | 2–5 business days |
| `11` | UPS Standard | International (to CA/MX) | Ground cross-border |
| `12` | UPS 3 Day Select | Domestic | 3 business days |
| `13` | UPS Next Day Air Saver | Domestic | 1 business day (end-of-day) |
| `14` | UPS Next Day Air Early | Domestic | 1 business day (8–9:30 AM) |
| `54` | UPS Worldwide Express Plus | International | 1–3 business days (early AM) |
| `59` | UPS 2nd Day Air A.M. | Domestic | 2 business days (morning) |
| `65` | **UPS Worldwide Saver** | International | 1–3 business days |

> **Audit fix:** In the pre-refactor code (`shipping/actions.ts` lines 485–502), service code `65` was labeled `"UPS Saver"`. The correct UPS-branded name is `"UPS Worldwide Saver"`. The refactored `convex/shipping/providers/ups.ts` must use the canonical name above. This fix is normative for v1.

### 5.6 Unit Conventions

| Dimension | UPS Expected Unit | Conversion |
|-----------|-------------------|------------|
| Weight | **LBS** (pounds) | Convert from ounces: `lbs = oz / 16`, rounded to 2 decimal places, **serialized as a string** |
| Length/Width/Height | **IN** (inches) | No conversion if upstream packages are already in inches; otherwise mm → in |
| Currency | **USD** for US origins | Returned in `MonetaryValue` strings with 2 decimal places |

UPS rejects numeric weights with trailing zeros and rejects `0.00` weights. The serializer must always render weight as `(oz/16).toFixed(2)` and reject packages with weight ≤ 0 before making the call.

### 5.7 OAuth Flow Diagram

```
  Pipeline (A7)                  UPS Adapter                       UPS OAuth            UPS Rating API
  -------------                  -----------                       ---------            ---------------

  fetchRates(ctx) -----------> getValidToken(connectionId)
                                       |
                                       | cache hit (expiresAt - now > 5min)?
                                       |----- yes ------> return cached token
                                       |
                                       |----- no  -----> POST /security/v1/oauth/token
                                       |                   Basic Auth, x-merchant-id, client_credentials
                                       |                                    -------------------->
                                       |                                                           200 { access_token, expires_in: 14400 }
                                       |                                    <--------------------
                                       |                 upsert tokenCache (issuedAt, expiresAt)
                                       |                 emit shipping.provider.ups.oauth_refreshed
                                       |<-----------
                                       |
                              POST /api/rating/v2409/Rate?additionalinfo=timeintransit
                              Authorization: Bearer <token>
                              x-merchant-id: <accountNumber>
                                                  -------------------------------------------------------->
                                                                                                              200 RateResponse
                                                  <--------------------------------------------------------
                              normalize -> NormalizedShippingQuote[]
  <------------------------- return
```

If the Rating API returns 401, the adapter calls `invalidateToken` and retries exactly once. If the second attempt also 401s, the call fails with a structured error and the Pipeline falls back per B10 §7.

---

## 6. Functions / API

All functions live in `convex/shipping/providers/ups.ts`. Internal OAuth helpers live in `convex/shipping/providers/ups/tokenCache.ts`. All functions conform to the B10 `LiveRateProvider` interface signatures.

### 6.1 `fetchRates`

**Signature (per B10):** `(ctx: RateContext) => Promise<NormalizedShippingQuote[]>`

**Endpoint:** `POST /api/rating/v2409/Rate?additionalinfo=timeintransit`

**Request assembly:**

- `RateRequest.Request.RequestOption = "Shop"` — returns all available services in one call
- `RateRequest.Shipment.Shipper.Name` / `.Address` — ship-from location (A2)
- `RateRequest.Shipment.Shipper.ShipperNumber` — **must equal `connection.credentials.accountNumber`** to receive negotiated rates
- `RateRequest.Shipment.ShipTo.Address` — destination from `RateContext.toAddress`; set `ResidentialAddressIndicator` if `toAddress.residential === true`
- `RateRequest.Shipment.ShipFrom.Address` — physical origin (same as Shipper for v1)
- `RateRequest.Shipment.Package[]` — one entry per package in `ctx.packages`:
  - `PackagingType.Code = "02"` (Package)
  - `Dimensions.UnitOfMeasurement.Code = "IN"`, `Length/Width/Height` as strings
  - `PackageWeight.UnitOfMeasurement.Code = "LBS"`, `Weight` as string (2 dp)
- `ShipmentRatingOptions.NegotiatedRatesIndicator = ""` (empty string literal = enabled; UPS quirk)

**Response parsing:**

For each `RatedShipment` in the response:

1. Read `Service.Code` → look up canonical name from §5.5.
2. Prefer `NegotiatedRateCharges.TotalCharge.MonetaryValue` if present; fall back to `TotalCharges.MonetaryValue`.
3. Read `GuaranteedDelivery.BusinessDaysInTransit` → populate `transitDays`.
4. Read `GuaranteedDelivery.DeliveryByTime` → populate optional `deliveryBy` field.
5. Construct `NormalizedShippingQuote` per B10 §5.

**Error handling:**

- HTTP 200 with `response.errors[]` present → throw `UpsRateError` with the first error's code and message.
- HTTP 401 → invalidate token, retry once.
- HTTP 4xx (other) → throw `UpsRateError` with status and body.
- HTTP 5xx or network error → throw `UpsProviderUnavailable` so the Pipeline can fall back.

### 6.2 `purchaseLabel`

**Signature (per B10):** `(ctx: LabelContext) => Promise<LabelPurchaseResult>`

**Endpoint:** `POST /api/shipments/v2409/ship`

**Request assembly:**

- `ShipmentRequest.Shipment.Shipper.ShipperNumber = accountNumber` (required for billing to account)
- `ShipmentRequest.Shipment.PaymentInformation.ShipmentCharge.Type = "01"` (Transportation) with `BillShipper.AccountNumber = accountNumber`
- `ShipmentRequest.Shipment.Service.Code = <selected service code from ctx>`
- `ShipmentRequest.Shipment.Package[]` — same shape as rate request plus `ReferenceNumber` (typically order number)
- `ShipmentRequest.LabelSpecification.LabelImageFormat.Code = <ctx.labelFormat ?? "PNG">` — one of `GIF`, `PNG`, `ZPL`, `EPL`, `SPL`
- `ShipmentRequest.LabelSpecification.LabelStockSize.Height = "6"`, `Width = "4"` (thermal standard)

**Response parsing:**

- `ShipmentResponse.ShipmentResults.ShipmentIdentificationNumber` → `shipmentId`
- `ShipmentResults.PackageResults[].TrackingNumber` → `trackingNumber[]`
- `ShipmentResults.PackageResults[].ShippingLabel.GraphicImage` (base64) → `labelImage`
- `ShipmentResults.NegotiatedRateCharges.TotalCharge.MonetaryValue` if present → billed amount

Returns normalized `LabelPurchaseResult` (per B10) containing tracking number, label data URL (base64 with format MIME prefix), service code/name, and billed cost.

### 6.3 `voidLabel`

**Signature (per B10):** `(ctx: { shipmentId: string; trackingNumber?: string; connectionId: Id<"shippingProviderConnections"> }) => Promise<VoidResult>`

**Endpoint:** `POST /api/shipments/v2409/void`

UPS accepts either a full shipment void (by `ShipmentIdentificationNumber`) or a per-package void (by tracking number). The adapter prefers full shipment void when only `shipmentId` is supplied and uses package void when a specific `trackingNumber` is supplied.

**24-hour rule:** UPS rejects void requests more than 24 hours after label creation with error code `190102` ("Void request exceeds allowed time"). The adapter detects this code and throws a structured `UpsVoidExpired` error so the Fulfillment UI can surface a meaningful message (see §10.5).

### 6.4 `trackShipment`

**Signature (per B10):** `(ctx: { trackingNumber: string; connectionId: Id<"shippingProviderConnections"> }) => Promise<NormalizedTrackingResult>`

**Endpoint:** `GET /api/track/v1/details/{trackingNumber}`

**Headers:**

- `Authorization: Bearer <token>`
- `transId: <uuid>` — UPS requires a per-call UUID for request tracing
- `transactionSrc: ConvexPress` — identifies our integration

**Response parsing:**

- `trackResponse.shipment[0].package[0].currentStatus.description` → primary status text
- Fallback: `trackResponse.shipment[0].package[0].activity[0].status.description` if `currentStatus` is absent
- Normalize status to `"pre_transit" | "in_transit" | "out_for_delivery" | "delivered" | "exception" | "unknown"` (per B10 §5)
- `activity[]` → chronological event list with `timestamp`, `location`, `description`

### 6.5 `verifyConnection`

**Signature (per B10):** `(connectionId: Id<"shippingProviderConnections">) => Promise<VerifyResult>`

**Steps:**

1. Force-refresh OAuth token via `forceRefresh`.
2. Fire a minimal probe rate request: 1 lb package, Atlanta GA → Dallas TX, Ground service.
3. If both steps succeed, set `connection.health = "healthy"`, `lastVerifiedAt = Date.now()`, `lastVerifyError = null`.
4. If OAuth fails, set `health = "unhealthy"` and surface the error code/message.
5. If OAuth succeeds but probe rate fails, set `health = "degraded"` and surface the rate error.

### 6.6 `syncAccounts`

**Signature (per B10):** `(connectionId: Id<"shippingProviderConnections">) => Promise<SyncResult>`

UPS does not expose an "account details" endpoint that returns the account description for a given account number. Instead, `syncAccounts` records the `accountNumber` from the connection credentials into `accountSnapshot.accountNumber` and stamps `syncedAt = Date.now()`. If a future UPS endpoint exposes account descriptions, this function can be upgraded without changing its external contract.

### 6.7 Endpoint Summary

| Function | Method | Path | Base URL (prod) |
|----------|--------|------|-----------------|
| `getValidToken` (internal) | POST | `/security/v1/oauth/token` | `onlinetools.ups.com` |
| `fetchRates` | POST | `/api/rating/v2409/Rate?additionalinfo=timeintransit` | `onlinetools.ups.com` |
| `purchaseLabel` | POST | `/api/shipments/v2409/ship` | `onlinetools.ups.com` |
| `voidLabel` | POST | `/api/shipments/v2409/void` | `onlinetools.ups.com` |
| `trackShipment` | GET | `/api/track/v1/details/{trackingNumber}` | `onlinetools.ups.com` |
| `verifyConnection` | (composite) | OAuth + rate probe | both |
| `syncAccounts` | (local) | no network call | n/a |

Sandbox uses `wwwcie.ups.com` with identical paths.

---

## 7. Admin UX

### 7.1 Location

The UPS settings page lives at:

**Settings → Integrations → Shipping → UPS**

Route: `/admin/settings/integrations/shipping/ups`

This page is a **full route** (no modal). Opening it navigates to a dedicated page per the ConvexPress admin UX rules (no popups for content management). The "Shipping" sub-index lists all installed providers with per-provider health chips; clicking "UPS" opens this page.

### 7.2 Page Structure

Following the `admin-settings-ui` template patterns:

**Header:** `"UPS"` with the UPS brand shield, a health chip (Healthy / Degraded / Unhealthy / Unverified), and a "Test connection" button.

**Primary panel — Credentials:**

- Mode toggle: **Sandbox** / **Production** (defaults to Sandbox on new install)
- `Client ID` text input — required, masked after save
- `Client Secret` text input — required, masked after save (rotatable via "Regenerate" affordance that clears and re-requests)
- `Account Number` text input — required, 6 alphanumeric characters
- "Save credentials" button (disabled until all three fields have values)
- "Test connection" button — runs `verifyConnection`; renders a success toast with `accountNumber` on success or a structured error panel with UPS error code on failure

**Secondary panel — Capabilities:**

Read-only display of the capability flags (§5.4) with check/cross icons. Includes an explanatory note that `supports_manifests=false` is intentional (UPS does not require an end-of-day manifest for most parcel types).

**Secondary panel — Service Codes:**

Read-only table listing the full service code catalogue (§5.5). Each row shows code, canonical name, domestic/international classification, and typical transit. This panel exists so merchants can confirm which services will be quoted before they enable the provider.

**Secondary panel — Connection Health:**

- Last verified at (relative + absolute)
- Last verify error (if any), with UPS error code surfaced
- OAuth token status: `"Cached, expires in N min"` or `"Not cached"`
- "Rotate token now" button — calls `forceRefresh` (§5.2)

**Destructive panel — Danger Zone:**

- "Disconnect UPS" button — clears credentials, sets `isEnabled=false` on the connection, retains the row for audit. Confirmation dialog (the one allowed popup type) before action.

### 7.3 Form Behavior

- Credentials are **never** round-tripped to the client after save. The form re-fetches on mount and displays only a masked last-4 for client secret.
- Saving credentials triggers an implicit `verifyConnection` unless the merchant explicitly suppresses it.
- Mode changes (sandbox ↔ production) invalidate the OAuth token cache row for that connection.

### 7.4 Capability Requirement

Access to this page requires `admin.shipping.providers.manage` (owned by the Role & Capability System). Administrators and Editors have it by default; Authors/Contributors/Subscribers do not.

---

## 8. Merchant Workflow

### 8.1 First-Time Setup

1. Merchant navigates to **Settings → Integrations → Shipping**.
2. Sees "UPS" listed as an available provider with status **Not connected**.
3. Clicks "UPS" → lands on the UPS settings page (§7).
4. Leaves Mode on **Sandbox**.
5. Pastes `Client ID`, `Client Secret`, and `Account Number` from the UPS Developer Portal.
6. Clicks **Save credentials**. The provider records the connection row and runs `verifyConnection`.
7. On success: health chip flips to **Healthy**, last-verified stamps, capability panel enables.
8. Merchant runs a test order through the sandbox to verify quotes appear at checkout alongside any other configured providers.
9. Merchant flips Mode to **Production**, re-enters production client ID/secret (production and sandbox credentials are separate UPS artifacts), and saves.
10. Merchant re-runs `verifyConnection` against production.

### 8.2 Ongoing Operations

- **Credential rotation:** UPS supports rotating client secrets via the Developer Portal. Merchants paste the new secret into the admin page; the next `getValidToken` call picks up the new credential and refreshes the cached token.
- **Account changes:** If the merchant's UPS account number changes (rare — usually on corporate restructuring), the merchant updates the Account Number field. Next rate request uses the new `Shipper.ShipperNumber`.
- **Sandbox testing:** A secondary connection row can be created for sandbox (set `mode="sandbox"`, different `name`). The Pipeline ignores disabled connections, so the sandbox connection can be toggled off during normal operations.

### 8.3 Disabling UPS

Setting the connection's `isEnabled=false` removes UPS from Pipeline consideration on the next rate call. Existing labels remain void-able (if within the 24-hour window) and tracking continues to work until Convex garbage-collects the connection row (never, by default — disabled connections are retained for audit).

---

## 9. Storefront UX

### 9.1 Normalized Quote Appearance

Checkout and cart surfaces render quotes via the B10 `NormalizedShippingQuote` shape. The UPS Provider's quotes appear with:

- **Provider badge:** `"UPS"` (from `quote.providerDisplayName`)
- **Service name:** canonical name from §5.5, e.g. `"UPS Ground"`, `"UPS Next Day Air Saver"`
- **Price:** negotiated rate if returned, else list rate
- **Transit:** `"3–5 business days"` or `"Arrives by Thursday, Apr 16"` depending on whether `GuaranteedDelivery.DeliveryByTime` was returned
- **Logo:** UPS brand shield on the rate line

No UPS-specific UI components are required in the storefront. All rendering happens through the generic normalized-quote component owned by the checkout system.

### 9.2 Transparent Fallback

If the UPS Provider fails (OAuth down, rate API 500), the Pipeline (A7) falls back per B10 §7. The storefront either shows quotes from other providers only, or shows a configured manual-rate fallback. UPS failure is **invisible** to the shopper beyond the absence of UPS service lines.

### 9.3 Negotiated Rate Display

Negotiated rates are displayed at the same fidelity as list rates — just the final price. Negotiated/list distinction is **never** surfaced to the shopper. The adapter logs which rate type was returned for admin-side analytics, but checkout only sees a single price per service.

---

## 10. Edge Cases

### 10.1 OAuth Token Expiry Mid-Request

**Scenario:** An OAuth token expires while the adapter is assembling a rate request. The cached token passes the 5-minute-buffer check at read time but expires before the UPS API validates it, causing a 401.

**Handling:** The adapter detects 401 on the Rating/Ship/Track endpoint, calls `invalidateToken(connectionId)`, and retries the original call exactly once with a fresh token. If the retry also 401s, the adapter treats the connection as unhealthy, updates `connection.lastVerifyError`, and throws `UpsProviderUnavailable` so the Pipeline can fall back.

### 10.2 Account Number Does Not Match `ShipperNumber`

**Scenario:** The merchant enters an account number that is not authorized under the OAuth client ID. UPS returns HTTP 200 but rates come back without `NegotiatedRateCharges` — list rates only.

**Handling:** The adapter detects the absence of `NegotiatedRateCharges` on any rated shipment and stamps a `negotiatedRatesAvailable=false` flag on the `accountSnapshot`. The admin settings page surfaces a yellow warning: **"Negotiated rates are not being returned. Verify your account number matches the account registered to your UPS Developer client ID."** List rates are still returned so checkout is not blocked.

### 10.3 Negotiated Rates Not Returned (Subscription Issue)

**Scenario:** Account number matches but UPS has not provisioned negotiated rates for this client (missing "Negotiated Rates" subscription in the Developer Portal).

**Handling:** Same as §10.2 from the adapter's perspective — no `NegotiatedRateCharges` key. The admin warning points merchants to the UPS Developer Portal's Subscriptions section. Error code `111286` ("Negotiated rates not applicable") is explicitly mapped to this warning.

### 10.4 Address Correction Surcharge

**Scenario:** The destination address is deliverable but UPS applies an Address Correction surcharge (typically $20 per package) because the provided address required normalization.

**Handling:** UPS returns the surcharge rolled into `TotalCharges` and separately itemizes it under `RatedShipmentAlert[]`. The adapter:

1. Uses the all-inclusive `TotalCharges` (or `NegotiatedRateCharges.TotalCharge`) for the displayed quote.
2. Parses `RatedShipmentAlert[]` and attaches any `"120900"` alerts to `NormalizedShippingQuote.metadata.alerts`.

Admin-side reporting and post-purchase Fulfillment UIs can surface these alerts. Checkout v1 does **not** surface the surcharge separately — the merchant absorbs or re-bills per their own policy (future PRD).

### 10.5 Label Void After 24 Hours

**Scenario:** A fulfillment is cancelled 25 hours after the label was purchased. Merchant clicks "Void label" in Fulfillment.

**Handling:** UPS returns error code `190102`. The adapter maps this to `UpsVoidExpired` with a structured message: `"UPS labels can only be voided within 24 hours of purchase. This label was created {N} hours ago."`. The Fulfillment UI presents the merchant with their off-platform options (UPS claims form link, refund request). The ConvexPress label record is marked `void_expired` but **not** `voided`.

### 10.6 Weight Rounding Edge Case

**Scenario:** A package weighs 15 oz. `15 / 16 = 0.9375` → `.toFixed(2) = "0.94"` lbs. UPS accepts this. A package weighs 0.5 oz → `"0.03"` lbs. UPS accepts this. A package weighs 0 oz → **rejected at the adapter** before the call is made with a structured `InvalidPackageWeight` error.

### 10.7 Partial Rate Shop Failure

**Scenario:** UPS returns 200 OK with 6 `RatedShipment` entries but one has a malformed `Service.Code` (unknown to §5.5).

**Handling:** The adapter includes that service in the quote list using `"UPS Service <code>"` as the display name. Analytics counts the unknown code so the team can add it to the catalogue in a follow-up PR. The checkout shopper sees five branded services plus one generic.

### 10.8 Residential vs Commercial Address

**Scenario:** The same ZIP code qualifies as residential when delivered to a house and commercial when delivered to a business. UPS pricing differs.

**Handling:** The adapter reads `ctx.toAddress.residential` (populated by A5 Address Validation) and sets `ShipTo.Address.ResidentialAddressIndicator = ""` when true. If the address validator has not classified the destination, the adapter defaults to **residential** (the conservative, higher-cost assumption) to avoid under-quoting.

### 10.9 International Destinations Without Customs Metadata

**Scenario:** Cart ships to Canada. Rate request succeeds and returns UPS Standard (code `11`). Label purchase, however, requires customs forms.

**Handling:** `fetchRates` works unchanged. `purchaseLabel` detects that the ship-to country ≠ ship-from country and **fails fast** with `UpsInternationalNotSupportedV1` so the Fulfillment UI can steer the merchant to generate labels via UPS.com directly until international label support lands (future PRD). Rates remain quotable so shoppers can still see pricing.

### 10.10 Sandbox / Production Credential Swap

**Scenario:** Merchant changes mode from sandbox to production without updating credentials.

**Handling:** Sandbox and production UPS environments use separate client IDs. Using sandbox credentials against production (or vice versa) returns error code `10400`. The adapter surfaces this as `"Invalid credentials for {mode} mode. Please enter credentials generated in the UPS Developer Portal for this environment."`.

### 10.11 Rate Limit / 429 Responses

**Scenario:** UPS returns HTTP 429 Too Many Requests.

**Handling:** The adapter treats 429 identically to 5xx — throws `UpsProviderUnavailable`. The Pipeline (A7) owns retry/backoff policy; the adapter itself does not retry on 429 to avoid amplifying load.

### 10.12 Connection Deleted Mid-Fulfillment

**Scenario:** A label was purchased against connection X. Connection X is later deleted. Tracking UI calls `trackShipment(trackingNumber, connectionId=X)`.

**Handling:** The adapter returns a structured `ConnectionNotFound` error. Tracking UI falls back to a public UPS.com tracking deep link. Labels purchased against deleted connections remain visible in Fulfillment with their historical metadata, but void is no longer possible (surfaced with a disabled button + tooltip).

---

## 11. Testing Requirements

### 11.1 Sandbox Environment

UPS provides a full-featured sandbox at `https://wwwcie.ups.com`. All endpoints in §6.7 exist on the sandbox with identical paths. Sandbox requires **separate OAuth credentials** generated via the "Customer Integration Environment" (CIE) section of the UPS Developer Portal — production credentials do not work against the sandbox and vice versa.

### 11.2 Required Test Coverage

**Unit tests (adapter):**

- Service code `01`–`65` each resolve to the canonical name in §5.5
- Service code `65` resolves to `"UPS Worldwide Saver"` (audit fix regression guard)
- Unknown service code resolves to `"UPS Service <code>"` placeholder
- Weight conversion: `16 oz → "1.00"`, `15 oz → "0.94"`, `0.5 oz → "0.03"`
- Weight ≤ 0 throws `InvalidPackageWeight` before network call
- `NegotiatedRateCharges` preferred over `TotalCharges` when both present
- Residential flag flows from `ctx.toAddress.residential` → `ResidentialAddressIndicator`
- Default-to-residential when `residential` is undefined

**Unit tests (token cache):**

- Fresh token returned when cache is empty
- Cached token returned when `expiresAt - now > 5 minutes`
- Fresh token returned when within 5-minute buffer
- `invalidateToken` forces next call to refresh
- `forceRefresh` emits `shipping.provider.ups.oauth_refreshed`
- 401 on downstream endpoint invalidates and retries exactly once

**Integration tests (sandbox):**

- `verifyConnection` round-trips successfully with valid sandbox credentials
- `verifyConnection` fails gracefully with invalid credentials and populates `lastVerifyError`
- `fetchRates` returns ≥ 3 services for a 1-lb Atlanta GA → Dallas TX package
- `fetchRates` populates `transitDays` from `GuaranteedDelivery.BusinessDaysInTransit`
- `purchaseLabel` returns a base64 label image and tracking number
- `voidLabel` succeeds within the 24-hour window
- `voidLabel` returns `UpsVoidExpired` for labels aged > 24 hours (tested via mock response, since sandbox cannot easily age a real label)
- `trackShipment` returns normalized status for a sandbox test tracking number

**Contract tests (B10):**

- `NormalizedShippingQuote` shape conformance on every quote returned
- `addressKey` and `cartKey` correctly populated by the adapter (using the shared fingerprint helper from B10)
- `providerId` matches the registered provider ID on every quote
- `expiresAt` stamped per B10 TTL settings

### 11.3 CI Considerations

Sandbox credentials are stored in CI secrets as `UPS_SANDBOX_CLIENT_ID`, `UPS_SANDBOX_CLIENT_SECRET`, `UPS_SANDBOX_ACCOUNT_NUMBER`. Integration tests are gated on secret presence and skipped (not failed) when absent, so forks without secrets can still run unit tests.

### 11.4 Manual QA Checklist

Before marking v1 Done:

- [ ] Test merchant account connected against sandbox
- [ ] Rates returned at checkout for domestic + international carts
- [ ] Label purchased and printed (PNG, ZPL) against sandbox
- [ ] Label voided successfully within 24 hours
- [ ] Tracking page renders correctly for a sandbox tracking number
- [ ] Token refresh visible in audit log on every 4-hour boundary during a long-running session
- [ ] Admin "Test connection" button surfaces both success and failure states
- [ ] Disabling the connection removes UPS from checkout quotes on the next cart change
- [ ] Connection deletion does not break prior-purchased label tracking UIs (fallback link works)

---

## 12. Success Criteria

### 12.1 Functional

1. A merchant with valid UPS OAuth credentials and an account number can install the provider and see UPS quotes at checkout within 5 minutes of entering credentials.
2. Negotiated rates are returned and displayed whenever UPS's API returns `NegotiatedRateCharges`.
3. Labels purchased through the adapter are accepted by UPS and scannable at pickup.
4. Labels can be voided within the 24-hour window; void attempts past 24 hours surface a specific, actionable error.
5. Tracking pages render normalized status for both shipments purchased through ConvexPress and shipments with a raw UPS tracking number entered manually.

### 12.2 Non-Functional

1. **Latency budget:** `fetchRates` p95 ≤ 1500ms against production UPS (including token cache check). Token acquisition only occurs on miss, so the 200–500ms OAuth round-trip is not in the hot path.
2. **Cache hit rate:** > 95% of rate calls hit the OAuth token cache (given the 4-hour TTL and 5-minute buffer).
3. **Provider unavailability:** When UPS is unavailable, the Pipeline falls back within the provider timeout (B10 §7) without extending total quote assembly time by more than `shipping.providerTimeoutMs`.
4. **Zero credential leakage:** Client secrets are never returned to the admin client after save. Token values are never logged.

### 12.3 Acceptance Criteria

- All B10 `LiveRateProvider` contract tests pass for `provider="ups"`.
- All unit and integration tests in §11 pass in CI.
- Audit fix for service code `65` is demonstrable via the §5.5 regression test.
- Settings UI passes accessibility audit (keyboard-navigable, screen-reader-labeled).
- Admin can rotate credentials without downtime (verified by observing no failed quotes across the rotation boundary).

---

## 13. Roles & Capabilities

All capabilities listed here are defined/owned by the Role & Capability System (`role-capability-system`). This PRD references existing capabilities and introduces none that are UPS-specific.

| Capability | Purpose | Default Roles |
|------------|---------|---------------|
| `admin.shipping.providers.manage` | Access UPS settings page; save credentials; toggle sandbox/production; run `verifyConnection`; rotate token | Administrator, Editor |
| `admin.shipping.providers.view` | View UPS connection health on Settings → Integrations → Shipping index | Administrator, Editor, Author |
| `fulfillment.labels.purchase` | Call `purchaseLabel` from a Fulfillment | Administrator, Editor, Author (for own orders) |
| `fulfillment.labels.void` | Call `voidLabel` from a Fulfillment | Administrator, Editor |
| `fulfillment.tracking.view` | Call `trackShipment` | Administrator, Editor, Author, Customer (for own orders) |
| `audit.logs.view` | View OAuth refresh audit entries | Administrator |

### 13.1 Enforcement Points

- The Convex query/mutation wrappers in `convex/shipping/providers/ups.ts` invoke `requireCan(ctx, "admin.shipping.providers.manage")` on every admin-side mutation (save, verify, rotate, disconnect).
- Rate shopping is invoked server-side by the Pipeline; the shopper does not have a direct capability. Shopper-side access is gated by the cart/order being theirs.

---

## 14. Events Fired

The UPS Provider fires the full `shipping.provider.*` event family defined by B10, plus one UPS-specific event for OAuth visibility.

### 14.1 B10 Contract Events (Inherited)

| Event Name | Fired When | Payload (summary) |
|------------|------------|-------------------|
| `shipping.provider.rates.requested` | `fetchRates` begins | `{ provider: "ups", connectionId, fingerprint }` |
| `shipping.provider.rates.succeeded` | `fetchRates` returns quotes | `{ provider, connectionId, quoteCount, latencyMs }` |
| `shipping.provider.rates.failed` | `fetchRates` throws | `{ provider, connectionId, errorCode, errorMessage }` |
| `shipping.provider.label.purchased` | `purchaseLabel` succeeds | `{ provider, connectionId, shipmentId, trackingNumbers[], cost }` |
| `shipping.provider.label.voided` | `voidLabel` succeeds | `{ provider, connectionId, shipmentId, trackingNumber? }` |
| `shipping.provider.label.void_expired` | `voidLabel` throws `UpsVoidExpired` | `{ provider, connectionId, shipmentId, ageHours }` |
| `shipping.provider.tracking.fetched` | `trackShipment` succeeds | `{ provider, connectionId, trackingNumber, status }` |
| `shipping.provider.connection.verified` | `verifyConnection` completes | `{ provider, connectionId, health, durationMs }` |
| `shipping.provider.connection.failed` | `verifyConnection` fails | `{ provider, connectionId, errorCode, errorMessage }` |
| `shipping.provider.connection.synced` | `syncAccounts` completes | `{ provider, connectionId, accountSnapshot }` |

### 14.2 UPS-Specific Events

| Event Name | Fired When | Payload |
|------------|------------|---------|
| `shipping.provider.ups.oauth_refreshed` | The token cache issues a fresh token (from empty, expired, or forced refresh) | `{ connectionId, issuedAt, expiresAt, reason: "empty" | "expired" | "invalidated" | "forced", refreshedBy?: Id<"users"> }` |

The `oauth_refreshed` event is consumed by the Audit Log System (`audit-log-system`) to produce an auditable record of credential usage. Under normal operation this event fires roughly every 4 hours per active connection. A sudden spike (more than once per 5 minutes) is a signal of credential churn or misconfiguration and can be alarmed by the Audit Log System's anomaly detection.

### 14.3 Event Consumption

All UPS provider events are consumed by the Event Dispatcher System (`event-dispatcher-system`) and routed per its subscription table. This PRD defines no direct subscribers; consumers register independently.

---

## 15. References

### 15.1 UPS Developer Documentation

- **UPS Developer Portal (home):** https://developer.ups.com
- **OAuth 2.0 Client Credentials guide:** https://developer.ups.com/api/reference/oauth/client-credentials
- **Rating API v2409 release notes:** https://developer.ups.com/api/reference/rating/api-version/v2409
- **Shipping API v2409 reference:** https://developer.ups.com/api/reference/shipping/api-version/v2409
- **Tracking API v1 reference:** https://developer.ups.com/api/reference/tracking
- **Customer Integration Environment (sandbox):** https://wwwcie.ups.com
- **Production host:** https://onlinetools.ups.com

### 15.2 Internal PRDs (Upstream)

- B10 — Live Rate Shipping Contract (`shipping-method-live-rate`)
- A3 — Packages (`shipping-packages-system`)
- A5 — Address Validation (`address-validation-system`)
- A7 — Rate Calculation Pipeline (`rate-calculation-pipeline`)
- A2 — Ship-From Locations (`ship-from-locations-system`)
- A6 — Shipping Rules Engine (`shipping-rules-engine`)

### 15.3 Internal PRDs (Sibling Providers)

- C1 — ShipStation Provider (`shipping-provider-shipstation`)
- C3 — USPS Provider (`shipping-provider-usps`) (planned)
- C4 — FedEx Provider (`shipping-provider-fedex`) (planned)
- C5 — DHL Provider (`shipping-provider-dhl`) (planned)

### 15.4 Existing Code References

Pre-refactor code lives in `ConvexPress-Admin/packages/backend/convex/shipping/actions.ts`. The following line ranges are the source material for the v1 refactor:

- Lines **110–186** — current OAuth token flow (to be extracted into `convex/shipping/providers/ups/tokenCache.ts`)
- Lines **485–502** — service code display-name map (to be corrected per §5.5 audit fix and moved into `convex/shipping/providers/ups.ts`)
- Lines **525–794** — current `fetchRates` implementation (to be extracted, normalized per B10, and moved into `ups.ts`)
- Lines **1645–1884** — current `purchaseLabel` implementation (to be extracted and moved)
- Lines **2116–2214** — current `trackShipment` implementation (to be extracted and moved)

### 15.5 Target File Layout

```
ConvexPress-Admin/packages/backend/convex/shipping/
  providers/
    ups.ts                 # fetchRates, purchaseLabel, voidLabel, trackShipment, verifyConnection, syncAccounts
    ups/
      tokenCache.ts        # getValidToken, invalidateToken, forceRefresh
      types.ts             # UpsRateError, UpsVoidExpired, UpsInternationalNotSupportedV1, etc.
      serviceCodes.ts      # canonical code → name map (§5.5)
      normalize.ts         # UPS response → NormalizedShippingQuote / NormalizedTrackingResult
```

### 15.6 Related Events Registry

Event definitions live in the Airtable blueprint (`[redacted-airtable-table-id]`). The `shipping.provider.ups.oauth_refreshed` event is new in this PRD and must be added to the Events table before implementation begins.

---

*End of PRD.*
