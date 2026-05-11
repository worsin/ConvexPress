# PRD: Live Rate Shipping (Abstract Contract)

**System ID:** `shipping-method-live-rate`
**Layer:** B (Shipping Method Type — Abstract)
**Status:** Draft
**Owner:** Commerce / Shipping Domain
**Last Updated:** 2026-04-14

---

## 1. Context & Intent

### 1.1 What This Is

Live Rate Shipping is an **abstract contract** — the interface that every carrier-API-backed shipping method must implement to participate in the Rate Calculation Pipeline (`rate-calculation-pipeline`, A7). It is **not** a concrete shipping method a merchant configures directly. Merchants never see "Live Rate Shipping" as a selectable option; they configure one of the concrete providers (ShipStation C1, UPS C2, USPS C3, FedEx C4, DHL C5) that implements this contract.

### 1.2 Why It Exists

Without this abstraction, each carrier integration would independently reinvent:

- How rate requests are assembled from cart + address + packages
- How quotes are normalized from wildly different carrier response shapes
- How TTL caching and address/cart fingerprinting are applied
- How timeouts, retries, and fallback behavior are handled
- How connection health is verified and surfaced to admins
- How label purchase, void, and tracking operations are shaped
- Which capability flags the provider exposes to the Pipeline

The Live Rate Shipping contract centralizes all of this **plumbing** once. Provider adapters (Layer C) then implement only the carrier-specific translation layer: "given this normalized request, call the carrier API and return normalized quotes."

### 1.3 Design Philosophy

This PRD follows the same pattern Shopify uses for its Carrier Service API, ShipEngine uses for its provider model, and EasyPost uses for its carrier model: define a stable internal shape, adapt each carrier to that shape, and treat the Pipeline as carrier-agnostic.

The core principle: **the Pipeline does not know or care which provider produced a quote.** It calls `provider.fetchRates(ctx)` on every registered, active, capable provider and receives the same `NormalizedShippingQuote[]` shape back from all of them. Adding a sixth provider tomorrow (e.g., Canada Post, Royal Mail) requires implementing the contract and registering the adapter — nothing in the Pipeline, checkout, or admin shell changes.

### 1.4 Relationship To Concrete Methods

| Layer | Concrete? | Merchant-Configurable? | Examples |
|-------|-----------|------------------------|----------|
| A — Primitives | Yes (data) | Partially | Packages, zones, classes |
| **B — Method Types (incl. this PRD)** | **Mix** | **Depends** | Flat rate, weight-based, **Live Rate (abstract)** |
| C — Provider Adapters | Yes | Yes | ShipStation, UPS, USPS, FedEx, DHL |

Flat Rate (`shipping-method-flat-rate`), Weight-Based (`shipping-method-weight-based`), etc. are concrete at Layer B because their logic is self-contained. Live Rate is abstract at Layer B because its logic requires an external carrier — which is Layer C's job.

### 1.5 Non-Goals (Explicit)

- This PRD does **not** define how any specific carrier's API is called. That is C1–C5.
- This PRD does **not** define checkout UI. That is the checkout system.
- This PRD does **not** define the rate ranking algorithm for the overall cart. That is A7 (Pipeline). It **does** define a shared helper that providers use to pre-rank their own quote list.

---

## 2. Scope

### 2.1 In Scope

1. **Provider contract** — the `LiveRateProvider` TypeScript interface that every C1–C5 implements.
2. **Normalized quote shape** — the `NormalizedShippingQuote` type that the Pipeline and checkout consume, regardless of origin.
3. **TTL / fingerprint behavior** — how `addressKey`, `cartKey`, and `expiresAt` are computed and stamped on every quote.
4. **Fallback and timeout policy** — what the Pipeline does when a provider is slow, errors, or all providers fail.
5. **Capability flags** — `supports_rates`, `supports_labels`, `supports_tracking`, `supports_manifests`, `supports_address_validation`, and how they gate functionality.
6. **Shared utility helpers** — `normalizeQuote`, `fingerprintQuote`, `rankQuotes`, `buildRateContext`, used by all providers.
7. **Connection management contract** — how `verifyConnection`, `syncAccounts`, and connection health states behave across providers.
8. **Event namespace** — the `shipping.provider.*` event family fired uniformly by all providers.
9. **Integration page shape** — the SHAPE of admin integration pages that providers render (credentials panel, capabilities summary, test button, last-verified timestamp). Provider-specific PRDs render these shapes.

### 2.2 Out of Scope

- Any provider-specific credential fields, API endpoints, rate-request serialization, or error-code mapping. All of that belongs in C1–C5.
- Manual method fallbacks themselves (those are defined by the specific manual methods). This PRD only defines when fallback triggers.
- Tax-on-shipping logic (belongs to Tax system).
- Label PDF rendering (belongs to Fulfillment system).
- The "select rate" UI in checkout (belongs to Storefront checkout).
- Shipping rules that eliminate providers from consideration (belongs to `shipping-rules-engine`, A6).

### 2.3 Boundary Tests

- "Add support for EasyPost." → Implement the contract in a new `convex/shipping/providers/easypost.ts` adapter. Register. Done. No Pipeline change. ✅ In scope for this PRD (it defines the shape).
- "Add a checkbox to ShipStation settings to auto-insure packages over $500." → ShipStation PRD (C1). ❌ Out of scope here.
- "Make the Pipeline prefer UPS over FedEx when costs are equal." → Pipeline PRD (A7). ❌ Out of scope.
- "Stamp every returned quote with an `addressKey` so Pipeline can cache by destination." → ✅ In scope — this is a contract requirement.

---

## 3. Dependencies

### 3.1 Upstream Dependencies

