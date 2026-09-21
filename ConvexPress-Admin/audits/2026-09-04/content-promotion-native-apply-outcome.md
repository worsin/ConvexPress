# Native reviewed apply activation — 2026-09-05

## Implemented

The existing Sites content-promotion panel now offers **Review production apply** only when the authorized controller receipt explicitly permits it. `canApply` is distinct from `reviewReady`; any existing durable apply row makes both false. `canRecover` is a separate server decision for eligible nonterminal, inactive leases. Existing apply outcomes appear through the bounded `applyState` DTO. No schema or canonical site API changed in this slice.

Opening confirmation re-reads the saved receipt under current authorization and exact source/target identity. The modal opens on its heading, shows the production site origin, expands the validated incoming author fields, explains publication effects, and requires a fresh unchecked acknowledgement. Only its final **Apply reviewed content to production** button can submit. Submission re-reads authorization/eligibility again and sends precisely the server receipt ID, server review fingerprint, and `confirmLive:true`.

Operator/website changes remount the panel. Pair and origin changes invalidate its generation. Closing preview or losing access clears loaded content and confirmation. Changed picker selection clears the previous review. Expiry disables confirmation locally and is checked again by the broker. The backend still performs fresh source reconciliation and optimistic target checks before dispatch.

A minimal pending marker (receipt ID and fingerprint only, scoped by operator and website) is written before dispatch. Storage failure prevents an untracked request. Transport errors cause readback only; no automatic replay. Confirmed action results survive stale readbacks. Uncertain or interrupted operations offer **Review recovery** only when the server permits recovery; its confirmation explicitly explains status checking and possible retry of the same original receipt. A response lost before any durable apply row is visible retains an unconfirmed marker and can only be explicitly reviewed for a safe retry of the same receipt after another fresh server eligibility check. An authoritative expired receipt with no apply row releases that marker because no later claim can pass the broker expiry guard.

Saved receipts can be reopened after Sites unmount. Applied, rejected, checking, submitting, uncertain and rolled-back states have separate outcome text. Applied receipts never revert to ready because their review expired. Target IDs from confirmed mapping evidence are available in the receipt disclosure; recovered status with no mappings explicitly says so. No rollback control exists.

## Evidence

- Real CP handler tests cover initial eligibility, blocked/expired/stale-authority/other-operator refusal, claimed lease, stale lease recovery, and terminal state ineligibility. Existing actual canonical site-handler apply and target-conflict regression chain remains included.
- Pure UI orchestration tests cover no action without acknowledgement, fresh read before dispatch, exact arguments, pending persistence before write, site/operator/access/fingerprint changes, lost response readback without replay, unknown result, recovery permission, revoked access in flight, failed storage, bounded pending restoration, expired definitive no-dispatch resolution, and stale readback after success.
- SSR confirmation/view tests verify readable incoming fields, exact production destination, unchecked/invalid button gating, recovery naming, escaped malformed content, applied-after-expiry display, and explicit unconfirmed outcome.
- Final integrated suite: **125 tests passed, 695 assertions across 12 files**, `/tmp/native-apply-complete-tests.log` (session 31394, exit 0).
- Full Admin source typecheck: `bun run check-types`, `/tmp/native-apply-complete-types.log` (session 67049, exit 0).
- CP source typecheck: `bun run check-types`, `/tmp/native-apply-cp-final.log` (session 48686, exit 0).
- Offline CP bindings generated and verified: 107 modules, 2 components. Global `git diff --check` passed.
- No processes remain from this agent's checks.

## Scope and acceptance limits

No external calls, deployment, browser, native app, provider, or production mutation were performed by this agent. Root previously proved the broker against cloud care-draft apply/idempotent retry and a changed-target conflict; those are prior backend evidence, not evidence that this new UI has been exercised.

The root operator must deploy the updated CP DTO and rebuild/load the native Admin bundle, then verify: ready draft confirmation with initially disabled final button; cancel does not write; explicit apply produces confirmed result; reopening Sites retains that result; blocked member/media review offers no apply; changed source/target after review rejects or disables apply without overwriting production; recovery is explicit and reuses the original receipt. No automatic media transfer, upload, snapshot fallback, rollback, or unsupported graph expansion was added.

## Root native acceptance (reported after implementation)

Root exercised the actual native UI: cancelling left controller `applyState` null; the final button began disabled; explicit acknowledgement plus Apply produced `applied` with one dispatch; direct production draft content matched exactly; reopening Sites restored the saved applied receipt with no apply button; blocked member/media review had zero apply buttons and zero page errors.

Evidence: `output/aster-house/content-promotion/native/apply-acceptance.json`, `blocked-apply-acceptance.json`, `production-confirmation.png`, and `applied-result.png`. These live actions and observations were performed by root, not this source agent.
