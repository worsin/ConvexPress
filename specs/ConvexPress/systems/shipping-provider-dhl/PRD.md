# PRD: DHL Express Provider (Direct MyDHL API)

**System ID:** `shipping-provider-dhl`
**Layer:** C (Shipping Provider Adapter)
**Status:** Draft — Rates Only (Labels/Tracking Deferred)
**Owner:** Commerce / Shipping Domain
**Last Updated:** 2026-04-14
**API Version:** DHL Express MyDHL API v2 (current as of 2026-04)

---

## 1. Context & Intent

### 1.1 What This Is

The DHL Express Provider is a Layer C carrier adapter that integrates **directly with the DHL Express MyDHL API** (not via ShipStation, EasyPost, or any aggregator). It implements a subset of the `LiveRateProvider` contract defined in PRD B10 (`shipping-method-live-rate`) and is invoked by the Rate Calculation Pipeline (PRD A7, `rate-calculation-pipeline`) alongside any other registered providers.

Concretely, the DHL Express Provider is responsible for:

1. **HTTP Basic Authentication** against the MyDHL API using a merchant-scoped `username` (DHL's "API Key") and `password` (DHL's "API Secret"), base64-encoded on every request.
2. **Rate shopping** via `GET /rates` using a full query-string parameterization that includes origin, destination, weight, dimensions, planned ship date, customs declarability, and account number.
3. **Multi-currency rate responses**, selecting the first priced entry per product (`totalPrice[0]`) and filtering out zero/negative prices (products that are quoted as unavailable by DHL).
4. **Connection verification** — a probe `GET /rates` call with a fixed New York → Los Angeles, 1 kg, 10×10×10 cm payload that exercises every required query parameter end-to-end.
5. **Capability reporting** — the provider declares `{ rates: true, labels: false, tracking: false, addressValidation: false }` so the Pipeline (A7) and admin UI can surface the adapter as rates-only without misleading operators into thinking labels can be purchased.

### 1.2 Why It Exists

ConvexPress already ships a ShipStation provider (PRD C1, `shipping-provider-shipstation`) and direct UPS/FedEx adapters (PRDs C2, C4). Those cover domestic US parcel shipping extremely well. They do **not** cover cross-border shipping competitively in most corridors. DHL Express exists for one primary reason on this platform:

1. **International express shipping**, especially US → EU, US → APAC, EU → US, intra-APAC, and intra-EU, where DHL's negotiated rates frequently beat UPS Worldwide Expedited and FedEx International Priority by 10–30% on dutiable dimensional freight.
2. **Customs-ready quoting.** DHL's `/rates` endpoint accepts an `isCustomsDeclarable` flag that swings the quote between domestic-express and customs-cleared international service codes. This lets the Pipeline quote accurate landed freight for cross-border carts.
3. **Time-definite services** (Express 9:00, Express 10:30, Express 12:00) that neither UPS nor FedEx expose the same way in their rating APIs.

Merchants with a direct DHL Express contract can enter their API Key, API Secret, and Account Number and begin quoting DHL rates alongside their other carriers. Merchants without a DHL contract do not enable this provider; the Pipeline simply does not invoke it.

### 1.3 Design Philosophy

The DHL Express Provider is a **thin, rates-only translation layer** between the abstract `LiveRateProvider` contract (B10) and the MyDHL `/rates` endpoint. It is intentionally narrower than the UPS and FedEx adapters because:

- It does **not** implement `purchaseLabel`, `voidLabel`, or `trackShipment`. The B10 contract requires those methods to exist; this adapter throws a typed `UnsupportedOperationError` from each so the Pipeline (A7) routes label/tracking requests to UPS/FedEx/ShipStation while continuing to consult DHL for rates.
- It does **not** cache anything. DHL Basic Auth has no tokens, no expiry, and no refresh flow. The credentials are applied per-request; there is no OAuth ceremony to amortize.
- It does **not** own package selection. Package dimensions come from the Packages system (PRD A3) via the Pipeline. The legacy behaviour of hardcoded `20 × 15 × 10` cm dimensions is a known gap (§10) scheduled to be removed when A3 is fully wired through the Pipeline.
- It **does** translate service codes (see §5.5) into the human-readable labels merchants and end-customers see on checkout. The source of truth for service-code strings is `convex/shipping/providers/dhl/serviceCodes.ts`.
- It **does** normalize rate responses into the Pipeline's internal `NormalizedRate` shape so downstream callers (PRD A7, PRD B10) cannot tell which provider supplied a given rate.

The adapter lives in `convex/shipping/providers/dhl.ts` (refactored out of the current monolithic `convex/shipping/actions.ts`). Its public surface is the six functions required by B10, but only two are actually implemented (§6).

### 1.4 Non-Goals (Explicit)

- **Label purchase.** Deferred. DHL Express labels require `POST /shipments` with a materially richer payload (payer accounts, incoterms, customs invoice, HS codes). The Commerce roadmap schedules this for the next iteration after Packages (A3) and Customs Forms are fully integrated.
- **Shipment tracking.** Deferred. DHL `GET /tracking` is straightforward but surfaces a different event vocabulary than UPS/FedEx; normalizing it properly is pushed to the label iteration so they land together.
- **Customs declarations / paperless trade.** Deferred. `/rates` uses only the boolean `isCustomsDeclarable` flag; full HS-code-level declarations are a label concern, not a rates concern.
- **Address validation.** Out of scope. The Address Validation System (PRD A5) uses a different set of providers (Smarty, Lob). DHL's address validation surface is not wired in.
- **Pickup scheduling.** Out of scope. Merchants schedule pickups via DHL.com or a standing daily pickup.
- **DHL eCommerce (non-Express).** Out of scope. This adapter targets DHL Express only. The `eCommerce` and `Parcel` product lines use different APIs and different service codes.
- **Non-parcel freight (DHL Global Forwarding, LTL/FTL).** Out of scope.

### 1.5 Relationship To Other Providers