| Dependency | System ID | Why |
|------------|-----------|-----|
| Packages | `shipping-packages-system` (A3) | Provides box dimensions and weight for carrier rate requests. Contract `RateContext.packages` consumes this. |
| Address Validation | `address-validation-system` (A5) | Provides `residential` flag and normalized address. Many carriers price residential differently. Contract `RateContext.toAddress` consumes this. |
| Rate Calculation Pipeline | `rate-calculation-pipeline` (A7) | The sole caller of `provider.fetchRates()`. Defines when providers are invoked, aggregates their quotes, applies rules, ranks final list. |
| Ship-From Locations | `ship-from-locations-system` (A2) | Provides `RateContext.fromAddress`. Contract assumes one `fromAddress` per invocation. |
| Shipping Zones | `shipping-zones-system` | Pipeline uses zones to decide whether a provider is even relevant for this destination before invocation. |
| Settings System | `settings-system` | Stores `shipping.quoteCacheTtlSeconds`, `shipping.providerTimeoutMs`, `shipping.fallbackToManualRates`. |
| Event Dispatcher | `event-dispatcher-system` | Fires `shipping.provider.*` events (§14). |
| Audit Log System | `audit-log-system` | Records connection verify, sync, and credential rotation actions. |
| Role & Capability System | `role-capability-system` | Gates integration-page access via `admin.shipping.providers.*` capabilities. |

### 3.2 Downstream Consumers

| Consumer | System ID | How |
|----------|-----------|-----|
| ShipStation Adapter | `shipping-provider-shipstation` (C1) | Implements `LiveRateProvider`. |
| UPS Adapter | `shipping-provider-ups` (C2) | Implements `LiveRateProvider`. |
| USPS Adapter | `shipping-provider-usps` (C3) | Implements `LiveRateProvider`. |
| FedEx Adapter | `shipping-provider-fedex` (C4) | Implements `LiveRateProvider`. |
| DHL Adapter | `shipping-provider-dhl` (C5) | Implements `LiveRateProvider` (currently only `supports_rates: true`). |
| Rate Calculation Pipeline | A7 | Consumes the contract as caller. |

### 3.3 Circular Dependency Check

Pipeline (A7) calls providers (C1–C5) through this contract. Providers never call the Pipeline back. Providers may read settings and validated addresses but never write them. No cycles.

---

## 4. Schema

### 4.1 No New Tables

This PRD introduces **zero** new Convex tables. Both tables it relies on already exist and are defined by adjacent PRDs:

- `commerce_shipping_rate_quotes` — defined by A7 (Pipeline). This PRD specifies the shape of documents that any provider must produce for it.
- `commerce_shipping_provider_connections` — defined by the provider registry subsystem. This PRD specifies the shape all provider adapters read/write.

The authoritative `defineTable` definitions live in `convex/schema/commerceShipping.ts`. This PRD references, does not redefine, the schemas below.

### 4.2 `commerce_shipping_rate_quotes` — Shape This PRD Specifies

Every provider, on every `fetchRates` call, MUST produce one or more documents that conform to this shape. The Pipeline writes them; providers return them.

**Fields this PRD makes canonical (must be populated by any provider):**

| Field | Type | Required | Meaning |
|-------|------|----------|---------|
| `quoteKey` | `string` | Yes | Deterministic hash of `{provider, carrierCode, serviceCode, cartKey, addressKey}`. Stable across invocations. Used for idempotency. |
| `provider` | `"shipstation" \| "ups" \| "usps" \| "fedex" \| "dhl"` | Yes | Discriminator for the source adapter. |
| `carrierCode` | `string` | Yes | Provider-internal carrier code (e.g., `"ups"`, `"usps"`, `"stamps_com"`). Lowercased. |
| `carrierName` | `string` | Yes | Human-readable carrier name shown in checkout. |
| `serviceCode` | `string` | Yes | Provider-internal service code (e.g., `"usps_priority_mail"`). |
| `serviceName` | `string` | Yes | Human-readable service name (e.g., "USPS Priority Mail"). |
| `amount` | `number` | Yes | Cost in the smallest currency unit (cents for USD). |
| `currency` | `string` (ISO 4217) | Yes | 3-letter ISO code. |
| `estimatedDaysMin` | `number \| null` | No | Lower bound of transit days, null if unknown. |
| `estimatedDaysMax` | `number \| null` | No | Upper bound of transit days, null if unknown. |
| `deliveryDateEstimated` | `number \| null` | No | Unix ms. Providers that return a specific date populate this; others leave null. |
| `isCheapest` | `boolean` | Yes | Stamped by `rankQuotes` helper, not by the provider. |
| `isFastest` | `boolean` | Yes | Stamped by `rankQuotes` helper. |
| `isBestValue` | `boolean` | Yes | Stamped by `rankQuotes` helper (cheapest among the fastest tier). |
| `rawQuote` | `any` | Yes | The full, untouched carrier-response object for this quote. Debugging/audit only. Never surfaced to storefront. |
| `addressKey` | `string` | Yes | Deterministic hash of the destination address (post-validation). |
| `cartKey` | `string` | Yes | Deterministic hash of cart line items + package layout + origin. |
| `expiresAt` | `number` | Yes | Unix ms. Set to `requestedAt + settings.quoteCacheTtlSeconds * 1000`. |
| `requestedAt` | `number` | Yes | Unix ms when the carrier request began. |
| `receivedAt` | `number` | Yes | Unix ms when the carrier response was parsed. |

### 4.3 `commerce_shipping_provider_connections` — Shape This PRD Specifies

Every provider adapter stores one row per configured connection. The shape is uniform across providers so the Integrations admin page can render a generic list.

