# ConvexPress block editor and template delivery — execution guide

> **For agentic workers:** Use `superpowers:executing-plans` to implement this plan task by task. Work natively in the current task; do not spawn agents unless the owner explicitly requests delegation. Keep completed work and reuse valid evidence. This plan supersedes the former all-application production-hardening execution priority following the owner's September 28 scope clarification.

**Goal:** Deliver the complete requested block editor, all 137 tracked blocks, the template system and Customizer, four finished default templates, an organized internal BlockDemo, and working authoring/extension SDK workflows, including every dependency repair necessary to make those systems work.

**Architecture:** Keep canonical content and validation shared between the native editor, site backend and actual Website renderer. Templates own presentation; site-local authenticated services own data and actions. Extend the existing implementation; do not restart the architecture or turn a delivery blocker into an unrelated subsystem redesign.

**Tech stack:** Existing TypeScript/React, Bun tooling, Convex site backends, Electron admin, Website SSR, installed template SDK, Playwright and existing motion libraries. Keep pinned dependencies unless a demonstrated blocker requires a change.

**Spec:** `specs/handoffs/HANDOFF-ASTRA-2026-09-04.md`; `specs/handoffs/HANDOFF-ASTRA-BLOCKS-2026-09-05.md`; the 137-row standalone MagicTables inventory; `block-kit/CONTRACT.md`, `WORKFLOW.md`, `DATA-API.md`; the owner's instructions for premium blocks, simple example templates and BlockDemo. The owner's latest scope correction controls conflicts with the former broad production goal.

## 1. What the owner must receive

Completion is a usable delivery, not a renderer count or a report that most infrastructure exists.

- A responsive native Electron editor where an author inserts, nests, selects, moves, edits, duplicates, removes, saves and recovers blocks without losing authored values.
- Actual Website preview of unsaved edits with click-to-select/highlight, desktop/mobile views, readable errors and recovery from session/network problems. No second renderer that looks different from publication.
- All 137 tracked blocks functioning according to their actual field/data/action requirements. Existing 58 Verified rows retain their valid evidence; 79 pending rows are reconciled and finished, not rebuilt automatically.
- Four finished default packs: Core, Journal, Depot and Aster House. Each renders every block correctly with template styling. Core is a clean neutral starter; Journal is an editorial starter; Depot is a simple store; Aster House is a business/hospitality example. Do not introduce more packs merely to make the catalog larger; the handoff's 4–6 collection is satisfied by four completed packs.
- Named styles and owned flagship treatments required by the handoff/tracker, finite layout controls, appropriate presets and patterns. Most non-flagship blocks may use the shared SDK baseline with the pack's tokens/parts. They do not need four unnecessarily separate implementations.
- Working Templates and Customize flows: activate/preview/switch packs, contextual settings, presets, typography/colors/radius/spacing, header/footer/menu settings, reset, undo/redo, reviewed publication, conflict recovery and staging promotion of appearance.
- An internal BlockDemo organized by purpose, showing every block with useful authored examples, working interactions, template switching, narrow/wide views and relevant empty/error/loading states. It is a QA/example website, excluded from customer starters unless deliberately published later.
- Complete simple example sites for all four packs, created through the real authoring contracts. A gallery of isolated cards is insufficient. Include realistic navigation and applicable blog/shop/plugin surfaces; no broken placeholder buttons or invented live data.
- Working block/template/plugin kit workflows, including reference field types and Events integration, patterns, runtime composition, template styling, promotion to canonical source, migration and permitted AI generation.
- A clean locally integrated result, a concise operator/developer guide, and a precise evidence index. Do not push without separate authorization. Do not call the entire commerce/hosting/fleet platform production-ready because this scoped delivery is complete.

## 2. Authority to fix blockers without scope drift

The owner authorizes fixing **any dependency that actually prevents this delivery**. File location is not a scope boundary. Backend, auth, schema, data transport, desktop IPC, build, deployment, provider configuration and plugin code may all need changes.

Before expanding into a dependency, record this five-line blocker entry:

1. **Required workflow:** exact block/editor/template action that cannot work.
2. **Evidence:** reproduction or direct call-path/source proof, including environment and identity.
3. **Dependency:** why the failure is caused by the proposed lower-level repair.
4. **Repair boundary:** complete causal fix, including necessary cross-cutting callers; avoid a stub or cosmetic bypass.
5. **Exit check:** observable result that proves this workflow is repaired and lets work return to delivery.

Examples:

