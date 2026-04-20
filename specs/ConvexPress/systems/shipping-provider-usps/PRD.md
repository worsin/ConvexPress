# PRD: USPS Provider (Direct REST API v3)

**System ID:** `shipping-provider-usps`
**Layer:** C (Shipping Provider Adapter)
**Status:** Draft — Rates + Tracking live, Labels pending
**Owner:** Commerce / Shipping Domain
**Last Updated:** 2026-04-14
**API Version:** USPS APIs v3 (current as of 2026-04)

---

## 1. Context & Intent

### 1.1 What This Is

The USPS Provider is a Layer C carrier adapter that integrates **directly with the USPS APIs v3 platform** at `apis.usps.com` (production) and `apis-tem.usps.com` (sandbox). It implements the `LiveRateProvider` contract defined in PRD B10 (`shipping-method-live-rate`) and is invoked by the Rate Calculation Pipeline (PRD A7, `rate-calculation-pipeline`) alongside any other registered providers.

The adapter's responsibilities are:

1. **OAuth 2.0 client-credentials authentication** against USPS's v3 token endpoint (`POST /oauth2/v3/token`) with a JSON-body grant — note this differs from UPS and FedEx which use form-encoded bodies.
2. **Rate shopping** via the Domestic Prices v3 API (`POST /prices/v3/base-rates-list/search`) — returns published (commercial) USPS rates across selected mail classes.
3. **Tracking** via the Tracking v3 API (`GET /tracking/v3/tracking/{trackingNumber}?expand=DETAIL`) — returns normalized status and activity history.
4. **Address validation** via the Addresses v3 API (`POST /addresses/v3/address`) — called by the Address Validation System (PRD A5) when USPS is selected as the validator.
5. **Connection verification** — OAuth round-trip plus a `GET /oauth2-oidc/v3/userinfo` probe to confirm credentials are wired correctly.

Labels via the USPS Labels v3 API are **deferred** until the Labels integration is ready (see Section 2.2). Until then, this provider declares `labels: false` in its capability flags and the Pipeline routes label generation requests elsewhere (ShipStation C1, UPS C2, or FedEx C4).

### 1.2 Why It Exists

ConvexPress already ships a ShipStation provider (PRD C1, `shipping-provider-shipstation`) that proxies USPS rates through the ShipStation account. That is the right default for low-volume merchants who want USPS rates alongside UPS and FedEx without managing multiple carrier integrations.

However, some merchants want a **direct USPS integration** because:

1. They ship USPS-heavy workloads (Ground Advantage, Priority Mail, Media Mail, Library Mail) where the per-label margin ShipStation adds is a material line item.
2. They already hold a USPS Business Customer Gateway account with Commercial Plus / NSA pricing. Published commercial rates via Domestic Prices v3 are preferable to published list rates, and moving to the direct API preserves the ability to upgrade to EPS/negotiated pricing later.
3. They want USPS address validation via the official CASS-certified Addresses v3 API rather than via ShipStation's proxy, for both accuracy and for the deliverability data USPS returns (DPV confirmation, vacant/missing codes).
4. They want tracking events piped directly from USPS (no ShipStation lag) for order status webhooks and customer notifications.

This PRD defines the adapter that makes the direct integration possible. A merchant enters their USPS OAuth `clientId` and `clientSecret`, the provider is enabled, and the Pipeline (A7) begins quoting USPS rates. Merchants can run USPS direct alongside ShipStation, UPS direct, and FedEx direct — the Pipeline aggregates all registered providers and returns the best rates per service class.

### 1.3 Design Philosophy

The USPS Provider is a **thin translation layer** between the `LiveRateProvider` contract (B10) and the USPS REST APIs v3. It owns no business logic that is not USPS-specific:

- It does **not** decide which packages to use — packaging comes from PRD A3 (`shipping-packages-system`) via the solver in PRD A4.
- It does **not** decide whether a service is available for a destination — USPS's own response determines that, and the Pipeline (A7) applies overlay rules from A6.
- It does **not** cache rate results — the Pipeline (A7) owns quote-level caching via `addressKey`/`cartKey` fingerprints.
- It **does** cache OAuth tokens (USPS v3 tokens are valid for 28,799 seconds / ~8 hours; re-issuing on every rate call is wasteful and risks throttling).
- It **does** translate error shapes, service names, and tracking event codes into the normalized shapes the Pipeline, checkout, and tracking UI consume.
- It **does** normalize `rate.description` from the USPS response into the display name shown at checkout, with internal fallbacks when the response is terse.

The adapter's target location is `convex/shipping/providers/usps.ts` (refactored out of the current monolithic `convex/shipping/actions.ts`). Its public surface is the subset of B10 functions the provider supports: `fetchRates`, `trackShipment`, `verifyConnection`, `validateAddress`. `purchaseLabel` and `voidLabel` are stubbed to return a `NOT_IMPLEMENTED` error until the Labels v3 integration is added (B10-compliant degradation).

### 1.4 Non-Goals (Explicit)

- **International Prices (Intl Prices v3).** Deferred. v1 supports domestic US-to-US shipments only. International via USPS (Priority Mail International, First-Class Package International, GXG) is a follow-up iteration because it requires separate customs form generation and currency handling.
- **Labels v3 (indicia + Pay-on-Use).** Deferred. See Section 2.2 for the transition plan. Until the Labels integration ships, merchants who want USPS labels continue through ShipStation (C1).
- **SCAN Forms / End-of-Day Manifests.** Deferred — depends on Labels first.
- **EPS (Enterprise Payment System) accounts.** v1 does **not** send `accountType` or `accountNumber` on rate requests because those fields trigger a 403 for non-EPS accounts (see Section 10). Negotiated-rate support for EPS-enrolled merchants is a follow-up once EPS detection is wired.
- **Pickup Scheduling (Pickups v3).** Out of scope for v1. Daily pickup and carrier pickup are assumed to be scheduled directly on USPS.com.
- **Informed Delivery integration.** Out of scope.
- **SAM (Self-Assigned Meter) / PC Postage indicia.** Out of scope for v1; handled via Labels v3 when it ships.

### 1.5 Relationship To Other Providers

| Provider | Adapter File | Auth Model | Labels | Tracking | Addr Validation | Best For |
|----------|--------------|------------|--------|----------|-----------------|----------|
| ShipStation (C1) | `shipping-provider-shipstation` | API key + secret | Yes | Yes | Yes (proxied) | Multi-carrier simplicity, no USPS account |
| UPS Direct (C2) | `shipping-provider-ups` | OAuth 2.0 (form) | Yes | Yes | Yes | Direct UPS contracts |
| **USPS Direct (C3, this PRD)** | **`shipping-provider-usps`** | **OAuth 2.0 (JSON body)** | **Deferred** | **Yes** | **Yes (CASS)** | **USPS-heavy shippers, CASS address validation** |
| FedEx Direct (C4) | `shipping-provider-fedex` | OAuth 2.0 (form) | Yes | Yes | Yes | FedEx contract accounts |
| DHL Direct (C5) | `shipping-provider-dhl` | API key | Yes | Yes | No | International |

USPS is the third most common direct integration request after ShipStation and UPS. The adapter architecture is deliberately aligned with the UPS provider (C2) so the Pipeline (A7) can treat all providers uniformly via the B10 contract.

### 1.6 Current State & Audit History

The initial implementation lived inline in `convex/shipping/actions.ts` and was debugged through production against the USPS sandbox. Three audit fixes were applied and are baked into this PRD as requirements:

1. **Mandatory rate request fields.** Early versions sent only `originZIPCode`, `destinationZIPCode`, `weight`, `length`, `width`, `height`, and `mailClasses[]` and received `400 Bad Request` responses. USPS requires `processingCategory`, `rateIndicator`, and `destinationEntryFacilityType` on every rate request. Defaults are `"MACHINABLE"`, `"DR"` (Dimensional Rectangular), and `"NONE"` respectively.
2. **Authentication scope.** Early versions passed `accountType: "EPS"` and `accountNumber` on the rate request. Both are only valid for EPS-enrolled accounts; for normal business accounts they cause `403 Forbidden`. v1 omits them entirely. EPS support will be re-introduced with an account-type detection flag.
3. **Response parsing.** Early versions attempted to read a flat `prices[]` array on the response. The actual response shape is `data.rateOptions[].rates[]` — one `rateOption` per mail class family, each containing one or more `rates[]` entries. The adapter now flattens `rateOptions.flatMap(o => o.rates)` and uses `rate.description` for the display name with an internal mail-class → human-name fallback.

Additionally, package dimensions were being hardcoded at `0.1 × 0.1 × 0.1` inches when the A3 packaging solver did not supply dimensions, which caused USPS to price every shipment as if it were an empty envelope. Dimensions now default to `6 × 4 × 4` inches (a realistic small-parcel default) when A3 returns no box, and the adapter logs a warning when this default is used so merchants can configure their packages in A3.

---

## 2. Scope

### 2.1 In Scope (v1)

1. **OAuth 2.0 client-credentials flow** against `POST /oauth2/v3/token` with `Content-Type: application/json` and a JSON body `{ client_id, client_secret, grant_type: "client_credentials" }`.
2. **Token caching** — an in-memory Map plus a persisted `providerTokenCache` row keyed by `(provider, environment)`, with a 60-second refresh buffer before the USPS-reported `expires_in`.
3. **Rate shopping (domestic)** via `POST /prices/v3/base-rates-list/search` with all mandatory fields present (`processingCategory`, `rateIndicator`, `destinationEntryFacilityType`, `priceType`, `mailingDate`).
4. **Mail class enumeration** — `USPS_GROUND_ADVANTAGE`, `PRIORITY_MAIL`, `PRIORITY_MAIL_EXPRESS`, `PARCEL_SELECT`, `MEDIA_MAIL`, `LIBRARY_MAIL` by default, merchant-configurable.
5. **Response normalization** — flatten `rateOptions[].rates[]` into a single array of `RateQuote` objects conforming to B10's `RateQuote` schema.
6. **Tracking** via `GET /tracking/v3/tracking/{trackingNumber}?expand=DETAIL` with normalized status mapping (see Section 5.7).
7. **Address validation** via `POST /addresses/v3/address`, wired into the Address Validation System (PRD A5) as the USPS validator.
8. **Connection verification** via `GET /oauth2-oidc/v3/userinfo` after a fresh token mint.
9. **Sandbox / production environment switching** — configurable via `settings` per-deployment.
10. **Weight conversion** — the B10 contract exposes weight in pounds + ounces; USPS v3 expects decimal pounds. The adapter computes `weight = pounds + (ounces / 16)` and rounds to 2 decimals.
11. **Dimension normalization** — uses A3 package dimensions when available, defaults to `6 × 4 × 4` inches with a logged warning when A3 returns no box.
12. **Error normalization** — all USPS error shapes (`apiVersion + error[]`, `errors[]`, `fault.faultstring`) are translated to the B10 `ProviderError` shape.

### 2.2 Out of Scope (Deferred)

1. **Labels v3 integration.** Planned for a future iteration. Entry point is `POST /labels/v3/label` (eVS / Pay-on-Use). Requires:
   - Indicia account (EPS or permit imprint) on file with USPS.
   - Separate permission scopes on the OAuth token.
   - SCAN form generation via `POST /scan-forms/v3/scan-form` at end-of-day.
   - Label void via `DELETE /labels/v3/label/{labelId}` within 30 days of purchase.
   Until this ships, `purchaseLabel` returns `{ error: { code: "NOT_IMPLEMENTED", message: "USPS Labels v3 integration pending" } }` and the capability flag is `false`. The Pipeline (A7) routes label requests to other providers.
2. **International Prices v3.** Deferred. International rate requests against v1 return `{ error: { code: "UNSUPPORTED_DESTINATION" } }`.
3. **EPS / Negotiated / NSA rate support.** Deferred — requires `accountType` + `accountNumber` handling that currently breaks non-EPS accounts with 403. A future flag `uspsEpsAccountNumber` on `settings` will gate this.
4. **Pickups v3** (residential / business pickup scheduling).
5. **Container Labels** (pallet / tray labels for bulk-entry mailers).
6. **First-Class Mail letters / flats rating** — v1 supports parcel classes only.
7. **Informed Delivery API.**
8. **Return Labels (eVS Returns).** Ships with Labels v3.

### 2.3 Non-Goals (Never)

- **Not a replacement for ShipStation.** Merchants without USPS accounts continue using ShipStation.
- **No custom business logic inside this adapter.** Zone rules, surcharges, free-shipping cutoffs, and method availability all belong to the Pipeline (A7) and the Shipping Rules Engine (`shipping-rules-engine`).
- **No caching of rate responses.** Caching is the Pipeline's job.
- **No UI inside the adapter.** All UI lives in the `admin-settings-ui` Shipping Settings page.

---

## 3. Dependencies

### 3.1 Upstream PRDs (This Provider Consumes)

| PRD | System | What the USPS Provider Depends On |
|-----|--------|-----------------------------------|
| B10 | `shipping-method-live-rate` | The `LiveRateProvider` contract: `fetchRates`, `trackShipment`, `verifyConnection`, `validateAddress`, `purchaseLabel`, `voidLabel`, `syncAccounts`, `RateQuote`, `ProviderError`, capability flags. |
| A3 | `shipping-packages-system` | Package definitions (length/width/height/inner-weight) consumed when packing the cart. USPS Provider reads resolved package dims from A3 output. |
| A5 | `address-validation-system` | The Address Validation System calls this provider's `validateAddress` when USPS is the configured validator. |
| A7 | `rate-calculation-pipeline` | Invokes `fetchRates` during checkout rate calculation. Owns caching. Merges with other providers. |
| A6 | `shipping-rules-engine` | Applied **after** this provider returns rates — the adapter itself does not consult rules. |
| A4 | `shipping-packages-system` (packer) | Determines which of A3's packages are used for a given cart; passes packed dims/weight to the adapter. |

### 3.2 ConvexPress Core Dependencies

| System | Doc | Role |
|--------|-----|------|
| Auth System | `.claude/docs/AUTH-SYSTEM.md` | `getCurrentUser`, `requireCan` on admin mutations that write USPS credentials. |
| Role & Capability System | `.claude/docs/ROLE-CAPABILITY-SYSTEM.md` | Capabilities `admin.shipping.providers.manage`, `admin.shipping.providers.view`. |
| Settings System | `.claude/docs/SETTINGS-SYSTEM.md` | Stores USPS `clientId`, `clientSecret`, environment, and default mail classes. Settings-first pattern: DB fallback to env. |
| Event Dispatcher | `.claude/docs/EVENT-DISPATCHER-SYSTEM.md` | Emits provider events (`shipping.provider.verified`, `shipping.rates.fetched`, etc.) via `emitEvent`. |
| Audit Log System | `.claude/docs/AUDIT-LOG-SYSTEM.md` | Logs every credential change and connection verification attempt. |
| API System | `.claude/docs/API-SYSTEM.md` | Rate-limits outbound USPS API calls per-deployment. |

### 3.3 External Dependencies