| Field | Type | Required | Meaning |
|-------|------|----------|---------|
| `provider` | `"shipstation" \| "ups" \| "usps" \| "fedex" \| "dhl"` | Yes | Matches the `LiveRateProvider.providerId`. |
| `label` | `string` | Yes | Merchant-assigned name (e.g., "Primary UPS account"). |
| `enabled` | `boolean` | Yes | If false, Pipeline skips this connection. |
| `credentials` | `any` (encrypted) | Yes | Provider-specific credential blob. Shape owned by the provider. Encrypted at rest per the Settings System. |
| `capabilities` | `ProviderCapabilities` | Yes | Runtime-verified capability flags. See §5.3. |
| `carrierAccounts` | `CarrierAccount[]` | Yes | Populated by `syncAccounts`. Sub-accounts the connection can pull rates for. |
| `status` | `"healthy" \| "degraded" \| "error" \| "unverified"` | Yes | Set by `verifyConnection`. |
| `statusMessage` | `string \| null` | No | Human-readable reason for degraded/error. |
| `lastVerifiedAt` | `number \| null` | No | Unix ms of last successful `verifyConnection`. |
| `lastSyncedAt` | `number \| null` | No | Unix ms of last successful `syncAccounts`. |
| `createdBy` | `Id<"users">` | Yes | Who installed the connection. |
| `createdAt` | `number` | Yes | Unix ms. |
| `updatedAt` | `number` | Yes | Unix ms. |

No changes to either table's schema are introduced by this PRD. If a provider requires additional connection-level fields, those go inside the `credentials` blob or a provider-specific extension table owned by that provider's PRD.

---

## 5. Data Model

This PRD defines TypeScript types that live in `convex/shipping/providers/types.ts`. These are the **contract** — changing them breaks every provider. Changes require a migration plan coordinated across C1–C5.

### 5.1 `NormalizedShippingQuote` — The Universal Quote

```typescript
export interface NormalizedShippingQuote {
  // Identity & provenance
  quoteKey: string;
  provider: ProviderId;
  carrierCode: string;
  carrierName: string;
  serviceCode: string;
  serviceName: string;

  // Pricing
  amount: number;        // smallest currency unit (cents)
  currency: string;      // ISO 4217

  // Delivery estimates (any may be null)
  estimatedDaysMin: number | null;
  estimatedDaysMax: number | null;
  deliveryDateEstimated: number | null; // Unix ms

  // Ranking flags (stamped by rankQuotes, not by the provider)
  isCheapest: boolean;
  isFastest: boolean;
  isBestValue: boolean;

  // Raw carrier response (debug/audit)
  rawQuote: unknown;

  // Fingerprints & TTL (stamped by the provider before return)
  addressKey: string;
  cartKey: string;
  expiresAt: number;     // Unix ms
  requestedAt: number;   // Unix ms
  receivedAt: number;    // Unix ms
}

export type ProviderId =
  | "shipstation"
  | "ups"
  | "usps"
  | "fedex"
  | "dhl";
```

### 5.2 `LiveRateProvider` — The Contract

```typescript
export interface LiveRateProvider {
  readonly providerId: ProviderId;
  readonly capabilities: ProviderCapabilities;

  // REQUIRED — every provider must implement
  fetchRates(ctx: RateContext): Promise<NormalizedShippingQuote[]>;
  verifyConnection(ctx: VerifyContext): Promise<VerifyResult>;
  syncAccounts(ctx: SyncContext): Promise<SyncResult>;

  // OPTIONAL — present only if capability flag is true
  purchaseLabel?(ctx: LabelContext): Promise<LabelResult>;
  voidLabel?(ctx: VoidContext): Promise<VoidResult>;
  trackShipment?(ctx: TrackContext): Promise<TrackResult>;
  createManifest?(ctx: ManifestContext): Promise<ManifestResult>;
  validateAddress?(ctx: AddressValidateContext): Promise<AddressValidateResult>;
}
```

**Rule:** If a capability flag is `true`, the corresponding method MUST be implemented. If the flag is `false`, the method MUST be absent (not stubbed with `throw`). The Pipeline decides whether to call a method by checking the capability flag, never by try/catch on a method existence check.

### 5.3 `ProviderCapabilities` — Feature Matrix

```typescript
export interface ProviderCapabilities {
  supports_rates: boolean;              // MUST be true for any provider registered here
  supports_labels: boolean;             // purchaseLabel + voidLabel
  supports_tracking: boolean;           // trackShipment
  supports_manifests: boolean;          // createManifest (end-of-day handoff docs)
  supports_address_validation: boolean; // validateAddress
}
```

**Current planned capability matrix (for reference; each C1–C5 PRD owns its own values):**

| Provider | Rates | Labels | Tracking | Manifests | Addr Validate |
|----------|-------|--------|----------|-----------|---------------|
| ShipStation (C1) | ✓ | ✓ | ✓ | ✓ | ✗ |
| UPS (C2) | ✓ | ✓ | ✓ | ✗ | ✓ |
| USPS (C3) | ✓ | ✗* | ✓ | ✓ | ✓ |
| FedEx (C4) | ✓ | ✓ | ✓ | ✓ | ✓ |
| DHL (C5) | ✓ | ✗ | ✗ | ✗ | ✗ |

\* USPS labels deferred pending USPS Labels v3 API integration (see C3 §2.2)

### 5.4 Context & Result Types