- A selected product's live price cannot render because its authorized DTO is wrong: repair the DTO, relevant callers and permission checks. Do not redesign all refund accounting.
- A saved block cannot preview because the installed backend and Website protocols differ: match the deployments and test reconnect. Do not begin a new hosting-provider platform.
- A contact block exposes recipients or submits twice: fix authority and submission semantics. Do not audit every email automation in the app.
- A pattern loses media when the template changes: fix content/resource mapping and recovery. Do not replace the media library.
- An actual block action depends on checkout ownership or paid-download entitlement: fix the complete affected action securely; the word “commerce” is not grounds to defer a required repair.

When a proposed investigation cannot name a failed deliverable and exit check, record it in the deferred audit and move on. A hypothetical issue in an unreachable helper is not a blocker until reachability is established. Existing findings remain documented; they are not silently declared fixed.

A long repair is permitted when needed. At an hour without narrowing the cause or producing a testable change, write a short diagnosis checkpoint and change the investigation method. After two equivalent failed attempts, inspect authoritative state instead of repeating the same command. These are reassessment triggers, not deadlines that force broken code or abandonment.

## 3. Current baseline and evidence rules

Worktree: `/Users/worsin/.codex/worktrees/convexpress-hardening`, branch `codex/convexpress-hardening`. User checkout: `/Users/worsin/Development/ConvexPress`. Source baseline at this plan: `d0fee8acceb408fd306a15f3c054322cb73ac8bc`; both checkouts were clean and aligned before adding this plan.

Last exact tracker readback: `output/hero-video-20260921/mt-readback.json`: 137 rows, 58 Verified and 79 In progress. Four packs, 285 canonical examples and 32 patterns are recorded. These are historical checkpoint facts, not a fresh provider-health claim.

Use `ConvexPress-Admin/audits/2026-09-04/current-acceptance.md` and its linked outcomes to reuse evidence. Read the 3,261-line historical implementation ledger selectively, not from start to finish on every continuation.

For every pending requirement classify: **missing implementation**, **reproduced defect**, **missing evidence**, **external prerequisite**, or **accepted/reusable evidence**. Do not confuse “has not been tested” with “does not work.” Do not reset all accepted blocks to zero after a shared change: invalidate only the affected assertions and rerun the appropriate dependency coverage.

New status lives in a compact companion `2026-09-28-editor-template-status.json`; MagicTables remains the owner-visible block inventory. Append concise evidence to Notes; preserve existing history and schema. Never bulk-mark rows Verified from a build or screenshot capture alone.

## 4. Known blockers and unfinished acceptance

The single current blocker register is [`2026-09-28-editor-template-status.json`](./2026-09-28-editor-template-status.json), under `blockers`. Read it with this guide at every handoff. Each entry carries its current classification/evidence; the original E01–E19 findings and required closure boundaries have also been preserved there. New defects and their owner task belong in that register when identified, including work still in flight. This guide deliberately does not maintain a second status table.

The register cannot certify the absence of undiscovered defects. Reproduce stale findings before repair and update the relevant entry when evidence changes. Implementation, live acceptance and cleanup are separate states; an active fixture or partial deployment is not closure.

Other original audit findings remain in `current-acceptance.md`. Payment/refund renewal matrices, multi-provider account/domain onboarding, signed Windows/macOS distribution, maximum backup capacity and full fleet scheduling are **deferred independent deliverables**. Bring one into this plan only when its concrete failure blocks an editor/template requirement, and only through the blocker procedure above. Existing site/organization isolation, safe publication and customer/operator boundaries must remain intact throughout.

September28 reconciliation: Task1 is complete. See `2026-09-28-delivery-reconciliation.md` for all77 pending row checks, the complete handoff-clause map, and newly confirmed E20 eager block imports, E21 handwritten hero roles and E22 prescribed screenshot-path failure. E20/E21 subsequently passed focused live acceptance (see canonical-lazy-renderers-20260928.md); E22 subsequently passed final provenance and tracker reconciliation (tracker-evidence-final-20261006.md); the whole-bundle budget subsequently passed through the E106 registry boundary (template-registry-bundle-20261006.md).

## 5. File ownership and interfaces

