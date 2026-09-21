# C01 scoped accounts, receipts and UI outcome

Implemented in the isolated `codex/convexpress-hardening` checkout:

- Dedicated scoped hosting account, provisioning receipt and step tables, with encrypted credentials and immutable public resource ownership.
- Agency-only provider custody, current RBAC/parent checks, pre-HTTP authorization, post-HTTP reauthorization/revision check, verified provider identity, encrypted token replacement and revoke erasure.
- Durable creation/reconciliation/confirmation/rejection transitions. Repeated target requests reuse compatible plans; incompatible plans fail. Uncertain requests cannot create again. Definitive rejection permits one new attempt. Production/staging cannot share a database.
- Organization/business account management and website cloud create/adopt/recovery UI, wired to root's typed provider actions. No browser token persistence.

Validation completed locally:

- Eight real-handler account/provisioning tests cover customer denial, explicit admin deny, cross-scope use, disabled parents, optimistic revision, secret removal, actual HTTP identity verification plus encrypted commit, post-verification parent disable, AAD scope isolation, interrupted/rejected retry, immutable confirmations, cross-site/resource namespace ownership and concurrent competing confirmations.
- Full control-plane test suite: **139 passed, 0 failed, 485 assertions** across 32 files (includes provider adapters and prior fleet/security/operations suites).
- Control-plane TypeScript: passed after root provider action integration.
- Admin web TypeScript: passed after generated typed action wiring.
- `git diff --check`: passed.

No real credentials were used by these tests; keys/tokens/storage are synthetic and temporary. No deploy, cloud mutation, browser operation, commit or push was performed by this subagent. Main-task live/browser acceptance, instance attachment and protected desktop initialization remain separate evidence; a confirmed cloud receipt alone is not a finished website deployment.
