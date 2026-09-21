# Native media prerequisites and existing-copy recovery — source checkpoint

2026-09-05. Implemented the approved bounded Admin UI design in `content-promotion-native-media-design.md`. This slice changes only Admin promotion components/helpers/tests and progress documents. No CP/site runtime, schema, contract generation, deployment, provider action or native/browser action was performed by this agent.

## Implemented

The Sites content review now includes a Media files section. Each authored media descriptor is parsed through the same authored-kind schema and bounded transfer spec. Scope, actor, reviewed fingerprint, supported type, eight-file/4 MiB graph and 2 MiB individual caps are checked before exposing a transfer action.

Explicit Refresh media status reads the scoped durable ledger. Only an authoritative absent/planned-zero-dispatch result plus an exact-key `TARGET_MEDIA_UPLOAD_REQUIRED` issue permits a new file-transfer review. Errors are not interpreted as absent. Already verified copies never offer another transfer. A dispatched result can only offer Check original transfer after the active lease has ended. Unknown-ID orphans explicitly remain unresolved, with another upload blocked and possible manual reconciliation; they do not offer a recovery that claims to know the lost bytes.

Each final file action uses the existing Dialog primitive with a focused heading, exact production destination/file/MIME/bytes, unchecked acknowledgment, Cancel and explicit final action. It rereads the own review and current ledger, validates the frozen identity again, then saves a pending marker before making one transfer/check call. It never calls authored Apply.

An operator who cannot open another creator's ledger can separately Review existing-copy recovery. The first dialog collects a bounded reason and prepares the server's audited review. The next displays the reviewed reason/destination/file and original/beneficiary/receipt/fingerprint details, then requires a separate acknowledgment. Confirmation rereads both the own content review and exact saved recovery, respects current server canConfirm/expiry/lease/actor, records its pointer, submits once and rereads the SAME recovery after a lost acknowledgement. Verified copies are refreshed without another upload.

Only bounded local receipt metadata is saved, scoped by operator, website, environment pair, review ID and fingerprint. Authored data, URLs and credentials are not stored. Changed scope/permissions, unmount and canceled dialogs invalidate pending UI callbacks. Parent preview/selection/apply and media operations share a synchronous busy lock. A request can finish after the UI closes; its metadata supports a later authoritative status read.

Create updated content review rereads the own review and EVERY file's accessible verified ledger before using the existing reviewTransferred endpoint. It installs the returned review as a new review to inspect. The existing authored Apply confirmation is separate and never automatic. Unsupported plugin/dependency/content issues remain visible.

## Verification

- Promotion model, rendered dialog/row, existing Apply/review/source-session/catalog suite: **41 tests passed, 211 assertions, 8 files** (`/tmp/native-media-all-tests2.log`). This includes 16 new media tests: exact-key evidence, graph caps, uncertain uploads, missing acknowledgment, concurrent dispatch, fingerprint/permission/actor changes, marker-before-dispatch, lost recovery acknowledgement, partial ledger rejection and one separately requested updated review.
- Scoped oxlint: **0 warnings / 0 errors** on nine owned components/helpers/tests.
- Biome formatted only the owned new/changed source files.
- `git diff --check` passed.
- Admin integrated typecheck at `/tmp/native-media-final-types.log` had no promotion errors and two errors in the concurrently edited MediaPicker/MediaSelector DTO callers; auth agent owns those repairs. **Final integrated Admin typecheck passed (exit 0)** at `/tmp/native-media-handoff-types.log` after their concurrent repair.
- Native focus/pointer/rendered flow and live mutations are **pending root acceptance**. These unit/SSR tests do not claim browser or live acceptance.

## Accepted limits

Only the existing bounded original-image protocol is exposed (PNG/JPEG/WebP, current cloud-native origin policy and caps). There is no batch transfer, arbitrary URL, plugin activation, snapshot fallback, rollback, orphan deletion or unknown-ID reupload. No automatic Apply or target content mutation is hidden in a media confirmation.

