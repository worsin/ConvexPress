# Checkout acceptance repairs

The parent observed a signed-in customer's empty checkout contact email, `Cart, 1 items`, and a fresh site's unconfigured Standard/Express choices with provider-priority implementation text.

## Contact and cart

Checkout previously populated only from `session.email`, while automatic session creation supplies no email. It now uses the existing authenticated `useCurrentUser` profile as the default, with precedence: local edit (including deliberately cleared input), saved checkout contact, account email. Deriving the untouched default avoids overwriting user input when either query hydrates or refreshes. Contact is saved through the existing Continue action. Header cart names use `1 item` and plural `items`.

## Shipping behavior

There are two existing configuration paths. Legacy `commerce.general.shippingMethods` contains only code/label pairs and has always charged zero. Canonical shipping zones have actual flat/weight/dimensional/price/quantity/free/pickup/delivery/table method configurations whose calculators generate priced, address/cart-bound quotes. Checkout already validates and charges those persisted quotes.

The defect was the public `fetchCheckoutRates` entry point: `liveRatesEnabled:false` returned no quotes without running any zone method. It now always calls the canonical pipeline; only carrier requests are disabled by that flag, including explicitly configured live-rate zone methods. A real pipeline test with a configured $7 flat method produces and persists 700 cents without calling the disabled carrier. A real checkout mutation charges $38 + $7 = $45; an accepted free-shipping coupon still makes shipping zero and total $38.

Fresh settings and the Admin editor no longer invent Standard/Express methods. Existing saved legacy methods remain intact for compatibility, and Admin identifies them as free methods; priced rates belong in Shipping zones. Customer surfaces across all four packs now say **Calculate delivery options** and explain address/prices without provider priority, carrier configuration, or implementation branding. Explicit legacy options show **Free**. Empty configuration offers no invented shipping choice and cannot continue for a physical order.

The parent separately configured only the fictional staging site through normal APIs. `output/aster-house/staging-shipping-recipe.md` documents full-snapshot settings writes, including null raw-document fallback to effective settings with metadata removed; Utah zone/method discovery and ID persistence; $7 major-unit flat pricing; and address matching. No live mutations, provider calls, order creation, payment or email execution were performed by this agent.

## Verification

- Real shipping entry/pipeline/checkout tests: 4 pass / 13 assertions, including disabled carrier calls, configured charge and free-shipping benefit.
- Existing shipping, commerce hardening and shipping guard suite passed 186 tests / 431 assertions before the additional charge test; the added charge test separately passes.
- Contact prefill/edit-preservation: 3 tests / 6 assertions pass.
- Four actual pack surfaces rendered offline: 4 tests / 24 assertions pass, including $7.00, customer-facing calculation copy, and no phantom methods. Only route Link rendering is substituted; this is static render proof, not browser acceptance.
- Typed staging recipe: 10 public API payloads plus actual flat-method document config schema pass.
- Both frontend typechecks, scoped frontend lint, template sync/check and scoped diff check pass.

Integrated backend typecheck exposed preexisting recursive generated API inference boundaries after the combined source changes. Explicit finite RegisteredAction contracts on shipping/dunning and the content agent's corresponding KB/WordPress boundaries resolve the dependency cycles without runtime logic changes or new diagnostic suppression. Obsolete unused suppression comments are removed only where the compiler proves them unnecessary. A dunning regression preserves zero-due and missing-invoice handling (1 test / 4 assertions). Final integrated backend and regenerated consumer contract results will be appended once complete.

## Final integrated checks

The backend typecheck is green after explicit registered-function boundaries on dunning, KB syncArticle, WordPress credential lookup/connection test, and shipping; no new suppressions were added. Compact API generation stabilized at 2003 functions / 1872 terminal DTOs, retaining the existing 440 unknown boundaries. Both frontend typechecks pass against regenerated declarations, and all 18 API compiler fixtures pass.

Final scoped backend suite: **188 tests / 439 assertions pass** across shipping, commerce hardening/quote guards, and dunning. Final contact + four-pack render checks: **7 tests / 30 assertions pass**. The parent owns deployment and the final signed-in contact / configured Utah $45 rendered acceptance. Recipe wording identifies the old deployed settings replacement behavior; full-snapshot authoring remains compatible with the parent's subsequent settings-merge repair.

