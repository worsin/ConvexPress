# ConvexPress: under-the-hood audit and repair backlog

Date: September 4, 2026. Scope: broad, read-only platform audit of `/Users/worsin/Development/ConvexPress`, with local tests and synthetic handler probes. This is a first pass across major boundaries, not exhaustive certification of every plugin or a production penetration test.

## Product boundary

ConvexPress is a CMS plus an agency control plane. One desktop application manages multiple organizations, businesses within each organization, and websites within each business. Each website/environment points to its own isolated Convex deployment. Customers use the same desktop application with authorization restricted to their own portfolio. Public website customers and outer control-plane operators remain separate identity populations.

The target launch workflow is provider account → isolated site database → storefront deployment → domain → verification, repeatable across dozens of sites. Client access to an existing site and authority to provision infrastructure are separate capabilities that should be explicit.

Fable is actively implementing templates and the storefront SDK. Template coverage, variants, plugin navigation and pack completeness are deferred to that effort. Findings here target underlying contracts and lifecycle behavior; the revision and public-data fixes need coordination with Fable's new view models.

## Assessment

The platform has substantial working infrastructure: separate data and control planes, signed site management, connection identity checks, granular permissions, backup/restore workflows, and thousands of passing tests. The important gaps are at the joins between systems: public projections versus access rules, grants versus issued sessions, commerce actions versus lifecycle side effects, and a development checkout versus a distributable operator application.

I would close access and data-correctness findings before onboarding a fleet of client sites. There is no defensible overall readiness percentage from this pass: deployment, real browser/Electron behavior and provider transactions were not re-exercised.

## Verification and provenance

| Check | Current result |
|---|---|
| Admin configured unit suite: `bun run test` | **2,282 pass, 0 fail**, 177 files |
| Website source suite: `bun test apps/web/src` | **451 pass, 0 fail**, 23 files |
| Direct TypeScript check: Admin web | Pass |
| Direct TypeScript check: site backend | Pass |
| Direct TypeScript check: control plane | Pass |
| Direct TypeScript check: Website web | Pass |
| Admin guardrails | Pass, including the problematic API-type shim requirement |
| Admin static smoke | Pass: 479 generated routes, 134 navigation targets |
| Synthetic actual-handler probes | Reproduced post payload leakage, customer draft/password page access, protected feed content, block-only revision skipping |
| Synthetic helper/module probes | Reproduced omitted coupon-context bypass, development-origin acceptance, auth write-queue failure |
| New production builds, rendered acceptance, deployment/provider tests | Not run during Fable's active changes |

Logs are alongside this document: [admin tests](./admin-tests.log), [website tests](./website-tests.log), [admin types](./admin-typecheck.log), [backend types](./backend-typecheck.log), [control-plane types](./control-typecheck.log), [website types](./website-typecheck.log). Typecheck logs are empty on successful exit. Additional helper tests run during review are subsets of the main suites and are not added to the totals.

The initial HEAD was `ca80ddf1be616a8cb9a4c5fb635c9ea4acf82a3b`; it moved to `aea20f879c744e57cda230cd7ca10b37c4b7485d` during concurrent work. Source references were checked against the working tree. Findings and test results describe the inspected interval, not an immutable final Fable commit. No source/configuration changes, commits, pushes, deployment mutations, or external messages were made by this audit. The report is outside the repository because its active stop hooks stage and publish working-tree changes.

## Prioritized repair list

P1 = close before affected client functionality goes live. P2 = reliability/polish or a conditional lower-impact defect. Feature gaps and capacity risks are explicitly labeled below. Suggested effort is relative: S = localized, M = several connected paths, L = architectural or provider integration. Sequence follows consequence and dependencies, not a numerical readiness score.

### Access and client isolation

**A01 · P1 · Public post/page responses expose protected fields — confirmed; M**

`posts.getPublished` spreads a complete stored post and only removes `content`. Password, blocks and autosave fields survive. The membership-denied projection repeats that pattern; generic get and published-list responses expose similar fields. These are public function responses consumed by the Website, including SSR.

