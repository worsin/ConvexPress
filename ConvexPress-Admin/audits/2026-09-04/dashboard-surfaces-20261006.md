# Dashboard surface acceptance — October 6, 2026

## Result and boundary

Rendered the original 22 dashboard surfaces (shell plus 21 page surfaces) in Core, Journal, Depot and Aster House at 1280px desktop and 390px mobile. The saved matrix contains 160 page captures, with the eligible return form captured separately in eight pack/viewport cases before submission. Each matrix page has one main landmark, the expected pack-owned shell and body surface, a loaded heading, and no document-wide horizontal overflow after the repairs below. Selected desktop/mobile screenshots were visually reviewed; capture counts alone are not a complete visual-design or interaction verdict.

The real Clerk development customer had the existing customer-type Author role and no admin login permission. Records came from registered application APIs: one canonical draft, zero-value manual order, manual subscription, published lesson/enrollment and membership. Return submission and subscription pause/resume used the actual Website UI. No payment provider, charge or refund was exercised.

This closes the missing *rendered route coverage* for the original dashboard surface catalog, not all Task 5 Customizer fields, commerce lifecycle behavior, all account actions, the extra Events surface, or final installed-artifact parity. Comments, downloads, reviews and addresses used valid empty states. The earlier populated-route evidence remains independently scoped.

## Demonstrated defects repaired

1. **Author dashboard denied:** the registry and posts loader requested the obsolete `edit_posts` capability. Seeded Author/Contributor roles grant `post.update`. The live author saw no My posts navigation and received a 404 on its direct route. Both registry declarations (page and two content widgets) and the page gate now use the canonical capability. A regression test fails before the change and passes afterward using the actual seeded roles; Subscriber remains denied. The real browser then displayed the owner's canonical draft. Downgrading the disposable customer to Subscriber unmounted the already-open posts view without a reload; restoring Author restored it. No admin access was granted.
2. **Core return form labels:** item selection, return quantity and additional notes lacked associated accessible labels; selected reason was only visual. The form now uses instance-safe IDs/labels and exposes the selected reason with `aria-pressed`. Actual named-control selection, quantity selection, reason and notes worked. The shared registered submit path saved RMA-MUWFYS1V-XPM7 and its customer detail/list views.
3. **Journal/Aster subscription overflow:** a real entitlement code pushed the status badge beyond a 390px viewport (443px/466px document widths). The code now shrinks and wraps within the flex row. Both repaired pages fit their viewport, retaining the full code and status.
4. **Depot order/return table overflow:** absolutely positioned screen-reader labels were outside a positioned scroll container; the hidden Details label extended document width to 415px/891px. The table wrapper is now positioned, containing those labels. The wide return table remains internally scrollable and its detail link works, while the document stays at 390px.

## Verification

- Backend dashboard tests: 8 passed, 172 assertions, including seeded author/contributor/subscriber regression (observed red first).
- Website navigation and reactive page-access tests: 11 passed, 25 assertions.
- Website TypeScript check, focused lint, production client/server build and diff whitespace check passed.
- Backend correction deployed only to the retained disposable extension trial at 4922, with deployment typecheck enabled; all 2394 registered functions remained available. The archived extension snapshot was restored with verified SHA-256 and only its dashboard registry changed. No Git push.
- Actual browser: author draft visible in four packs; live customer-role revoke/restore; return submission/list/detail; subscription pause/resume and resulting status/history; 160 route/viewport checks plus eight eligible return-form checks.
- Initial captures that caught a posts loading skeleton were replaced with loaded content before acceptance. `dashboard-initial-captures.json` is diagnostic, not acceptance.

## Evidence and preservation

Local artifacts: `output/dashboard-surfaces-20261006/`. Primary receipts: `dashboard-matrix.json`, `matrix-validation.json`, `return-form-evidence.json`, `return-mobile-evidence.json`, `extension-deployment.json`, `source-preserved.json`, `cleanup.json`, `runtime-cleanup.json`. Screenshots include `author-posts-fixed.png`, `author-revoked-live.png`, `author-restored-live.png`, `core-return-controls-fixed.png`, `return-submitted-mobile.png`, `subscription-paused.png`, `subscription-resumed.png` and pack/surface/width captures.

The shared source at 4860 received no application-data writes; all 43 pages, appearance snapshot and the sampled settings sections matched baseline exactly. Its temporary API session was revoked. The separate 4922 trial remains archived in the control plane. Its test subscription was cancelled, return rejected, site profile deactivated and exact synthetic Clerk user deleted; test credentials and owned API sessions were removed/revoked. Trial settings values and appearance were restored. Settings audit metadata changed normally; the trial's formerly implicit commerce defaults now have a persisted row. Fixture business records remain only in the stopped disposable container volume for diagnosis. The owned Website process was stopped; original preview/Electron processes were preserved.

## Next bounded work

Continue the existing Task 5 field/header/footer/menu/promotion gaps. Before declaring the dashboard interaction contract fully accepted, investigate two observations from the populated fixture: draft titles currently link to a public blog URL, and the requested return detail displayed approved/received quantities before those operator actions. Verify the intended publication and return-query projection contracts before repair; do not infer a payment/refund implementation change from this rendering pass. E80 Type scale is already repaired in 9aef73d7 and must not remain listed as a no-op.

## Follow-up: public draft links and premature return quantities

Two observations from the populated dashboard pass reproduced as contract defects. All four post surfaces linked drafts to `/blog/<slug>`, whose published-only loader correctly returns 404. A shared `DashboardPostTitle` now links only published posts with a nonempty slug; other titles and their existing status remain visible. No customer editor or private preview route was introduced.

Return enrichment treated missing approved/received counters as the requested amount regardless of request status. Normalization now defaults pending/rejected approval to zero and pre-receipt received quantities to zero. Recorded partial/zero values remain authoritative; legacy received/completed requests and statusless legacy callers retain their fallback. The same normalization protects legacy item backfill without inventing completed actions. Operational approval/receipt builders retain their existing behavior.

Verification:
- Return helper regressions failed for requested, rejected and approved stages before the repair; all 41 return tests now pass (123 assertions), including legacy migration, refund lifecycle and eligibility coverage.
- Actual four-pack component rendering checks published/draft/future/private/trash posts and untitled empty-slug rows: 20 cases. Regression failed before the repair and passes afterward. The router link alone is replaced with an anchor in the isolated test process; the actual pack components render.
- Website and backend TypeScript, focused Website lint, Website production build and isolated backend deployment typecheck pass.
- Retained disposable backend4922 record `wd7dj710gwjg3h8yxrp4rbh5rd8fs7j5`, already rejected during earlier cleanup: actual authorized `commerceReturns/queries:getWithDetails` returned requested/approved/received **1/1/1** before deployment and **1/0/0** afterward. The record itself was not edited. This uses the shared enrichment consumed by customer detail; no new customer login/browser pass is claimed.
- Temporary plugin values restored exactly; appearance snapshot exact; API session normally revoked and refresh returns401. Owned backend stopped again, volume retained. No protected Website/native process was restarted or stopped; no Git push.

Raw evidence: `output/dashboard-contracts-20261006/`. Initial query assertion mistakenly inspected raw `items` instead of enriched `returnItems`; its artifact is retained separately and is not accepted proof. An initial test command from the repository root scanned historical snapshots and hit EMFILE; the corrected explicit backend test path produced the accepted 41-test result. Full dashboard coverage and remaining Task5 limitations above are unchanged.

Claude audit45 accepted: E79/E80 now reference deliveryTask5; E80 classification matches its previously verified Type scale repair. This is bookkeeping, not new delivery scope.
