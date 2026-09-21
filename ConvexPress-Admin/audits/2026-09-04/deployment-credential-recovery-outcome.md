# Convex deployment credential recovery

Implemented on 2026-09-04 in the hardening worktree. Recovery is explicit and available from each registered cloud environment in the website's cloud panel. No provider keys were created, revoked, or inspected live for this implementation; tests use synthetic provider responses.

## Confirmed provider capability

Convex supports [listing deployment keys](https://docs.convex.dev/management-api/list-deploy-keys) and [deleting a deployment key](https://docs.convex.dev/management-api/delete-deploy-key) by its unique name. Its [official management OpenAPI schema](https://github.com/get-convex/convex-backend/blob/main/npm-packages/%40convex-dev/platform/management-openapi.json) returns metadata for listed keys: numeric ID, name, creation time and allowed actions. It does not return the lost secret. The implementation does not attempt secret retrieval.

## Behavior and authorization

A pending issuance has a durable credential row. Existing rows remain compatible: absent `generation` means generation zero, the original `ConvexPress <credential ID>` name, and the existing encrypted-envelope AAD. Ready credentials remain untouched and use the existing cache and release authorization.

The recovery widget shows pending intent/recovery state, eligibility time, and an input requiring the exact deployment name. The server repeats that confirmation check and verifies current operator permissions, active organization/business/website/environment, live-operation permission when relevant, hosting-account scope/revision, confirmed resource attachment, current provider team, project membership, and exact deployment identity.

Recovery cannot claim an intent or abandoned recovery lease until 15 minutes after its last write. This exceeds Convex's documented [ten-minute Node action execution limit](https://docs.convex.dev/production/state/limits), allowing the original control-plane action to finish or expire before intervention. The widget refreshes the eligibility clock while mounted; server time is authoritative.

An atomic recovery claim stores a fresh lease. It then reads the bounded key listing and matches only the exact generation-specific name issued for this credential row. Multiple matches fail closed. With one match, it reauthorizes the recovery lease before deleting that exact name, then requires a second list to prove the name is absent. With zero matches, the successful complete listing itself supplies absence evidence. Listing failures, excessive rows, malformed metadata, ambiguous names, and unconfirmed deletion never unlock key creation.

After absence is confirmed, a guarded mutation advances the generation and marks the row ready for an explicit initialization retry. The recovery action does not issue a replacement key. The next initialization claims one issuance using `ConvexPress <credential ID> attempt <generation>`. Old issuance commits/rejections carry their generation and cannot modify the new attempt. Old recovery completions carry a lease and cannot clear a replacement generation. Even a late old deletion addresses only the old name.

If the deletion response is lost, state remains `recovering`. After the lease waiting period, the operator can repeat recovery: it lists the same old name again and, if absent, finishes without another deletion. Other key names are never deleted. Recovery is capped at 100 generations, and provider key listings are capped at 1,000 rows with the shared response-size and request-time limits. No blanket retry or ready-key rotation was added.

## Calls and changed files

- `hosting/deploymentCredentials:recoveryStatus({instanceId})`: public, authenticated, metadata-only widget query. Returns null for unavailable or unauthorized recovery.
- `hosting/deploy:recoverCredential({instanceId, credentialId, confirmationDeploymentName})`: public operator action returning `{state: "retry_ready"}` after completed recovery.
- `claimRecovery`, `assertRecovery`, and `finishRecovery`: internal lease/identity guards. Existing issuance `claim`, `commit`, and `rejected` now carry a generation fence.
- `schema/hosting.ts`: only the credential table gained optional generation/lease fields and `recovering` state.
- `DeploymentCredentialRecovery.tsx`: accessible confirmation form, wait/status/error states; embedded beside initialization in `CloudEnvironmentsPanel.tsx`.
- Shared `packages/runtime-clients/src/hosting-provider.ts`: `ConvexCloudApi.listDeployKeys` validates numeric IDs and bounded metadata; `deleteDeployKeyByName` accepts only the ConvexPress receipt-name format. The control-plane `providerApi.ts` re-exports the shared provider implementation after the concurrent provider-module move.

## Verification

Seven new actual-handler regression tests first failed because recovery was absent, then passed after implementation. They cover exact orphan deletion and unrelated-key preservation, eligibility, confirmation, duplicate names, revoked permissions, concurrent claims, generation fencing, abandoned worker fencing, uncertain deletion recovery, required absence, changed team/project, and live-operation denial. Existing ready-cache, credential encryption/AAD, no-duplicate issuance, customer denial, and account-revocation tests remain green.

- Hosting provision/credential handlers: 27 passed, 114 assertions.
- Full control-plane suite at this checkpoint: 183 passed, 666 assertions across 36 files.
- Control-plane and Admin web TypeScript: passed.
- `git diff --check`: passed.

Browser rendering and live Convex key recovery remain untested here. Root owns the running app and deployment acceptance. No deployment, browser operation, commit, push, or live provider mutation was performed by this subtask.
