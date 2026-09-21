# Commerce hardening outcome — September 4, 2026

Scope: B01, B02, B03, B04, B05 and B09. Worktree: `/Users/worsin/.codex/worktrees/convexpress-hardening`, branch `codex/convexpress-hardening`.

Implemented locally:

- **B01**: Payment creation failure addresses the local transaction ID before a provider ID exists. Both Stripe and PayPal creation paths now fail their transaction/session/collection consistently, allowing a fresh customer attempt. Stripe creation has a provider idempotency key. Failure callbacks preserve settled transactions and do not revive canceled orders; fresh initiation rejects canceled orders.
- **B02**: Refund actions preserve provider pending states. Confirmed success adjusts accounting once, and stale pending/failure or duplicate success cannot undo settled refunds. Stripe refund creation includes the local refund ID in metadata and uses provider idempotency keys. Signed individual refund events and charge-refund events reconcile through the same internal handler, validating provider, payment ID and amount. PayPal pending/completed/failed refund notifications use the same reconciliation path, and its creation request has a provider request ID. A late payment-success event cannot overwrite an already refunded transaction. Signed HTTP testing additionally exposed the synchronous Stripe signature-verification call being incompatible with the runtime's WebCrypto provider; it now uses `constructEventAsync`.
- **B03**: Bulk cancel, bulk status and single status operations use one transition handler. Payment and fulfillment status, inventory allocation/restoration, digital fulfillment, order history/change records and purchase synchronization follow the same path. Repeated statuses and duplicate bulk IDs do not allocate inventory again.
- **B04**: Coupon evaluation resolves identity and order/redemption history on the server. Email-restricted, new-customer and per-user-limit coupons require a signed-in customer; a guest-provided email cannot establish eligibility. Final checkout revalidates active dates, limits, eligibility and discount amount. A coupon changed since the cart was priced asks the customer to refresh. Durable per-order reservations prevent competing checkouts from using the last available redemption. Payment or accepted manual checkout consumes a reservation once; explicit order cancellation releases an unconsumed reservation. Indexed history queries avoid reading every past use of a popular coupon; unusually large relevant histories fail closed for operator review.
- **B09**: Coupon free-shipping benefits are carried separately from dynamic-pricing benefits through cart, checkout/session, shipping/tax totals and order snapshots, and are cleared on coupon removal.
- **B05**: Due subscription offer changes apply before renewal invoice creation, including direct invoice-generation callers and sweeps that create no invoices. Renewal invoice lines exclude canceled historical items. A scheduled lower price is used at the effective billing boundary.

## Verification

- Added `commerce/__tests__/hardeningHandlers.test.ts` and a minimal in-memory DB adapter. These call the actual registered production handlers; the adapter does not duplicate lifecycle implementations.
- Initial six regressions: **0 pass / 6 fail**, reproducing all six original defects before fixes.
- Final added regression coverage: **18 pass / 0 fail**. Includes successful/failed payment creation, bulk/single inventory parity, paid/fulfilled state, refund pending/failure/success and out-of-order callbacks, actual cryptographic Stripe signature verification, checkout expiry of coupons, last-use reservation/cancel release, per-customer restrictions, one-time consumption, free-shipping order totals and actual downgraded invoice amounts.
- Scoped commerce/subscription/returns suite: **475 pass / 0 fail**, 27 files, 853 assertions. `commerce-tests.log` contains output.
- Backend TypeScript check: **pass**, `commerce-backend-typecheck.log` is empty on success.
- Stripe action tests replace only the SDK resource method with a scoped spy restored in `finally`; no provider request, live payment/refund, email, deployment, browser launch, commit or push was performed.

## Schema and rollout

Additive optional fields: `freeShippingByCoupon` on commerce carts, checkout sessions and orders; `status` on discount usages (`reserved`, `consumed`, `released`). Additive indexes: refunds by provider refund ID; discount usages by discount/status, discount/user and discount/email. Existing usage rows remain compatible and count as historical consumed uses. No top-level schema export is needed.

Existing provider refunds are reconciled when their provider refund ID has been persisted. Newly created Stripe refunds also correlate an early webhook by local refund ID metadata. Refunds created wholly outside ConvexPress are not synthesized into local refunds by this change. Durable pending-order coupon reservations intentionally survive a payment retry; operators release abandoned reservations by canceling the pending order. No live data migration or provider/browser acceptance was run in this task.
