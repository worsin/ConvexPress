# Authored media transfer prerequisite: bounded first slice

Proposed to root before schema or registered API expansion, 2026-09-05.

## Existing evidence

`contentPromotion/operations.exportManifest` exports active stored media with actual `_storage.sha256` and size plus current `storage.getUrl` URLs. `operations.createMediaUploadUrl` requires `manage_options`, `media.upload`, and a live target. `planner.ts` checks target `_storage` hash and size before admitting a media binding. It does not replace a target media record's different original storage file. Native Convex storage upload returns the only storage ID and offers no application idempotency key. Actual `_storage` fixtures carry base64 SHA-256 while the deprecated storage metadata comment says hex; the transfer protocol strictly normalizes either 32-byte base64 or 64-digit lowercase hex into one canonical digest without changing the authored manifest. Native storage uses `/api/storage/upload?token=...` routes; no provider assumptions are inferred from unrelated URLs.

## Proposed boundary

- Separate explicit transfer action referencing the immutable controller review ID and server fingerprint; never part of Apply. Current same-site staging-to-live identity, 7 controller permissions, source/target signed sessions, `manage_options` and target `media.upload` must still pass.
- Re-export exact authored manifest and revisions before downloading. Ignore changing transport URLs in the fingerprint comparison, but only use a freshly exported media URL belonging to a matching reviewed media key.
- First version: active PNG/JPEG/WebP images only; at most 8 files; each at most 2 MiB; aggregate at most 4 MiB; sequential processing. No SVG, remote URL-only media, documents, audio/video, transformations or recompression.
- URL allowlist uses the exact canonical deployment origin and native storage path. Source GET receives no bearer token. No redirects, arbitrary source URLs, custom origins, credentials in URLs, or URL echo in errors. Upload URL must come from the target's signed normal API and match the exact target deployment's native upload route. Never send a site bearer to storage upload.
- Enforce response status, MIME, encoding, declared length when present, exact bounded streamed length, media signature and SHA-256 before requesting/uploading target bytes. Fixed preallocated buffers avoid unbounded chunk-array overhead.
- New target upload intent records the source/target identity, immutable media identity/hash/size/MIME, operator and operation key. Completion reads target `_storage` by returned ID and verifies exact metadata before reporting a verified binding. It creates no media authored record and emits no hooks, emails, processing jobs or asset variants.
- Controller persists a per-file durable state and lease. It records upload intent before raw upload and returned storage ID immediately after receiving it. Known storage IDs resume completion; verified intents resume status read only. No existing immutable review is rewritten. A separate fresh review can use verified bindings and must be reviewed again before Apply.

## Lost response and orphan policy

A lost completion/CP acknowledgement is recoverable by the target intent or controller receipt without a second upload. A lost **raw native upload response** can leave a stored blob whose ID was never observed. No safe lookup exists without scanning unrelated storage or guessing ownership. This becomes `uncertain` with a possible orphan bounded to one file (2 MiB); no automatic retry, replacement upload, broad storage scan or deletion occurs. A failed/revoked acknowledgement does not mean the bytes were not stored. Such a receipt requires explicit reconciliation outside this first slice; merely starting another review must not silently repeat the same uncertain media transfer.

Known staged-but-unattached blobs retain provenance. This slice does not silently garbage-collect them; a later explicit cleanup adapter must prove the exact blob is unreferenced and still belongs to the same transfer before deletion. Expiry restricts new upload dispatch, but does not erase evidence or block authorized status read.

## Approval and checks

Root approved the bounded backend/schema implementation and explicitly accepted the possible-orphan limitation as an initial slice, not production-complete recovery. Root additionally required cross-review blob deduplication and atomic dispatch marking before POST; both are implemented and tested. Target issuance/completion also respects the target media upload-size setting. Native transfer UI remains inactive until backend review and root deployment/acceptance.