Evidence: [posts/queries.ts:439](/Users/worsin/Development/ConvexPress/ConvexPress-Admin/packages/backend/convex/posts/queries.ts:439), [membership-denied branch:464](/Users/worsin/Development/ConvexPress/ConvexPress-Admin/packages/backend/convex/posts/queries.ts:464), [published list:759](/Users/worsin/Development/ConvexPress/ConvexPress-Admin/packages/backend/convex/posts/queries.ts:759), [pages projection:513](/Users/worsin/Development/ConvexPress/ConvexPress-Admin/packages/backend/convex/pages/queries.ts:513). A synthetic anonymous invocation of the real `posts.get` handler returned password, protected blocks and unpublished autosave while withholding only legacy content.

Repair: introduce allowlisted public content DTOs and one access-aware projection covering every content representation. Keep stored passwords and editor autosaves out of public responses entirely. Acceptance: protected marker text and secret fields are absent from anonymous/denied-member get, list, sticky, password-verification and SSR payloads; authorized reading still works.

**A02 · P1 · Customer login is treated as editorial authority — confirmed; S/M**

[pages/queries.ts:274](/Users/worsin/Development/ConvexPress/ConvexPress-Admin/packages/backend/convex/pages/queries.ts:274) sets `isAdmin = !!user`. Clerk customers resolve as users, so a subscriber can pass draft/password guards. Synthetic calls to the real handler returned both an ordinary draft and a password-protected page to a subscriber without editorial capabilities.

Repair: require explicit ownership-aware editorial capabilities for previews. Acceptance: customer/subscriber cannot read drafts or bypass passwords by ID, slug or path; authorized editor preview remains functional.

**A03 · P1 · Alternate publishing channels bypass protection — confirmed; M**

Feeds return published content without visibility/membership filtering. Search indexes body text and produces excerpts with status-only filtering. The configured homepage returns a whole published page and the Website marks it not password protected.

Evidence: [feeds/queries.ts:229](/Users/worsin/Development/ConvexPress/ConvexPress-Admin/packages/backend/convex/feeds/queries.ts:229), [search indexing:131](/Users/worsin/Development/ConvexPress/ConvexPress-Admin/packages/backend/convex/search/internals.ts:131), [search filtering:126](/Users/worsin/Development/ConvexPress/ConvexPress-Admin/packages/backend/convex/search/queries.ts:126), [homepage:865](/Users/worsin/Development/ConvexPress/ConvexPress-Admin/packages/backend/convex/pages/queries.ts:865). A synthetic anonymous feed call returned a password-protected body.

Repair with A01's common policy, including authorization against the source record when an index may be stale. Acceptance: a unique protected marker never appears in anonymous feed output, search snippets, homepage HTML or serialized data after visibility changes.

**A04 · P1 · Disabling a parent does not disable site access — confirmed source path; M**

The site broker checks active connection, website and environment, but not active organization/business. Context queries hide children of inactive parents; direct session exchange still evaluates existing grants against those children. Organization/business disable mutations do not revoke existing site sessions.

Evidence: [siteBroker/internal.ts:68](/Users/worsin/Development/ConvexPress/ConvexPress-Admin/packages/control-plane/convex/siteBroker/internal.ts:68), [organizations.ts:98](/Users/worsin/Development/ConvexPress/ConvexPress-Admin/packages/control-plane/convex/organizations.ts:98), [businesses.ts:151](/Users/worsin/Development/ConvexPress/ConvexPress-Admin/packages/control-plane/convex/businesses.ts:151).

Repair: enforce active, consistent ancestors in a shared target resolver; revoke descendant sessions on disable. Acceptance: an already-connected client loses old-token access and cannot exchange a new token using a remembered connection ID; a sibling client's site remains usable.

**A05 · P1 · Permission reassignment misses the previous holder — confirmed source path; S**

[rbac/mutations.ts:202](/Users/worsin/Development/ConvexPress/ConvexPress-Admin/packages/control-plane/convex/rbac/mutations.ts:202) replaces a permission subject and revokes sessions only for the new subject. A previous holder's issued site session can survive up to its 15-minute lifetime.

