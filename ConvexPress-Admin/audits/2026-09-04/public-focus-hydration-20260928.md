# Initial public focus survives hydration

E26 is accepted for the reproduced anonymous public-page initialization failure. A link reached with Tab before application JavaScript runs now remains the same DOM node, keeps keyboard focus through hydration and auth initialization, and responds to Enter across Core, Journal, Depot and Aster House at1440 and390 pixels. Full block-family acceptance and the overall delivery goal remain open.

## Cause and repair

Three independently reproduced resets contributed:

1. `SessionBoundConvexProvider` included `auth.isLoaded` in its subtree key. Anonymous readiness therefore replaced the whole marketing layout. The key now follows resolved user/session/organization identity. Unresolved auth masks stale identity fields, so authenticated-to-loading transitions still discard the previous tree. The operator branch is unchanged.
2. `ProductionLeadMagnetProvider`, which wraps every canonical body, included auth readiness in its child key. It now separates anonymous view identity from operation ownership. User/session/site/password/backend-authority changes and authenticated loading still reset rendered state. The full operation scope is unchanged: late receipts, downloads and unsubscribe acknowledgements remain invalid after authority/readiness changes.
3. `useDisplayInstallation` synchronously revoked the initial display grant in its mount effect before React committed the replacement state. External-store subscribers temporarily rendered unavailable content, replacing data-block DOM and losing focus. The hook now adopts its initial grant for the first committed lifetime. Cleanup still revokes that grant; StrictMode replay receives a fresh grant. Changed source/viewer installations retain the existing validation and revocation boundaries.

The first two repairs alone still failed the stronger live test. Those failed runs and cleanup records are retained, not counted as acceptance. Existing public-body tests isolated the production providers; React act batching also hid the transient grant race. A separate scheduling regression exercises hydration outside act, using act only to drain cleanup.

## Verification

Evidence directory: `output/public-focus-20260928/` in the hardening worktree. Source identities: `source-sha256.json`.

- Failing-before regressions: `session-red.log`, `lead-red.log`, `installation-red.log`.
- Passing auth/provider lifecycle suites: `final-lifecycle.log` and `final-authority.log`. These include account/session/org changes, unresolved old identities, actual Convex operator renewal, operator draft recovery, anonymous public handoff, lease expiry and revoked content.
- Passing grant scheduling, reusable SSR/preview and public-body suites: `installation-green.log` (6 outer tests/21 assertions, including isolated inner cases). The new scheduling test proves SSR node/focus preservation and unmount revocation. Existing StrictMode and source/viewer transition cases remain green.
- Website typecheck and production build: `website-types.log`, `website-build.log`.
- The bundle gate remains failed: main309.30KiB against292.97KiB. `bundle-budget.log`; no threshold adjustment or global-green claim.

`live-matrix.mjs` holds the built main script, loads the existing `/page/course-grid-acceptance-20260911` SSR page, tabs to its first course link, releases JavaScript, waits for Clerk readiness and hydrated React nodes, then checks that the original link remains connected and focused. Enter opens `/courses/progress-integrity-laboratory-200-lessons/` and a visible course heading. All8 cases pass with zero captured console errors, hydration warnings or page errors, correct template identity and no horizontal overflow. `live-matrix.json` records the results and cleanup.

Eight screenshots retain the focus outline. Core390, Journal1440, Depot390 and Aster House1440 were visually inspected. This is focused public hydration acceptance; it is not new native authoring, a complete course-grid variant review or a completed example website.

## Preservation and remaining work

The existing course page was read-only. No page, menu or content fixture was created. Temporary template publications used expected revisions and restored the original appearance values. All42 original page records match the private baseline; owned API session was revoked and its local session file removed, and the browser closed. The user's Electron39198 remains running. Only the owned Website4322 preview was rebuilt/restarted; no backend deployment or push occurred.

Tracker remains63 Verified/74 In progress. Remaining Menu/Child Pages acceptance, other Task2 families, plugin-default F1 before Task3, E22 evidence-path reconciliation, final template sites, migration, Customizer, SDK workflows and bundle-budget delivery remain open.
