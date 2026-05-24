# Commerce Shipping Integrations Architecture

**System:** Commerce Shipping Integrations
**Status:** Planning
**Priority:** P0
**Scope:** `commerce` core shipping runtime + provider integrations under admin integrations/settings
**Last Updated:** 2026-04-09

## Intent

ConvexPress needs a production-grade shipping integration layer that behaves more like WooCommerce plus a modern multi-carrier stack than a flat list of shipping method labels.

This system must:

- support ShipStation as the first aggregator integration
- support direct carrier integrations for UPS, USPS, FedEx, and DHL
- keep all provider credentials and connection state in the admin integrations area
- let storefront checkout show live rates
- rank and surface the cheapest and fastest options clearly
- support label creation, tracking, manifests, and post-order shipment operations
- fail closed when provider credentials are missing, invalid, or disconnected

This is not a standalone store plugin. It is a **shipping subsystem of `commerce`** with **provider adapters** managed through the integrations/settings surface.

## Architectural Decision

### 1. Shipping stays owned by `commerce`

Shipping is not a separate plugin from the merchant point of view. It is part of `commerce`.

That means:

- checkout depends on shipping quotes
- orders depend on shipping selections
- shipments depend on carrier integrations
- fulfillment and returns build on top of the same shipment data

So the right shape is:

- `commerce` owns shipping business logic, checkout usage, order snapshots, shipment records, and storefront rendering
- `settings/integrations` owns connection setup, credentials, health checks, and provider capabilities
- provider adapters implement a common contract under the admin-owned backend

### 2. ShipStation first, direct carriers second

ShipStation should be the first real integration because it gives the fastest path to:

- multi-carrier rate shopping
- label creation
- tracking
- manifests
- normalized carrier response shape
- support for connected carrier accounts

Direct UPS, USPS, FedEx, and DHL adapters should still exist, but they should be optional adapters behind the same shipping contract.

This matters because:

- ShipStation can aggregate multiple carriers for a single merchant account
- direct carriers each have their own onboarding, auth model, edge cases, and certification requirements
- a common adapter layer lets ConvexPress expose one storefront/admin UX regardless of provider choice

### 3. Provider adapters are integration modules, not top-level merchant plugins

Do **not** make the admin plugin list look like this:

- UPS Plugin
- USPS Plugin
- FedEx Plugin
- DHL Plugin
- ShipStation Plugin

That is the wrong boundary.

Instead:

- `commerce` remains the visible store plugin
- shipping connections live under `Settings -> Integrations -> Shipping`
- each provider is an adapter with:
  - credentials
  - enabled/disabled state
  - capability flags
  - account sync metadata

This gives the merchant one coherent shipping area while keeping implementation modular.

## Current ConvexPress Reality

The codebase already has the correct insertion points:

- admin integrations overview route exists at `/settings/integrations`
- `commerce.general` settings currently store only flat `shippingMethods`
- checkout currently validates against configured shipping method codes
- orders already store shipment records and tracking fields

This is enough to extend, but not enough for real carrier integrations.

The flat `shippingMethods` array in `commerce.general` is no longer sufficient once rates are live.

## External API Findings

### ShipStation / ShipStation API

As of April 9, 2026, the public docs show:

- ShipEngine has been rebranded as ShipStation API, while endpoints remain active under `api.shipengine.com`
- ShipStation API supports multi-carrier rating, labels, tracking, manifests, and webhooks
- the rates endpoint can return normalized `best_value`, `cheapest`, and `fastest` attributes
- connected carrier accounts can be listed and addressed by `carrier_id`
- merchants can also connect their own carrier accounts programmatically through carrier connection endpoints
- bringing your own carrier accounts requires an Advanced plan or higher

Primary sources:

