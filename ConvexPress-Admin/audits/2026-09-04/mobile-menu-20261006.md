# E87 — mobile-menu variants and interaction acceptance

Task 5, 2026-10-06. Repaired and verified within the boundary below. Full editor/template delivery remains active, 117 Verified / 20 In progress.

## Failed workflow and causal repair

1. Required workflow: native Customize chooses Drawer, Fullscreen or Dropdown and a drawer side; the actual Website exposes a usable mobile menu with that arrangement.
2. Evidence: the real component fixture confirmed only one geometry in Journal/Aster and two in Core/Depot. Dropdown was never anchored below the header. Actual acceptance subsequently reproduced Depot exit layers intercepting a rapid reopening click, Core's homepage brand not closing the menu, and a hidden desktop menu leaving the page inert/scroll-locked.
3. Dependency: four pack mobile-menu consumers ignored portions of the config; Depot's closed Base UI layers retained pointer events; Core's brand omitted the close callback; shared shell state was independent of the CSS desktop breakpoint.
4. Repair boundary: shared geometry/visible-header measurement with pack-specific drawer widths, existing menu rendering, account behavior, modal/focus handling and typography retained. Journal/Aster now expose a dismissible backdrop for partial panels. Closed Depot layers ignore pointer input. Core brand accepts an optional navigation callback. Shell state closes at the matching 1024px desktop breakpoint.
5. Exit check: 24 pack/variant/side component cases plus native publication and actual Website geometry/keyboard/navigation checks; long menu reachability, desktop release, preservation and cleanup.

Ruling: Dropdown is a content-height modal panel below the visible header, bounded by the remaining viewport with an independently scrolling link area. Drawer side applies to Drawer. Fullscreen fills the usable viewport. Base UI reserves a scrollbar gutter in Depot; measure against its backdrop/usable viewport, not the physical window width.

## Evidence

`output/mobile-menu-20261006/`:

- `red.log`: missing variant geometry/header anchoring before repair. Initial Depot focus assertions also ran before its animation-frame focus action; the fixture was corrected to observe that action, not treated as a production focus defect.
- `brand-red.log`: six Core same-homepage brand dismissal failures before its callback repair.
- `resize-red.log`, `desktop-resize-red.json`: component and actual browser evidence of the desktop modal lock.
- `depot-closed-pointer-red.json`: closed popup/backdrop still had `pointer-events:auto`, intercepting the opener during their exit. The same rapid Escape→open→select sequence subsequently passed without a test delay.
- `tests.log`: 12 tests pass, 0 fail across seven focused files; mobile fixture covers all four packs × three variants × two side settings. Header search/navigation/layout/branding, focus shell and sticky regressions included.
- `types.log`, `build.log`: final Website type check/build pass. Changed-file oxlint and diff whitespace checks pass. No full repository-wide health claim.
- `browser-proof.json`: 16 native-published actual Website cases at 335×800: left/right Drawer, Fullscreen and Dropdown for each pack. Distinct bounded geometry, no panel horizontal overflow, focus inside, forward/reverse Tab wrap, Escape restores opener, and nested All articles navigation dismisses the menu.
- `long-menu-proof.json`: a 24-item owned menu remains bounded in all four Dropdown panels, its link area scrolls, and Additional guide 20 reaches `/search?q=mobile-menu-test`. Panel bottom is 800px; menu scroll heights exceed the available navigation height in each pack.
- `desktop-resize-proof.json`: final-build open phone menu→1440px desktop→phone releases background inert/scroll lock for all four packs and returns closed.
- `core-brand-proof.json`: final-build homepage brand closes Core's menu and releases body scroll.
- `aster-long-dropdown.png`: visually inspected final-build phone menu, including its independent scrolling region and retained account footer.

The initial geometry checks remain applicable after the localized Core brand callback and desktop-close additions; the affected behaviors were tested on the final build. Depot's complete menu matrix was checked after its pointer fix. Shared native draft/history behavior reuses E84; not independently repeated for every mobile variant.

## Preservation

Native publication ended with each pack's mobileMenu group `{variant: dropdown, drawerSide: right}` and active Core. `native-published-snapshot.json` was asserted equal to exactly that expected baseline delta before restoration.

`restoration.json`: original appearance values restored; original empty menu inventory and location assignments restored; original pages, general, reading and four draft records exact. Removed only the owned menu and its 24 owned items through the registered delete API. Ordinary publication revision/audit metadata advanced. No backend deployment, target-site changes or push.

`cleanup.json`: original native Live scope restored; sign-out observed; API revoked and refresh rejected 401; owned native 53307 and final Website 54302 stopped; earlier owned Website 53449/53952 had already been replaced and stopped. Private profile removed, owned browser tab closed, viewport reset; seven protected processes remain alive.

## Next

Continue E09's remaining menu-source/location and header-control integration acceptance, reusing E82–E87 evidence. The full per-field Customizer, remaining block/SDK/demo evidence and final integration goal are not declared complete. Claude audit 47 remains the latest and was already adjudicated; no new feedback needed to continue.