| Provider | Adapter File | Auth Model | Rates | Labels | Tracking | Best For |
|----------|--------------|------------|-------|--------|----------|----------|
| ShipStation (C1) | `shipping-provider-shipstation` | API key + secret | Yes | Yes | Yes | Low/mid-volume, multi-carrier simplicity |
| UPS Direct (C2) | `shipping-provider-ups` | OAuth 2.0 | Yes | Yes | Yes | Merchants with direct UPS contracts |
| USPS Direct (C3) | `shipping-provider-usps` | OAuth 2.0 | Yes | Yes | Yes | USPS-heavy domestic flat rate |
| FedEx Direct (C4) | `shipping-provider-fedex` | OAuth 2.0 | Yes | Yes | Yes | FedEx contract accounts |
| **DHL Express (C5, this PRD)** | **`shipping-provider-dhl`** | **HTTP Basic Auth** | **Yes** | **No (deferred)** | **No (deferred)** | **International express, cross-border** |

Of the five providers, DHL Express is the only one whose auth model is **not** token-based. The adapter therefore has a deliberately different code shape than UPS/FedEx: no token cache, no refresh timer, no background sync of expiring credentials.

---

## 2. Scope

### 2.1 In Scope

1. **HTTP Basic Auth** with a base64-encoded `username:password` header on every outbound request. No tokens, no refresh flow, no expiry handling.
2. **Rate shopping** via `GET /rates?{queryParams}` against either the production or sandbox base URL (see §5.2). Query-string-only; no JSON body is sent on this endpoint.
3. **International-first rating.** The adapter computes `isCustomsDeclarable` by comparing origin country to destination country and flips the query parameter accordingly. This is the core value proposition over the other providers, which treat international as a secondary code path.
4. **Multi-currency rate output.** The adapter preserves the `priceCurrency` returned by DHL per product and passes it through as `NormalizedRate.currency`. The Pipeline (A7) is responsible for currency conversion into the storefront display currency.
5. **Service code decoding** via a single source-of-truth map (§5.5) in `convex/shipping/providers/dhl/serviceCodes.ts`. All 17 known Express service codes are mapped.
6. **Unit conversion.** Weights arriving from the Pipeline in ounces are converted to kilograms via `oz / 35.274` with a minimum floor of `0.1 kg` to satisfy DHL's minimum-billable-weight requirement.
7. **Connection verification** via a fully-specified probe `GET /rates` call that exercises every required query parameter. This is the endpoint a merchant's "Test Connection" button hits from admin settings (§7).
8. **Capability flag reporting.** Adapter returns `{ rates: true, labels: false, tracking: false, addressValidation: false }` to the Pipeline so operators are not misled about what is wired.

### 2.2 Out of Scope

1. **Label purchase.** `purchaseLabel` is declared by the B10 contract but throws `UnsupportedOperationError('dhl.purchaseLabel')`. Deferred until the Labels iteration.
2. **Tracking.** `trackShipment` throws `UnsupportedOperationError('dhl.trackShipment')`. Deferred.
3. **Label void.** `voidLabel` throws `UnsupportedOperationError('dhl.voidLabel')`. Deferred alongside purchase.
4. **Customs declarations beyond the boolean flag.** HS codes, customs invoice, invoice line items, incoterms — all deferred with labels.
5. **Account sync / capability auto-detection.** `syncAccounts` returns a static `{ accountNumber, capabilities }` object from the stored credential record; it does not call DHL to discover account-level entitlements.
6. **Address validation.** Deferred; PRD A5 handles this with different vendors.
7. **Pickup scheduling, commercial invoices, paperless trade agreements.** Deferred.
8. **Rate caching inside the adapter.** Caching is owned by the Pipeline (A7) at the quote level via the `addressKey`/`cartKey` fingerprint.

---

## 3. Dependencies

### 3.1 Upstream PRDs (this adapter consumes)

| PRD | System | What We Depend On |
|-----|--------|-------------------|
| B10 | `shipping-method-live-rate` | `LiveRateProvider` contract, `NormalizedRate` shape, `UnsupportedOperationError` helper, `RateContext` input shape |
| A3 | `shipping-packages-system` | Package dimensions (`length`, `width`, `height`, `unit`) for the rate request — replaces hardcoded 20×15×10 |
| A5 | `address-validation-system` | Normalized origin/destination address with country, postal code, and city populated |
| A7 | `rate-calculation-pipeline` | Invocation, provider registration, rate aggregation, currency conversion, caching |

### 3.2 Downstream PRDs (this adapter emits into)

| PRD | System | What They Consume |
|-----|--------|-------------------|
| A7 | `rate-calculation-pipeline` | Array of `NormalizedRate` per call; capability flags; error envelopes |
| B10 | `shipping-method-live-rate` | `verifyConnection` result; provider registration handshake |
| Audit Log (PRD 2) | `audit-log-system` | Credential CRUD events, verification attempts (success/failure), rate request failures |

### 3.3 External Dependencies

- **DHL Express MyDHL API v2** (production: `https://express.api.dhl.com/mydhlapi`, sandbox: `https://express.api.dhl.com/mydhlapi/test`).
- **DHL Developer Portal** for merchant provisioning of API Key + API Secret + Account Number. This flow is outside the product surface and happens on dhl.com.

### 3.4 No Dependencies On

- UPS, FedEx, USPS, or ShipStation providers. The five Layer C adapters are peers; none depends on another.
- Any packaging algorithm other than what A3 exposes via the Pipeline. The adapter does not bin-pack.
- Any caching layer. The adapter makes exactly one outbound HTTP call per `fetchRates` invocation.

---

## 4. Schema

### 4.1 Existing Tables Reused

The DHL Express Provider **does not introduce new tables**. It reuses the provider-shared tables defined by the Live Rate Contract (PRD B10) and the Shipping Providers base schema. Records are scoped by `provider = "dhl"`.

| Table | Purpose | Key Fields (DHL-Specific Semantics) |
|-------|---------|--------------------------------------|
| `shippingProviderCredentials` | Stored creds per merchant | `provider = "dhl"`, `username` (API Key), `passwordEncrypted` (API Secret, AES-GCM), `accountNumber`, `environment` ∈ {`production`, `sandbox`} |
| `shippingProviderAccounts` | Per-account capability + display metadata | `provider = "dhl"`, `accountNumber`, `displayName`, `capabilities = { rates: true, labels: false, tracking: false, addressValidation: false }` |
| `shippingProviderVerifications` | Latest verification attempt result | `provider = "dhl"`, `status` ∈ {`ok`, `auth_failed`, `network_error`, `invalid_account`, `other`}, `checkedAt`, `errorMessage` |

