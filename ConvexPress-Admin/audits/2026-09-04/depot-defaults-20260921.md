# Depot defaults and nested starter-section layout — September 21

This checkpoint repairs default styling and an actual authored-page layout defect. The original production audit remains **eight accepted / sixteen open**. Full block/template/release acceptance remains incomplete.

## Changes and reproduced defects

Depot's primitive headings inherited display sizes and forced uppercase, and its Card treatment replaced authored padding with one value. Depot now uses a compact mixed-case scale, readable leading, token borders/radii and the SDK's none/compact/default/spacious padding. Plain cards remain borderless. Hero, form and story introductions follow the same compact hierarchy. A wider feature-grid regression exposed the SDK card-copy rule overriding the pack scale; Depot now wins that specific fallback without changing other packs.

A real Electron-authored page exposed a separate shared layout defect: the Depot starter Section's vertical Stack shrink-wrapped its nested Feature Grid to about338px inside1184px of available space. Three cards became narrow text columns. The prior no-overflow check passed despite the visibly wrong result. The shared SDK now assigns a definite100% inline size to nested Sections in vertical Stacks. Cross-axis stretch alone fixed width but retained196px of excess height from intrinsic measurement; definite sizing fixes both. No saved content, schema, semantic heading level, link or template-setting contract changed.

## Verification

- Before-repair heading regression failed on forced uppercase. Extended tests then reproduced23.75px/22.96px feature headings at desktop/tablet before the precedence repair.
- Depot's137 blocks and285 declared examples rendered at1440/390 with no measured overflow or browser errors (570 fixture captures). This matrix predates the nested-section repair; final starter-pattern and composed-page checks provide its scoped follow-up. It is not570 manually approved images or live-provider acceptance.
- All32 installed starter patterns pass at desktop/mobile. Width checks cover nested Sections; height checks cover container-query CardCopy content. Blockquotes retain their legitimate collapsing margins. An initial blanket height assertion incorrectly counted those margins as defects and was corrected; no product styling workaround was applied to quotes.
- Final focused Depot checks pass1440/900/390: heading scale/casing/leading, long copy, padding choices, plain cards, keyboard focus, pricing/features and unchanged source across all four packs. Complete composed-page and layout-rhythm checks pass across packs. Existing owned treatment, interaction, form and Latest Posts checks passed; the initial workflow batch had two reproduced feature-heading failures, superseded by final focused passes.
- Actual Electron process59451 created Hero, Section, Feature Grid and Pricing Cards on isolated Promotion Lab staging4860. Title/copy/actions and two pricing plans were edited using native controls, saved, reopened and published. The rebuilt production Website at4322 and native live preview render the saved page. Final nested feature layout is1184px wide/278.5px high on desktop and278px wide/644.91px high on mobile, matching its container/content. Selected full-page and native screenshots were inspected. The pricing action navigates to the real shop and Back returns to the page.
- Native Depot/Journal/Core activation preserves the exact saved document. The original Core template values were restored.
-289 renderer tests/5004 assertions and6 presentation/design/composition tests pass. Website/demo types, Website/demo builds, canonical checks/freshness, focused lint and diff checks pass. Existing bundle-size/dynamic-import warnings remain. Static styling changes add no animation; this is not an expanded motion-performance claim.
- Refreshed137 Depot thumbnail entries and Journal's Section entry; other template entries preserved. MagicTables updated Notes only on four block rows and two feature rows. Dry runs showed no creates; preapply snapshots matched; read-back compared every cell across137 block and15 feature rows. Completion flags unchanged.

## Preservation and evidence

The owned page was moved to Trash through the normal API. All42 original pages, two posts, image records,155 listeners and template values match the private baseline. The native operator signed out to the Continue login screen. The current site API session signed out; the earlier expired access session's refresh token was located by exact test user and baseline-login creation window, revoked through the existing internal mutation and read back. No blanket user-session revocation. Owned Electron/browser/Website server were closed; original application, renderer, BlockDemo4319 and SSH processes remain running. No backend deployment, provider/DNS change or dependency change.

Artifacts: `output/depot-defaults-20260921/`, including before/final browser logs, pattern regression logs, published-complete desktop/mobile captures and geometry, native-preview-complete, saved document/preservation receipts, test/build logs, thumbnail records, MagicTables before/plan/dry/apply/after/verification files and cleanup receipts. Private baseline content stays in the acceptance secrets directory.

Remaining work: complete per-block field/live-state/design/motion acceptance; default-template Customizer and complete website workflows; Claude handoff and all remaining original production requirements. This scoped repair is not a substitute for those gates.
