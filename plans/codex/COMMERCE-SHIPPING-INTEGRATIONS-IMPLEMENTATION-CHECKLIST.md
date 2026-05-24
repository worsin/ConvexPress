# Commerce Shipping Integrations Implementation Checklist

**Scope:** Shipping integrations architecture and rollout for ConvexPress commerce
**Status:** Planning
**Last Updated:** 2026-04-09

## Stage A: Integration Foundation

### Settings system

- Add new section names in [defaults.ts](/Users/worsin/Development/ConvexPress/ConvexPress-Admin/packages/backend/convex/settings/defaults.ts):
  - `integrations.shipping`
  - `integrations.shipping.shipstation`
  - `integrations.shipping.ups`
  - `integrations.shipping.usps`
  - `integrations.shipping.fedex`
  - `integrations.shipping.dhl`
- Add typed interfaces for each settings section in [defaults.ts](/Users/worsin/Development/ConvexPress/ConvexPress-Admin/packages/backend/convex/settings/defaults.ts).
- Add section validators in [validators.ts](/Users/worsin/Development/ConvexPress/ConvexPress-Admin/packages/backend/convex/settings/validators.ts).
- Add runtime validation rules in [validation.ts](/Users/worsin/Development/ConvexPress/ConvexPress-Admin/packages/backend/convex/settings/validation.ts).
- Expose public-safe integration status separately from secret-bearing settings queries.

### Backend schema

- Extend [schema.ts](/Users/worsin/Development/ConvexPress/ConvexPress-Admin/packages/backend/convex/schema.ts) with new shipping integration tables.
- Add shipping integration tables in [commerce.ts](/Users/worsin/Development/ConvexPress/ConvexPress-Admin/packages/backend/convex/schema/commerce.ts) or split to a new [shipping.ts](/Users/worsin/Development/ConvexPress/ConvexPress-Admin/packages/backend/convex/schema/shipping.ts) if the file is getting too dense.
- Add:
  - `shipping_provider_connections`
  - `shipping_provider_secrets`
  - `shipping_provider_accounts`
  - `shipping_provider_services`
  - `commerce_shipping_profiles`
  - `commerce_shipping_packages`
  - `commerce_shipping_zones`
  - `commerce_shipping_zone_methods`
  - `commerce_shipping_rate_quotes`
- Extend:
  - `commerce_orders`
  - `commerce_shipments`

### Backend module layout

- Create [shipping/](/Users/worsin/Development/ConvexPress/ConvexPress-Admin/packages/backend/convex/shipping) under the backend.
- Add:
  - `helpers.ts`
  - `validators.ts`
  - `queries.ts`
  - `mutations.ts`
  - `normalizers.ts`
  - `ranking.ts`
  - `capabilities.ts`
- Create provider adapter directory:
  - [shipping/providers/](/Users/worsin/Development/ConvexPress/ConvexPress-Admin/packages/backend/convex/shipping/providers)
- Add provider stubs:
  - `shipstation.ts`
  - `ups.ts`
  - `usps.ts`
  - `fedex.ts`
  - `dhl.ts`

## Stage B: Admin Integrations UX

### Integrations overview

- Extend [integrations.tsx](/Users/worsin/Development/ConvexPress/ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/settings/integrations.tsx) with a Shipping card.
- The card should summarize:
  - connected providers
  - active primary provider
  - degraded/error state
  - number of synced carrier accounts

### New routes

- Add:
  - [shipping.tsx](/Users/worsin/Development/ConvexPress/ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/settings/integrations/shipping.tsx)
  - [shipstation.tsx](/Users/worsin/Development/ConvexPress/ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/settings/integrations/shipping/shipstation.tsx)
  - [ups.tsx](/Users/worsin/Development/ConvexPress/ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/settings/integrations/shipping/ups.tsx)
  - [usps.tsx](/Users/worsin/Development/ConvexPress/ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/settings/integrations/shipping/usps.tsx)
  - [fedex.tsx](/Users/worsin/Development/ConvexPress/ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/settings/integrations/shipping/fedex.tsx)
  - [dhl.tsx](/Users/worsin/Development/ConvexPress/ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/settings/integrations/shipping/dhl.tsx)

