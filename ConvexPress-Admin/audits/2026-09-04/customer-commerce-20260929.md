# Customer-commerce acceptance — September 29, 2026

Four rows accepted: `core/reviews`, `commerce/cart-cta`, `commerce/wishlist`, `commerce/download-library`. MagicTables readback: **112 Verified / 25 In progress / 137 total**. Only these four rows' Status, Tests and Screenshots changed; all137 Notes and unrelated cells are exact. `commerce/assistant-band` and `commerce/recently-viewed` remain In progress for the specific gates below. Counts are block-library acceptance, not overall delivery completion.

## Actual customer and native evidence

Two disposable development Clerk identities were created with the real customer/subscriber role. Both completed the Website's sign-in flow, using Clerk's development test verification code where requested. Credentials and bearer tokens stayed in private local files. These are customer browser sessions, not operator sessions described as customers.

An owned real Electron instance authored all six blocks: Reviews source/product picker/limit/minRating, all Assistant Band text/prompts/reorder/action fields, Recently Viewed title/limit, Cart CTA title/empty text, Wishlist heading/empty text/browse link and Purchased Downloads heading/empty text/help link. Saved revision4 reopened correctly. A temporary revision5 was independently matched to its revision-history snapshot and restored as revision6; the exact original block tree and title match. Actual Website Mobile preview rendered the authored content. Native errors were empty, and the owned session signed out and closed.

## Accepted rows

- **Reviews:** real customer-created reviews were approved through the normal operator API on owned fictional products. Native source/product/filter/limit edits passed. The published site displays bounded cards and the correct page-scoped summary, navigates two reviews then the remaining review, and returns to the first page. Maximum filter and unselected-product states render correctly. Existing current-source authorization, cursor-binding, private-product, rating-index and full-product-summary regressions pass; no private customer/order/moderation fields are presented. These are explicit synthetic reviews, not endorsements.
- **Cart CTA:** actual customer wishlist-to-cart and ordinary product Add to cart controls produce one $18 item, then a second tab updates to two items/$42. A closed cart from the zero-value download fixture transitions to a fresh active basket on the next normal add. Sign-out/account change produces an empty new visitor basket. Native copy and all four pack/width states pass. Payment settlement is not a block acceptance claim.
- **Wishlist:** 13 customer-owned private collections prove collection paging. Actual block controls move the notebook to the basket, remove the cup, and choose the empty collection on page2. A distinct real customer sees their own empty state; known foreign list/item requests are refused. Expired offline rows are hidden and fresh rows return after reconnect. All collections/items were deleted through the normal owner operation and completion receipts checked. Existing bounded item-page coverage is reused; this batch's live pagination proof concerns collections.
- **Purchased Downloads:** a customer-owned zero-value manual-invoice fixture was prepared through registered cart/checkout APIs, then marked paid by the operator only after verifying total0 and exact customer ownership. No payment provider was called. Email was disabled before checkout/status operations. Thirteen owned file records reference the existing immutable synthetic ZIP on thirteen owned products, proving the live12+1 download pages. Clicking the actual Website Download button returned **30,409,237 bytes**, SHA-256 **e815f2d14b45ecaae13c9c2583e99105bff56eb7386030f9a24f45f6105d37e6**, and allowance4→3. A second customer is denied the known token. Cancelling the synthetic order immediately removes download actions in the mounted page. Sign-out removes private rows. The order fixture is not a claim of UI checkout/payment-provider acceptance.

## Remaining customer-commerce gates

**Assistant Band remains open.** A real prompt click opens the correct shopping page and preserves the question. The actual response is the safe unavailable state; querying that customer's own thread confirms `missing_api_key`, with no model response. Native fields, pack layout and foreign-session refusal pass, but actual model response/history and assistant cart tools remain unproved. Reuse configured connections if a valid provider becomes available; do not substitute a canned answer or change billing.

**Recently Viewed remains open for actual site switching.** Real signed-in product visits display notebook then cup with the authored limit2. Withdrawing the notebook to private removes it from the mounted history; the same browser's sign-out and switch to customer2 show empty history and no private wishlist/download/cart leakage. All four packs/widths pass. Existing source binds storage to backend URL, instance and customer, and controlled tests cover scope refusal; those are not a substitute for the remaining real site/environment switch. Complete that narrow gate next, preserving both databases and runtime identities.

