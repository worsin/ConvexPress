# Field reference and live Events acceptance — October 6

Task 7's all-field/live-Events gate and remaining owned-fixture cleanup are
accepted. Actual AI-provider acceptance and final integrated delivery remain
open. Tracker counts remain 133 Verified / 4 In progress; no tracker cells were
changed by this batch.

## Native-to-public workflow

Reused actual native authoring and revision recovery from
native-field-reusable-20261006.md and mixed-composition-20261006.md. The retained
Aster draft included the field-reference v2 block, live Next Event, a revision-2
pinned reusable placement and an approved resource composition containing a
second pinned placement. Published revision 9 as revision 10 with the entire
stored block tree unchanged.

Created one owned fictional event through normal Events mutations. The page
selected that event. Updated its title and venue; the actual Website changed
without a page save or browser reload, while document revision stayed 10.
Switched Aster House → Core → Journal → Depot with the same canonical document.
Inspected eight desktop/phone captures (1280 and 390 pixels): both real images
loaded, field values and treatment survived, both pinned placements rendered,
and there was no horizontal overflow. Clicked Event details to the updated
record. The authored new-tab house link opened the real original house page.
After Back, an initial snapshot briefly showed the old page state; the settled
page showed the current event and Depot without reloading.

## Reproduced hydration defect and bounded repair

The pre-fix production page reported React #418. Exact text comparison found
Node's Intl.DateTimeFormat.formatRange inserted U+2009 around the range dash,
whereas this browser inserted U+0020. The date, timezone and event data agreed.
The same formatter occurs in Next Event, Upcoming Events and Calendar's compact
and agenda views. These three renderers now normalize U+00A0, U+2009 and U+202F
to ordinary spaces before rendering. No date arithmetic, schema, API, stored
content, backend deployment or hydration-warning suppression changed.

Regression coverage renders the real three blocks with otherwise identical ICU
range output using ordinary, thin and narrow nonbreaking spaces. It failed in
all three cases before the repair. The repaired renderer suite passes 322 tests,
5,542 assertions and 1,148 executed pack/example cases covering all 137 blocks.
The initial plain-Bun assertion did not reproduce the Node/browser difference;
the controlled platform-boundary variation above did. This distinction is kept
in the harness evidence rather than claiming an unobserved failure.

Fresh production build and Website typecheck pass. Actual repaired Aster page
has byte-identical server/browser date text and no console warnings/errors.
Inspected its fresh desktop screenshot. The earlier eight pack captures remain
presentation evidence; they are not mislabeled as captures from the repaired
build. No styling changed. Root tooling/contracts suite passes 188 tests and
18,140 assertions. Generated drift, block contract and block-kit checks pass.
Build still reports its existing Browserslist-age/chunk warnings; no dependency
upgrade was performed. Final candidate-wide acceptance remains Task 8.

## Preservation and cleanup

Restored exact baseline Aster appearance values and installation identity;
normal publication revision advances were retained. Verified all four original
pages, both original events, general/reading/plugin settings, menus and all four
private Customizer drafts against the saved baseline. Checked other pages/posts
and synced sources for references to the owned artifacts before retirement.

- Mixed page k9825w4682xavx7nbj8wa36xs98fsgtk is in recoverable Trash with its
  authored blocks/history retained; actual public route shows 404.
- Event qd7kfhz82m3845ga04hsn3rcfd8fskfm is archived; actual public detail shows 404.
- Reusable source rh88hrt480zfjhg205cw0c1nsn8fr6g4 is withdrawn; revision-2 blocks
  and digest are unchanged and history remains recoverable.
- Definition k57b9fn5sxqfmex939hxm4wjy98frmxt version 1 is revoked with no active
  version; its immutable digest and version are preserved.

No unrelated consumers were found. No hard-delete API was invented. These are
retired test artifacts with recovery history, not claims that all database rows
were purged. The earlier scaffold cleanup and refreshed native/SDK instructions
are documented in kit-workflow-refresh-20261006.md and its linked trial reports;
together these close the combined docs/fixtures checklist item.

Each scoped operator API session used normal logout with failed refresh (401).
Closed owned browser tabs 58–60 and reset viewport. Stopped only the owned 4322
preview; all seven protected processes and original four example tabs remain.
The isolated build initially lacked its node_modules symlink; adding the same
runtime dependency link used by earlier isolated artifacts resolved the harness
startup failure before browser acceptance. Initial inspection also corrected
an invalid definition-list page size from 100 to the documented maximum 20.

Evidence directory: output/field-events-final-20261006/. Key receipts:
browser-checks.json, link-checks.json, event-updated.json, *-switch.json,
ssr-before.html, ssr-after.html, renderer-red.log, renderer-green.log,
renderer-evidence.json, repaired-browser.json, aster-house-repaired-1280.png,
appearance-restored.json, cleanup.json, cleanup-public-*.txt and
runtime-cleanup.json. Private baseline remains outside the repository with mode
0600; credentials were never copied into these receipts.

Next: final source/artifact and all-block evidence reconciliation, integrated
native acceptance and local integration. Actual AI, Instagram, human Turnstile
and Vimeo acceptance remain explicitly pending; no wait for a new Claude audit.
