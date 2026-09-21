# Tag Cloud — local implementation and acceptance checkpoint

September 6. The canonical Tag Cloud now has a real server reader, shared data contract, template-owned renderer and interactive four-pack BlockDemo. It is not yet deployed or counted as a fully accepted block. Accepted inventory remains 94/136; the full production goal stays active.

## Implemented

- `blocks/core/tag-cloud/block.json` owns heading and integer max (1–100), with the `content.tags` resolver. All generated schemas, metadata, portable and deployed foundation copies were regenerated. Visitor pagination remains separate from saved attributes.
- `canonicalDocuments/tagCloud.ts` streams alphabetical tags and their relationships using existing indexes. A displayed topic requires an accessible published public post whose publication time has arrived, plus access to the tag archive route. Current post/resource/route membership is rechecked; cached term counts and derived discovery fields are not authority.
- Traversal is bounded by the shared read/source budgets and 96 candidates per call. A continuation can resume inside one topic's relationships. This avoids falsely declaring an archive empty when accessible posts occur after many inaccessible records. Cursors are bound to installation, document and saved limit; only opaque IDs are exposed, not skipped topic labels or source bodies. Deleted continuation records yield a restart state with an actual first-page link.
- The closed data envelope validates the selected cursor/limit, unique topic identities, allowed tag paths and advancing continuation. No arbitrary client resolver or data props are accepted.
- Shared renderer uses template primitives, token colors and radii, wrapping topic links, visible keyboard focus and touch targets. Motion is a small transform on hover, disabled for reduced motion. Empty, continuation, end and changed-archive states are distinct.
- Refined the old MagicTables phrase “weighted tag links” to alphabetical links with uniform styling. Raw cached counts include records that may not be visible to the current viewer and cannot safely determine weights. No fabricated popularity or count is shown.

## Verification

- Final foundation plus topic reader: 74 tests / 4,596 assertions / 18 files. Includes 130 inaccessible relationships before the accessible post, independent scope/document/limit checks, private and scheduled exclusion, tag and post route restrictions, grant revocation, malformed contracts and deleted-cursor restart.
- Full backend checkpoint before the final deleted-cursor refinement: 2,232 tests / 9,427 assertions. The final refinement passed focused reader/foundation regressions and explicit backend types.
- Renderer and refresh scheduling entry suite: 6 passing tests. Its internal all-example renderer suite covers all discovered packs and now installs the topic fixture through the real data trust gate.
- Backend, foundation, Website and Admin type checks passed. A scheduling-only fixture's existing deliberate partial DTO cast needed an explicit unknown intermediate after the data union grew; production scheduling logic was unchanged.
- Final browser run: three cases at 1440, 390 and 320 pixels; each covers Core, Journal, Depot and Aster House. Keyboard paging, browser Back/Forward, first-page reset, reduced motion, 44px minimum hit areas and no horizontal overflow passed. Twenty-four screenshots retained; Journal desktop and Aster House mobile treatments visually inspected.
- Block generator/catalog checks and `git diff --check` passed.
- MagicTables doctor passed. Exactly one existing row `px78zdcctg4k3yhgy11p858scd8dtrgy` updated after a dry run: Notes, Description, Key Fields and Current Location. Exact readback confirms all other fields, including full completion flags, unchanged.

Evidence: root `output/tag-cloud-20260906`; final screenshots `output/block-demo/tag-cloud-final-20260906`. No runtime deployment, backend environment variable, production data or original checkout was changed during this checkpoint.

## Required next work — the links must work at production scale

Following the actual topic destination exposed an existing archive defect: `convex/taxonomies/queries.ts:getPostsByTerm` reads up to 10,000 relationships, fetches their posts and sorts before slicing the requested page. `getBySlug` returns the raw term record and the Website `blog.tag` surface displays its cached count. This is not a bounded public archive or a viewer-aware count.

Before Tag Cloud live acceptance:

1. Replace the public tag archive path with a bounded, cursor-based reader using the existing indexed Post Grid source logic and current membership checks. Expose an explicit public tag summary; do not return raw cached counts, creation/import metadata or source bodies.
2. Wire the tag route's SSR loader and reactive query to the same current cursor. Keep template-owned rendering and add real continuation/first-page controls without inventing totals. Preserve appropriate not-found and access-denied behavior.
3. Exercise large archives and revoked access through the registered endpoint and real rendered route, not only the service helper.
4. Deploy a fresh immutable staging checkpoint, preserving current media epoch `mi_ready_c97bb885410b4b3a834e05782c0ea3b9`; then native insert/save/preview and anonymous Cloudflare topic-link acceptance with actual staging assignments.
5. Reconcile MagicTables and the acceptance count only after that evidence exists. Broader blocks, templates, original audit and handoff requirements remain open.
