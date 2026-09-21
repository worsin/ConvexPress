# C03 — durable desktop provisioning recovery

Design for the isolated hardening branch; implementation proceeds alongside C02's packaged deployment payload.

- A local, versioned, atomic journal records run IDs, immutable canonical deployment targets/site identity, attempts, phase receipts and terminal/interrupted state. It never stores credentials, tokens, environment values, command arguments, raw command output or raw exception messages.
- Lock by canonical deployment origin. Independent sites may run concurrently; one target cannot be deployed twice concurrently. Initialization retains its control-plane instance/site identity so retries cannot silently rebind a target.
- On process restart, unfinished runs become interrupted and remain visible through status/history. No infrastructure action runs automatically. The operator resubmits the matching request and supplies fresh credentials; the journal links the retry to the existing run.
- Recovery replays idempotent environment/code/identity steps and checks current provider/site state. Existing signing/encryption keys are preserved. Before enrollment, inspect the existing control-plane connection: reuse an already-connected result; reject ambiguous/pending attempts instead of creating a duplicate. This covers a crash after enrollment but before the local success receipt.
- Every child command has a deadline, bounded capture, cancellation and process-tree termination. A target lock is released only after command termination/operation settlement. Network calls have explicit deadlines and uncertain outcomes are reconciled by retry, not assumed absent.
- Each initialization panel filters progress by target origin. Reopening it reads durable status and shows interrupted/failed state with a retry action. Status/history expose only public journal metadata plus sanitized in-memory progress.
- Tests use real temporary journals and harmless child processes: restart recovery after each phase, same-target exclusion, independent targets, immutable retry identity, secret omission, atomic/corrupt-file behavior, deadlines/cancellation, and completed-connection reconciliation.

No deployments or live provider mutations are part of this implementation station. Root owns delivered-app/fleet acceptance and C02 integration.
