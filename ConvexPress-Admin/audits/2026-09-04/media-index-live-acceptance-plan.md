# Staging maintained-media-index acceptance sequence

Prepared read-only, 2026-09-05. Root executes all live actions. No environment values, site records, storage objects or provider state were changed while preparing this plan.

## Snapshot gate: passed

Target snapshot: `output/backend-checkpoints/canonical-publication-20260905/backend`. All **978 files** exactly match `snapshot.json` SHA-256 values. `deployment.json` records staging deployment exit 0 with the epoch absent. This is recorded deployment evidence, not a new live observation.

The final media guards, generation/readiness checks, page-range/backfill handling, deletion preflight, generated inventory/indexes, dynamic promotion writers, purge invalidation and coverage scripts are byte-identical to current held source. This includes `schema/media.ts` **`media_reference_edges.by_generation`**, required by `cleanupObsolete`. The 13 later current-source differences are canonical service/duplication/helper work; they do not alter the deployed media implementation. Exact selected hashes and the complete changed-file list are in `media-index-snapshot-parity.json`.

A read-only run of the actual writer parser against the immutable snapshot independently classified **1,255 writes, 26 owner tables, zero violations**. Recomputing its semantic fingerprint produced the shipped version **`media-edges-13307be7aa0ff27f592d2a7b`**. No generator or snapshot file was modified. Root reports the CP snapshot-import fence deployed; its source rotates and reads back the external epoch before import upload/archive consumption on every retry. The native/CP publisher change is unrelated to index authority.

## API contract

Use the existing authenticated **staging** site `ConvexHttpClient` / normal operator session. Confirm the client endpoint and signed instance identity before mutation. `manage_options` is required for all four maintenance endpoints. Do not use direct database writes or internal handlers.

| Function name | Kind | Args | Result |
| --- | --- | --- | --- |
| `media/reverseBackfill:status` | query | `{}` | Progress |
| `media/reverseBackfill:begin` | mutation | `{}` | Progress; create/resume current generation |
| `media/reverseBackfill:step` | mutation | `{generation: string, expectedSequence: number}` | Progress after one bounded page/range |
| `media/reverseBackfill:cleanupObsolete` | mutation | `{generation: string}` | `{deleted: number, remaining: boolean}`; at most eight old edges |

Progress is `{status, generation, sequence, owner, completedOwners, totalOwners, pages, documents, errorCode?}`. Status is `unconfigured | stale | building | blocked | ready`. Generation/owner can be null. The exact expected generation after activation is `<fresh epoch>:media-edges-13307be7aa0ff27f592d2a7b`.

## Minimal fixture and activation

1. Record the current staging identity, media-library baseline, and `status {}`. Expect **unconfigured** while the epoch is absent. Keep root's synthetic-event/outbound-notification controls in effect: the normal upload/post mutations emit normal internal events, and image upload schedules the supported image processor.
2. Through the native standard uploader or `media/mutations:generateUploadUrl {}` + its returned storage upload URL, upload **one new, disposable valid raster image**. Do not reuse an existing production/staging media record or its original storage ID. Then call `media/mutations:create {storageId, fileName, mimeType, fileSize, title, altText, width?, height?}` using actual bytes/type/dimensions. Persist the storage ID immediately after upload and the returned media ID immediately after creation. Suggested unique filename/title: `media-index-acceptance-<nonce>.png`; true alt text describes the fixture image.
3. Poll `media/queries:get {mediaId}` until `status === "active"`; stop on `failed`. Do not manufacture active state or bypass processing. Record original storage ID and generated size IDs/URLs. If a response is lost, read back the persisted fixture identity before creating another object.
4. Before setting the epoch, create one **legacy article draft**, not a canonical document: `posts/mutations:create {title:"Media index acceptance <nonce>", status:"draft", contentMode:"article", featuredImageId:mediaId}`. Persist returned `postId`; `posts/queries:get {postId}` must show the exact image. This is deliberately created before activation so backfill, rather than only new-write hooks, must discover it. Do not publish it, set schedules or add unrelated authoring data.
5. Root sets a fresh nonsecret staging deployment **`MEDIA_REFERENCE_INDEX_EPOCH`**, then reads back its exact value from the same deployment. Valid form: 16–128 ASCII alphanumeric/underscore/hyphen characters; a newly generated UUID with hyphens removed is suitable. Preserve every other environment variable. Do not reuse a prior epoch, set the production epoch or unset an activated epoch as a recovery shortcut.
6. Read `status {}`: expect **stale** with the exact new generation. Before starting backfill, call `media/mutations:remove {mediaId, force:false}` and require **`MEDIA_INDEX_NOT_READY`**. Read back media/post unchanged. This proves configured-but-incomplete readiness cannot claim absence.
7. Call `begin {}`, persist Progress. For each explicit bounded step, pass its exact `{generation, expectedSequence: sequence}` and persist the returned Progress immediately. A lost response can repeat the **same** arguments: old sequences return the current progress without processing an extra page. Do not increment sequence client-side, guess cursors, skip an owner or treat a timeout as completion. Stop immediately at **blocked**, **stale**, a changed generation, a transport uncertainty needing readback, or an authorization failure. A blocked page stays on the exact range; only explicit repair/retry may proceed.
8. Require `status === "ready"`, `owner === null`, `completedOwners === totalOwners === 26`, and the exact expected generation. Query status again independently. `begin {}` is now idempotent. Persist all progress/terminal evidence.

