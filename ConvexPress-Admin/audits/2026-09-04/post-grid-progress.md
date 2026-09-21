# Post Grid implementation checkpoint

September 6, 2026 UTC. In progress; renderer coverage remains 90/136. No runtime deployment or browser acceptance is claimed for Post Grid.

## Implemented

The authoritative pure foundation now defines `content.posts` with closed category/tag/author references, integer limit 1–48, excerpt disclosure and a nullable cursor. Closed cards reject source bodies, unsafe links, duplicate identities, reverse chronology and a non-advancing next cursor. The specification now actually binds `showExcerpt` into its resolver arguments.

Visitor pagination is a separate bounded map from canonical block IDs to cursors. It cannot override authored query filters, choose a resolver, or target an absent/non-paginated block. Each cursor participates in the resolver binding key: identical grids on the same page deduplicate; grids at different positions resolve independently. Response validation binds the requested cursor, count, disclosure, filters and installation scope before use. The URL helper preserves unrelated search fields, anchors and other grids' positions, and removes the pagination parameter when all grids reset. Raw forbidden property names are checked before object validators can discard them.

Canonical document parsing validates the envelope's request against its tree. The public display boundary independently compares it with the caller's requested page. Installed in-memory grants capture the request as part of viewer/document/scope context and invalidate previous content before a replacement is validated. Thus a response for another page cannot silently replace the current one. Missing trusted grid readers refuse before any other dependent read.

Source: `packages/backend/canonical-blocks-foundation/{postGridContracts,planner,resolve,documentContracts}.ts`, generated exact copies in Convex and Website, plus Website `installed-page-data.ts` and public `display-state.ts`. These foundation mechanisms are not yet supplied by the registered endpoint or routes.

## Verification

- Pure foundation: 54 tests, 403 assertions. Seven new grid tests cover hostile inputs, independent URLs, plan binding, missing readers and both sides of response validation.
- Public display: 3 tests, 27 assertions, including requested-page mismatch and grant invalidation.
- Existing renderer regression: 87 tests, 2,678 assertions; no new renderer acceptance.
- Full backend: 2,197 tests, 9,141 assertions across 153 files.
- Foundation/backend and both frontend types pass. Both generated consumer suites pass 19 fixtures each. Generation reports 2,050 functions and 2,394 DTOs, with the same 429 pre-existing unknown boundaries.
- All four block/portable/deployed generator checks and `git diff --check` pass.

Logs and tracker receipts are in root `output/post-grid-20260906`. MagicTables only appends Post Grid Notes; Tests/Screenshots and all full-block flags remain unchanged.

## Required next work

1. Implement chronological, indexed taxonomy discovery with bounded recovery of legacy rows. Current `termRelationships` has only `postId`, `termId`, `order`, and indexes by post, term, and pair; it cannot directly return the newest published posts in a selected category/tag. Do not reuse Latest Posts' global 160-source scan as the final grid reader. Cover post lifecycle, author changes, term relationship writes, promotion/rollback and legacy recovery; verify current source authorization on returned candidates.
2. Implement the trusted Post Grid reader and cursor binding to source query/scope. Wire bounded visitor request arguments through `getForRender` and the service, rather than accepting arbitrary authored tree overrides. No per-block subscriptions.
3. Wire request state through anonymous route loaders and reactive public scope, with SSR, reload/back/forward, multi-grid independence and stale viewer/site/password protection. Existing public-display validation is ready; `PublicCanonicalBody` and routes do not yet send pagination.
4. Build the actual SDK renderer: template-owned editorial cards, responsive spacing, clear empty/next/reset states, visible keyboard focus and smooth reduced-motion-aware interactions. Include true filtered data in BlockDemo for all four packs and mobile/desktop.
5. Native authoring, staging deployment/publication, anonymous and signed-in acceptance; update the renderer count only after actual rendered evidence.