```typescript
export interface RateContext {
  connection: ProviderConnection;
  fromAddress: NormalizedAddress;
  toAddress: NormalizedAddress;     // includes residential flag from A5
  packages: ShippingPackage[];      // from A3
  items: CartLineSnapshot[];
  currency: string;
  settings: RatePipelineSettings;   // timeout, ttl, etc.
  cartKey: string;                  // pre-computed by Pipeline
  addressKey: string;               // pre-computed by Pipeline
  requestedAt: number;
}

export interface VerifyContext {
  connection: ProviderConnection;
}
export interface VerifyResult {
  ok: boolean;
  status: "healthy" | "degraded" | "error";
  message: string | null;
  checkedAt: number;
}

export interface SyncContext {
  connection: ProviderConnection;
}
export interface SyncResult {
  carrierAccounts: CarrierAccount[];
  syncedAt: number;
}

export interface LabelContext {
  connection: ProviderConnection;
  quoteKey: string;
  order: OrderSnapshot;
  package: ShippingPackage;
  shipment: ShipmentIntent;
}
export interface LabelResult {
  labelId: string;
  trackingNumber: string;
  labelUrl: string;
  labelFormat: "PDF" | "PNG" | "ZPL";
  cost: number;
  currency: string;
  carrierCode: string;
  serviceCode: string;
  rawResponse: unknown;
}

export interface VoidContext {
  connection: ProviderConnection;
  labelId: string;
}
export interface VoidResult {
  ok: boolean;
  refundAmount: number | null;
  message: string | null;
}

export interface TrackContext {
  connection: ProviderConnection;
  trackingNumber: string;
  carrierCode: string;
}
export interface TrackResult {
  status: "pre_transit" | "in_transit" | "out_for_delivery" | "delivered" | "exception" | "unknown";
  events: TrackingEvent[];
  estimatedDelivery: number | null;
}
```

### 5.5 Fingerprinting Rules

**`addressKey`** (stable hash of destination post-validation):
- Included: `country`, `postalCode` (normalized), `stateProvince`, `city` (lowercased, trimmed), `residential` flag.
- Excluded: name, company, phone, street lines (street-level changes do not change carrier pricing in most cases; when they do, the provider re-requests because TTL expires).
- Algorithm: `sha256(JSON.stringify(sortedFields))`, take first 16 hex chars.

**`cartKey`** (stable hash of cart composition + packaging):
- Included: sorted array of `{productId, variantId, quantity}`, sorted array of `{length, width, height, weight}` per package, origin address key, currency.
- Excluded: cart-level discount codes, customer notes, tax, prices (rate depends on weight/dim, not price).
- Algorithm: `sha256(JSON.stringify(sortedComposition))`, first 16 hex chars.

**`quoteKey`** (for idempotency inside a cartKey):
- `sha256(provider + "|" + carrierCode + "|" + serviceCode + "|" + cartKey + "|" + addressKey)`, first 24 hex chars.

**Rule:** Every quote returned by `fetchRates` MUST carry all three fingerprints. Providers delegate this to the shared `fingerprintQuote` helper (§6.3); they do not compute hashes themselves.

### 5.6 TTL Semantics

- `expiresAt = requestedAt + (settings.quoteCacheTtlSeconds * 1000)`
- Default `quoteCacheTtlSeconds = 300` (5 minutes), configurable via Settings System.
- The Pipeline treats any quote with `expiresAt < Date.now()` as invalid and re-requests.
- Providers do **not** implement their own caches. The single source of cached truth is the `commerce_shipping_rate_quotes` table.

---

## 6. Functions / API

This PRD defines **no concrete mutations or queries**. Mutations and queries are owned by the Pipeline (A7) and by the individual providers (C1–C5). This PRD defines:

1. The **contract interface** that every provider adapter object must satisfy.
2. The **shared helper utilities** that every provider calls.
3. The **provider registry** that the Pipeline reads to discover providers.

### 6.1 Provider Registry

File: `convex/shipping/providers/index.ts`

```typescript
import type { LiveRateProvider } from "./types";
import { shipstationAdapter } from "./shipstation";
import { upsAdapter } from "./ups";
import { uspsAdapter } from "./usps";
import { fedexAdapter } from "./fedex";
import { dhlAdapter } from "./dhl";

export const LIVE_RATE_PROVIDERS: Record<ProviderId, LiveRateProvider> = {
  shipstation: shipstationAdapter,
  ups: upsAdapter,
  usps: uspsAdapter,
  fedex: fedexAdapter,
  dhl: dhlAdapter,
};

export function getProvider(id: ProviderId): LiveRateProvider {
  const provider = LIVE_RATE_PROVIDERS[id];
  if (!provider) {
    throw new Error(`Unknown live rate provider: ${id}`);
  }
  return provider;
}

export function listEnabledProviders(
  connections: ProviderConnection[],
): Array<{ provider: LiveRateProvider; connection: ProviderConnection }> {
  return connections
    .filter((c) => c.enabled && c.status !== "error")
    .map((c) => ({ provider: getProvider(c.provider), connection: c }));
}
```

### 6.2 Required Helpers (Shared)

File: `convex/shipping/helpers.ts` (extend existing).

#### 6.2.1 `normalizeQuote`

Converts a carrier-specific quote fragment plus a `RateContext` into a fully-populated `NormalizedShippingQuote` (minus ranking flags). All required fields are validated; if any are missing the helper throws `MalformedQuoteError`.

```typescript
function normalizeQuote(
  ctx: RateContext,
  fragment: {
    carrierCode: string;
    carrierName: string;
    serviceCode: string;
    serviceName: string;
    amount: number;
    currency?: string;
    estimatedDaysMin?: number | null;
    estimatedDaysMax?: number | null;
    deliveryDateEstimated?: number | null;
    rawQuote: unknown;
  },
): NormalizedShippingQuote;
```

#### 6.2.2 `fingerprintQuote`

Stamps `quoteKey`, `addressKey`, `cartKey`, `requestedAt`, `receivedAt`, `expiresAt`. Always called by `normalizeQuote` — providers never call directly.

#### 6.2.3 `rankQuotes`

Takes the full aggregated list of `NormalizedShippingQuote[]` (after Pipeline has collected from all providers) and stamps `isCheapest` (global minimum `amount`), `isFastest` (global minimum `estimatedDaysMax`, null values sorted last), `isBestValue` (cheapest among the tier tied for fastest). This helper runs in the Pipeline, **after** all providers have returned. Providers do not set these flags.

#### 6.2.4 `buildRateContext`

Assembles a `RateContext` from a cart snapshot, validated address, packed packages, and connection. Used by the Pipeline before calling each provider. Guarantees every provider sees the same context.

### 6.3 Mutations / Queries — Owned by Pipeline and Providers

