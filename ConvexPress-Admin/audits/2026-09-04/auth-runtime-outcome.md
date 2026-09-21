# Auth/runtime hardening outcome — September 4, 2026

Scope: A04–A08 and B08, implemented in `codex/convexpress-hardening`. No deployment, browser/native app launch, commit, or push was performed for this batch.

## Changes

- **A04:** Common site-target authorization now resolves stored website/environment relationships and requires active, consistent organization/business ancestors. Organization/business deactivation schedules controller-session revocation filtered to that portfolio. Disabled parents remain eligible for outbound revocation, and retry payloads preserve the filter. Sibling portfolios are excluded.
- **A05:** Permission replacement invalidates both old and new users. If either permission subject is a role or legacy broad subject, controller-wide invalidation is scheduled. Identical user subjects are deduplicated.
- **A06:** Authorization reads request one extra row and fail closed on rule/assignment/grant overflow. No partial rule set reaches deny-first evaluation. Current bounds remain 200 assignments/organization/business grants and 500 direct permissions/website grants/action rules; capacity overflow is now an explicit error, not an authorization omission.
- **A06 performance:** An explicit request-local resolver reuses identical rule/role reads in portfolio context and batched access queries. There is no process-global cache. Ordinary mutation checks remain uncached; each later query creates a new resolver and sees changed permissions. The real two-site context handler initially issued 16 role-catalog queries; the regression now covers 48 sites plus 48 environments with four role-catalog queries, then confirms a subsequent request sees a newly inserted deny. This is an in-memory handler/read-count benchmark, not a live backend latency claim.
- **A07:** The shared desktop renderer policy defaults to packaged-only. Development access requires an explicit development flag; existing dedicated development branches remain supported. Handoff and credential-provisioning handlers explicitly pass runtime mode. Registered-handler tests additionally found missing updater guards; both app-content and shell update check/install handlers now validate their sender. Production and development navigation were exercised through the real WindowManager with an isolated Electron boundary substitute.
- **A08:** Owner-deny protection is shared between permission upsert and activation. Non-owner administrators cannot reactivate owner-user or owner-role denies; owners still can.
- **B08:** Auth persistence sequencing recovers after write rejection while retaining errors for `flushControlAuthStorage`. Failed persistence cannot block a later logout removal or new session write. Multiple failures are surfaced as an AggregateError.

## Verification

The initial new tests failed against current source for inactive-parent exchange, absent disable revocations, missed old-user/role revocations, owner-deny activation, truncated permission rules, packaged development-origin acceptance, poisoned auth persistence, and repeated role reads. Fixes were applied after these failures were observed.

| Check | Result |
| --- | --- |
| `bun test convex` in control-plane | 109 passed, 0 failed |
| `bun test electron` in desktop | 62 passed, 0 failed |
| Web auth-storage/auth-client targeted tests | 3 passed, 0 failed |
| Site management HTTP/transaction tests | 5 passed, 0 failed |
| Control-plane `bun run check-types` | Passed |
| Desktop `tsc --noEmit -p tsconfig.electron.json` | Passed |
| Web `tsc --noEmit` | Passed |
| Scoped `git diff --check` | Passed |

New control-plane tests invoke the real registered handlers against `convex-test` storage. Only the outer identity adapter and scheduler boundary are substituted. Revocation transport uses a real generated synthetic signing key/encrypted credential and the actual propagation action; its HTTP boundary returns a synthetic retry response. Separate existing site backend tests verify signed-session revocation and sibling-token preservation. Desktop mocks run in isolated subprocesses and do not touch real Electron profiles or start applications.

## Remaining acceptance and limits

- Root should deploy the coordinated control-plane build to the disposable fleet and perform real two-client Electron acceptance. This batch proves the local production handlers and transport boundaries, not an end-to-end deployed revoke interval.
- Revocation retains the existing bounded retry policy (initial attempt plus three retries, each request with an eight-second timeout). An unreachable site cannot receive immediate invalidation; its previously issued sessions expire within the existing fifteen-minute maximum. The existing 500-connection revocation-pass cap is unchanged.
- A04 validates site-target ancestors; hierarchy maintenance operations can still reactivate an inactive entity. It does not erase grants or data on deactivation.
- Fail-closed rule bounds preserve security but can produce an operator-visible capacity error. A later larger-fleet pass can replace them with narrower indexed permission retrieval/pagination.
- No schema migration or credential rotation is required by these changes.

## September 20 A05 live acceptance

A05 now meets its original live acceptance requirement on controller4720/site4860. Existing implementation was verified with two real claimed restricted operators: user allow reassignment revoked both old tokens and transferred editor authority; explicit deny reassignment revoked both and updated separate Electron windows; role-to-user reassignment revoked both operators and an administrator as the broad control. Verification completed in3326/4136/3002ms. User-to-user transfers preserved the unrelated administrator. Temporary operators are inactive, website assignments removed and six test permissions revoked. Current controller source matches its deployed checkpoint. See `output/permission-reassignment-20260920/acceptance-review.md` and three verification receipts. This supersedes the earlier A05 live-acceptance gap only; A04/A06–A08/B08 and full release acceptance retain their other requirements.

## September 20 B08 native acceptance

Existing queue recovery is verified through real Electron process33701 and encrypted-storage IPC. A read-only disposable auth file causes EACCES that flush reports; restoring its mode permits actual cache/bridge/disk key removal, then encrypted new writes. Normal UI logout clears saved authority and login persists a different session in the same renderer.3 targeted tests/8 assertions pass. No source workaround or IPC mock. Disposable session signed out, file permissions restored, owned app closed. Evidence: output/auth-storage-recovery-20260920/acceptance-review.md. This closes B08's original acceptance gap only.

## September21 A06/A08 acceptance and reactive Sites repair

Accepted original A06 and A08 after current-source isolated controller checks and final native acceptance. Typed capacity recovery replaces the generic crash message. Consolidated operator-scoped capability subscriptions and reused the authorized website description after reproducing a twelve-query reconnect loop on the eight-query backend. Final seven-query Sites view clears overflow, recovers, reacts to ordinary deny/reversal and switches websites without reload or reconnect.383 controller/488 Admin tests, types/build/lint passed. Scoped infrastructure and private inputs removed; other resources preserved. Full evidence and limitations: [permission-boundaries-20260921.md](permission-boundaries-20260921.md). Current original audit count: eight accepted/sixteen open.