| External | Usage | Rate Limits |
|----------|-------|-------------|
| USPS APIs v3 (`apis.usps.com`) | Production traffic. | USPS does not publish hard quotas; documented guidance is "reasonable use". Adapter self-throttles at 10 req/s. |
| USPS APIs v3 Sandbox (`apis-tem.usps.com`) | Sandbox traffic for verification and automated tests. | Shared with prod quota; sandbox data is not authoritative. |
| USPS Developer Portal (`developer.usps.com`) | Where merchants obtain `clientId` / `clientSecret` and select API scopes. | N/A |

---

## 4. Schema

### 4.1 Reuse of Provider Tables

This system introduces **no new tables**. It reuses the shared provider tables defined by the Live Rate contract (B10) with `provider = "usps"`:

- `shippingProviders` — one row per `(deploymentId, provider)`. USPS row stores `clientId`, encrypted `clientSecret`, `environment`, `enabled`, capability flags, last verified timestamp.
- `shippingProviderTokenCache` — one row per `(provider, environment)`. Stores `accessToken`, `expiresAt`, `scope`, `tokenType`.
- `shippingProviderAccounts` — N/A for USPS v1 (no EPS account enumeration yet).
- `shippingLogs` — every outbound USPS call writes a log row (`rates`, `tracking`, `validate`, `verify`) with latency and HTTP status.

All these tables are defined in the Live Rate schema module (`convex/schema/shippingProviders.ts`) and are not re-declared here.

### 4.2 USPS-Specific Settings Keys

The Settings System (PRD settings-system) stores USPS configuration under these keys (all under `shipping.providers.usps.*`):

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `shipping.providers.usps.enabled` | boolean | `false` | Master enable flag. |
| `shipping.providers.usps.environment` | `"sandbox" \| "production"` | `"sandbox"` | Which USPS base URL to hit. |
| `shipping.providers.usps.clientId` | string | `""` | USPS OAuth client ID. |
| `shipping.providers.usps.clientSecret` | string (encrypted at rest) | `""` | USPS OAuth client secret. |
| `shipping.providers.usps.defaultMailClasses` | string[] | `["USPS_GROUND_ADVANTAGE", "PRIORITY_MAIL"]` | Mail classes quoted by default. |
| `shipping.providers.usps.defaultProcessingCategory` | string | `"MACHINABLE"` | Default processing category. |
| `shipping.providers.usps.defaultRateIndicator` | string | `"DR"` | Default rate indicator (DR = Dimensional Rectangular). |
| `shipping.providers.usps.defaultDestinationEntryFacilityType` | string | `"NONE"` | Default destination entry facility. |
| `shipping.providers.usps.defaultPriceType` | string | `"COMMERCIAL"` | Price type (COMMERCIAL or RETAIL). |
| `shipping.providers.usps.lastVerifiedAt` | number (epoch ms) | `null` | Last successful connection verification. |
| `shipping.providers.usps.lastVerificationError` | string \| null | `null` | Last verification error message (for admin UI display). |

Secret fields (`clientSecret`) are encrypted using the same mechanism UPS and ShipStation providers use (referenced in PRD B10 §4.3). The Settings System returns `"***"` for masked secret reads in queries.

### 4.3 Capability Flags

The USPS row in `shippingProviders` sets:

| Capability | Value (v1) | Notes |
|------------|------------|-------|
| `rates` | `true` | Domestic Prices v3. |
| `labels` | `false` | Deferred until Labels v3 integration. |
| `tracking` | `true` | Tracking v3. |
| `address_validation` | `true` | Addresses v3, CASS certified. |
| `void` | `false` | Ships with Labels. |
| `pickup_scheduling` | `false` | Out of scope v1. |
| `international_rates` | `false` | Out of scope v1. |
| `negotiated_rates` | `false` | Requires EPS; deferred. |

Capability flags are **the source of truth** the Pipeline (A7) consults before calling a method. A method guarded by a `false` capability is never called — the adapter does not need to defensively check.

---

## 5. Data Model

### 5.1 Authentication Model

USPS APIs v3 use OAuth 2.0 client-credentials grant. The critical difference from UPS and FedEx:

- **USPS sends `Content-Type: application/json` with a JSON body.**
- **UPS/FedEx use `Content-Type: application/x-www-form-urlencoded` with a form body.**

Getting this wrong yields a `400 invalid_request` from USPS. The token request body is:

```
{
  "client_id": "<merchant clientId>",
  "client_secret": "<merchant clientSecret>",
  "grant_type": "client_credentials"
}
```

Successful response:

```
{
  "access_token": "eyJhbGci...",
  "token_type": "Bearer",
  "expires_in": 28799,
  "scope": "prices addresses tracking labels"
}
```

The `scope` value is the set of scopes USPS has provisioned for the merchant's app on the Developer Portal. Rate / tracking / address-validation calls will `403` if their respective scopes are absent. Verification surfaces this clearly to the admin.

### 5.2 Base URLs

| Environment | Base URL |
|-------------|----------|
| Production | `https://apis.usps.com` |
| Sandbox | `https://apis-tem.usps.com` |

All endpoints below are relative to the active base URL. Environment is selected from settings at call time so a single deployment can switch without redeploying code.

### 5.3 Endpoint Map

| Capability | Method | Path |
|------------|--------|------|
| Token mint | `POST` | `/oauth2/v3/token` |
| Token introspect (used for verification) | `GET` | `/oauth2-oidc/v3/userinfo` |
| Domestic rates | `POST` | `/prices/v3/base-rates-list/search` |
| Tracking (detail) | `GET` | `/tracking/v3/tracking/{trackingNumber}?expand=DETAIL` |
| Address validation | `POST` | `/addresses/v3/address` |

### 5.4 Rate Request Shape (Domestic Prices v3)

The adapter's internal TypeScript shape for an outgoing rate request (pre-serialization):

```
type USPSRateRequest = {
  originZIPCode: string;              // 5-digit origin ZIP
  destinationZIPCode: string;         // 5-digit destination ZIP
  weight: number;                     // decimal pounds (e.g. 1.5 = 1 lb 8 oz)
  length: number;                     // inches
  width: number;                      // inches
  height: number;                     // inches
  mailClasses: Array<
    | "USPS_GROUND_ADVANTAGE"
    | "PRIORITY_MAIL"
    | "PRIORITY_MAIL_EXPRESS"
    | "PARCEL_SELECT"
    | "MEDIA_MAIL"
    | "LIBRARY_MAIL"
  >;
  processingCategory: "MACHINABLE" | "NON_MACHINABLE" | "LETTERS" | "FLATS";
  rateIndicator: "DR" | "SP" | "FR" | /* ...USPS enum */ string;
  destinationEntryFacilityType: "NONE" | "DESTINATION_NETWORK_DISTRIBUTION_CENTER"
                               | "DESTINATION_SECTIONAL_CENTER_FACILITY"
                               | "DESTINATION_DELIVERY_UNIT";
  priceType: "COMMERCIAL" | "RETAIL";
  mailingDate: string;                // ISO "YYYY-MM-DD"
};
```

**Critical:** missing any of `processingCategory`, `rateIndicator`, or `destinationEntryFacilityType` produces `400 Bad Request`. The Domestic Prices v3 spec lists these as optional in places, but they are not in practice — they were the root cause of early pre-audit failures.

**Not sent on normal accounts:** `accountType`, `accountNumber`. These are only valid for merchants with Enterprise Payment System (EPS) enrollment. Sending them for non-EPS accounts yields `403 Forbidden`. EPS support is deferred (Section 2.2).

### 5.5 Rate Response Shape

```
type USPSRateResponse = {
  rateOptions: Array<{
    totalBasePrice: number;
    totalPrice: number;
    rates: Array<{
      description: string;           // "USPS Ground Advantage Machinable Dimensional Rectangular" etc.
      priceType: "COMMERCIAL" | "RETAIL";
      price: number;                 // in USD
      mailClass: string;             // "USPS_GROUND_ADVANTAGE", etc.
      zone: string | null;
      weight: number;
      dimWeight: number | null;
      fees: Array<{ name: string; price: number }>;
      startDate: string;
      endDate: string;
      warnings: string[] | null;
      SKU: string;
    }>;
    extraServices: unknown[];
  }>;
};
```

