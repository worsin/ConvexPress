# PRD: ShipStation (ShipEngine API) Provider

**System ID:** `shipping-provider-shipstation`
**Layer:** C (Shipping Provider Adapter)
**Status:** Draft
**Owner:** Commerce / Shipping Domain
**Last Updated:** 2026-04-14

---

## 1. Context & Intent

### 1.1 What This Is

The ShipStation Provider is the first concrete **Layer C** shipping provider adapter for ConvexPress. It implements the `LiveRateProvider` contract defined in `shipping-method-live-rate` (B10) on top of the **ShipEngine API** — the programmatic interface that powers both the ShipStation platform and the ShipEngine developer product. Because ShipStation rebranded its public API as ShipEngine in 2019 and currently operates both surfaces against the same backend, this adapter targets the ShipEngine REST API (`https://api.shipengine.com`) regardless of which product UI a merchant originally signed up through.

Unlike a direct carrier adapter (e.g., UPS C2, USPS C3, FedEx C4, DHL C5), ShipStation is a **multi-carrier aggregator**. A single ShipStation connection brokers rates, labels, tracking, and manifests across **UPS, USPS, FedEx, DHL, Canada Post, Australia Post, Royal Mail, OnTrac, LaserShip, Amazon Shipping**, and 40+ other carriers — each of which the merchant has already connected through the ShipStation dashboard. From ConvexPress's perspective, the aggregator is a single `LiveRateProvider` instance; from the Rate Calculation Pipeline's (A7) perspective, each carrier the merchant has connected appears as a separate `shipping_provider_account` row feeding rates into the normalized quote stream.

### 1.2 Why It Exists

ShipStation is the **dominant shipping platform** in the small-to-mid-market merchant segment that ConvexPress targets. The majority of new ConvexPress installs will either already have a ShipStation account from a previous platform (Shopify, WooCommerce, BigCommerce) or will be steered toward ShipStation by their fulfillment partner. Requiring those merchants to tear out ShipStation and re-negotiate individual carrier contracts (UPS pickup account, USPS EPS, FedEx OneRate, DHL Express) is a non-starter. The ShipStation adapter lets them bring their existing carrier relationships, negotiated rates, and label stock into ConvexPress with one API key.

It is also the **reference implementation** for C2–C5. The direct carrier adapters — UPS, USPS, FedEx, DHL — implement the same `LiveRateProvider` contract but each only exposes one carrier. By shipping ShipStation first and by getting every contract-level concern (auth, rate normalization, label purchase, tracking, manifest, account sync, webhook ingestion, error mapping, retry, caching, capability flags) into production through a single aggregator, C2–C5 become purely additive — they reuse every helper this adapter establishes and only override the carrier-specific serialization layer.

### 1.3 Relationship to Existing Code

ConvexPress already contains a working-but-unstructured ShipStation implementation in `ConvexPress-Admin/packages/backend/convex/shipping/actions.ts`:

- Rates: lines **2216–2415**
- Labels: lines **2417–2559**
- Tracking: lines **2561–2662**
- Verification: lines **2670–2759**

Recent audit fixes to that code (status code mapping for `DE` / `IT`, `carriers` response unwrap, `rate_response.rates` extraction path) are **load-bearing and must survive the refactor**. This PRD's implementation phase does not discard that code — it relocates it into a formal adapter at `convex/shipping/providers/shipstation.ts` that satisfies the `LiveRateProvider` interface, and it leaves the existing `actions.ts` entry points intact as thin delegators so no callers break.

### 1.4 Design Philosophy

1. **Contract-driven.** Nothing in this adapter deviates from the `LiveRateProvider` shape declared in B10. If a ShipEngine response field cannot be expressed in the normalized shape, the adapter reshapes it — the Pipeline never sees ShipEngine-specific types.
2. **Capability-aware.** Every connected carrier (from `/v1/carriers`) advertises its own capabilities (`supports_labels`, `supports_tracking`, etc.). The adapter respects those per-carrier flags; it never assumes uniformity across carriers.
3. **Degrade, don't fail.** A rate-shopping call that succeeds for 7 of 8 carriers but times out on the 8th returns the 7. The adapter emits a `rates_partial` event for observability but does not break checkout.
4. **Zero silent failures.** Every 4xx/5xx response is classified, logged, mapped to a normalized error code, emitted as an event, and surfaced on the admin integration page with a last-error timestamp.
5. **Webhook-first tracking.** Polling ShipEngine for tracking updates is expensive and rate-limited. The adapter registers a tracking webhook and pushes updates into the shipment event stream as they arrive.

### 1.5 Non-Goals (Explicit)

- **Returns labels.** ShipEngine supports return labels via `/v1/labels/{label_id}/return` but return-label workflows (RMA flow, label email, refund trigger) belong to a separate Returns system. This adapter exposes the capability flag but does not implement the RMA business logic.
- **Manifest scheduling UI.** Manifest creation via `/v1/manifests` is in scope; the admin UI for scheduling end-of-day manifests is a Fulfillment system concern.
- **Batch label purchase.** ShipEngine batch endpoints (`/v1/batches`) are not exposed in v1 of this adapter. Label purchase is one label per API call.
- **Shippo / EasyPost compatibility layer.** This adapter targets ShipEngine exclusively. Other aggregators are separate adapters.
- **Direct carrier account provisioning.** The adapter reads carriers the merchant has already connected in ShipStation. Connecting a new carrier account (e.g., adding UPS to ShipStation) happens in the ShipStation dashboard, not in ConvexPress.

---

## 2. Scope

### 2.1 In Scope

1. **Rates.** Multi-carrier rate shopping against `POST /v1/rates` — one request, N quotes back across all enabled carriers.
2. **Label purchase.** Buy a shipping label from a previously-returned rate via `POST /v1/labels/rates/{rate_id}`, or directly from a shipment payload via `POST /v1/labels`.
3. **Label void.** Void a purchased label via `POST /v1/labels/{label_id}/void`.
4. **Tracking.** Fetch tracking status via `GET /v1/tracking?carrier_code={code}&tracking_number={num}` with the 2-letter status code mapping documented in §5.
5. **Manifests.** End-of-day SCAN form / manifest creation via `POST /v1/manifests` for carriers that require it (primarily USPS).
6. **Carrier-account sync.** Poll `GET /v1/carriers` to discover which carriers the merchant has connected in ShipStation and mirror them to `shipping_provider_accounts` with their per-carrier capability flags.
7. **Connection verification.** `verifyConnection` calls `GET /v1/environment` (or fallback to `GET /v1/carriers`) and reports connection health into `shipping_provider_connections.status`.
8. **Webhook-based tracking updates.** Register a tracking webhook with ShipEngine, receive push updates at `/webhooks/shipstation`, verify the signature, and emit `shipping.tracking.updated` events.
9. **Address validation (optional capability).** Proxy address validation through `POST /v1/addresses/validate` when the Address Validation System (A5) routes through this provider.
10. **Error classification and retry.** Every HTTP error is mapped into the standardized `ShippingProviderError` shape from B10, with appropriate retry policy per status class.
11. **Admin integration UX.** Settings → Integrations → Shipping → ShipStation page with API key input, test-connection button, connected-carrier display, capability summary, last-verified timestamp, and error log.

### 2.2 Out of Scope

