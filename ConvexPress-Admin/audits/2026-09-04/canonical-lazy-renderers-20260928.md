# Canonical renderer loading — September 28

Status: E20 selective loading and E21 live page-heading follow-through accepted within this batch. The full delivery goal and bundle budget remain open. No tracker writes:60Verified/77In progress.

## Failure and repair

Canonical discovery eagerly imported all137 Library and32 owned-pack renderers. It now validates discovered paths/manifests without importing definitions, then caches each required definition and the selected pack treatment. Pack identity, resolver and prose-flow contracts remain enforced. Nested and resolved reusable trees preload siblings together; runtime composition keeps its existing closed interpreter. The SDK/BlockDemo registry interface remains lazy and chooses the active pack at paint time. Failed chunks retain their error without repeated imports.

Actual built public testing found a hydration regression in the initial implementation: Suspense inside CanonicalDocumentView allowed its parent installation effect to invalidate an SSR seed before a dehydrated child retried. All8 initial public cases emitted hydration errors. Preloading alone still failed. The final repair places Suspense above the installation component and prepares only SSR-marked block definitions before hydration. Authority checks and seed revocation were preserved. Both public body and embedded preview use this boundary.

## Evidence

Evidence root: `output/editor-lazy-renderers-20260928/` (local ignored artifacts).

- `red.log` establishes missing lazy registry before implementation; `hydration-red.log` establishes missing hydration preparation. `final-focused-tests.log`:9 outer tests pass, including8 lazy/hydration cases and isolated existing public lifecycle cases. `renderer-cases.log`:306 renderer cases,5374 assertions pass, including all canonical examples in all packs.
- `lazy-ssr.log`: existing template/legacy smoke plus12 actual canonical nested/reusable/runtime-composed SSR cases across all4packs pass. These are explicitly offline fixtures, not live source acceptance.
- Website TypeScript, production build with manifest and root check:blocks pass (`website-types.log`, `website-build.log`, `block-check.log`).
- `client-chunks-final.json`:137 Library dynamic entries,32 owned entries, zero Library/owned modules statically reachable from the client entry. Includes source hashes. This verifies the selective loading requirement, not total bundle acceptance.
- Real owned Electron PID80883, isolated profile, native authoring and actual Website iframe: adding Hero(text only), then Paragraph, then Hero requested exactly those successive Library modules and only Core's owned Hero. Pointer selection reached the matching native Title field. Save/reload retained all3 authored values and zero page errors. `native-hero-only.json`, `native-two-blocks.json`, `native-owned-hero.json`, `native-final-reload.json`, `native-final-chunks.json`; screenshots `native-live-preview.png`, `native-final-reload.png`.
- `four-pack-public.json`:8 hero-first cases (Core/Journal/Depot/Aster at1440/390) have no page/hydration errors, no horizontal overflow, no duplicate template title, exactly3 Library renderers and each selected pack's Hero module. `four-pack-ordinary.json`:8 reordered ordinary-first cases restore exactly one page title with the same module/error checks. All16 screenshots retained; Journal mobile and Aster desktop hero-first and Journal mobile ordinary-first visually reviewed. This is a focused3-block acceptance, not every137-block visual signoff.
- Initial failed public matrices remain in `four-pack-public-hydration-failure.json` and `four-pack-public-preload-only-failure.json`; the cause appears in `hydration-diagnosis-second.log`. Final results supersede those failures only for this built artifact.
- `demo-smoke.json`: real BlockDemo nested collection, reusable source update and withdrawal pass with no page errors.

## Preservation and remaining work

`cleanup.json`: only the owned page g1831jq02e0czh732kazh6wjvd8f9r4w was removed after exact document/baseline checks;42 original pages and original appearance identity/values match. Temporary pack changes were restored after every matrix. The fixture URL redirects to its canonical route and returns404. Owned Electron signed out and closed; private API session revoked and its credential file removed. User Electron PID39198 remains alive. This batch does not claim a new full posts/Events/media parity check. No backend deployment or push.

`bundle-budget.log` still fails: main chunk309.29KiB against292.97KiB (300000bytes); the earlier pre-change build already exceeded that limit. Keep the final Task8 budget gate open. E22 evidence-path reconciliation also remains open. Next is Opus04 F13: reproduce structured private-autosave conflicts, distinguish competing draft generation from accepted-revision changes and local Save overlap, and preserve uncertain-acknowledgement protections. Claude's suggested unconditional reload requires this independent lifecycle review.
