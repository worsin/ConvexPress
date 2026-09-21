# Existing-byte media recovery across operators — 2026-09-05

## Scope and deployment status

Root approved the beneficiary-grant design and then explicitly released the runtime hold after both membership deployments succeeded. This slice is implemented in canonical controller/site modules, with no native activation or deployment by this agent. Temporary TypeScript scaffolds outside `convex` were removed after activation. The original creators and original review envelopes remain unchanged.

Controller APIs are `contentPromotion/mediaRecovery:prepare`, `:confirm` and `contentPromotion/mediaRecoveryRecords:get`. Target APIs are `contentPromotion/mediaRecovery:inspect`, `:grant`, `:status`, and `:complete`. Every registered function has argument and return validators; site registered handlers also have finite explicit types. The new additive tables are:

- Controller: `overseer_contentPromotionMediaRecoveries` and `overseer_contentPromotionMediaRecoveryAudit`.
- Site: `contentPromotion_mediaRecoveryGrants` and `contentPromotion_mediaRecoveryAudit`.

Deploy the additive site functions/tables before the controller. No schema-version bump, plugin activation, user import, snapshot, queue, upload, deletion, or Apply endpoint is part of this slice.

## Behavior and protections

A beneficiary creates their OWN fresh normal source-to-target review, then separately prepares and explicitly confirms recovery using server fingerprints. The controller rechecks same-site distinct staging/live identity, compatibility and healthy signed authority, current controller capabilities for both sites plus live operation, fresh signed source/target sessions, and target `manage_options` and `media.upload`. Source re-export must match the reviewed stable authored manifest. Both deployment origins remain native Convex Cloud origins; existing image and graph bounds still apply.

The controller resolves the only eligible storage ID from its durable global transfer row or the exact target intent's verified evidence. Its public actions accept no storage IDs or URLs. Target inspection is privileged and exact-key only. The target grant endpoint receives the internally resolved ID through a normal authenticated public mutation and independently verifies actual `_storage` SHA-256, size and MIME against the original intent. This endpoint is also callable by an already privileged site administrator; it does not require an additional controller-signed attestation. It cannot acknowledge a controller grant or select unrelated bytes merely by claiming a hash. Current target upload-size policy is enforced for unfinished intents.

An immutable target grant binds the original site creator, authenticated beneficiary, exact intent/storage, new review fingerprint, reason and recovery identity. The controller activates its corresponding grant only after validating target acknowledgement and completion. Grant and completion retries reuse the same identity. Audit events record prepared/confirmed/reconciled controller transitions and granted/reconciled target transitions atomically; retries do not duplicate events. Refused attempts do not currently produce a separate durable audit event.

Recovery claims the EXISTING global transfer lease. It never changes the transfer creator, associated original receipt, target intent creator, storage identity, or dispatch count. The separate normal transfer action stays creator-only, including after recovery; a beneficiary cannot use a recovery grant to obtain upload permission. Verified grants allow that beneficiary to read the existing verified transfer for the exact new own review and create another normal bound review. Apply remains separate.

The controller's recovery receipt exposes `prepared`, `granting`, or `verified`. `granting` can mean a lost target/controller acknowledgement; retrying the explicit confirmation reconciles the existing grant/bytes. Current actor permissions and authority are rechecked before activation. Active leases reject concurrent confirmation. If another recovery changes the observed evidence before confirmation, create a fresh review instead of changing an existing receipt/fingerprint silently.

## Explicit limits

- Unknown storage ID with a still-issued target intent remains unresolved, even after lease expiry, another actor, or a new review. A later exact target intent that reports verified evidence can be reconciled. There is no storage scan, guessed-ID lookup, raw POST retry, deletion or orphan cleanup.
- Planned/never-dispatched transfers without existing verified bytes do not qualify. A previously reused verified transfer with dispatch count zero does qualify and retains count zero.
- Recovery confirmation requires a fresh, unexpired own review; durable status remains readable with current authorization afterward. If expiry, changed source, or changed authority prevents confirmation, use a fresh own review. Existing grants and the global dispatch fence remain intact.
- Grants are per beneficiary and per review, not exclusive custody. A departed beneficiary cannot permanently block a third currently authorized actor after the shared lease ends. The original still-authorized creator retains their normal owner path.
- Grant provenance does not replace current permissions. Target-only grant acknowledgement without controller completion does not activate controller access. A revoked actor may leave an active lease until expiry, but this never allows reupload.
- Target original bytes only: existing PNG/JPEG/WebP, 2 MiB/file, 4 MiB/review, eight media records. No custom/local storage origins, transformation, large files, automatic transfer or native controls.
- No cross-operator live acceptance was performed by this agent. Root owns deployment and real signed-session proof.

## Validation