The following functions are **referenced** by this PRD but **defined** elsewhere. They are listed for clarity; their specs live in the owning PRD.

| Function | Owner | Role |
|----------|-------|------|
| `shipping.pipeline.fetchRates` | A7 Pipeline | Orchestrates calls to providers via the contract. |
| `shipping.providers.{id}.*` | C1–C5 | Provider-specific wrappers. |
| `shipping.providerConnections.verify` | Provider registry subsystem | Public mutation; invokes `provider.verifyConnection`. |
| `shipping.providerConnections.syncAccounts` | Provider registry subsystem | Public mutation; invokes `provider.syncAccounts`. |

### 6.4 Error Types

Errors raised by providers MUST extend one of these named classes so the Pipeline can handle them uniformly:

- `ProviderTimeoutError` — exceeded `settings.providerTimeoutMs`.
- `ProviderRateLimitError` — carrier returned 429; includes `retryAfterMs`.
- `ProviderAuthError` — credentials invalid / expired.
- `ProviderMalformedResponseError` — response failed schema validation.
- `ProviderCarrierError` — carrier-reported business error (e.g., "service not available for origin/destination"). Includes `carrierErrorCode`.
- `ProviderUnavailableError` — carrier returned 5xx or network failure.

An **empty quote array is not an error.** It is a successful response meaning "the carrier does not offer any service for this shipment" and the Pipeline treats it as such.

---

## 7. Admin UX

### 7.1 No Direct Admin UX

This PRD has no admin UI of its own. A merchant never sees a screen titled "Live Rate Shipping." Each provider (C1–C5) owns its own admin page at:

```
Settings → Integrations → Shipping → {Provider Name}
```

### 7.2 Shape Contract for Provider Integration Pages

This PRD **does** define the **shape** of the integration page that each provider must render. The Admin Settings & Forms UI Expert enforces this shape through a shared layout component.

**Required sections on every provider integration page:**

1. **Header**
   - Provider logo + name
   - Connection label (merchant-assigned)
   - Status pill: `healthy` (green) / `degraded` (amber) / `error` (red) / `unverified` (neutral)
   - `lastVerifiedAt` relative time ("verified 2 minutes ago")

2. **Credentials Section**
   - Provider-specific fields (API key, account number, OAuth button, etc. — owned by C1–C5)
   - "Test Connection" button — invokes `provider.verifyConnection` and updates status
   - "Save" button — persists credentials

3. **Capabilities Summary**
   - Read-only grid of the 5 capability flags with green check / red X
   - Tooltip on each capability explaining what it enables
   - If `supports_labels: false`, display an informational line: "This provider returns rates only. Use a different provider to purchase labels."

4. **Carrier Accounts Section** (only if provider has multiple sub-accounts)
   - List of `carrierAccounts` populated by `syncAccounts`
   - "Sync Accounts" button — invokes `provider.syncAccounts`
   - Per-account enable/disable toggle

5. **Recent Activity Panel**
   - Last 10 `shipping.provider.*` events filtered to this connection
   - Link to full log in Audit Log System

6. **Danger Zone**
   - "Disable Connection" toggle
   - "Delete Connection" button (confirmation dialog)

### 7.3 Integrations List Page Shape

The Integrations hub page (`Settings → Integrations → Shipping`) renders a grid of provider cards. Each card displays:

- Logo
- Provider name
- "Configured" / "Not configured" state
- Number of active connections
- Overall health (worst-of summary)
- "Configure" or "Add Connection" CTA

This list page is owned by the provider registry subsystem, not this PRD, but its contents are driven by the capabilities and status this contract defines.

---

## 8. Merchant Workflow

A merchant **never** interacts with "Live Rate Shipping" as a concept. Their workflow targets a specific provider:

1. Merchant navigates to `Settings → Integrations → Shipping`.
2. Sees a list of available providers (populated from the registry).
3. Clicks "Configure" on UPS.
4. Lands on the UPS integration page (shape defined in §7.2, specifics defined in C2 UPS PRD).
5. Enters credentials, clicks "Test Connection."
   - Admin UI calls `shipping.providerConnections.verify` mutation.
   - Mutation invokes `upsAdapter.verifyConnection(ctx)`.
   - Result updates `connection.status` to `healthy` / `degraded` / `error`.
   - Status pill refreshes via reactive Convex query.
6. Clicks "Save."
7. Clicks "Sync Accounts" (if applicable).
   - Admin UI calls `shipping.providerConnections.syncAccounts`.
   - `upsAdapter.syncAccounts` populates `connection.carrierAccounts`.
8. Merchant enables the connection. From this point forward, the Pipeline automatically includes UPS in rate requests for zones where UPS is relevant.

**At no step does the merchant choose "Live Rate Shipping" as a shipping method.** They configure a provider; the Pipeline handles everything else.

---

## 9. Storefront UX

None. Quotes returned by any provider flow through the Rate Calculation Pipeline (A7) and appear in checkout as normalized quotes. The checkout UI cannot distinguish between a UPS quote, a FedEx quote, and a flat-rate method. It displays:

- `carrierName + serviceName` (e.g., "UPS Ground")
- Formatted `amount + currency`
- Delivery estimate derived from `estimatedDaysMin/Max` or `deliveryDateEstimated`
- Optional "Cheapest" / "Fastest" / "Best Value" badge from ranking flags

The checkout system's rendering rules are defined in the checkout PRD; this PRD only guarantees that every quote arriving there has the necessary fields populated.

---

## 10. Edge Cases

### 10.1 Provider Returns Empty Quote Array

**Scenario:** Carrier has no services for this origin/destination pair (e.g., DHL to a restricted country).
**Behavior:** `fetchRates` returns `[]`. This is **success**, not error. No event fires as a failure. `shipping.provider.rates_received` fires with `quoteCount: 0`. Pipeline continues with other providers.

### 10.2 Provider Times Out

