# Content discovery completion — 2026-09-28

Latest Posts, Post Grid, Tag Cloud, Related Content, Archive List and Featured Page have current native authoring, public data/navigation, four-pack and recovery evidence. This batch reuses their accepted bounded readers, taxonomy/access tests and shared editor infrastructure. Two demonstrated lifecycle defects were repaired: E30 Featured Page destination URLs and E31 taxonomy cleanup when deleting pages.

## Repairs

Featured Page returned the stored page path without the Website's `/page` prefix. The actual keyboard-operated CTA reached404. The reader now prefixes the existing hierarchical path and safely encodes a slug fallback. Registered canonical-reader assertions cover flat, nested and missing-path records; permission checks remain unchanged.

Pages can carry category/tag context for Related Content. Permanent page deletion previously left these relationships behind; subsequent category deletion tried assigning a default category to the missing page and failed `POST_NOT_FOUND`. Page deletion now invokes the existing bounded taxonomy cascade before removing the source. Category deletion also discards previously orphaned relationships while retaining normal default-category reassignment for existing documents. It creates the default category only when an existing document actually needs reassignment; deleting empty/orphan-only categories does not create unrelated data. Tests reproduce both failures, preserve another page's relationship, and verify surviving-source reassignment.

## Acceptance

- Native Electron863 used a separate profile and the disposable source staging environment. All six blocks were inserted and their fields edited through native controls. Latest Posts category/tag selections store slugs; Post Grid category/tag/author selections store exact IDs. Count/limit/heading/body/eyebrow, excerpt/byline toggles, post/page related variants, month/year archive variants, tag maximum and Featured Page/CTA controls passed. A no-image page and empty reference rendered their correct states; undo restored the selection.
- Revision2 saved the six-block tree, revision3 changed the alternate fields, revision4 restored the exact original tree, and reopening retained the fields. Publication5 and alternate public settings6 were read back. The actual Website iframe rendered expected records and withdrew a deleted Featured Page target. Final native errors:0.
- Main public matrix: Core, Journal, Depot and Aster House ×1440/390px,8 cases. Exact category/tag/author results,7 decoded images, isolated Post Grid and related-post continuation, real tag/month archive destinations, keyboard Featured Page destination, no private/draft/empty-topic labels, no overflow, and no page/console/hydration errors. Related posts continued from two items to the third without duplication or changing the other block's results.
- Alternate public matrix: another8 cases, same packs/widths. Topic continuation at max1, related-page continuation through three actual siblings, private sibling exclusion, actual page destination, and yearly archive destination. Final run errors:0.
- Live privacy withdrawal changed only owned sources. Latest Posts, Post Grid, Tag Cloud and related posts became empty; Featured Page withheld its title/image/link. Existing original archive content remained available. Deleting the featured target also withdrew its card in native and public views.
- Archive List deliberately exposes accessible period links, not cached story counts. Current tests cover time zones, DST, inaccessible periods, continuation and budgets. This closes the block's actual month/year contract; no fabricated count field was added to satisfy the earlier review shorthand.
- BlockDemo:48 block/pack/width cases covering112 canonical example renders. Images decoded; no page errors. Representative public desktop/mobile screenshots were visually inspected.
- Focused backend:164 tests /1619 assertions across10 files. Renderer:310 tests /5442 assertions. Explicit Convex project typecheck passes; strict deployed typechecks pass. Media writer coverage remains1487 classified writes across30 owner tables, no bypasses. No frontend contract/build changed in this batch; the existing accepted Website4322 build was reused.
- Final installed snapshot: `ConvexPress-Admin/output/production-checkpoints/content-discovery-final-20260928`,1609 exact hashes,22 installed Events files and all2405 function signatures preserved. The scoped deployments used storage-inclusive private backups. Target4870 was untouched.

## Retained diagnostics

The initial public matrix's404 is the E30 regression evidence. A subsequent destination-body assertion exposed a fixture mistake: supplied article content with default `blocks` mode. The five owned destination pages were explicitly switched to article mode; original pages were unchanged. One mobile harness waited on offscreen lazy images; the owned browser was closed, appearance restored, and the harness now scrolls each image into view before bounded decoding. No product renderer was changed for these harness issues.

The first alternate matrix passed all content assertions but recorded three Clerk startup fetch errors; that failed run is retained. The final matrix waits for actual Clerk initialization before navigating/closing and passed without filtering errors. The first page-deletion test used `tag` instead of the schema's `post_tag`; it was corrected before meaningful red assertions. Two unscoped local TypeScript invocations selected a parent project and exhausted heap; explicit `-p convex/tsconfig.json` passed. A renderer invocation used Node for a Bun fixture; the correct Bun invocation passed. These failed invocations are not counted as product regressions or green checks.

Evidence: `output/content-discovery-20260928/`; final deployment identity: `output/content-discovery-final-20260928/`. Full delivery remains active: migration, cross-version promotion, plugin parity, sample sites, Customizer and remaining blocks are separate open gates.


## Cleanup and final evidence

The live cascade probe created a seventh owned page with category/tag relationships, deleted it through the normal page mutation, then inspected stored relationships: zero remained for the new page; the two pre-repair orphan rows were still present for the original host. Normal category/tag deletion removed those old orphans. An empty-category probe on the final deployment retained the exact original taxonomy without creating a default.

The earlier eager-default behavior had created one unused `Uncategorized` record during cleanup. Its ownership was established against the private pre-fixture snapshot; it had zero relationships. After a private row backup, the built-in authenticated Convex dashboard mutation removed only that exact owned ID. The CLI generic function dispatcher returned a server error for this system mutation; the explicit mutation transport succeeded. Original taxonomy compared exactly afterward. No table replacement/import or original-record rewrite was used.

Seven owned pages, seven owned posts and seven owned terms are removed, plus the one derived default side effect. All42 original pages, both original posts, the original taxonomy row, menus/locations and appearance compare exactly to the baseline. Existing image records were used without modification. The native session signed out and ownedElectron863 closed; userElectron39198 remained running. API session revoked; consumer index ready; fixture route404.

A strict deployment typecheck rejected the first lazy-default patch because its optional ID lost narrowing inside an index callback. Capturing the resolved ID in a local constant fixed it; the successful final deployment retains all1609 hashes and2405 installed function signatures. Failed typecheck evidence remains alongside the final result.

Tracker dry-run/readback updated only the six rows' Status/Tests/Screenshots/Notes:72Verified/65Inprogress across137rows. All other cells retained; JSON header, block-row counts and live tracker agree.