### 4.2 Indexes Relied Upon

- `shippingProviderCredentials.by_provider` — lookup creds for the DHL adapter at call time.
- `shippingProviderAccounts.by_provider_and_account` — find an account by `(provider, accountNumber)` to stamp capability flags.
- `shippingProviderVerifications.by_provider` — surface the latest verification in the admin UI.

### 4.3 Migrations

None. The DHL adapter piggybacks on tables created by the Live Rate Contract (PRD B10). The only DHL-specific data is rows with `provider = "dhl"`.

### 4.4 Secrets Handling

- `username` is stored plaintext (it is not a secret on its own — DHL labels it "API Key" but pairs it with a separate secret).
- `passwordEncrypted` is stored AES-GCM-encrypted at rest, with the symmetric key in `process.env.SHIPPING_SECRETS_KEY`. Decryption happens only inside the adapter, immediately before base64-encoding the `username:password` pair into the `Authorization` header.
- `accountNumber` is stored plaintext. It is merchant-identifying but not a credential in isolation.

---

## 5. Data Model

### 5.1 Authentication Model

DHL Express uses **HTTP Basic Authentication**. There is no OAuth flow, no token endpoint, no refresh cycle, and no expiry. The adapter constructs an `Authorization` header on every outbound call:

```
Authorization: Basic base64(username + ":" + password)
```

**Implications for the adapter:**

- No token cache table, no scheduled refresh job, no "token expired" retry branch.
- Credential rotation is a synchronous act: the merchant saves new creds in admin, the next rate call uses them.
- A stale or wrong credential surfaces as an HTTP `401` on `GET /rates`; the adapter normalizes this to `ProviderError.AUTH_FAILED` for the Pipeline.

**Input shape for the adapter's internal `buildAuthHeader(credentials)` helper:**

```
type DhlCredentials = {
  username: string;              // DHL "API Key"
  password: string;              // DHL "API Secret" (decrypted)
  accountNumber: string;         // DHL Express account number
  environment: "production" | "sandbox";
};
```

### 5.2 Base URLs

| Environment | Base URL |
|-------------|----------|
| Production | `https://express.api.dhl.com/mydhlapi` |
| Sandbox | `https://express.api.dhl.com/mydhlapi/test` |

The adapter selects the base URL from `credentials.environment` at call time. The two environments are **not** interchangeable — sandbox credentials do not authenticate against production and vice versa. Admin UX (§7) must surface the environment selector prominently.

### 5.3 Capability Flags

```
type DhlCapabilities = {
  rates: true;
  labels: false;
  tracking: false;
  addressValidation: false;
};
```

These flags are **static for v1**. They are stamped onto `shippingProviderAccounts.capabilities` when the merchant saves credentials and are consulted by:

- The Pipeline (A7) when deciding whether to invoke `fetchRates` (yes) / `purchaseLabel` (skip, it will throw) / `trackShipment` (skip).
- The admin provider-detail page (§7) when rendering the "Supports" badges.
- The checkout flow (§9) which never routes a label purchase to DHL until the flag flips to `true` in a future iteration.

### 5.4 Required Query Parameters for `GET /rates`

Every parameter in this list **must** be present and non-empty or DHL returns a `400 Bad Request`. The adapter must treat a missing value as a local validation failure, not an API error.

| Parameter | Type | Source | Notes |
|-----------|------|--------|-------|
| `accountNumber` | string | `credentials.accountNumber` | DHL Express account number |
| `originCountryCode` | ISO-2 | `context.from.country` | e.g. `"US"` |
| `originPostalCode` | string | `context.from.postalCode` | See §10 for countries without postcodes |
| `originCityName` | string | `context.from.city` | |
| `destinationCountryCode` | ISO-2 | `context.to.country` | |
| `destinationPostalCode` | string | `context.to.postalCode` | See §10 |
| `destinationCityName` | string | `context.to.city` | |
| `weight` | decimal | `convertOzToKg(context.totalWeightOz)` | kg; min 0.1 |
| `length` | integer | `context.package.length` (from A3) | cm |
| `width` | integer | `context.package.width` (from A3) | cm |
| `height` | integer | `context.package.height` (from A3) | cm |
| `plannedShippingDate` | ISO date | today in UTC, `YYYY-MM-DD` | |
| `isCustomsDeclarable` | `"true" \| "false"` | `context.from.country !== context.to.country` | Stringified boolean |
| `unitOfMeasurement` | `"metric" \| "imperial"` | fixed `"metric"` for v1 | kg + cm |

**`unitOfMeasurement` strategy for v1 is fixed to `"metric"`.** The adapter always converts inbound units to kg + cm before building the query. Allowing `"imperial"` through would require per-request unit coherence checks (weight must match length/width/height unit) that add complexity without merchant benefit.

### 5.5 Service Code Map (Source of Truth)

The authoritative list lives in `convex/shipping/providers/dhl/serviceCodes.ts`. Corrected per the 2026-04 audit:

| Code | Display Name |
|------|--------------|
| `D` | DHL Express Worldwide (Doc) |
| `E` | DHL Express 9:00 *(corrected — was "Express 10:30")* |
| `G` | DHL Express International |
| `H` | DHL Economy Select |
| `I` | DHL Domestic Express 9:00 *(new in audit)* |
| `K` | DHL Express 9:00 (Doc) |
| `L` | DHL Express 10:30 *(new in audit)* |
| `M` | DHL Express 10:30 (Doc) *(new in audit)* |
| `N` | DHL Express Domestic |
| `P` | DHL Express Worldwide |
| `Q` | DHL Medical Express *(new in audit)* |
| `T` | DHL Express 12:00 (Doc) *(corrected — was "Express Easy")* |
| `U` | DHL Express Worldwide (EU) |
| `V` | DHL Europack *(new in audit)* |
| `W` | DHL Economy Select (Non-Doc) |
| `X` | DHL Express Envelope |
| `Y` | DHL Express 12:00 |

