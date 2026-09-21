# Cart CTA container repair and live acceptance — September 21

**A real responsive-layout defect is repaired. Full Cart CTA signoff remains open; the tally stays 22/137 verified and the original production audit stays eight accepted/sixteen open.**

The existing viewport breakpoint kept three desktop columns when Cart CTA was placed inside a narrow content column. The new browser regression reproduced a 420px column squeezing valid authored copy into a tall strip beside its actions. A named inline-size container now switches the block to a stacked layout at 50rem of available content width. Wide blocks retain their horizontal layout. Saved attributes, renderer contracts, cart data and backend behavior are unchanged.

## Current evidence

- The failing-before layout assertion is retained. The final case passes 420/760/1200px authored columns in all four packs through ready, large-total, payment-pending, empty, loading, unavailable and ready-again states. It checks child containment, action placement, correct checkout availability, stale-total removal and keyboard focus.
- Both existing desktop/mobile commerce-state cases pass, including Cart CTA and unchanged Bundle/Comparison checks. Current renderer suite: 297 passes/5,143 assertions. Website production build, demo TypeScript, focused lint, whitespace, canonical freshness, catalog and all 77 kit distribution files pass.
- The actual Electron editor inserted Cart CTA from its catalog; authored title and empty copy survived save/reopen. The disposable document was published, withdrawn and restored to its original editor with zero blocks.
- The built Website started with authored empty copy. Its shop link led to the actual catalog; adding the existing disposable downloadable product produced one item and its correct free subtotal. Quantity changes made through the Cart page appeared as two items. Keyboard activation of Continue to checkout reached the actual checkout contact step; no checkout submission or purchase was made. View basket reached the actual Cart page. Removing the line restored authored empty copy.
- Public desktop1440/mobile390 checks and screenshots passed. Selected Core mobile, Journal medium-column empty, and Depot narrow-column large-total screenshots were inspected. Existing four-pack authored-example and reduced-motion evidence is reused; this CSS change adds no animation.
- A fresh server response while the visitor had two items rendered the Cart CTA loading state without its visitor count or subtotal. This supplements the unchanged host-projection tests; it is not a signed-in account-transition test.

## Preservation and remaining scope

The guest cart ended empty. Native/API sessions signed out, the native/browser test processes closed, the private profile was removed and the fixture was trashed. Full comparisons preserve all 42 pre-existing pages and appearance values. No catalog, provider, schema or installed-backend change occurred.

Artifacts: `output/cart-family-20260921/`, including `before.log`, `after.log`, `commerce-states.log`, `native-public.json`, `cleanup.json` and reviewed screenshots. MagicTables receives one Notes-only update, with all 137 rows compared against the exact intended result; acceptance flags stay unchanged.

Existing full-acceptance gaps remain: signed-in cart-owner/account-switch browser flow, real pending/completed payment transitions, and the shared currency formatter's two-decimal assumption. Synthetic pending-payment states do not prove provider behavior. The earlier real paid-price guest evidence remains in `output/cart-cta-20260910`; it is reused without claiming it covers these gaps. Checkout lifecycle production requirements remain open.
