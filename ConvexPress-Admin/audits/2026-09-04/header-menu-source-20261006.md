# E88 — header menu selection across site and account chrome

Task 5, October 6. The compact-shell routing defect is repaired. Scoped component and native/public integration checks pass; full delivery remains active at 117 Verified / 20 In progress.

## Failed workflow and repair

1. Required workflow: Primary, Secondary and Custom selections in Customize must reach desktop/mobile site navigation, including compact account pages.
2. Evidence: six rendered shell cases failed in Core/Depot: Secondary, a custom slug, and a missing custom location all incorrectly resolved to the primary menu. Journal/Aster already honored these settings.
3. Dependency: Core `AccountLayout` and Depot `CompactFrame` hardcoded `header`; marketing, Journal and Aster duplicated a correct source selector.
4. Repair boundary: one `useHeaderMenu` hook used by all five callers. Existing template location remapping, custom-slug trimming, blank-custom fallback and missing-menu behavior remain intact. Full dashboard navigation retains its separate configuration. The unused standalone `components/menus/MobileMenu` has no live callers and was not changed.
5. Exit check: real four-pack compact shells through the actual lookup hook, then native publication and actual Website desktop/mobile source and location checks with independent footer assignments.

## Verification

Artifacts: `output/menu-source-20261006/`.

- `red.log` / `green.log`: six routing failures become 23 passing cases. The fixture renders each actual compact shell, controls external query/settings sources, and observes the desktop/mobile surface boundary. It covers Primary, Secondary, trimmed Custom, blank Custom and missing Custom for each pack, plus independent footer mapping. It does not represent a new signed-in customer browser run; prior dashboard lifecycle evidence remains separately indexed.
- `tests.log`: five tests pass across menu-source, mobile-menu, header-navigation and footer-descendant suites. Website types/build and changed-file oxlint pass. `git diff --check` passes. An initial test invocation from repository root hit EMFILE; running from the Website app with the established increased descriptor limit passed. No product fix was attributed to that harness failure.
- `browser-proof.json`: 12 actual Website cases, four packs × three menu sources, each at 1440px desktop and 335px mobile. Native Templates activation and Customize publication selected the source. Desktop and mobile show the selected owned link, mobile navigation reaches its `/search?q=...` destination, and desktop footer retains `Footer guide`. Initial Primary states use published defaults after native activation; changed sources use Review changes → Publish settings. Core's first Secondary case predates the added rendered-pack attribute assertion; its native pack identity and later Core checks remain corroborating evidence.
- `mapping-proof.json`: native Core Menu locations remapped Primary → secondary and Secondary → header. Both desktop and mobile follow each mapping, independently of the footer assignment.
- `aster-custom-menu.png`: visually inspected actual Aster mobile menu showing the custom-location destination.
- `browser-errors.json`: no captured error-level messages. Warning log showed the expected Clerk development-key notice. Two redundant return-to-home navigations were aborted while the preceding link transition settled; accepted receipts show the correct destination. The helper was changed to wait for the selected destination and omit that unnecessary navigation.
- `native-preview-reloaded.txt`: the Customizer was opened before the Website runtime finished starting and initially held a failed iframe. After runtime startup and restoration, native reload shows the actual Website preview URL and Everything published. This batch does not claim an independent full draft/history/preview lifecycle; reuse E83/E84 for those shared flows.

## Preservation and cleanup

Four owned one-link menus were assigned through the registered API to header, secondary, sidebar and footer-1 on disposable source 4860. Before restoring, the live appearance snapshot was asserted equal to exactly the expected native edits: all four navigation groups, active Core, and Core's swapped menu mapping.

`restoration.json`: original appearance values, original empty menu inventory, pages, general/reading settings and four draft records restored or unchanged. All four owned menus/items removed using registered deleteMenu. Menu-location names, descriptions and assignments are semantically identical to baseline. The four previously virtual default locations remain materialized with IDs/timestamps after assignment/unassignment; their original absence is not claimed restored. All unaffected location rows are exact. Normal appearance revision/audit metadata advanced. No backend deployment, target-site write or push.

`cleanup.json`: original native Live scope restored, native sign-out observed, API refresh refused 401 after logout, owned native 55167 and Website 55344 stopped, private profile removed. Owned browser tab closed and viewport reset; all seven protected processes remain alive.

## Remaining

E09 remains open for the remaining per-field header controls and complete Customizer integration. Next inventory top-bar, CTA, user menu and theme-toggle fields against current consumers and accepted evidence. Reuse E82–E88; do not repeat accepted matrices or expand into a broad platform audit. Claude audit47 remains latest/adjudicated; Codex continues independently.