| Responsibility | Actual source locations |
|---|---|
| Block definitions and default renderers | `blocks/<namespace>/<name>/block.json`, adjacent `render.tsx` |
| Shared schema/authoring rules and generation | `scripts/blocks/spec-runtime.mjs`, `field-runtime.mjs`, `instance-runtime.mjs`, `schema.mjs`, `generator.mjs`, `sync-all.mjs` |
| Native editor | `ConvexPress-Admin/apps/web/src/components/blocks/canonical-editor/` — `CanonicalEditor.tsx`, `NativeCanonicalEditor.tsx`, `CanonicalOutline.tsx`, `BlockInserter.tsx`, preview/recovery/insertion models; generated field controls in `components/blocks/schema-editor/` |
| Canonical save/read/migrate/recovery/publication | `ConvexPress-Admin/packages/backend/convex/canonicalDocuments.ts` and `canonicalDocuments/service.ts`, domain readers and registered tests |
| Native template controls | `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/appearance/{templates,customize}.tsx`, `src/lib/templates/` |
| Public rendering and template presentation | `ConvexPress-Website/apps/web/src/templates/sdk/{block-renderer,block-public,block-preview}/`, `src/templates/packs/{core,journal,depot,aster-house}/` |
| Website Customizer | `src/templates/sdk/OnSiteCustomizer.tsx`, `CustomizerPanel.tsx`, recovery modules and existing template-settings providers |
| Template generation/kit | `ConvexPress-Website/scripts/{create-template,check-template-packs,check-template-ssr,sync-template-packs}.mjs`, `ConvexPress-Website/template-kit/` |
| Block SDK and eight workflows | root `block-kit/`, `.codex/skills/block-*`, `scripts/blocks/sync-kit.mjs` |
| Demo and rendered regression tests | `ConvexPress-Website/apps/web/block-demo/`, `block-demo/browser/`, `playwright.block-demo.config.ts` |
| Existing authoritative detailed evidence | `ConvexPress-Admin/audits/2026-09-04/`, scoped `output/<batch>/` |

Use existing signatures rather than introducing parallel services. The canonical interfaces are `canonicalDocuments.get`, `initialize`, `save`, `prepareMigration`, `migrate`, `restore`, `setPublication`, and `getForRender` as actually exported/validated. Reads and writes use the selected site's authenticated runtime and expected revisions. Publication is separate from saving. Unknown acknowledgements require authoritative readback before retry.

Generated files are output, not edit surfaces. Keep data in the site backend; packs consume approved view models and SDK hooks, never private backend queries. Runtime composition uses the closed expression vocabulary, never emitted arbitrary CSS/JavaScript. Unknown pack styles fall back according to the specified default resolution without rewriting content. Packs do not inherit from other packs.

## 6. Execution order and deliverables

### Task 1 — Establish the remaining delivery map and stable editor baseline

**Files:** companion status JSON; existing editor tests `canonical-editor/{editor,workspace,recovery,preview-renewal,locks,visibility,picker}.test.ts`; actual files implicated by reproduction.

**Consumes:** current tracker, saved evidence, current process/deployment identities. **Produces:** an exact remaining-work map and a trustworthy native authoring session for subsequent batches.

- [x] Refresh the 137-row tracker read-only and map each pending row to requirements, source files, reusable evidence and actual missing checks. No full-history reread. Reconcile every clause of both handoffs, not only the previously summarized ledger: include schema/field drift detection, disabled-block mutation checks, generated registries, per-block lazy loading, roles, pack manifests, patterns and tracker reconciliation. Record any unmet clause under its owning task.
- [x] Confirm checkout, native executable, renderer port, selected site/environment and backend identity. Use an owned profile; preserve user app windows.
- [x] Exercise typing, scrolling, selection, insertion, nesting, save/reopen and undo/recovery on an owned page. Reproduce E01 only if still present.
- [x] For a reproduced failure, write a focused regression at its actual boundary, implement the causal repair, rerun it and the affected editor suite. Record exactly what changed. Verify the handoff's block-tree autosave behavior, crash/reopen draft recovery and revision/conflict guards; autosave must not publish or create duplicate accepted writes.
- [x] Complete the two opening-block reproductions E02/E03 as part of the first family batch, not a separate infrastructure campaign.
- [x] Publish the first delivery checkpoint: actual gaps, reused proof, remaining batch estimates and any external prerequisites. Do not invent an overall finish date from the old 58/137 ratio.

### Task 2 — Finish block contracts, fields and common interaction families

**Files:** corresponding root block specs/renderers; SDK renderer modules; shared field/schema generator only where required; relevant `scripts/blocks/*.test.ts`, editor field tests and `block-demo/browser/` cases.

**Consumes:** Task 1 remaining map and existing canonical APIs. **Produces:** complete non-provider block behavior and batched accepted content.