Script Embed's separate Vimeo gate also remains open from the preceding batch. Tasks4–8, E18/E22/E28 and the full goal remain open.

## E56 — valid long download help link widens desktop page

The maximum-content matrix reproduced 1440→1737px page width. The help anchor had width1447.5px and `flex-shrink:0`, forcing the heading into41.8px. Isolated change of **only** `flex-shrink:1` gives a173.6px link and restores page width1440. Removing the intervention restores the failure. Mobile390 remains correct. The committed fix changes one declaration in `blocks/commerce/download-library/render.css`, retaining all text and the same action.

The rebuilt Website passes **16 cases**: normal populated customer1 plus maximum/empty customer2, Core/Journal/Depot/Aster ×1440/390. No page overflow or page errors. Maximum inputs include eight160-character questions, declared text limits and160-character link labels. The initial240-character help-label fixture was rejected by the actual160-character link contract before any page mutation; it was corrected, not accepted as a product defect.

## Offline diagnosis and evidence limits

A preliminary offline attempt interrupted a navigation/Clerk script load and later showed a loading document. A fresh context, fully settled before disconnect, proves the actual behavior: after17seconds offline, wishlist/download rows disappear; reconnect restores them in181ms without reload. The expected network-disconnected console message is recorded. No reconnect code change was justified. Existing browsers open across the Website rebuild also needed reload to receive the new asset graph; final matrix contexts were fresh.

## Checks, runtime and preservation

59 focused backend tests/665 assertions pass across reviews, product collection and digital entitlement/library contracts. 25 cart ownership/recovery tests/152 assertions pass. Website renderer wrapper plus commerce-session tests:8pass/21 assertions; the wrapper runs the established renderer suite. Website build and whitespace checks pass. No backend source/deployment change in this batch; the preceding installed external-embeds-reviewed snapshot remains authoritative. These focused checks are not a full-repository green claim.

Owned Website PID67075 / port4322 serves the rebuilt artifact; all six captured runtime values remain exact, including Admin origin127.0.0.1:4105. Owner Electron39198, Admin62672, BlockDemo65092 and SOCKS68390 are preserved. Owned native66154 and both customer browser contexts are closed.

Cleanup deletes **2pages,15products,3reviews,13digital-file records and13wishlists**. Original42pages/11media are exact. The three original product values are exact apart from joined shared category `updatedAt`; category counts remain2. Appearance, commerce, plugin and email **values** are restored. Plugin audit timestamp changes normally. Email was previously default-only and now has a normal materialized record `jd835drcr8ejajhwwqpddvx2sd8fbanx`; its values match the original defaults. No audit metadata was forged or normal deletion replayed after acknowledgement. Consumer index ready; two deleted routes return actual404; owned API session revoked; private profiles removed; Clerk identities deleted and two site profiles inactive.

Retained owned records are explicit: cancelled zero-value order `r178bbqqkbcbrcnpbd4zak6hfh8fbhbg` / `CP-2026-974886`, normal purchase/notification/audit records, revoked entitlement/lease history, wishlist-deletion receipts and normal scoped session/assistant history. There is no normal order-deletion API. Inactive customer IDs: `nh8f7sx74ayw84cntpq1ty38ph8fafzd`, `nh832s77vp4gdwsjas82t8ep2n8fabew`. The shared original storage was reused, not edited or deleted. Prior batches' residual records were preserved.

## Evidence

Local ignored directory `output/customer-commerce-20260929/`: `native-saved-document.json`, `native-exact-recovery.json`, `native-final-proof.json`, `matrix.json`, `overflow-cause.json`, `wishlist-actions.json`, `cart-cross-tab.json`, `reviews-pagination.json`, `download-browser-proof.json`, `download-revocation.json`, `customer-denial.json`, `reconnect-probe.json`, `private-product-withdrawal.json`, `account-switch.json`, `assistant-provider-proof.json`, `cleanup.json`, `category-audit-metadata.json`, `settings-audit-metadata.json`, `mt-accept-verified.json`, `source-provenance.json`, test/build logs and PNGs. This tracked report records the durable interpretation and limits.

Claude audit18 remains the latest, with no new finding. Shared notes record this checkpoint. No push or subagents.