- ShipStation documentation hub: https://www.shipstation.com/documentation/
- Rates API: https://www.shipengine.com/docs/rates/
- List carriers: https://www.shipengine.com/docs/reference/list-carriers/
- Connect your own carriers: https://www.shipengine.com/docs/carriers/connect/
- Create labels: https://www.shipengine.com/docs/labels/create-a-label/
- Tracking: https://www.shipengine.com/docs/tracking/
- Manifests: https://www.shipengine.com/docs/shipping/manifests/
- Rebrand note: https://www.shipengine.com/docs/new-shipstation-api/

Important implementation consequence:

- ConvexPress should treat `ShipStation API` and `ShipEngine` as the same provider family internally
- docs and UI should display `ShipStation`
- adapter code may still need to target `api.shipengine.com` and legacy field names where the official API still uses them

### USPS

Current USPS developer materials indicate:

- modern USPS APIs are on the USPS Developer Portal
- OAuth2 client credentials are part of the current model
- featured APIs include Addresses, Domestic Prices, Labels, and Tracking
- access to some API products may require separate approval and throughput differs by product

Primary sources:

- USPS Developer Portal: https://developers.usps.com/
- USPS enrollment tech sheet: https://developers.usps.com/sites/default/files/2024-10/USPS%20API%20Cloud%20Enrollment.pdf

### FedEx

Current FedEx developer materials indicate:

- FedEx provides a Comprehensive Rate and Transit Times API
- the API can return multiple applicable services and transit times in one request
- the API can include discounted account-specific rates

Primary source:

- FedEx Comprehensive Rates and Transit Times API: https://developer.fedex.com/api/en-us/catalog/comprehensive-rate/docs.html

### UPS

UPS’s developer portal currently exposes API resources for rating, transit, shipping, and tracking via the Developer Resource Center and API reference tags.

Primary sources:

- UPS Developer Resource Center: https://developer.ups.com/us/en/business-solutions/expand-your-online-business/upgrade-digital-technology/developer-resource-center
- UPS Rating tag reference: https://developer.ups.com/tag/Rating?loc=en_BO
- UPS Time in Transit tag reference: https://developer.ups.com/api/reference?loc=it_IT&tag=Time-in-Transit

### DHL

DHL’s developer portal exposes shipping and related APIs, but DHL is more fragmented by business unit than the others. For ConvexPress, the likely direct carrier target is DHL Express.

Primary sources:

- DHL Developer Portal: https://developer.dhl.com/
- MyDHL guide family: https://developer.dhl.com/sites/default/files/2025-01/DHL%20EXPRESS%20-%20MyDHL%20API%20-%20SOAP%20Developer%20Guide%20-%20v2.31.pdf

## Recommended System Shape

### Core layers

1. **Shipping orchestration layer**
- owned by `commerce`
- normalizes rates, services, labels, tracking, manifests, and shipment lifecycle

2. **Provider adapter layer**
- one adapter per provider family
- same internal contract for ShipStation, UPS, USPS, FedEx, DHL

3. **Connection management layer**
- stores encrypted credentials and connection state
- runs capability sync and health checks

4. **Storefront selection layer**
- exposes ranked shipping options to checkout
- always highlights cheapest and fastest options

5. **Post-order shipment layer**
- purchases labels
- stores external shipment ids and tracking data
- creates manifests
- syncs tracking updates

## Data Model

These should be added to the admin-owned Convex backend.

### New settings sections

- `integrations.shipping`
- `integrations.shipping.shipstation`
- `integrations.shipping.ups`
- `integrations.shipping.usps`
- `integrations.shipping.fedex`
- `integrations.shipping.dhl`

`commerce.general` should keep high-level store policies only:

- whether shipping is enabled
- default ship-from country/state
- whether rates are live or flat/manual
- customer display preferences

It should **not** hold provider credentials or synced carrier service metadata.

### New tables

#### `shipping_provider_connections`

One row per provider connection.

Fields:

- `provider`: `shipstation | ups | usps | fedex | dhl`
- `displayName`
- `status`: `disconnected | connected | degraded | error`
- `enabled`
- `mode`: `sandbox | production`
- `isPrimary`
- `lastVerifiedAt`
- `lastSyncAt`
- `lastErrorCode`
- `lastErrorMessage`
- `createdAt`
- `updatedAt`

#### `shipping_provider_secrets`

Encrypted credential payloads, split from connection metadata.

Fields:

- `connectionId`
- `secretVersion`
- `encryptedPayload`
- `createdAt`
- `updatedAt`

#### `shipping_provider_accounts`

Represents carrier accounts discoverable through a provider connection.

Examples:

- ShipStation connection exposing UPS, USPS, FedEx accounts
- direct UPS connection exposing one UPS account

Fields:

- `connectionId`
- `provider`
- `externalAccountId`
- `carrierCode`
- `carrierName`
- `nickname`
- `status`
- `supportsRates`
- `supportsLabels`
- `supportsTracking`
- `supportsManifests`
- `supportsReturns`
- `rawCapabilities`
- `lastSyncAt`

#### `shipping_provider_services`

Normalized carrier services discovered from provider/account sync.

Fields:

- `connectionId`
- `accountId`
- `carrierCode`
- `serviceCode`
- `serviceName`
- `serviceGroup`: `economy | standard | expedited | overnight | international | freight | return`
- `isActive`
- `supportsDomestic`
- `supportsInternational`
- `rawMetadata`

#### `commerce_shipping_profiles`

Store-owned package and fulfillment defaults.

Fields:

- `name`
- `shipFromAddress`
- `defaultPackageCode`
- `weightUnit`
- `dimensionUnit`
- `isDefault`

#### `commerce_shipping_packages`

Reusable package definitions.

Fields:

- `code`
- `label`
- `packageType`
- `weight`
- `dimensions`
- `carrierCode?`
- `provider?`

#### `commerce_shipping_zones`

Merchant shipping policies.

Fields:

- `name`
- `countries`
- `states`
- `postalCodeRules`
- `enabled`
- `sortOrder`

#### `commerce_shipping_zone_methods`

Merchant-facing checkout methods, which may resolve to live provider services or flat/manual rules.

Fields:

- `zoneId`
- `methodCode`
- `label`
- `methodType`: `live_rate | flat_rate | free_shipping | local_pickup`
- `provider`
- `accountId?`
- `serviceFilters`
- `pricingRules`
- `presentationRules`
- `enabled`
- `sortOrder`

#### `commerce_shipping_rate_quotes`

Short-lived cached quotes used by cart and checkout.

Fields:

- `checkoutSessionId`
- `quoteKey`
- `provider`
- `accountId`
- `carrierCode`
- `carrierName`
- `serviceCode`
- `serviceName`
- `amount`
- `currency`
- `estimatedDaysMin?`
- `estimatedDaysMax?`
- `deliveryDateEstimated?`
- `isCheapest`
- `isFastest`
- `isBestValue`
- `rawQuote`
- `expiresAt`
- `createdAt`

#### Existing table extensions

Extend `commerce_orders`:

- `shippingProvider`
- `shippingAccountId`
- `shippingServiceCode`
- `shippingServiceName`
- `shippingQuoteRaw`

Extend `commerce_shipments`:

- `provider`
- `providerAccountId`
- `externalShipmentId`
- `externalLabelId`
- `externalManifestId`
- `trackingStatus`
- `labelUrl`
- `labelFormat`
- `voidedAt?`

## Internal Adapter Contract

Every provider adapter must implement the same contract.

```ts
type ShippingProviderAdapter = {
  provider: "shipstation" | "ups" | "usps" | "fedex" | "dhl";
  verifyConnection(input): Promise<VerifyResult>;
  syncAccounts(input): Promise<AccountSyncResult>;
  syncServices(input): Promise<ServiceSyncResult>;
  validateAddress(input): Promise<AddressValidationResult>;
  getRates(input): Promise<NormalizedRateQuote[]>;
  createLabel(input): Promise<NormalizedLabelResult>;
  voidLabel(input): Promise<VoidLabelResult>;
  trackShipment(input): Promise<TrackingResult>;
  createManifest?(input): Promise<ManifestResult>;
};
```