## Live quote listing follow-up

Root observed a persisted $7 Utah quote but an empty `listCheckoutQuotes`. Reproduced offline with the actual public rate action, rate pipeline, quote persistence, listing query and checkout selection: before repair listing returned zero rows. The pipeline normalized address components to uppercase/trimmed values while checkout/listing/frontend compared raw casing. Additionally, the first rate request did not save its entered address to the checkout session.

The canonical pure checkout fingerprint now trims and uppercases address components; the address-validation/rating helper re-exports it. Every pipeline cart key uses the same helper. The standalone Website receives an exact generated mirror, and the API contract check rejects mirror drift. The public rate action first saves the requested address using the existing public checkout mutation, which preserves ordinary invalidation and total calculation. Website local comparison uses that canonical helper; user address edits survive reactive quote/session hydration. Existing raw-key quotes fail closed and are replaced by calculating delivery again.

An additional failing regression proved that a cart modified during rating could stamp the old calculation with the new cart key. All calculators now retain the same cart snapshot as the carrier request, and persistence uses its original key. Listing/selection reject results after cart edits instead of accepting stale prices. Four pack shipping views also use one label formatter, removing repeated identical manual carrier/service names while preserving distinct carrier/service labels.

Verification: 188 backend shipping and commerce handler tests passed, 451 assertions. The real cross-pipeline regression verifies address saving, the exact uppercase fingerprint, quote listing, selection charging 700 cents and a 4500-cent total, normalization-equivalent edits, changed address/cart rejection, expiry rejection, and edits during rating. Nine Website helper/actual four-pack SSR/contact tests passed, 39 assertions. Backend and Website typechecks passed; scoped Website lint and global diff whitespace check passed. Compact API contracts regenerated (2003 functions, 1872 DTOs, unchanged 440 existing unknown boundaries). No live calls, provider requests, deployment, commits or pushes were performed by this agent; root owns deployed acceptance.

### Persisted review label

Root subsequently verified live shipping and the $45 review, which still displayed the duplicated stored manual label. Added a failing actual-chain assertion for both `selectedShippingMethodLabel` and the active checkout shipping-method record. Moved `shippingQuoteLabel` into the canonical backend pure helper and made the Website formatter re-export its generated mirror; backend selection now stores the same deduplicated label used by all four shipping surfaces. Historical order labels are not rewritten. Eight targeted backend tests passed (38 assertions), six Website helper/four-pack SSR tests passed (33 assertions), Website types and 18 API contract compiler fixtures plus mirror parity passed. No deployment or live writes.

## Closed-cart lifecycle follow-up

Root created the synthetic invoice order for 4500 cents (700 shipping) and observed that its converted cart remained visible. Production handler regressions confirmed `getMine` returned converted/merged cart contents, the next add attempted to reuse the closed cart, clear could delete historical lines, checkout updates could alter placed sessions, and login merge could reclaim closed carts.

The public cart, storefront count/recommendation, and assistant projections now exclude converted/merged carts. On the next add, the old cart retains its status, items, totals, and order linkage; only its browser-session lookup binding is retired to an ID-specific internal key before a fresh active cart is created. Original order and checkout-session tokens remain unchanged, preserving historical access and associations. Active/abandoned carts retain their normal continuation behavior; pending-payment carts remain visible and locked. Clear and coupon changes use the existing active-cart authorization guard, and placed checkout updates are rejected.

The second-cart regression also exercised normal checkout-session creation followed by the shipping context query. That query had assumed checkout-session uniqueness per browser token; it now uses the same active-session selection policy as checkout, so historical completed sessions cannot break subsequent rating.

Wishlist movement was another add entry point with a separate raw cart/line insertion path. It now calls the normal public cart add mutation, preserving stock/pricing/membership/totals and the repaired closed-cart lifecycle before removing the saved item. A regression proved its old path left the new cart count/totals at zero. A separate denial regression proved the move endpoint lacked the ownership check already present in wishlist removal; it now requires the authenticated wishlist owner before touching cart or wishlist data.

All verification is offline with the in-memory DB adapter executing production handlers. No deployment, live writes, provider requests, commits, or pushes were performed by this agent.

