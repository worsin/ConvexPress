# Search controls, destinations and reusable-source indexing — September 28

Search Box and Search Band complete their remaining block-specific acceptance. Search Results remains **In progress**: approved custom composition and the remaining canonical text projection/backfill coverage are still required. Localization promotion is also pending. The full delivery goal remains active; no push.

## Changes and evidence

- **E32:** shared public search page URLs omitted `/page`. A registered regression failed with `/garden` instead of `/page/garden`. The current source reader now supplies correct flat, nested and fallback page destinations to ordinary search, Search Results and page comments; post routes are unchanged. Actual keyboard navigation reaches both owned flat and nested pages.
- **E33:** reusable-source publication refreshed consumers' forms but left search candidates stale while reporting completion. A registered lifecycle regression reproduced missing newly published text. The existing authorized per-page subtransaction now runs the existing search upsert. Tests cover latest versus pinned copy, withdrawal, atomic rollback on index failure and an authorized retry. Installed publication changed search results without changing either consumer document; withdrawal removed both words; republishing revision 1 restored both original matches.
- **E34:** the normal native page editor's View link had the same bare-path issue. Corrected its shared URL helper after reproducing the failure, preserving selected-site and unsafe-path checks. Native readback supplies `/page/search-discovery-controls-20260928`, whose real Website destination was exercised.
- **E35:** a valid 154-character suggestion containing a long unbroken word overflowed even with CSS loaded (1440px viewport, 1504px document). Search suggestion items now have bounded width and may wrap anywhere. No assets or other block styles changed.

Native Electron 5907 used an owned private profile and the selected source environment. Placeholder, suggestion repeater, query binding/kinds/page size/empty message were inspected; editable controls were exercised, including every Search Box scope. Actual Website draft previews verified their emitted type values. Saved document revisions 4/5/6 cover normal/long/empty states; history snapshot 5 restores the exact revision 4 tree as document revision 8. Native final and build-transition error lists are empty.

Public checks: **24 pack/width cases** (eight navigation/pagination/input cases, eight long-suggestion cases, eight empty-suggestion cases), with no browser errors. Four packs × 1440/390; real query/encoding, keyboard navigation, two-page search pagination, empty submission and empty results. Eight final settled screenshots separately assert pack identity, 22px search icon, grid/flex styles, visible result opacity 1 and no overflow. Final Aster House mobile and long-suggestion mobile images were visually inspected. **24 BlockDemo cases / 40 examples** pass, with block identity and input-example checks.

## Verification and installation

- 113 backend tests / 825 assertions across search and reusable-content suites; 4 editor URL tests / 22 assertions ; 310 renderer cases / 5442 assertions.
- Explicit backend Convex project typecheck, strict installed deployment typecheck, Admin and Website types, Website client/SSR build and diff check pass. Existing build warnings and main-bundle acceptance remain separate Task 8 work.
- Installed snapshot: `ConvexPress-Admin/output/production-checkpoints/search-discovery-20260928`. Verified 1609 source hashes, preserved 22 installed Events files, all 2405 installed signatures unchanged. Only search URL, reusable refresh and its generated consumer-index version changed in that snapshot. Current writer preflight: 1506 classified writes / 30 owner tables, no bypasses.
- Consumer discovery rebuilt to ready under the new version. Its 115 raw post records include records outside the 42-page/2-post list views; the initial 100-step harness bound was too small and was resumed safely.
- Owned Website preview 98997 replaced by 7095 on 4322, using the captured same site/runtime identity. Native user process 39198, Admin 4105 and BlockDemo 4318 preserved. No target 4870 deployment.

## Diagnostics retained

The first preflight refused the stale generated reusable-consumer version before installation; regenerated after reviewing the boundary, then strict deployment passed. Initial URL assertion did not allow the router's trailing slash. An initial history selection confused independent history numbering with document version numbering; exact-tree comparison caught it, and the correct snapshot was restored. Native menu/repeater selector retries used observed accessible names. BlockDemo initially waited for a resolver-ready marker on static blocks; corrected to each actual renderer's readiness and example identity.

Early captures, including ones after pagination, preceded lazy stylesheet readiness or caught the result entry animation. Those are not final visual evidence. Final screenshots are `public-settled-*`; final style-ready long/empty images are `public-long-*` and `public-empty-*`. The loaded-CSS overflow regression and its repair are separate from those early captures. First-paint stylesheet timing remains relevant to Task 8 runtime quality; this batch does not claim that broader performance gate complete.

## Cleanup and remaining work

Four owned pages, one reusable source, two source revisions and five completed source refresh jobs removed. Source deletion used the built-in authenticated dashboard mutation only for eight verified owned IDs, after withdrawal, zero-consumer checks and a private row backup. All five source tables exactly match the pre-batch snapshot afterward. Original 42 pages, 2 posts, 1 taxonomy term, menus, locations and appearance preserved. Native session signed out and 5907 closed; owned API session revoked; fixture route 404; consumer index ready.

Continue approved-composition search with real presentation/approval/access boundaries, remaining canonical prose/backfill cases, then Language Switcher promotion. Claude audit 08 reviewed and answered; F1 plugin defaults remains required before plugin-family acceptance. E17 reference completeness, E22 screenshot identity and E28 header separator remain recorded in their delivery stages.

Evidence: `output/search-discovery-20260928/`, especially `public-matrix.json`, `variants-long.json`, `variants-empty.json`, `visual-final.json`, `lifecycle.json`, `native-history-proof.json`, `cleanup.json`, `source-cleanup-verified.json`, `installed-signatures.json`, and deployment/build/test logs.