The rest of ConvexPress should only talk to this normalized contract.

No checkout component or order mutation should be aware of ShipStation-specific or carrier-specific request shapes.

## ShipStation Adapter Strategy

### Why ShipStation first

ShipStation is the best first integration because it reduces four separate carrier builds into one controlled adapter with good coverage:

- rates
- labels
- tracking
- manifests
- connected carrier accounts
- normalized rate ranking

### How it should work in ConvexPress

1. Merchant connects ShipStation API key in `/settings/integrations/shipping/shipstation`
2. ConvexPress verifies the key with a harmless read call
3. ConvexPress syncs:
   - connected carrier accounts
   - available services
   - provider capability flags
4. Checkout requests live rates through the ShipStation adapter
5. Response is normalized into ConvexPress `commerce_shipping_rate_quotes`
6. UI displays:
   - highlighted best option
   - cheapest badge
   - fastest badge
   - alternate options grouped underneath
7. Order shipment creation can purchase labels through the same adapter

### Important operational guardrails

- Do not auto-purchase labels during checkout
- Do not auto-connect carriers for the merchant
- Do not mutate the merchant’s ShipStation account setup until the merchant is monitoring
- initial credential verification must use safe read-only endpoints
- production write actions must be behind explicit admin confirmation in later implementation phases

### ShipStation-specific limitations to plan for

- dashboard-based activation is still required for some included carrier accounts
- bringing your own carrier accounts requires the right ShipStation API plan
- some carriers may be visible but pending approval
- not every connected account supports every feature equally

Because of that, ConvexPress must sync and store capabilities per account and service instead of assuming universal support.

## Direct Carrier Adapter Strategy

Direct carrier adapters are phase two and beyond.

They exist for merchants who need:

- direct carrier credentials and negotiated rates
- redundancy if ShipStation is unavailable
- carrier-specific functionality not surfaced well through ShipStation
- operational independence from an aggregator

### UPS direct adapter

Use for:

- direct rate quote access
- transit estimates
- direct shipment creation and tracking

### USPS direct adapter

Use for:

- address validation
- domestic and international prices
- labels
- tracking

### FedEx direct adapter

Use for:

- comprehensive rate and transit responses
- account-specific rates
- shipment creation and tracking

### DHL direct adapter

Use for:

- DHL Express shipping and tracking
- international-heavy merchants

### Direct carrier rule

Do not implement direct carrier adapters first.

ShipStation should establish:

- the normalized contract
- the admin integrations UX
- the checkout ranking layer
- the shipment persistence model

Then direct carriers plug into the exact same contract.

## Checkout UX and Rate Ranking

This part is central to the user’s request.

### Storefront behavior

When rates are returned, the storefront should:

1. compute normalized ranking
2. surface the top option in a visually isolated card
3. label the top choices clearly:
   - `Best Option`
   - `Cheapest`
   - `Fastest`
4. still allow the customer to choose any eligible option
5. sort the rest in a predictable order

### Ranking policy

ConvexPress should not blindly trust provider ordering.

Instead:

1. If provider returns normalized attributes like `best_value`, `cheapest`, `fastest`, consume them.
2. Recompute a ConvexPress ranking anyway for consistency across providers.
3. Store flags on each normalized quote:
   - `isCheapest`
   - `isFastest`
   - `isBestValue`

### Best-value heuristic

Recommended first-pass heuristic:

- cheapest quote gets `costRank = 1`
- fastest quote gets `speedRank = 1`
- compute `normalizedScore = costWeight * costRank + speedWeight * speedRank`
- default weights:
  - `costWeight = 0.6`
  - `speedWeight = 0.4`

