# Automatic media-index provisioning and recovery

Implemented source design, 2026-09-05. Live automatic provisioning/import recovery remains root-owned acceptance; the earlier manual staging index acceptance is separate.

## Common authority and external import fence

`management/bootstrap.enrollAuthority` allows several active controller keys. A desktop journal or CP-local operation lock therefore cannot prevent independent controllers racing the first epoch write. The deployed site now owns a singleton `media_epoch_claim` indexed by `key`. Native initialization and managed snapshot imports use the same internal deployment-admin coordinator, with exact old/new epochs and immutable operation identity. The coordinator marks dispatch transactionally before the caller issues one environment write. A retry receives no new write permission. Exact site-side readback can reconcile a lost acknowledgement; lease expiry never permits an unknown write to repeat. Concurrent initializers adopt the same allocation. Existing valid configured epochs are preserved.

Initialization runs after code deployment so the internal coordinator exists, and before reporting setup complete. Credentials are the already-authorized deployment credentials; no administrator user or public session is fabricated. Environment values are written through protected temporary CLI files, and captured environment output is not logged.

Imports first claim and write a unique `mi_pending_<review-key>_<nonce>` epoch, then read it back before consuming archive bytes. Status reports `blocked / MEDIA_INDEX_IMPORT_IN_PROGRESS`; begin, step, deletion and guarded attachment writes refuse. After `finish_upload` returns a known import ID, a second coordinated transition adds that ID to the external pending marker BEFORE `perform_import`. This marker survives replaceAll even if database claim rows are replaced. Provider completion is independently verified before a final coordinated transition to `mi_ready_<nonce>`.

Known-ID timeout/retry polls the original provider import and does not upload again. A dispatched activation whose environment write succeeded but whose verification request never arrived is recovered from the exact surviving claim, rechecks provider completion, and persists the completion receipt without another environment write. Completed import receipts are indexed by the stable source/target-prebackup review key and preserved from the TARGET pre-backup by both streamed and small-archive preparation. They prevent a completed retry from initiating another import. The transient source claim is explicitly cleared in both prepared archive paths; its target schema is preserved so historical source archives cannot inject old dispatched claims or omit the new table schema. Preserved/reset table count is consequently seven, not five. A pre-backup predating this new infrastructure table must be refreshed; missing preserved evidence fails closed.

An unknown upload ID or unresolved external write remains explicitly fenced. No automatic reupload, timer-based takeover or guessed completion exists. Failed imports keep their pending marker. These exceptional states require explicit reconciliation; the normal fresh setup and known-ID recovery paths require no per-site code or manual epoch creation. Direct provider/CLI environment edits and imports outside the supported managed workflow remain privileged bypasses outside this guarantee.

## Authenticated maintenance

The scoped CP `siteBroker/mediaIndex:maintain` action reauthorizes the exact deployment origin, website/instance identity and administrator capability through the existing signed operator-session exchange. It calls only the normal public status/begin/step APIs, then rechecks current control-plane authority. Each batch runs at most 25 page mutations and independently rereads ready. Wrong generation, cursor nonprogress, malformed ready state, blocked owners and revoked/expired scope stop.

Fleet initialization and CP-backed upgrades resume batches until ready, bounded by 200 batches and the existing 30-minute deployment deadline. Every returned batch is fsynced to the native journal. A retry retains that journal and uses authoritative backend generation/sequence rather than replaying old pages. Success is reported only after readiness.

Standalone setup/direct deployment has no authorized site operator before first sign-in. It prepares the epoch and explicitly reports awaiting authorized indexing. The Admin runner mounts only for a real operator with `manage_options`; it starts stale/building generations after first sign-in, upgrades and completed managed restore. Scope changes/unmount stop subsequent writes. Blocked progress is visible and requires explicit Media deletion-safety repair/retry. Cleanup of old generations remains a separate bounded operator action.

## Rollout ordering

Deploy the updated site schema/functions first, then the CP pending-import fence, then enable the automatic native/UI continuation. Do not execute an old-CP import during the mixed-version window: the old fence writes a normal epoch. New CP refuses old sites missing the coordinator before upload. Existing active epochs remain unchanged, but the new writer-coverage version deliberately requires a new bounded backfill. No deployment or live environment mutation was performed by this agent.