Repair: invalidate both old and new affected principals; handle role-to-user changes with appropriately broad invalidation. Acceptance: move an active permission A → B while A has an issued session; A's old token must stop working within the documented revocation bound.

**A06 · P1 · Permission truncation can discard explicit denies — confirmed algorithmic condition; M**

[rbac/runtime.ts:160](/Users/worsin/Development/ConvexPress/ConvexPress-Admin/packages/control-plane/convex/rbac/runtime.ts:160) takes only 500 direct permission rows and [line 184](/Users/worsin/Development/ConvexPress/ConvexPress-Admin/packages/control-plane/convex/rbac/runtime.ts:184) only 500 global rows per action. Overflow is neither detected nor paginated. A matching role deny after earlier unrelated rules can disappear before deny-first evaluation. This is not a demonstrated current fleet-size incident.

Repair: query all relevant active subject/role rules through tighter indexes, or fail closed on overflow. Acceptance: 500 earlier irrelevant/inactive rules plus a later applicable role deny must still deny. Benchmark request-level authorization loading with dozens of websites/environments; current context resolution repeatedly reloads the same authorization data.

**A07 · P1 conditional · Packaged desktop trusts the development origin — reproduced helper; S**

[setupSender.ts:64](/Users/worsin/Development/ConvexPress/ConvexPress-Admin/packages/desktop/electron/ipc/setupSender.ts:64) accepts development OR packaged origins. Production navigation and auth IPC use this helper: [window-manager.ts:118](/Users/worsin/Development/ConvexPress/ConvexPress-Admin/packages/desktop/electron/window-manager.ts:118), [ipc/auth.ts:55](/Users/worsin/Development/ConvexPress/ConvexPress-Admin/packages/desktop/electron/ipc/auth.ts:55). The helper accepts `http://localhost:4105/untrusted.html`.

Exploitation requires attacker-controlled content on the trusted loopback origin and navigation of the privileged Electron window there; an ordinary browser tab has no IPC bridge. Full navigation exploitation was not attempted.

Repair: use packaged-only validation in production. Acceptance: production navigation and every sensitive IPC handler reject localhost/dev/remote URLs, while the legitimate bundled renderer remains allowed.

**A08 · P2 · Permission status changes bypass owner protection — confirmed conditional path; S**

[rbac/mutations.ts:226](/Users/worsin/Development/ConvexPress/ConvexPress-Admin/packages/control-plane/convex/rbac/mutations.ts:226) permits a platform RBAC administrator to reactivate an existing disabled owner-targeting deny. The owner protection used in permission upsert is absent. Requires an existing matching deny; this is not arbitrary permission creation.

Repair: share owner protection across create/update/status changes. Acceptance: non-owner administrators cannot activate a disabled deny against the owner user or owner role.

### Commerce, publishing and recovery

**B01 · P1 · Failed payment creation leaves checkout stuck — confirmed source path; M**

Before Stripe/PayPal creates a provider transaction, failure handling passes the local transaction ID to a mutation that searches only the provider-ID index. Nothing is marked failed. Retry finds the pending row and reuses it without scheduling a new attempt.

Evidence: [paymentActions.ts:104](/Users/worsin/Development/ConvexPress/ConvexPress-Admin/packages/backend/convex/commerce/paymentActions.ts:104), [failure lookup:926](/Users/worsin/Development/ConvexPress/ConvexPress-Admin/packages/backend/convex/commerce/payments.ts:926), [retry:392](/Users/worsin/Development/ConvexPress/ConvexPress-Admin/packages/backend/convex/commerce/payments.ts:392).

Repair: separate local-transaction failure from webhook provider-ID resolution; update transaction/session/collection coherently. Acceptance: force pre-creation failure, observe usable error and failed state, fix configuration, then successfully retry with a new attempt.

**B02 · P1 · Refund screens disagree about pending refunds — confirmed source path; M**

The ordinary payment refund treats anything except provider `succeeded` as failure. The returns refund path ignores provider status and marks success. The reviewed webhook switch logs `charge.refunded` without reconciling asynchronous refund transitions.