The current updated-review endpoint requires a complete accessible verified transfer ledger for every media key. The UI intentionally enforces that conservative requirement even if some existing target media is already independently verified by the normal review planner. Such a mixed graph may require separately recovering its existing-copy ledger or using the already-ready ordinary review; this slice does not invent bindings or weaken the backend gate.

Cross-operator recovery remains a separately reviewed beneficiary grant with fresh dual-site permissions. It preserves the original creator, original immutable receipts, stored bytes and dispatch count. Unknown-ID outcomes remain unresolved; no recovery UI claims otherwise.

Local recovery IDs are immediately retained after a successful prepare response. If the prepare response itself is lost, repeating preparation uses the backend's existing idempotent own-review/media identity. Local storage failures block a fresh file dispatch; they are not treated as durable success.

## Root native acceptance recipe

1. Sites → Aster House → Content promotion → Preview staging content; select Media, Load content, select one supported original absent from production, Create preview. Inspect incoming fields and exact file prerequisite.
2. Media files → Refresh media status → Review file transfer for that named file. Verify focused dialog heading, production origin, filename, MIME and byte count; final button starts disabled. Cancel; assert no transfer/dispatch. Reopen, acknowledge and explicitly transfer. Inspect authoritative ledger phase, hash/bytes and one dispatch; no authored media record is created merely by transferring bytes.
3. Refresh status or close/reopen Sites → Open saved review → Refresh media status. Verified file must have no new-transfer button. Create updated content review; inspect the new receipt and remaining issues. Any authored Apply must use the existing separate production acknowledgment; it is not required just to accept the transfer UI.
4. For a separately authorized second operator and a fresh own review of existing known bytes, choose Review existing-copy recovery, enter a reason, prepare the server review, inspect its reason and original/beneficiary identities, cancel, reopen the saved copy recovery and confirm only after acknowledgment. Verify the same original bytes/creator/dispatch count and durable grant, then refresh. Root owns any temporary capability grants and their cleanup.
5. Exercise expiry/permission or environment changes with an open confirmation; it must not submit against the stale scope. For an existing unknown-ID fixture, inspect unresolved/manual copy text and absence of upload retry or known-copy recovery; Check original transfer may only inspect/reconcile its original ledger.

## Native acceptance correction — selector labels

Root's native exact-label lookup exposed the three selectors' implicit nested labels including option content. Replaced those controls with the narrow shared PromotionSelect: React useId, explicit htmlFor/id and a label containing only the visible prompt. Source staging environment, Target production environment and Content type now have stable explicit associations and unique IDs. Rendered regression passed (1 test / 4 assertions), Admin typecheck passed (`/tmp/native-promotion-label-types.log`), scoped lint and diff-check passed. Root continues native acceptance; no other media behavior changed in this correction.

## Root native/live acceptance — 2026-09-05

Root exercised the real native staging→production media flow; source agent reviewed the persisted evidence at `output/aster-house/native-media-transfer/acceptance.json` and screenshot directory. The named Content type / source / target selectors passed native exact-label lookup after the association repair.

Original review `p97dxz9yaah1qhg1e3zyzkkfas8dt3ed` presented the Aster camp mug original, filename `aster-house-camp-mug.png`, actual MIME `image/webp`, 82,500 bytes. The confirmation initially focused “Confirm this file transfer” and its final action was disabled before acknowledgement. Cancel left `mediaTransferRecords.get` null: no dispatch.

Root then explicitly acknowledged and transferred the file. Its durable result is verified, storage ID `kg289yd3ny50zntqr4hjecbcbd8dtsmc`, dispatch count 1, no possible orphan. The verified row exposed no new transfer action. Creating updated review `p9779r2328htq644pg6r6kqaed8dvbt8` returned ready with one provided/required media copy, no issues and no apply state. Production media count remained **1 before separate Apply**, proving raw transfer/re-review did not create authored media.

