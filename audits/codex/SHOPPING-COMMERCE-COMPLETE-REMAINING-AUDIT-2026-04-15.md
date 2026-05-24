# Shopping / Commerce Remaining Production Audit

Date: 2026-04-15 13:53 MDT

Scope: ConvexPress shopping cart, checkout, catalog, orders, inventory, discounts, shipping, returns/refunds, digital products, reviews, wishlists, bundles, subscriptions, and the public/admin feature gates around those systems.

## Audit Result

The commerce stack is no longer just scaffold-level. Core catalog/cart/checkout/orders, inventory reservations, Stripe checkout confirmation, live-rate shipping plumbing, returns/refunds, subscriptions, digital downloads, reviews, wishlists, and bundles all have meaningful implementation.

The remaining production risk is concentrated in three areas:

1. Feature wiring and disabled-plugin safety.
2. Operational completeness for shipping, subscription renewals, returns/refunds, and fulfillment.
3. End-to-end verification across real provider flows.

## 15 Items Completed In This Pass

- [x] Mounted `commerceBundlesTables` in the admin-owned Convex schema so bundle APIs have backing tables.
- [x] Mounted `commerceReturnsTables` in the admin-owned Convex schema so return/RMA APIs have backing tables.
- [x] Added a core `requireCommerceDigitalEnabled` helper so digital APIs can require the digital add-on instead of only core commerce.
- [x] Switched digital download/license mutations to require the digital add-on flag.
- [x] Switched digital download/license queries to require the digital add-on flag.
- [x] Added admin `PluginGuard` protection around the digital products admin route.
- [x] Added admin `PluginGuard` protection around the product reviews moderation route.
- [x] Corrected the customer reviews dashboard gate from core commerce to `commerceReviews`.
- [x] Added customer subscription list gating.
- [x] Added customer subscription detail gating.
- [x] Changed returns UI data fetches to fail closed unless `commerceReturnsEnabled === true`.
- [x] Added subscription renewal cron scheduling.
- [x] Added subscription dunning retry cron scheduling.
- [x] Added subscription pending-cancellation expiration cron scheduling.
- [x] Removed disabled-add-on query hazards by skipping gated add-on queries before the matching plugin flag is explicitly enabled.

## Remaining Production Blockers

### P0: Must Fix Before Taking Real Orders

- [ ] Run a complete, clean typecheck/build for both monorepos after the broader repo type debt is resolved. Focused commerce fixes are in place, but full typecheck is still blocked by unrelated existing errors in the workspace.
- [ ] Finish real provider QA for Stripe payment capture, Stripe refund, failed payment, webhook replay, and idempotent order conversion.
- [ ] Finish live shipping provider QA for at least one production carrier/account path: quote, address validation, label purchase, tracking update, webhook ingest, and refund/void label where supported.
- [ ] Add an operator-visible checkout failure path when shipping is enabled but neither live rates nor manual fallback methods can serve an address.
- [ ] Add order-level audit/reporting views for payment pending, payment failed, refund pending, and shipment exception states.
- [ ] Add production notification templates and delivery verification for order confirmation, return approved, refund succeeded, subscription renewal failure, and shipment status updates.

### P1: Required For Feature Completeness

- [ ] Add admin dashboards for low-stock alerts, expired reservations, reservation conversion failures, and inventory adjustment history.
- [ ] Add return/RMA admin filters for pending approval, awaiting receipt, refund pending, and completed returns.
- [ ] Add refund reconciliation views that compare local `commerce_payment_refunds` rows with provider refund status.
- [ ] Add subscription admin tools for pending renewal invoices, dunning attempts, manual retry, and cancellation-at-period-end queues.
- [ ] Add customer-facing payment method management for subscriptions. Current lifecycle automation assumes renewals can be charged, but customer management of saved payment methods is not complete.
- [ ] Add tax provider integration or clearly scoped tax-rule UX. Current tax support is local rule based, not provider-grade tax compliance.
- [ ] Add discount/coupon conflict rules, usage-limit reporting, and checkout explanations for rejected discounts.
- [ ] Add order fulfillment workflow coverage for partial shipments, split packages, shipment cancellation, and shipment-level customer emails.
- [ ] Add bundle inventory previews that explain which component blocks purchase when a bundle is unavailable.

### P2: Production Hardening

- [ ] Add synthetic monitoring for cart, checkout, payment webhook, shipping quote, and returns/refund flows.
- [ ] Add rate-limit and abuse checks for public cart mutation, discount-code attempt, wishlist share, review voting, and tracking-link endpoints.
- [ ] Add admin-safe recovery actions for stuck checkout sessions, stuck stock reservations, stuck payment-pending orders, and stuck refund-pending returns.
- [ ] Add data retention jobs for old checkout sessions, abandoned carts, stale shipping quotes, stale wishlist share tokens, and historical provider payloads.
- [ ] Add export/reporting for orders, customers, refunds, returns, inventory adjustments, and subscription revenue.
- [ ] Add accessibility and mobile QA for cart, checkout, returns, downloads, subscriptions, wishlist, and bundle pages.

## Subsystem Notes

### Core Cart / Checkout

Core session ownership, session-token cart mutation, disabled guest checkout enforcement, pending-card-payment handling, and stock reservation logic are now materially safer. Remaining work is mostly end-to-end provider testing, operational recovery, and clearer shopper-facing failure states.

### Payments / Refunds

Stripe capture and refund actions exist, and returns now route original-payment refunds through Stripe-capable transactions. This still needs production provider QA, reconciliation views, and alerting for `refund_pending`.

### Shipping / Fulfillment

Shipping has advanced schema and provider adapters, quote ranking, tracking sync, manifests, token cleanup, and webhook dedup cleanup. The production gap is operational: real carrier QA, label/void flows, exception views, fallback UX, and fulfillment emails.

### Returns / RMAs

Returns have eligibility, approval, receipt, refund, retry, and lifecycle state. Remaining work is admin workflow polish, refund reconciliation, customer notifications, and stuck-state recovery.

### Subscriptions

Subscription create/pause/resume/cancel, invoices, dunning internals, and lifecycle actions exist. This pass added the missing cron scheduling. Remaining work is saved payment method management, customer billing controls, admin renewal queues, and provider QA.

### Digital Products

Digital files, download tokens, license keys, and customer downloads exist. This pass fixed digital add-on enforcement. Remaining work is storage policy review, signed URL expiry QA, and license activation/device UX if the product requires it.

### Reviews / Wishlists / Bundles

The add-ons have functional routes and backend APIs. This pass fixed several disabled-plugin hazards. Remaining work is moderation/reporting for reviews, share-token controls for wishlists, and better bundle inventory explanation.

