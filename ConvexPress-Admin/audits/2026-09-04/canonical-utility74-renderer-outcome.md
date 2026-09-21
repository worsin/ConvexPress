# Canonical utility renderers — 74 source paths

Implemented and locally checked; the final root 22-test browser gate and scoped premium visual review passed, as recorded below. There are **74 Library render.tsx paths among 136 canonical specifications**. This count does not mean all 136 blocks or production/legacy activation are complete.

## Exact slice

- `core/announcement-bar` v1: authored copy/link, reversible focus-preserving dismissal, exact optional schedule boundaries. Scheduled SSR and first client output agree; only one next-boundary timeout is scheduled and cleaned up. No unsolicited alert or recurring live-region chatter.
- `core/carousel` v1: real prepared child blocks, named native previous/next controls, independent instance IDs and state, hidden inactive slides, wraparound, truthful empty/single-slide behavior. No autoplay or height animation.
- `core/search-box` v1: native GET `/search?q=...`, singular `type=post|page|product` for scoped search and no type for all content.
- `commerce/search-band` v1: native GET `/products?q=...`; real suggestions preserve exact encoded q values. Tests consume the actual commerce search parser/query adapter. No pretend AI assistant action.
- `blocks/social-share` v1: encoded share destinations and actual user-triggered clipboard copy with a selectable manual fallback on denial. Current-page SSR actions wait for the client URL; click-time URL selection avoids stale SPA navigation. Custom URLs reject unsafe schemes and embedded credentials. Browser tests stub the clipboard and do not navigate to/share through providers.
- `core/custom-html` v1: canonical `html.sanitize` requirement remains enforced. The Library uses the established SSR/browser sanitizer with a stricter static typography subset. Raw IDs, classes, styles, scripts, event attributes, forms/controls, raw media and embeds cannot bypass block-tree identity or resource checks. Existing root sanitizer is unchanged; only the isolated demo host advertises the capability.
- `core/trust-badges` v1: actual SDK icons or resolved media, authored labels. The exact canonical `book-open` icon extends the closed SDK icon enum/map; unsupported glyph names fail explicitly rather than substituting an invented symbol.
- `core/author-bio` v2: authored identity, role, bio, links and optional resolved media. Nonempty `userId` remains explicitly not-ready without an authorized reference adapter; both preparation and direct view guard against silently ignoring it. No invented portrait or inferred user record.

Eight final examples were appended without changing schemas. Sample identities/claims remain explicitly fictional. Root and staged generated contracts were refreshed together by the schema owner and both freshness checks pass. Existing sample resolver/editor setup and root Section/reveal/model ownership are preserved.

## Local evidence

- Actual renderer SSR/DOM suite: **52 tests, 1408 assertions, all pass**. Includes scheduled hydration, start/expiry/unmount timer behavior, independent carousels, native form data, exact route arguments, clipboard success/denial, sanitizer/anchor refusal, supported/unknown icons, unresolved author identity, and every canonical example under all four discovered packs.
- Primitive/DOM/reveal suite: **11 tests, 91 assertions, all pass**.
- Isolated BlockDemo TypeScript, offline Vite build, targeted renderer/test lint and scoped diff whitespace checks pass. The existing offline demo vendor-size advisory remains; no dependency or lockfile changes were made.
- Discovery/watch regression suite: **4 pass**. Root and staged generated freshness checks pass for 136 specs / 4 packs.
- Browser listing: **20 tests in 7 files**. Browser execution is reserved to root.

## Root acceptance command and expected scope

From `ConvexPress-Website/apps/web`:

```sh
bun x playwright test --config playwright.block-demo.config.ts --output ../../../output/block-demo/browser-results-utility74
```

Expected canonical inventory is **74 exact filesystem/browser names** and **592 canonical captures** (74 × 4 packs × 2 widths). The new utilities gate adds **64 captures**, native keyboard/dismiss/restore/carousel assertions, native GET submission observation without leaving the harness, mock clipboard fallback, safe HTML/identity checks and positive responsive geometry. Its durable `utility-evidence.json` records every new specimen. Existing card32, editorial16, testimonial8, media-details32 and grade8 capture gates remain.