Continue the original audit and both Claude handoffs alongside the remaining 46 renderers. Author-count repair is separately deployed and verified; this checkpoint does not alter that live deployment.

## Indexed reader follow-through

The next implementation pass added optional discovery fields on `termRelationships`, four relationship indexes, and public chronological indexes on posts with/without author. Relationship insertions in posts, taxonomies, canonical duplication, WordPress imports and demo seeding now derive coordinates from the source. Guarded post changes, replacements/deletions, dynamic writes, promotion and actual rollback update coordinates in the same transaction. A source gate added to the existing predeploy writer checks rejects unguarded post/relationship insertion, patch and replacement. Relationship deletions remove their index entries naturally.

The `posts/discovery:recover` minute job repairs at most four legacy or explicitly pending relationships per call and schedules continuation; another cron invocation resumes after a lost continuation. Orphan relationships become ineligible. Publication writes with more than 256 attached relationships refuse atomically; this is an explicit current limit, not evidence of unlimited fanout support. Existing ready coordinates after a raw/partial restore still need restore orchestration integration.

`canonicalDocuments/postGrid.ts` now supplies a service-only reader. It reads the selected chronological term/author index, checks any second taxonomy by indexed membership, then rechecks current post visibility, date and membership policy. It refuses unfinished primary indexes instead of returning incomplete initial results. It uses `convex-helpers` 0.1.120's index streaming pagination; that exact already-installed workspace version was added to the backend package. Built-in `.paginate` cannot support multiple independent page cursors in one query, as documented by [Convex](https://stack.convex.dev/pagination). Bounded continuations preserve the single page-query design. The cursor is positional state, not an authentication credential; authoritative filters and installation identity still come from the enclosing service.

Reader tests cover selected categories despite 220 newer unrelated posts, tied timestamps over successive pages, no gaps/duplicates, two independent grids in one transaction, category/tag intersection, author filtering, cursor mismatch/type/range rejection, pending-index refusal, current private/draft exclusion, and membership revocation. Source tests include actual registered promotion/rollback and repeated rollback. A promotion fixture was expanded to include its target taxonomy dependencies, preserving the real planner's completeness requirement.

Full backend now passes 2,206 tests / 9,204 assertions in 155 files. Explicit backend types pass; source/media writer checks pass (1,261 classified writes, 26 media owner tables, 17 typed media-reference tables). The pre-existing demo-seed TypeScript suppression remains at its original first-line position; no suppression was added. A misplaced import initially invalidated it and was corrected. Receipt/logs: root `output/post-grid-reader-20260906`.

Still unfinished: registered `getForRender` request plumbing, policy enablement alongside the renderer, SSR/reactive routes, authoring category/tag/author pickers, SDK rendering, four-pack browser screenshots and actual staging/native acceptance. No deployment from this checkpoint. Count remains 90/136.

Final reader regression: imported duplicate taxonomy pairs are now deduplicated consistently across pages by selecting the canonical pair, not just a per-page seen set. Six reader tests pass; full backend2,207tests/9,207assertions and explicit types pass. Both frontend types and both19consumer fixtures pass. Captured1,078files in checkpoint post-grid-reader-final-20260906; staging dry-run passed and proposed six new indexes without deleting indexes. This was a dry run only. Source hashes, logs and tracker proof are in output/post-grid-reader-20260906/receipt.json.

## UI and staging milestone

The registered adapter, SSR/reactive route state, authoring selectors and renderer are now implemented and accepted in the actual native editor and anonymous staging website. Renderer/browser count91/136. Final release nx77h0ayzybd17t6gepw1w09358dxkhp succeeded after repairing the empty-search307 discovered by release verification. Shared optional-reference reset and installed block-ID forwarding were also repaired. See `post-grid-ui-outcome.md` for evidence, exact checks, preview limitations and remaining index/production work. Earlier required-next-work entries above describe the prior checkpoint and are superseded by this outcome.