A separately acknowledged native Apply then completed once (`pd76p4x5v6f079qpgkvypnf3h18dv3fm`), mapping the mug media to production `tx7gzjj5hp0chawg1bdx02n3w18dvgvg`. Production media count became **2**. Final transfer readback retained the same storage ID and dispatch count 1. Root additionally verified the existing production draft remained unchanged. Applied DTO correctly reports canApply false, reviewReady false and a durable applied result.

Focus restoration is **unverified**. The saved JSON records `cancelReturnsFocus: false`; root confirmed that immediate DOM equality check was false and corrected the earlier narrative. A settled-focus native retest is pending. No delayed restoration is inferred, and no source change was made for this observation.

**Still not accepted natively:** cross-operator existing-copy recovery dialogs (the underlying backend recovery previously passed live acceptance), and unknown-ID orphan behavior using a live injected outcome. The latter remains covered by protocol/model/rendered tests; no orphan was created for native testing. Root continues unrelated P2 Media Library acceptance; implementation source is on hold.

## Focus restoration repair — native failure reproduced and source fixed

Root's settled notebook Cancel retest confirmed the real bug: heading received initial focus, but activeElement remained BODY five seconds after Cancel. No notebook transfer was confirmed. The prior unverified focus result is now a confirmed defect, not a timing assumption.

The async review opener disables/blurs its ordinary button before mounting a Dialog without a registered DialogTrigger. Relying on Base UI's default previous-focused-element fallback therefore loses the actual opener. Inspected the installed primary implementation: `@base-ui/react/dialog/popup/DialogPopup.d.ts` documents callback `finalFocus`; `DialogPopup.js` forwards it as `returnFocus`, and `FloatingFocusManager.js` resolves that callback at close/unmount cleanup. Returning false suppresses restoration instead of falling back to another element.

Added `usePromotionMediaFocus` to retain the actual clicked button before asynchronous review work, scoped to the current operator/environment/review identity. All transfer/check and both existing-copy recovery dialogs pass its guarded callback through the existing DialogContent finalFocus property. Connected, enabled same-scope buttons can receive focus. Changed identity, permission loss, disconnected buttons and parent unmount return false. Parent layout cleanup invalidates the target before descendant dialog cleanup. No setTimeout, manual delayed focus, shared Dialog change or backend change was introduced.

A subprocess-isolated JSDOM test mounts the actual shared Base UI Dialog after deliberately blurring the async opener. It failed before the wiring with BODY rather than the trigger, then passed after the repair. It verifies heading initial focus and Cancel restoration for file transfer, recovery reason and prepared recovery confirmation; it also verifies no stale focus restoration after scope change, revocation, button removal or parent unmount. Isolation ensures Base UI initializes its DOM feature detection in the test's real DOM environment, independently of SSR tests.

Final source checks: **44 tests / 221 Bun assertions / 11 files passed**, including the actual DOM focus scenarios (`/tmp/native-media-focus-suite.log`); Admin typecheck exit 0 (`/tmp/native-media-focus-types.log`); scoped lint zero warnings/errors; formatting and diff-check passed. Root's native notebook retest is pending; this source checkpoint does not claim that rendered acceptance yet.

## Root native focus retest — accepted

Root's fresh untouched notebook review passed the settled retest, recorded in `output/aster-house/native-media-transfer/cancel-focus-fixed.json` with `cancel-focus-restored.png`. After the mounted dialog focused its H2, Cancel returned the exact file-transfer trigger. In a separate opening, Escape after heading focus returned that exact trigger. The existing-copy recovery reason dialog's Cancel returned its exact recovery trigger. No notebook file was transferred and no recovery was prepared or confirmed. The prior failed immediate/settled observations remain above as historical red evidence.

The final prepared recovery confirmation stage remains covered by actual DOM tests only; this retest did not exercise its native confirmation. Unknown-ID orphan behavior remains un-injected live. Implementation source remains unchanged after this documentation update.