The adapter flattens with `rateOptions.flatMap(o => o.rates)` and produces one `RateQuote` per inner rate.

### 5.6 RateQuote Normalization (B10 Contract)

Each flattened USPS `rate` becomes one B10 `RateQuote`:

```
type RateQuote = {
  provider: "usps";
  serviceCode: string;         // USPS mail class, e.g. "USPS_GROUND_ADVANTAGE"
  serviceName: string;         // rate.description (audit fix) OR internal fallback
  currency: "USD";
  totalCharge: number;         // rate.price
  transitDays: number | null;  // derived from mailClass when USPS doesn't return it
  guaranteedDelivery: boolean; // true for PRIORITY_MAIL_EXPRESS only
  deliveryDate: string | null; // ISO, if USPS returns startDate/endDate
  surcharges: Array<{ name: string; amount: number }>; // from rate.fees[]
  warnings: string[];          // rate.warnings[]
  rawResponseId: string;       // id of shippingLogs row for debugging
};
```

The internal mail-class → service-name fallback (used only when `rate.description` is empty):

| `mailClass` | Fallback `serviceName` |
|-------------|------------------------|
| `USPS_GROUND_ADVANTAGE` | USPS Ground Advantage |
| `PRIORITY_MAIL` | USPS Priority Mail |
| `PRIORITY_MAIL_EXPRESS` | USPS Priority Mail Express |
| `PARCEL_SELECT` | USPS Parcel Select |
| `MEDIA_MAIL` | USPS Media Mail |
| `LIBRARY_MAIL` | USPS Library Mail |

### 5.7 Tracking Response & Status Normalization

The adapter calls `GET /tracking/v3/tracking/{trackingNumber}?expand=DETAIL` and normalizes to B10's `TrackingSnapshot`:

```
type TrackingSnapshot = {
  trackingNumber: string;
  status: "UNKNOWN" | "PRE_TRANSIT" | "IN_TRANSIT" | "OUT_FOR_DELIVERY"
        | "DELIVERED" | "RETURNED" | "FAILURE" | "ALERT";
  statusDetail: string;         // verbatim USPS summary
  estimatedDelivery: string | null;
  carrierLastUpdated: string;
  events: Array<{
    timestamp: string;
    location: string;
    description: string;
    code: string;               // USPS event type code
  }>;
};
```

Status mapping (partial — full table in the adapter):

| USPS `eventType` / `statusCategory` | Normalized `status` |
|-------------------------------------|---------------------|
| `Pre-Shipment` | `PRE_TRANSIT` |
| `Accepted`, `Acceptance`, `Departed` | `IN_TRANSIT` |
| `In Transit`, `Arrived at Unit`, `USPS In Possession` | `IN_TRANSIT` |
| `Out for Delivery` | `OUT_FOR_DELIVERY` |
| `Delivered` | `DELIVERED` |
| `Return to Sender`, `Forwarded` | `RETURNED` |
| `Delivery Attempted`, `Notice Left`, `Delivery Exception` | `ALERT` |
| `Undeliverable`, `Refused` | `FAILURE` |
| (anything else) | `UNKNOWN` |

### 5.8 Address Validation Response

Normalized to the `address-validation-system` (A5) contract:

```
type AddressValidationResult = {
  valid: boolean;
  standardized: {
    streetAddress: string;
    secondaryAddress: string | null;
    city: string;
    state: string;
    zipCode: string;
    zipPlus4: string | null;
    urbanization: string | null;
  } | null;
  deliverability: {
    dpvConfirmation: "Y" | "D" | "S" | "N" | null;
    vacant: boolean;
    missing: boolean;
    businessOrResidential: "B" | "R" | null;
  };
  warnings: string[];
  errors: string[];
};
```

### 5.9 Weight Conversion

The B10 contract provides weights in `{ pounds: number, ounces: number }` (integers). USPS expects decimal pounds:

```
const weight = pounds + (ounces / 16);
// rounded to 2 decimals for wire format
const wireWeight = Math.round(weight * 100) / 100;
```

When input comes as total-ounces from A3 package output, the conversion is:
```
const pounds = Math.floor(totalOunces / 16);
const ounces = totalOunces % 16;
const weight = pounds + (ounces / 16);
```

A minimum weight of `0.01` lb (≈ 0.16 oz) is enforced — USPS rejects `weight = 0`.

### 5.10 Dimension Normalization

Resolved in this order:

1. **A3 package dimensions** (preferred). The packer outputs `length`, `width`, `height` in inches from the chosen `shippingPackages` row.
2. **Item-dims fallback.** If A3 did not run (degenerate single-item cart), use item `length`/`width`/`height` from the product.
3. **Default `6 × 4 × 4` inches.** When neither of the above yields numbers, default to a realistic small-parcel box. The adapter writes a `shippingLogs` row with `warning: "DIMS_DEFAULTED"` so merchants see that they should configure A3 packages.

Dimensions of `0.1 × 0.1 × 0.1` (the pre-audit default) are **banned** and must not be reintroduced — they cause USPS to price every shipment as an empty envelope.

---

## 6. Functions / API

All functions are Convex actions (they call external HTTP) in `convex/shipping/providers/usps.ts`, plus internal helpers in `convex/shipping/providers/usps/tokenCache.ts`. They are invoked via `internalAction` by the Pipeline (A7) and `action` by admin UI verify/test flows.

### 6.1 Token Cache Helpers (`usps/tokenCache.ts`)

```
// Internal helpers — not exported to Convex clients.

async function getAccessToken(ctx, opts: {
  environment: "sandbox" | "production";
  clientId: string;
  clientSecret: string;
  forceRefresh?: boolean;
}): Promise<{ accessToken: string; expiresAt: number; scope: string }>;

async function cacheAccessToken(ctx, environment, token): Promise<void>;
async function invalidateAccessToken(ctx, environment): Promise<void>;
```

Behavior:

- In-memory Map keyed by `environment` holds the current token within a single action invocation.
- Persisted cache in `shippingProviderTokenCache` row keyed by `(provider="usps", environment)`.
- Refresh buffer: if `expiresAt - now < 60_000 ms`, mint a new token.
- `forceRefresh` bypasses cache — used by `verifyConnection` to ensure credentials are actually valid and not just that an old token still works.

### 6.2 `fetchRates`

```
export const fetchRates = internalAction({
  args: {
    shipment: shipmentValidator,     // from B10 validators
    merchantAccountId: v.optional(v.id("shippingProviderAccounts")),
  },
  handler: async (ctx, { shipment }): Promise<FetchRatesResult> => { ... }
});

type FetchRatesResult =
  | { ok: true; rates: RateQuote[]; logId: Id<"shippingLogs"> }
  | { ok: false; error: ProviderError; logId: Id<"shippingLogs"> };
```

Implementation outline:

1. Read settings (`clientId`, `clientSecret`, `environment`, defaults). Return `ProviderError("NOT_CONFIGURED")` if missing.
2. Mint / retrieve access token via `getAccessToken`.
3. Build `USPSRateRequest` per Section 5.4 — fill mandatory fields, convert weight, resolve dimensions.
4. `POST /prices/v3/base-rates-list/search` with `Authorization: Bearer <token>`, `Content-Type: application/json`, `X-User-Id` (deployment ID for USPS throttle attribution).
5. On `401`: invalidate token cache, retry once.
6. On `400/403`: parse USPS error body, map to `ProviderError`, return.
7. On `200`: flatten `data.rateOptions[].rates[]`, build `RateQuote[]`.
8. Write `shippingLogs` row (request, response, latency). Return `{ ok: true, rates, logId }`.
9. Emit `shipping.rates.fetched` event (B10).

