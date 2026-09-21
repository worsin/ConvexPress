# Website publication requires rendered public runtime verification

Source checkpoint, 2026-09-05. No provider calls, native/browser operations, or deployments were made by this implementation agent.

## Confirmed defect and repair

`hosting/websitePublish.confirm` previously checked Cloudflare script tags, plaintext runtime bindings and enabled subdomain, then called `websiteReleases.complete`, which unconditionally wrote `succeeded` / `Published`. Desktop returned success after that action. No request reached the public Website runtime, so a Worker that uploaded successfully but threw HTTP 500/Cloudflare 1101 was reported as published.

The updated desktop publisher writes `CONVEXPRESS_RELEASE_ID` and `CONVEXPRESS_ARTIFACT_HASH` alongside the existing instance/runtime bindings. The provider adapter reads only the allowlisted public plaintext bindings. Content agent's matching Website build wrapper preserves the actual SSR response status/body and adds `x-convexpress-instance`, `x-convexpress-release` and `x-convexpress-artifact` from those bindings.

CP confirmation now derives the only permissible probe origin by comparing the persisted instance origin with the authenticated Cloudflare account subdomain and bound Worker name. It anonymously requests `/` and canonical `/document-preview/`, refuses redirects, and requires HTTP 200, `text/html`, a fully consumed HTML document and all three exact identity headers. Each response is capped at 2 MiB and six seconds including streamed body reads. The two routes run in parallel, at most three attempts with 250/500 ms backoff: at most six page requests and 18.75 seconds of probe waiting. Provider API operations retain their existing independent bounds. The probe never accepts arbitrary caller URLs/paths or sends provider tokens, cookies or authorization headers.

After public reads, CP rechecks current Worker ownership/tags/bindings, current target permissions, lease, provider-account revision and credential generation. The internal completion mutation requires fresh evidence bound to the exact release, artifact, instance and site origin, with both fixed route results. Only matching successful evidence can mark the release succeeded.

## Failure and recovery behavior

- A failed public check records `uncertain`, a clear uploaded-but-unverified phase, bounded `runtimeVerification` evidence, and a retained `runtimeFailure`. These contain only expected public identities, route paths, HTTP statuses, bounded byte counts and closed error codes; no response bodies, arbitrary transport errors or credentials.
- Desktop interruption is idempotent and preserves a recorded runtime failure rather than replacing it with generic interruption text. A successful retry retains the prior failure evidence alongside the latest successful result.
- Retrying the same artifact acquires a fresh lease on the same durable release. Matching provider metadata makes desktop skip asset and Worker upload; it reenables/verifies the address and reruns public checks.
- A genuinely broken artifact can be replaced through a new authorized publish only after a recorded runtime failure and no active lease. The prior receipt remains intact. An ambiguous upload without runtime evidence still requires reconciliation using its original artifact/settings.
- Desktop never resolves publication or emits its success progress message after failed CP confirmation. Its existing IPC path propagates that rejection and records interruption.

## Verification

`bun test packages/control-plane/convex/hosting/__tests__ packages/desktop/electron/hosting/publish.test.ts packages/desktop/electron/ipc/websitePublish.test.ts`: **91 tests, 522 assertions passed** (`/tmp/website-runtime-hosting-tests.log`). Coverage includes actual registered action/mutation behavior, HTTP 500 despite matching provider metadata, wrong release/instance evidence, provider-origin mismatch, expired/missing-route evidence, durable failure and interruption, same-release recovery, corrected-artifact replacement, forbidden foreign Worker writes, revoked accounts and credential rotation. Pure protocol tests also exercise body/header timeout, oversize cancellation, redirect refusal, JSON health responses and eventual readiness. Existing provider/account/lease/IPC regressions remain green.

CP, Electron (`tsconfig.electron.json`) and Admin web typechecks passed. CP bindings generated and checked: 115 modules, two components. Global `git diff --check` passed. No site API or Website contract generation was performed by this slice. Owned source files were formatted with the installed TypeScript formatter; the shared provider adapter change remains a narrow allowlist addition.

## Deployment contract and limits

Deploy the CP verifier and use the updated desktop publisher with a freshly built Website artifact containing the response-header wrapper. Site Convex backend deployment is not required by this change. Root owns deployment and actual native/public acceptance. Old Worker artifacts lacking response headers are deliberately unverifiable; old desktop clients lacking release/artifact bindings fail closed. Historical succeeded receipts without evidence are retained as historical records, not retroactively presented as freshly verified. A pre-upgrade unfinished upload missing the new binding contract requires explicit operator reconciliation; this patch does not invent proof or silently rewrite it.

This gate proves two bounded public SSR paths at publication time. It is not browser hydration, every dynamic page, authenticated preview content, ongoing monitoring or an automatic rollback. No synthetic health endpoint substitutes for real page rendering. Cloudflare can still change after the final bounded observation; the receipt records exactly when and which release was observed.


Root live publication acceptance: deployed the fixed CP snapshot with full type/schema validation, rebuilt desktop main/preload, and relaunched the exact same acceptance profile. The operator session and selected Aster staging environment survived. Normal native Publish website produced release `nx72cynx65z4mdxwx85j9r9wwn8dv3n3`, artifact `e5e337156e6a1241964ac6e1d99e01f9746f3a883ebac3abcaf1d3b738e2e499`. CP persisted result:verified on attempt1 with exact site/instance/release/artifact and both real SSR routes: `/`200/48,741bytes, `/document-preview/`200/31,094bytes. The native UI rendered “Published; public pages verified.” The first new-protocol live happy path is accepted; controlled live failure/retry cases and other providers remain separate gates. Root reapplied only the development preview parent-origin binding after publication, preserving runtime identity bindings and release tags. Evidence: `output/aster-house/canonical-native/acceptance.json`, CP snapshot/deployment under `output/control-plane-checkpoints/runtime-publication-20260905`.