**Fallback behavior.** If DHL returns a `productCode` the adapter does not recognize, the rate is still surfaced with `productName = "DHL " + productCode` as a last resort. The adapter must **not** drop an unknown rate — unknown codes are a signal DHL added a new service, and merchants deserve to see the quote even if the label is less polished until the map is updated.

### 5.6 Response Shape (Normalized)

DHL returns a JSON response shaped as:

```
type DhlRateResponse = {
  products: Array<{
    productCode: string;
    productName?: string;
    localProductCode?: string;
    totalPrice: Array<{
      currencyType: "BILLC" | "PULCL" | "BASEC";
      priceCurrency: string;   // ISO 4217, e.g. "USD"
      price: number;
    }>;
    deliveryCapabilities?: {
      deliveryTypeCode?: string;
      estimatedDeliveryDateAndTime?: string;  // ISO 8601
      destinationServiceAreaCode?: string;
      totalTransitDays?: string;              // stringified integer
    };
  }>;
};
```

The adapter maps each surviving `product` (§5.7 filter) into the Pipeline's `NormalizedRate` shape:

```
type NormalizedRate = {
  providerId: "dhl";
  serviceCode: string;          // productCode
  serviceName: string;          // serviceCodes[productCode] ?? "DHL " + productCode
  amount: number;               // totalPrice[0].price
  currency: string;             // totalPrice[0].priceCurrency
  estimatedDeliveryAt?: string; // deliveryCapabilities.estimatedDeliveryDateAndTime
  transitDays?: number;         // parseInt(deliveryCapabilities.totalTransitDays)
  raw: unknown;                 // the original DHL product object, kept for debugging
};
```

### 5.7 Response Filtering Rules

1. **`totalPrice` must exist and be non-empty.** Missing → drop the product.
2. **`totalPrice[0].price > 0`.** DHL uses zero and negative prices to signal "we can't quote this service for this lane at this weight"; these must be filtered out before returning to the Pipeline.
3. **`productCode` must be a string.** Products without a product code are logged and dropped.
4. **Duplicate product codes** (rare, but possible when DHL returns multiple priced variants per service): keep the first occurrence, log the rest at debug.

### 5.8 Weight Conversion

```
function convertOzToKg(ounces: number): number {
  const kg = ounces / 35.274;
  return Math.max(0.1, Number(kg.toFixed(3)));
}
```

- The divisor `35.274` is the SI conversion (1 kg = 35.27396 oz rounded).
- The `0.1` floor satisfies DHL's minimum-billable-weight; DHL rejects `weight < 0.1` with a validation error.
- Three-decimal precision is what DHL accepts without rounding complaints.

---

## 6. Functions / API

All functions live in `convex/shipping/providers/dhl.ts` (refactored from the current monolith). The adapter conforms to the `LiveRateProvider` interface (PRD B10).

### 6.1 Implemented Functions

#### 6.1.1 `fetchRates(ctx, request)`

**Purpose.** Given a normalized rate request from the Pipeline (A7), return an array of `NormalizedRate` objects.

**Inputs.**
```
type FetchRatesInput = {
  credentials: DhlCredentials;
  from: { country: string; postalCode: string; city: string };
  to: { country: string; postalCode: string; city: string };
  package: { length: number; width: number; height: number };  // cm, from A3
  totalWeightOz: number;
  plannedShippingDate?: string;  // defaults to today UTC
};
```

**Flow.**
1. Validate all required fields (§5.4). Missing/empty → throw `ProviderValidationError`.
2. Compute `isCustomsDeclarable = from.country !== to.country`.
3. Convert `totalWeightOz` → kg via `convertOzToKg`.
4. Build query string (URL-encoded).
5. Build `Authorization: Basic` header from `credentials`.
6. `GET {baseUrl}/rates?{qs}`.
7. On `200`: filter `products[]` per §5.7, map to `NormalizedRate` per §5.6, return.
8. On `401`: throw `ProviderError.AUTH_FAILED`.
9. On `400`: throw `ProviderError.BAD_REQUEST` with DHL's error detail echoed.
10. On `429`: throw `ProviderError.RATE_LIMITED` with `Retry-After` echoed.
11. On `5xx`: throw `ProviderError.UPSTREAM_UNAVAILABLE`.
12. On network failure: throw `ProviderError.NETWORK_ERROR`.

**Output.** `Array<NormalizedRate>` — possibly empty if DHL quotes nothing for the lane.

#### 6.1.2 `verifyConnection(ctx, credentials)`

**Purpose.** Confirm that a stored credential triple (username, password, accountNumber) successfully authenticates and can retrieve rates.

**Flow.**
1. Build a fixed probe request:
   - `from`: `{ country: "US", postalCode: "10001", city: "New York" }`
   - `to`: `{ country: "US", postalCode: "90001", city: "Los Angeles" }`
   - `package`: `{ length: 10, width: 10, height: 10 }`
   - `totalWeightOz`: `35.274` (exactly 1 kg)
   - `plannedShippingDate`: today UTC
2. Call `fetchRates` with the probe.
3. Map outcomes:
   - Any non-empty `NormalizedRate[]` → `{ status: "ok" }`.
   - Empty `NormalizedRate[]` but HTTP 200 → `{ status: "ok", warning: "no_services_for_lane" }` (creds are fine; DHL simply has nothing priced for NY→LA, which is rare but possible in sandbox).
   - `AUTH_FAILED` → `{ status: "auth_failed" }`.
   - `BAD_REQUEST` with DHL detail containing "account" → `{ status: "invalid_account" }`.
   - `NETWORK_ERROR` | `UPSTREAM_UNAVAILABLE` → `{ status: "network_error" }`.
   - Everything else → `{ status: "other", errorMessage }`.
4. Upsert into `shippingProviderVerifications` with `provider = "dhl"`, `checkedAt = now`, `status`, `errorMessage`.

**Known gap being fixed by this PRD.** The current implementation (`actions.ts` lines 3392–3465) does **not** include all required query parameters on the verification call (`plannedShippingDate`, `isCustomsDeclarable`, `unitOfMeasurement` were missing intermittently). The refactored adapter routes verification through `fetchRates` to guarantee parity.

### 6.2 Deferred (Not Implemented) Functions

Each of these is exported for contract conformance and **must throw** `UnsupportedOperationError` with a provider-tagged message. The Pipeline (A7) recognizes this error and skips the provider for that operation without failing the overall request.