### 6.3 `trackShipment`

```
export const trackShipment = internalAction({
  args: { trackingNumber: v.string() },
  handler: async (ctx, { trackingNumber }): Promise<TrackShipmentResult> => { ... }
});
```

Implementation outline:

1. Validate tracking number format (20-22 digits, or USS128 for Priority Express). Reject obviously-wrong inputs locally.
2. Retrieve access token.
3. `GET /tracking/v3/tracking/{trackingNumber}?expand=DETAIL`.
4. On `404`: return `{ ok: true, snapshot: { status: "UNKNOWN", statusDetail: "Tracking not yet available" } }` — USPS returns 404 for tracking numbers not yet scanned; this is expected for labels purchased but not handed to USPS yet.
5. On `200`: map `eventType` → normalized `status`, build `TrackingSnapshot`.
6. Emit `shipping.tracking.updated` event.

### 6.4 `verifyConnection`

```
export const verifyConnection = action({
  args: {},
  handler: async (ctx): Promise<VerifyConnectionResult> => { ... }
});

type VerifyConnectionResult =
  | { ok: true; scopes: string[]; environment: "sandbox" | "production" }
  | { ok: false; error: ProviderError; step: "credentials" | "token" | "scope" };
```

Implementation outline:

1. Read settings. Return `step: "credentials"` if missing.
2. Force-refresh access token. Return `step: "token"` with parsed USPS error on failure.
3. `GET /oauth2-oidc/v3/userinfo` to confirm the token is live and observe granted scopes.
4. Confirm the required scopes are present: `prices` (rates), `tracking` (tracking), `addresses` (address validation). Labels scope check is deferred.
5. Persist `lastVerifiedAt = now` and `lastVerificationError = null` on success, the inverse on failure.
6. Emit `shipping.provider.verified` or `shipping.provider.verification_failed` event.

### 6.5 `validateAddress`

```
export const validateAddress = internalAction({
  args: { address: addressValidator },
  handler: async (ctx, { address }): Promise<AddressValidationResult> => { ... }
});
```

Implementation outline:

1. Retrieve access token.
2. `POST /addresses/v3/address` with streetAddress, secondaryAddress, city, state, ZIPCode.
3. Map response (`additionalInfo.DPVConfirmation`, `.vacant`, `.businessResidentialIndicator`, etc.) to the A5 `AddressValidationResult` shape (Section 5.8).
4. On `400` ("address cannot be standardized") → `{ valid: false, errors: [...] }`.
5. On `200` + DPV `"Y"` or `"S"` → `{ valid: true, standardized: {...} }`.
6. Emit `shipping.address.validated` event via A5.

### 6.6 `purchaseLabel` (Deferred Stub)

```
export const purchaseLabel = internalAction({
  args: { ... standard B10 args ... },
  handler: async (ctx, args) => ({
    ok: false as const,
    error: {
      code: "NOT_IMPLEMENTED" as const,
      message: "USPS Labels v3 integration pending",
      retryable: false,
    },
  }),
});
```

Registered in the provider manifest as unavailable. Pipeline (A7) skips it because the capability flag `labels` is `false`.

### 6.7 `voidLabel` (Deferred Stub)

Same pattern as `purchaseLabel`. Returns `NOT_IMPLEMENTED`.

### 6.8 `syncAccounts` (Minimal Implementation)

v1 returns a single synthetic account row derived from the OAuth userinfo response — there is no USPS "account list" endpoint equivalent to UPS's. The adapter persists `{ accountNumber: null, accountAlias: "USPS Account", capabilities: {...} }` so the UI has a row to show.

### 6.9 Error Normalization

USPS error responses come in multiple shapes:

```
// Shape A — OAuth errors
{ "error": "invalid_client", "error_description": "..." }

// Shape B — API errors (most common)
{ "apiVersion": "v3", "error": [{ "code": "...", "message": "..." }] }

// Shape C — Validation errors
{ "errors": [{ "field": "originZIPCode", "message": "..." }] }

// Shape D — Tracking 404
{ "error": { "code": "PRE_SHIPMENT", "message": "..." } }
```

All shapes are normalized to B10's `ProviderError`:

```
type ProviderError = {
  code: "NOT_CONFIGURED" | "AUTH_FAILED" | "INVALID_REQUEST" | "FORBIDDEN"
      | "NOT_FOUND" | "RATE_LIMITED" | "UPSTREAM_ERROR" | "NETWORK_ERROR"
      | "NOT_IMPLEMENTED" | "UNSUPPORTED_DESTINATION";
  message: string;             // human-readable; surfaced in admin UI
  retryable: boolean;
  upstreamStatus?: number;
  upstreamBody?: string;       // redacted of secrets; logged in shippingLogs
};
```

HTTP status → `ProviderError.code`:
- `400` → `INVALID_REQUEST`
- `401` → `AUTH_FAILED` (retryable once after token invalidation)
- `403` → `FORBIDDEN` (often a scope issue)
- `404` → `NOT_FOUND`
- `429` → `RATE_LIMITED` (retryable with backoff)
- `5xx` → `UPSTREAM_ERROR` (retryable with backoff)
- Network failures → `NETWORK_ERROR` (retryable)

---

## 7. Admin UX

The USPS Provider lives inside the existing Shipping Settings page (owned by `admin-settings-ui` and the Settings System). The `shipping-provider-usps` PRD does not define new page chrome; it defines the section that appears when "Add Provider → USPS" is chosen.

### 7.1 Provider Settings Card

A WordPress-style settings card with the following fields:

| Field | Control | Validation |
|-------|---------|------------|
| Enabled | Toggle | Requires verified connection before turning on. |
| Environment | Segmented (`Sandbox` / `Production`) | Changing invalidates the token cache and marks the provider unverified. |
| Client ID | Text input | Required for verification. |
| Client Secret | Password input (masked) | Stored encrypted. Displayed as `***` after save. |
| Default Mail Classes | Multi-select chips | Defaults: Ground Advantage + Priority Mail. |
| Default Processing Category | Select (MACHINABLE / NON_MACHINABLE / LETTERS / FLATS) | Defaults: MACHINABLE. |
| Default Rate Indicator | Select (DR, SP, FR, ...) | Defaults: DR. |
| Default Destination Entry Facility Type | Select (NONE / DNDC / DSCF / DDU) | Defaults: NONE. |
| Default Price Type | Select (COMMERCIAL / RETAIL) | Defaults: COMMERCIAL. |

Below the card, three action buttons:

- **Verify Connection** → calls `verifyConnection`, displays result inline (green checkmark + scopes list on success; red X + parsed USPS error message on failure, with the failing `step`).
- **Test Rates** → opens an inline drawer that collects `originZIP`, `destinationZIP`, weight, and dimensions, calls `fetchRates`, and shows the returned `RateQuote[]` in a simple table for debugging.
- **View Logs** → opens a filtered view of `shippingLogs` rows with `provider = "usps"`.

### 7.2 Capability Display

A read-only block below the form shows the provider's capability flags as green/gray badges so merchants understand what USPS-via-this-adapter supports today:

- `Rates` — Live
- `Tracking` — Live
- `Address Validation` — Live
- `Labels` — Pending (tooltip: "USPS Labels v3 integration coming soon. Use ShipStation or UPS for USPS labels today.")

### 7.3 Event / Audit Surfaces

- Every credential save writes an audit log entry (`shipping.provider.credentials_updated`).
- Every connection verification writes an audit entry (`shipping.provider.verified` or `shipping.provider.verification_failed`) with the user who initiated it.
- The provider row's last verification timestamp is shown in the card header.