- **117 tests passed, 732 assertions, eight files** across controller promotion and actual target operations/recovery handlers: `/tmp/media-recovery-full-promotion-tests-final.log`.
- New recovery coverage includes known and verified bytes, original creator departure, a departed beneficiary followed by a third operator, zero/one dispatch preservation, active concurrent claims, current permission and expiry refusal, changed source/target/storage, upload-size policy, lost grant/target-completion/controller acknowledgements, revocation after target completion, and raw target payload/session-echo rejection.
- The controller-to-target chain uses the real registered target grant/completion handlers and actual fixture storage, proving one existing blob, no authored media, no jobs, immutable creator, one grant and idempotent audit. Only the Content-Type metadata omitted by `convex-test` is restored in the storage fixture. Remote calls are injected offline; no live calls occur.
- New target handler tests initially failed before the recovery module existed (`/tmp/media-recovery-target-red.log`); the pure state protocol also began with a missing-implementation red test. Subsequent tests exposed fixture-only role and multi-grant identity problems, corrected in the fixtures.
- Site, controller, Admin and Website typechecks pass: `/tmp/media-recovery-final-{site,cp,admin,website}-types.log`.
- Offline site API generation: 700 production modules. Compact contracts: 2,019 functions / 1,903 DTOs, with 439 existing unknown boundaries unchanged. Controller bindings: 113 modules / two components.
- Both consumers passed all 19 negative compiler contract fixtures (`/tmp/media-recovery-final-contract-check.log`). Generated output check and scoped Biome checks are run at handoff; global `git diff --check` passes.

## Root acceptance recipe

1. Use a second authorized controller operator and normal signed site sessions. Create their own fresh media-only preview for the existing staging image and production target. Preserve the returned review ID and server fingerprint.
2. Call controller `contentPromotion/mediaRecovery:prepare` with `{receiptId, expectedReviewFingerprint, mediaKey, reason}`. The reason must be nonempty and at most 500 characters. Inspect the returned original creator, beneficiary, reason, status, expiry and server `fingerprint`.
3. Explicitly authorize `contentPromotion/mediaRecovery:confirm` with `{recoveryId, expectedFingerprint: prepared.fingerprint, confirmExistingBytes: true}`. Only `status: "verified"` and the expected storage ID prove completed recovery. `granting` requires status/retry; it never permits another upload.
4. Read `contentPromotion/mediaRecoveryRecords:get` with `{recoveryId, expectedFingerprint}`. Repeat confirmation to prove the same target grant/storage and unchanged dispatch count. Check creator fields, original review envelope, target media count, target grant/audit and controller audit.
5. Read `contentPromotion/mediaTransferRecords:get` for the beneficiary's original own review/media key; its verified binding should now be available. `mediaTransfer:reviewTransferred` can create a NEW normal reviewed receipt with that binding. The ordinary transfer `execute` remains creator-only. Do not use it as a recovery command.
6. No Apply is required to prove recovery of the already promoted image. Any later Apply must receive its own explicit review and confirmation. Keep native recovery activation off for this backend acceptance.

Root's previous single-operator live media acceptance is captured in `output/aster-house/content-promotion/cloud-media-acceptance.json` and appended to the transfer outcome: image rendered at 1536 × 1024; staging retained three media records versus production's one; exact transfer and Apply retries retained dispatch count one and identical IDs.


## Root live cross-operator acceptance completed — 2026-09-05

`output/aster-house/content-promotion/cloud-media-recovery-acceptance.json` proves the second operator's fresh unbound preview was reviewed with one verified media resolution, then explicit recovery preparation/confirmation and repeat used the same recovery receipt and storage ID. Original creator and original review fingerprint were preserved; transfer dispatch count stayed one, production media count stayed one, and a separate bound re-review was ready without another Apply. Root then revoked the temporary exact live-instance grant: repeat confirmation was denied. The synthetic operator was deactivated and current-identity lookup was denied. The red/green existing-media readiness artifacts preserve the earlier failure and repair. These are real signed-session cloud observations, not native recovery UI acceptance.

## Root native recovery acceptance — September 5

Root used the real original authorized operator in Electron to create a fresh media-only mug review. Empty reason and unacknowledged confirmation were disabled; entering the reason prepared a durable review. Cancel restored keyboard focus to the saved-recovery trigger, and reopening preserved the review. Native confirmation reached verified; ordinary signed API retry retained the same storage ID and transfer dispatchCount1. Production media counts stayed2, review status stayed reviewed, Apply state null. Root viewed native final screenshot. No transfer/upload or content Apply was performed. This proves the native original-operator path; previous cross-operator signed-session proof remains separate.

Evidence: `output/aster-house/native-media-recovery/acceptance.json`, confirmation-before-ack.png, confirmation-acknowledged.png, verified-existing-copy.png. Review p97cj146f340jnqd6m0bc1cngs8dt5y6, recovery pn70v8f1rgzrh003y7ay79cdss8dtxjh. Durable audit receipts retained deliberately; no disposable account/content/blob created by this pass.