The native route is **Media → Media deletion safety**. After activation it exposes **Start indexing / Continue indexing**, a progress summary, **Pause after current page**, and later **Clean older index records**. A click performs at most 25 page steps after begin/resume; repeat explicitly until ready. Scope/user change and unmount stop the next request. The unconfigured UI cannot set an epoch.

## Referenced deletion, live hook and cleanup acceptance

A. With ready status, `media/mutations:remove {mediaId, force:false}` must now refuse **`MEDIA_IN_USE`**, with the draft's `posts.featuredImageId` reference. Read back both documents and media storage URL unchanged. This proves the pre-epoch attachment was backfilled.

B. Permanently delete only the disposable draft using `posts/mutations:permanentDelete {postId, force:true}` (the flag permits deleting a draft without first moving it to trash). This uses the guarded owner-delete path and clears that draft's related revisions. Confirm `posts/queries:get {postId}` returns null. Then `media/mutations:remove {mediaId, force:false}` must succeed and `media/queries:get` must report trash. This proves edge removal in the same transaction rather than a stale block. `media/mutations:restore {mediaId}` must restore active status.

C. Create a second disposable article draft with the same featured image **after ready**. Without rerunning backfill, `remove {mediaId, force:false}` must immediately return `MEDIA_IN_USE`. This proves the live insert hook. On this simple fresh draft only, `remove {mediaId, force:true}` must succeed for the authorized Editor/admin, and `posts/queries:get` must show `featuredImageId` absent while the post remains. Read media status trash and confirm index status remains ready. No media body/history reference is included in this minimal force-clear fixture; any unexpected extra/history reference must stop rather than be bypassed.

D. Clean the second draft with `posts/mutations:permanentDelete {postId: secondPostId, force:true}`. Permanently remove only the disposable media using `media/mutations:permanentlyDelete {mediaId, force:false}`. Require `media/queries:get {mediaId}` null. Verify its unshared stored original/derived URLs no longer serve bytes and the previously recorded real Aster media inventory remains unchanged. Standard permanent deletion independently checks shared storage ownership; do not force-delete another owner's bytes.

E. Call `cleanupObsolete {generation}` only while ready. It never deletes current-generation edges, content or media. Continue bounded explicit calls while `remaining === true`; only `{deleted:0, remaining:false}` proves no obsolete edges remain. A first activation may already return that empty result; report that as **no-op cleanup**, not proof of populated-generation garbage collection. Stale-generation or not-ready requests must refuse. Leave a valid ready index/epoch enabled after acceptance.

All returned fixture IDs must be recorded as they are created and read back before cleanup. A failed delete must leave both storage and authored records unchanged. No direct table cleanup should substitute for a missing normal API.

## Additional coverage and honest limits

The minimal live sequence proves pre-epoch backfill, closed incomplete readiness, current reference refusal, atomic owner insertion/deletion, one supported force-clear adapter, and actual unreferenced storage cleanup. It does **not** by itself prove shared-storage-owner survival, opaque/history force refusal, populated old-generation GC, raw-restore invalidation, or large-library scaling. Those have existing actual transaction tests; root should label source-tested versus live-tested separately. Root's earlier large snapshot restore acceptance occurred before this epoch fence was deployed, so it does not establish new configured-index restore recovery.

A second epoch/backfill cycle would exercise stale readiness plus old-generation GC without raw data replacement, but it is a separate explicit acceptance expansion. Raw restore is not needed for the minimal safety fixture and must not be used just to create obsolete edges. A supported opaque/history fixture should be refused with `MEDIA_REFERENCE_UNCLEARABLE`; do not flatten or rewrite canonical/history content to make force succeed.

## Fleet integration gap: confirmed

Fresh native provisioning currently **does not create the epoch or build the index**. `electron/ipc/setup.ts:createBackendEnvFile` initializes auth/encryption/site variables but no media epoch. Setup/siteDeploy run the writer-coverage source gate, which validates the deployed code but does not activate runtime readiness. Repository runtime searches find the external epoch writer only in CP `operations/snapshotImportApi.ts`; the only public begin/step callers are the explicit Media panel. There is no automatic begin/backfill orchestration, scheduler, provisioning readiness milestone or post-restore backfill continuation.

Consequences: a fresh installation remains on the bounded legacy scan until an operator separately configures an epoch and runs maintenance. Managed restore now creates a fresh epoch and therefore correctly pauses deletion, but the operator must explicitly resume/backfill afterward. This is a remaining **production fleet integration gap**, not a reason to disable readiness fencing.

Needed implementation: native/CP provisioning should idempotently create-and-read-back an epoch only when absent, retain it on ordinary retries/deploys, and record a durable scoped media-index milestone. After ordinary authenticated operator authority is available, a bounded durable runner should call these same begin/step APIs, handle generation/version changes, stop visibly on blocked rows/revocation, resume after app/process interruption, and mark readiness only from the canonical terminal status. Restore completion should schedule or surface the same continuation for its freshly rotated epoch. Existing sites need a centrally managed rollout path with the same preflight/readback and progress controls; no per-site coding or raw database-ready flag. Do not add an unauthenticated bootstrap indexing endpoint or loosen the management/operator boundary.
