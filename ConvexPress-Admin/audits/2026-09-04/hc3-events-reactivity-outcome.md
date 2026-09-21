# HC3 acceptance repair — stable Events pagination windows

Root reproduced a deployed staging failure by editing only the Mountain morning event description: the homepage's live Events block reran and Convex raised `InvalidCursor: Tried to run a query starting from a cursor from a different query` at Events `upcoming`. The query placed `Date.now()` inside its indexed pagination range. Convex reactive pagination reuses an end cursor even when the caller's starting cursor is null; the changed time bound made that cursor belong to a different query.

The backend now accepts an optional `startsAtOrAfter` timestamp. New callers provide a stable timestamp so description edits and later pages preserve exactly the same indexed range. It validates the timestamp and retains the published-only gate and allowlisted event projection. The optional argument preserves rolling compatibility: legacy callers use a stable published-only pagination range and filter expired records after reading the bounded page. This can yield an empty but continuable historical page until the new Website bundle is published; it never scans unbounded history or returns private/expired events.

The Website's live block uses a minute-aligned timestamp that changes only at the minute boundary, starting a new subscription rather than changing an existing cursor's range. The dashboard keeps one timestamp for its mounted paginated list. The public Events route serializes the timestamp alongside its cursor, uses the same loader-selected timestamp for hydration, and retains it across page navigation. Old links without a timestamp restart at page one because their cursor cannot safely be paired with a new time range. None of these changes disables reactivity or pagination.

## Evidence

- A regression wraps the real registered `upcoming` handler with the provider's cursor/query-fingerprint invariant (the generic DB harness itself does not check that invariant). Before the fix, description-edit replay raised the exact `InvalidCursor: different query`; after the fix, replay updates the description and a later page remains readable as time advances.
- Anchored and legacy replay, public visibility, CRUD conflict, schedule and plugin tests: **6 pass / 27 assertions**.
- Website cursor/window URL round-trip, old-link handling, minute boundaries, and reference-block tests: **5 pass / 22 assertions**.
- Typecheck and generated-contract results recorded at the final checkpoint below.

Root live acceptance is now verified: root deployed the backend, completed a full Website build, and published staging through the actual Electron publishing flow. With the existing homepage open, root edited the Mountain morning description; the temporary suffix appeared in the DOM without reload or page resave, and browser error logs were empty. Root then restored the original description. This confirms live block reactivity on the deployed staging site. Public route second-page navigation and dashboard load-more across a clock change remain pending runtime acceptance. This agent performed no live writes, native operations, provider calls or browser actions.

Final checkpoint: backend and Website TypeScript checks both pass (exit 0); Website lint and diff checks pass. Compact site contracts regenerated successfully: 2001 functions / 1872 terminal DTOs. Backend deployment is safe with existing bundles because the new timestamp argument is optional; the new Website bundle is needed for efficient anchored pagination and automatic minute-window refresh in live blocks.