Evidence: [paymentActions.ts:298](/Users/worsin/Development/ConvexPress/ConvexPress-Admin/packages/backend/convex/commerce/paymentActions.ts:298), [return path:649](/Users/worsin/Development/ConvexPress/ConvexPress-Admin/packages/backend/convex/commerce/paymentActions.ts:649), [unconditional success:714](/Users/worsin/Development/ConvexPress/ConvexPress-Admin/packages/backend/convex/commerce/paymentActions.ts:714), [http.ts:721](/Users/worsin/Development/ConvexPress/ConvexPress-Admin/packages/backend/convex/http.ts:721).

Repair: shared pending/terminal refund state machine, stored provider IDs and idempotent event reconciliation. Acceptance: pending → succeeded/failed, duplicates and reordered events through both entry points produce identical balances, return state and entitlement effects.

**B03 · P1 · Bulk order actions skip lifecycle side effects — confirmed source path; M**

[orders.ts:541](/Users/worsin/Development/ConvexPress/ConvexPress-Admin/packages/backend/convex/commerce/orders.ts:541) and [line 574](/Users/worsin/Development/ConvexPress/ConvexPress-Admin/packages/backend/convex/commerce/orders.ts:574) primarily patch order status/history. The [single-order path:776](/Users/worsin/Development/ConvexPress/ConvexPress-Admin/packages/backend/convex/commerce/orders.ts:776) also handles payment/fulfillment state, inventory and digital fulfillment. Bulk cancellation can leave stock depleted; bulk paid/fulfilled status can disagree with payment or fulfillment fields.

Repair: one shared idempotent transition service for individual and bulk operations. Acceptance: equivalent fixtures transitioned individually and in bulk have identical inventory, payment, fulfillment, entitlement and history results.

**B04 · P1 · Customer-specific coupon restrictions are bypassed — reproduced engine/caller mismatch; M**

Cart application/recalculation invokes the discount engine without customer context; the engine skips email/new-customer/per-user restrictions when context is absent. Checkout carries the discounted amounts forward.

Evidence: [cart.ts:914](/Users/worsin/Development/ConvexPress/ConvexPress-Admin/packages/backend/convex/commerce/cart.ts:914), [recalculation:283](/Users/worsin/Development/ConvexPress/ConvexPress-Admin/packages/backend/convex/commerce/cart.ts:283), [discountEngine.ts:166](/Users/worsin/Development/ConvexPress/ConvexPress-Admin/packages/backend/convex/commerce/discountEngine.ts:166). A pure probe accepted a restricted 50% coupon using the cart's two-argument call and rejected it when ineligible customer context was supplied.

Repair: trusted backend context at apply/recalculate/finalize; transactionally enforce limited redemptions. Acceptance: wrong email, returning customer and exhausted user allowance cannot complete the discounted purchase; eligible users can.

**B05 · P1 · Downgrades bill the old price at the boundary — confirmed source ordering; M**

[proration.ts:552](/Users/worsin/Development/ConvexPress/ConvexPress-Admin/packages/backend/convex/commerceSubscriptions/proration.ts:552) schedules a downgrade at period end. Renewal generates invoices from old recurring amounts and only applies due changes after charging: [renewal.ts:102](/Users/worsin/Development/ConvexPress/ConvexPress-Admin/packages/backend/convex/commerceSubscriptions/renewal.ts:102), [line 201](/Users/worsin/Development/ConvexPress/ConvexPress-Admin/packages/backend/convex/commerceSubscriptions/renewal.ts:201). No newly created invoice also means an early return before due changes.

Repair: atomically apply due contract changes before generating the boundary invoice; process due changes independently. Acceptance: $100 → $50 scheduled at period end produces a $50 first renewal, without duplicate billing on repeated sweeps.

**B06 · P1 · Postponing publication leaves the old job active — confirmed source path; S**

