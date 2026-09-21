# Automatic connection readiness — source checkpoint

New connections now complete the same public identity/compatibility probe and signed controller session exchange as the manual Test action after sealing their credential envelope. Only guarded health persistence can mark an instance ready. An HTTP 200, enrollment receipt or saved key alone cannot do so. Incompatible engine reports now fail the action as well as recording incompatible evidence.

The action reauthorizes the operator and compares the exact target after the initial public probe, before enrollment. After sealing, failed verification leaves the connection and credentials available for a Test retry; it does not revoke or deactivate a subsequently changed connection. Existing mutation revision, active binding and credential-IV guards reject stale evidence. Pre-seal enrollment cleanup remains intact.

The desktop initializer verifies a reused connection before reporting completion, including an active connection with sealed credentials whose last verification failed. Fresh current-server creation returns healthy and avoids a duplicate probe; older servers returning connected receive an explicit Test call. Verification errors use existing current-run credential redaction. No new IPC or generated API contract is required.

Validation: 8 actual-handler tests passed, 119 assertions across connections health persistence and desktop deployment handlers. Scenarios include healthy/degraded/incompatible reports, denied signed authority and successful retry without reenrollment, credential rotation, operator revocation before enrollment and after enrollment, stale proof refusal, native reuse, sealed-error recovery, failure redaction and deployment target isolation. Control-plane and Electron TypeScript checks passed. Scoped diff whitespace check passed.

This is a local source checkpoint, not deployed/native acceptance. Existing authority rotation remains a separate lifecycle; this change covers new enrollment and initialization/reconciliation.
