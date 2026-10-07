# E85 Desktop navigation controls and selection dismissal

2026-10-06. Task5 bounded acceptance; full Customizer and delivery goal remain open.

## Reproduction and repair

The real-header regression found6 failures:Journal/Depot/Aster link styles were invariant;Journal/Aster ignored Mega;Depot Flyout could not expose a heading's children. Saved red evidence:`output/header-navigation-20261006/red.log`.

Journal/Aster now pass their navigation configuration into pack-owned menu items, using selected pill/underline styling and flyout/mega arrangement while retaining their typography and rounded popup treatment. Depot uses the shared desktop disclosure component for Flyout and retains its All departments overview for Mega; direct department links consume the style setting.

During actual Website acceptance, following a Depot child link navigated but left the menu open. The selection regression reproduced7 failures across shared and pack-owned submenus (`selection-red-compact.log`; the earlier verbose log is retained but not needed). NavDropdown now propagates an optional selection callback through descendants. Core/Journal/Aster close their owning disclosure and cancel pending open timers;Depot's controlled Mega popover closes when a destination is selected. Heading buttons keep their disclosure behavior.

## Verification

- 7 focused test cases pass across navigation, layout, branding and sticky-header tests. Navigation fixture has12 case groups covering all 3 link styles, both dropdown styles, open/Escape/selection dismissal and nested destination dismissal;Depot's portal-based Mega selection is verified in the actual browser. The test uses actual header components with boundary provider mocks and JSDOM for events; it does not claim measured CSS geometry.
- Final Website check-types/build pass (`final-types.log`, `final-build.log`). Changed-file oxlint reports 0 warnings/errors. The earlier full lint warnings in unchanged download/generated files remain documented; no whole-repository green-suite claim.
- Native isolated Acceptance.app normal operator sign-in, disposable staging4860, actual current Website4322. No menus existed at baseline. Created one owned four-item menu (Guides heading,2 children,About site) through registered mutations;default fallback resolved it without writing any menu location assignment.
- Native Templates activation and Customize publication:Journal Pill Buttons/Mega;Aster Underline/Mega;Depot Underline/Flyout then Pill Buttons/Mega and final Pill Buttons/Flyout. Core retained its original Inline/Flyout controls and was reactivated for the shared dismissal check.
- Actual1440x900 Website:Journal pill radius and two 144px Mega columns;Aster underline border and two 144px Mega columns;Depot Flyout children vertically stacked, and Mega overview includes both child destinations plus the separate About site group. No observed header overflow. ArrowDown opening and Escape dismissal checked on Journal/Aster paths. Screenshots and computed geometry in `navigation-proof.json` and native/public PNGs.
- Final rebuilt Website:5 destination-selection checks (Core,Journal,Aster,Depot Flyout,Depot Mega) each reached `/blog?page=1` and left0 open popup elements. See `selection-proof.json`. The initial Depot failure was followed by a new build and owned server replacement; final selection checks use the repaired build.

## Preservation

Snapshot before restoration equals exactly the expected3 navigation groups plus current active Core. Pages/general/reading/drafts and original menu-location rows remained exact. Restored baseline appearance, verified sole menu ID matched the owned fixture, deleted that menu through the registered mutation and rechecked original empty menu inventory/locations and unrelated baselines. Revision/audit metadata advanced normally. Receipts:`native-published-snapshot.json`, `restoration.json`, `fixture.json`.

Native scope restored to original Live and sign-out observed. API refresh revoked and rejected 401. Owned native 50720 and final Website 51331 stopped;previous owned Website 50762 had already exited before replacement. Private profile removed,7 protected processes alive, owned browser tab closed and viewport reset (`cleanup.json`). No backend deployment or push. Counts remain117 Verified / 20 In progress.

## Remaining scope

E85 closes desktop link-style/dropdown-style consumer wiring and selection dismissal. It does not certify the complete menu-source/location matrix, every long-menu geometry, or all mobile-menu variants. Source review shows separate ignored search variants/placeholder fields and mobile variants; these are the next Task5 controls, not reasons to reopen unrelated audits. Latest Claude audit 46 remains previously adjudicated; no newer audit appeared during this batch.