[posts/mutations.ts:894](/Users/worsin/Development/ConvexPress/ConvexPress-Admin/packages/backend/convex/posts/mutations.ts:894) schedules a new job and overwrites saved job metadata without cancelling the previous job. [posts/internals.ts:38](/Users/worsin/Development/ConvexPress/ConvexPress-Admin/packages/backend/convex/posts/internals.ts:38) checks only `future` status. Moving 10:00 publication to 11:00 can still publish at 10:00.

Repair: cancel prior work and validate expected schedule generation/deadline inside the handler. Acceptance: fake-clock postpone/advance/unschedule/reschedule/stale-job tests publish exactly once at the current deadline.

**B07 · P1 · Block content is not recoverable through revisions — reproduced actual handler; M**

[revisions/internals.ts:54](/Users/worsin/Development/ConvexPress/ConvexPress-Admin/packages/backend/convex/revisions/internals.ts:54) recognizes only title/content/excerpt changes. Schema and restore omit block data/content mode: [schema/revisions.ts:62](/Users/worsin/Development/ConvexPress/ConvexPress-Admin/packages/backend/convex/schema/revisions.ts:62), [restore:120](/Users/worsin/Development/ConvexPress/ConvexPress-Admin/packages/backend/convex/revisions/mutations.ts:120). The actual revision handler returned `null` for a block-only change.

Repair: version the complete authoring document, including block/version metadata and mode; restore atomically and refresh downstream indexes. Acceptance: change only a block's text/image/layout, restore, and compare both stored and rendered output. Include editor-mode changes. Related follow-up: revision-restored events must refresh search; current listeners do not cover that event.

**B08 · P2 · A failed session write poisons later logout cleanup — reproduced actual module; S**

[auth-storage.ts:64](/Users/worsin/Development/ConvexPress/ConvexPress-Admin/apps/web/src/control/auth-storage.ts:64) and [line 77](/Users/worsin/Development/ConvexPress/ConvexPress-Admin/apps/web/src/control/auth-storage.ts:77) chain writes/removals onto a promise with no rejection recovery. A mocked bridge that failed one write received no subsequent remove call.

Repair: recover queue sequencing while preserving individual error reporting. Acceptance: failed write → successful removal → successful new write, without restarting the renderer or retaining an unwanted saved session.

**B09 · P2 · Free-shipping coupons do not remove shipping — confirmed caller mismatch; S/M**

[discountEngine.ts:269](/Users/worsin/Development/ConvexPress/ConvexPress-Admin/packages/backend/convex/commerce/discountEngine.ts:269) returns `suppressShipping: true`, but cart consumes only monetary discount. [checkout.ts:1208](/Users/worsin/Development/ConvexPress/ConvexPress-Admin/packages/backend/convex/commerce/checkout.ts:1208) checks dynamic-pricing free shipping instead. The accepted coupon message can disagree with the charged total.

Repair: carry validated coupon suppression through quotes, taxes and final order snapshots. Acceptance: paid shipping becomes zero with an eligible coupon and returns when the coupon is removed or invalidated.

### Deployment and agency operations

**C01 · Launch requirement · Provider provisioning/domain workflow is absent — feature gap; L**

[hierarchy schema:186](/Users/worsin/Development/ConvexPress/ConvexPress-Admin/packages/control-plane/convex/schema/hierarchy.ts:186) names Vercel/Cloudflare, but current executable-code searches found no provider adapters. [websiteInstances.ts:184](/Users/worsin/Development/ConvexPress/ConvexPress-Admin/packages/control-plane/convex/websiteInstances.ts:184) expects existing deployment, management and site origins. [siteDeploy.ts:383](/Users/worsin/Development/ConvexPress/ConvexPress-Admin/packages/desktop/electron/ipc/siteDeploy.ts:383) initializes an existing Convex deployment. This is useful groundwork, not account-to-domain provisioning.

