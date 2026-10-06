# Native and responsive preview selection — E91

Preview selection now works in the native Electron Customizer and the on-site Phone/Tablet frames. Verified locally on 2026-10-06; no push or backend deployment.

## Reproduced gap and repair

The Website preview provider only accepted draft messages. It had no selection command or response path. The native route had neither a picker control nor a way to open/focus nested header/footer controls. A real native composer test failed to focus `header.search.variant` before the repair.

Added an ephemeral picker to preview pages. It must first receive a valid draft from its actual parent; selection commands then require that parent and its established origin. Capture-phase picking suppresses the clicked control's action and returns its declared field. Escape sends cancellation. Listener/highlight state is removed on cleanup. Ordinary unframed pages do not install the picker.

Both hosts accept selection only from their own current preview frame and expected origin, while picking is active, and only for a field in the installed module catalog. The on-site host clears its field search and restores focus. Native selection opens the outer group and inner header/footer section and focuses the actual input or selected variant. Native groups remain manually collapsible afterward. Changing native page/device/pack/site scope cancels selection. No selection message writes settings or changes authority.

## Verification

- Website: 19 focused tests across six files pass, covering preview protocol rejection, actual filtered/repeated/frame selection, existing header control targets, draft recovery, module/relevance behavior.
- Admin: four focused tests pass, including actual composer field focus/collapse and exact frame/origin/catalog gating.
- Both apps: TypeScript and production builds pass. Changed-file lint and `git diff --check` pass. Admin build retains its chunk-size advisory.
- Actual isolated Electron window, source staging/Core: Desktop search and theme clicks focus Icon Only and Icon; Phone navigation focuses Slide-in Drawer; a footer click opens Footer > Footer Layout and focuses Background; Tablet search selection also focuses Icon Only. Escape inside the frame cancels; the selected Search section remains collapsible. UI remains Everything published throughout.
- Actual built Website, authorized through the registered one-time operator handoff: four packs, Phone search/navigation and Tablet search/theme, 16 accepted cases. Each clears a Contact field filter, focuses the matching setting, preserves light mode and leaves search collapsed. Frame DOM receipts verify the selected pack. A seventeenth Aster selection verifies an unsaved placeholder survives picking; Undo then restores it. Escape in the Tablet frame restores the host panel. Browser errors: none.
- Native screenshot: `output/customizer-frame-pick-20261006/native-footer.png`. Website screenshot: `output/customizer-frame-pick-20261006/responsive-picker.png`. Both visually inspected.

A first browser evidence read attempted parent access to the iframe document, which the automation read scope did not expose. It was replaced with a frame-scoped locator DOM read; only the latter verified cases are counted. Native proof is the actual app window, not a browser rendering its route.

## Preservation

Original appearance snapshot, general/reading settings, menu locations, all 43 pages and all four pack drafts compare exactly with the baseline. Local previews discarded; Website editing ended. Native scope restored to Live and control-plane sign-out observed. API session revoked; refresh returns401. Owned Electron58421 and Website58538 stopped, private profile/session/handoff removed, tab28 closed and viewport reset; seven protected processes remain alive. No content fixtures created, no publication, no target/backend deployment.

## Boundary and next work

E91 closes the demonstrated frame-selection gap. It does not assert that every surface has complete contextual annotations or that all signed-in account controls are accepted. E09 remains open for the remaining per-field/account acceptance map, using E82–E91 and prior native history/authority evidence. Full delivery goal remains active at117Verified/20In progress.

Evidence directory: `output/customizer-frame-pick-20261006/`, including native-red.log, native-green.log, protocol-tests.log, website-regressions.log, website-types.log, admin-types.log, website-build.log, admin-build.log, lint.log, native-receipts.json, browser-receipts.json, preservation.json and cleanup.json.
