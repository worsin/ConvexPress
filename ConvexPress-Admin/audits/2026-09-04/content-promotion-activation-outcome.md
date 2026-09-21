# Authored-content promotion canonical activation

Status: activated in source and verified offline; no deployment, provider calls, native process, or live promotion was performed by this agent. This is the bounded promotion foundation, not completed whole-site promotion.

## Canonical integration

Moved the five foundation modules to `packages/backend/convex/contentPromotion` and the schema to `convex/schema/contentPromotion.ts`. The canonical schema adds exactly three tables: `contentPromotion_receipts`, `contentPromotion_mappings`, and `contentPromotion_backups`. The registered operations are `exportManifest`, `createMediaUploadUrl`, `dryRun`, `apply`, `rollback`, and `receiptStatus` under `contentPromotion/operations`.

All context and function builders now come directly from `convex/_generated/server`. The staged `types.ts`, alternate schema extension, `siteReadContext` casts, and staging tsconfig were removed. The actual-handler tests now use the canonical site schema and canonical registered module loader. Offline installed-Convex discovery generated the full backend API without contacting a deployment.

The shared manifest's public wire DTOs now have finite interfaces checked by the same strict Zod schemas. This breaks recursive API/Zod type inference without changing validation or adding suppressions. The export query also has a structured Convex return validator for the full manifest envelope; only heterogeneous authored `data` fields retain dynamic values, which are checked by the shared allowlisted record schemas. `bootstrap.requiredRecords.ensure` received an exact registered return contract; its installation behavior is unchanged.

## Preserved protection and scope

Current operator/site identity and ordinary authoring capabilities are checked. Review is bound to the operator, exact target, manifest digest, target/dependency fingerprints, verified media bytes, and a 15-minute expiry. Apply requires explicit live confirmation, rechecks the plan atomically, and retains idempotent results. Rollback remains update-only with complete backups and unchanged post-apply documents; it refuses deletion of newly created records or media.

No existing content model or block schema changed. Production `innerBlocks` trees remain supported; the future `children` envelope is deliberately rejected until generated reference metadata and model-version adapters are ready. Target authentication, users/roles, customers, orders/payments/inventory, memberships/enrollments/progress, submissions, origins, integrations, and delivery/runtime records are outside the authored record allowlist. No target table is cleared and no snapshot transport was introduced.

## Verification

- Canonical backend typecheck passes (`/tmp/promotion-canonical-types3.log`, exit 0).
- Shared site-contract package typecheck passes.
- Canonical promotion and shared-contract tests: **46 pass / 163 assertions** across eight files, including 17 actual promotion-handler tests / 64 assertions.
- New activation regressions cover schema-version mismatch, future `children` refusal, 101-record and 500 KB UTF-8 manifest refusal before receipt creation, and expiry refusal with no target records/mappings created.
- Existing real-handler coverage retains operator/target/capability restrictions, raw-reference/forbidden-field refusal, dependency checks, verified media, menu/homepage/block remapping, concurrent-edit rejection, idempotent apply, guarded rollback, and no source mutation.

- Offline compact generation stabilized at **2009 functions / 1890 terminal DTOs / 439 existing dynamic boundaries**. The six promotion operations are present; the one added dynamic boundary is the untrusted `dryRun.manifest` input, which undergoes strict shared validation before planning. Exported manifests retain their full typed envelope.
- Fresh Admin and Website typechecks both pass. All **28 API compiler fixtures** pass (14 per consumer), including typed promotion calls/envelopes and rejection of invalid live confirmation, database-replacement arguments, false response assumptions, and private receipt fields.
- Global `git diff --check` passes. Logs: `/tmp/promotion-{admin,website}-types.log`, `/tmp/promotion-consumer-fixtures.log`, `/tmp/promotion-compact-generation-final.log`.
- No verification processes remain running; no external calls or deployment occurred.

## Explicit remaining work

- **Catalog adapters:** physical product/category/variant authored structure is now implemented in the follow-up [commerce outcome](content-promotion-commerce-outcome.md). Product tags have no canonical storage/assignment model. Digital delivery, bundles, global attribute catalogs, shipping associations, paid plan commercial catalogs and assessment structures still require adapters. Courses, curriculum nodes, prerequisites and manual/existing-bound membership plans are now supported in the [learning outcome](content-promotion-learning-outcome.md). Unsupported dynamic catalogs continue to block with `CATALOG_ADAPTER_REQUIRED`. Inventory, operational customer data, grants, subscriptions, enrollments, attempts, grades, progress, and submissions remain target-owned.
- **Collections and rollback:** reviewed removal of menu/taxonomy collections and parent subtrees is not implemented. Created-record rollback needs comprehensive current-reference checks; uploaded blob retention/cleanup remains separate.
- **Scale:** the current atomic unit is limited to 100 authored records and 500 KB UTF-8, with bounded inspection. Durable jobs/leases, resumable verified media transport, dependency-ordered units, cancellation/retry reconciliation, and large-graph/versioned chunks remain. Per-unit atomicity is not whole-job atomicity.
- **Control plane and UI:** root owns authority-bound orchestration, target media transport, review/apply UI, and live acceptance. This source activation does not wire or authorize the old destructive snapshot promotion path.
- **Runtime/model compatibility:** target pack/block availability, future generated media/reference/menu/form descriptors, nested `children` traversal, unified layout/style/visibility/synced-pattern references, schema-version negotiation, and explicit target-local search/cache refresh remain.
- **Live proof:** independent source/target identities and credentials, preserved target data/restrictions/storage references, no queued delivery, and interruption/retry acceptance remain root-owned provider/native/browser work.
