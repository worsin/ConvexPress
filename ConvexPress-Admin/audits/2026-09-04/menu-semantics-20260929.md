# Resolved menu semantics, keyboard focus and pack preview — September 29

E28 is closed at its defined shared-menu boundary: all four actual Website headers/mobile menus passed responsive and keyboard acceptance, with the target's existing menu assignments preserved exactly. The full native Customizer workflow remains open under Task 5.

## Causes and repairs

The public resolver preserves `heading` and `separator` kinds and removes their URL, but consumers previously treated the compatibility `#` as a link. `MenuItemTarget` now owns that shared rendering decision across Core, Journal, Depot and Aster House header/mobile and resolved-menu footer consumers. Real links retain destinations/targets/relationships; static headings remain text; disclosure headings are buttons with expanded state; separators suppress editor labels and retain reachable descendants. Depot no longer creates `All <heading>` dummy links. Explicit authored footer link cells retain their existing contract.

Actual browser verification then reproduced two keyboard defects. Escape from a nested link left both desktop disclosures open. The owning list item now handles bubbled Escape, closes the nearest open disclosure, clears its pending hover-open timer, and returns focus to that disclosure's control. A second Escape closes its parent. Mobile Escape closed the drawer but left focus on the body. The shared layout controller intentionally blurs the opener before making the background inert, so capturing it in the drawer effect was too late. The controller now remembers the opener before that blur and restores it after closing, without stealing focus from another active control or an opening search overlay. The regression harness now executes the real layout controller.

### E63: temporary preview body

On the isolated target, saved activation remained Core while `?template=journal` selected Journal chrome. The authorized canonical body stayed at `Loading document…` indefinitely because it compared the *preview* pack to the backend's *saved* presentation pack. `useTemplate` now retains `savedPackId` separately from its validated installed preview selection; `useTemplateSettings` exposes it; the public-body guard compares that saved activation with the authorized DTO. Rendering uses the selected preview pack. Document/viewer/site/grant/policy checks are unchanged. A failing-before lifecycle regression now proves preview paint, continued refusal of a real saved-activation mismatch, successful rendering when that DTO catches up, and rejection of another viewer's result. Actual four-pack public bodies render without changing saved appearance.

### E64: narrow support block in a desktop page

Visual inspection of Journal and Aster House at a 1440px viewport found `support/ticket-cta` splitting “conversation” across lines: Journal's actual block was 590px wide, with only 321px available to its heading because the action remained beside it. Its breakpoint consulted viewport width. The block now uses a named inline-size container query, stacking its existing children when its own width is at most 640px. Core/Depot wide layouts retain the side action; all four narrow/mobile layouts stack. No content field, version, resolver or action changed.

## Verification

- `tests/menus/render.test.ts`: **37 targeted checks** covering actual four-pack headers/mobile components, shared dropdown/list/footer consumers, nested Escape and focus return. Account/cart/router/menu inputs are controlled; the real layout controller and Depot Dialog execute.
- Five focused test files: **10 pass / 0 fail**, 47 outer assertions. The public-body and data-installation files run their own isolated lifecycle suites. Website TypeScript and scoped lint pass.
- Live Website **4325**, current hardening source, isolated target backend **4870/4871**, `promotion-target-20260911` / `promotion-acceptance-20260911`. Four packs at **1440×1000** and **390×844**: real header and body, nested links, nonlink headings, suppressed divider labels, separator descendants, external-link relationship, Escape/focus, panel geometry and no horizontal overflow. **8 menu cases, zero page errors.** Screenshots of all four open desktop and mobile menus were inspected.
- Support layout: failing-before browser geometry retained; **8 passing cases**, four packs at 1440px and 390px, no overflow, and all eight final screenshots inspected. These additional screenshots were taken after menu cleanup and intentionally show the original empty navigation.
- Canonical synchronization check passes. Central renderer evidence refreshed after the final code/CSS changes: **317 tests / 5,493 assertions**, **1,148 example/pack executions**, 137 current block versions. Controlled renderer examples do not certify full live/native workflows.

## Fixture and process preservation

The target began with no menus and 12 unassigned virtual locations. One owned menu with 11 items exercised the normal header fallback. No location assignment, appearance, page, template, plugin or email setting was changed. The owned menu/items were deleted, then exact snapshots verified: **28 original pages**, original menu/location state, complete appearance snapshot, email templates and **zero queued emails**. The owned API session was revoked and its private session file removed. `cleanup.json` records this.

The separate Website4325 runtime and its browser were closed after acceptance, and port4325 was confirmed released. They were used so the existing source Website4322, user processes and pending human RSVP challenge were not rebuilt/restarted. The prior mobile test expectation was corrected to check actual inert/offscreen closure for persistent drawers; it no longer mistakes Playwright's DOM visibility for an inert drawer being open. Depot's unmounted dialog uses the normal hidden assertion.

## Evidence and remaining scope

Ignored local evidence lives in `output/menu-semantics-20260929/`: `desktop.json`, `mobile.json`, screenshots, `escape-before.json`, `mobile-escape-before.json`, `controller-focus-red.log`, `preview-red.log`, `preview-green.log`, `support-layout-red.json`, `support-layout.json`, `tests.log`, `types.log`, `lint.log`, `sync-check.log`, `runtime.json`, `fixture.json`, and `cleanup.json`. Central receipt: `output/block-evidence-20260929/renderer-tests.json`.

Footer resolved-item semantics have controlled DOM/SSR coverage. Live footer assignment/layout editing and the full native Customizer assignment/save/reopen/publish/conflict/operator-authority flow remain Task 5. This report does not certify those workflows, all authored example sites, migration retirement, or full delivery. Tracker remains 117 Verified / 20 In progress; no row promoted.