### 7.4 Error Surfaces

When `verifyConnection` fails, the admin UI must show the parsed error with actionable text:

- `AUTH_FAILED` → "Client ID or Client Secret is incorrect. Re-check on the USPS Developer Portal."
- `FORBIDDEN` + missing scope → "Your USPS app is missing the `{scope}` scope. Edit the app on developer.usps.com and re-add it."
- `INVALID_REQUEST` → show parsed USPS error body verbatim (dev-facing).
- `NETWORK_ERROR` → "Couldn't reach USPS. Try again in a minute."

No automatic retry loop runs in the UI — verification is single-attempt by design. The Pipeline handles retries on actual rate fetches.

---

## 8. Merchant Workflow

### 8.1 Onboarding (Happy Path)

1. Merchant navigates to **Admin → Settings → Shipping → Providers → Add Provider → USPS**.
2. Follow "Get Credentials" link → USPS Developer Portal (`developer.usps.com`) → create app → select scopes `prices`, `tracking`, `addresses` → copy Client ID + Client Secret.
3. Paste into ConvexPress admin card, leave environment on `Sandbox`.
4. Click **Verify Connection** — expect green check with scopes listed.
5. Click **Test Rates** with a known ZIP pair + weight — confirm rates return.
6. Switch environment to `Production`, re-enter production credentials (different than sandbox), re-verify.
7. Toggle **Enabled** → provider is now registered with the Pipeline (A7) and will quote on live checkouts.

### 8.2 Configuring Mail Classes

The merchant picks which USPS services to quote. Default is Ground Advantage + Priority Mail. A small merchant selling media might add Media Mail. An expedited-focused merchant might add Priority Mail Express. Each selected class is sent on every rate request; the Pipeline shows the returned rates at checkout (subject to any B12 method availability rules).

### 8.3 Combining With Other Providers

Merchants commonly run USPS direct alongside:

- **ShipStation (C1)** — for the label flow until Labels v3 ships.
- **UPS Direct (C2)** — for UPS Ground and higher-service expedited.
- **Local pickup / free shipping** — method-level (B-series) providers.

The Pipeline (A7) merges quotes from all enabled providers and presents the best rate per service class at checkout, subject to the rules engine (A6).

### 8.4 Troubleshooting

Merchant-visible diagnostics via the **View Logs** button:

- Each row shows endpoint, HTTP status, latency, request summary, response summary.
- Failed rows are highlighted red.
- A built-in "Copy as cURL" button helps merchants reproduce an issue against sandbox when opening a USPS support ticket.

### 8.5 Rotating Credentials

