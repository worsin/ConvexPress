# Authored-content promotion foundation — isolated checkpoint

Canonical activation is now implemented in the hardening worktree. See [activation outcome](content-promotion-activation-outcome.md) for current source paths, verification, and remaining limits. The staged inventory below records the pre-activation design; its temporary directory and context bridge have been removed. No live promotion is claimed.

Historical staged status (superseded by canonical source activation): implemented and locally exercised in a separate Convex test schema; **not activated, deployed, or accepted live**. Root requested that the incomplete feature stay outside `convex` until the checkout backend type graph is green and its deployments finish. No full snapshot, provider call, native process, or browser operation was used here.

## Exact activation inventory

The source directory is `ConvexPress-Admin/packages/backend/promotion-foundation-draft/` in the `codex/convexpress-hardening` worktree.

| Staged file | Canonical destination |
| --- | --- |
| `authorization.ts` | `convex/contentPromotion/authorization.ts` |
| `exporter.ts` | `convex/contentPromotion/exporter.ts` |
| `planner.ts` | `convex/contentPromotion/planner.ts` |
| `shared.ts` | `convex/contentPromotion/shared.ts` |
| `operations.ts` | `convex/contentPromotion/operations.ts` |
| `schema.ts` | `convex/schema/contentPromotion.ts` |
| `operations.test.ts` | `convex/contentPromotion/__tests__/operations.test.ts` |

On activation, replace the temporary `./types` context/builders with `../_generated/server`, remove every `siteReadContext` call/import (use the canonical context directly), and shorten staged `../convex/...` imports to `../...`. Tests must import canonical `../../schema` and point their registered module loaders at the activated functions. Do **not** ship the staging `types.ts`, its schema-extension bridge, or its `tsconfig.json`.

Add exactly one modular import/spread in `convex/schema.ts`: `contentPromotionTables` from `./schema/contentPromotion`. It adds only `contentPromotion_receipts`, `contentPromotion_mappings`, and `contentPromotion_backups`; no existing table is replaced. The shared contract is already staged at `packages/site-contract/src/content-promotion.ts`, with package subpath `@convexpress/site-contract/content-promotion`.

Then run canonical backend typecheck, the handler tests, and the compact site API generator/fixtures under coordination with commerce. Root alone deploys and wires authority-bound control-plane calls/media transport/UI. The old destructive snapshot transport must remain unavailable to `site.promote` throughout.

## Public function contracts

Namespace after activation: `contentPromotion/operations`.

- `exportManifest({target,selection})` query. `target` contains exact website/instance/origin/environment/schema identity. `selection` separately names `pageIds`, `postIds`, `menuIds`, `mediaIds`, `eventIds`, and `includePresentation`. Returns `{manifest,downloadUrls:[{key,url}]}`. URLs are outside the manifest. Unsupported source content fails explicitly before returning a usable manifest.
- `createMediaUploadUrl({})` mutation. Current live identity plus `manage_options` and `media.upload` required. Root uploads bounded source bytes directly into the target storage URL.
- `dryRun({manifest,mediaBindings:[{key,storageId}],dependencyBindings:[{key,targetId}]})` mutation. Returns `{ready,digest,receiptId,issues,changes}`. A blocked review has no ready receipt. Content is not changed. Receipt lifetime: 15 minutes. Changes identify kind/source key/target ID, exact target pre-change fingerprint, and authored fields; the manifest carries the reviewed new values.
- `apply({receiptId,expectedDigest,confirmLive})` mutation. Rechecks operator capabilities, exact target identity, every target/dependency fingerprint, media SHA-256/size, plugin state and all dry-run conflicts in the same transaction. Returns `{receiptId,digest,status:"applied",mappings}`. Repeating an applied receipt returns its stored result.
- `rollback({receiptId,expectedDigest,confirmLive})` mutation. Supports **update-only** receipts with complete backups, unchanged post-apply fingerprints, and current authoring capabilities. Restores the exact backed-up target documents atomically. Refuses deletion of created content/media because it may have gained external references; this is an explicit remaining rollback adapter, not a complete general rollback claim.
- `receiptStatus({receiptId})` query. Private to the reviewing operator and current target instance; returns digest/status/expiry metadata or null.

All operations require current site `manage_options`. Authoring additionally checks normal page/post/media/menu/taxonomy capabilities and post ownership/Editor access. Authors, creators and media uploaders become the authenticated target operator. Source users, password hashes, refresh/API credentials and role records are not record kinds in the manifest.

## Implemented data boundary

Allowlisted records cover pages/posts, current validated block trees and portable TipTap documents, media metadata backed by verified target uploads, menus/items/location assignments, terms/relationships, a small explicit SEO metadata set, page/post/block membership rules, Events records, and approved general/reading/template presentation fields. Home-page and menu targets are remapped. Presentation also discovers source menu locations; unreviewed live navigation assignments block review.

