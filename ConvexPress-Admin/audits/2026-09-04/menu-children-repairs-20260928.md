# Menu defaults and Child Pages depth — September 28

Two delivery blockers were reproduced, repaired and verified on the disposable source site. This is **partial family acceptance**, not closure of either tracker row. Tracker remains **63 Verified / 74 In progress**; no tracker writes or push.

## Menu default (E24)

The canonical Menu spec defaulted to `primary`, but the registered Primary Navigation location is `header`. A new default block therefore returned no menu through the exact-location reader. Regression tests failed for both a newly authored block's default and the historical `primary` reader before the repair.

New default/example values are `header`; generated authoring, backend, AI and portable contracts are synchronized. Historical explicit `primary` values fall back to `header` only if there is no stored `primary` location. A stored custom location remains authoritative when assigned or deliberately empty. The additional lookup uses the existing read ledger; menu visibility and safe-link filtering are unchanged. No saved content rewrite or schema-version change.

Actual Electron PID86834 inserted the default Menu with `header`, saved it, changed it to `primary`, saved/reopened it and published accepted revision5. The live public resolver returned identical `header` and `primary` results. The disposable site had no stored locations/menus, so this live case proves the existing header fallback; assigned/custom-location precedence is registered-query test evidence, not a native assignment claim.

## Child Pages depth (E25)

The live fixture's fourth descendant was refused with “Maximum page nesting depth is 5 levels.” The helper `computePageDepth(parentId)` already counts the parent chain, while five mutation callers added1. Root depth0/direct child depth2 reproduced both live and in registered mutations.

Removed the extra increment from create, update, reorder, setParent and permanentDelete. The helper and internal recomputation semantics remain unchanged. Tests prove depths0–4, fifth-level rejection, subtree-depth rejection with unchanged paths, parent updates, drag reorder and deletion reparenting. Existing user pages were not bulk rewritten.

After strict deployment, the fourth descendant was created successfully. Actual native Quick Edit moved Materials to root (descendant depths0,1,2,3) and back beneath the authored page (1,2,3,4). Actual native Child Pages edits at depths1,2,3,4 rendered exactly1,2,3,4 links. Both the private direct child and its public descendant were omitted. Save/reopen/publication retained the authored Menu and depth4 Child Pages values.

## Validation and limits

- Focused final run: **50 tests / 11,310 assertions**, including schema/authoring, public-menu, navigation-reader and registered page-mutation cases.
- Backend `tsc --noEmit -p convex/tsconfig.json`, block checks, sync verification, kit check and diff whitespace check passed. Initial bare `tsc` calls from the backend package selected the ancestor project and exhausted the heap; those were harness invocations, superseded by the explicit project check. No repository-wide green claim.
- Two strict disposable deployments at4860 used private storage-inclusive backups and verified snapshots preserving all22 installed Events files. Each preserved all **2,404 installed function signatures**, with none added or removed. Latest snapshot: `ConvexPress-Admin/output/production-checkpoints/menu-depth-20260928`. Target4870 untouched.
- Native depth/default/legacy-value and hierarchy checks had no page/console errors. The actual Website preview was inspected; `native-four-levels-rendered.png` shows the full nested directory.
- Eight public cases across Core/Journal/Depot/Aster House at1440/390: correct nested menu, heading, separator, description, external target/rel, four descendant links, private-branch omission, no horizontal overflow and no page/console/hydration errors. Settled focus persisted for2.5seconds in all8. Core1440, Journal390, Depot1440 and Aster390 captures were visually reviewed.
- **E26 remains open:** the first public run lost mobile focus. A separate early-render diagnostic showed the original link detached, a replacement initially focused, then focus moved to BODY around2seconds without page errors. Waiting for network idle before the successful8cases does not resolve or supersede that initial-interaction failure. The exact lifecycle/remount cause still needs a regression and repair preserving viewer/grant boundaries.
- Full Menu/Child Pages acceptance still needs remaining explicit selected-menu/location reassignment, maximum content and relevant history/interaction checks reconciled with prior navigation evidence. Template header consumers visibly show the separator label as a navigation item; the inline Menu correctly renders an hr. Carry that header behavior into Task5, not an inline renderer signoff.

## Preservation and evidence

Evidence is in `output/menu-children-20260928/` and second-deployment receipts in `output/menu-depth-20260928/`. Red/green test logs, source manifests, public focus diagnostic, native readbacks, four-pack captures and cleanup receipts are retained. Private backups/baselines/tokens remain outside repository output.

The owned seven-page hierarchy and one five-item menu were removed. All42 original pages, original menus/location projections and appearance values were restored/unchanged. The owned API session was revoked, native operator signed out and owned Electron closed; original user Electron PID39198 remains running. Fixture routes return404 after cleanup.

Opus audit05 F14 is adopted as an explicit Task2/3 console-clean criterion. F15 threshold lives in `scripts/website/check-bundle.mjs:6`:300000bytes=292.96875KiB; its formatter divides by1024 but labels kB. The budget remains unchanged and open under Task8.