- [x] Group the pending Text/Layout/Media/Openers/Marketing/Site utility blocks by shared implementation. Reuse accepted structural, hero, CTA, table and media evidence.
- [x] Before edits, compare every required field/style/action with the actual renderer and generated editor. Include optional absent values, maximum meaningful content, nested widths and safe link labels.
- [x] Write failures for reproduced gaps, repair the shared cause, preserve stored versions and historical values. A version change requires a wired converter and recovery test.
- [x] Add several related blocks to one real native-authored page, save/reopen once, edit/reorder relevant nodes, restore the exact prior tree and publish once. Readback must prove every included block's values survived.
- [x] Exercise each block's distinct public interaction and review every pack's presentation. Batch screenshots and the shared deployment/cleanup; do not skip per-block behavior.
- [x] For every Task 2/3 accepted row, capture page errors and console errors, including hydration warnings, in native preview and public interaction checks. Visually correct output with an unresolved product error is not passing evidence; classify unrelated harness/environment diagnostics explicitly.
- [x] Update only rows whose missing requirements are closed. Others retain precise remaining notes.

September29 closure: all20 assigned Task2 block rows are Verified on the linked family reports and exact95/42 tracker checkpoint. Separate native all-field reference, migration, Customizer, SDK and final integrated requirements remain in their assigned tasks. Latest family evidence: `grade-gallery-20260929.md`.

### Task 3 — Finish live-data and action block families

**Files:** corresponding block specs/renderers, existing `canonicalDocuments/` domain readers and host interfaces, actual domain functions only when implicated; registered reader/action tests and existing browser adapters.

**Consumes:** stable editor, site-local fixture resources and current approved resolver contracts. **Produces:** working data-driven blocks and actions with no fake production success.

- [ ] Group Commerce/Discovery, Forms/Social, and Plugin blocks into coherent batches. All pending names are listed in the companion status file; no block may disappear from scope.
- [ ] For each resolver prove selected-record identity, current values, empty results, denied/revoked access, loading/error/retry and supported pagination. Generic field validation is shared; domain-specific behavior must actually run.
- [ ] For actions prove one legitimate result and relevant duplicate/failure handling: cart change, stored submission, poll vote, RSVP, owned download, or equivalent. Use approved disposable identities/resources; no real charges or outbound messages without existing explicit authorization.
- [ ] If a backend defect blocks the action, open the five-line dependency entry, fix the full causal path and return when the exit check passes. Do not attach a general subsystem audit.
- [ ] Reuse cross-site/auth/recovery machinery at family level while checking each block's exact data projection and action binding. Preserve site/customer boundaries.
- [ ] Resolve E12/E13/E14 early enough that provider prerequisites cannot surprise the final acceptance gate. Continue independent batches if an external dependency is unavailable.

### Task 4 — Finish content migration and the single authoring model

**Completeness criterion (Opus F21/F22, accepted September29):** Migration/backfill/export completion must account for the entire intended corpus. A bounded or failed partial pass must return explicit incomplete/blocked state and a resumable position or actionable limit; it must not report success. Before legacy retirement, reconcile source/destination counts and representative exact authored values, including interrupted and over-limit cases. This is a delivery acceptance lens, not authorization for an unrelated codebase sweep.

**Files:** `scripts/blocks/{content-migration,staged-migration}.mjs`, actual canonical migration/recovery service and legacy dispatch/schema consumers found through source search; existing migration/recovery suites.

**Consumes:** finished canonical capabilities and actual retained content inventory. **Produces:** one active content model/Website renderer, preserved history and explicit old-content import support.

- [x] Enumerate real legacy shapes and references once; distinguish retained revision snapshots from active authoring fields. Match converter coverage to that inventory.
- [x] Prove each supported conversion preserves editorial text, inline structure, media identity, layout intent, anchors, links, visibility/locks and revision source. Mixed/oversized unsupported inputs must be refused without loss, then receive a complete supported conversion before claiming closure.
- [x] Run native conversion/reopen/publication/recovery and before/after rendered comparison on representative owned copies of actual content.
- [x] Migrate known installed/demo content with backups, explicit receipts and exact readback. Preserve original user data and rollback until success is established.
- [x] Remove obsolete live editor/renderer/contentMode paths and fields only after preservation and import/recovery requirements pass; no premature destructive schema cleanup.

