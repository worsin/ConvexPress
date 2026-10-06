# Event display authoring and Calendar view repair — October 6

Calendar held its initial authored view in local React state. A native author changing Month to Agenda, or undoing that change, could therefore leave an already-mounted renderer showing the old view. The new mounted regression reproduced that exact failure: expected Agenda, received Month (321 passing, one failing). The renderer now tracks the last authored value separately from the visitor's selection. Author changes and undo update the display; ordinary event-data refresh preserves visitor choice. No schema, API, stored content format or backend deployment changed.

## Actual acceptance

On isolated Electron PID72216, the existing synthetic controller operator opened disposable staging4860. Created page `g183sqsgggf46b7qjk1w3wf3ss8fraf7` through the native editor. Calendar saved with Agenda, limit1, America/Denver and the site-owned acceptance category. Live Website preview switched Agenda→Month without reload, and Undo returned it to Agenda. Saved and reopened all three canonical blocks; backend readback matches native values exactly.

Upcoming Events: heading `Gather at the studio`, intro `A place for making and meeting.`, count1, descriptions disabled and custom empty text. Next Event: same owned category. Actual Website preview and anonymous published page showed the exact October10 event, target URL and Denver time. The earlier draft event was excluded; unrelated category events were excluded from Calendar. The native category picker first honestly showed no categories, then selected the newly created site-local category.

The production Website artifact at4322 rendered `/page/events-display-acceptance-20261006/`. Keyboard Enter on Next month navigated to November. An event beginning October31 at23:30MDT and ending November1 at03:00MST appeared as continuing into November, including both timezone abbreviations. Enter on Month selected the actual month table with the overnight event on November1. Cancelling the two published fixtures removed them without reload; Calendar showed its empty month, Upcoming its authored empty copy and Next Event its empty state. The visitor's Month selection persisted. Republishing restored the exact events without reload and retained Month.

Evidence: `output/events-display-20261006` holds mounted red/green logs, saved-page.json, fixture IDs, native AX snapshots, public October/November/cancelled/restored snapshots, native-undo-agenda.png, public-november.png and restoration/cleanup receipts. The public full-page screenshot was visually inspected.

## Verification

- Actual renderer suite: 322 tests /5532 assertions pass; all discovered pack examples included.
- Root block suite:188 tests /18140 assertions pass.
- Calendar/Upcoming/Next readers and Calendar indexing:11 tests /102 assertions pass. Existing reader tests exercise category withdrawal, publication/plugin/membership rechecks, bounded/indexed source selection, cursor binding and invalid data refusal.
- Website TypeScript, production build, changed-file lint, block contracts, generated-source consistency, SDK distribution and delivery-status parity pass.
- Build emits existing Node loader deprecation and mixed static/dynamic import chunk warnings; no build failure. This is focused delivery evidence, not whole-repository test health.

The first isolated artifact launch lacked its node_modules resolution link. After adding the artifact-local symlink, the native preview still correctly refused the launcher's mismatched localhost parent origin; setting its existing intended parent to127.0.0.1:4105 restored the authenticated handshake. Both were acceptance-launcher corrections, not product security changes.

## Preservation and remaining work

Original43 source and28 target pages, appearance values, general/reading settings and menu locations compare exactly to pre-run baselines. Test page is recoverably trashed; three fictional events archived. Their category and audit history are retained for bounded reuse. Original Live environment selection restored, native controller signed out, both API sessions logged out with refresh401, owned Electron/Website processes stopped and private profile removed. Protected seven processes were preserved. No push.

The full delivery goal remains active at117 Verified /20 In progress. These three rows remain In progress pending final four-pack responsive evidence, public time-boundary refresh reconciliation and the remaining explicit live private-access/withdrawn-category checks not already covered by accepted evidence. Reuse this native authoring, source-boundary, cancellation and DST proof rather than repeating it.

E05 HTTPS acceptance remains a separate environment prerequisite: current Promotion Lab has no connected hosting account and only localhost/LAN addresses. An existing HTTPS staging URL was requested asynchronously. It does not block the independent event or remaining delivery work.