If a provider already marks one quote as `best_value`, use that as a tie-breaker, not the sole source of truth.

### Presentation rule

Always isolate the recommended option first, then list alternatives.

For example:

- highlighted top card: `Best Option`
- secondary badges on alternatives: `Cheapest`, `Fastest`

If the same quote is both cheapest and fastest, it should display both badges.

## Admin UX

### Integration routes

Add:

- `/settings/integrations/shipping`
- `/settings/integrations/shipping/shipstation`
- `/settings/integrations/shipping/ups`
- `/settings/integrations/shipping/usps`
- `/settings/integrations/shipping/fedex`
- `/settings/integrations/shipping/dhl`

### Commerce shipping routes

Add:

- `/commerce/settings/shipping`
- `/commerce/settings/shipping/zones`
- `/commerce/settings/shipping/packages`
- `/commerce/settings/shipping/rules`
- `/commerce/shipments`
- `/commerce/shipments/$shipmentId`

### Admin screens

#### Shipping integrations overview

Shows:

- connected providers
- health status
- sandbox vs production mode
- synced carrier accounts
- read-only vs write-ready state

#### ShipStation settings

Shows:

- API key connection status
- account verification result
- available carrier accounts
- service sync timestamp
- feature support flags
- safe test action

#### Carrier-specific settings

Shows:

- auth fields for that carrier
- environment mode
- account status
- capabilities
- last successful rate call
- last successful label creation

#### Shipping configuration page

Separate from credentials. This page controls:

- shipping zones
- method display labels
- live-rate vs flat-rate rules
- free-shipping thresholds
- package defaults
- recommendation badge copy

## Security Requirements

- secrets must be encrypted at rest
- secrets must never be returned in normal settings queries
- connection tests should use safe read-only operations first
- all write operations must be explicitly triggered by admin actions
- provider API errors must be normalized before surfacing to the website
- rate caching must not leak one customer’s quote context into another
- shipment write endpoints must be admin-only unless explicitly designed otherwise

For ShipStation specifically:

- no bulk sync or label creation should run automatically on key save
- initial verification should use list/read endpoints only
- production key entry should show a warning that direct account effects are possible on later write operations

## Failure Model

The system must degrade safely.

### If all live providers fail

Checkout should:

- fall back to configured flat/manual methods if present
- otherwise block checkout with a clear shipping-unavailable state
- never silently use stale rates beyond configured expiry

### If one provider fails

- keep other providers eligible
- log the provider failure
- mark connection degraded in admin

### If provider capabilities change

- hide unsupported services
- force a resync before label purchase if the cached capability data is stale

## Rollout Plan

### Phase 1: Foundation

- create shipping integrations settings sections
- create connection and account schema
- create normalized provider adapter contract
- add shipping integration admin routes and status cards

### Phase 2: ShipStation read path

- ShipStation credential save
- safe verification
- carrier/account/service sync
- live rate retrieval
- checkout quote normalization and ranking

### Phase 3: ShipStation write path

- label purchase
- label persistence
- tracking sync
- manifests

### Phase 4: Direct carrier adapters

- UPS
- USPS
- FedEx
- DHL

### Phase 5: Operational refinement

- webhook-driven tracking updates where supported
- retry strategy
- analytics
- merchant-facing shipping reports

## Recommendation

The right plan for ConvexPress is:

1. keep shipping inside `commerce`
2. create a proper shipping integrations subsystem under admin settings/integrations
3. build ShipStation first as the aggregator path
4. normalize rates so ConvexPress always controls cheapest/fastest/best-value presentation
5. add direct UPS, USPS, FedEx, and DHL adapters later behind the same contract

That gets the merchant exactly what they want:

- all major carriers
- one coherent setup area
- the best available rate surfaced first
- a low-risk first integration path
- room for enterprise-grade fulfillment later
