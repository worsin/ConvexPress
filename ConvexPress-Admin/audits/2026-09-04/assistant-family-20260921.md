# Shopping Assistant Band and host isolation — September 21

**Focused repair complete; full block acceptance remains open. The tally stays 22/137 verified, 115 pending, and the original production audit stays eight accepted/sixteen open.**

## Defects and repair

Eight regressions failed against the previous `useAssistant` hook: cached recommendations survived a shopper change with identical cart contents; delayed recommendations survived account round trips, site changes, host deactivation and authentication revocation; an older cart request could replace the current result; an old pending send could block or clear the next shopper's send; and an unmounted host could emit a stale failure toast.

The hook now binds brief and pending-message state to site URL/instance, shopper/session, authentication readiness, cart session and active host. A generation distinguishes leaving and returning to the same authority. Obsolete state is masked during render, and request completion checks lifetime and ownership before updating state or reporting errors. Brief effect cleanup cancels its timer and ignores late responses. Cart request identity includes variant, currency, price and total as well as product/quantity. Current failures remain visible and permit retry; duplicate dispatch remains guarded.

This repair controls frontend publication of asynchronous results. It does not cancel already-dispatched server operations or establish backend request idempotency. No backend schema, deployment, provider setting or canonical block contract changed.

## Verification

- Retained failing-before run: one pass/eight failures. Final actual-hook suite: 12 passes/35 assertions, including variant/price/total changes and unchanged-render deduplication. The subprocess wrapper isolates module mocks and is not counted as another independent behavior.
- Existing renderer suite: 297 passes/5,143 assertions, including prompt handoff/readiness/StrictMode coverage.
- Two focused browser cases cover all four packs at desktop 1440/mobile 390: enabled/default prompts, empty/disabled/catalog-disabled/mobile-hidden states and recovery, eight authored questions, exact URL encoding, keyboard focus, containment and reduced motion. This is not hardware animation profiling.
- Website/demo TypeScript, Website production build, focused lint, canonical freshness, block checks and all 77 kit distribution files pass. Existing bundle warnings are not a performance acceptance result.
- Actual native Electron authored the block and all eight questions, saved/reopened, and published a disposable page. The built public Website passed desktop/mobile handoff for `Which options fit a weekend? Gift & café + notes.` Each fresh guest thread contained exactly one user question and one assistant response.
- Both responses reported `missing_api_key`. The test site's provider is OpenRouter and has no saved key. The UI showed its unavailable response. **No successful model answer is claimed.** No credential or provider setting was changed.

## Cleanup and tracking

Both guest threads were cleared through the public UI and verified empty. Native withdrawal/original-editor recovery restored zero blocks; the fixture was trashed and the native/API sessions signed out. All 42 prior pages and appearance values compare unchanged. Owned Electron/browser instances closed and the private Electron profile was removed. No cart, order or payment was created by these prompts.

Evidence: `output/assistant-family-20260921/`, especially `lifetime-before.log`, `lifetime-final.log`, `browser.log`, `native-public.json`, `provider-status.json` and `cleanup.json`. MagicTables receives a Notes-only update with full 137-row comparison; Status, Tests and Screenshots remain unchanged.

Remaining: a connected provider's real answer, actual customer login transition, and the broader assistant backend/memory/grounding and lifecycle requirements. These are not covered by guest error-response acceptance or isolated hook tests.
