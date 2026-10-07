# Generic post/page update retirement — October 5, 2026

Task4/E07 progress; the full editor/template delivery goal remains active and incomplete. No push.

## Change and boundary

Current application caller search found only the noncanonical Quick Edit fallbacks invoking `posts/mutations:update` and `pages/mutations:update`; canonical Quick Edit, Bulk Edit and document settings already use canonical transactions. Removed both old handlers and their argument validators, plus dead frontend update hook methods. Historical schema/snapshots, import/recovery, taxonomy operations and lifecycle endpoints remain. This does not close all legacy contentMode consumers.

Canonical Quick Edit retains its opened revision and one atomic metadata transaction. Legacy or incomplete records render a review notice with an explicit editor link and Cancel, without mounting Quick Edit mutation hooks. Existing edit routes already expose deliberate import/recovery. No automatic conversion or destructive schema cleanup was added.

## Verification

- Regression first failed because the generic update export still existed. Working/source focused suites then pass **201 tests /1757 assertions**; target **171/1259**, preserving its different installed test inventory. Covers canonical metadata/author authority, reserved routes/hierarchy, lifecycle, history recovery and retired-write refusal without altering retained source/autosaves.
- Rendered route/gate tests pass for both post and page, including v1/missing/invalid revisions and direct editor links. Backend scoped type check and all4 Admin type tasks pass. Generated contracts:2283functions,3053terminalDTOs,373existingunknown boundaries;39 compiler fixtures per consumer pass. Media writer checks pass with1480classified writes/30tables/no bypasses.
- Each deployment was derived from its own verified `document-settings-events-20261005` installed manifest. Source snapshot patch applies; target's four affected document tests were replaced only after exact old-block matching because neighboring tests differ. No whole target overlay.
- Storage-inclusive private backups precede deployments; deployment type checks pass. Actual inventories remove exactly `pages/mutations.js:update` and `posts/mutations.js:update`: source2396→2394,target2361→2359. No other function signatures added/removed/changed. Source108/target86 extension files and catalogs/packs exact.
- Live canonical metadata succeeds on both sites; retired requests reject, with deployed function inventories proving their absence. Original fixture body/history exact before valid save. This backend reports missing function calls as generic Server Error, so the proof combines the actual inventory with refusal/readback instead of claiming a specific public error code. The source test initially expected a detailed missing-function message; resumed its journaled creation only after verifying unchanged revision1/title. No duplicate fixture creation.
- Actual Electron target: post/page Quick Edit title save and reload/reopen pass. A concurrently advanced page revision4 rejects the opened revision3 form; typed input stays and fresh reopen shows the concurrent title. Body exact. No page errors; one expected Convex console error from stale-write rejection. Screenshots inspected for readable controls and fit.
- Limitation: an extra legacy fixture could not be prepared because the target's system REPL exports no mutation wrapper. Both setup attempts failed module analysis before writes. The owned row remained empty canonical revision1, was verified and deleted. Legacy gate evidence for this batch is rendered isolated component tests, **not** a live legacy-record acceptance claim. Existing canonical import/recovery evidence is retained.

## Cleanup and next base

Five owned records total: one API fixture on each site and three native/setup fixtures on target. All deleted with their revisions. Original source116documents/434revisions,target29/88 exact against baseline. Appearance/mail exact; target private drafts/postMeta exact. Consumer/media indexes remain ready, no rebuild necessary. API sessions revoked; native signed out, PID92180 exited and owned profile removed. User PIDs39198/62672/65092 preserved.

Evidence: `output/generic-update-retirement-20261005/` tests, manifests, inventories, live journals, native proof/screenshots, preservation and cleanup. **Next deployment bases:** `{source,target}-source-installed.json` in that directory;1628/1622hashed files. Do not reuse older deployment bases.

Next: bounded removal of obsolete live contentMode dispatch/DTO and Aster presentation assumptions, while preserving explicit history/import contracts. E10 safe canonical example-site provisioning remains open separately.117Verified/20In progress is unchanged and is not a delivery percentage. Latest observed Claude audit remains38; its advice does not change scope automatically.
