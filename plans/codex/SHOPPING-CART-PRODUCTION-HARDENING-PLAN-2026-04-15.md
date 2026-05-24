# Shopping Cart Production Hardening Plan

Date: 2026-04-15
Scope: ConvexPress shopping/cart/catalog/checkout/payment/order runtime across `ConvexPress-Admin` and `ConvexPress-Website`.

## Phase 0 - Backlog And Acceptance Criteria

- [x] Track every production-blocking gap from the audit in this plan.
- [x] Prioritize fixes that prevent broken builds, unauthorized cart edits, incorrect payment/order states, overselling, and disabled-plugin leakage.
- [x] Treat advanced commerce features as production requirements only when they affect the current purchase path.

## Phase 1 - Public Settings, Plugin Gating, And Build/Route Blockers

- [x] Return public-safe `plugins` flags from `settings.queries.getPublic`.
- [x] Return public-safe `commerceConfig` from `settings.queries.getPublic`.
- [x] Make public plugin gates fail closed when plugin flags are absent.
- [x] Add missing public plugin ids for shopping extensions used by storefront routes.
- [x] Regenerate or repair TanStack route tree/types so shopping routes compile.
- [x] Remove route/component type errors in shopping pages that block production build.

## Phase 2 - Cart And Checkout Security

- [x] Require session token/user ownership checks for cart item update and remove mutations.
- [ ] Require session token/user ownership checks for any checkout mutation that mutates a cart-derived object.
- [x] Validate product status and type before add-to-cart.
- [x] Require a valid published variant for variable products.
- [x] Verify variant belongs to the requested product.
- [x] Reject draft/private/deleted variants at cart and checkout.
- [x] Enforce `allowGuestCheckout === false`.
- [x] Provide guest-safe order confirmation using tracking token or checkout token instead of authenticated-only order lookup.

## Phase 3 - Payment And Order Lifecycle

- [x] Split checkout finalization from payment authorization for card payments.
- [x] Do not mark checkout completed or cart converted until the payment path reaches a valid terminal state.
- [x] Keep manual invoice/COD as explicit pending-payment order flows with clear status and customer instructions.
- [ ] Ensure Stripe success UI waits for backend order/payment status confirmation or shows a pending verification state.
- [x] Add recovery for failed/abandoned payment so customers can retry without rebuilding the cart.
- [ ] Make payment method availability depend on provider configuration, not only display settings.
- [ ] Normalize Stripe/PayPal/manual statuses into one order/payment state policy.

## Phase 4 - Inventory Runtime

- [x] Add missing inventory alert schema or remove runtime references until implemented.
- [x] Add missing indexes used by inventory queries: adjustment date/type and alert status/product.
- [x] Add missing fields used by inventory adjustment writes, including order linkage if retained.
- [x] Wire stock reservations into checkout review/payment start.
- [x] Commit reserved stock only after paid/manual-order acceptance according to payment method policy.
- [ ] Release reservations on payment failure, checkout cancellation, or expiration.
- [x] Add cron for expired stock reservations.
- [ ] Make stock display use the same effective availability logic as backend validation.

## Phase 5 - Shipping, Tax, Discount, And Provider Configuration

- [ ] Ensure manual shipping fallback has a priced rate or blocks checkout clearly.
- [ ] Prevent stale/zero shipping totals when a selected manual method has configured cost.
- [ ] Ensure address changes invalidate quote and selected method consistently.
- [ ] Apply `pricesIncludeTax`.
- [ ] Support shipping tax when configured.
- [ ] Support product/variant tax class in tax calculation.
- [ ] Expand discounts with minimum subtotal, product/category applicability, free-shipping behavior, per-customer usage, and stacking policy.
- [x] Make discount usage increments atomic with order creation/payment policy.

## Phase 6 - Storefront UX And Operations

- [x] Fix guest confirmation and account order-history wording.
- [x] Change confirmation copy so unpaid orders are not called paid/confirmed.
- [ ] Add payment retry and abandoned-payment restore flows.
- [ ] Add separate billing address option or explicitly label billing same as shipping.
- [ ] Add customer-facing instructions for manual invoice/COD.
- [ ] Add operational notifications for order created, payment succeeded/failed, shipment, and refund.
- [ ] Add admin views for inventory alerts/reservations once schema is repaired.

## Phase 7 - Verification

- [x] Run focused backend commerce tests.
- [x] Run website shopping route type checks.
- [x] Run admin/backend type or Convex generation checks as far as the existing repo allows.
- [x] Document remaining non-blocking risks separately.

## Verification Notes

- `bun test src/routes/_marketing/products/-variantSelection.test.ts` passes.
- Focused website typecheck grep for shopping routes, plugin gate, settings context, and route tree returns no matching errors.
- Full website/admin typechecks remain blocked by pre-existing site-wide/admin issues outside this shopping hardening pass, including auth/search route search typing, support implicit `any`s, admin JSX/project configuration noise, and existing Convex deep type instantiation errors.
- Remaining unchecked items are larger product requirements that still need separate implementation before broad commerce GA: provider-aware payment enablement, complete tax policy support, advanced discount policy, payment verification UX, reservation release on explicit failure/cancel, and aligned storefront stock display.
