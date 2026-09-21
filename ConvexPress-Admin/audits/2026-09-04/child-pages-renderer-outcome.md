# September 5 — canonical child-page directory

The previous turn completed verified article-security work. This turn returns to the unfinished block catalog and implements core/child-pages end to end in source.

## Implementation

content.childPages is a closed discriminated data contract: requested depth1–4, current parent label and up to80 unique ordered rows containing only ID/parent ID/label/href/depth. Results must follow visible parents; orphaned/cyclic/duplicate output is rejected. Both server resolution and consumer envelope validation reject rows deeper than the requested depth. Arbitrary instance-supplied resolvers remain forbidden.

The trusted canonical navigation reader starts from the already authorized current document, follows the existing parent/menu-order index, and applies canDiscoverContent to every page. Draft/private/password/member-restricted parents exclude their descendants. It accounts for complete documents and policy reads, never projects bodies/excerpts, and fails explicitly on cycles, source count or source/read byte limits. The initial paginated implementation failed the real Convex test's single-pagination limit; the final indexed async iterator reads and accounts one document at a time and closes in finally. The iterator contract was checked against https://docs.convex.dev/api/interfaces/server.Query. Non-page documents return an empty directory without querying descendants.

The canonical renderer is a semantic nested navigation list with safe source links, pack typography/colors, visible keyboard focus, responsive text wrapping and transform-only hover motion disabled for reduced motion. BlockDemo uses an explicitly synthetic current-page directory adapter; it does not pretend its fixture is a live backend result. Examples cover depth1 and depth3.

## Verified source gates

- Backend navigation tests:6passed/19assertions; normal canonical save/get endpoint suite32passed/230assertions, including child-page result and unauthorized denial.
- Pure resolver/envelope suite:3passed/15assertions, including stale/malformed/depth-mismatched hierarchy rejection.
- Existing full renderer regression runner passes, now including child-page hierarchy and stale-viewer checks.
- Website and backend type checks pass. Root136spec generation and18file portable/28file deployed foundation parity pass.
- Focused browser navigation suite:2tests passed, five navigation blocks ×4packs×2widths=40screenshots. Child-page controls show four correctly nested fixture links and keyboard order at both widths. Mobile Aster and desktop Journal screenshots visually inspected.
- Full BlockDemo result and tracker receipt recorded after completion below.

No live backend/site deployment or real native publishing of this new block occurred. Full-block completion stays open; output bounds are explicit rather than silently truncated.

## Next menu prerequisite

menus/internals.ts resolveMenuItemUrl currently rejects missing/trash targets but does not require discoverability. menus/queries.ts getMenuForLocation then falls back to the saved item.url after failed resolution. Before core/menu activation, build a viewer-safe bounded menu projection that filters inaccessible targets and their descendants, preserves heading/separator semantics, and never revives stale URLs for failed content references. This is a source finding, not a claim of a demonstrated live data leak.

## Full browser and tracker acceptance

Full BlockDemo passed32tests in2.6minutes. Actual artifact inventory contains704canonical PNGs (88renderers×4packs×2widths). This includes the prior FieldGuide geometry and primitive article-flow regressions present in the suite; the separate legacy article-security helper probe is not part of this32-test run. Evidence: worktree-root output/block-demo/browser-results-child-pages88 and /tmp/convexpress-child-pages-full-browser.log.

MagicTables exact standalone base/table was re-resolved through record context and its Notes schema verified. One Notes-only upsert was dry-run, applied and read back; zero creates, all136row IDs and Name/Status/Tests/Screenshots preserved. Receipt: ConvexPress-Admin/output/blocks-tracker/child-pages88-verification-2026-09-05.json. Renderer/browser acceptance is now88/136, while full-block/native/live completion remains false. Original checkout has no tracked modifications.

The production Website build passed after acceptance (/tmp/convexpress-child-pages-website-build.log). Local dist includes child-page rendering/contracts; no packaged provider artifact or live deployment was refreshed.
