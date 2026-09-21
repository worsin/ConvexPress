# Public canonical authorization expiry — September 6

Canonical public pages previously refreshed time-sensitive event/form data, but a static protected body had no clock-driven invalidation. Membership authority correctly rejected expired grants on a fresh request; elapsed time alone did not rerun an existing subscription. A data refresh also disposed the old subscription while retaining its previously rendered body.

The public document contract now includes a closed `accessLease` containing server evaluation and expiry times. Identified viewers and password-unlocked bodies receive at most 60 seconds of freshness. The request read ledger shortens this to the earliest future membership start, active end, grace end, or management-session expiry actually encountered during authorization. Start boundaries are recorded before filtering inactive grants, so a denied page can request access when its grant begins. Anonymous unrestricted documents use a null lease.

The client measures elapsed time from before subscription, avoiding dependence on the browser and server having matching wall clocks. Network delay consumes the initial lease. It clears expired content, requests a new query with a new refresh key, rejects expired/older responses, and checks the deadline when the page becomes visible or focused. Disposal cancels timers and queued callbacks cannot notify the old view. A time-sensitive data refresh clears protected content while its replacement authorization is pending; anonymous public event refresh retains its prior behavior. Clearing can briefly show the existing loading state while a new authorization request completes.

## Verification

- Backend: 2,265 tests / 9,878 assertions; canonical foundation: 72 tests / 4,584 assertions. Total 2,337 tests / 14,462 assertions, all passing.
- New actual Convex handler regression: a static page is denied before its grant starts, allowed exactly at start, denied exactly at active expiry without changing stored status, allowed in explicit grace, and denied exactly at grace expiry. Lease deadlines match each boundary.
- Public client: 11 tests / 64 outer assertions, including the isolated real React component lifecycle. A subsequent expanded lifecycle regression also passed: expiration removes the actual body, opens a fresh watch, rejects late callbacks, and a timed event refresh cannot leave protected content mounted with a disposed timer. Rendering/submission adapters are isolated in that lifecycle harness and covered in their own existing suites.
- Clock tests cover network delay, widely different client/server clock origins, duplicate and old responses, renewal by a newer evaluation, suspended timer wake, and cleanup. Contract tests reject missing, unbounded, malformed, or identified-viewer null leases.
- Scoped backend, Admin, and Website TypeScript passed. Both generated API consumers passed 19 compiler fixtures; 2,067 functions / 2,429 terminal DTOs generated. The existing 428 unknown boundaries remain outstanding.
- Website build and actual workerd checks passed for all four packs across home/page/post and protected/missing-body paths. Whitespace checks passed.

## Deployed acceptance

Captured backend checkpoint `output/production-checkpoints/access-lease-20260906` (under ConvexPress-Admin) contains 1,118 files and passed its own CLI typecheck/preflight with no deleted indexes. Deployed only to `careful-cormorant-268`; health, auth, storage, website/instance identity and media epoch `mi_ready_60aa40c699ba4d83b9367dd4130a9c12` were verified after deployment.

Electron published the staging Website successfully. Full artifact: `d12173751d7ea6a54a540ca4a94a1088c49657a2a43d7a4df6c14d74a3a195cf`. The live Navigation field guide returned HTTP 200, rendered its 10 blocks, and exposed the enabled real form with zero page errors. A direct anonymous public query returned the new ready contract with null viewer and lease. The browser screenshot was inspected. No content edits, submissions or new accounts were made in this increment. The existing Clerk development-key warning remains.

Evidence is in root `output/access-lease-20260906/runtime-receipt.json`, its logs, and `output/playwright/access-lease-20260906/public-page.png`. MagicTables App Audits row `px7csry9fwgb7zfjgn249mmf4s8dx001` records this bounded result with existing other cells preserved.

## Still open

This is canonical-body expiry coverage, not completion of A01–A08. A real signed-in customer in the deployed Website still needs expiry/revocation acceptance. Legacy bodies, taxonomy archives, dashboard reads and native/operator sessions need corresponding time-bound display review. Organization/business disable and subject replacement need wider fleet/customer acceptance. The existing daily `membership/internals:expireGrants` still collects all grants and derives a missing grace deadline from sweep time; its maintenance and course-enrollment propagation require a bounded, correct implementation. Broader packaged provisioning/deployment/recovery gates remain open. Block renderer/browser acceptance remains 96/136.
