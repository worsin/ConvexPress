# HB3 Customizer implementation outcome — September 4, 2026

Implemented in `codex/convexpress-hardening`. No live site/provider/browser actions occurred in this subtask.

## Published settings and private drafts

- New `settings/templateDrafts.ts` exposes authenticated `snapshot`, `publish`, `getDraft`, `saveDraft`, and `discardDraft` functions, all requiring `manage_options`.
- Snapshot revisions hash the effective published settings and document revision. Publish compares that revision inside its mutation. A stale different payload fails with `TEMPLATE_CONFLICT`; replaying an already-committed identical snapshot is a no-op, so an uncertain network response does not duplicate writes/events.
- Live (or unidentified) sites require explicit publish confirmation. Promotion rejects a different website, a non-live target, or the same source/target instance. Template input validates nested module objects and has a bounded serialized size.
- Additive `appearance_drafts` table stores private per-user/per-pack override snapshots, their original published revision, and their own revision. Concurrent windows cannot silently overwrite/discard a newer saved draft. No draft is returned through public settings. The table is included by the existing `settingsTables` schema spread.

## Editor behavior

- The shared pure `templates/sdk/draftModel.ts` owns immutable 50-step undo/redo, changes lists, nested field reads/writes, group reset, brand-bound reset, and palette application. `sync:templates` generates the Admin mirror; `check:templates` verifies byte parity for this model and chrome definitions.
- Added eight selectable named palettes: Core Clear/Midnight; Journal Parchment/Ink/Rosewood; Depot Workshop/Night shift/Signal. Manifest defaults/presets are included in the generated Admin summary.
- Admin Customize has undo/redo, group/brand reset, saved-draft save/recovery, published-version conflict notice/reload, a changes review, and live confirmation. In-flight saves disable editing, and completion from a previous environment cannot replace the current editor state.
- Header/Footer groups embed the existing controlled section editors and Footer row builder supplied by the content agent. Generic nested fields use the shared path accessor. Customizer messages send a complete override snapshot to the known preview origin; readiness messages must come from that frame and origin.

## Staging promotion

- `templatePublishing.ts` prepares a review from published staging settings and the same website's registered live environment. It obtains a short-lived administrator site session through the existing control-plane session broker, verifies the returned and queried live identity, and records the target revision.
- The copied payload is cloned when reviewed. The final action copies only `appearance.template` through the revision-checked publish mutation. No deployment key, content clone, or other settings section is involved. The live session is cleared after completion/cancellation/errors.
- Environments cannot share a database transaction. The source is the immutable snapshot explicitly reviewed; the live revision is checked atomically at commit. Promotion requires a configured standalone control context and live management connection.

## Verification

- Settings/backend + promotion helper suite: **24 pass / 0 fail** (6 files), `customizer-tests.log`. Covers auth, private user isolation, draft save/discard races, stale publish rejection, replay idempotence, malformed input, live confirmation, promotion identity mismatch, immutable reviewed payload, and migration projection/receipt/chrome alias behavior.
- Website draft model, Shop resolver and palette suite: **13 pass / 0 fail**, `customizer-model-tests.log`. Final targeted draft/promotion rerun also passes in `customizer-final-smoke.log`.
- Backend and Admin web TypeScript checks pass (`customizer-backend-typecheck.log`, `customizer-admin-typecheck.log`). Website latest types passed in the content agent and a final capture is `customizer-website-typecheck.log`.
- Template check passes **3 packs / 86 surfaces**, including generated draft/chrome mirror parity. `git diff --check` passes.

Root still owns deploying the additive schema/functions, regenerating deployment artifacts as needed, per-site migration receipt checks, rendered Customizer/preview acceptance, and authorized staging-to-live promotion acceptance. Legacy theme/layout source tables remain for migration/rollback; their obsolete function modules have been retired.