Accepted corpus/API evidence: `ConvexPress-Admin/audits/2026-09-04/legacy-reusable-retirement-20261006.md`. October7 E108 corrects its overbroad fifth-clause closure: obsolete live posts schema columns still existed and required retirement after preservation. Immutable revision archives and explicit import decoding remain supported. `schema-retirement-stage-a-20261007.md` records installed cleanup and exact archival preservation across all six sites. `schema-retirement-contraction-20261007.md` records the contracted schema with 3,711 passing tests and strict backend/Admin/Website types. `schema-retirement-installed-20261007.md` closes E108: all six sites run the contracted schema, 203 original posts/927 revisions/81 stored files remain exact, actual native save/history/reload and Website/public output pass, and explicit content-only SDK promotion passes. Full-site localization/route-policy exporter refusals were honored; historical imports and prior broader promotion evidence remain separately supported.

### Task 5 — Finish Templates and Customizer as one workflow

**Files:** native template routes/lib, Website SDK Customizer/settings providers, template pack settings/parts/surfaces, appearance migration/write services and existing tests.

**Consumes:** completed canonical pages and four installed packs. **Produces:** template switching and customization without content loss or authority leakage.

- [x] Complete palette and commerce-layout migrations with idempotent receipts; retain explicit new settings over legacy defaults. Accepted six-site receipts, no-write replay and four-pack handler/consumer preservation: `appearance-rollout-20261006.md`.
- [x] Connect header/footer/menu builders fully to Customize, then retire duplicate screens and obsolete runtime consumers.
- [x] Exercise each pack's fields, presets, brand/group reset, undo/redo, context groups and click-to-edit. A visible control must change its declared rendered surface.
- [x] Verify draft versus published values, conflicting changes, pack switches, save/reopen and staging appearance promotion preserving unrelated live data.
- [ ] Verify operator-only Website editing, customer denial, live revocation, session expiry/reconnect and retained unsaved values.
- [x] Cover the template handoff's 22 signed-in dashboard surfaces per applicable pack plus affected public surfaces. Use shared valid fixtures and batch route captures; do not invent extra dashboard features.

Task5 reconciliation: `customizer-global-layout-20261006.md` maps the completed chrome, separate-database promotion and dashboard clauses. Actual global layout controls pass156rendered checks. `customizer-palette-shop-20261006.md` adds20palette/theme combinations,64manual color mappings and96Shop responsive combinations, closing field mapping and the E102 operator canonical-body defect. E05 public HTTPS/local-network editing remains open.

### Task 6 — Deliver four polished starter websites and BlockDemo

**Files:** existing pack tokens/parts/owned treatments, patterns, BlockDemo routes/data/styles/browser cases and site-build fixture/authoring scripts.

**Consumes:** completed blocks and Customizer. **Produces:** four coherent example sites and a useful all-block review website.

- [x] Finish required flagship owned treatments and named styles from the existing handoff/tracker; every other block must look intentional through SDK/pack styling. Reconcile the phase-3 flagship minimum and all P0 tracker rows explicitly; verify at least the specified eight patterns each for Journal and Depot rather than inferring that from 32 aggregate patterns. Evidence: collection-styles-20261006.md explicitly reconciles15P0owned treatments per pack, all required named-style families and eight patterns each; E107 supplies the previously missing collection styles.
- [x] Author Core studio/business, Journal editorial, Depot store and Aster House hospitality examples with real navigation, headers/footers, media and applicable detail pages. Preserve literal authored content through pack switches. Evidence: example-sites-live-20261005.md, example-site-media-inquiries-20261005.md, example-products-20261005.md, example-native-20261005.md and example-responsive-20261005.md; four distinct backends,21 published canonical documents, real media/navigation/detail pages and native/public workflows. Literal four-pack content parity is recorded in demo-visible-review-20261006.md and field-events-final-20261006.md. Final installed-candidate integration remains Task8.
- [x] Organize BlockDemo by purpose with every block discoverable, selected-pack previews, full-page compositions and useful state variants. Keep demo-only fixtures out of customer starter data. Evidence: demo-visible-review-20261006.md; exact137 identities,24 category cases,40 full-page route cases and16 composition states. Final all-block visual acceptance remains separate.
- [ ] Review actual rendered desktop/mobile and narrow nested layouts, realistic short/long copy, media present/absent, keyboard/focus and all interactive controls. Inspect screenshots, not just successful capture counts.
- [x] Use existing motion infrastructure. Favor transform/opacity and compositor-friendly effects; no per-frame React animation loops, pixelated gradient bitmaps or motion-required content. Support reduced motion and pause controls where applicable. Evidence: task6-state-motion-20261007.md reconciles current implementations with accepted runtime/preference/focus/hardware checks and explicit source deltas.
- [x] Profile moving flagship examples in a visible hardware-accelerated browser; record environment and reproducible bad transitions. Fix observed stutter. Resolve E11 through controlled evidence and an honest supported-environment result, not infinite repeats or a blanket performance claim. Evidence: steps-review-20260929.md; E11 accepted with bounded Apple M5/ANGLE Metal results and historical/startup limits retained.