- **Returns labels** (future — Returns system will call this adapter's `purchaseReturnLabel` method once added).
- **Batch label purchase** (future).
- **ShipStation V1 Legacy API** (`ssapi.shipstation.com`). Only ShipEngine (`api.shipengine.com`) is supported.
- **Custom package-type registration via API.** Packages live in `commerce_shipping_packages` (A3) and are referenced by code; this adapter does not push them into ShipEngine's package catalog.
- **Insurance claim filing.** Insurance can be requested at label purchase time; claim filing is manual in ShipStation's dashboard.
- **Multi-piece shipments beyond 20 packages per shipment** (ShipEngine limit).

### 2.3 Boundary Tests

- *"Merchant wants to show live UPS rates without a ShipStation account."* → Use UPS direct adapter (C2), not this one. ✅ Out of scope.
- *"Add Canada Post support."* → If the merchant has Canada Post connected in ShipStation, it's already supported (appears in `/v1/carriers` sync). No code change. ✅ Already in scope.
- *"Merchant wants rate shopping across ShipStation + direct UPS account."* → The Pipeline (A7) handles cross-provider aggregation. This adapter only handles ShipStation-internal shopping. ✅ Correct boundary.
- *"Print end-of-day USPS SCAN form."* → `POST /v1/manifests`. ✅ In scope.
- *"Send a customer a prepaid return label."* → Return label generation is technically supported by ShipEngine, but the RMA workflow is Returns system. ✅ Out of scope here, capability flag exposed.

---

## 3. Dependencies

### 3.1 Upstream (Required Before This Ships)

| System | PRD ID | Why It's Required |
|--------|--------|-------------------|
| Live Rate Contract | B10 (`shipping-method-live-rate`) | Defines `LiveRateProvider` interface, `NormalizedShippingQuote`, `ShippingProviderError`, capability flags, event namespace, TTL/fingerprint helpers. This adapter implements that contract verbatim. |
| Packages | A3 (`shipping-packages-system`) | Rate requests carry package dimensions/weight. Packages are looked up by code from `commerce_shipping_packages` and serialized into ShipEngine's `packages[]` array. |
| Address Validation | A5 (`address-validation-system`) | Ship-from and ship-to addresses must be structurally validated before being sent to ShipEngine. A5's normalized `Address` type is what this adapter consumes. |
| Rate Calculation Pipeline | A7 (`rate-calculation-pipeline`) | The Pipeline is the caller of `fetchRates`. It owns TTL caching, fingerprinting, and quote ranking. This adapter produces quotes; the Pipeline decides which one wins. |
| Ship-From Locations | (`ship-from-locations-system`) | Origin addresses on rate requests resolve through the active ship-from profile. |
| Settings System | (`settings-system`) | API key storage uses the settings-first pattern (DB first, env var fallback). The adapter reads `shipping.provider.shipstation.apiKey` via the standard settings resolver. |
| Event Dispatcher | (`event-dispatcher-system`) | All events defined in §14 are emitted through `helpers/events.ts::emitEvent`. |
| Role & Capability System | (`role-capability-system`) | Admin-facing mutations gate on the capabilities in §13. |
| Audit Log System | (`audit-log-system`) | Every credential change, connection test, label purchase, and label void writes an audit entry. |

### 3.2 Downstream (Depends on This)

- **Live Rate Method** (concrete merchant-facing configuration under `shipping-method-live-rate`) — when a merchant picks ShipStation as the rate source for a zone method, this adapter is what answers the rate call.
- **Fulfillment / Orders** — label purchase during order fulfillment goes through this adapter.
- **Shipment / Tracking UI** — the customer-facing tracking page consumes normalized tracking events fed by this adapter's webhook handler.
- **C2–C5** (UPS, USPS, FedEx, DHL direct adapters) — these reuse this adapter's error-mapping, normalization helpers, and admin page pattern.

### 3.3 External Dependencies

| Dependency | Purpose | Version/Contract |
|-----------|---------|------------------|
| ShipEngine REST API | All rate/label/tracking/manifest/carrier calls | v1 (current stable as of this PRD; no versioned path prefix beyond `/v1/`) |
| ShipEngine Sandbox API | Test-mode integration testing | Same base URL with test API keys (prefixed `TEST_`) |
| `fetch` (Convex runtime) | HTTP transport | Native to Convex actions |
| Convex HTTP actions | Webhook ingestion endpoint | `convex/http.ts` router |

---

## 4. Schema

### 4.1 No New Tables

This adapter introduces **zero new tables**. It uses the existing provider-agnostic tables defined in `convex/schema/shipping.ts` with `provider = "shipstation"`:

- `shipping_provider_connections` — one row per merchant's ShipStation connection. Fields: `provider`, `displayName`, `status`, `enabled`, `mode` (live/test), `isPrimary`, `rateShoppingEnabled`, `rateShoppingPriority`, `lastVerifiedAt`, `lastSyncAt`, `lastErrorCode`, `lastErrorMessage`.
- `shipping_provider_secrets` — encrypted API key payload keyed to the connection. Uses `secretVersion` for rotation.
- `shipping_provider_accounts` — one row per carrier the merchant has connected inside ShipStation (e.g., UPS, USPS, FedEx). Populated by `syncAccounts`. Per-carrier capability flags live here (`supportsRates`, `supportsLabels`, `supportsTracking`, `supportsManifests`, `supportsReturns`).
- `shipping_provider_services` — service-level metadata under each account (e.g., "UPS Ground", "USPS Priority Mail") for UI display and service filtering.

### 4.2 Field Usage Specifics

| Field | ShipStation Usage |
|-------|-------------------|
| `shipping_provider_connections.provider` | Literal `"shipstation"` |
| `shipping_provider_connections.mode` | `"live"` uses production API key; `"test"` uses sandbox key (prefixed `TEST_`) |
| `shipping_provider_connections.displayName` | Merchant-chosen label (default: "ShipStation") |
| `shipping_provider_connections.status` | One of `healthy`, `degraded`, `error`, `unverified` — driven by `verifyConnection` and live-traffic error rates per B10's connection-health spec |
| `shipping_provider_accounts.externalAccountId` | ShipEngine `carrier_id` (e.g., `se-28529731`) |
| `shipping_provider_accounts.carrierCode` | ShipEngine `carrier_code` (e.g., `stamps_com`, `ups`, `fedex`) |
| `shipping_provider_accounts.carrierName` | Human label from ShipEngine (`friendly_name` field) |
| `shipping_provider_accounts.rawCapabilities` | Full raw `carrier` object for debugging / future capability additions |
| `shipping_provider_services.serviceCode` | ShipEngine `service_code` (e.g., `usps_priority_mail`) |
| `shipping_provider_services.serviceGroup` | Mapped from ShipEngine's domestic/international flags + heuristic (e.g., `usps_priority_mail_express` → `express`) |

### 4.3 Secret Storage

The API key is stored encrypted in `shipping_provider_secrets.encryptedPayload` using the standard Settings System encryption pattern. The decrypted key is never written to logs, never returned in queries, and never embedded in error messages. On the admin page it is rendered as a masked value (`TEST_••••••••••••••••SUFFIX`) once saved.

### 4.4 Settings Keys (for Env-Var Fallback)

| Setting Key | Env Var | Purpose |
|------------|---------|---------|
| `shipping.provider.shipstation.apiKey` | `SHIPSTATION_API_KEY` | Fallback for automated deploys that pre-populate the key |
| `shipping.provider.shipstation.baseUrl` | `SHIPSTATION_BASE_URL` | Override for self-hosted ShipEngine instances (rare) |
| `shipping.provider.shipstation.webhookSecret` | `SHIPSTATION_WEBHOOK_SECRET` | HMAC secret for webhook signature verification |

Per the settings-first pattern, the DB value always wins when present; the env var is only read when the DB value is empty or missing.

---

## 5. Data Model

### 5.1 Authentication

ShipEngine uses **API-key header authentication** — not OAuth, not Bearer token. Every request carries:

```
API-Key: {raw api key}
```

- The header name is exactly `API-Key` (capital A, hyphen, capital K).
- The value is the raw key string — **no `Bearer ` prefix**, **no base64 encoding**.
- Sandbox keys are prefixed `TEST_` and route against the same base URL but transact against ShipEngine's test network.
- Production keys have no prefix.
- A single API key scopes to one ShipStation account which may itself contain N carrier connections.

### 5.2 Base URL

- **Default:** `https://api.shipengine.com`
- **Override:** `shipping.provider.shipstation.baseUrl` setting (for enterprise merchants who route ShipEngine traffic through a dedicated subdomain)
- **No trailing slash.** The adapter appends paths with a leading slash.

### 5.3 Account Model

```
Merchant ConvexPress install
 └── shipping_provider_connections (provider=shipstation) ── 1
      ├── shipping_provider_secrets (API key)  ─ 1
      └── shipping_provider_accounts (per carrier)  ─ N
           └── shipping_provider_services (per service)  ─ N
```

- One ConvexPress install → one ShipStation connection (v1; multi-account is a future consideration for marketplace-style multi-merchant sites).
- One ShipStation connection → N carrier accounts discovered from `GET /v1/carriers`.
- Each carrier account → N services (mirrored from ShipEngine's `services` array nested under each carrier).

### 5.4 Capability Flags

The adapter exposes the following provider-level capability flags to the Pipeline:

| Flag | Supported | Notes |
|------|-----------|-------|
| `supports_rates` | ✓ | Always true when connection healthy |
| `supports_labels` | ✓ | Always true when connection healthy |
| `supports_tracking` | ✓ | Always true when connection healthy |
| `supports_manifests` | ✓ | Per-carrier — `true` only for carriers that require manifests (USPS primarily) |
| `supports_address_validation` | ✓ | Exposed even though A5 may route through a different provider |
| `supports_returns_labels` | ✓ (declared only) | Returns system not yet built |
| `supports_scheduled_pickup` | ✗ | Deferred |
| `supports_international` | ✓ | Per-carrier, honors ShipEngine's `supports_international_shipping` |

Per-account capability flags (on `shipping_provider_accounts`) mirror what ShipEngine reports for each carrier — the adapter does not invent capabilities; it reads them from `/v1/carriers`.

### 5.5 ShipEngine Status Code Mapping (Tracking)

ShipEngine returns 2-letter status codes that must be mapped to ConvexPress's normalized shipment status enum. **This mapping is load-bearing** — the current production code ships with the audit-corrected version below, and it must not regress:

| ShipEngine Code | Meaning | ConvexPress Normalized Status |
|-----------------|---------|-------------------------------|
| `AC` | Accepted | `accepted` |
| `IT` | In Transit | `in_transit` |
| `AT` | Attempted Delivery | `attempt` |
| `DE` | Delivered | `delivered` |
| `EX` | Exception | `exception` |
| `UN` | Unknown | `unknown` |
| `NY` | Not Yet In System | `pending` |

Any status code returned by ShipEngine that is not in this table is mapped to `unknown` and triggers a `shipping.tracking.status_unrecognized` event for observability. (The pre-audit bug mapped `DE`→`unknown` and `IT`→`pending`; that regression must never return.)

### 5.6 Response-Shape Quirks (Load-Bearing)

Two ShipEngine response shapes have been audit-corrected and must be honored:

1. **Rates:** Rates live at `response.rate_response.rates[]`, **not** `response.rates[]`. A top-level `rates` key does not exist. The `rate_response` wrapper also carries `errors[]`, `invalid_rates[]`, `rate_request_id`, and `status` fields that the adapter must propagate into event data for debugging.
2. **Carriers:** `GET /v1/carriers` returns `{ carriers: [...] }`, **not** a bare array. The adapter must unwrap the `carriers` key; a naive `response.map(...)` regresses.

### 5.7 Weight & Dimension Units

- **Weight:** ShipEngine accepts `ounce`, `pound`, `gram`, `kilogram`. ConvexPress stores weights in the profile's configured unit (typically `ounce` for US, `gram` for EU). The adapter passes the unit through verbatim.
- **Dimensions:** ShipEngine accepts `inch` or `centimeter`. Same pass-through policy.
- **No automatic unit conversion** inside the adapter — unit mismatches are a profile-configuration bug, not a transport-layer fix.

### 5.8 Rate TTL

Per B10, rate quotes carry `expiresAt`. ShipEngine rate IDs (`rate_id` on each returned rate) are valid for ~30 minutes. The adapter stamps `expiresAt = now + 15 minutes` on normalized quotes to stay comfortably inside that window, while leaving 15 minutes of headroom for checkout completion.

---

## 6. Functions / API

### 6.1 Adapter Shape

The adapter exports an object conforming to `LiveRateProvider` (defined in B10):

```
shipstationProvider: LiveRateProvider = {
  id: "shipstation",
  displayName: "ShipStation",
  capabilities: { ...§5.4 },
  fetchRates,
  purchaseLabel,
  voidLabel,
  trackShipment,
  verifyConnection,
  syncAccounts,
  createManifest,       // optional per B10
  validateAddress,      // optional per B10
  handleWebhook,        // adapter-specific, wired in convex/http.ts
}
```

All methods are `action`-flavored (external HTTP IO), with a thin `internalMutation` layer that persists results (connection status updates, account upserts, event emission).

### 6.2 Endpoint Mapping

| Contract Method | ShipEngine Endpoint | Method | Notes |
|-----------------|---------------------|--------|-------|
| `fetchRates` | `/v1/rates` | POST | Multi-carrier rate shop; returns all carriers in one response |
| `purchaseLabel` (from rate) | `/v1/labels/rates/{rate_id}` | POST | Preferred path — uses a rate ID from a prior `fetchRates` call |
| `purchaseLabel` (direct) | `/v1/labels` | POST | Fallback path when no rate ID is available (e.g., manual label) |
| `voidLabel` | `/v1/labels/{label_id}/void` | POST | Requires `label_id` from purchase response |
| `trackShipment` | `/v1/tracking` | GET | Query params `carrier_code` + `tracking_number` |
| `verifyConnection` | `/v1/environment` | GET | Falls back to `/v1/carriers` if `/v1/environment` 404s |
| `syncAccounts` | `/v1/carriers` | GET | Returns `{ carriers: [...] }` (unwrap, per §5.6) |
| `createManifest` | `/v1/manifests` | POST | Per-carrier, accepts `carrier_id` + `ship_date` + `label_ids[]` |
| `validateAddress` | `/v1/addresses/validate` | POST | Accepts array of addresses, returns validation per address |
| Webhook registration | `/v1/environment/webhooks` | POST | One-time registration during connect flow |
| Webhook list | `/v1/environment/webhooks` | GET | For reconciliation |
| Webhook delete | `/v1/environment/webhooks/{webhook_id}` | DELETE | For disconnect / rotation |

### 6.3 Request Shapes (Types Only)

**`fetchRates` request body (to `POST /v1/rates`):**

```
{
  rate_options: {
    carrier_ids: string[],             // optional filter; empty = all enabled carriers
    service_codes: string[],           // optional
    package_types: string[],           // optional
    calculate_tax_amount: boolean,     // default false
    preferred_currency: string         // e.g., "usd"
  },
  shipment: {
    ship_to: Address,                  // mapped from A5 normalized address
    ship_from: Address,                // from ship-from profile
    packages: Package[],               // from A3
    confirmation: "none" | "delivery" | "signature" | "adult_signature",
    address_validation: "no_validation" | "validate_only" | "validate_and_clean"
  }
}
```

**`fetchRates` response shape (normalized):**

```
NormalizedShippingQuote[]     // per B10
// each NormalizedShippingQuote carries:
//   providerId: "shipstation"
//   providerRateId: string   (ShipEngine rate_id)
//   providerAccountId: Id<"shipping_provider_accounts">
//   carrierCode: string
//   serviceCode: string
//   serviceName: string
//   amount: number           (cents, normalized)
//   currency: string
//   estimatedDeliveryDays: number | null
//   expiresAt: number
//   addressKey: string       (from B10 fingerprint helper)
//   cartKey: string          (from B10 fingerprint helper)
//   rawMetadata: unknown     (original ShipEngine rate object, opaque to Pipeline)
```

**`purchaseLabel` request body (to `POST /v1/labels/rates/{rate_id}`):**

```
{
  validate_address: "no_validation" | "validate_only" | "validate_and_clean",
  label_layout: "4x6" | "letter",
  label_format: "pdf" | "zpl" | "png",
  label_download_type: "url" | "inline",
  display_scheme: "label" | "qr_code"
}
```

**`voidLabel` request:** empty body, `label_id` in path.

**`trackShipment` response shape (normalized from ShipEngine):**

```
NormalizedTrackingStatus {
  status: "pending" | "accepted" | "in_transit" | "attempt" | "delivered" | "exception" | "unknown",
  statusCode: string,                 // raw ShipEngine 2-letter code
  statusDescription: string,
  trackingNumber: string,
  carrierCode: string,
  estimatedDeliveryDate: number | null,
  actualDeliveryDate: number | null,
  events: TrackingEvent[]             // chronological, each with timestamp/location/description
}
```

### 6.4 Error Classification

Every ShipEngine response is classified into one of the following:

| Class | HTTP | ShipEngine Error Source | Retry? | Surface To Merchant? |
|-------|------|-------------------------|--------|----------------------|
| `auth_invalid` | 401 | `request_id` with `error_source: "shipengine", error_type: "security"` | No | Yes (banner: key invalid or revoked) |
| `auth_missing` | 401 | Missing/empty API-Key header | No | Yes (shouldn't happen in prod) |
| `permission_denied` | 403 | `error_code: "permissions"` | No | Yes |
| `rate_limited` | 429 | `error_code: "rate_limit_exceeded"` | Yes (exponential) | Degrade silently |
| `validation_error` | 400 | `error_source: "carrier"` / `"shipengine"` with `error_type: "validation"` | No | Yes (field-level) |
| `carrier_rejected` | 400 | `error_source: "carrier"` (e.g., invalid zip for UPS) | No | Yes |
| `upstream_unavailable` | 502/503/504 | Carrier down | Yes (1 retry + fallback) | Degrade silently, mark degraded |
| `server_error` | 500 | ShipEngine internal | Yes (1 retry) | Degrade silently |
| `not_found` | 404 | Rate/label/tracking-id not found | No | Yes |
| `unknown` | anything else | Anything else | No | Log, emit event |

Normalized errors take the `ShippingProviderError` shape from B10:

```
ShippingProviderError {
  providerId: "shipstation",
  class: ErrorClass,
  httpStatus: number,
  upstreamCode: string | null,
  upstreamMessage: string | null,
  retryable: boolean,
  userSafeMessage: string,       // translated, no sensitive data
  raw: unknown                    // full response body, stored for debug; never shown
}
```

### 6.5 Retry Policy

- `rate_limited` (429): exponential backoff with jitter, up to 3 attempts, respecting `retry-after` header when present.
- `upstream_unavailable` / `server_error`: single retry after 500ms.
- All other classes: no retry.
- Total budget per `fetchRates` call: 8 seconds (hard cap from Pipeline A7).
- Partial success (some carriers 200, some 502): return successful quotes, emit `rates_partial`.

### 6.6 Webhook Handler

HTTP route registered in `convex/http.ts`:

```
POST /webhooks/shipstation
```

Responsibilities:

1. Read `shipengine-hmac-sha256` header.
2. Compute HMAC-SHA256 of raw body using `shipping.provider.shipstation.webhookSecret`.
3. Constant-time-compare to the header value. On mismatch: respond `401`, emit `shipping.provider.shipstation.webhook_signature_failed`, do not process.
4. Parse payload by `resource_type`:
   - `track` → update shipment tracking, emit `shipping.tracking.updated`
   - `carrier_connected` → enqueue `syncAccounts`
   - `batch` → (future)
5. Respond `200` within 3 seconds (ShipEngine retries on timeout).

### 6.7 Public vs Internal Function Split

| File | Function | Type | Purpose |
|------|----------|------|---------|
| `convex/shipping/providers/shipstation.ts` | `fetchRatesAdapter` | action | Pipeline calls this |
| `convex/shipping/providers/shipstation.ts` | `purchaseLabelAdapter` | action | Fulfillment calls this |
| `convex/shipping/providers/shipstation.ts` | `voidLabelAdapter` | action | Fulfillment calls this |
| `convex/shipping/providers/shipstation.ts` | `trackShipmentAdapter` | action | Tracking system calls this |
| `convex/shipping/providers/shipstation.ts` | `verifyConnectionAdapter` | action | Admin UI calls via public wrapper |
| `convex/shipping/providers/shipstation.ts` | `syncAccountsAdapter` | action | Admin UI + webhook trigger |
| `convex/shipping/providers/shipstation.ts` | `createManifestAdapter` | action | Fulfillment / scheduled job |
| `convex/shipping/providers/shipstation.ts` | `validateAddressAdapter` | action | A5 routes through this when configured |
| `convex/shipping/actions.ts` | existing `shipstationGetRates`, `shipstationBuyLabel`, etc. | action | **Retained as thin delegators** to preserve existing callers; each immediately delegates to the new adapter function |
| `convex/shipping/mutations.ts` | `updateShipstationConnectionStatus` | internalMutation | Adapter writes connection health here |
| `convex/shipping/mutations.ts` | `upsertShipstationAccount` | internalMutation | `syncAccounts` writes here |
| `convex/http.ts` | `/webhooks/shipstation` route handler | httpAction | Webhook receiver |

---

## 7. Admin UX

### 7.1 Navigation Path

**Settings → Integrations → Shipping → ShipStation**

Accessible only to users with `admin.shipping.providers.shipstation.manage`. Under-privileged users see the integration row on the index page but get a permission-denied full page on click.

### 7.2 Page Layout

Full page (no modals, per ConvexPress UI rules), organized as stacked sections:

#### 7.2.1 Connection Panel

- **Status pill** — `Connected` (green) / `Degraded` (amber) / `Error` (red) / `Not connected` (neutral). Driven by `shipping_provider_connections.status`.
- **API key input** — masked. Save persists encrypted to `shipping_provider_secrets`, bumps `secretVersion`. Previous versions are retained for rollback (rotation-safe).
- **Mode toggle** — Live / Test. Affects which key is used and which base URL is hit (same URL for both; differentiated by `TEST_` prefix detection on the key).
- **Base URL input** — collapsed behind "Advanced"; defaults to `https://api.shipengine.com`. Rarely changed.
- **Test Connection button** — invokes `verifyConnection`, displays a result card inline within ~2 seconds. On success shows account owner name + plan tier pulled from `/v1/environment`. On failure shows mapped error class + user-safe message.
- **Last verified** — timestamp, auto-refreshed on every successful API call.
- **Last error** — compact card showing `lastErrorCode` + `lastErrorMessage` + timestamp. Dismissible (clears the fields).

#### 7.2.2 Connected Carriers Panel

Populated by `syncAccounts`. Displays one row per row in `shipping_provider_accounts`:

| Column | Content |
|--------|---------|
| Carrier | Name + logo (via carrier code mapping) |
| Account ID | Truncated `externalAccountId` |
| Capabilities | Checkbox-style pills: Rates, Labels, Tracking, Manifests, Returns (green = supported, gray = not) |
| Services | Count of mirrored services; click to expand |
| Last sync | Timestamp |
| Actions | "Refresh" (re-syncs this carrier), "Disable" (sets `supportsRates=false` locally, does not touch ShipStation) |

A "Sync all carriers" button at top right of the panel invokes `syncAccounts` and updates all rows.

#### 7.2.3 Capabilities Summary

Read-only summary card showing the adapter's advertised capability flags (from §5.4) and whether rate shopping is currently enabled for this connection in `shipping_provider_connections.rateShoppingEnabled`. Toggling rate-shopping here flips the flag and is reflected in A7's Pipeline immediately.

#### 7.2.4 Webhooks Panel

- Webhook URL (read-only, copy-to-clipboard): `https://{convex-site-url}/webhooks/shipstation`
- Webhook status: registered/not registered/error. Driven by a best-effort call to `GET /v1/environment/webhooks` at page load.
- "Register webhook" button — calls `POST /v1/environment/webhooks` with our URL. On success, persists the returned `webhook_id` to `shipping_provider_connections` (new optional field, nullable until webhook registered).
- "Re-register" / "Delete" actions for rotation.

#### 7.2.5 Error Log Panel

Most recent 50 errors against this provider, pulled from the event stream filtered by `source = "shipstation"`. Columns: timestamp, class, upstream code, user-safe message, "View raw" (opens a side panel with the full raw response for debugging). This is read-only and does not expose credentials.

### 7.3 Mobile / Narrow Viewport

The page reflows into single-column stacked cards at <768px. All interactions remain full-page; no floating modals.

### 7.4 Dark Mode

Uses the standard ConvexPress design tokens — no hardcoded colors. Status pills reference `bg-success-soft`, `bg-warning-soft`, `bg-destructive-soft`, `bg-muted`.

---

## 8. Merchant Workflow

### 8.1 Scenario: Connect ShipStation, Show Live Rates at Checkout

**Merchant Sarah** runs an outdoor-gear store. She has a ShipStation account with UPS and USPS already connected. She just installed ConvexPress and wants live rates at checkout by end of day.

**Step 1 — Create a ShipEngine API key.**
Sarah logs into ShipStation → Account Settings → API Settings → "Generate API Key". ShipStation issues a production key. She copies it.

**Step 2 — Paste into ConvexPress.**
In ConvexPress Admin, she navigates Settings → Integrations → Shipping → ShipStation. She pastes the key into the API Key field, leaves Mode on "Live", clicks Save. The key is encrypted on save; the UI now shows a masked value.

**Step 3 — Test the connection.**
She clicks "Test Connection". Within 2 seconds the adapter calls `GET /v1/environment`, receives a 200 with her account metadata, updates the connection status to `healthy`, stamps `lastVerifiedAt`, and fires `shipping.provider.connection_healthy`. The UI flips the status pill to green and displays her plan tier.

**Step 4 — Sync carriers.**
She clicks "Sync all carriers". The adapter calls `GET /v1/carriers`, unwraps the `carriers` array, and upserts one row per carrier into `shipping_provider_accounts`. Her UPS account and USPS account appear in the Connected Carriers panel with their capability flags.

**Step 5 — Register the tracking webhook.**
She clicks "Register webhook" in the Webhooks panel. The adapter calls `POST /v1/environment/webhooks` with the ConvexPress webhook URL. ShipEngine returns a `webhook_id`. The adapter stores it, and the status pill flips to "registered".

**Step 6 — Attach ShipStation to a shipping zone.**
She navigates Shipping → Zones → United States → Add method → "Live Rate" → Provider: ShipStation. She saves. The Pipeline (A7) now includes ShipStation in its rate-source list for that zone.

**Step 7 — Place a test order.**
A customer adds a pack of carabiners to their cart and proceeds to checkout with a California ship-to address. The Pipeline calls `shipstationProvider.fetchRates(ctx)`. The adapter issues `POST /v1/rates`, receives 6 quotes (3 UPS services + 3 USPS services), normalizes them, stamps `expiresAt` 15 minutes out, and returns them. Checkout shows all 6 with pricing and ETAs.

**Step 8 — Customer completes checkout.**
Customer picks "USPS Priority Mail @ $9.45". The order is created with the selected rate. Fulfillment later calls `purchaseLabel` with the quoted `rate_id`. ShipEngine returns a label PDF URL and a tracking number. The order transitions to `fulfilled`.

**Step 9 — Customer receives tracking.**
As the package moves through USPS, ShipEngine pushes tracking updates to ConvexPress's `/webhooks/shipstation` endpoint. Each push verifies the signature, extracts the status code, maps it to the normalized enum (`AC→accepted`, `IT→in_transit`, `DE→delivered`), and emits `shipping.tracking.updated`. The customer's order page reflects each update in real time via Convex reactivity.

**Total elapsed merchant time:** ~5 minutes. Steps 1–5 are the one-time setup; steps 6–9 are recurring.

### 8.2 Scenario: Key Rotation

Every 90 days Sarah's security policy rotates API keys. She generates a new key in ShipStation, pastes it into ConvexPress (which creates a new `secretVersion` row), clicks Save, clicks Test Connection. If successful, the old `secretVersion` is deprecated but retained. No existing orders break; in-flight label purchases use the new key automatically on their next call.

### 8.3 Scenario: Carrier Added in ShipStation

Sarah adds FedEx to her ShipStation account. Back in ConvexPress, she clicks "Sync all carriers" on the ShipStation integration page. The new FedEx row appears in Connected Carriers. No Pipeline restart needed. The next `fetchRates` call automatically includes FedEx services.

---

## 9. Storefront UX

### 9.1 Transparent to Storefront

The storefront does **not know** that ShipStation is the rate source. Quotes appear in checkout as normalized `NormalizedShippingQuote` entries, rendered by the standard Pipeline-agnostic rate selector. The customer sees:

> **Shipping**
> ○ USPS Ground Advantage — $5.95 (4–7 business days)
> ● USPS Priority Mail — $9.45 (1–3 business days)
> ○ UPS Ground — $11.20 (3–5 business days)
> ○ UPS 2nd Day Air — $24.30 (2 business days)

Carrier name, service name, price, and ETA all come from the normalized quote. The `providerId: "shipstation"` is opaque to the renderer — swapping to a different provider for the same carriers would produce the same UI.

### 9.2 Tracking Page

The customer's order-tracking page receives its events from whatever provider the label was purchased through. For ShipStation-purchased labels, events arrive via the `/webhooks/shipstation` pipeline and are indistinguishable (to the renderer) from events arriving via any other adapter's webhook.

### 9.3 Fallback Behavior

If ShipStation is the only live-rate source and the adapter fails catastrophically (e.g., API key revoked, ShipEngine down), the Pipeline falls back to configured manual methods (flat rate, weight-based, etc.) per B10's fallback spec. Customers see manual rates; they never see an empty shipping section. An admin notification fires.

---

## 10. Edge Cases

### 10.1 API Key Revoked (401)

**Trigger:** Merchant revoked the key in ShipStation without updating ConvexPress; or key expired.
**Detection:** 401 response from any ShipEngine call.
**Behavior:**
1. Error classified as `auth_invalid`.
2. Connection status → `error`. `lastErrorCode="auth_invalid"`, `lastErrorMessage` stored.
3. Event `shipping.provider.connection_error` fired.
4. Subsequent `fetchRates` calls within a 5-minute cooldown short-circuit to failure (no redundant 401 traffic).
5. Admin sees red status pill + "Key invalid or revoked" banner on the integration page.
6. Pipeline falls back to manual methods; customer checkout continues to work.
7. Cooldown expires after 5 minutes; next call retries the network.

### 10.2 Rate Limited (429)

**Trigger:** High-volume traffic exceeds ShipEngine's rate limits (varies by plan).
**Detection:** 429 response; `retry-after` header often present.
**Behavior:**
1. Classified as `rate_limited`.
2. Exponential backoff with jitter, up to 3 attempts, respecting `retry-after`.
3. If all retries exhausted within the Pipeline's 8s budget, call is marked failed and Pipeline continues with other providers' quotes.
4. Event `shipping.provider.rate_limited` fired with `retry-after` value.
5. Connection status remains `healthy` unless 429s persist >10 minutes — then → `degraded`.

### 10.3 ShipEngine Down (5xx)

**Trigger:** ShipEngine outage; 502/503/504 responses.
**Detection:** 5xx response.
**Behavior:**
1. Single retry after 500ms.
2. If retry fails, classified as `upstream_unavailable`.
3. Connection status → `degraded` (not `error` — this is transient and upstream).
4. Pipeline fallback to manual methods.
5. Event `shipping.provider.connection_degraded` fired.
6. Every 5 minutes a background check calls `GET /v1/environment`; on success, status → `healthy` and `shipping.provider.connection_healthy` fires.

### 10.4 Carrier Returns No Rates (Empty Success)

**Trigger:** `POST /v1/rates` returns 200 with `rate_response.rates = []`. Possible causes: ship-to is a restricted country, weight exceeds carrier max, package type invalid for destination.
**Detection:** Successful HTTP but empty rates array; `rate_response.invalid_rates` may contain per-carrier errors.
**Behavior:**
1. Treat as a valid response (no error).
2. Extract `rate_response.invalid_rates` and log per-carrier reasons.
3. Emit `shipping.provider.rates_empty` with the `invalid_rates` payload.
4. Return an empty `NormalizedShippingQuote[]`. The Pipeline handles the no-quotes case.
5. Connection status remains `healthy` — this is a business-rules outcome, not a connection problem.

### 10.5 Label Purchase After Rate Expires

**Trigger:** Checkout starts, customer leaves, returns 45 minutes later to pay. The rate `expiresAt` has passed.
**Detection:** Either the Pipeline catches the expiry before we call ShipEngine (preferred), or ShipEngine returns 400 with an expired-rate error.
**Behavior:**
1. Preferred path: the Pipeline re-requests rates with the same fingerprint and picks the equivalent service. The new rate's ID is swapped in.
2. If the 400 does reach us, we classify as `validation_error` with `upstreamCode="rate_expired"`, emit an event, and the caller (Pipeline) triggers a re-quote automatically.

### 10.6 Void Label After Shipment in Network

**Trigger:** Fulfillment tries to void a label after the carrier has already scanned the package in.
**Detection:** 400 response with carrier error (ShipEngine exposes `error_source="carrier"`).
**Behavior:**
1. Classified as `carrier_rejected`.
2. Return the upstream message to the caller (so the admin UI can show "USPS rejected void: package already in network").
3. Connection status unaffected.
4. Audit log entry records the attempted void and the rejection.

### 10.7 Tracking Number Not Yet In System

**Trigger:** Tracking lookup immediately after label purchase; ShipEngine / carrier hasn't indexed the tracking number yet.
**Detection:** 200 response with `status_code="NY"` (Not Yet).
**Behavior:**
1. Map `NY → pending`.
2. Return normalized status with `status="pending"`.
3. Do **not** treat as error.
4. Webhook will push updates once the carrier accepts the package.

### 10.8 Webhook Signature Verification Fails

**Trigger:** Malformed webhook, replay attack, or rotated webhook secret without cache invalidation.
**Detection:** HMAC-SHA256 of body ≠ `shipengine-hmac-sha256` header.
**Behavior:**
1. Respond `401`.
2. Do **not** process payload.
3. Emit `shipping.provider.shipstation.webhook_signature_failed` with request IP and payload size (not body).
4. If >10 failures in 10 minutes, raise a site notification to admins.

### 10.9 Clock Skew

**Trigger:** Convex server time drifts from local time used when generating webhook signature.
**Behavior:** HMAC is timestamp-less; no skew risk. Idempotency on webhooks is handled via ShipEngine's event ID (deduped in a transient `shipstation_webhook_events` cache — TTL 24h, optional future optimization if needed).

### 10.10 Duplicate Carrier in Sync

**Trigger:** `GET /v1/carriers` returns two rows with the same `carrier_id` (observed in edge cases with dual-connected accounts).
**Behavior:** Upsert by `(connectionId, externalAccountId)`. Second row is a no-op update. Log a warning event.

### 10.11 Merchant Switches from Test to Live Mode

**Behavior:** Saving a new key with a different prefix (`TEST_` → production) triggers a forced re-verification. All cached rates are invalidated. Connected carriers are re-synced. A migration event is emitted.

### 10.12 Very Large Package Manifests

**Trigger:** More than 20 packages in a single shipment.
**Behavior:** ShipEngine rejects. Adapter pre-validates package count before transport and returns a classed `validation_error` without making the call. Caller (Fulfillment) splits into multiple shipments.

### 10.13 International Address Validation Mismatch

**Trigger:** `ship_to.country_code` is present but `postal_code` missing where the carrier requires it.
**Behavior:** A5 catches this upstream. If it leaks through, ShipEngine returns a validation error per-carrier (`invalid_rates`), which flows into `rates_empty` handling.

---

## 11. Testing Requirements

### 11.1 Unit Tests (Adapter, No Network)

- Status code mapping covers all 7 codes + unknown input. Regression test specifically for `DE` (must map to `delivered`) and `IT` (must map to `in_transit`).
- Response unwrappers: `response.rate_response.rates` extraction; `response.carriers` unwrap.
- Error classification: one test per class in §6.4.
- Retry policy: 429 respects `retry-after`; 500 retries once; 401 does not retry.
- Webhook signature verification: valid signature passes; tampered body fails; missing header fails.
- Rate fingerprinting: same request produces same `addressKey` + `cartKey` (re-uses B10 helpers).

### 11.2 Integration Tests (Sandbox)

Using a test API key (prefix `TEST_`) against `https://api.shipengine.com` — ShipEngine's sandbox shares the same URL:

- `verifyConnection` against sandbox returns 200 and parses environment.
- `syncAccounts` returns sandbox carriers and upserts rows correctly.
- `fetchRates` with a canonical ship-from (Los Angeles) → ship-to (New York) + 1lb package returns >0 quotes across UPS + USPS.
- `purchaseLabel` against a sandbox rate returns a label URL.
- `voidLabel` against a sandbox label returns success.
- `trackShipment` with a known sandbox tracking number returns a status.
- `createManifest` for sandbox USPS returns a manifest ID.

### 11.3 Contract Compliance Tests (from B10)

B10 defines a provider contract test harness. ShipStation must pass every test in that harness:

- Provider exposes all required capability flags.
- `fetchRates` return value passes `NormalizedShippingQuote` schema validation.
- `expiresAt` is in the future and <=30 minutes out.
- `addressKey` and `cartKey` are deterministic across identical inputs.
- Errors thrown conform to `ShippingProviderError` shape.
- `syncAccounts` populates `shipping_provider_accounts` correctly.

### 11.4 Webhook End-to-End Test

- POST to `/webhooks/shipstation` with a valid sandbox payload + valid signature → 200 + `shipping.tracking.updated` event fires.
- POST with invalid signature → 401 + `shipping.provider.shipstation.webhook_signature_failed` event fires.

### 11.5 Performance Tests

- `fetchRates` p95 < 2000ms against sandbox (target from §12).
- `purchaseLabel` p95 < 3000ms.
- Concurrent load: 50 rate requests in 10 seconds should not trip rate limiting at default plan tier; if it does, retry backoff must keep them all succeeding within 8s.

### 11.6 Error-Injection Tests

Use a mock transport layer:

- 401 on every call → connection status → `error` within 1 attempt.
- 429 then 429 then 200 → final result succeeds; 2 retries consumed.
- 502 → single retry → 200 → succeeds; status stays `healthy`.
- 502 → single retry → 502 → fails; status → `degraded`.

### 11.7 Regression Fixtures

Fixture JSON captured from production (keys and PII redacted) and stored alongside the test file for:

- A real `/v1/rates` response with 6 rates across 2 carriers.
- A real `/v1/carriers` response with the `carriers` wrapper.
- A real `/v1/tracking` response with `DE`, `IT`, `AC`, `NY` samples.
- A real label-purchase response.
- A real webhook payload + signature header.

These fixtures are the guardrail against a repeat of the audited-and-fixed bugs.

---

## 12. Success Criteria

### 12.1 Functional

- **FC1.** A merchant can paste an API key, test the connection, sync carriers, and receive live rates at checkout without any developer intervention.
- **FC2.** All 7 ShipEngine tracking status codes map correctly. `DE` is `delivered`, `IT` is `in_transit`. (Audit regression guard.)
- **FC3.** `rate_response.rates` is the only rates path read. `response.rates` access does not exist anywhere in the adapter. (Audit regression guard.)
- **FC4.** `{ carriers: [...] }` unwrap is always applied to `/v1/carriers` responses. (Audit regression guard.)
- **FC5.** Every error path produces a `ShippingProviderError` — no raw exceptions escape the adapter.
- **FC6.** Webhook signature verification is mandatory; no payload is processed without it.

### 12.2 Performance

- **PC1.** `fetchRates` p95 < 2000ms (steady-state, ShipEngine healthy).
- **PC2.** `purchaseLabel` p95 < 3000ms.
- **PC3.** `verifyConnection` p95 < 1500ms.
- **PC4.** Webhook handler responds in < 500ms p95 (before 3s ShipEngine timeout).
- **PC5.** No `fetchRates` call exceeds the Pipeline's 8s hard cap.

### 12.3 Reliability

- **RC1.** Zero silent failures — every 4xx/5xx is logged, classified, and event-emitted.
- **RC2.** Connection status accurately reflects the last 5 minutes of traffic (not stale indefinitely).
- **RC3.** Rate-limit handling recovers without human intervention at up to 3× the merchant's sustained traffic.
- **RC4.** Webhook signature failures are observable and actionable within the admin UI.
- **RC5.** Key rotation is zero-downtime.

### 12.4 Compatibility

- **CC1.** The existing `actions.ts` entry points (`shipstationGetRates`, `shipstationBuyLabel`, `shipstationTrack`, `shipstationVerify`) continue to work as thin delegators for at least one full release cycle (deprecation path documented).
- **CC2.** The adapter passes B10's full contract test suite.
- **CC3.** The adapter is drop-in usable by C2–C5 as a reference (shared helpers live in `convex/shipping/providers/_shared/`).

### 12.5 Observability

- **OC1.** Every call produces at minimum a request-level event with latency, carrier count, and error class (or `ok`).
- **OC2.** The admin integration page shows last-verified, last-error, and a 50-entry error log — all live.
- **OC3.** Connection health is visible in the Dashboard system's shipping widget.

---

## 13. Roles & Capabilities

Capabilities are added to the Role & Capability System (`role-capability-system`) and wired into every admin-facing mutation and query in the adapter:

| Capability | Description | Default Roles |
|-----------|-------------|---------------|
| `admin.shipping.providers.shipstation.manage` | Full management: save/rotate API key, register webhooks, configure mode/base URL, trigger account sync, toggle rate shopping. | Administrator |
| `admin.shipping.providers.shipstation.test` | Call Test Connection and view verification results. Does NOT permit mutating credentials. | Administrator, Editor |
| `admin.shipping.providers.shipstation.view` | View the integration page (read-only status, last-verified, connected-carrier list, error log). | Administrator, Editor |
| `admin.shipping.labels.purchase` | Purchase or void a shipping label via any provider, including ShipStation. | Administrator, (Shop Manager role once introduced) |
| `admin.shipping.manifests.create` | Create an end-of-day manifest. | Administrator, (Shop Manager role) |

Capabilities are enforced by `requireCan(ctx, "capability.id")` at the top of every relevant `action` / `mutation` handler. No UI-only gating.

The `admin.shipping.providers.shipstation.view` capability is separate from `.test` because `.test` actually calls the upstream API and consumes quota. Merchants may want a read-only support role that can see status but not trigger traffic.

---

## 14. Events Fired

All events route through the Event Dispatcher System (`event-dispatcher-system`) via `helpers/events.ts::emitEvent`.

### 14.1 Contract Events (implement B10)

These are the shared `shipping.provider.*` events every `LiveRateProvider` emits. Payload always includes `{ providerId: "shipstation", connectionId: Id<"shipping_provider_connections"> }` plus event-specific fields.

| Event | When Fired | Payload Adds |
|-------|-----------|--------------|
| `shipping.provider.rates_requested` | Start of every `fetchRates` call | `{ shipToCountry, packageCount, carrierIds[] }` |
| `shipping.provider.rates_received` | Successful `fetchRates` return | `{ quoteCount, latencyMs, carriersRepresented[] }` |
| `shipping.provider.rates_partial` | Some carriers succeeded, some failed | `{ successCount, failureCount, failedCarriers[] }` |
| `shipping.provider.rates_empty` | 200 response with zero rates | `{ invalidRates: [...] }` |
| `shipping.provider.rates_failed` | All-carriers failure | `{ errorClass, upstreamCode, latencyMs }` |
| `shipping.provider.label_purchased` | Successful label purchase | `{ labelId, trackingNumber, carrierCode, serviceCode, costCents }` |
| `shipping.provider.label_voided` | Successful void | `{ labelId }` |
| `shipping.provider.label_failed` | Label purchase or void failure | `{ errorClass, attemptedAction }` |
| `shipping.provider.connection_healthy` | `verifyConnection` OK, or status transitions back to healthy | — |
| `shipping.provider.connection_degraded` | Sustained 5xx / timeouts / 429s | `{ reason, windowMinutes }` |
| `shipping.provider.connection_error` | Hard auth failure or explicit error state | `{ errorClass, upstreamMessage }` |
| `shipping.provider.accounts_synced` | `syncAccounts` completed | `{ added, removed, updated }` |
| `shipping.provider.manifest_created` | Manifest creation | `{ manifestId, carrierCode, labelCount }` |

### 14.2 Tracking Events

| Event | When Fired | Payload |
|-------|-----------|---------|
| `shipping.tracking.updated` | Inbound webhook with tracking change | `{ trackingNumber, carrierCode, status, statusCode, occurredAt, raw }` |
| `shipping.tracking.delivered` | Status transitions to `delivered` | `{ trackingNumber, carrierCode, deliveredAt, signedBy? }` |
| `shipping.tracking.exception` | Status transitions to `exception` | `{ trackingNumber, carrierCode, reason }` |
| `shipping.tracking.status_unrecognized` | ShipEngine returns a status code not in §5.5 | `{ unknownCode, trackingNumber }` |

### 14.3 ShipStation-Specific Events

Adapter-specific events (in the `shipping.provider.shipstation.*` namespace) for observability:

| Event | When Fired | Payload |
|-------|-----------|---------|
| `shipping.provider.shipstation.webhook_received` | Any webhook POST | `{ resourceType, webhookId, bodySize }` |
| `shipping.provider.shipstation.webhook_signature_failed` | HMAC mismatch | `{ remoteIp, bodySize }` |
| `shipping.provider.shipstation.webhook_registered` | Webhook registered via `/v1/environment/webhooks` | `{ webhookId, url }` |
| `shipping.provider.shipstation.webhook_deleted` | Webhook removed | `{ webhookId }` |
| `shipping.provider.shipstation.rate_limited` | 429 observed | `{ retryAfterSeconds, attempt }` |
| `shipping.provider.shipstation.key_rotated` | New `secretVersion` saved | `{ newSecretVersion }` |
| `shipping.provider.shipstation.test_mode_toggled` | Mode switched | `{ from, to }` |

All event schemas are registered in the Event Dispatcher registry with typed payloads. No wildcard payloads.

---

## 15. References

### 15.1 ShipEngine / ShipStation Documentation

- **ShipEngine API Reference (v1):** `https://www.shipengine.com/docs/reference/` — canonical endpoint documentation for rates, labels, tracking, manifests, addresses, and webhooks.
- **ShipEngine Getting Started Guide:** `https://www.shipengine.com/docs/getting-started/` — API-key auth model, sandbox usage, environment differentiation.
- **Authentication:** `https://www.shipengine.com/docs/auth/` — confirms `API-Key` header; no OAuth.
- **Rate Shopping Guide:** `https://www.shipengine.com/docs/rates/` — canonical docs for the `/v1/rates` response shape, including the `rate_response` wrapper structure.
- **Tracking Status Codes:** `https://www.shipengine.com/docs/tracking/` — defines the 7 2-letter codes (`AC`, `IT`, `DE`, `AT`, `EX`, `UN`, `NY`).
- **Connected Carriers:** `https://www.shipengine.com/docs/carriers/` — `/v1/carriers` endpoint documentation and the `{ carriers: [...] }` wrapper.
- **Webhooks:** `https://www.shipengine.com/docs/tracking/webhooks/` — webhook registration, payload schema, HMAC-SHA256 signature verification (header: `shipengine-hmac-sha256`).
- **Error Handling:** `https://www.shipengine.com/docs/errors/` — `error_source`, `error_type`, `error_code` taxonomy.
- **Manifest Creation:** `https://www.shipengine.com/docs/manifests/` — SCAN form endpoint for USPS.

### 15.2 ShipStation Rebrand Note

ShipEngine and ShipStation are the same underlying platform. In 2019 ShipStation rebranded its developer API product as **ShipEngine**. The ShipStation consumer dashboard remains at `ship.shipstation.com`; the programmatic API is `api.shipengine.com`. Legacy docs may still reference `ssapi.shipstation.com` (v1 Legacy API) — **this adapter does not target that legacy API** and only supports the modern ShipEngine endpoints. Merchants signed up through either product use the same API key namespace.

### 15.3 Related ConvexPress PRDs

- **B10** `shipping-method-live-rate` — the contract this adapter implements.
- **A3** `shipping-packages-system` — package source.
- **A5** `address-validation-system` — address source and optional address-validation routing.
- **A6** `shipping-rules-engine` — elimination rules applied before / after this adapter is consulted.
- **A7** `rate-calculation-pipeline` — the caller of `fetchRates`.
- **C2** UPS direct adapter (future; same contract).
- **C3** USPS direct adapter (future; same contract).
- **C4** FedEx direct adapter (future; same contract).
- **C5** DHL direct adapter (future; same contract).
- **Settings System** — API-key storage pattern.
- **Event Dispatcher System** — event emission.
- **Role & Capability System** — §13 enforcement.
- **Audit Log System** — credential-change and label-operation audit trail.
- **Address Validation System** (A5) — upstream dependency for ship-to / ship-from normalization.

### 15.4 Existing Code References

- `ConvexPress-Admin/packages/backend/convex/shipping/actions.ts` lines 2216–2759 — current ShipStation implementation to be refactored into the new adapter layout. Audit-corrected segments in this range (status-code mapping, `rate_response.rates` path, `carriers` unwrap) are load-bearing and must be preserved.
- `ConvexPress-Admin/packages/backend/convex/schema/shipping.ts` — provider tables (`shipping_provider_connections`, `shipping_provider_secrets`, `shipping_provider_accounts`, `shipping_provider_services`) used without modification.
- `ConvexPress-Admin/packages/backend/convex/http.ts` — where the `/webhooks/shipstation` route is registered.
- `ConvexPress-Admin/packages/backend/convex/helpers/events.ts` — event emission utility.
- `ConvexPress-Admin/packages/backend/convex/helpers/permissions.ts` — `requireCan` guard used on every admin mutation.

### 15.5 Implementation Layout (Target Files)

- `convex/shipping/providers/shipstation.ts` — new. The adapter. Exports `shipstationProvider` conforming to `LiveRateProvider`.
- `convex/shipping/providers/_shared/` — new directory. Shared helpers (retry, HMAC verify, error classifier, response unwrappers) usable by C2–C5.
- `convex/shipping/actions.ts` — existing. Retained as thin delegators for backward compatibility.
- `convex/shipping/mutations.ts` — existing. Add `updateShipstationConnectionStatus`, `upsertShipstationAccount` internal mutations.
- `convex/http.ts` — add `/webhooks/shipstation` route.
- `apps/web/src/routes/_authenticated/_admin/settings/integrations/shipping/shipstation.tsx` — new. The admin integration page per §7.

---

**End of PRD — shipping-provider-shipstation**
