# C01 — Desktop Cloudflare website publishing

Implemented in the isolated hardening worktree. Root owns provider deployment, native restart, real Aster House publication and browser acceptance. This source batch made no live provider requests or browser operations.

## Concrete design

An agency owner/admin selects the Cloudflare account in the environment's **Publish website** panel. The panel checks `connection.manage`, `site.deploy`, and `environment.live.operate` for live environments. The backend repeats these checks using current organization/business/website/instance/account records. Live publication also requires an explicit checkbox. Provider credentials use the existing encrypted hosting account store; only desktop main requests the scoped authenticated credential action. Provider tokens, asset JWTs and release lease tokens are never sent to the renderer, logged, persisted in desktop journals, or passed to subprocess arguments.

The first release creates an immutable instance/account/Worker binding and a durable receipt containing the full artifact SHA256, confirmed deployment/site origins, instance key, optional Clerk public key, initiating operator and renewable lease. Another environment cannot claim the same provider account/Worker. Active leases reject parallel releases. Interrupted uploads retain an uncertain receipt and must reconcile with the original artifact/settings; a stale lease cannot continue after a newer attempt or account revision. Each upload checkpoint rechecks current access, account revision and environment identity. The authorized initiating operator can record interruption after revocation without receiving further provider authority.

Desktop main selects the artifact from the fixed worktree Website `apps/web/dist` path in development, or the packaged `website-hosting` resource. IPC accepts no filesystem path. The loader validates worker checksum, bounded asset count/size, real paths, traversal, symlinks, source-map exclusion, duplicate hash consistency and total 250 MiB cap. The receipt includes SHA256 of every actual asset byte sequence alongside the build's Wrangler-compatible BLAKE3 identities. Asset bucket requests are checked against this exact in-memory artifact. Provider operations are finite, cancellation-aware, and never automatically retried after an uncertain write.

Before upload, the provider identity and workers.dev subdomain must match the registered target. A preexisting Worker must carry exactly this instance's ownership tag; untagged or foreign Workers are rejected. The script receives instance/release/artifact tags and only four public runtime bindings: Convex URL, instance key, public site URL and optional Clerk publishable key. An uncertain upload is reconciled by tags without repeating asset/script writes. Reconciliation and final completion also compare the four public runtime bindings with the receipt. Metadata projection omits all secret bindings and every unrelated plain-text value. Completion independently verifies the enabled Worker subdomain before recording success.

The renderer shows bounded progress, cancellation and reactive durable status. A local error boundary isolates missing control-plane functions, permission/query errors, and deployment rollout mismatch from the rest of Sites; it offers a scoped retry. Async publication failures remain local. Lease expiration refreshes the panel so an abandoned release can be reconciled.

## Shared compilation and packaging

The canonical provider implementation now lives in `packages/runtime-clients/src/hosting-provider.ts`; control-plane `hosting/providerApi.ts` is a thin Node re-export and desktop imports the shared package subpath. This preserves the Cloudflare/Vercel/Convex adapters, including key-recovery methods, without crossing desktop's TypeScript root directory or duplicating transport code. Desktop tsup explicitly bundles the shared implementation so the installer does not require workspace TypeScript files.

`prepare-hosting.mjs` copies only the built manifest, Worker and declared client assets into the dedicated generated resource and records SHA256 checksums. Native packaging invokes this preparation and the existing beforePack hook verifies its checksums. Electron extraResources includes the prepared storefront. Preparation successfully copied 140 files from the current generic storefront. This generated resource is ignored in Git.

## Verification

- Integrated control-plane hosting handlers/adapters, desktop artifact/upload pipeline, IPC sender boundaries and local UI failure boundary: **73 pass, 0 fail, 297 assertions across 11 files**.
- Coverage includes cross-business/member denial, explicit live capability denial, concurrent lease rejection, immutable binding, stale/revoked account fences, runtime identity drift, foreign Workers, unexpected asset hashes, cancellation, uncertain-write reconciliation, no secret projection, wrong-runtime rejection despite matching tags, and enabled-address confirmation.
- Desktop scoped TypeScript check passes. Final integrated control-plane, Admin, desktop main and preload TypeScript checks all pass (exit 0) after the runtime-binding verification change.
- Temporary main/preload native bundles build successfully and do not retain a runtime require for the workspace provider subpath. No native process was started by this agent.
- `git diff --check` passes. Root must refresh CP and native bundle after the final runtime-binding verification change before publishing.

## Root acceptance script and remaining scope

1. Deploy the refreshed fleet control plane and rebuild/restart the native app. Confirm the rest of Sites remains usable if publishing status is temporarily unavailable.
2. In the staging Aster environment, select the matching Cloudflare account. Verify registered workers.dev origin and inferred Worker name. Provide the environment's public Clerk key only if Clerk is enabled.
3. Publish, observe asset/Worker progress, and confirm a durable succeeded receipt. Open the exact public origin and prove authored content, assets, runtime identity, and staging database isolation.
4. Exercise cancellation/reconciliation on an authorized disposable attempt; confirm a tagged existing release is reused rather than uploaded twice. Confirm a foreign or untagged Worker is rejected without replacement.
5. Publish live only with explicit live confirmation and prove the live site reads the separate live database.

This bounded release supports registered **workers.dev** origins. Custom-domain zone selection/attachment and a Vercel desktop publishing UI remain explicit follow-up work; this implementation does not change DNS. It does not silently adopt existing untagged Workers.

## Acceptance repair: self-hosted control-plane origin

Root's real staging attempt stopped before receipt creation because the initial main-process preflight required HTTPS for every control-plane origin. The accepted self-hosted control plane uses a private LAN HTTP origin reached through a development SSH tunnel. Two actual IPC handler regressions reproduced the rejection before repair.

`websitePublish` and existing `siteDeploy` now share a pure configured-origin mapper using the existing private-network-aware `parseDeploymentOrigin`. Both original and mapped destinations are validated; public HTTP, credentials and URL paths are rejected. The exact trusted environment mapping applies only in development and is ignored in packaged builds. Actual IPC tests prove the LAN origin reaches the correct loopback tunnel in development and stays on its registered LAN address in packaged mode. Missing configuration, malformed origin/mapping, and missing/corrupt artifacts now produce distinct fixed, typed preflight errors without exposing underlying paths or secrets.

Focused actual publishing IPC, existing deployment IPC and sender-boundary regressions: **5 pass / 15 assertions / 3 files**; desktop TypeScript and diff checks pass. No control-plane schema/function change is needed; root must rebuild/restart the native main process before retrying. This agent did not perform that restart or a live publication.
