# Bounded authored media transfer prerequisite — 2026-09-05

## Implemented and reviewed scope

Root approved the design in `content-promotion-media-transfer-design.md`, including its explicit possible-orphan limitation. Root's source review found the cross-review identity, dispatch-before-POST, known-ID completion and separate review boundaries sound for this bounded initial slice. Native transfer UI remains inactive.

The controller now has separate authenticated `contentPromotion/mediaTransfer:execute` and `:reviewTransferred` actions, plus the scoped `contentPromotion/mediaTransferRecords:get` status query. Target sites have normal signed-session `contentPromotion/mediaUploads:begin`, `:complete`, and `:status` functions. New additive tables are `overseer_contentPromotionMedia` on the controller and `contentPromotion_mediaUploads` on the site backend. Every registered function has explicit argument and return validators. No unrelated API graph suppression, schema removal, plugin activation, media-processing hooks, upload-on-Apply, snapshot, or rollback path was introduced.

The global transfer key binds source website/instance/deployment, target website/instance/deployment, original SHA-256 and byte size. It intentionally excludes review IDs and logical source media row IDs. Strictly validated base64 and hexadecimal digests normalize to one key. Each row remains operator-owned: another operator requesting the same blob identity encounters an ownership conflict rather than silently adopting it or uploading a duplicate. Administrative cross-operator handoff is not implemented.

An atomic controller claim serializes work, and a second atomic mutation records dispatch before any raw POST. A dispatched row never returns to upload eligibility after a crash, lease expiry, new receipt, or retry. Returned storage IDs are persisted before target completion. Completion and status reauthorize the current operator and exact source/target identity. The target verifies actual `_storage` SHA-256, size and MIME metadata and respects its configured upload-size policy before issuance/new completion. Transfer writes only storage and transfer provenance; authored media records are created only by a later, separately confirmed canonical Apply.

## File and transport bounds

Only original active PNG/JPEG/WebP images are supported: 2 MiB per file, 4 MiB total per reviewed graph, at most eight reviewed media records. `execute` processes one explicitly named reviewed media key per call; callers should process keys sequentially. The whole graph budget is checked at the handler boundary before transport. Native Convex Cloud backend origins only (`https://<deployment>.convex.cloud`) are supported for storage GET/POST. Website custom domains remain valid site identities, but custom/local storage origins, external URLs, SVG, audio/video/documents, redirects, transformations, and arbitrary upload URLs are refused.

Source URLs come only from a fresh authorized export of the exact immutable manifest. Storage GET/POST receive no site bearer or credentials. Native paths, timeout, response bounds, MIME, image signature, exact streamed byte count and SHA-256 are checked. Buffers are bounded; source bytes must validate before a target upload URL is requested. Target session-token echoes are refused as storage upload tokens or receipt evidence.

## Recovery limits — not production-complete orphan recovery

Lost target completion or controller acknowledgements recover from scoped status or a known storage ID without another POST. If the raw upload response is lost—or the action loses its observed storage ID before it is durably recorded—the row is uncertain with a possible orphan bounded to one original file. Revocation can produce this outcome as well. An expired lease is never evidence that the POST did not happen. New review IDs cannot bypass this fence.

There is no automated scan, guessed storage-ID adoption, reupload, deletion, orphan cleanup, or manual reconciliation UI. Unknown-ID cases require external explicit reconciliation; this is an accepted limitation of the initial slice, not complete production recovery. Known staged-but-unattached blobs are retained with provenance. A future cleanup adapter must prove ownership and absence of references before deleting them. Existing verified storage may be reused by the same operator across compatible reviews, with the same target identity and actual storage metadata rechecked.

`reviewTransferred` requires all reviewed media entries to have verified bindings and creates a NEW canonical dry-run/controller receipt. It never modifies the original manifest, request, receipt fingerprint, or eligibility. The new review must still resolve plugins and every other dependency, and Apply remains a distinct explicit confirmation. Source changes or deleted target bytes can therefore block the new review or Apply normally.

## Validation

- Full integrated promotion/native policy suite: **147 tests passed, 833 assertions across 14 files**, `/tmp/media-full-promotion-tests.log`.
- Actual registered broker action test uses the real target intent handlers, actual target storage, real canonical dry-run and separate canonical Apply. It proves no authored media/posts/jobs before Apply, exactly one stored blob after Apply, correct binding, unchanged original review, and no orders/jobs or repeated upload.
- Native HTTP transport is intercepted offline to assert exact source/target bearer scope for normal APIs and absence of bearer/credentials on storage requests. No real network calls occur.
- The `convex-test` fixture omits actual upload Content-Type metadata and uses a fixed fake upload hostname; tests restore only those two fixture details. Production code keeps both checks strict.
- Failure cases include lost POST response, lost target completion, lost CP remember/finalize/dispatch acknowledgements, concurrent/stale claims, a different review ID, revoked target before and after POST, changed bytes, wrong returned metadata, token echoes, aggregate/count/file caps, source and target identity variation, base64/hex dedup, and target configured upload policy.
- Added target upload policy regression first failed (`/tmp/media-target-policy-red.log`) and then passed (`/tmp/media-target-policy-green.log`). Initial target handler tests also exposed the real base64 digest representation instead of assuming the deprecated hex comment.
- CP, site backend, Admin and Website typechecks passed. Generated contracts contain 2,013 site functions / 1,896 DTOs with 439 existing unknown boundaries; controller bindings contain 110 modules / two components. Both consumers passed all 19 negative API compiler fixtures.
- Seven owned new source/test files were formatted with the installed Biome formatter; no broad formatting was applied. Final generated-contract/diff checks are recorded at handoff.

