# Four-site responsive chrome acceptance — 2026-10-05

## E74: mobile account visibility

The four published example packs set header.userMenu.enabled=false. At 390px, Core still displayed Sign In. Source confirmed all four mobile surfaces omitted the resolved account configuration, while desktop headers already honored it. The repair passes the resolved userMenu through public and account-layout surface callers. Mobile account actions now honor enabled and guestDisplay (hidden, login-only, login-register); signed-in actions remain available only when enabled. Depot cart visibility remains independent.

Actual component regression: 24 guest/customer cases across the four real mobile surfaces. Before repair: 8 passed / 16 failed. After: 24 passed / 102 assertions; isolated wrapper passed. Website types and production build passed. Changed-file lint passed. Full Website lint remains red on two pre-existing no-control-regex warnings in generated/spec-runtime.mjs:313 and lib/downloads/serve.ts:47; neither file changed in this batch.

All four owned Website previews now serve the same rebuilt artifact in output/example-responsive-20261005/dist on ports 4325–4328. No backend deployment or data/settings mutation was needed. Existing user Electron/Admin/BlockDemo processes were preserved.

## Runtime evidence

At actual 390x844 viewport, all four homepages fit without horizontal overflow and their hero images loaded. Each actual mobile drawer opened, omitted disabled account links, and returned focus to its opener after close. Depot retained Cart. Journal Read The public bench reached its authored article; Depot Browse the collection reached the three-product catalog with all product images loaded.

At actual 1280x900 viewport, all four homepages had document scrollWidth 1269, loaded hero images, readable navigation and no horizontal overflow. Full-page desktop and mobile captures were inspected. Core Work reached A clearer home for Northline. Aster Explore the house reached A house for time together and showed the native-edited copy from the prior batch.

Evidence directory: output/example-responsive-20261005/. Includes before/after account drawer captures, four mobile and desktop homepage captures, Journal article, Depot catalog, desktop.json, settings.json, red/green/type/lint/build logs. This accepts these bounded responsive checks, not every route, state or final delivery requirement.

## Remaining site polish

Core footer ignores configured navColumns.columns and always queries the old footer location; the authored Explore column uses footer-1, so it disappears. Its branding title also disappears when showLogo=true but no logo exists. Trace confirmed in SiteFooter/FooterNav; next focused repair must honor configured columns and show a title fallback without changing site settings.

Journal article repeats its post title as the first canonical body heading. Review the authored post recipes and correct redundant copy with expected-revision preservation; do not remove all first headings globally.

Goal remains active, 117 Verified / 20 In progress. Task6 and Tasks5/7/8 remain open. No push.