1. Create a new app on the USPS Developer Portal (or rotate the existing app's secret).
2. Update Client ID / Client Secret in admin card.
3. Click **Verify Connection** — the old token cache is invalidated automatically on credential save; the next verification mints a fresh token against the new credentials.

---

## 9. Storefront UX

The storefront never calls USPS directly. Customer-visible touchpoints:

### 9.1 Checkout Rate Display

When USPS is enabled and returns rates, the checkout shipping step shows USPS services alongside any other provider's services. Each row renders:

- **Service name** — `RateQuote.serviceName` (USPS Ground Advantage, USPS Priority Mail, etc.)
- **Price** — `RateQuote.totalCharge`
- **Transit estimate** — derived from `mailClass`:
  - `USPS_GROUND_ADVANTAGE` — "2–5 business days"
  - `PRIORITY_MAIL` — "1–3 business days"
  - `PRIORITY_MAIL_EXPRESS` — "1–2 business days, guaranteed"
  - `MEDIA_MAIL` — "2–8 business days"
  - `PARCEL_SELECT` — "2–9 business days"
- **Badge** — "Guaranteed" only on Priority Mail Express.

The admin can rename services via an overlay map in the Shipping Rules Engine (A6) without touching the provider.

### 9.2 Address Entry

When USPS is the configured address validator (A5), entering a shipping address triggers CASS validation against `POST /addresses/v3/address`. The storefront shows:

- Suggested standardized address if different from input.
- "Address not deliverable" warning on DPV `"N"`.
- Silent standardization on DPV `"Y"`.

### 9.3 Tracking Pages

Customer-facing order tracking renders the normalized `TrackingSnapshot` (Section 5.7). No USPS-specific UX lives here — the snapshot is provider-agnostic.

### 9.4 Fallback Behavior

If the Pipeline cannot reach USPS (network error, USPS outage, missing credentials), the storefront does not show USPS rates. Other providers (if configured) still show their rates. If no provider returns rates, the checkout falls back to configured flat-rate / free-shipping methods (B-series) per the Pipeline's cascade rules (A7 §7).

---

## 10. Edge Cases

### 10.1 OAuth Token Body Format Differs From UPS

**Symptom:** `400 invalid_request` from `/oauth2/v3/token` when sending a form-encoded body.
**Cause:** USPS v3 expects `Content-Type: application/json` with a JSON body. UPS expects `application/x-www-form-urlencoded`. Copy-pasting the UPS adapter's token code breaks.
**Fix:** JSON body per Section 5.1. This is baked into `usps/tokenCache.ts` and must not regress.

### 10.2 Rate Request Missing Mandatory Fields

**Symptom:** `400 Bad Request` from `/prices/v3/base-rates-list/search` with a message about `processingCategory` / `rateIndicator` / `destinationEntryFacilityType`.
**Cause:** These three fields are documented as optional in places but are mandatory in practice. Missing any of them yields 400.
**Fix:** Always send them, using settings defaults (`MACHINABLE` / `DR` / `NONE`). Audit fix. Regression test required.

### 10.3 403 On `accountType` / `accountNumber`

**Symptom:** `403 Forbidden` on rate requests when `accountType: "EPS"` and `accountNumber: "..."` are present.
**Cause:** EPS-only fields. Most merchants do not have EPS enrollment.
**Fix:** Do not send these fields in v1. When EPS support is added, it must be explicitly opted-in via a `uspsEpsAccountNumber` setting and requires a separate account-type detection step.

### 10.4 Response Shape Is Not Flat

**Symptom:** Empty rate array despite USPS returning 200 OK.
**Cause:** Early code read `data.prices[]`. The actual response is `data.rateOptions[].rates[]`.
**Fix:** `rateOptions.flatMap(o => o.rates)`. Baked into adapter. Audit fix.

### 10.5 Zero Dimensions Produce Junk Prices

**Symptom:** Every rate is $4.35 regardless of item size.
**Cause:** Default dimensions of `0.1 × 0.1 × 0.1` made USPS price every shipment as an empty envelope.
**Fix:** When A3 returns no box, default to `6 × 4 × 4` inches and log a warning. `0.1 × 0.1 × 0.1` is banned.

### 10.6 Tracking 404 For Labels Not Yet Handed Off

**Symptom:** `GET /tracking/v3/tracking/{n}?expand=DETAIL` → 404.
**Cause:** USPS has not scanned the package yet (common for labels bought but still sitting on the merchant's desk).
**Fix:** Return `{ ok: true, snapshot: { status: "UNKNOWN", statusDetail: "Tracking not yet available" } }`. Do not surface as an error to the customer.

### 10.7 Weight Below Minimum

**Symptom:** USPS `400` with "weight must be > 0".
**Cause:** A3 returned a near-zero weight for a digital-like oddball product.
**Fix:** Floor weight at `0.01` lb before sending.

### 10.8 ZIP Code Formatting

**Symptom:** USPS rejects `"94107-1234"` on `originZIPCode`.
**Cause:** The rate endpoint wants 5-digit ZIPs, not ZIP+4.
**Fix:** Strip to first 5 chars before sending. The Addresses v3 endpoint **does** accept ZIP+4 — do not strip there.

### 10.9 Non-US Destination Sent To Domestic Endpoint

**Symptom:** USPS `400` or nonsensical rates.
**Cause:** International shipment routed to `base-rates-list/search` instead of the intl endpoint (deferred).
**Fix:** Adapter short-circuits with `ProviderError("UNSUPPORTED_DESTINATION")` when destination country ≠ `"US"` and `"PR"` / `"VI"` / APO/FPO/DPO ZIPs.

### 10.10 Token Expiry Mid-Burst

**Symptom:** 401 on the Nth rate call of a burst (e.g., a bulk admin test).
**Cause:** Token expired during the burst.
**Fix:** On 401, invalidate token cache and retry once. If the retry also 401s, return `AUTH_FAILED`.

### 10.11 USPS Outage

**Symptom:** 5xx responses or timeouts for an extended window.
**Cause:** USPS upstream outage.
**Fix:** Return `UPSTREAM_ERROR(retryable: true)`. The Pipeline (A7) applies exponential backoff with a circuit breaker (see A7 §9). When open, the provider is skipped and other providers still quote.

### 10.12 Scope Drift

**Symptom:** Rates work but tracking doesn't (or vice versa).
**Cause:** Merchant's USPS app has only a subset of required scopes.
**Fix:** `verifyConnection` probes `/oauth2-oidc/v3/userinfo` and reports missing scopes. Admin UI guides the merchant to add them.

### 10.13 Sandbox Rates Are Not Authoritative

**Symptom:** Sandbox returns wildly different prices from production.
**Cause:** USPS sandbox data is synthetic.
**Fix:** Merchants are instructed in the admin UI to re-verify against production before enabling the provider for live checkout.

### 10.14 Response `rate.description` Missing

**Symptom:** Blank service name on checkout.
**Cause:** Older sandbox responses occasionally omit `description`.
**Fix:** Fall back to the internal mail-class → human-name map (Section 5.6). Audit fix.

### 10.15 Clock Skew Causing Early Token Expiry

**Symptom:** Intermittent 401s despite apparent cache hit.
**Cause:** Server clock skewed vs USPS.
**Fix:** 60-second refresh buffer in `usps/tokenCache.ts`; any server more than 60 seconds skewed gets a fresh token per call, which still works.

### 10.16 `mailingDate` In The Past

**Symptom:** USPS `400` if `mailingDate` is more than 1 day in the past.
**Cause:** Cached / stale checkout.
**Fix:** Always compute `mailingDate = today's date in America/New_York` at request time.

---

## 11. Testing Requirements

### 11.1 Unit Tests

Co-located in `convex/shipping/providers/__tests__/usps.test.ts`:

1. **Token body format** — confirms JSON body, not form-encoded.
2. **Rate request shape** — asserts all mandatory fields present, no EPS fields sent.
3. **Response flatten** — given a fixture with multiple `rateOptions`, produces the expected `RateQuote[]` count.
4. **Service name fallback** — fixture with empty `rate.description` uses internal map.
5. **Weight conversion** — `{pounds: 1, ounces: 8}` → `1.5`; `{pounds: 0, ounces: 0}` floors to `0.01`.
6. **Dimension defaulting** — no A3 dims → `6 × 4 × 4` + warning log.
7. **ZIP normalization** — `"94107-1234"` → `"94107"` on rate requests.
8. **International short-circuit** — destination `"CA"` returns `UNSUPPORTED_DESTINATION` without hitting USPS.
9. **Error normalization** — each USPS error shape (A/B/C/D from Section 6.9) maps to the correct `ProviderError.code`.
10. **Status mapping** — every row of the Section 5.7 table asserts the expected normalized status.
11. **Capability flags** — exported provider manifest has `labels: false`, others `true`.
12. **Label stub** — `purchaseLabel` returns `NOT_IMPLEMENTED`.

### 11.2 Integration Tests (Sandbox)

Gated by `USPS_SANDBOX_TESTS=1` environment variable, using sandbox credentials provisioned for CI. Each test has a backoff + 60s budget:

1. **`verifyConnection`** — real token mint + userinfo probe.
2. **`fetchRates`** — known ZIP pair (e.g., `94107` → `10001`), 2 lb, `6×4×4`, default classes. Asserts at least `USPS_GROUND_ADVANTAGE` rate returned and `rate.description` is a non-empty string.
3. **`trackShipment`** — a sandbox tracking number known to return `DELIVERED`. Assert normalized status.
4. **`validateAddress`** — a known-good USPS HQ address. Assert `valid: true` and DPV `"Y"`.
5. **Negative auth** — bogus client ID yields `AUTH_FAILED`.
6. **Negative request** — missing `processingCategory` (temporarily) yields `INVALID_REQUEST` with USPS's field message preserved.

### 11.3 Contract Tests (B10)

The USPS provider is registered in the B10 provider-contract test harness. Every B10 contract check runs against this adapter with sandbox credentials:

1. `provider.capabilities` matches the published flags.
2. `fetchRates` returns B10-shaped `RateQuote[]` with valid currency, positive `totalCharge`, unique `(provider, serviceCode)` per quote.
3. `trackShipment` for a never-used tracking number returns `status: "UNKNOWN"`, not an error.
4. Every entry point emits the B10-mandated event on success and failure.

### 11.4 Regression Tests (Audit Fixes)

Dedicated tests guard against regression of the three audit fixes:

1. **Mandatory fields test** — snapshot of the outgoing request body must include `processingCategory`, `rateIndicator`, `destinationEntryFacilityType`.
2. **No EPS fields test** — snapshot must not contain `accountType` or `accountNumber`.
3. **Response parsing test** — fixture has both `rateOptions[].rates[]` and a legacy `prices[]` key. Adapter must read from `rateOptions`.

### 11.5 Security Tests

1. `clientSecret` is never logged in plaintext (neither request logs nor error bodies).
2. Access token is never exposed via queries to clients.
3. Rate-limiter prevents > 10 req/s outbound per deployment.
4. Admin UI mutations require capability `admin.shipping.providers.manage`.

### 11.6 Manual QA Checklist

Before cutting a release:

- [ ] Connection verifies in both sandbox and production.
- [ ] Test Rates drawer returns > 0 rates for a known ZIP pair.
- [ ] Enabling the provider causes rates to appear at storefront checkout.
- [ ] Disabling the provider causes rates to disappear at checkout.
- [ ] Address validation rejects a known-bad address and suggests standardization for a known-good one.
- [ ] Tracking a real USPS tracking number in `shippingOrders` returns events.
- [ ] `shippingLogs` contains one row per outbound call.
- [ ] `purchaseLabel` entry point returns `NOT_IMPLEMENTED` without throwing.

---

## 12. Success Criteria

### 12.1 Functional

1. A merchant can enter USPS credentials, click **Verify Connection**, and see a green check within 5 seconds against production.
2. The provider is invoked by the Pipeline (A7) on every live checkout where it is enabled and its B10 contract is not gated out by A6 rules.
3. At least 95% of domestic rate requests (US ZIP → US ZIP, weight ≥ 0.01 lb, dims ≥ 1×1×1 in) return at least one rate.
4. Tracking status for a known-delivered parcel matches USPS.com's tracking page.
5. Address validation against USPS HQ (`475 L'Enfant Plaza SW, Washington, DC 20260`) returns DPV `"Y"` and a standardized 9-digit ZIP.

### 12.2 Non-Functional

1. **Latency.** p50 rate fetch ≤ 500ms, p95 ≤ 1500ms against production (excluding token mint on cold start).
2. **Token cache hit rate.** ≥ 99% in steady-state (tokens last ~8 hours).
3. **Error transparency.** 100% of USPS errors surface with the parsed USPS message in admin UI logs.
4. **Zero plaintext secrets** in any persisted row, log, or event payload.
5. **Zero 400s from missing mandatory fields** in production (regression test must catch before deploy).
6. **Zero 403s from EPS fields** in production.

### 12.3 Integration

1. Passes the full B10 contract test suite with sandbox credentials in CI.
2. Coexists with ShipStation (C1) and UPS Direct (C2) at checkout without duplicate rates per service class (the Pipeline dedupes).
3. Address validation integrates cleanly with A5 — A5 can switch from `shipstation` to `usps` as validator without code changes outside the settings row.

### 12.4 Release Criteria

Before promoting this provider from Draft to GA:

- [ ] All unit + integration + contract tests green.
- [ ] Audit regression tests green.
- [ ] At least 1 pilot merchant runs for 7 days in production with no P0 incidents.
- [ ] Admin UI verified in Electron desktop mode and web mode.
- [ ] Credential rotation verified (old token cache invalidated on secret change).

---

## 13. Roles & Capabilities

The USPS Provider inherits capabilities defined by the Role & Capability System (PRD role-capability-system) and adds none of its own. Relevant capabilities:

| Capability | Administrator | Editor | Author | Contributor | Subscriber |
|------------|:-------------:|:------:|:------:|:-----------:|:----------:|
| `admin.shipping.providers.view` | yes | yes | no | no | no |
| `admin.shipping.providers.manage` | yes | no | no | no | no |
| `admin.shipping.providers.verify` | yes | no | no | no | no |
| `admin.shipping.providers.test_rates` | yes | yes | no | no | no |
| `shipping.logs.view` | yes | yes | no | no | no |

The storefront does not require any capability — rate display, address validation, and tracking are public-by-order (tracking requires the tracking number which is order-scoped in the Website app).

Mutations / actions that must gate on capabilities:

| Mutation / Action | Required Capability |
|-------------------|---------------------|
| Update USPS settings (any field) | `admin.shipping.providers.manage` |
| Call `verifyConnection` from admin | `admin.shipping.providers.verify` |
| Call `fetchRates` from admin test drawer | `admin.shipping.providers.test_rates` |
| View `shippingLogs` rows | `shipping.logs.view` |

The Pipeline's invocation of `fetchRates` / `trackShipment` / `validateAddress` during checkout is **system-initiated** and not capability-gated — it runs under a service identity per the Auth System's service-account model.

---

## 14. Events Fired

All events conform to the B10 event contract and are emitted via the Event Dispatcher (PRD event-dispatcher-system) using the `emitEvent` helper.

| Event Key | When | Payload |
|-----------|------|---------|
| `shipping.provider.credentials_updated` | Admin saves USPS settings (any field change). | `{ provider: "usps", changedFields: string[], actorId }` |
| `shipping.provider.verified` | `verifyConnection` succeeds. | `{ provider: "usps", environment, scopes: string[], actorId }` |
| `shipping.provider.verification_failed` | `verifyConnection` fails at any step. | `{ provider: "usps", step, errorCode, errorMessage, actorId }` |
| `shipping.rates.fetched` | `fetchRates` succeeds. | `{ provider: "usps", rateCount, latencyMs, cartId? }` |
| `shipping.rates.failed` | `fetchRates` fails. | `{ provider: "usps", errorCode, latencyMs, cartId? }` |
| `shipping.tracking.updated` | `trackShipment` returns a snapshot. | `{ provider: "usps", trackingNumber, status, statusDetail }` |
| `shipping.tracking.failed` | `trackShipment` errors. | `{ provider: "usps", trackingNumber, errorCode }` |
| `shipping.address.validated` | `validateAddress` returns a result. | `{ provider: "usps", valid: boolean, dpvConfirmation }` |
| `shipping.provider.enabled` | Enabled toggle flips on. | `{ provider: "usps", actorId }` |
| `shipping.provider.disabled` | Enabled toggle flips off. | `{ provider: "usps", actorId }` |

Listeners wired by other systems:

- **Audit Log System** subscribes to all `shipping.provider.*` events.
- **Site Notification System** subscribes to `shipping.provider.verification_failed` (surface in-app alert to administrators).
- **Email Notification System** subscribes to `shipping.provider.verification_failed` on production environment (email administrators).
- **Analytics System** subscribes to `shipping.rates.fetched` / `shipping.rates.failed` for provider success-rate dashboards.

No events unique to USPS exist. Re-use of B10 event names keeps cross-provider dashboards uniform.

---

## 15. References

### 15.1 Upstream PRDs

- PRD B10 — `shipping-method-live-rate` — `LiveRateProvider` contract, capability flags, `RateQuote`, `ProviderError`, event keys.
- PRD A3 — `shipping-packages-system` — package dimensions source.
- PRD A5 — `address-validation-system` — address validation contract consumed by this provider.
- PRD A7 — `rate-calculation-pipeline` — invocation flow, caching, circuit breaker.
- PRD A6 — `shipping-rules-engine` — post-provider rule overlays.
- PRD C1 — `shipping-provider-shipstation` — sibling aggregator provider.
- PRD C2 — `shipping-provider-ups` — sibling direct provider (same adapter shape).

### 15.2 Convex Backend Helpers

- `.claude/docs/AUTH-SYSTEM.md` — `getCurrentUser`, `requireCan`.
- `.claude/docs/ROLE-CAPABILITY-SYSTEM.md` — capability definitions.
- `.claude/docs/SETTINGS-SYSTEM.md` — settings-first read pattern.
- `.claude/docs/EVENT-DISPATCHER-SYSTEM.md` — `emitEvent` helper.
- `.claude/docs/AUDIT-LOG-SYSTEM.md` — audit trail.

### 15.3 External Documentation

- USPS Developer Portal — `https://developer.usps.com/`
- USPS OAuth 2.0 v3 — `https://developer.usps.com/oauth`
- USPS Domestic Prices v3 — `https://developer.usps.com/pricesv3`
- USPS Tracking v3 — `https://developer.usps.com/trackingv3`
- USPS Addresses v3 — `https://developer.usps.com/addressesv3`
- USPS Labels v3 (deferred) — `https://developer.usps.com/labelsv3`

### 15.4 Code References (Current Monolithic Implementation)

These file ranges must be refactored into `convex/shipping/providers/usps.ts` + `convex/shipping/providers/usps/tokenCache.ts` per Section 6. They are listed here so the refactor PR has a clear map:

- `ConvexPress-Admin/packages/backend/convex/shipping/actions.ts`
  - Lines 188–262 — OAuth token mint + caching.
  - Lines 796–999 — `fetchRates` with audit fixes (mandatory fields, flattened response, service-name fallback).
  - Lines 1432–1526 — `trackShipment`.
  - Lines 3277–3344 — `verifyConnection`.

### 15.5 Audit Fix History (For Future Maintainers)

| Fix | Summary | Regression Guard |
|-----|---------|------------------|
| 1 | Added mandatory rate fields (`processingCategory`, `rateIndicator`, `destinationEntryFacilityType`) after 400 errors. | Unit test snapshots outgoing request body. |
| 2 | Removed `accountType` / `accountNumber` after 403 errors on non-EPS accounts. | Unit test asserts body does not contain these keys. |
| 3 | Changed response parsing from flat `prices[]` to `rateOptions[].rates[]` (flatMap). | Unit test with multi-rateOption fixture. |
| 4 | Replaced hardcoded `0.1 × 0.1 × 0.1` dimensions with `6 × 4 × 4` default + warning. | Unit test with no A3 dims asserts `6×4×4` used and warning logged. |
| 5 | Service name now uses `rate.description` with internal map fallback. | Unit test with empty `description` asserts fallback. |

---

**End of PRD.**