**Scenario:** `fetchRates` exceeds `settings.providerTimeoutMs` (default 5000).
**Behavior:** Pipeline aborts the provider's promise, logs `shipping.provider.rates_failed` with `reason: "timeout"`. Provider is skipped for this request. Other providers continue. If this is the 3rd consecutive timeout for this connection within 5 minutes, Pipeline marks `connection.status = "degraded"` and fires `shipping.provider.connection_degraded`.

### 10.3 Provider Returns Malformed Response

**Scenario:** Carrier API returns JSON that fails `normalizeQuote` validation (missing required field, invalid types, etc.).
**Behavior:** `ProviderMalformedResponseError` is thrown with full raw response logged. Pipeline drops **only the malformed quote**, keeps other quotes from the same response if valid. If >50% of quotes in a response are malformed, the entire response is rejected and `shipping.provider.rates_failed` fires.

### 10.4 Rate Limits (HTTP 429)

**Scenario:** Carrier returns 429 with `Retry-After` header.
**Behavior:** Provider throws `ProviderRateLimitError` with `retryAfterMs` populated (from header, or exponential backoff: 500ms → 1s → 2s → 4s, max 3 retries, with jitter). Retries happen within the provider, not the Pipeline. If retries exhaust, provider returns `[]` and logs `shipping.provider.rates_failed` with `reason: "rate_limited"`.

### 10.5 Credentials Expired

**Scenario:** Carrier returns 401/403.
**Behavior:** Provider throws `ProviderAuthError`. Pipeline marks `connection.status = "error"`, `statusMessage = "Credentials rejected by {provider}. Re-verify in Settings → Integrations."`, and sets `connection.enabled = false`. `shipping.provider.connection_error` fires. Admin receives a site notification (via Site Notification System) prompting credential rotation.

### 10.6 All Providers Fail

**Scenario:** Every registered, enabled provider returns error or empty for this request.
**Behavior:** Pipeline consults `settings.fallbackToManualRates`:
- If `true` (explicit opt-in): Pipeline falls back to enabled manual methods (flat rate, weight-based, etc.) and returns those quotes. A storefront banner appears in checkout: "Live shipping rates are temporarily unavailable. The rates shown are our standard rates."
- If `false` (default): Pipeline returns `[]`. Checkout shows: "Shipping rates are temporarily unavailable. Please try again in a few minutes." No fallback. This is **intentional** — merchants must opt in to manual fallback so they never silently charge incorrect rates.

### 10.7 Partial Provider Success

**Scenario:** UPS returns 4 quotes, FedEx times out, USPS returns 3 quotes.
**Behavior:** Pipeline returns 7 quotes and `shipping.provider.rates_failed` fires for FedEx. Checkout does not show an error — the merchant configured multiple providers specifically to survive this.

### 10.8 Provider Returns Duplicate Service

**Scenario:** UPS returns both "UPS Ground" and "UPS Ground Residential" for a residential address.
**Behavior:** Both quotes are kept. `serviceCode` values differ, so `quoteKey` values differ. Pipeline does not deduplicate; the merchant's Shipping Rules Engine (A6) may suppress one if configured.

### 10.9 Quote Expires Mid-Checkout

