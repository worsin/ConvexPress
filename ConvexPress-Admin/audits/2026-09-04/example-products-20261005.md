# Depot product catalog and demo checkout

## Demonstrated display blocker

1. Required workflow: a shopper must confirm the selected linen Pair variant in cart and checkout review.
2. Evidence: live Depot Pair selection showed $34/SKU EXAMPLE-LINEN-OAT-PAIR, but review showed parent EXAMPLE-LINEN-OAT without the option summary. Completed synthetic order independently retained the correct Pair, price and inventory.
3. Dependency: cart.getMine/getShared return resolved `item.variant`; Website cart helpers consumed only optional metadata. The normal addItem path does not populate variant display metadata. All packs shared this mismatch; three review/shared surfaces also omitted variant details entirely.
4. Repair boundary: use resolved variant title/options/SKU in Website display helpers, wire cart/drawer/shared/review consumers and their read-model types. Preserve bundle labeling and metadata fallback for older snapshots. Replace Depot's unsupported warehouse assertion with delivery options at checkout.
5. Exit check: regression tests, four-pack rendered review/shared tests, types/build, then actual Depot browser review and cart with Pair details; no second order required.

## Live authored resources

Three individual original image_gen assets uploaded through normal media API: active, four generated sizes each. Three categories Tableware/Linens/Workspace bound to existing owned products. Linen Single $18/24 units and Pair $34/12 units created through normal option/variant APIs. Config recorded in examples/sites/resources/depot-catalog.json. Checkout uses only manual_invoice labeled Demo order — no payment collected and manual free delivery labeled Demonstration delivery — no shipment. No real fulfillment.

Browser selected Linens (one result), then Pair ($34, 12 stock), added it and completed contact/shipping/payment/review/confirmation with synthetic identity. Order CP-2026-897842 / rn7fqqws5gqrtfc0zy3r9npqz18fr9jq is pending, unfulfilled, payment pending, no transactions. Exact Admin readback: Pair variant v97431mp00b0zbwhz1dc6w5te18fss88, quantity1, 3400 USD cents, variant stock11, Single unchanged24. Retained as reviewable synthetic evidence.

## Retry discipline

First public product DTO check incorrectly expected categoryIds; authenticated get verified the acknowledged writes and neither was replayed. A numeric weight in the setup script was rejected by the string validator; authoritative empty listVariants proved no write before corrected string input. All11 catalog operations are acknowledged or reconciled-no-write, none pending. Script-owned sessions revoked and refresh401 verified. Original site databases/user sessions/processes untouched.

Evidence: output/example-products-20261005/{media,before,catalog,order-readback}.json. Receipts are local ignored evidence; do not rerun completed setup scripts.

## Verification and retained runtime

Three new helper regressions failed first (missing resolved variant, stale metadata precedence, title fallback), then passed. Focused commerce suite:41 tests/170 assertions; isolated four-pack review/shared rendering:8 cases/28 assertions (included via wrapper in41tests). Recipe validation:5tests/83assertions. Website TypeScript and final production client/server build pass. `git diff --check` passes. Build uses output/example-products-20261005/dist with the same app node_modules symlink convention as the prior isolated artifact; the first preview request exposed the missing symlink, then recovered after it was added.

Only owned Depot preview PID111 was replaced; current PID3623/localhost4327 uses the new artifact. Core/Journal/Aster previews retain their earlier artifact; final common-candidate parity remains Task8. Source/target backend deployments and owner Electron/Admin/BlockDemo processes untouched.

Actual rebuilt browser cart and review both display Set size: Pair, EXAMPLE-LINEN-OAT-PAIR and $34.00. The second review-only cart was cleared normally without submission. Final authenticated order list total1; original pending order has zero transactions,Pairstock11/Single24. All3 catalog images loaded (naturalWidth422), Linensfilter one result. Screenshots: output/example-products-20261005/{catalog,cart-pair,review-pair-fixed,order-confirmation}.png.

Audit40 read: accept its no-new-findings/in-scope evidence assessment; retain its qualifier that SSR routes do not certify full-site acceptance. Incoming deep audit remains advisory. No native or complete responsive acceptance claim;117Verified/20Inprogress unchanged. No push.