Build a provider adapter contract for account/team verification, project creation, isolated backend allocation, deployment-specific environment binding, storefront deployment, domain ownership/DNS/TLS, health proof, rollback and disconnect. Start with one fully accepted provider before multiplying adapters. Both providers have applicable official interfaces: [Vercel REST API](https://vercel.com/docs/rest-api), [Cloudflare TanStack Start deployment](https://developers.cloudflare.com/workers/framework-guides/web-apps/tanstack-start/).

Acceptance: from a clean operator install, create two separate client sites; prove unique database bindings, correct deployed content and domains, retry after a failed intermediate step, then verify each client sees only its own site. Host custom domains must not select arbitrary databases without a verified mapping.

**C02 · P1 for packaged provisioning · Deployment needs a source checkout — confirmed packaging gap; L**

[setup.ts:74](/Users/worsin/Development/ConvexPress/ConvexPress-Admin/packages/desktop/electron/ipc/setup.ts:74) searches local backend source directories and errors if absent. Site initialization then invokes local `node`/`bunx`. [electron-builder.yml:7](/Users/worsin/Development/ConvexPress/ConvexPress-Admin/packages/desktop/electron-builder.yml:7) packages renderer/main artifacts and icons, not that backend source/toolchain.

Repair: choose a managed deployment worker or a verified versioned deploy artifact with a supported runtime. Do not assume an agency developer checkout exists on a customer machine. Existing-site management may work without this; new setup/redeployment is the affected path.

Acceptance: fresh macOS/Windows machine, no repository/Bun/global Node, signed installer only; authorized provision/redeploy succeeds with progress and a deployed-version receipt. An ordinary client role need not be granted provisioning authority.

**C03 · P1 for fleet provisioning · Install state is process-local — confirmed lifecycle gap; M/L**

[siteDeploy.ts:61](/Users/worsin/Development/ConvexPress/ConvexPress-Admin/packages/desktop/electron/ipc/siteDeploy.ts:61) holds active/last run only in module memory; command execution at [line 124](/Users/worsin/Development/ConvexPress/ConvexPress-Admin/packages/desktop/electron/ipc/siteDeploy.ts:124) has no timeout/cancellation mechanism. Relaunch loses run receipts; a hung child can retain the global deploy lock. Initialization mutates env, deploys code, writes identity, then enrolls a connection across separate steps.

Repair: durable run IDs, immutable target identity/version, per-target locking, step receipts, deadlines and reconciliation. Reuse the existing lifecycle workflow approach where appropriate. Acceptance: kill/relaunch after every provisioning step, retry after provider timeout, and prove no duplicate infrastructure, wrong-target deployment or silent partial success.

**C04 · P1 before large-media rollout · Backup/restore has a small-site ceiling — verified limits, unmeasured capacity risk; L**

[snapshotApi.ts:145](/Users/worsin/Development/ConvexPress/ConvexPress-Admin/packages/control-plane/convex/operations/snapshotApi.ts:145) buffers whole exports and caps compressed archives at 512 MiB. Restore buffers source plus target pre-backup, decompresses both into memory, then rezips: [actions.ts:325](/Users/worsin/Development/ConvexPress/ConvexPress-Admin/packages/control-plane/convex/operations/actions.ts:325), [snapshotRestoreArchive.ts:256](/Users/worsin/Development/ConvexPress/ConvexPress-Admin/packages/control-plane/convex/operations/snapshotRestoreArchive.ts:256). It allows up to 1 GiB uncompressed per input while retaining entries. Standard Convex Node actions have 512 MiB RAM, so accepted archive sizes are not evidence that restores fit. Self-hosted limits may differ. [Convex limits](https://docs.convex.dev/production/state/limits).

Repair: streaming/external worker restore pipeline, bounded memory, resumable transfers and capacity preflight. Acceptance: restore realistic media-heavy snapshots at increasing sizes, record peak memory/time and fail before destructive work when unsupported. No exhaustion benchmark was run in this audit.

**C05 · Fleet requirement · Scheduled backups, retention and fleet alerting need an explicit service — feature/verification gap; M/L**

The reviewed control-plane code has real manual/pre-operation snapshots and connection probes. It has no control-plane cron module or discovered recurring backup/retention sweep. This does not prove external infrastructure has no backups; external provider configuration was not inspected. UI backup history is capped without a cursor: [operations/queries.ts:238](/Users/worsin/Development/ConvexPress/ConvexPress-Admin/packages/control-plane/convex/operations/queries.ts:238).

Add/verify per-site schedule, retention, offsite recovery policy, last successful restore drill, deployment/auth/provider health, failed-job alerts and fleet filters. Acceptance: missed backup/provider outage creates an actionable alert, retention preserves required recovery points, old backups remain discoverable, and a scheduled restore drill proves recovery without touching another site's database.

### Verification and maintenance

**D01 · P1 before scaling changes · Frontend/backend contracts lose type checking — confirmed; M/L**

Admin routes map generated API imports to [convex-api-shim.d.ts:11](/Users/worsin/Development/ConvexPress/ConvexPress-Admin/apps/web/src/test-types/convex-api-shim.d.ts:11), which declares `api` and `internal` as `any`; [guardrails:78](/Users/worsin/Development/ConvexPress/scripts/admin/check-admin-guardrails.mjs:78) require this. Website [generated/api.d.ts:24](/Users/worsin/Development/ConvexPress/ConvexPress-Website/packages/backend/generated/api.d.ts:24) uses `AnyApi`. The Admin shim documents TypeScript instantiation-depth problems as its reason; replacing it blindly with the giant generated union would restore that problem.

Repair: smaller generated public/admin contract surfaces or explicit typed function-reference modules, independently verified against backend signatures. Fable's SDK is a natural consumer of a typed public contract, but runtime validators remain necessary. Acceptance: intentionally invalid function names/arguments and mismatched response fields fail CI type/contract checks without TypeScript depth failures.

**D02 · P1 quality gate · CI does not run the unit suites — confirmed; S/M**

[Admin workflow:37](/Users/worsin/Development/ConvexPress/.github/workflows/admin-quality.yml:37) checks web types, source guardrails, static smoke and build. [Backend workflow:36](/Users/worsin/Development/ConvexPress/.github/workflows/backend-quality.yml:36) only typechecks the site backend. [Website workflow:33](/Users/worsin/Development/ConvexPress/.github/workflows/website-quality.yml:33) lints/checks/builds/SSR-smokes. None invokes the passing unit suites; control-plane and Electron checks are not explicit independent gates. Root `scripts/**` changes are also absent from workflow path filters.

Repair: wire unit suites, explicit package checks and shared-script trigger paths into CI; add real handler integration tests for the findings above. Some existing tests duplicate logic rather than call production handlers. Acceptance: deliberate regression to a production handler fails the relevant suite and CI; a shared checker-script change triggers its workflow; installer tests prove startup on clean machines.

## Suggested execution order

1. **Access repair:** A01–A07, with shared DTO/authorization helpers and endpoint-level regressions. Include A08 and B08 as small related repairs. Coordinate public DTO changes with Fable.
2. **Correctness repair:** B01–B07 and B09. Consolidate payment/order/refund transitions, validate coupon context, and make editor recovery/scheduling reliable.
3. **Verification gates:** D02 immediately alongside fixes; D01 through small typed API contracts rather than one giant union.
4. **Repeatable site launch:** C01–C03 with one provider, clean-machine packaging proof, account scoping, domain binding and failure recovery.
5. **Fleet operations:** C04–C05, plus authorization-query benchmarking and versioned rollout/rollback across isolated databases.

The first concrete implementation batch should be **public content access + organization/business disable enforcement + issued-session revocation**, covered by negative-path handler tests. It can proceed alongside template implementation with a small agreed public DTO contract.

## Follow-up coverage before calling the platform production-ready

This pass did not individually certify the entire forms/LMS/support/shipping-provider/AI/email/WordPress-import surface. Separate focused passes should cover import restartability and ownership mappings; media deletion/reference cleanup; notification delivery retry/deduplication; plugin enable/disable effects on public and backend access; webhook replay/reordering; schema/engine migration compatibility; and real per-role Electron acceptance across two unrelated client organizations.

Final acceptance should use synthetic clients and isolated site databases, verify rendered data in the real delivered application, and include relaunch, revoked access, expired credentials, provider failure and rollback. Earlier acceptance documents are useful historical evidence; they do not substitute for rerunning the affected paths after these repairs and Fable's current changes.