#### 6.2.1 `purchaseLabel(ctx, request)`

```
throw new UnsupportedOperationError(
  "dhl.purchaseLabel",
  "DHL Express label purchase is not implemented in v1. Use UPS, FedEx, or ShipStation for labels."
);
```

#### 6.2.2 `voidLabel(ctx, request)`

```
throw new UnsupportedOperationError(
  "dhl.voidLabel",
  "DHL Express label void is not implemented in v1."
);
```

#### 6.2.3 `trackShipment(ctx, request)`

```
throw new UnsupportedOperationError(
  "dhl.trackShipment",
  "DHL Express tracking is not implemented in v1."
);
```

#### 6.2.4 `syncAccounts(ctx, credentials)`

Returns a static shape built from the stored credential record; does not hit DHL. The Pipeline (A7) calls this at credential-save time to stamp capability flags.

```
type SyncAccountsResult = {
  accountNumber: string;
  displayName: string;   // "DHL Express {accountNumber}"
  capabilities: DhlCapabilities;
};
```

### 6.3 Internal Helpers (not part of the B10 contract)

- `buildAuthHeader(credentials): string`
- `buildRatesQuery(input): string`
- `convertOzToKg(oz): number`
- `parseRateResponse(json): NormalizedRate[]`
- `dhlErrorToProviderError(httpStatus, body): ProviderError`

These are not exported from `dhl.ts`; they live in the same module and are covered by unit tests (§11).

---

## 7. Admin UX

The admin surface for DHL Express is the same WordPress-style settings pattern used by the other providers (UPS PRD C2, FedEx PRD C4). Full pages only — no modals for content management (per ConvexPress UI rules).

### 7.1 Settings → Shipping → Providers → DHL Express

**Route:** `/admin/settings/shipping/providers/dhl`

**Sections:**

1. **Credentials card.**
   - Environment selector: `Production` / `Sandbox` (segmented control; defaults to `Sandbox` on first save).
   - `API Key` (DHL username).
   - `API Secret` (DHL password; rendered masked with reveal toggle).
   - `Account Number`.
   - `Save` button (disabled until all four fields are non-empty).
2. **Capabilities card (read-only badges).**
   - `Rates` — enabled (green).
   - `Labels` — coming soon (muted).
   - `Tracking` — coming soon (muted).
   - `Address Validation` — not supported (muted).
3. **Test Connection card.**
   - Button: `Test Connection`. Fires `verifyConnection`. Shows latest result inline with status, timestamp, and error message if any.
   - Status-specific copy:
     - `ok` → "Connection OK. DHL Express is ready to quote rates."
     - `auth_failed` → "DHL rejected your credentials. Double-check API Key and API Secret."
     - `invalid_account` → "DHL rejected your account number for this API Key."
     - `network_error` → "Could not reach DHL. Try again in a minute."
     - `other` → shows raw `errorMessage`.
4. **Service Code Reference card (read-only, collapsible).**
   - Renders the full §5.5 map so merchants can see exactly what DHL service codes the adapter recognizes.

### 7.2 Admin Pipeline Overview Integration

The Pipeline admin page (PRD A7) renders a per-provider row. For DHL:

- **Provider:** `DHL Express`
- **Status:** taken from the latest `shippingProviderVerifications` row.
- **Capabilities:** `Rates only (labels / tracking pending)`.
- **Last Quote:** timestamp of the most recent successful `fetchRates` for this provider (from audit log).

### 7.3 Audit Trail Surface

Every admin action against DHL credentials emits an audit event (§14):

- `shipping.provider.credentials.saved`
- `shipping.provider.credentials.rotated`
- `shipping.provider.credentials.deleted`
- `shipping.provider.verification.attempted`

These show up in the Audit Log (PRD 2) under the merchant's shipping activity.

---

## 8. Merchant Workflow

### 8.1 First-Time Setup

1. Merchant signs up for DHL Express at dhl.com and gets an account number.
2. Merchant creates an app on the DHL Developer Portal to generate an API Key + API Secret.
3. Merchant opens ConvexPress admin → Settings → Shipping → Providers → DHL Express.
4. Merchant selects `Sandbox`, pastes API Key / API Secret / Account Number, clicks `Save`.
5. Merchant clicks `Test Connection`. If `ok`, they flip environment to `Production`, paste prod creds, save, retest.
6. Pipeline (A7) now includes DHL rates on every storefront quote where the origin has a DHL-compatible ship-from (see PRD `ship-from-locations-system`).

### 8.2 Credential Rotation

1. Merchant rotates their API Secret on the DHL Developer Portal (DHL best practice: every 90 days).
2. Merchant pastes the new secret in admin, clicks `Save`.
3. Next rate call uses the new creds. No restart, no token flush, no cache invalidation (there is no cache).
4. Audit log records `shipping.provider.credentials.rotated` with the acting user and timestamp.

### 8.3 Troubleshooting Workflow

1. Customer reports "no shipping rates at checkout".
2. Merchant opens Pipeline admin (PRD A7).
3. Row for DHL shows `auth_failed` with a timestamp.
4. Merchant clicks through to DHL provider page, sees `Test Connection` last result is `auth_failed`.
5. Merchant rotates secret, retests, sees `ok`, checkout resumes.

### 8.4 Side-By-Side Operation With UPS/FedEx

DHL is typically enabled alongside UPS and/or FedEx. The Pipeline (A7) fans rate requests out to all enabled providers in parallel. If DHL times out or errors, the storefront still sees UPS/FedEx rates; DHL's failure is logged but does not block checkout. The adapter's error envelopes (§6.1.1 step 8–12) are specifically shaped so A7 can recognize a transient DHL failure and degrade gracefully.

---

## 9. Storefront UX

### 9.1 Rate Display

Rates returned from DHL flow through the Pipeline (A7) and appear in the storefront's shipping-method selector identically to UPS/FedEx rates. The user-visible string is `serviceName` (from §5.5), followed by estimated delivery:

- `DHL Express Worldwide — arrives Wed, Apr 22`
- `DHL Express 12:00 — arrives Mon, Apr 20 by 12:00 PM`

