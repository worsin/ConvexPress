# Returning-customer cart recovery — September 21

Returning-customer recovery is implemented and passes real customer acceptance on isolated source4860. This checkpoint does not complete Cart CTA, Shopping Assistant Band, commerce, or production acceptance. Counts remain **22/137 blocks verified; original audit eight accepted/sixteen open**.

## What changed

Session settlement now recovers the authenticated owner's existing cart token and adopts or combines a guest basket immediately at sign-in. User/status indexes replace the previous full cart-history scan. Stable owned tokens preserve existing checkout identity; legacy non-UUID tokens are accepted only for an authenticated owner of that exact cart, never as anonymous bearer authority.

Merging accumulates duplicate guest lines correctly, reactivates abandoned destinations, checks matching currency/region/channel context, and bounds the number of lines processed. A pending payment keeps its token, amounts and contents. When another basket exists, it remains accessible separately.

Automatic merging runs in a Convex sub-transaction. A stock or other expected product/context conflict rolls back every transfer before the current guest basket is claimed. Both baskets remain available. The signed-in cart page provides indexed, paginated saved-basket lists, Open basket and explicit Combine baskets controls. The server verifies ownership on listing, selection and combination; list responses never contain bearer tokens. Repeating a successful combine does not duplicate quantities.

Selecting a basket updates consumers within the current site/client/login, including when browser storage is unavailable. Late results cannot overwrite a new login/site or a newer basket selection. Other sites and authentication authorities do not receive the selection notification.

## Evidence

- Six original recovery cases: five failed before implementation. Five additional edge cases also failed before their repairs. Final commerce tests: **396 passing** across34files. Full backend: **3,321 passing** across299files; these are overlapping suites, not additive totals.
- Actual commerce hook: **12 cases/41 assertions** including shared consumer updates without storage, stale account results and out-of-order basket selections. Website types/build and focused lint pass.
- The first strict deployment refused recursive inference errors after regenerating full API bindings. Explicit endpoint types repaired that defect; full-binding TypeScript and the subsequent strict deployment pass. No index was removed. Installed snapshot: `ConvexPress-Admin/output/production-checkpoints/cart-recovery-20260921` (1,601 backend files). All22 installed Community Events files preserved; every row in its six tables matches the pre-deployment export.
- Built Website, real Clerk development customers: guest basket claimed on sign-in; sign-out hides it; fresh sign-in restores it; a later guest basket merges to quantity2. No authentication result was mocked.
- A disposable stock-one product created a real merge conflict between two baskets. The source remained at4items and the second at2items, including an earlier line whose transfer had to roll back. The page showed the stock error on explicit Combine. Open basket switched baskets. Increasing stock on the fixture allowed Combine to preserve all6item quantities. The shared header updated to6; keyboard Clear removed the items.
- A second real customer saw an empty basket and received structured `FORBIDDEN` selecting the first customer's saved basket. Its own saved-list query succeeded, distinguishing an ownership refusal from failed authentication.
- Core desktop1440/mobile390 saved-basket screenshots inspected; mobile had no horizontal overflow. No page errors after correcting the owned SSH tunnel. This is not four-pack visual acceptance or a live payment-provider test.

## Cleanup and remaining gates

Both disposable customers signed out, their local profiles were deactivated and Clerk users deleted with404 readback. All three newly created cart records have zero remaining lines, verified by before/after database exports. The disposable stock product is trashed; every pre-existing product record is unchanged. All42 pre-existing pages and appearance values are unchanged. Owned browsers closed and API sessions logged out. No payment or order was submitted.

Live pending-payment/checkout-provider transitions, all-pack saved-basket styling, broader currency behavior and the full cart/block requirements remain open. Guest assistant histories remain stored under their original sessions; combining cart items does not consolidate those histories into one thread. Existing cross-tab behavior after a cart closes/converts still needs lifecycle acceptance, including the older `ensureCart` token-rebinding path. Do not mark the whole commerce system verified from this checkpoint.

Artifacts: `output/cart-recovery-20260921/` contains test logs, strict deployment receipts, live-browser results, screenshot specimens, plugin preservation and cleanup inventory. Initial browser harness mistakes are not product acceptance failures: the tunnel targeted an unbound loopback address; an immediate navigation preceded add acknowledgement; a concatenated button label used incorrect accessible-name spacing; ownership refusals carry their code in `ConvexError.data` while their text is redacted.
