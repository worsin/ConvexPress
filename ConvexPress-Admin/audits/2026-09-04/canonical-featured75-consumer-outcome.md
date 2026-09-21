# Featured-page typed consumer — staged source75

Implemented and locally checked; the final root browser and scoped premium visual acceptance passed, as recorded below. `core/featured-page` v1 is the only newly installed data view. Filesystem discovery contains **75 renderer paths across136 canonical specs**. No canonical public endpoint, storage migration, live data client or production installer was activated.

## Data contract and authority boundary

The Website uses exact portable copies of the existing foundation `contracts.ts`, `planner.ts`, `resolve.ts` and four generated runtime dependencies. A dedicated deterministic helper verifies the import closure and root/staged parity, writes source hashes and detects drift. The normal `check:blocks` now includes portable freshness. There is no hand-maintained PageResult clone or Website import of the backend server graph. Root and staged canonical outputs were regenerated together for the new synthetic examples; their field schemas are unchanged.

The installed channel accepts only the authoritative closed `{page:null|{id,title,href,excerpt,image}}` result. The whole envelope is validated against exact node IDs/names/versions, resolver, normalized target args and installation. An explicit demo-only host constructs opaque in-memory grants; serialized JSON/attrs cannot grant the adapter. Each grant also binds current document/revision/viewer, full tree and policy. A changed context, policy or tree refuses before any view executes. Replacement revokes prior grants even if the new envelope is invalid. A mounted consumer subscribes to generation invalidation and removes old text, links and image without needing a parent rerender.

The model changes are narrow: the only supported data descriptor is `content.page` on `core/featured-page` with an installed matching view and validated envelope. Its exact page reference is consumed by that binding; unrelated references and resolvers remain refused. Existing whole-tree ID, depth, layout, style, plugin/capability and page-wide anchor checks remain in force. Root Section/reveal implementation is unchanged.

## Renderer and isolated specimens

The view preserves the returned title/excerpt, verified href and authored CTA label. Optional public media uses the SDK Image; absent media gets full-width copy, and null/denied results share a neutral unavailable state with no stale detail. Long authored text is retained instead of truncated. Existing pack primitives, typography context, spacing and media contracts provide the treatment.

Four explicit synthetic reference examples cover image, no image, long copy and unavailable data. The isolated host shows its synthetic provenance, lets root invalidate/re-resolve the grant and switch to an unavailable viewer fixture, and never calls a provider or backend. One new hydration test initially caught fragment-only fixture hrefs rejected by the real PageResult validator; fixtures now use valid relative `/#...` destinations rather than loosening that validator.

## Local evidence

- Actual renderer SSR/DOM suite: **61 tests /1505 assertions pass**, including opaque-grant forgery refusal, target/scope/viewer/revision/tree changes, invalid new installation revocation, unsafe/oversized/leaking results, exact repeated-target deduplication, policy/anchor/layout checks, actual mounted invalidation and real demo-host hydration/viewer transitions. The complete existing renderer example/pack suite remains green.
- Portable packaging + staged backend foundation tests: **12 tests /110 assertions pass**. These include isolated import execution and source parity/drift checks, plus existing actual public-content policy helper regressions for private/password/member-revoked/deleted/foreign pages and raw-source budgets. They do not prove a live canonical transport.
- Demo discovery/media-binder tests: **6 pass**.
- Full Website TypeScript and isolated BlockDemo TypeScript pass. Offline demo build, targeted lint, root/staged/portable contract freshness and scoped whitespace checks pass. The existing vendor-size advisory remains; no dependency changes were made.
- Browser listing: **24 tests in9 files**. No browser or live actions were performed by this agent.

## Root browser gate

From `ConvexPress-Website/apps/web`:

```sh
bun x playwright test --config playwright.block-demo.config.ts --output ../../../output/block-demo/browser-results-featured75
```

The exact filesystem/browser matrix now expects **600 canonical captures** (75 ×4 packs ×2 widths). New `featured-page.pw.ts` adds **32 populated/no-image/long/unavailable captures** and checks actual hrefs, image identity/loading, positive geometry, grant invalidation, re-resolution and viewer transition without leaving the harness. All utility64, nested-carousel8 and earlier supplemental gates remain. For the bounded new gate only, add `--grep 'featured page uses bound'` (two width tests). Full visual acceptance remains root-owned.

## Still open

The demo capability is trusted source code, not server authorization. Website/instance fields in the envelope are structural bindings, not a signature. Public activation still needs server-owned current-document/tree/policy reads, current authenticated viewer transport/cache lifecycle, a registered return validator and aggregate source accounting (existing per-document/page ledger omits identity/settings/role/plan/policy reads). The other61 remaining renderer specs retain their unresolved contracts. No full136-block or production-completion claim follows from this slice.


### September 5 — featured75 root acceptance

Root full gate passed **24 tests in 2.0 minutes** (session45151), with **600 canonical +32 featured-page captures** and earlier supplemental gates under `output/block-demo/browser-results-featured75`. Root visually accepted Depot desktop with image, Journal mobile without image, and Aster mobile long copy; all viewer/grant invalidation behavior passed. This closes the scoped staged featured75 consumer/browser checkpoint. Root subsequently verified MagicTables: one existing row updated, zero created, all five fields reread exactly, 136 unique rows. Evidence: `renderer75-checkpoint-2026-09-05.json` and `inventory-verified-2026-09-05.json`. No canonical public endpoint, storage, editor save/reopen or live transport is activated by this demo acceptance. The next milestone is a real authorized canonical document vertical integration, with full136 scope retained.
