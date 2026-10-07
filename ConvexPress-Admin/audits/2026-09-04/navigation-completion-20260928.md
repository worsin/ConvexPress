# Navigation block completion — September 28

Scope: Table of Contents, Anchor Nav and Site Info. Their remaining block-specific acceptance is complete; shared delivery gates and the other blocks remain open. No renderer, schema, backend protocol or asset changed. This batch adds focused boundary regressions and actual authoring evidence, reusing the valid September5/15/21 navigation work.

## Native authoring and recovery

Owned Electron84350 used a fresh profile, native admin4105 and actual built Website iframe4322 against disposable source4860. The author created page g189ssvp7g69hb2bjaczehzv5d8f8wvs through Add a Page and Use block editor. Five native-authored blocks comprise TOC, H2, H6, Anchor Nav and Site Info.

- TOC: empty title uses On this page; depth1 produces the explicit empty state; depth6 includes both H2 and H6. The H2 contains200 authored characters. TOC moved twice to the start of the outline. Custom title and changed depth were saved and later restored.
- Anchor Nav: manual with no items shows its empty state; native required-field modes then authored two exact labels/targets in deliberate order. After publication, switching the unsaved draft to automatic source followed a renamed heading, removed the deleted heading's link, and restored both by Undo. Three Undo operations returned to All changes saved with accepted revision6 unchanged (`native-source-updates.json`, exact document comparison).
- Site Info: empty selection and selecting the absent configured logo each showed the explicit empty state. Native primitive repeater then selected logo/name/tagline. The actual preview showed the exact public site name and tagline, with no fabricated image. Site Info's specification has these three fields; the reconciliation's earlier contact-destinations note was inapplicable.
- Saved/reopened revision3 preserved all fields and block identities. A changed title/depth/heading was saved, then normal revision review restored the exact earlier title and five-block tree as revision5 (`baseline-saved.json`, `restored-saved.json`, `exact-restore.json`). Normal publication created revision6. Settings retained the owned slug and Reading width. Final readback equals the published document after the later unsaved edits/Undo (`published-saved.json`, `final-saved.json`).

Artifacts are under `output/navigation-completion-20260928/`. Native screenshots include `native-site-info.png`; `native-toc-empty.json` records the empty TOC assertion. This is an authoring/acceptance specimen, not one of the final four polished example sites.

## Public behavior and presentation

`four-pack-public.json`: Core, Journal, Depot and Aster House each pass at1440/390. Both navigation blocks have exactly two correct links; real H2/H6 IDs exist; Enter focuses H6 and sets aria-current, and the manual return link focuses H2. Site Info exposes the exact public name/tagline, omitting the absent logo. No page/hydration errors or horizontal overflow. Original appearance values were restored after each matrix.

Visually reviewed Core mobile, Journal desktop, Depot mobile and Aster desktop. The early Aster full-page capture after an animated jump placed its sticky header partway through the screenshot. Follow-up `header-check.json` proves header top0/scrollY0 both before and after the jump; `aster-before-jump.png` is the clean reviewed placement reference. No product header fix was inferred from that capture artifact. Eight viewport captures remain available; E22's separate prescribed screenshot-path reconciliation is still open.

Positive logo rendering and filtered public identity reuse earlier navigation87 browser/registered-handler evidence. This fresh native site has no configured logo: the batch proves that real absence, while the new controlled renderer cases prove supplied-logo and field-subset output. It does not claim to have changed the site's logo or downloaded a new live logo asset.

## Contract checks and limits

- Seven backend navigation reader tests pass27 assertions. The new boundary test projects79 headings with all6levels and200-character text, preserves derived IDs after rename, excludes removed/cleared labels and handles no headings. Existing reader tests cover public-only site projection, hidden ancestors/children and traversal limits. These are reader fixtures, not a claim of new registered endpoint/deployment testing.
-307 renderer cases pass5410 assertions. Added optional/160-character TOC title, invalid161/depth7,30manual items with160-character labels/invalid31, all Site Info field subsets, supplied-logo and absent-logo cases. An initial test wrongly assumed the demo supplied a logo by default; the test now explicitly supplies that fixture URL. No production defect was inferred from that fixture mistake.
- Backend TypeScript, root block check, full canonical sync check and eight-skill/block-kit freshness pass. Runtime code is unchanged from the prior built native/public acceptance; no unnecessary backend deployment or rebuild.

## Preservation and tracking

`accepted-source-hashes.json` records each accepted root spec/renderer. `cleanup.json` confirms deletion of only the owned page after exact saved-document and baseline checks, with42 original pages and original appearance identity/values preserved. The route returns404. Owned native operator signed out, Electron closed, API session revoked and private credential file removed. User Electron39198 and existing4105/4318/4322/tunnel processes remain running. This batch does not claim a new full media/Events/posts parity audit.

The tracker update completed with full before/dry-run/preapply/after comparison (`mt-accept-verified.json`):137rows, exactly3updates, every other cell unchanged;63Verified/74In progress. Only these rows' Status/Tests/Screenshots and appended Notes changed. No push. Whole-bundle budget, E22, remaining Task2 families, all other delivery tasks and the full goal remain open.
