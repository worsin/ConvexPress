# Four-site responsive chrome acceptance — 2026-10-05

## E74: mobile account visibility

The four published example packs set header.userMenu.enabled=false. At 390px, Core still displayed Sign In. Source confirmed all four mobile surfaces omitted the resolved account configuration, while desktop headers already honored it. The repair passes the resolved userMenu through public and account-layout surface callers. Mobile account actions now honor enabled and guestDisplay (hidden, login-only, login-register); signed-in actions remain available only when enabled. Depot cart visibility remains independent.

Actual component regression: 24 guest/customer cases across the four real mobile surfaces. Before repair: 8 passed / 16 failed. After: 24 passed / 102 assertions; isolated wrapper passed. Website types and production build passed. Changed-file lint passed. Full Website lint remains red on two pre-existing no-control-regex warnings in generated/spec-runtime.mjs:313 and lib/downloads/serve.ts:47; neither file changed in this batch.

All four owned Website previews now serve the same rebuilt artifact in output/example-responsive-20261005/dist on ports 4325–4328. No backend deployment or data/settings mutation was needed. Existing user Electron/Admin/BlockDemo processes were preserved.

## Runtime evidence

At actual 390x844 viewport, all four homepages fit without horizontal overflow and their hero images loaded. Each actual mobile drawer opened, omitted disabled account links, and returned focus to its opener after close. Depot retained Cart. Journal Read The public bench reached its authored article; Depot Browse the collection reached the three-product catalog with all product images loaded.

At actual 1280x900 viewport, all four homepages had document scrollWidth 1269, loaded hero images, readable navigation and no horizontal overflow. Full-page desktop and mobile captures were inspected. Core Work reached A clearer home for Northline. Aster Explore the house reached A house for time together and showed the native-edited copy from the prior batch.

Evidence directory: output/example-responsive-20261005/. Includes before/after account drawer captures, four mobile and desktop homepage captures, Journal article, Depot catalog, desktop.json, settings.json, red/green/type/lint/build logs. This accepts these bounded responsive checks, not every route, state or final delivery requirement.

## Follow-up site polish: E75 and article introductions

Core footer ignores configured navColumns.columns and always queries the old footer location; the authored Explore column uses footer-1, so it disappears. Its branding title also disappears when showLogo=true but no logo exists. Trace confirmed in SiteFooter/FooterNav. Repaired: configured headings and menu locations now render, first unassigned column preserves the existing footer-menu fallback, missing logo shows the title. Six rendered regression cases went from 2 pass / 4 fail to 6 pass / 14 assertions. Live built Core shows all four Explore links and title at 1280px and 390px; the actual footer Work link reaches the project. Mobile footer has scrollWidth379 at viewport390. No site settings changed.

Journal article repeats its post title as the first canonical body heading. All six example post recipes shared the same duplication. Removed only each explicitly identified intro heading equal to that post title from the owned published documents and recipes. Each expected-revision save advanced by one, exact remaining block trees/title/published status were verified, and appearance revisions stayed unchanged. HTTP rendered HTML for all six has exactly one matching title heading and preserves the introduction. Journal was additionally inspected in the actual390px browser and captured. No global heading-removal behavior was introduced. All four API sessions revoked. An initial no-write preflight correctly stopped on normalized default attrs; the retry compared normalized trees and only then saved.

Follow-up verification: Website types and production build pass; changed-footer-file lint passes, combined isolated mobile/footer wrappers pass, recipe5tests/83assertions pass. All four preview receipts now point to output/example-responsive-20261005/footer-dist (PIDs8147/8161/8179/8191). Full lint limitation above remains. Viewport override reset, four deliverable tabs retained, source/target preservation and existing order/forms unchanged.

Goal remains active, 117 Verified / 20 In progress. Task6 and Tasks5/7/8 remain open. No push.

## Task6 source reconciliation

Explicitly compared all15 P0 Flagship names from the saved137-row tracker readback with Journal and Depot manifests: both have an existing owned renderer for every one, exceeding the phase3 minimum12. Both have eight individually named pattern files, not an inferred share of32. Pattern contract tests and4pack/90surface template check pass. Receipt: output/example-responsive-20261005/flagship-pattern-reconciliation.json. This closes the source inventory uncertainty; final runtime pattern/flagship visual acceptance remains separate.
