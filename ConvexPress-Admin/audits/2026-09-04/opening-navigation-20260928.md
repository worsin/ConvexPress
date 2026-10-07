# Opening and navigation block acceptance — September 28

Announcement Bar and Breadcrumbs now pass their remaining scoped authoring, public behavior and recovery checks. This closes the two block rows, not Task 1 or the complete editor/template delivery. The separate native editor crash-recovery/autosave gap remains open: unsaved input is retained only in memory and was lost after an owned app restart.

## Changes and causal evidence

- Announcement Bar: disabling dismissal now reveals previously dismissed content. The renderer regression failed before the one-line repair and passed afterward.
- Equal/reversed announcement dates are refused during new authoring, preview and publication. A shared declarative `authoringConstraints` rule applies ordered-field validation to objects/repeater rows. Historical read schemas and stored block versions are unchanged, so old invalid schedules remain readable and recoverable. Compiler regressions cover nested paths, optional/null bounds, defaults/examples and invalid declarations.
- Installed canonical validation exposed a second defect: Zod 4 validation errors did not inherit from `Error`, bypassing the existing error boundary and becoming generic Server Error responses. The boundary now recognizes structured Zod errors and returns sanitized `INVALID_CANONICAL_DOCUMENT`. The registered regression failed before that repair. Detailed field diagnostics remain in the editor/compiler; public handlers return the stable code.
- The utility browser test's Trust Badges fixture expectation was stale: the current example declares four items/icons, including an owned-media item. The assertion now verifies those actual four items and the image. No Trust Badges product behavior changed.

## Verification

Current evidence is in root `output/editor-template-20260928/`.

- Shared compiler: 21 cases passed; renderer: 306; registered document/navigation: 104; affected editor/schema: 29. These are focused suites, not a claim of repository-wide green.
- Admin and Website typechecks, Website build, generated-block freshness and block checks passed. The final installed backend deployment also ran strict typechecking. `git diff --check` passed.
- Existing navigation/library browser cases passed; corrected utilities rerun passed both cases. New Announcement authoring browser test passed all four packs, including dismiss-then-disable and invalid/corrected dates.
- Actual owned Electron profile inserted, edited, saved and reopened both blocks; rejected equal dates with Save disabled; rendered unsaved edits through the real Website; authored manual links/new-tab setting and switched to auto ancestors; published the owned page; and restored a selected historical revision through the native revision UI. Authenticated readback confirmed exact historical title and both block trees with a new monotonic document revision (`native-recovery.json`).
- Installed staging invalid save and preview: four equal/reversed-date refusals with `INVALID_CANONICAL_DOCUMENT`, unchanged document, and a successful corrected preview (`live-validation.json`). Earlier historical invalid publication/restore behavior is covered by the registered handlers.
- Built public Website: manual current identity, exact new-tab link attributes and keyboard destination; visible/private/restored ancestor visibility and keyboard parent destination; Announcement exact destination, keyboard dismissal, retained focus and keyboard restoration. Automatic ancestor changes did not mutate the child blocks or revision.
- Actual published Core, Journal, Depot and Aster House at 1440/390: eight cases passed for announcement/link, manual current trail, keyboard dismiss/restore and no horizontal overflow, with zero page errors (`four-pack-public.json`). Mobile captures from all packs were visually inspected; no clipped block text, controls or current trail. Appearance values were restored exactly with a concurrent-change guard.
- Reused unchanged schedule activation/expiry/hydration and focused restore-control renderer tests, plus the existing all-example four-pack coverage and September 21 auto/navigation evidence. Reuse does not imply unrelated editor or template acceptance.

## Deployment and preservation

Only disposable staging source `http://192.168.1.246:4860` was changed. Snapshot `ConvexPress-Admin/output/production-checkpoints/opening-navigation-20260928` preserves the installed Events plugin. Latest manifest: `deployment-source-boundary.json` (1601 files, 16 reviewed changed backend files). All 2400 installed function signatures remained unchanged. Final private export comparisons confirm all 115 pre-existing posts/pages, six Events tables and three media tables unchanged. Regenerating the reviewed writer hash made the existing reusable-content consumer index stale; the authorized begin/step maintenance path rebuilt it to ready in 240 steps without changing authored pages.

Both owned pages were permanently removed; all 42 pre-existing pages remained exactly equal to their baseline and appearance values were restored. All three former fixture routes returned 404 without the notice text. The owned native session signed out and closed; pre-existing user Electron PID39198 was preserved. No push.

## Remaining scope

Task 1 still needs durable block-tree draft recovery/autosave and the remaining native editor baseline. Other blocks, canonical migration/legacy retirement, templates/Customizer, complete example sites, SDK/plugin/AI and final integrated gates remain active. Claude audit 01 is advisory context with dispositions in the owner-designated `Opus Audits/CODEX-RESPONSE-01.md`.

Tracker dry-run/apply/readback updated exactly these two rows (Status, Tests, Screenshots, appended Notes), preserving all other cells: **60 Verified / 77 In progress**. Receipt: `output/editor-template-20260928/mt-accept-verified.json`.
