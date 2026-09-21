# Native Clerk Apply and redeploy acceptance

September 20, 2026, local date. The actual Electron **Apply to deployment and redeploy** flow passed against the disposable generated Community Events installation on `http://192.168.1.246:4860`. This closes that native workflow gap from the customer/preview acceptance report. It does not establish packaged clean-machine or cloud-hosting acceptance.

## Setup and source selection

The generated backend's existing sealed snapshot contains 1,628 files. A separate desktop was built beside it from the current worktree's Electron source, its real `tsup.config.ts`, and shared runtime-clients/site-contract packages. Electron PID 75018 ran this desktop with an isolated profile and the generated Admin renderer on 4335. Consequently `resolveBackendRoot` selected the generated backend, not the ordinary product checkout. Source manifests and exact paths are recorded in `output/native-clerk-deploy-20260920/native-fixture.json`.

Before testing, staging was exported including file storage to a private backup. Its complete environment configuration was also retained privately. Only the existing Clerk issuer environment variable was temporarily removed to exercise the real mismatch → Apply workflow. The site has no active customer test user after the previous acceptance cleanup. No new Clerk application was created.

An initial test-fixture launch failed because my snapshot omitted the shared workspace source and the desktop's bundler configuration. Completing that fixture with the existing product files fixed the launch; no product repair is claimed. The freshly built desktop used the normal bundler configuration that inlines shared TypeScript packages.

## Observed native workflow

The operator signed into the actual Electron window and opened the Clerk integration page. Clicking the normal Apply button once used the saved control-plane connection to resolve the staging deployment credential. The native deployment journal recorded:

1. Environment variables written through protected temporary files.
2. Extension index generation and media-writer coverage check.
3. Convex deployment with schema validation.
4. Resumable media deletion-safety completion: 29 of 29 content groups, 2,463 indexed records.
5. Successful completion after 53 seconds, with no live child process remaining in the journal.

The integration page rendered **Done** and **In sync**. Its final backend readiness reports a matching issuer and `loginReady: true`; the unclaimed development application and optional profile-sync webhook remain warnings. A cropped screenshot of the deployment section was inspected.

Four running deployment child processes were sampled. Their process arguments contained neither the deployment admin key nor the Clerk values, and no `--admin-key` flag reached those sampled processes. The final journal was also checked for these secret values. The shared `resolveProvisioningCommand` already normalizes admin credentials into the child environment; no additional credential-transport change was needed. This is scoped evidence, not a claim that every possible process/log path has been audited.

## Preservation and checks

- All environment variables match the complete pre-test baseline, including the restored Clerk issuer.
- All 1,628 backend snapshot files remain byte-identical after native code generation/deployment.
- Before/after exports prove all 45 existing post/page documents unchanged.
- The existing generated RSVP page remains draft revision 5, generated plugin enablement remains disabled, and the synced-content index is ready.
- Six runtime/process tests passed with 23 assertions: credential normalization, packaged command selection, invalid payload handling, child timeout/cancellation, bounded output and process-receipt failures.
- The operator signed out, exact temporary controller trusted-origin configuration was restored, and owned Electron/Vite processes stopped. Original Electron 39198, Admin 69634, SSH 68390 and BlockDemo 8172 remain alive. Main checkout is unchanged.
- One MagicTables Features Notes update was dry-run with zero creates, then applied after a fresh comparison. All 15 feature rows were read back; other cells and completion flags are unchanged.

Receipts and the reviewed screenshot are under `output/native-clerk-deploy-20260920/`, notably `deployment-result.json`, `native-verified.json`, `environment-restored.json`, `preservation.json`, `native-deploy-complete.png`, and `mt-verified.json`. Secrets and raw environment backups remain outside the repository. This pass adds acceptance evidence and no product-source changes.

The remaining scope includes complete template/block/kit workflows, live CAPTCHA and production authentication/webhooks, cloud hosting/domains, clean-machine packaging, recovery/backup gates and integration. A05/B08 remain the only fully accepted original audit rows; the production goal remains active.