No target table is cleared. Origin/auth/integration settings, users/roles, customers/orders/payments/inventory, membership grants/enrollments/progress/submissions, and runtime delivery/session/lock records remain target-owned. Known editorial lock/schedule metadata is deliberately excluded; unknown metadata fails export. Scheduled/password-protected target content, ambiguous target menu collections, unreviewed taxonomy/access rules, changed media originals, and parent moves with target descendants require explicit resolution.

Products, courses, plans, forms and roles currently have explicit **existing-target reference adapters only**. The manifest resolves the selected target record, verifies any required slug, and fingerprints it. Dynamic catalogs without a supported authored-structure adapter produce actionable `CATALOG_ADAPTER_REQUIRED` errors. They are never silently dropped or copied with source IDs.

Current atomic unit bounds are 100 authored records and a 500 KB UTF-8 manifest, plus bounded dependency/source inspection. These are initial safety limits, **not production-scale orchestration completion**.

## Verification checkpoint

- 14 actual registered-handler tests through `convex-test`: 53 assertions pass (latest `/tmp/promotion-final-handlers.log`; rerun after activation).
- Capability bypass regression fails when the real planner authoring guard is deliberately removed, then passes after restoration (`/tmp/promotion-authoring-guard-red.log`).
- Coverage includes anonymous/cross-operator/cross-target rejection; forbidden fields/raw IDs/wrong dependency kinds; normal authoring caps; required live confirmation; conflict refusal; idempotent retry; source media/event discovery; no source mutation; target storage hash verification; block image/homepage/menu ID remapping; malformed presentation rejection; guarded rollback and refusal to delete creations.
- Shared site-contract package typecheck passed. The staged compile had no diagnostics in the promotion modules at the last checkpoint, but still reports unrelated imported API graph diagnostics. This is **not** a claim that canonical integrated backend typecheck has passed. Root/commerce own the concurrent graph cleanup; repeat after activation.
- No content-promotion schema import or registered function appears in the current canonical schema/API. No live promotion occurred.

## Remaining adapters and scale work

1. **Catalog structure:** allowlist product/category/tag/variant presentation and commercial configuration, with durable mappings and explicit target price/provider bindings. Preserve target inventory, customers, carts, orders, charges and provider-owned IDs. Review conflicts on existing live SKUs/catalog keys. Avoid triggering staging integrations on the target.
2. **Plan catalog:** transfer approved plan descriptions/visibility/order and mapped catalog associations; resolve billing/provider identifiers explicitly on target. Never transfer subscriptions, grants or member/customer identities.
3. **Course structure:** map course/module/lesson/assessment dependencies and authored media/access plans. Preserve target enrollments, attempts, grades and progress. Validate target lesson/assessment identity and exposure rules before publication.
4. **Collections/removal:** explicit menu/taxonomy removal plans and parent-subtree moves, instead of implicit deletion or merging. General rollback of creations needs an exhaustive current-reference/deletion review that includes operational consumers. Media blobs require separate retention/cleanup policy.
5. **Scale/orchestration:** target-bound durable job/lease, resumable verified media transfers, dependency-ordered units, receipts per atomic unit, bounded cancellation, freshness/conflict rechecks, and retry reconciliation. Publish prerequisites before pages; switch home/navigation last. Do not promise whole-job atomicity from per-unit atomic mutations. Large graphs/documents need versioned chunk/dependency contracts and acceptance under interruption.
6. **Postchecks:** actual independent source/target Clerk apps, keys, users/customer records and origins; verify no copied credential acceptance, queued delivery, lost target data, broken restrictions or storage references. Root owns these provider/native/browser proofs.
7. **Template availability/search:** require the target deployed bundle to contain the reviewed pack/block contracts. Define any target-local search/cache refresh effects explicitly; do not copy source queues or integration jobs.

## Approved unified-block handoff dependency

Read `specs/handoffs/HANDOFF-ASTRA-BLOCKS-2026-09-05.md`, especially §§3.1–3.2 and the final promotion coordination paragraph. Production still uses `innerBlocks`; this foundation retains it. It deliberately rejects a new `children` envelope until its adapter is updated.

Before activating the unified content model, replace field-name heuristics with the generator's pure media/reference/menu/form descriptors, recursively walking repeater/object fields; include `reference.of` and resolver/argument dependency metadata. Add `children` traversal, unified layout/style/visibility/synced-pattern dependencies, and version negotiation. Preserve lossless old content in backups/revisions; bump authoritative schema/contract identity so old receipts cannot apply across the model migration. Test media/product/event/course/plan references at multiple nested levels, dynamic resolver catalogs, unknown generated kinds, and mixed-version rejection. Do not import original-checkout code or remove `innerBlocks` prematurely. The auth agent owns the schema-first generator and has been sent the required metadata contract.