**Scenario:** Customer sees quotes at t=0, places order at t=6 minutes with `quoteCacheTtlSeconds=300`.
**Behavior:** Pipeline detects expired quotes at order placement, re-requests. If new quotes differ from old by more than $0.01 per method, checkout displays a warning and requires customer reconfirmation. (Specific reconfirmation UX is checkout PRD's concern; this PRD only guarantees `expiresAt` is accurate.)

### 10.10 Concurrent Rate Requests (Same Cart/Address)

**Scenario:** Customer rapid-fires address edits; 3 rate requests fire within 100ms.
**Behavior:** Pipeline coalesces by `cartKey + addressKey` → only the latest request's response is used; earlier requests are abandoned (their in-flight provider calls continue but their results are discarded). No deduplication at provider level — providers treat every `fetchRates` call as independent.

### 10.11 Provider Returns Non-USD Quote When Store Currency Is USD

**Scenario:** International carrier returns CAD quotes for a USD store.
**Behavior:** `normalizeQuote` refuses any quote whose `currency` does not match `ctx.currency`. Quote is dropped, warning logged. Currency conversion is **not** this PRD's responsibility — the provider must convert or the merchant must configure per-currency connections.

### 10.12 Capability Missing Mid-Request

**Scenario:** Provider `supports_labels` was true at connection time, but since then the carrier revoked label-purchase scope.
**Behavior:** On `purchaseLabel` call, provider throws `ProviderAuthError` with `reason: "scope_revoked"`. Admin sees site notification. Capabilities are **not** auto-downgraded — the merchant must re-verify and the next `verifyConnection` will re-probe capabilities.

---

## 11. Testing Requirements

### 11.1 Contract Compliance Suite

Every provider (C1–C5) MUST pass the shared **Contract Compliance Test Suite** located at `packages/backend/convex/shipping/providers/__tests__/contract.test.ts`. This suite is generic; it takes a provider adapter as input and validates:

1. **Interface shape** — `providerId`, `capabilities`, `fetchRates`, `verifyConnection`, `syncAccounts` are present.
2. **Capability consistency** — if `supports_labels` is true, `purchaseLabel` and `voidLabel` exist; if false, they are undefined.
3. **Quote shape** — given a mocked carrier response, returned quotes pass the `NormalizedShippingQuote` schema via Zod.
4. **Fingerprint stability** — calling `fetchRates` twice with the same `RateContext` produces identical `quoteKey`, `addressKey`, `cartKey`.
5. **TTL stamping** — every returned quote has `expiresAt > requestedAt`, and `expiresAt - requestedAt` matches `settings.quoteCacheTtlSeconds * 1000` (within 100ms tolerance).
6. **Timeout behavior** — mock a 10s carrier response with `providerTimeoutMs: 500`; expect `ProviderTimeoutError` within 600ms.
7. **Empty success** — mock an empty-services response; expect `[]` returned, no error thrown.
8. **Malformed response** — mock a response missing `serviceCode`; expect `ProviderMalformedResponseError`.
9. **Rate limit retry** — mock 429 with `Retry-After: 1`; expect retry after 1s and success on second try.
10. **Auth error** — mock 401; expect `ProviderAuthError` and no retries.
11. **Verify connection** — mock healthy + degraded + error responses; expect correct `VerifyResult.status`.
12. **Sync accounts idempotency** — calling `syncAccounts` twice yields identical `CarrierAccount[]` output.

### 11.2 Mock Harness

File: `packages/backend/convex/shipping/providers/__tests__/mockHarness.ts`

Exports a `createMockProviderHarness(providerId)` that intercepts outbound HTTP and returns configurable fixtures. Providers use this in integration tests.

### 11.3 Pipeline Integration Tests

A7 Pipeline's test suite runs against a **fake provider** (`convex/shipping/providers/__tests__/fakeProvider.ts`) that implements the contract in-memory. This ensures the Pipeline is not coupled to any real provider and that the contract is the only surface.

### 11.4 Capability Gating Tests

For each provider, assert:
- If `supports_labels: false`, calling `shipping.providerConnections.purchaseLabel` returns `CapabilityUnsupportedError` without invoking the provider.
- Pipeline never calls an optional method whose capability flag is false.

### 11.5 Fingerprint Determinism Tests

- Same cart + same address → same `quoteKey`.
- Cart with reordered line items → same `cartKey`.
- Address with different capitalization in `city` → same `addressKey`.
- Address with different `postalCode` → different `addressKey`.

### 11.6 Acceptance Criteria

- All 12 contract compliance tests pass for all 5 providers.
- Fake provider passes Pipeline integration tests with no Pipeline changes.
- Adding a new provider (hypothetical C6) requires **zero** changes to Pipeline, checkout, Admin Shell, or any other system outside the new provider's own files.

---

## 12. Success Criteria

1. **Swap-ability:** Any provider can be added, removed, or swapped by implementing the contract and registering the adapter. No Pipeline changes. No checkout changes. No Admin Shell changes.
2. **100% contract fit:** All existing live-rate code (ShipStation, UPS, USPS, FedEx, DHL) fits inside the contract with no escape hatches. No provider uses a "special path" around the contract.
3. **Uniform observability:** Every provider fires the same `shipping.provider.*` events with the same payload shape.
4. **Uniform admin UX:** Every provider's integration page passes the "screenshot diff" test — same layout sections in the same order.
5. **Fingerprint determinism:** 100% of quotes returned by any provider have stable `quoteKey` / `addressKey` / `cartKey`.
6. **TTL correctness:** No quote with `expiresAt < now` is ever surfaced to checkout.
7. **Fallback discipline:** Manual-rate fallback triggers only when `fallbackToManualRates === true`. No silent fallback.
8. **Timeout discipline:** No carrier call blocks the Pipeline for more than `providerTimeoutMs + 100ms`.
9. **Contract test coverage:** 100% of the 12 contract compliance tests pass for all 5 providers on every CI run.
10. **No leaked raw responses:** Nothing from `rawQuote` ever reaches the storefront checkout UI.

---

## 13. Roles & Capabilities

This PRD defines the `admin.shipping.providers.*` capability namespace. Each concrete provider PRD (C1–C5) owns provider-specific capabilities (e.g., `admin.shipping.providers.ups.label_purchase`); this PRD defines the shared namespace-level grants.

| Capability | Administrator | Editor | Author | Contributor | Subscriber |
|-----------|:-------------:|:------:|:------:|:-----------:|:----------:|
| `admin.shipping.providers.view` | ✓ | ✓ | | | |
| `admin.shipping.providers.configure` | ✓ | | | | |
| `admin.shipping.providers.verify_connection` | ✓ | | | | |
| `admin.shipping.providers.sync_accounts` | ✓ | | | | |
| `admin.shipping.providers.delete_connection` | ✓ | | | | |
| `admin.shipping.providers.view_raw_quote` | ✓ | ✓ | | | |
| `admin.shipping.providers.view_events` | ✓ | ✓ | | | |

**Rules:**
- Only Administrators can configure or delete provider connections. Editors can view status and recent activity but cannot edit credentials.
- Provider-specific capabilities (e.g., `admin.shipping.providers.ups.*`) are defined by C1–C5 and refine this namespace; they cannot broaden it.
- `view_raw_quote` gates whether the admin UI renders the `rawQuote` debug panel on quote detail views.

---

## 14. Events Fired

All providers emit events through the shared Event Dispatcher System (`event-dispatcher-system`) with identical payload shapes. The `provider` field discriminates the source.

### 14.1 `shipping.provider.rates_requested`

Fired by the Pipeline **before** invoking `fetchRates`.

```typescript
{
  event: "shipping.provider.rates_requested";
  provider: ProviderId;
  connectionId: Id<"commerce_shipping_provider_connections">;
  cartKey: string;
  addressKey: string;
  packageCount: number;
  itemCount: number;
  requestedAt: number;
}
```

### 14.2 `shipping.provider.rates_received`

Fired by the Pipeline after `fetchRates` resolves successfully (including empty arrays).

```typescript
{
  event: "shipping.provider.rates_received";
  provider: ProviderId;
  connectionId: Id<"commerce_shipping_provider_connections">;
  cartKey: string;
  addressKey: string;
  quoteCount: number;
  durationMs: number;
  receivedAt: number;
}
```

### 14.3 `shipping.provider.rates_failed`

Fired by the Pipeline when `fetchRates` throws.

```typescript
{
  event: "shipping.provider.rates_failed";
  provider: ProviderId;
  connectionId: Id<"commerce_shipping_provider_connections">;
  cartKey: string;
  addressKey: string;
  reason: "timeout" | "rate_limited" | "auth" | "malformed" | "carrier_error" | "unavailable" | "unknown";
  errorMessage: string;
  durationMs: number;
  failedAt: number;
}
```

### 14.4 `shipping.provider.connection_healthy`

Fired when `verifyConnection` returns `ok: true` and status transitions to `healthy`.

```typescript
{
  event: "shipping.provider.connection_healthy";
  provider: ProviderId;
  connectionId: Id<"commerce_shipping_provider_connections">;
  verifiedBy: Id<"users">;
  checkedAt: number;
}
```

### 14.5 `shipping.provider.connection_degraded`

Fired when status transitions to `degraded` (e.g., repeated timeouts, partial features unavailable).

```typescript
{
  event: "shipping.provider.connection_degraded";
  provider: ProviderId;
  connectionId: Id<"commerce_shipping_provider_connections">;
  reason: string;
  transitionedAt: number;
}
```

### 14.6 `shipping.provider.connection_error`

Fired when status transitions to `error` (auth failure, revoked credentials, persistent 5xx).

```typescript
{
  event: "shipping.provider.connection_error";
  provider: ProviderId;
  connectionId: Id<"commerce_shipping_provider_connections">;
  reason: string;
  lastError: string;
  transitionedAt: number;
}
```

### 14.7 Event Consumers

| Consumer | Listens To | Action |
|----------|-----------|--------|
| Audit Log System | All `shipping.provider.*` | Writes audit entries for connection state changes. |
| Site Notification System | `connection_error`, `connection_degraded` | Creates admin notification prompting action. |
| Analytics System | `rates_requested`, `rates_received`, `rates_failed` | Tracks provider latency and failure rates. |
| Email Notification System | `connection_error` (if configured) | Sends email to store admin(s). |

---

## 15. References

### 15.1 Industry Carrier Service Abstractions

- **Shopify Carrier Service API** — Shopify's pattern for third-party carrier integrations. Each app implements a single `POST /rates` endpoint returning a normalized rate list; Shopify aggregates. Informs our `fetchRates` contract shape and empty-array-as-success convention.
- **ShipEngine Provider Model** — ShipEngine's approach to wrapping UPS / USPS / FedEx / DHL behind one API. Informs our capability flag pattern and uniform label/track/void surface.
- **EasyPost Carrier Accounts** — EasyPost's `CarrierAccount` object model for multi-account-per-carrier scenarios. Informs our `carrierAccounts` field and `syncAccounts` contract.

### 15.2 Internal ConvexPress PRDs

- `rate-calculation-pipeline` (A7) — sole caller of this contract.
- `shipping-packages-system` (A3) — provides `packages` to `RateContext`.
- `address-validation-system` (A5) — provides validated `toAddress`.
- `ship-from-locations-system` (A2) — provides `fromAddress`.
- `shipping-zones-system` — upstream filter deciding provider relevance.
- `shipping-rules-engine` (A6) — downstream filter refining the quote list.
- `settings-system` — houses `quoteCacheTtlSeconds`, `providerTimeoutMs`, `fallbackToManualRates`.
- `event-dispatcher-system` — carries `shipping.provider.*` events.
- `audit-log-system` — persists connection state changes.
- `role-capability-system` — enforces `admin.shipping.providers.*` permissions.

### 15.3 Implementation Files

| Path | Role |
|------|------|
| `convex/shipping/providers/types.ts` | Contract types (new). Defined by this PRD. |
| `convex/shipping/helpers.ts` | Shared `normalizeQuote`, `fingerprintQuote`, `rankQuotes`, `buildRateContext` (extend existing). |
| `convex/shipping/providers/connection.ts` | Connection lifecycle helpers (verify, sync, status transitions). |
| `convex/shipping/providers/index.ts` | Provider registry. |
| `convex/shipping/providers/shipstation.ts` | C1 implementation. |
| `convex/shipping/providers/ups.ts` | C2 implementation. |
| `convex/shipping/providers/usps.ts` | C3 implementation. |
| `convex/shipping/providers/fedex.ts` | C4 implementation. |
| `convex/shipping/providers/dhl.ts` | C5 implementation. |
| `convex/shipping/providers/__tests__/contract.test.ts` | Contract compliance suite. |
| `convex/shipping/providers/__tests__/mockHarness.ts` | HTTP mock harness. |
| `convex/shipping/providers/__tests__/fakeProvider.ts` | In-memory fake used by Pipeline tests. |

### 15.4 Worked Example — How A Provider Plugs In

The following illustrates how a hypothetical new provider (Canada Post, "C6") would slot in. No actual code is required in this PRD beyond the contract; this is pseudocode-shape for clarity.

1. **Create** `convex/shipping/providers/canadaPost.ts`:
   - Import `LiveRateProvider`, `normalizeQuote`, `fingerprintQuote`, error classes from shared helpers.
   - Export `canadaPostAdapter: LiveRateProvider` with `providerId: "canada_post"`, capability flags, and method implementations that call Canada Post's API and map responses to `normalizeQuote`.
2. **Register** in `convex/shipping/providers/index.ts`: add `canada_post: canadaPostAdapter` to `LIVE_RATE_PROVIDERS`.
3. **Extend** the `ProviderId` type union in `convex/shipping/providers/types.ts` to include `"canada_post"`.
4. **Write** provider-specific UI at `Settings → Integrations → Shipping → Canada Post` using the shape from §7.2.
5. **Add** per-provider capabilities under the `admin.shipping.providers.canada_post.*` namespace.
6. **Run** the contract compliance suite against `canadaPostAdapter`. All 12 tests must pass before merge.
7. **Deploy.**

Zero changes to Pipeline. Zero changes to checkout. Zero changes to Admin Shell. That is the success criterion of this PRD.

---

**End of PRD.**