For only the new gate, add `--grep 'utility blocks'`; this runs two tests, one per width. Neither command has been executed by this agent. Source implementation and local tests do not substitute for root's pending visual acceptance.

## Initial root gate and corrective follow-up

Root's first full run produced **18 passed / 2 failed**, with **592 canonical captures** under `output/block-demo/browser-results-utility74`. Both utility tests failed at the no-image author assertion. The renderer was consuming a transformed fixture: the demo media binder incorrectly changed canonical `mediaId: ""` into `demo-workshop`. This was not an authored portrait or an avatar fallback. The original failure artifact is preserved; it is not a completed 74-block acceptance claim.

The binder now preserves missing, null and empty media sentinels and still maps nonempty declared synthetic IDs to typed local resources. An actual binder regression failed before the fix (`""` became `"demo-workshop"`) and then passed. The exact six final-specimen changes are author-bio, hero-split, image, logo-cloud, media-text and team-grid. Full matrix assertions now require no fabricated image while retaining those specimens' authored identity, captions, labels and copy.

This uncovered two actual presentation omissions: image captions vanished with absent media, and hero-split/media-text reserved half the copy layout for absent images. Caption-only content is now retained; absent-media split blocks use full-width copy while actual media retains the split. A renderer regression reproduces the caption defect before repair and checks both absent/present-media paths afterwards.

The carousel demo now receives two ordinary canonical `core/group` children, each containing `core/media-text` with explicit distinct workshop/notebook IDs, eyebrow, concise title, prose and real local demo anchors. No carousel renderer content is hardcoded. The keyboard gate checks the two prepared slides, distinct resolved image sources/alts, actual links, focus and wraparound. Announcement dismissal now uses an icon with a44px target and unchanged accessible name; the explicit restore control retains focus. Root requested these visual refinements after reviewing the initial captures.

Follow-up local gate: **54 renderer tests / 1435 assertions**, **6 demo binder/discovery tests**, isolated TypeScript, offline build, lint, root/staged contract freshness and scoped diff-check pass. Browser listing remains20 tests. No schema, fixture catalog or renderer count changed. Full20-test root rerun is required because the binder repair affects the six existing specimens; new output should preserve the initial failure evidence, for example `browser-results-utility74-corrected`.


## Final root acceptance — utility74

Root's stable final run **passed all 22 tests in 1.8 minutes** (session57684), with **592 canonical +64 utility +8 nested-carousel captures**, plus the prior supplementary gates, under `output/block-demo/browser-results-utility74-verified`. Root personally accepted the final Depot desktop and Aster mobile carousel, Core mobile announcement and Journal no-image author.

The earlier corrected20-test run passed, but visual review exposed repeated Section default padding/gutters on nested group/media-text children. Root repaired the shared Section context: only default nested block padding and repeated gutters are removed; explicitly authored spacing remains. Its12 primitive/DOM/reveal tests and99 assertions pass, and root reports type checking green. This is a shared wrapper repair, not specimen-specific negative spacing or hardcoded carousel content.

An intermediate final run (session30348) recorded21 passes and a matrix failure when root formatting triggered a reload and removed the example option during selection. That evidence is preserved separately. The stable22-test run above supersedes it for final acceptance without erasing the earlier binder red case, initial18/2 result, or caption/absent-media regressions.

This closes the scoped utility74 renderer/browser/visual checkpoint. It does not activate canonical live data, legacy storage migration, or mark all136 blocks complete. MagicTables writes and exact readback remain root-owned and were pending when this checkpoint was recorded. The next resolver proposal is read-only in `canonical-remaining62-resolver-proposal.md`; no new renderer or data-adapter implementation was started.


Root MagicTables checkpoint: eight existing renderer rows updated and exact readback verified,136 unique inventory rows preserved; all full-block completion flags remain false. Evidence: `ConvexPress-Admin/output/blocks-tracker/renderer74-checkpoint-2026-09-05.json`.
