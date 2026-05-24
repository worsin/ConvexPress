# Commerce Gap Closure Plan

ConvexPress remains WooCommerce-friendly at the surface, but the backend should adopt the enterprise state boundaries that Medusa gets right. The plan is additive: existing product, cart, order, and settings fields keep working while stronger models become the canonical path for advanced stores.

## Phase 1: Location-Aware Inventory And Fulfillment

- Add inventory levels per product/variant/location.
- Keep existing product and variant stock as fallback/global inventory.
- Make checkout reservations location-aware.
- Add provider metadata to fulfillment locations so Amazon MCF, 3PLs, warehouses, and retail stores all fit the same model.
- Route shipping and fulfillment from the same selected location when possible.

## Phase 2: Payment Collections

- Add payment collections, sessions, captures, and provider attempts.
- Keep `commerce_payment_transactions` as compatibility/read model initially.
- Route Stripe, PayPal, manual invoice, and saved methods through payment sessions.
- Make retries and webhooks idempotent by collection/session.

## Phase 3: Order Change Ledger

- Add order changes and order change actions.
- Use the ledger for admin edits, cancellations, returns, exchanges, claims, refund adjustments, shipping adjustments, and manual corrections.
- Keep order history as the human-readable event stream.

## Phase 4: Applied Adjustments

- Snapshot discount/promotion adjustments at cart line, shipping method, and order line level.
- Preserve rule, campaign, amount, target, and allocation details.
- Use adjustment rows for refunds, partial returns, and order edits.

## Phase 5: Pricing Engine

- Add price sets, prices, price lists, and price rules.
- Resolve price by context: currency, quantity, customer group, sales channel, region, and dates.
- Keep Woo-style `basePrice` and `salePrice` as default UI fields backed by a default price set.

## Phase 6: Regions And Sales Channels

- Add regions for country/currency/tax behavior.
- Add sales channels for website, API, marketplace, admin, and future custom channels.
- Attach product availability, pricing, shipping, tax, and inventory routing to channel/region context.

## Phase 7: Draft Orders

- Build draft orders on top of the order change ledger.
- Allow admin-created carts, quotes, invoices, manual payment collection, and conversion to order.

## Phase 8: Customer Groups

- Add customer groups and tags as targeting context.
- Use groups for pricing, discounts, shipping rules, tax exemptions, content restrictions, and AI-driven segmentation.

## Phase 9: Workflow Idempotency

- Add generic workflow run/idempotency records for commerce side effects.
- Cover payment intent creation, payment capture, refund, label purchase, fulfillment submit, order completion, and webhooks.

## Phase 10: Test Matrix

- Add integration-style tests for checkout, payment retries, inventory reservations, fulfillment routing, returns/exchanges, and order edits.
- Use Medusa's edge-case categories as inspiration, but keep implementation Convex-native.
