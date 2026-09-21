# Calendar acceptance — September 6

Calendar is renderer/browser acceptance **94/136; 42 remain**. Full block certification and the original 24-item production goal remain open.

## Implemented and staged

Closed month/timezone/category/cursor contracts; document/environment/filter-bound pagination; native category picker and optional IANA zone. Omitted zone uses the site's setting. Visitor navigation cannot alter saved filters or authority. Civil month/day boundaries cover DST and skipped dates, with half-open carryover and multi-day placement. Derived interval buckets avoid scanning unrelated history. Published events, plugin state and current membership access are checked at read time.

Five derived calendar indexes, bounded missing-key recovery, and refusal while indexing is pending. Native writes and promotion apply/rollback recompute keys. Source budgets and continuation remain explicit. Template-owned month/agenda renderer, previous/next/today and event-page links, readable compact list, reduced-motion behavior, and four-pack BlockDemo.

Backend `careful-cormorant-268`, checkpoint `output/production-checkpoints/calendar-20260906`: 1,097 files, five added indexes, none removed. Website staging release `nx7daqjbk16zsywrv7j5m04ams8dws3e`, artifact `24fa9fc7c88dcdf1b0b5a7284e9b6905da1e9834168ff93d52ced5ca4a079238`. Public route: https://aster-house-staging.h5s.workers.dev/page/navigation-field-guide/. Production unchanged.

## Native save defect repaired

New block initialization retained optional fields as explicit JavaScript `undefined`. Convex omitted them when writing; the editor failed to hash its local draft and presented the successful save as a conflict. Live diagnostic: `$.blocks[5].attrs.category must not be undefined`; fresh server read was already revision 12.

The initializer now omits unset fields. Save preparation normalizes unset object properties after schema validation and verifies digest compatibility before mutation. Required-field and invalid-number validation remain intact; arrays are not silently filtered. Regression covers a new Calendar, an existing draft with explicit undefined, nonmutation of that draft, JSON transport/receipt equivalence, idempotence, and invalid values. It failed before the fix and passed afterward.

Actual Electron added and saved a second Calendar with untouched optional fields: All changes saved, preview enabled, no alerts. Removed that temporary block and saved again. The original six-block page remains saved. Saved Website preview rendered Calendar. Native category picker selected Workroom; preview and anonymous staging showed only its event. Reset category and saved the original unfiltered configuration. No alerts, preview enabled. The repair runs in development Electron; packaged release acceptance is separate.

## Verification and evidence

- Backend: 2,228 tests / 9,399 assertions; renderer: 95 / 2,814; Calendar BlockDemo: two browser tests covering four packs and two widths, 16 screenshots and constrained containers.
- Native workspace: six tests / 68 assertions. Encompassing canonical-editor suite: 12 passing entry tests across seven files. Admin type check and git diff check pass after the save repair.
- Calendar checkpoint also passed backend/Website/Admin types, consumer fixtures, generators, writer gate and actual workerd hosting checks. The subsequent save repair changed only Admin frontend and tests.
- Anonymous staging: agenda has exact Denver time ranges; second page contains Clay at the table and survives reload; October contains Under the pines; Today restores September. Category excludes Mountain morning; resetting restores it. No overflow at 390/1440 pixels.
- Root `output/calendar-20260906`: live month/agenda, saved native preview and acceptance logs. Clear mobile capture visually inspected. Earlier element captures overlapped the fixed header; use `live-month-390-clear.png` and `live-month-1440-clear.png` for public visual evidence.

## Remaining boundaries

Control-plane snapshot restore strips derived calendar keys for target rebuild, with passing unit tests, but the patch is NOT deployed and live restore is NOT accepted. Carryover/DST has automated reader/renderer coverage; no cross-month live event was authored during this acceptance. Source access work remains bounded at 96 candidates per response. Arbitrary raw database edits bypassing supported writers are not certified. Full fleet backup/recovery, packaged clean-machine testing and the rest of the original audit remain open.

MagicTables AppTables now tracks site-local `extension_events`, row `px7fckxc5v761tf86xsszv2gg58dwnt9` (dry-run create 1, verified readback). The legacy generic calendar_events row was not repurposed. Calendar tracking updates Notes only; full completion flags remain unchanged.
