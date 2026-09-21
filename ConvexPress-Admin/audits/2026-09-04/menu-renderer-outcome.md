# Canonical Menu block — September 5

Implemented `core/menu` as a data block using the shared viewer-safe menu reader. Authors can choose either a menu location or a saved menu. The server resolves current content, membership visibility, dashboard gates and hierarchy before returning a small display projection. Saved menu identity is bound to the canonical envelope; stale viewer/document grants, mismatched IDs, unsafe destinations, missing ancestors and malformed depth are rejected. Legacy `#` menu labels become non-link headings in the inline renderer. No menu or no visible items produces no empty navigation landmark.

The inline design uses each pack's typography, colors and borders, nested semantic lists, optional descriptions, explicit focus outlines and a small transform-only arrow response. New-tab links retain both opener protections and an accessible new-tab announcement. Reduced-motion preferences disable movement. Aster mobile and Journal desktop captures were visually inspected after keyboard navigation.

The canonical editor now has a menu picker backed by an authenticated, paginated, display-only menu-options endpoint. It authorizes the current document before loading and before accepting selection, retaining the existing scope/revision cancellation protections. A real DOM test proves revoked authorization prevents selection, restored authorization returns the exact scoped menu ID, and abort cancels the request. This is source/DOM acceptance, not a claim of exercising the picker in the live Electron installation.

## Verification

- Registered canonical save/get/publish/public-read integration passed for both menu sources. The editor sees an Account link; anonymous public output excludes it. Deleted menus return an empty result. The menu-options endpoint denies an unauthorized editor.
- Full backend: **2,177 tests, 9,020 assertions, zero failures**, across 151 files.
- Renderer suite: **85 tests / 2,636 assertions**, including every available example under all four packs and stale-viewer rejection.
- Canonical/schema editor regression: **16 tests / 68 assertions**, including the new picker DOM gate.
- Focused navigation browser tests: two passed, six navigation blocks × four packs × two sizes. Full BlockDemo: **32 tests passed in 2.7 minutes**, with exactly **712 canonical screenshots = 89 × 4 × 2**.
- Website/Admin/backend type checks, production Website build, both 19-case consumer contract compiler gates and generated block/foundation parity passed. `git diff --check` passed.
- Evidence: worktree-root `output/block-demo/browser-results-menu89` and `output/block-demo/browser-results-menu89-focused`; durable logs/source hashes in `ConvexPress-Admin/output/menu-renderer/2026-09-05`.
- MagicTables Notes-only update verified on the existing `core/menu` record. All 136 IDs and full-block completion flags preserved. Receipt: `ConvexPress-Admin/output/blocks-tracker/menu89-verification-2026-09-05.json`.

The first renderer check correctly refused the unregistered menu field adapter; it was then wired to the exact validated `site.menu` result before rerunning acceptance. The initial picker fixture exposed the compiler-only API shim being used at runtime; the test bundler now resolves actual generated references. These failed runs were not counted as acceptance.

## Remaining scope

Renderer/browser acceptance is now **89/136**, leaving 47 without that gate. Full native menu editing/publication against a deployed new backend, rollout of the accumulated source changes, packaged acceptance and the remaining production-readiness audit/handoff items are still open. This turn updated local Website output but did not refresh packaged provider artifacts or deploy to Cloudflare/Vercel. The original operator checkout and running applications remain preserved.