### Components

- Create [components/integrations/shipping/](/Users/worsin/Development/ConvexPress/ConvexPress-Admin/apps/web/src/components/integrations/shipping)
- Add:
  - `ShippingIntegrationOverview.tsx`
  - `ProviderConnectionCard.tsx`
  - `ProviderHealthBadge.tsx`
  - `ShipStationSettingsForm.tsx`
  - `CarrierAccountTable.tsx`
  - `ServiceSyncPanel.tsx`

## Stage C: Commerce Shipping Configuration UX

### Commerce settings routes

- Add:
  - [shipping.tsx](/Users/worsin/Development/ConvexPress/ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/commerce/settings/shipping.tsx)
  - [zones.tsx](/Users/worsin/Development/ConvexPress/ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/commerce/settings/shipping/zones.tsx)
  - [packages.tsx](/Users/worsin/Development/ConvexPress/ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/commerce/settings/shipping/packages.tsx)
  - [rules.tsx](/Users/worsin/Development/ConvexPress/ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/commerce/settings/shipping/rules.tsx)

### Components

- Create [components/commerce-shipping/](/Users/worsin/Development/ConvexPress/ConvexPress-Admin/apps/web/src/components/commerce-shipping)
- Add:
  - `ShippingZoneManager.tsx`
  - `ShippingMethodRuleEditor.tsx`
  - `ShippingPackageManager.tsx`
  - `RatePresentationSettings.tsx`
  - `ShippingRecommendationSettings.tsx`

### Navigation

- Extend [nav-config.ts](/Users/worsin/Development/ConvexPress/ConvexPress-Admin/apps/web/src/lib/admin-shell/nav-config.ts) with:
  - shipping integration entry under settings/integrations
  - shipping settings entry under commerce

## Stage D: Normalized Backend Contract

### Provider contract

- Define the normalized provider contract in [shipping/helpers.ts](/Users/worsin/Development/ConvexPress/ConvexPress-Admin/packages/backend/convex/shipping/helpers.ts).
- Add shared result types in [shipping/normalizers.ts](/Users/worsin/Development/ConvexPress/ConvexPress-Admin/packages/backend/convex/shipping/normalizers.ts).
- Add common quote ranking logic in [shipping/ranking.ts](/Users/worsin/Development/ConvexPress/ConvexPress-Admin/packages/backend/convex/shipping/ranking.ts).

### Commerce integration points

- Replace flat shipping method lookup in [helpers.ts](/Users/worsin/Development/ConvexPress/ConvexPress-Admin/packages/backend/convex/commerce/helpers.ts) with a resolver that can source:
  - flat/manual methods
  - live provider quotes
- Extend [cart.ts](/Users/worsin/Development/ConvexPress/ConvexPress-Admin/packages/backend/convex/commerce/cart.ts) to:
  - request quotes
  - cache quotes
  - invalidate stale quotes on address/package changes
- Extend [checkout.ts](/Users/worsin/Development/ConvexPress/ConvexPress-Admin/packages/backend/convex/commerce/checkout.ts) to:
  - enforce quote validity
  - persist selected provider/service metadata
  - snapshot the selected quote onto the order

## Stage E: ShipStation Read Path

### Safe connection flow

- Implement read-only connection verification in [shipping/providers/shipstation.ts](/Users/worsin/Development/ConvexPress/ConvexPress-Admin/packages/backend/convex/shipping/providers/shipstation.ts).
- The first verification call must not create labels, manifests, or mutate carrier config.
- Sync:
  - carrier accounts
  - service offerings
  - capability flags

### Rate quotes