The Website details step now resumes/creates via the idempotent checkout creation mutation and recognizes completed/failed/abandoned sessions when beginning another cart; loading/active sessions do not create competing checkouts. This closes the frontend path that previously attempted to update the historical completed session. Targeted backend checks passed: 197 tests, 515 assertions. Website contact/session/label helper checks passed: 7 tests, 19 assertions.

### Closed-cart verification checkpoint

The complete backend TypeScript check passed (`bunx tsc --noEmit -p convex/tsconfig.json`, exit 0; `/tmp/closed-cart-types38.log`). The legacy generated API graph required explicit finite registered handler contracts across affected lookup/mutation modules. These contracts preserve the validators and actual document/DTO results; no new diagnostic suppressions or broad API casts were added. Incorrect legacy index-callback type annotations and now-unneeded suppressions were removed within the bounded handlers. Ticket message and WordPress sync handlers were repaired in batches to avoid continuing one-handler-at-a-time inference failures.

Two additional runtime defects were exposed by those accurate types and fixed with actual-handler regressions. KB untagging passed an article-tag ID to the bookmarks table delete API; it now deletes the association from the correct table and retains unrelated bookmarks. Both tagging and untagging now apply the existing article author's `kb.editOwn` / other-author `kb.edit` capability policy, closing the signed-in customer write gap. WordPress sync permits legacy jobs without taxonomy progress in its schema; initialization now fills absent progress with canonical zero defaults while preserving existing counters, and statistics safely report zero absent taxonomy counts. The regression reproduced the previous undefined-property crash before repair.

Fresh scoped backend verification passed **212 tests / 605 assertions** across 17 files, including production closed-cart, wishlist ownership, quote pipeline/list/selection, hardening, KB tagging, and WordPress sync handlers. Website contact/session/fingerprint/label helpers and all four actual shipping pack surfaces passed **11 tests / 47 assertions**. These are offline handler and render checks; parent-owned deployed acceptance remains separate.

Final consumer checkpoint: backend typecheck passed again after correcting the custom-field stored/default value contracts to the schema's `string` / `string | null` types (`/tmp/closed-cart-types39.log`, exit 0). Compact generation stabilized at **2003 functions / 1871 terminal DTOs / 438 existing unknown boundaries**; unknown boundaries decreased from the previous 440. Fresh Admin and Website typechecks both passed against those generated declarations, as did all **18 API compiler fixtures**, exact canonical shipping-helper mirror parity, scoped checkout lint, and global `git diff --check`. Logs: `/tmp/closed-cart-{admin,website}-types-final.log`, `/tmp/closed-cart-contract-check-final.log`.

Root reported both staging and production cloud deployments completed successfully with the runtime closed-cart and persisted-label changes, before the last custom-field type-only correction. This agent did not perform deployments. The second completed order and refreshed cart badge remain root-owned rendered acceptance; source, handler regression, and consumer checks are complete.


## Root live repeat-checkout acceptance — September 5 UTC

Both cloud backends contain the closed-cart and persisted shipping-label repairs. A fresh Website hosting build passed (138 assets; 3,918,937 Worker bytes), then actual native Publish website created release `nx7462ynsqjjr5d41d264e9f7s8dtes6`, artifact `e543dc5b1d61c1c61d7ffa00db43841bb40bb58c5360c3e24a0ffa91fa424b4e`. The preceding publication reused the prior prebuilt artifact; it is not evidence for the new frontend.

The real synthetic customer browser showed an empty cart after the first order, added another Forest camp mug, and completed a second manual-invoice checkout. Persisted order `qs7e8wpr7pfcbhs7bet5yd6w8n8dve13` / `CP-2026-428643` has 3800-cent subtotal, 700-cent shipping, 4500-cent total, and exactly `Utah delivery` as its selected shipping label. The confirmation breadcrumb reads Order confirmation. The original enriched order was identical before and after. The second converted cart then rendered empty, and the product displayed stock 22 (previously 23). Browser captured zero page errors. Email enabled=false was verified immediately before placement; no payment was charged. This proves manual invoice and repeat-cart behavior, not live card settlement/refunds. Evidence: `output/aster-house/site-run.json` and `second-order-confirmation.png`.