## Root deployment and acceptance recipe

No deployment, provider call, browser/native launch, live upload or production mutation was performed by this agent. Deploy the additive target site schema/functions before the controller transfer functions. Keep native UI inactive for this backend acceptance.

1. Create a fresh normal media-only preview on the desired same-site staging→production pair. Preserve its returned `receiptId`, `reviewFingerprint`, and the desired authored media record's exact `key`.
2. Invoke `contentPromotion/mediaTransfer:execute` with `{receiptId, expectedReviewFingerprint: review.reviewFingerprint, mediaKey, confirmStorageWrite:true}`. This authorizes a bounded storage prerequisite, not authored Apply.
3. Read `contentPromotion/mediaTransferRecords:get` with the same three identity fields. Only `phase: "verified"` plus a returned `storageId` is a verified binding. `uncertain`/`possibleOrphan` must not be bypassed through another review or upload.
4. Once all media in that graph are verified, invoke `contentPromotion/mediaTransfer:reviewTransferred` with the same three identity fields. It returns a new reviewed/blocked receipt. Preserve the original receipt separately. The new receipt may still be blocked by other dependencies.
5. Inspect the new incoming values and eligibility, then separately authorize canonical broker Apply using the NEW receipt and NEW server fingerprint. Existing production content and plugin settings should remain untouched in the media-only acceptance.

Prior root native Apply evidence has been appended to `content-promotion-native-apply-outcome.md`; root's live changed-target conflict proof is now recorded in `content-promotion-broker-apply-outcome.md`.

## Root live cloud and native acceptance

Both isolated site backends then the controller deployed successfully with full Convex typechecks. Logs: /tmp/convexpress-staging-media-transfer-deploy.log, production equivalent, and control-plane equivalent. One existing Aster retreat original (WebP,253338bytes,1536×1024) was selected through the normal signed operator review. Initial receipt p97e4tb9we2epr102ys75y9g0n8dt76j blocked only on TARGET_MEDIA_UPLOAD_REQUIRED. Explicit transfer returned verified, dispatchCount1, no possible orphan, target storage kg220zr8rdpm76pwxggbs2ry5x8dvzd2. Direct production media count remained0 before Apply.

A new bound receipt p97fhhtwc0y4qcsxxere4tfqf98dtxhq reviewed cleanly, then separately confirmed Apply pd75mkcgxa0ec35rwznn44w1ds8dv7sp created media tx7ng68x1nk6nbjpvh2xv83h118dvp95. Every authored metadata field is identical to the source; production count is1. Repeating transfer and Apply preserved both original identities/dispatchCount1. The initial blocked review fingerprint remained unchanged. No plugin, snapshot or production Worker publication was part of this case.

Actual Electron production Media Library and Edit Media display the exact original at1536×1024 with its alt text; root inspected the image. Returning to staging shows its separate3-image library while production has1. No captured page errors. Evidence: output/aster-house/content-promotion/cloud-media-acceptance.json, initial/bound review JSONs, and native/production-media-library.png + production-media-editor.png. The Aster site manifest records the new production media ID and evidence.

The media editor previously stated thumbnail generation was pending whenever no variants existed, although this transfer intentionally enqueues no processing job. Root corrected that empty-state copy to say no additional image sizes are available. No processing job or image transformation was added. Native transfer controls, cross-operator recovery, unknown-ID orphan reconciliation and larger file graphs remain open.

## Generated-graph type boundary follow-up — 2026-09-05

After the new internal membership policy queries were included in offline API generation, backend inference failed in the existing media upload module. Its three registered handlers now declare exact finite argument/result contracts, shallow typed validators and handler context/argument types. Runtime bodies and accepted/returned validator shapes are unchanged; no suppression or widened API contract was introduced. Backend `tsc -p convex/tsconfig.json --noEmit` passes (`/tmp/media-upload-finite-types3.log`, exit 0). The three existing actual media-intent handler regressions pass (11 assertions, `/tmp/media-upload-finite-handler-tests.log`); scoped formatting and diff checks pass. Auth agent owns subsequent compact generation and integrated caller checks.

A proposed cross-operator recovery extension is documented in `content-promotion-media-recovery-proposal.md`. It remains design only: this follow-up does not activate new recovery schema, APIs or native UI.

## Root live media acceptance completed

Root's `output/aster-house/content-promotion/cloud-media-acceptance.json` proves one 253,338-byte WebP transferred with dispatch count 1 and no possible orphan. The original review stayed unchanged. Target media count was zero before separate Apply and one afterward; exact transfer and Apply retries retained dispatch count 1 and the same IDs. All recorded authored image fields were preserved. Root also rendered the production library and editor: intrinsic image dimensions 1536 × 1024, no page errors, and staging still had three media records when returning from production's one. Native transfer controls remain inactive.