Task6 final review checkpoint: `desktop-matrix-final-20261006.md` records all four packs ×137 selected desktop examples visually reviewed (548 records/699 segments). E103–E105 repairs have27+12+24 scoped responsive cases. The October7 task6-state-motion-20261007.md maps all137 identities to45 accepted presentation/state families and closes the motion implementation requirement. The all-interactive-controls gate remains open specifically for actual Assistant/Instagram/Turnstile/Vimeo paths; accepted local UI evidence is retained. Native recovery and installed-candidate parity are recorded separately in preview-history-fixed-20261006.md.

### Task 7 — Prove SDK, plugin and AI authoring workflows

**Files:** `block-kit/`, `ConvexPress-Website/template-kit/`, existing extension kit/scaffold and installed manifest code; canonical custom-definition/AI/promotion paths and tests.

**Consumes:** finished contracts/presentation, configured legitimate provider where needed. **Produces:** usable documented extension workflows, not merely generated folders.

- [x] In disposable outputs, exercise `block-build`, `block-add-feature`, `block-audit`, `block-style`, `block-compose`, `block-promote`, `pattern-build`, `block-migrate-content`; each yields a valid authored/rendered result appropriate to its operation. Evidence: block-sdk-workflows-20261006.md maps all eight operations, reusing accepted native migration/composition/promotion evidence. Actual AI generation remains separate.
- [x] Scaffold one token-first template and verify baseline coverage; create/enable/disable/re-enable the reference Events extension while preserving source/data and denied access when disabled. Confirm Dashboard manifest integration required by the handoff. Evidence: template-sdk-trial-20261006.md, reference-extension-acceptance-20261006.md and extension-installed-20261006.md (generated live install, native lifecycle and actual Clerk customer Dashboard).
- [x] Exercise the all-field reference block and live Events block through authoring, pack switching and public data updates. Evidence: field-events-final-20261006.md; native authoring reused, eight pack/viewport cases, reactive event update, ICU hydration repair and scoped restoration pass.
- [ ] Prove actual structured AI generation with enabled core/portable/pack/plugin/composed vocabulary, permitted nesting and real selected resources; inspect/review before approval and one save. Reject invalid/disabled/hidden-by-pack/cross-site references. No provider call is a reason to expose credentials or invent data.
- [x] Prove runtime composition, per-pack styling and reviewed promotion into canonical source with field preservation and no arbitrary executable code. Evidence: mixed-composition-20261006.md, promotion-resources-20261006.md and promotion-installed-20261006.md; manually authored definitions, actual AI still open.
- [x] Add and exercise `template-build`, `template-add-surface`, and `template-audit` skills, and retarget the required design skill to the delivered template SDK. Evidence: template-sdk-trial-20261006.md; existing design-homepage already targets the SDK.
- [x] Refresh kit docs/skills from the working interfaces; remove owned scaffolds/fixtures and document the minimal user workflow. Evidence: kit-workflow-refresh-20261006.md and field-events-final-20261006.md. Scaffolds removed; remaining live fixtures retired through recoverable product APIs with immutable history retained.

### Task 8 — Final integrated acceptance and delivery

**Files:** compact status/evidence index, affected tests/configuration only for final failures, user-facing editor/template instructions.

**Consumes:** all preceding deliverables. **Produces:** completed scoped system, locally integrated clean source and reviewable release evidence.

- [x] Deploy Website support for nested list children before or together with backend acceptance of that content. Older Website validators reject the whole document with `CHILDREN_FORBIDDEN`; verify each installed site uses a compatible consumer before publishing nested lists.
  October7: `nested-consumers-20261007.md` verifies exact saved/published nested trees and semantic public HTML in all six installed environments, preserving86original pages/settings and revoking all owned sessions.
- [ ] Freeze a candidate commit and matching backend/Website artifacts. Run broad required suites once on that candidate; subsequent reruns follow actual changes.
- [x] Run one integrated native author journey: create site content, insert patterns and representative blocks, edit/nest/move, switch templates, customize, save/reopen, recover, publish, inspect public output and recover from a deliberate conflict/session interruption.
  October6: candidate-native-20261006.md joins all four native pack switches, Customize draft/conflict/reviewed publication, nested document conflict/restore, actual sign-out/sign-in draft recovery and public readback to native-integration-20261006.md insertion/move/undo/redo evidence. Later preview-history-fixed-20261006.md records production artifact parity and the demonstrated receiver-lifecycle repair; the original E99 trigger remains historically uncertain.
