# Native media prerequisites and recovery — design, 2026-09-05

Implement only Admin promotion components/helpers, using the deployed controller APIs. No native shell, provider, media-library query, schema or API generation edits are planned.

A Media files section under the incoming review lists validated authored image names, file type, size and production destination. The existing 2 MiB/file, 4 MiB/review and eight-file caps are shown where they prevent work. Unsupported/malformed descriptors cannot create a transfer action. Files are processed one at a time.

Each row reads its scoped durable transfer status on explicit Refresh media status. An absent row permits Review file transfer; a read error does not. A separate Review existing-copy recovery entry lets an authorized operator prepare their own audited recovery, even when the original transfer ledger belongs to another operator. Preparation is never treated as success: only the returned server receipt can enable recovery confirmation.

Use the same Dialog primitives as the existing Apply confirmation, with a focused heading, named controls, keyboard dismissal and focus restoration. File transfer confirmation names the exact reviewed file, bytes and production destination, requires an unchecked acknowledgement, and calls only the existing transfer execute endpoint. The confirmation is revalidated against a freshly fetched own review and scoped status immediately before dispatch. No transfer batch and no automatic Apply.

A dispatched known-ID or uncertain transfer offers Check original transfer, with wording that it checks/reconciles the existing stored result and never sends the file again. A possible unknown-ID orphan is clearly unresolved: another upload is blocked; manual reconciliation may be required. There is no Retry upload button in this state. Active leases show progress/busy status; they never create retry eligibility. Ordinary Refresh reads controller state only.

Existing-copy recovery first collects a bounded reason and prepares a server review. Its separate confirmation shows that reason, destination and file, with original/beneficiary IDs and receipt fingerprint in secondary receipt details. It requires another explicit acknowledgement and the server's current canConfirm decision. Lost acknowledgements reopen the same saved recovery receipt and check it; known verified bytes never become a new upload action. Expired, revoked or changed-scope confirmation fails closed.

After all required files have verified transfer bindings, Create updated content review calls reviewTransferred, saves/displays the NEW receipt, and clears media confirmation state. If the ordinary review already has complete verified target-media evidence, no additional transfer is suggested as required. The existing authored Apply confirmation remains a separate button/dialog. Missing plugin/other dependency conflicts remain visible.

Persist only bounded receipt IDs, fingerprints, media keys and pending markers per operator/site/pair/review; no authored payload, URL, session or credential goes to local storage. Scope/operator/receipt changes and unmount invalidate outstanding callbacks and close dialogs. Query failures never erase a submitted marker or manufacture an idle/transfer-ready state. Reopening a saved review restores recovery pointers and explicitly refreshes durable state.

Parent selection/preview/apply controls and child media actions share a busy lock to avoid concurrent local operations. Cancel before dispatch performs no transfer/confirmation. An in-flight backend call may finish after unmount; local pending metadata supports later authoritative readback.

Verification: pure async orchestration regressions for cancel, acknowledgement, fresh scope, changed fingerprints, revocation, pending/unknown results and no-upload recovery; rendered dialog/row tests for readable destination, disabled final actions, unresolved copy and absence of upload retry; Admin typecheck/lint/targeted existing promotion UI tests. Root owns native pointer/keyboard/live acceptance and any deployment.