Currency is whatever DHL returned (`totalPrice[0].priceCurrency`). If the storefront display currency differs, the Pipeline performs FX conversion before rendering; the adapter itself does not convert.

### 9.2 International-First Context

The primary merchant use case is **cross-border shipping**. When the Pipeline detects `from.country !== to.country`, DHL is almost always the cheapest or fastest option on the rate sheet. The adapter does nothing storefront-specific for this; it simply returns its rates and lets the Pipeline and the storefront's shipping-method selector (PRD B10 renderer) surface them.

### 9.3 What the Storefront Never Does With DHL (v1)

- Never routes a label purchase to DHL (capability flag `labels: false`).
- Never polls a DHL tracking number (capability flag `tracking: false`).
- Never calls DHL for address validation.

If the merchant's fulfillment workflow tries any of these (e.g. an admin hits "Buy Label" on an order where DHL was the selected rate), the Order UI surfaces a "Labels are not yet available for DHL Express; please purchase via DHL.com" banner and allows the operator to swap carriers or enter a tracking number manually.

---

## 10. Edge Cases

### 10.1 Basic Auth Credential Rotation

DHL recommends rotating API Secrets every 90 days. Because there is no token cache, rotation is atomic: the merchant saves new creds, and the very next `fetchRates` picks them up. The adapter does **not** preserve a "last-known-good" set of creds; a saved bad credential will immediately break rate quoting until corrected. The admin UX (§7.1) mitigates this with a mandatory `Test Connection` prompt after save.

### 10.2 Cross-Border Customs Declarability

The `isCustomsDeclarable` query parameter is computed from the addresses, not from cart contents:

```
isCustomsDeclarable = from.country.toUpperCase() !== to.country.toUpperCase()
```

Corner cases:

- **Same country, different territory.** `US → PR` (Puerto Rico) — DHL treats this as US-domestic; we pass `false`. Correct per DHL's rating rules.
- **EU intra-community.** `DE → FR` — both EU, no customs; we pass `false`. Correct.
- **GB ↔ EU.** Post-Brexit, GB ↔ any EU country is customs-declarable. Country codes differ (`GB` vs `DE`), so `true` is emitted correctly.
- **US minor outlying islands.** `US → AS` (American Samoa), `US → GU` (Guam) — codes differ (`US` vs `AS`/`GU`), we emit `true`. DHL accepts this correctly.

The adapter does **not** attempt to detect declarable-item cart contents (alcohol, restricted goods). That is a label-time concern (§1.4).

### 10.3 Weight Conversion Precision

The conversion `oz / 35.274` introduces rounding at the third decimal. We intentionally do **not** ceil, floor, or round-up to the next whole gram. DHL accepts three-decimal kg values. Rounding would bias quotes upward for no merchant benefit.

**Floor rule.** If the result is less than `0.1 kg`, we emit `0.1 kg`. DHL's `/rates` endpoint returns a validation error on `weight < 0.1`, and shipments under 100 g are in practice packaged in a carrier envelope that bills at the minimum rate anyway.

### 10.4 Hardcoded Dimensions Gap (Scheduled Removal)

The current monolithic adapter (`actions.ts` line ~1233–1430) hardcodes `length=20, width=15, height=10` for every rate request. This is a **known gap**. The refactored adapter (this PRD) requires `package.length/width/height` from PRD A3 on the input. Until A3 is fully wired through the Pipeline, the Pipeline supplies a default `Letter` package (30 × 21 × 2 cm) from A3's seed data so the adapter never sees a hardcoded value itself. The adapter's job is strictly to pass through whatever A3 supplies.

**This PRD formally removes the 20×15×10 hardcode.** Any future code that introduces inline dimension constants inside the DHL adapter is a regression.

### 10.5 Rate Response Filters Products With Zero or Negative Price

DHL uses `totalPrice[0].price <= 0` to signal "service not available for this lane/weight combo". The adapter filters these before returning (§5.7). This is **not** an error — it is DHL's normal way of saying "not available". No log warning is emitted; the remaining products are returned normally.

### 10.6 Missing Postcode For Some Countries

A subset of DHL-served countries do not use postcodes (e.g. Ireland historically, Panama, parts of the Caribbean). When `context.to.postalCode` is empty and the country is on DHL's no-postcode list, DHL accepts an empty string or the literal string `"NA"` on the query parameter.

**Adapter behavior.**
- If `postalCode` is empty and `country` is in the `DHL_NO_POSTCODE_COUNTRIES` set (maintained in `convex/shipping/providers/dhl/serviceCodes.ts`), the adapter emits `postalCode=NA`.
- Otherwise, empty postal codes are treated as a validation failure and surface as `ProviderValidationError` to the Pipeline.

### 10.7 Origin/Destination City Casing

DHL is case-sensitive on city names in some corridors. The adapter trims and title-cases city names (`new york` → `New York`) before emitting. This mirrors what the Address Validation System (A5) already does, but we double-tap at the adapter boundary to tolerate a misbehaving A5 fallback path.

### 10.8 Non-ASCII Characters In Addresses

City and postal values may contain non-ASCII characters (`São Paulo`, `Zürich`, `Kraków`). The adapter URL-encodes via `encodeURIComponent` before building the query. DHL accepts UTF-8 once percent-encoded.

### 10.9 Rate Response With No Products