- Implement ShipStation rates call in [shipping/providers/shipstation.ts](/Users/worsin/Development/ConvexPress/ConvexPress-Admin/packages/backend/convex/shipping/providers/shipstation.ts).
- Normalize provider fields into ConvexPress quote shape.
- Preserve provider-returned flags like:
  - `best_value`
  - `cheapest`
  - `fastest`
- Still recompute ConvexPress flags in [ranking.ts](/Users/worsin/Development/ConvexPress/ConvexPress-Admin/packages/backend/convex/shipping/ranking.ts).

## Stage F: Storefront Checkout Experience

### Website components

- Create [components/commerce-shipping/](/Users/worsin/Development/ConvexPress/ConvexPress-Website/apps/web/src/components/commerce-shipping)
- Add:
  - `ShippingRateSelector.tsx`
  - `RecommendedShippingOption.tsx`
  - `ShippingOptionList.tsx`
  - `ShippingBadge.tsx`

### Checkout routes

- Extend:
  - [shipping.tsx](/Users/worsin/Development/ConvexPress/ConvexPress-Website/apps/web/src/routes/_marketing/checkout/shipping.tsx)
  - [review.tsx](/Users/worsin/Development/ConvexPress/ConvexPress-Website/apps/web/src/routes/_marketing/checkout/review.tsx)
- Behavior:
  - request fresh quotes when shipping address changes
  - highlight recommended option
  - clearly show cheapest and fastest
  - preserve selected quote through review

## Stage G: ShipStation Write Path

### Labels and manifests

- Implement label purchase in [shipping/providers/shipstation.ts](/Users/worsin/Development/ConvexPress/ConvexPress-Admin/packages/backend/convex/shipping/providers/shipstation.ts).
- Extend [orders.ts](/Users/worsin/Development/ConvexPress/ConvexPress-Admin/packages/backend/convex/commerce/orders.ts) so shipment creation can:
  - buy a label
  - store external ids
  - persist label URLs/metadata
  - void labels
- Add manifest support and persistence.

### Tracking

- Extend shipment tracking sync flow in [orders.ts](/Users/worsin/Development/ConvexPress/ConvexPress-Admin/packages/backend/convex/commerce/orders.ts).
- If webhooks are later used, add a secure HTTP endpoint under the admin-owned backend only.

## Stage H: Direct Carrier Adapters

### Add direct adapters without changing the contract

- Implement:
  - [ups.ts](/Users/worsin/Development/ConvexPress/ConvexPress-Admin/packages/backend/convex/shipping/providers/ups.ts)
  - [usps.ts](/Users/worsin/Development/ConvexPress/ConvexPress-Admin/packages/backend/convex/shipping/providers/usps.ts)
  - [fedex.ts](/Users/worsin/Development/ConvexPress/ConvexPress-Admin/packages/backend/convex/shipping/providers/fedex.ts)
  - [dhl.ts](/Users/worsin/Development/ConvexPress/ConvexPress-Admin/packages/backend/convex/shipping/providers/dhl.ts)
- Reuse the same:
  - connection model
  - ranking logic
  - checkout UI
  - shipment persistence

## Stage I: Guardrails

- Never auto-purchase a label when credentials are first saved.
- Never auto-connect or alter the merchant’s ShipStation dashboard configuration.
- Keep read-only verification separate from write-ready status.
- Require explicit admin action before:
  - label purchase
  - manifest creation
  - void
  - pickup creation
- Add audit logging for:
  - credential changes
  - connection tests
  - syncs
  - label purchases
  - manifest creation
  - voids

## Stage J: Exit Criteria

The foundation is ready when:

- shipping integrations appear as a first-class area in admin
- ShipStation credentials can be stored and verified safely
- carrier accounts and services can sync
- checkout can show live quotes from a provider
- ConvexPress highlights best, cheapest, and fastest consistently
- orders persist provider/service snapshots
- shipment records can carry external label/tracking metadata

The system is production-grade when:

- ShipStation write path is live
- failed provider calls degrade safely
- stale quotes are invalidated reliably
- direct carrier adapters can be added without touching checkout UI contracts
