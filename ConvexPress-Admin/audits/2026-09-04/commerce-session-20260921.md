# Shared commerce-session isolation — September 21

**Frontend settlement defects are repaired. Full commerce/block acceptance remains open: 22/137 blocks verified and eight original audit items accepted/sixteen open.**

## Confirmed defects and implementation

The prior hook used one module-global memory session and deduplicated pending settlement only by shopper/token. It did not scope settlement to site runtime, Convex client or authentication session. Its returned readiness compared only shopper identity, so an old settled token could become immediately usable after authentication recovery or a new login by the same shopper. Six of the first eight actual-hook regressions failed before repair.

The hook now uses site-scoped memory/storage, client-local pending requests keyed by site/login/token, and a render-time authority generation. State is usable only after settlement for the current site, client and login. Obsolete success/failure handlers cannot publish state or overwrite storage. Clerk and Convex must agree on signed-in/signed-out readiness; a separate regression proved that the previous condition dispatched while Clerk was signed out but Convex still reported the old authenticated session. StrictMode and concurrent consumers still share one current request.

Storage uses one JSON record per deployment URL/instance. The old per-origin token is adopted by the first upgraded site only after a durable legacy-scope claim; later sites get separate records. Owner changes still rotate tokens, while anonymous-to-customer transitions preserve the guest token for backend validation. A scoped in-memory session takes precedence over stale storage, including when quota failures prevent writing the server's replacement token. The quota regression also failed before its repair. Legacy records contain no historical site identity; the first-upgraded-site migration retains the existing per-public-origin assumption, with backend ownership validation still required.

No backend schema/function/deployment, provider configuration or canonical content contract changed. This client guard supplements the existing backend ownership checks; it cannot replace them.

## Verification

- Final focused tests: **16 passes/52 assertions** (nine actual-hook cases and seven storage cases). Coverage includes settled/pending site changes, same-shopper fresh login, auth recovery, account round trips, Convex-client replacement, concurrent StrictMode consumers, disagreeing auth providers, storage-disabled site returns, legacy migration, owner rotation, corrupt/foreign storage and failed writes. Mock-heavy hook tests run in a subprocess wrapper to avoid contaminating unrelated suites.
- The wrappers also pass alongside the existing shopping-assistant lifetime suite. Website TypeScript, focused lint, whitespace and the final production build pass. No unchanged full backend or block renderer suite was rerun for this hook-only repair.
- Real built Website and two disposable Clerk development customers: guest add → actual password/test-code sign-in preserves its cart token and line; a subsequent signed-in add binds the cart to the first site's customer record. Sign-out rotates the browser token and shows empty. The second customer sees empty and receives backend `FORBIDDEN` when querying the first customer's cart with its token.
- A subsequent fresh login/sign-out on the build containing the provider-readiness fix passed. The final storage-quota correction was then verified by its regression and by the final built mobile Website's guest add/reload/remove flow. No authentication result or cart query was mocked in the live runs; test accounts used Clerk's development email code. These observations do not simulate an in-place production database swap or establish payment-provider behavior.

## Confirmed next issue

**Returning-customer cart recovery is unfinished.** After sign-out and a fresh login as customer one, the browser shows an empty cart while an authenticated read of that customer's earlier token still returns its two-item owned cart. The backend `cart.ensureCart` can recover/rebind an existing owned cart on a later addition, and `cart.merge` exists, but automatic sign-in recovery is not wired into the current settlement flow. Fix the legitimate-owner recovery/merge path without reintroducing foreign-account access or duplicate line merging. This finding is separate from the repaired frontend readiness defects and remains a production gate.

## Preservation and tracking

The owned cart was emptied using its authenticated owner's mutation; the final guest cart was emptied through the UI. Both customers signed out; only their newly created local profiles were deactivated and their Clerk test users were deleted with 404 readback. All 42 pre-existing pages and appearance values match the baseline. Owned browsers closed; no order/payment was submitted. No user-owned customer credentials were used.

Artifacts: `output/commerce-session-20260921/`, including failing-before logs, `final-tests.log`, `live-browser.json`, `final-guest-browser.json`, cleanup receipts and screenshots. MagicTables updates only Cart CTA and Shopping Assistant Band Notes, with all 137 rows compared against the exact expected result. No block or original audit item receives full signoff from this checkpoint.