- [x] Finish the all-block/all-pack screenshot matrix and verify every tracker acceptance has actual tests and reviewed captures. Verify the required tracker reconciliation gate detects missing inventory rows and unsupported Verified claims, and generated drift checks inspect fields rather than names alone. Keep source hashes and affected shared dependencies in the evidence index.
  October6: tracker-evidence-final-20261006.md closes E22 with548 reviewed identities/699 pixel-equivalent PNG segments and live133Verified/137row reconciliation; four provider-dependent rows remain explicit. Native, mobile and motion evidence retain their separate scope.
- [ ] Confirm all 137 rows and handoff phases 0–6 plus HA/HB/HC/HD/HX requirements are satisfied at their actual scope. Every unresolved dependency blocks only its affected requirement and remains explicit; no missing item is silently waived.
- [ ] Verify preservation/cleanup and locally integrate the final commit to the user's checkout safely. No push or remote publication beyond already authorized acceptance.
- [ ] Deliver exact launch/open instructions, four example websites, BlockDemo, editor/Customizer usage, SDK examples and residual broader-app audit list. Mark the new goal complete only when this scoped deliverable is actually complete.

October6 installed-artifact checkpoint: `e107-installed-20261006.md` records the E107 metadata delta across six preserved backends, refreshed four candidate Website previews, rebuilt production Admin renderer and isolated custom-protocol startup. Completed source/guide merged locally as `0ebeaae5`;105main-only audit/handoff files preserved and main generated-block parity passes. This completes that integration checkpoint. Later preview-history-fixed-20261006.md accepts the demonstrated receiver repair and production restore; task6-state-motion-20261007.md accepts motion and maps presentation evidence. Provider/HTTPS and final requirement acceptance remain explicit. `docs/EDITOR-TEMPLATE-DELIVERY.md` is the operator/developer entry point.

## 7. Verification strategy and command map

**During a repair:** run the smallest meaningful failing test and affected boundary suite. Do not write tests that merely mirror static code or test filenames.

**Per family batch:** regenerate only after contract edits; one shared types/build/deployment/native/public/cleanup cycle. One native saved page can contain many blocks and prove their exact recovery together. Shared control types are tested once plus each block's distinct behavior. Reuse unaffected accepted screenshots and live evidence with provenance.

**Before final delivery:** run the required broad block/backend/consumer suites, type/build/template gates and complete reviewed matrix once against the frozen candidate. A later shared change triggers its affected coverage, not automatic repetition of every provider/fleet test.

Commands already present (run from the stated directory; capture full output to a batch file and report concise results):

| Directory | Command / purpose |
|---|---|
| Repository root | `bun run sync:blocks:all` after root contract edits; then `bun run sync:blocks:all --check`, `bun run check:blocks`, `bun run check:block-kit` |
| Repository root | `bun test ./scripts/blocks ./blocks` for the final block tooling/contracts gate; use exact affected tests during repair |
| Website apps/web | `bun src/templates/sdk/block-renderer/run-tests.fixture.mjs`; `bunx tsc --noEmit -p tsconfig.block-demo.json` |
| Website apps/web | `bun run check-types`, `bun run build`, `bun run check:templates`, `bun run check:templates:ssr`; `bun run sync:templates` only after source manifest/settings changes |
| Admin apps/web | `bun run check-types`, `bun run build`; exact canonical-editor/schema-editor tests for the affected family |
| Website apps/web | `BLOCK_DEMO_URL=http://127.0.0.1:<owned-port> bunx playwright test --config playwright.block-demo.config.ts <affected-test>.pw.ts` — only after verifying the owned server/path |
| Backend | Relevant registered canonical/domain handler tests and strict Convex typecheck/deploy from the installed snapshot; inspect package scripts before broad suite invocation |
| Repository root | `bun run check:block-thumbnails` after selective capture refresh; `git diff --check` before integration |

Do not rebuild source contracts merely to refresh screenshots. Do not deploy backend for a renderer-only CSS change. Do not refresh all 548 thumbnails when only one block's visible preview changed. A red test requires diagnosis; do not weaken assertions to accept a defect.

## 8. Environment, data and deployment safety

