# E89 — top-bar placement and theme control variants

Task5, October6. Repaired and verified within this boundary. Full editor/template delivery remains active,117Verified/20In progress.

## Workflow, failure and repair boundary

1. Required workflow: native Customize top-bar Left/Right Content and Dark Mode Toggle variant must control the actual header, alongside working CTA and guest-account choices.
2. Evidence:16real-header case groups fail before repair:12Journal/Aster order/duplicate-slot failures and4missing Switch variants. Existing CTA label/destination/styles and guest choices pass without production changes.
3. Dependency: Journal/Aster collapse both top-bar slots into one centered content list; every header calls an icon-only ThemeToggle without its configured variant.
4. Repair: shared two-slot HeaderTopBar preserves each selection and ordering. Pack wrappers retain their typography, colors and width. Contact/announcement content wraps within bounded cells; social links can wrap; phone-only contact no longer disappears at the mobile breakpoint. ThemeToggle supports an accessible switch with checked state, keyboard button activation, visible thumb/icons and focus treatment. All4headers pass the configured variant; existing default icon callers retain their behavior.
5. Exit check: all top-bar combinations, theme interactions, CTA/guest modes and disabled controls; native four-pack publication; actual desktop/mobile geometry, theme persistence and CTA navigation; preserve and clean up.

## Evidence

`output/header-controls-20261006/`:

- `red.log`, `green.log`:64top-bar combinations,8theme interaction cases and12CTA/guest cases. Real header components, actual SocialLinks and ThemeToggle; controlled external settings/auth/menu queries. An initial social assertion used the SVG's text title instead of the link's accessible label; corrected before the recorded16product failures and repair.
- `tests.log`:8tests pass across7files, including existing branding/layout/search/navigation/mobile/menu-source regressions. `types.log`, `build.log`:Website types/build pass. Changed-file oxlint and diff whitespace checks pass. No repository-wide health claim.
- `native-published-snapshot.json`: all4packs activated and configured through actual native Templates/Customize. Each publishes contact on the left, announcement on the right, a theme Switch, an Outline CTA to `/blog`, and Login Only guest links. Reviewed publication is explicit. Existing E83/E84 evidence covers shared draft/reload/history behavior; it was not needlessly repeated for every field.
- `browser-proof.json`: each pack verified at1440px and335px. Desktop slots remain in left/right order; guest registration is absent while sign-in is visible. Space changes theme; reload retains it with correct switch checked state; a click restores the prior visual theme. CTA reaches the actual blog. Mobile header stays within its width, with the switch and contact row rendered. Browser theme preference is exercised locally; it is not a site database setting.
- `aster-header-mobile.png`: visually inspected narrow Aster header, showing both contact destinations, right-aligned announcement, theme switch and login-only action. CTA retains the existing desktop-only breakpoint.
- `browser-errors.json`: no captured Website error messages. No signed-in account-menu lifecycle is inferred from anonymous guest evidence.

## Preservation

Before restoration, authoritative appearance values were asserted equal to exactly the expected four edited header groups for each pack plus active Aster. `restoration.json`:original appearance restored exactly;43pages/general/reading/menu-location rows/drafts exact. No menu or content fixtures were created. Normal revision/audit metadata advanced. No backend deployment,target writes or push.

`cleanup.json`:original native Live scope restored and sign-out observed; API revoked and refresh401; owned native56239/Website56328 stopped, private profile removed. Owned browser tab closed and viewport reset. Seven protected processes remain alive.

## Next

E09 remains open. Verify signed-in account display/presets and contextual click-to-edit behavior against the existing dashboard/authority evidence. UserMenu already reads loggedInDisplay and dropdownPreset; that source finding is not a completed runtime check. Audit47 remains latest/adjudicated; no new Claude audit is required to proceed.
