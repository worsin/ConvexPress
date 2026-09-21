# Canonical native editor / embedded Website preview — frontend checkpoint

September 5, 2026. Independent frontend source implemented after root approved the corrected native-owned preview design. This is **not backend checkpoint A or live end-to-end acceptance**. No new route, endpoint, credentials, storage table, deployment, browser process or live record was activated by this work.

## Corrected authorization

Root's live Clerk experiment demonstrated the intentional customer/internal-role boundary. The vertical plan now preserves it and removes the erroneous independent Website editor-login prerequisite. Preferred preview is the existing native operator's authorized document subscription feeding an owned Website iframe; it carries a closed display DTO, never a general operator bearer. A separate preview issuer/code/JWT scheme was considered and rejected as unnecessary for this milestone.

The five-second display lease is an offline/stale-parent exposure bound, not instantaneous cross-deployment revocation. The native broker must stop renewing when current auth, site connection or query freshness is unproven. A timer cannot manufacture renewed permission. Exact configured HTTP loopback/HTTPS origins are accepted; opaque `null` origins and top-level receiver use are refused. Packaged-native origin/bootstrap integration needs a verified approach before activation; do not solve it with wildcard origins or an arbitrary parent-origin URL parameter.

## Implemented independent source

- `Admin/apps/web/src/components/blocks/canonical-editor/session.ts`: document/site/operator generation reset; mandatory expected revision in save request state; conflicts retain local edits; explicit discard/reload; late receipts/errors cannot enter another document; edits made while saving survive the receipt. This is an in-memory UI model parameterized by the authoritative decoded value, not another stored schema.
- `tree.ts` and `CanonicalOutline.tsx`: bounded nested outline and identity-preserving edits through a generic canonical-type adapter. Labels use generated editor metadata. Native list/button semantics, visible selection, focus treatment and 44px controls avoid an incomplete ARIA tree implementation.
- `CanonicalEditor.tsx`: unmounted/injectable editor branch using the actual `SchemaBlockForm`, no legacy conversion/autosave fallback. Authority loss unmounts private input. Invalid raw attrs are retained across selection and block saving; stale scope/revision form callbacks are ignored. Actual endpoint wiring, title controls, insertion/reorder/remove, revision browsing/restore and dirty-navigation integration remain for the confirmed contracts.
- Narrow `SchemaBlockForm.DraftPreview.draft` addition: parents receive the actual current input even when validation fails. A regression proves a blank invalid number remains blank and cannot save; this is unsaved UI state, not a loosened field schema.
- `Website/.../block-preview/channel.ts` and `window-host.ts`: exact origin/Window/challenge handshake, one channel generation per document/revision/operator, closed packet envelope, injected authoritative DTO codec, bounded packet and display lease, monotonic sequences, digest binding, clear/disconnect on navigation/unmount, no self-renewing authorization. Tests use real MessagePorts in Node plus controlled Window surfaces, not browser acceptance.
- `block-data/installed-page-data.ts`: extracted shared structurally validated display installation, binding and subscription invalidation from demo ownership. The old demo adapter is only a facade. The production renderer imports no demo adapter; shared display installation does not grant backend permissions.
- `CanonicalDocumentView.tsx` and `pack-parts.ts`: actual Website dispatcher plus convention-discovered installed primitive parts. Core/Aster use baseline where no override exists; Journal/Depot keep their exact own parts. It expects real site token injection and server-resolved resources; it imports no demo palette/assets or backend server graph. Root Section/reveal/anchor behavior is retained.

## Verification

- Admin scoped run: **8 passing test entries** (6 pure state/tree tests and 2 isolated real-DOM harnesses), 29 outer assertions. The underlying editor DOM case verifies invalid input survives selection, CAS save and authority unmount; the existing field-form harness covers 4 DOM cases with the new invalid-input assertion.
- Preview protocol: **7 tests /52 assertions**, including actual MessagePort delivery, navigation cleanup, wrong origins/Windows/challenges, stale binding/tree/generation, expiry/replay, lost auth/connection/query freshness and top-level refusal.
- Existing renderer regression: **61 tests /1505 assertions** pass after shared-data extraction, including mounted revocation, SSR fixtures and all discovered pack examples.
- Fresh full Admin and Website TypeScript checks pass: `/tmp/canonical-native-final-types.log` and `/tmp/canonical-website-final-types.log`, both empty, sessions16260/61785 exit0. Scoped oxlint and diff whitespace checks pass.
- Vite library build of actual `CanonicalDocumentView`: **75 renderer modules, zero forbidden imports, no output written**. Build inspects emitted module graph for demo/server/Node dependencies and includes actual Journal/Depot part modules. `build-closure.fixture.mjs` is offline and launches no browser/server.

Commands from the hardening worktree root:

```sh
bun test ConvexPress-Admin/apps/web/src/components/blocks/canonical-editor/session.test.ts ConvexPress-Admin/apps/web/src/components/blocks/canonical-editor/tree.test.ts ConvexPress-Admin/apps/web/src/components/blocks/canonical-editor/editor.test.ts ConvexPress-Admin/apps/web/src/components/blocks/schema-editor/SchemaBlockForm.test.ts
bun test ConvexPress-Website/apps/web/src/templates/sdk/block-preview
bun ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/run-tests.fixture.mjs
bun ConvexPress-Website/apps/web/src/templates/sdk/block-preview/build-closure.fixture.mjs
```

## Confirmed next integration boundary

Auth agent proposes one generated full canonical instance schema and a closed `canonical-document-v1` DTO with scope, document/tree/revision/digest, presentation, policy, data and resources. Native viewer/session/frame generation remains outside the server DTO. Proposed save/restore receipts contain ID/revision/digest/changed only; the frontend adapter must await/verify the actual current decoded snapshot, not pretend those receipts contain a tree. Page references need the proposed bounded authorized `pageOptions`; existing `pages.list` collects all pages before pagination and will not be used as the new picker. Existing paginated media picker can be reused with generated structured-media validation and current-scope checks.

Remaining before this frontend can be activated: finalized generated instance/DTO imports; actual current-document/init/save/restore/pageOptions handlers and revision list; scoped picker adapter; authenticated native subscription/broker freshness; exact receiver bootstrap origin and native generation binding; mounted native page-editor branch; embedded-only Website route and reserved-path policy; current site pack/token installation; route/build/SSR tests and root staging/browser acceptance. No guessed API name or test fixture satisfies those requirements. The route remains proposed `/__preview/document/:postId`; full 136-block/migration/unsaved-preview scope is unchanged.