- Admin acceptance is native Electron. Browser control is for public Website/BlockDemo and external provider sessions.
- Revalidate process executable/path/port/environment before reuse; old PIDs and tool handles are not proof of a live process. Do not kill or restart the user's app to clear a test harness problem.
- Current installed backend receipts: `output/schema-contraction-20261007/*-installed.json`, candidate `11942647`, with a separate sealed snapshot per environment. Verify the receipt and live identity before deriving a new snapshot. Preserve source-specific Events files. A generic checkout overlay previously removed installed plugin handlers/indexes; do not repeat it.
- Use owned disposable pages/resources and minimum necessary identities. Preserve unrelated content/settings/plugin rows with scoped baselines; take full export before deployment/migration where recovery warrants it, not for every CSS test.
- Existing personal Convex/Cloudflare/UploadThing authorization permits use as already requested. Inspect configured APIs/CLIs before asking the owner to log in again. Missing key/quota is an explicit prerequisite, not evidence that an unrelated system must be rewritten.
- Never print secrets, full process arguments containing environment credentials, private tokens or raw credential files. Resolve provider uncertainty against receipts and exact target identity before retrying mutations.
- No real charges, unsolicited outbound messages, domain changes outside authorized test scope, destructive user-content cleanup or broad dependency upgrades as incidental acceptance steps.
- Retain one isolated database per website/environment and distinct operator/customer identities. Block authoring must never grant private access merely because a renderer wants data.

## 9. Progress, effort and anti-rabbit-hole controls

No arbitrary implementation/token cap is imposed by this guide; a cap must not force an incomplete causal fix. The owner is entitled to visibility into expenditure and a credible delivery trajectory.

- Keep only one active implementation family plus explicit external waits. Work independently when a prerequisite is unavailable.
- At each completed batch, and at least every 60 minutes of substantive execution, give a concise checkpoint: deliverable closed, source change, proof, remaining requirements, current blocker, elapsed goal time/token delta and revised estimate. These are reports, not repeated permission requests.
- Separate **implemented**, **verified**, and **not yet proven**. Never report a renderer milestone as finished blocks or a scoped block delivery as the entire application's production readiness.
- Estimate remaining batches after the initial reconciliation using observed throughput. State confidence and dependencies. If a batch exceeds its estimate materially, explain the cause and changed exit check before continuing a larger investigation.
- Keep tool output bounded. Store logs/traces/screenshots on disk; return exit codes, counts and relevant failure excerpts. Do not reread large ledgers or raw session history when a compact pointer suffices.
- When a failure is a harness/environment defect, label it as such; fix the harness once and return to product acceptance. Do not count it as a product feature.
- Record unrelated discoveries in the deferred audit without fixing them during this goal. If they become a demonstrated delivery blocker, promote them through the five-line dependency entry.
- Do not introduce a fresh review agent or model for each block. A model change cannot replace scope control; the same guide and evidence should allow a clean handoff to another model if the owner chooses.

## 10. Completion checklist

- [ ] 137/137 tracked blocks meet their defined contracts, have relevant tests and reviewed four-pack captures; no placeholders masquerade as functioning actions.
- [ ] Native editor workflows, field types, nesting/history/recovery, preview and saved/public consistency pass.
- [x] Canonical content/migration and required legacy retirement are complete with preserved history/data.
- [ ] Four finished default templates and authored example sites are available and switch safely.
- [ ] Full template/Customizer and required dashboard/surface coverage passes; authorized operator editing remains separate from customers.
- [ ] Internal BlockDemo makes every block, relevant state and template treatment reviewable; visual and motion quality meets the owner's requirements on the recorded environment.
- [ ] Resolver/action/plugin/AI/composition/style/promotion/kit workflows work end to end with actual scoped resources.
- [ ] All direct blockers are resolved; missing external acceptance is never relabeled success.
- [ ] Final source, generated contracts, matching deployments, tests and tracker evidence agree; cleanup and integration are complete.
- [ ] The owner receives working instructions and concrete artifacts. Broader deferred production findings remain accurately documented.

A planning document is not progress toward these checkboxes by itself. Execution must change the deliverable or obtain evidence that closes a real outstanding requirement.

September28 navigation completion:63Verified/74In progress after Table of Contents, Anchor Nav and Site Info passed their remaining native/public/field gates. See `ConvexPress-Admin/audits/2026-09-04/navigation-completion-20260928.md`. Task2 continues with Menu/Child Pages and remaining families; full delivery remains open.


### Checkpoint parity gate

After each accepted batch, reconcile every `blocks[].checkpointStatus` and its remaining-review/evidence entry against the exact full tracker readback, update `checkpointCounts` and `checkpointSource`, then run `bun run check:delivery-status`. This check compares all137 identities and individual statuses as well as the header counts; matching totals alone are insufficient. The check is read-only and does not grant acceptance or mutate MagicTables.
