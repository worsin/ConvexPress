# Customer order receipt display

Root observed a published Depot order with a$38 item and$45 total, but no$7 shipping amount in the summary; carrier/service repeated `Utah delivery • Utah delivery`. Inspection confirmed `commerce.orders.getMineById` returns `enrichOrder`, which spreads the stored order (including subtotalAmount,discountAmount,shippingAmount,taxAmount,totalAmount,currencyCode). All four order surfaces rendered only discount/total. The purchase-ledger schema also provides these amounts, but its receipt branch only rendered total.

Changed only Website order presentation: Core,Journal,Depot and Aster dashboard.order now render the same saved subtotal/discount/shipping/tax/total rows through `src/lib/commerce/order-summary.ts`. Positive discounts receive a deduction sign, known zero amounts remain visible, and the stored total is never recalculated from items. Existing currency formatting convention is preserved; unknown amounts show `Not recorded`, malformed amounts `Unavailable`, and missing/invalid currency remains explicit instead of defaulting to USD. Line/payment display on these same surfaces uses the guarded formatter as well. Missing shipping-method metadata no longer implies shipping was unnecessary.

Carrier/service labels preserve authored spelling, normalize surrounding/repeated whitespace, and suppress case-insensitive equivalents. Distinct services remain visible. This applies to the order summary and shipment rows. No backend/payment/order records, checkout computation, provider API, routing or canonical block foundation changed.

Verification:4 local tests/18 assertions pass. The actual four template components render32 receipt scenarios across storefront/purchase branches, normal USD,discount/tax EUR with an intentionally inconsistent stored total,missing historical amounts, and missing currency. The SSR test substitutes only navigation Link/hooks; actual pack parts and order rendering execute. Pure tests cover known zero, missing/null/nonfinite/fractional values and equivalent/distinct carrier/service names. Full Website TypeScript passes (empty `/tmp/convexpress-order-display-final-types.log`); scoped diff check passes. No browser, provider or deployment actions were run by this agent.

Root acceptance steps:

1. Publish the Website source through the existing release workflow, then reopen order `qs7e8wpr7pfcbhs7bet5yd6w8n8dve13` in the existing authorized customer session. Confirm Subtotal$38.00,Discount$0.00,Shipping$7.00,Tax$0.00,Total$45.00 against the order's actual recorded amounts; if stored fields differ, the UI must follow those values.
2. Verify `Utah delivery` appears once within each carrier/service field and distinct carrier/service names still both display.
3. Check all four packs at390px and desktop: five amounts are readable with their labels, totals remain emphasized, and the longer receipt does not introduce page overflow.
4. Existing saved orders with missing historic fields must show `Not recorded`, never fabricated zero; known zero fields remain currency-formatted. Local fixtures cover this without manufacturing live orders.

Original root evidence: `output/aster-house/dashboard-acceptance/depot-orders-qs7e8wpr7pfcbhs7bet5yd6w8n8dve13-390.png`. New published/browser acceptance is pending root verification.

## Published acceptance — September 5

Root published this Website source through the actual native staging publish button. Release `nx74z1f2rh7ht9ay40nwdf8xsd8dtj8e` succeeded with artifact SHA-256 `3704d22f77508297b8fc7c9b8ef8dc496a41635809810799f819d332dcb22e26`. This supersedes the pending published-verification status above.

The actual synthetic customer's order API recorded subtotal 3800, discount 0, shipping 700, tax 0, total 4500, currency USD. All eight rendered checks (Core, Journal, Depot, Aster × 1440/390) show the corresponding $38.00 subtotal, $0.00 discount, $7.00 shipping, $0.00 tax and $45.00 stored total. They passed label/price checks, showed no duplicate carrier/service string, retained one main landmark and had no document horizontal overflow or page errors. Root personally inspected the new mobile Depot summary.

Evidence: repository-root `output/aster-house/order-summary/acceptance.json` and its eight pack/width screenshots. The JSON was read back locally to confirm all eight checks, empty errors and the recorded amounts; no browser or live API call was made by this subagent. Missing-history and alternate-currency cases remain local test coverage, not manufactured live order data. The same release also carries root's support-copy repair; the recorded support render has no unconditional email-delivery claim (`support-copy-390.png`). No payment or order values were changed by this presentation repair.
