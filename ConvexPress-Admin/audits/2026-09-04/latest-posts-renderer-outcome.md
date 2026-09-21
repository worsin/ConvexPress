# Latest Posts: renderer, native authoring and staging publication

Verified September 6, 2026 UTC in `/Users/worsin/.codex/worktrees/convexpress-hardening`. This checkpoint raises renderer/browser acceptance to **90/136**, not full production completion.

## Implemented

`core/latest-posts` now binds the closed `content.latestPosts` contract, with integer count, category/tag slug filters and optional author/excerpt fields. Canonical producer and consumer envelopes enforce scope, current attributes, count, ordering and metadata flags. Authorized native category/tag pickers return slugs and recheck document authority. The reader applies published-time, visibility and membership rules before projecting finite public cards; private article bodies and author account fields are excluded.

The renderer uses template primitives and tokens, real optional images, linked headings, UTC dates, readable empty states, keyboard focus and reduced-motion handling. Real staging review caught three viewport-driven columns squeezed into a 550px page column. The grid now responds to its own container: one column below 36rem, two below 56rem, and three above. Real Chromium geometry checks passed at 320, 550, 700 and 1000px; final live desktop cards occupy the full 550px reading column.

Native saves briefly displayed a false conflict when the reactive query observed the editor's own write before its mutation receipt. The conflict state remains intact, while its warning is withheld until the pending save settles. The DOM regression failed before the repair, then passed while also proving an actual remote conflict still preserves the local draft and displays the warning.

## Evidence

- Backend: 2185 tests / 9052 assertions across 152 files. Renderer: 87 tests / 2678 assertions. Native canonical editor group: 12 tests / 43 wrapper assertions (DOM cases run in isolated subprocesses).
- Full final BlockDemo run: 32 browser tests, 720 canonical screenshots (90 blocks × four packs × two viewport sizes). Selected desktop/mobile and native screenshots visually inspected; this does not claim inspection of every screenshot.
- Backend/foundation and both frontend type checks passed. Both 19-case consumer API fixtures passed. Generated block and portable/deployed foundation parity checks are recorded with the checkpoint.
- Captured 1063 files across backend, blocks catalog, config and site contract. Staging dry run and deployment succeeded without index deletions; site identity and media generation were preserved. Immutable backend capture: `ConvexPress-Admin/output/production-checkpoints/latest-posts90-20260906`.
- Real Electron PID 64794, renderer 4105: added Latest Posts to published Navigation field guide (`x17s7ch3wje4v646g3mbksm4x58dtav4`), selected the site's real Uncategorized choice and observed the correct empty filtered result, then reset the filter and saved three existing published posts. Saved preview connected and rendered their exact headings and images.
- Anonymous public page rendered the same three cards; clicking Objects with a place loaded its actual published article. Final artifact includes the container repair and passed workerd private/public SSR acceptance before normal native publication.
- Final Cloudflare release: `nx7bmg0qsxgn4zgjgr6av8k82n8dxb2t`; artifact `4ef9fc79951c47fc32f52e6b3aa3843a767891d43851aad5c26a8246b88ecc7c`; instance `cloud_careful_cormorant_268_staging`. Raw HTTP response independently confirms all three markers.
- MagicTables: one existing block, two fields updated (Notes and Data Resolver); all 136 row IDs and every other field preserved. `content.latestPosts` is intentionally separate from the future paginated post-grid contract. Full-completion flags remain false.

Raw logs, read-back proof, hashes, snapshots and release receipt: root `output/latest-posts90-20260906`. Screenshots: root `output/playwright/latest-posts90`. Public acceptance URL: <https://aster-house-staging.h5s.workers.dev/page/navigation-field-guide/>.

## Remaining work

The bounded reader refuses after 160 scanned sources, rather than returning an invented complete result. Large sparse taxonomies need an indexed discovery projection. Native resource fields still expose implementation-oriented labels such as Category Slug and generic selected-resource text. Live category choice was exercised; live tag selection beyond DOM/registered endpoint coverage remains unverified. Per-block full migration/interaction acceptance remains open.

Public author labels reveal internal management identity text because `management/runtime.ts` creates the user's displayName from the controller authority label. `helpers/publicContent.ts:publicContentAuthor` and the new latest-posts projection both need deliberate public byline handling, with author editing/assignment behavior considered. This is not an image or styling defect and has not been hidden locally.

Visiting the real native Users list also reproduced Clerk avatar requests blocked by native image CSP (`https://img.clerk.com`). This follow-up is now fixed: permit that exact HTTPS host only in img-src. Red/green development and packaged policy tests verify no Clerk wildcard or script/connection/frame expansion (8 tests/62 assertions); Electron types and main/preload build pass. Restarted only acceptance Electron with the same profile (current PID45019/CDP62025), retaining Claude Atelier and Aster House staging. Both actual Clerk avatars loaded at128px, native console recorded zero errors, screenshot visually inspected. Evidence: `output/latest-posts90-20260906/avatar-repair.json`. Aster mobile Sign in wrapping and prior drawer focus restoration/resize acceptance remain open.

No production or Vercel release occurred. Remaining 46 block renderers and the complete original audit/handoff, customer isolation, packaging, recovery and deployment goal remain active.
