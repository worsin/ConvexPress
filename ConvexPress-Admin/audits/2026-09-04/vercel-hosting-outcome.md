# C01 Vercel provider and artifact outcome

Implemented and locally verified on 2026-09-04 in `codex/convexpress-hardening`. This covers the provider adapter and deployable website artifact. No Vercel account resources were created or deployed during this work. The desktop's durable hosting orchestration and its product UI remain the caller's integration responsibility.

## Artifact and runtime contract

Run `node ConvexPress-Website/scripts/build-vercel-hosting.mjs --output <fresh-directory>`. Add `--skip-build` only when consuming an already validated website `dist` build. The script refuses an existing output directory to prevent mixing stale files into a deployment.

The artifact contains Build Output API version 3 `config.json`, static assets, and `functions/ssr.func/index.mjs` with `.vc-config.json`. It packages the existing TanStack SSR handler into a self-contained Node 22 function, preserves streaming and cookies, and routes static files before the SSR fallback. It rejects native DOM/canvas dependencies and symlinks, omits source maps and environment files, and limits each file to 25 MiB, the artifact to 250 MiB, and inventory to 10,000 files. Those are application limits, not a claim about every Vercel plan's quota. Configuration follows Vercel's [Build Output API primitives](https://vercel.com/docs/build-output-api/primitives) and [routing configuration](https://vercel.com/docs/build-output-api/configuration).

The adjacent `<directory-name>.manifest.json` is orchestration metadata and is not served. Each entry has `file`, `sha` (SHA1 for provider upload), `sha256`, and `size`. `file` uses the `.vercel/output/` prefix; resolve the suffix beneath the manifest's `outputRoot` when reading bytes. Verify both digest and size before uploading a previously stored artifact. Supply the returned upload descriptors unchanged to `createDeployment`.

Required public runtime bindings are `CONVEXPRESS_CONVEX_URL`, `CONVEXPRESS_INSTANCE_KEY`, and `CONVEXPRESS_SITE_URL`. The optional management origin must exactly correspond to that Convex cloud database. A function process captures one target at startup and returns 503 for absent, invalid, or changed target identity. Incoming host headers cannot change the configured public origin. Request bodies and response bodies stream through Node's backpressure-aware adapters, and disconnected responses abort the SSR request. No request mutates process environment.

## Provider caller contract

`VercelApi(token, teamId?, fetchImpl?)` lives in `packages/control-plane/convex/hosting/providerApi.ts`. Public operations take an expected account ID and, where applicable, a project ID. They re-read provider identity and verify resource ownership. Personal accounts do not inherit a team selector.

- `getProject`, `findProject`, and `createProject` provide exact project ownership and name reconciliation. Creation uses the current [POST /v11/projects endpoint](https://vercel.com/docs/rest-api/projects/create-a-new-project).
- `uploadFile({path, bytes, accountId})` hashes bytes and uploads raw content with the SHA1 digest and content length, following [deployment file upload](https://vercel.com/docs/rest-api/deployments/upload-deployment-files).
- `createDeployment({accountId, projectId, files, receiptId, environment, env})` submits the prebuilt output with a stable `meta.convexpressReceipt`. Only the public storefront environment allowlist is accepted. Production uses `target: production`; preview omits it. The [deployment endpoint](https://vercel.com/docs/rest-api/deployments/create-a-new-deployment) and Vercel's [current prebuilt query construction](https://github.com/vercel/vercel/blob/main/packages/client/src/utils/query-string.ts) inform the request shape.
- `getDeployment`, `listDeployments`, and `findDeploymentByReceipt` support recovery. Listings have bounded pagination and reject ambiguous receipts. Detail reads verify the project and deployment identity before returning status or a provider URL.
- `waitForDeployment` has bounded attempts, intervals, and an overall deadline of at most ten minutes, plus optional cancellation. Exhaustion preserves the existing deployment ID for a later poll. Terminal failures do not create another deployment.
- `getProjectDomain`, `addProjectDomain`, and `verifyProjectDomain` verify project ownership and return provider verification requirements. They do not write DNS. See [add project domain](https://vercel.com/docs/rest-api/projects/add-a-domain-to-a-project) and [verify project domain](https://vercel.com/docs/rest-api/projects/verify-project-domain).

The shared transport has a 60-second per-request timeout, rejects redirects, reads at most 8 MiB of provider JSON, redacts provider response bodies from errors, and never retries writes. Overall polling deadlines return promptly even if an in-flight provider read is still finishing; that read remains under the shared request timeout and cannot trigger another read after cancellation.

Before calling creation, persist the account, instance, intended project name, artifact checksums, environment, and receipt ID. Claim the step atomically and reauthorize current operator scope before provider writes. On an uncertain write, reconcile by stable project name or deployment receipt rather than issuing a duplicate. A definitive rejection may be retried after the operator corrects configuration. Keep confirmed project/deployment ownership immutable and prevent another website from adopting it. These durable caller rules are not implemented by the stateless provider adapter itself.

Use a separate provider project per independently hosted environment when both live and staging need stable custom domains through the current domain methods. Preview deployments alone do not establish a stable staging-domain workflow. Custom-domain propagation and final rendered site acceptance require actual provider testing.

## Verification

- `bun test convex/hosting/__tests__/vercel.test.ts`: 9 passed, 34 assertions. Covers team and personal account scope, project mismatch, file hashing, prebuilt request, error redaction, uncertainty without retries, cancellation, deadline, ambiguous receipts, terminal states, domains, and oversized response cancellation.
- `node --test ConvexPress-Website/scripts/vercel-runtime.test.mjs ConvexPress-Website/scripts/build-vercel-hosting.test.mjs`: 5 passed. Exercises actual Node HTTP requests, request/response streaming, body/query/status/cookies, HEAD handling, missing/changed target rejection, self-contained function output, artifact inventory, and symlink rejection.
- Full control-plane `bun run test`: 168 passed, 0 failed, 589 assertions across 34 files.
- Control-plane TypeScript and `git diff --check`: passed.
- Current website artifact built locally from existing `dist`: `/tmp/convexpress-vercel-artifact-20260904-v2/output`, 141 files, 8,610,910 bytes. Its bundled function loaded outside the workspace and served the expected configuration-required 503 through an actual local Node HTTP server.

The last check proves that the real SSR artifact loads without workspace dependencies. It does not prove a configured Vercel deployment or rendered pages against a live database. No browser, provider write, deployment, commit, or push was performed for this scope.