DHL can return `200 OK` with `products: []` when the lane is served but no services apply to the weight/dimensions (e.g. oversize box above a service's package limit). The adapter returns `[]` to the Pipeline, which treats it as "DHL has no rates", and the storefront falls back to other providers' rates. This is **not** an error.

### 10.10 Planned Shipping Date In The Past

If `plannedShippingDate` ends up in the past (unlikely, but possible during timezone edge cases near midnight UTC), DHL returns a validation error. The adapter always uses `new Date().toISOString().slice(0, 10)` in UTC at call time, and the Pipeline never supplies an override for v1. A future "schedule shipment" feature would require this to be plumbed through explicitly.

### 10.11 Sandbox vs Production Credential Mix-Up

Sandbox creds do not authenticate against production and vice versa. If a merchant pastes sandbox creds and saves with `environment = production`, the adapter emits `auth_failed` on the first call. The admin page's mandatory `Test Connection` (§7.1) catches this within seconds of save.

---

## 11. Testing Requirements

### 11.1 Unit Tests

Unit tests live in `convex/shipping/providers/__tests__/dhl.test.ts` and cover:

1. **`convertOzToKg`**
   - `35.274 oz → 1.000 kg`
   - `0 oz → 0.1 kg` (floor)
   - `1 oz → 0.1 kg` (floor)
   - `176.37 oz → 5.000 kg`
2. **`buildAuthHeader`**
   - Known fixture: `username="apiuser_demo"`, `password="API+Secret+1"` → `Basic YXBpdXNlcl9kZW1vOkFQSStTZWNyZXQrMQ==`
3. **`buildRatesQuery`**
   - All required params present.
   - `isCustomsDeclarable` derivation (same-country → `false`, cross-border → `true`).
   - Non-ASCII city URL-encoding.
   - No-postcode country emits `postalCode=NA`.
4. **`parseRateResponse`**
   - Filters `totalPrice[0].price <= 0`.
   - Maps service codes via `serviceCodes.ts` (including corrected `E`, `T`, and new `I/L/M/Q/V`).
   - Unknown productCode falls back to `"DHL " + code`, rate still emitted.
   - `totalTransitDays` stringified integer parsed.
5. **`dhlErrorToProviderError`**
   - `401 → AUTH_FAILED`
   - `400` with body mentioning "account" → `INVALID_ACCOUNT` (verification helper)
   - `429` → `RATE_LIMITED` with `Retry-After` propagated
   - `500/502/503/504` → `UPSTREAM_UNAVAILABLE`

### 11.2 Integration Tests (Sandbox)

Integration tests target the DHL Express sandbox at `https://express.api.dhl.com/mydhlapi/test` using a dedicated test account provisioned via the DHL Developer Portal. These tests are tagged `@integration` and are not run on every CI build; they run nightly and on PRs touching `convex/shipping/providers/dhl*`.

1. **Rate fetch, domestic US.** NY → LA, 1 kg, 10×10×10 cm, `isCustomsDeclarable=false`. Expect at least one product back with a positive price in USD.
2. **Rate fetch, cross-border.** NY (US) → Berlin (DE), 2 kg, 30×20×10 cm, `isCustomsDeclarable=true`. Expect at least `P` (Express Worldwide) to come back.
3. **Rate fetch, no postcode country.** Dublin (IE) destination with empty postalCode → should succeed with `postalCode=NA`.
4. **Verification end-to-end.** Happy-path creds → `status: ok`. Deliberately-wrong password → `status: auth_failed`. Wrong account number → `status: invalid_account`. All three outcomes must upsert correctly into `shippingProviderVerifications`.
5. **Unsupported ops throw.** `purchaseLabel`, `voidLabel`, `trackShipment` each throw `UnsupportedOperationError` with the DHL-tagged message. No outbound HTTP call is attempted.

### 11.3 Contract Tests (vs B10)

The adapter must pass the generic `LiveRateProvider` contract test suite defined in PRD B10 (`shipping-method-live-rate`). That suite verifies:

- `fetchRates` returns an array shape matching `NormalizedRate`.
- `verifyConnection` returns one of the documented statuses.
- `syncAccounts` returns the documented shape.
- Unsupported operations throw the typed error rather than returning `null` or silently succeeding.

### 11.4 Regression Fixtures

The following fixtures are captured as JSON under `convex/shipping/providers/__fixtures__/dhl/` for replay in unit tests:

- `rates_us_to_de_2kg.json` — a representative cross-border response with 5 products.
- `rates_ny_la_1kg.json` — the canonical verification probe response.
- `rates_empty_products.json` — `{ products: [] }` for the "served lane, no services" case.
- `rates_with_zero_price.json` — includes one product with `totalPrice[0].price = 0` to exercise the filter.
- `error_401.json` — canonical auth-failed body from DHL.

### 11.5 Performance Targets

- **`fetchRates` p95 latency**: ≤ 1800 ms end-to-end including network. DHL's `/rates` typically responds in 600–1200 ms; the budget leaves margin for the Pipeline's serialization overhead.
- **`verifyConnection` p95 latency**: ≤ 2500 ms. Slightly higher because of the fixed probe shape.
- **Failure timeout**: adapter aborts any outbound call after 5000 ms and returns `UPSTREAM_UNAVAILABLE`.

---

## 12. Success Criteria

The DHL Express Provider is considered production-ready when all of the following hold:

1. **Rate contract conformance.** Every test in PRD B10's generic `LiveRateProvider` suite passes for `provider = "dhl"`.
2. **Service code accuracy.** All 17 codes in §5.5 resolve to their corrected display names. The 2026-04 audit corrections (`E`, `T`) and additions (`I`, `L`, `M`, `Q`, `V`) are present in `serviceCodes.ts` and covered by unit tests.
3. **Verification parity.** `verifyConnection` emits every required query parameter; the "missing params on verification" gap is closed. Unit test asserts the probe query contains `plannedShippingDate`, `isCustomsDeclarable`, and `unitOfMeasurement`.
4. **No hardcoded dimensions.** The refactored adapter has zero inline dimension literals. A grep for `20.*15.*10` inside `convex/shipping/providers/dhl*` returns zero matches in the rate path.
5. **Capability flags.** `{ rates: true, labels: false, tracking: false, addressValidation: false }` surfaces correctly in admin UX, Pipeline admin, and the database-stored `shippingProviderAccounts` row.
6. **Unsupported ops throw typed errors.** `purchaseLabel`, `voidLabel`, `trackShipment` throw `UnsupportedOperationError('dhl.<op>')` — not `Error`, not `null`, not silent success.
7. **Audit coverage.** All four credential events (saved, rotated, deleted, verification.attempted) emit into the Audit Log (PRD 2).
8. **Cross-border correctness.** A cross-border integration test (US → DE) returns at least `P` (Express Worldwide) with positive price in the quoted currency.
9. **Rotation safety.** Rotating a secret from admin is visible on the next rate call within one request cycle; no cache flush is required.
10. **Graceful degradation.** A deliberately-broken DHL credential does not break checkout: UPS/FedEx rates continue to display, and the DHL error is logged but suppressed from the storefront.

---

## 13. Roles & Capabilities

The DHL Provider's admin surface is gated by existing capabilities from the Role & Capability System (PRD 17). No new capabilities are introduced.

| Action | Required Capability | Default Roles |
|--------|---------------------|---------------|
| View DHL provider settings page | `admin.shipping.providers.read` | Administrator, Editor |
| Create/update DHL credentials | `admin.shipping.providers.manage` | Administrator |
| Delete DHL credentials | `admin.shipping.providers.manage` | Administrator |
| Run `verifyConnection` from admin | `admin.shipping.providers.manage` | Administrator |
| View audit entries for DHL | `audit.log.read` | Administrator |
| Quote DHL rates at checkout (storefront) | (public — no auth required) | — |

Capabilities are enforced inside the mutations/queries that wrap the adapter (per PRD B10's patterns). The adapter itself is **not** role-aware; it trusts its caller to have authorized the action. This is deliberate: it keeps the adapter free of ConvexPress-specific permission logic and makes it trivial to reuse inside internal actions (e.g. a scheduled rate-benchmarking job).

---

## 14. Events Fired

All events conform to PRD B10's Live Rate Provider event vocabulary. No DHL-specific event types are introduced.

### 14.1 Credential Lifecycle

| Event | When |
|-------|------|
| `shipping.provider.credentials.saved` | Merchant saves fresh DHL credentials for the first time |
| `shipping.provider.credentials.rotated` | Merchant saves new credentials over existing ones |
| `shipping.provider.credentials.deleted` | Merchant removes their DHL credentials |

**Payload (common):** `{ provider: "dhl", actorUserId, environment: "production" | "sandbox", accountNumberMasked: string }`.

### 14.2 Verification

| Event | When |
|-------|------|
| `shipping.provider.verification.attempted` | Each `verifyConnection` call, regardless of outcome |

**Payload:** `{ provider: "dhl", actorUserId, status, errorMessage?, durationMs, checkedAt }`.

### 14.3 Rate Operations

| Event | When |
|-------|------|
| `shipping.provider.rates.fetched` | Successful `fetchRates` with ≥1 rate returned |
| `shipping.provider.rates.empty` | Successful `fetchRates` with zero rates returned (served lane, no services) |
| `shipping.provider.rates.failed` | `fetchRates` threw a `ProviderError` |

**Payload:** `{ provider: "dhl", originCountry, destinationCountry, weightKg, isCustomsDeclarable, productCount, durationMs, errorCode? }`.

### 14.4 Capability Changes

Not emitted for v1. DHL capabilities are static (`rates: true, labels: false, tracking: false, addressValidation: false`). When labels and tracking are added in a future iteration, this PRD will be updated to emit `shipping.provider.capabilities.changed`.

### 14.5 Consumers

These events are consumed by:

- **Audit Log (PRD 2)** — persists credential and verification events for compliance review.
- **Analytics (PRD 28)** — aggregates `rates.fetched` / `rates.empty` / `rates.failed` for per-provider health dashboards.
- **Site Notifications (PRD 23)** — optionally notifies the admin when `rates.failed` exceeds a threshold over a rolling window (e.g. "DHL has failed 50% of rate calls in the last 10 minutes — check credentials").

---

## 15. References

### 15.1 DHL Official Documentation

- **DHL Express MyDHL API v2 — Rates endpoint.** `GET /rates` reference, query parameters, response schema. Available via the DHL Developer Portal.
- **DHL Developer Portal.** Account onboarding, API Key/API Secret generation, sandbox provisioning, production credential minting. `https://developer.dhl.com`.
- **DHL Express Service Guide.** Product-code-to-service-name canonical mapping (source of truth for §5.5 corrections applied in the 2026-04 audit).
- **DHL Express Rate Inquiry Reference.** Covers `isCustomsDeclarable` semantics, `unitOfMeasurement` handling, and minimum billable weight rules.
- **DHL Express Basic Auth integration guide.** Confirms no token/refresh flow; credentials are base64-encoded and sent on every request.

### 15.2 Internal PRD Cross-References

- **PRD B10** (`shipping-method-live-rate`) — `LiveRateProvider` contract, `NormalizedRate` shape, `UnsupportedOperationError` helper, generic contract test suite.
- **PRD A3** (`shipping-packages-system`) — package dimensions source.
- **PRD A5** (`address-validation-system`) — normalized origin/destination address shape.
- **PRD A7** (`rate-calculation-pipeline`) — invocation, aggregation, caching, currency conversion.
- **PRD C1** (`shipping-provider-shipstation`) — peer provider for architectural comparison.
- **PRD C2** (`shipping-provider-ups`) — peer provider; same contract, different auth model (OAuth 2.0).
- **PRD C3** (`shipping-provider-usps`) — peer provider.
- **PRD C4** (`shipping-provider-fedex`) — peer provider; closest architectural sibling to DHL (similar response shape).

### 15.3 Code References (current monolithic implementation being refactored)

- `ConvexPress-Admin/packages/backend/convex/shipping/actions.ts`
  - Lines 290–321 — HTTP Basic Auth header construction.
  - Lines 402–418 — service code map (post-audit, corrected).
  - Lines 1233–1430 — `fetchRates` implementation (includes hardcoded-dimensions gap being removed by this PRD).
  - Lines 3392–3465 — `verifyConnection` implementation (includes missing-required-params gap being fixed by this PRD).
- `ConvexPress-Admin/packages/backend/convex/shipping/providers/dhl.ts` — **target location** for the refactored adapter.
- `ConvexPress-Admin/packages/backend/convex/shipping/providers/dhl/serviceCodes.ts` — **target location** for the service-code source of truth.

### 15.4 Audit Artifacts

- 2026-04 shipping-provider audit — corrected service code `E` from "Express 10:30" to "Express 9:00", corrected `T` from "Express Easy" to "Express 12:00 (Doc)", added codes `I`, `L`, `M`, `Q`, `V`. Artifacts archived in the Audit Log (PRD 2) under the shipping-provider category.
- 2026-04 pre-refactor gap analysis — documented the hardcoded `20 × 15 × 10` dimensions (lines 1233–1430) and the missing required query parameters on `verifyConnection` (lines 3392–3465). This PRD closes both gaps.

---

**End of PRD.**
