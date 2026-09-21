# Current production acceptance index — September 21

**Release acceptance is incomplete.** This index retains all 24 original audit IDs separately. It supersedes grouped historical tables for finding remaining work, not their dated evidence.

Latest follow-up: canonical visibility/password controls, incremental reindex authorization and unrelated membership-rule deletion are repaired and verified; see [September 21 access follow-ups](access-settings-acceptance.md). Five original audit rows remain accepted and nineteen remain open. These three follow-ups do not inflate that count.

Implementation and historical tests are recorded in the linked outcomes. The last column identifies required final acceptance; it does not imply none of its individual cases has ever passed. No percentage or release-complete flag is inferred.

| ID | Original problem | Evidence index | Required final acceptance |
|---|---|---|---|
| A01 | Public post/page responses expose protected fields | [content-access-outcome.md](content-access-outcome.md) | **Accepted September20:** live public/customer/editor DTO and password/membership matrix; [evidence](content-access-live-acceptance.md) |
| A02 | Customer login is treated as editorial authority | [content-access-outcome.md](content-access-outcome.md) | **Accepted September20:** real Subscriber ID/slug/path and preview denial; authorized local administrator positive reads; [evidence](content-access-live-acceptance.md) |
| A03 | Alternate publishing channels bypass protection | [content-access-outcome.md](content-access-outcome.md) | **Accepted September20:** current-source search filtering with stale indexes, actual feeds, protected homepage HTML and browser unlock; [evidence](content-access-live-acceptance.md) |
| A04 | Disabling a parent does not disable site access | [auth-runtime-outcome.md](auth-runtime-outcome.md) | Live parent disable across organization/business/site and existing sessions |
| A05 | Permission reassignment misses the previous holder | [auth-runtime-outcome.md](auth-runtime-outcome.md) | **Accepted September20:** live user allow/deny transfers revoke both old sessions; role-to-user transfer invalidates broadly; two-operator Electron evidence in output/permission-reassignment-20260920 |
| A06 | Permission truncation can discard explicit denies | [auth-runtime-outcome.md](auth-runtime-outcome.md) | Deny overflow at production policy boundaries and loaded clients |
| A07 | Packaged desktop trusts the development origin | [auth-runtime-outcome.md](auth-runtime-outcome.md) | Packaged sender origin/frame restrictions in delivered binaries |
| A08 | Permission status changes bypass owner protection | [auth-runtime-outcome.md](auth-runtime-outcome.md) | Owner protection across permission status transitions |
| B01 | Failed payment creation leaves checkout stuck | [commerce-outcome.md](commerce-outcome.md) | Provider-failed payment and retry without stuck or duplicate checkout |
| B02 | Refund screens disagree about pending refunds | [commerce-outcome.md](commerce-outcome.md) | Pending/failed/refunded webhook ordering and consistent rendered totals |
| B03 | Bulk order actions skip lifecycle side effects | [commerce-outcome.md](commerce-outcome.md) | Bulk lifecycle transitions, stock, refunds and listeners exactly once |
| B04 | Customer-specific coupon restrictions are bypassed | [commerce-outcome.md](commerce-outcome.md) | Ineligible customer and final-use coupon restrictions at finalization |
| B05 | Downgrades bill the old price at the boundary | [commerce-outcome.md](commerce-outcome.md) | Boundary downgrade bills new amount exactly once under repeated sweeps |
| B06 | Postponing publication leaves the old job active | [publishing-recovery-outcome.md](publishing-recovery-outcome.md) | Post/page scheduler with current canonical publication integration |
| B07 | Block content is not recoverable through revisions | [publishing-recovery-outcome.md](publishing-recovery-outcome.md) | Full canonical/rich-text/article/layout revision restore and rendered recovery |
| B08 | A failed session write poisons later logout cleanup | [auth-runtime-outcome.md](auth-runtime-outcome.md) | **Accepted September20:** real Electron EACCES → actual key removal → encrypted new write, then native logout/new login in the same renderer; output/auth-storage-recovery-20260920 |
| B09 | Free-shipping coupons do not remove shipping | [commerce-outcome.md](commerce-outcome.md) | Shipping coupon apply/remove/invalidate reflected in final charged totals |
| C01 | Provider provisioning/domain workflow is absent | [c01-website-publishing-outcome.md](c01-website-publishing-outcome.md) | Two independent client launches, provider/domain/TLS, retry and client isolation |
| C02 | Deployment needs a source checkout | [packaged-provisioning-outcome.md](packaged-provisioning-outcome.md) | Clean macOS/Windows signed installer with no source/Bun/global Node |
| C03 | Install state is process-local | [provisioning-recovery-outcome.md](provisioning-recovery-outcome.md) | Kill/relaunch each provision step; reconcile timeout without duplicate resources |
| C04 | Backup/restore has a small-site ceiling | [implementation-ledger.md](implementation-ledger.md) | Media-heavy capacity, peak memory, interruption and safe restore on delivered runtime |
| C05 | Scheduled backups, retention and fleet alerting need an explicit service | [fleet-policy-outcome.md](fleet-policy-outcome.md) | Scheduled backup/retention/outage alert and isolated restore drill |
| D01 | Frontend/backend contracts lose type checking | [api-contract-outcome.md](api-contract-outcome.md) | Current generated contracts and invalid-name/argument/response compiler gates |
| D02 | CI does not run the unit suites | [implementation-ledger.md](implementation-ledger.md) | All required CI paths, real-handler regressions and packaged clean-machine checks |

## Claude handoff and additional block requirements

Every row remains open at full requirement scope. Consult the exact source requirements in [the template handoff](../../../specs/handoffs/HANDOFF-ASTRA-2026-09-04.md) and [the block handoff](../../../specs/handoffs/HANDOFF-ASTRA-BLOCKS-2026-09-05.md). Those paths resolve from the repository root documents; direct source paths are also retained in the implementation ledger.

| Requirement | Implemented checkpoint | Required acceptance / remaining work |
|---|---|---|
| HA1 | Template surfaces and scoped dashboard checks | All 22 signed-in dashboard surfaces per pack; Journal/Depot customization and publish/promote |
| HA2 | Palette migration and legacy theme replacement | Fleet palette receipts and import checks before legacy tables/folders/redirect retirement |
| HA3 | Commerce layout migration and replacement controls | Fleet variant/settings migration receipts and no legacy Shop layouts dependency |
| HB1 | On-site Customizer | Authorized draft/publish on the actual Website with the site capability |
| HB2 | Surface-aware fields, read tracking and click-to-edit | Correct groups and field focus on every affected surface |
| HB3 | Presets/reset/history/conflict/promotion; native Core layout draft/publish/reset/history/conflict accepted | Other packs and fields, brand/group reset, and staging-to-live |
| HB4 | Header/footer/menu Customize modules | All builders use template settings; legacy standalone screens retired |
| HC1 | Template SDK/scaffold/skills and four installed packs | Scaffold-to-authored-site, per-surface rendering/screenshots and design quality |
| HC2 | Events extension and manifest scaffolds | Complete reference-plugin lifecycle, Dashboard declaration, disabled access and SDK exercise |
| HC3 | Reference field-guide and live Events blocks | All field types and live data in authored content across template changes |
| HD1 | Site-build workflow | Brand-to-template/plugins/pages/menus/media/shop and screenshot audit end-to-end |
| HX1 | Reserved route-collision checks | Warnings and write guards across exact/nested reserved routes and reparenting |
| Block Phase 0–1 | 137 specifications/renderers; generated contracts | All supported fields, state and failure coverage in the installed editor |
| Block Phase 2 | Canonical authoring/recovery; native page and bounded structured-article round trips | Broader structured/legacy render acceptance, inactive layout/lock intent, mixed-tree limits and legacy retirement |
| Block Phase 3 | Four packs, 32 patterns; working template spacing/width controls and secondary actions | Flagship treatments, final content switching and per-block visual/motion signoff |
| Block Phase 4 | Live editor, history, insertion, diagnostics, element approval | Wider field/keyboard/selection coverage, successful provider generation and cloud hover rollout |
| Block Phase 5 | Resolver, composition/style/promotion paths | Resource discovery and broader live data/media/child-slot/provider exercises |
| Block Phase 6 | All renderers and eight kit workflows distributed | Each kit end-to-end; premium BlockDemo and basic template websites |
| Owner: tracking | Standalone MagicTables inventory | Keep evidence per block and never infer Verified from renderer presence |
| Owner: premium motion/images | Scoped motion proof and original assets | No stutter/gradient defects on reviewed blocks, reduced motion and actual hardware profiling |
| Original audit follow-up | Focused fixes and partial acceptance | Forms/LMS/support/shipping/AI/email/import surfaces; import restart/ownership; media cleanup; notification retry/deduplication; plugin enable/disable; webhook replay/reorder; schema/engine compatibility; real per-role Electron across unrelated organizations |
| Integration | Main and hardening source reconciled; Claude history preserved | Remote CI, final integrated native/release checks and push remain pending |

## Block evidence inventory

137 canonical blocks, 285 examples, 4 packs. Full acceptance is not established for any block solely by this index.

[Machine-readable requirements and all block entries](../../../output/acceptance-reconciliation-20260920/requirements.json) preserve exact original audit bodies, current source hashes and candidate browser-test files.

Direct block spec/renderer pairs changed or added since the September 15 all-example matrix:

- `blocks/contact-stack`
- `blocks/studio-services`
- `commerce/bundle-offer`
- `commerce/category-tiles`
- `commerce/product-showcase`
- `core/hero-split`
- `core/image`
- `core/logo-cloud`
- `core/media-text`
- `core/rich-text`
- `core/tabs`

Shared styles, SDK and pack changes can invalidate other screenshots too. Candidate test-file names are navigation aids, not coverage or passing-test claims.

September 20 refresh: the eleven pairs above now have current **focused** browser evidence in `output/block-review-refresh-20260920/acceptance-review.md`. Category/product state checks now exercise all four packs. Shared Tabs repairs cover long valid labels, keyboard scroll after selected text changes width, invalid draft preservation and removal/empty recovery. Twenty distinct browser cases passed across this refresh, with selected screenshots inspected. This does not close all-example, native editor, live resolver, visual or motion acceptance for those blocks. The broader primitive change also remains subject to complete library review.

## Next execution

1. Continue delivered-runtime security and provisioning/recovery acceptance after the packaged macOS onboarding result below; signed distribution, Windows and clean-machine execution remain open.
2. Close the remaining content/access, commerce and publishing gates against the integrated application and isolated fleet.
3. Complete the block/template authored-site and visual/motion reviews, plus live hosting/domain and backup/restore/fleet drills. Do not repeat already accepted specimen checks or infer release acceptance from test counts.

## September 20 native page milestone

One complete Core page workflow now passed: native creation, three edited patterns/14 blocks, save/reopen, staging publish, explicit native promotion, live reopen and desktop/mobile public checks. Promotion preserved existing template values, reference content and membership policies. The editor View link and Last saved timestamp were repaired and verified. Evidence: `output/new-page-workflow-20260920/acceptance-review.md`. This closes the single-page milestone, not HD1, all templates or any original audit at full scope. Next priority remains the finished organized BlockDemo/default example websites and their remaining per-block acceptance, followed by the original production gates and integration.

## September 20 BlockDemo collection milestone

Four visual template entry points now open dedicated full-page studio/journal/shop/story/product examples. All137 catalog entries have selected-pack visual thumbnails using548 current generated assets. Seven browser cases passed across the new showcase/catalog and existing composed-page suites, including template changes, detail navigation, reload/Back, keyboard behavior, source preservation, loaded images and overflow. Dedicated demo type/build and focused lint pass. Evidence: `output/block-showcase-20260920/acceptance-review.md`. This closes collection entry points and full-page example navigation, not all-block aesthetic/live-data/motion acceptance, native site-build for all packs, or any original production gate. The preview server remains on4319 for direct review.

## September 20 hierarchy lifecycle repair

Website disable now queues scoped session revocation and authorized reactivation preserves website grants/denies and active-parent checks. Deployed controller source matches the229-file checkpoint;43 related tests/112 assertions and controller types pass. Live website/business tests revoke existing4860/4870 sessions, reject new sessions while disabled, and preserve Northstar4820. Organization disable revokes all six local environments; restored hierarchy matches preflight except updatedAt. Two actual Electron windows clear disabled navigation and recover (same operator, not separate client roles). Evidence: `output/hierarchy-access-20260920/acceptance-review.md`. A04 remains open for its complete role/independent-organization scope. The Aster cloud positive control could not run: Convex explicitly reports free-plan limits exceeded and cloud deployments disabled. No billing changes; quota cause not yet established. Promotion Lab and all hierarchy states are restored.

## September 20 A05 acceptance closed

Original A05 acceptance is established on the current deployed local controller/site backend: user allow and deny reassignment, old/new session invalidation, unrelated administrator preservation for user changes, and broad invalidation for role-to-user changes. Separate native operator windows prove deny removal/recovery and loss of access without reload. All three verification scenarios completed in3–4.2seconds. Temporary operators are inactive, grants removed and test permissions revoked. Evidence: `output/permission-reassignment-20260920/acceptance-review.md`. This is one accepted original audit item; the other23 original rows and remaining handoff/block/integration requirements retain their recorded open scope.

## September 20 B08 acceptance closed

Actual Electron encrypted-storage IPC reports an injected filesystem EACCES, then removes the saved keys and accepts new encrypted writes in the same renderer. Native logout clears saved authority and a new login persists a different session without restarting.3 targeted tests/8 assertions pass. Original file permissions restored, disposable session signed out and owned app closed. Evidence: `output/auth-storage-recovery-20260920/acceptance-review.md`. A05 and B08 are now accepted;22 original audit rows plus handoff/block/integration requirements remain open.

## September 20 D01 local compiler acceptance and CI wiring

Current source-derived contracts match both consumers:2,278 functions/3,029 DTOs,375 explicit unknown boundaries.33 compiler cases per consumer pass; the original any-erased declaration is separately rejected. Admin, Website, site backend and control-plane types pass. Added the missing dedicated root site-api-contracts workflow, with both workspace installs, freshness, negative fixtures and consumer/backend checks. Normalized control-plane API bindings using the repository generator after Convex deployment codegen had replaced their format. Evidence: `output/api-contract-acceptance-20260920/acceptance-review.md`. The new GitHub workflow has not executed remotely; D01 stays open for integrated CI acceptance rather than claiming a remote green result. A05/B08 remain the two closed original items.

## September 20 current library and pricing milestone

Full source-discovered example matrix:137 blocks/285 examples × four packs ×1440/390px,2280 captures and eight completed browser cases. Added actual generated-form submission preservation across all285 examples. Visual review found and repaired pricing cards reserving unused columns and misaligned actions; three final browser cases cover all four packs at1440/900/390px with0–6 plans, add/remove/reset, maximum-length copy and retained destinations.281 renderer tests/4936 assertions, Admin/Website/demo types, block/thumbnail checks, demo build and focused lint pass. Four pricing thumbnails refreshed; one existing MagicTables block row updated and all137 read back. Evidence: output/block-library-current-20260920/acceptance-review.md. The full matrix predates only the pricing repair and its final focused evidence supersedes those16 pricing captures; other136 source pairs match. Fixture/DOM evidence does not close native persistence, full visual/motion/live-data acceptance or original production gates.

## September 20 native pricing milestone

Actual Electron Core pricing authoring passed nested plan/feature reorder, invalid-length save prevention, unsaved preview without persistence, save/reopen and reviewed staging publication. Exact revision5 readback and original page/template preservation pass. Anonymous desktop/tablet/mobile checks follow both CTA links and verify authored order, no overflow and no page errors; selected images inspected. One MagicTables Notes update verified across137 rows. Disposable operator signed out and owned processes closed. Evidence: `output/pricing-native-20260920/acceptance-review.md`. Other packs/full-block acceptance and original release gates remain open; A05/B08 are still the only two accepted original audit items.

## September 20 storefront CSS boundary repair

Actual pricing-page review exposed BlockDemo global styles entering the development storefront stylesheet through broad Tailwind watch dependencies. Restricted utility scanning to storefront/canonical block component sources. Delivered-CSS regression failed before and passes after. Actual Core light/dark desktop/mobile checks pass on both development and the production build: readable Register text/icon, keyboard focus, theme toggle both ways, no overflow or page errors. Website types/build, focused lint and diff check pass. Evidence: `output/header-contrast-20260920/acceptance-review.md`. Final screenshots supersede the contaminated earlier pricing appearance; no original release row is newly closed.

## September 20 explicit suites and generated-extension probe

Named current-source suites now exclude saved checkpoint copies and include backend foundations/scripts, desktop tools, control/runtime contracts and scaffold tests. All516 Admin and86 Website test files are assigned exactly once. Full Admin command4430pass/0fail; final affected tooling12pass after one additional namespace regression; Website639pass/0fail; root block/SDK130pass/0fail. Backend types, focused lint, six workflow YAML/working-directory checks and diff whitespace pass. CI commands/triggers repaired, but no remote/pinned-runtime/clean-machine acceptance. Missing download/lead-magnet route guards fixed in source, not yet deployed.

Scaffold inventory/table namespaces repaired with failing-before regressions, but actual generated community-events backend probe is **11pass/25fail**: shared search reads original Events IDs; shared RSVP contracts/canonical adapters bind original routes/plugin sources. HC2 remains unaccepted and these concrete adapter failures are the next SDK work. No source check or normal-suite pass supersedes that failure. Evidence: output/test-suite-discovery-20260920/acceptance-review.md. Original processes/main preserved; no content/provider writes, commits or pushes. A05/B08 remain the two accepted original audit items; full goal remains active.

## September 20 generated extension search isolation

Moved event index writes and public source projection into the owning extension, discovered through a typed generated search-source registry. Generated creation/category/calendar/search handlers now pass with correct table IDs and routes; same-slug sibling plugins retain independent enablement and public results. New generated-handler regression is in normal Admin tooling/CI. Current backend3426pass, tooling13pass (including16 inner generated/sibling tests), original and generated backend types pass. Full generated backend remains15pass/22fail: all remaining failures are RSVP and require coordinated response contracts, canonical reader, editor picker, block policy and browser submission changes. Source not yet deployed; HC2 and D02 full acceptance remain open. Evidence: output/extension-sdk-isolation-20260920/acceptance-review.md. No native/provider/content writes, commits, pushes or main-checkout changes; originals preserved. A05/B08 remain the only two fully accepted original audit rows.


## September 20 generated plugin RSVP deployed milestone

Generated RSVP ownership is repaired across contracts, canonical readers, editor choices and stable browser submission. Full scaffold acceptance additionally fixed hyphenated template IDs, Convex-invalid backend module paths (public community-events maps to community_events), and missing consumer API regeneration.3429 backend,39 generated backend,282 renderer and15 tooling tests pass at recorded checkpoints; original/generated types and compiler gates pass. Strict backed-up deployments: staging4860 generated plugin1628files; paired live4870 ordinary product1608files. Real Electron event creation/publication and authored RSVP revision4 passed; desktop/mobile visitors register/reload/keep/cancel with original Events disabled. Disabling the owner revokes mounted controls,404s its route and refuses writes; real replay reserves once. Three test registrations cancelled; page returned to draft, event archived, plugin/origin settings restored. All44 existing staging and29 live documents unchanged; reusable indexes ready. MagicTables two Notes changes verified across137blocks/15features, flags unchanged. Evidence: output/extension-rsvp-20260920/acceptance-review.md. Generated Dashboard/full lifecycle, other packs, embedded preview, provider verification and full release remain open. A05/B08 remain the only accepted original audit rows. No commits/pushes or main-checkout changes.


## September 20 generated plugin lifecycle and Dashboard repairs

Real Electron draft/publish/cancel/archive and optimistic-edit conflict/reload pass against generated staging. Four template activations persist through native controls; generated event listing/detail/back links pass at1440/390px with selected pack chrome and Core extension fallback. Live testing exposed a fabricated Dashboard settings key; shared declared-key/default/parent policy now deploys correctly and removes the entry when disabled. Website direct page mounts now follow live registry and capability gates, with a failing-before/passing-after DOM test.3429 backend checkpoint tests pass; final affected/generated regression and source types pass. All45 existing staging documents unchanged; test event and settings restored; operator signed out, temporary origin removed and owned processes closed. MagicTables one roadmap Notes update read back across15rows, flags unchanged. Focused commits fcf5d842/00b6c619 plus output hygiene4d790a33; main untouched. Evidence: `output/extension-lifecycle-20260920/acceptance-review.md`. Real customer provider is absent, so signed-in Dashboard remains unaccepted; embedded preview, live CAPTCHA, broader handoff and production scope remain open. A05/B08 remain the only two fully accepted original audit rows.


## September 20 real customer and embedded-preview milestone

Actual Electron preview now connects at the environment's registered Website origin4322. Unsaved block insertion/editing, mobile fit, reconnect, dirty saved-preview guard and discard/reopen pass with the stored document unchanged. Native Clerk setup created one disposable development application; strict issuer deployment preserved all1628 generated backend files. An invited Subscriber completed real Clerk signup/email-code verification and repeated password sign-in, resolved a protected profile, and was denied admin configuration and the separate live database. Native plugin disable removed navigation and unmounted the already-open customer page; re-enable restored it without reload. Official provider testing-token CAPTCHA bypass was used, so live CAPTCHA remains unaccepted. Customer signed out, Clerk test user deleted, local record inactive, event/plugin values restored, all45 existing posts/pages unchanged, owned processes closed, temporary controller origin restored. Development Clerk connection retained. MagicTables one Notes update verified across15 feature rows, flags unchanged. Evidence: [generated-plugin-customer-preview-acceptance.md](generated-plugin-customer-preview-acceptance.md). Broader HC2/templates/blocks/production acceptance and integration remain open; A05/B08 remain the only two accepted original audit rows.


## September 20 native Clerk deployment milestone

Actual Electron Apply to deployment and redeploy passed in53 seconds using the saved control-plane credential and the generated staging backend. Current desktop source rebuilt with its real bundler configuration/shared packages. Native Done/In Sync and backend loginReady confirmed; resumable media index ready across29 content groups. Four sampled child-process arguments and the journal contained no tested secret values. All environment variables restored to baseline, all1628 backend files and45 existing posts/pages unchanged. Six runtime/process tests passed. Operator signed out, temporary controller origin restored, owned processes stopped, originals/main preserved; one MagicTables Notes update verified across15 rows. Evidence: [native-clerk-deployment-acceptance.md](native-clerk-deployment-acceptance.md). Native Apply is now accepted for this generated development installation; packaged clean-machine, production/cloud provider and full release requirements remain open. No original audit row newly closed.


## September 20 gallery viewer recovery and mobile controls

Shared Gallery/Lightbox Grid now closes stale previews after live item removal/replacement, empty content or disabled lightbox and restores focus/reopening. A valid1000-character caption no longer pushes image navigation off a short screen: image/caption scroll independently with visible44px controls. Failing-before DOM regression now passes;283 renderer cases/4956 assertions and5 focused browser cases pass, including both blocks × four packs × desktop/short portrait/landscape. Website/demo types, demo production build and focused lint pass; selected screenshots inspected. MagicTables exactly two Blocks Notes updates verified against all137rows, other cells/flags unchanged. Evidence: output/gallery-review-20260920/acceptance-review.md. No schema/backend/provider changes, no commit/push; wider block-library source integration remains open. Full per-block/native/live/motion acceptance remains open; A05/B08 remain the only two accepted original audit items.


## September 20 block source integration started

Committed portable contracts in73b2226d (12files) and the137 canonical JSON specifications/285examples in0cc022b5 (139files changed). Each exact Git-index source snapshot passes its independent tests; committed trees match the tested snapshots. Foundation14tests/131assertions; combined Library15tests/840assertions. Full working-tree block suite at the foundation checkpoint134pass; source generation freshness, focused lint/whitespace and redacted secret scans pass. No renderer/editor/template or production completion inferred. Main remains clean and unmodified; no push.841tracked changes/3106untracked files remain after these commits. Next: generator/discovery and pack metadata, then consumer/renderer/editor/backend integration and reconciliation with Claude's later main commits. Evidence: output/block-foundation-integration-20260920/acceptance-review.md. Original release gates remain open except A05/B08.


## September 20 generator and primitive source integration

Committed generator/discovery/template parsers in499f02a7 and the25 shared rendering primitives with canonical/portable contracts in e91d543b. Exact staged snapshots pass: generator/foundation28tests/912assertions; primitives12tests/99assertions plus isolated DOM/reveal subprocess checks and scoped TypeScript. Committed trees match tested snapshots; eight runtime mirrors/two portable contracts verified, full source generation freshness passes, lint/whitespace/redacted secret scans pass. Preserved consumer/installed-pack assertions in separate test files for later source integration. MagicTables one Notes append read back across15rows, completion flags unchanged. Main unchanged, no push/deploy/site-content/provider changes. Remaining 841 tracked/3074 untracked files. Next: canonical renderer/data contracts and Library renderers, then pack metadata/generated catalogs and editor/backend integration. Evidence: output/block-generator-integration-20260920/acceptance-review.md. No additional original audit requirement closed; A05/B08 remain accepted.


## September 20 complete Library renderer source integration

Commit49c3b9d1 integrates137 Library renderers,30 owned template renderers,two primitive override modules,32 portable patterns,pack block metadata and canonical/portable data contracts. Exact staged snapshot passes57 contract tests/12575assertions and23 renderer/ownership tests/806assertions, including initialization of every declared renderer; strict scoped TypeScript, root/backend/portable generation freshness,305-module lint,whitespace and redacted staged-source secret scan pass. Committed tree matches snapshot. Prepared separate BlockDemo portability repair: ten byte-identical images moved out of ignored output imports,17 consumers updated; assets/demo source remain uncommitted. Working-tree demo build and283-renderer suite pass, with existing bundle-size warnings retained. Main unchanged/no push/deploy; MagicTables one Notes append verified across15rows, flags unchanged. Remaining 834 tracked/2547 untracked files. Evidence: output/block-renderer-integration-20260920/acceptance-review.md. Next: complete committed-source BlockDemo including form/editor dependencies, then application/backend integration and Claude-main reconciliation. No new full block or original audit acceptance; A05/B08 remain the only accepted original audit items.


## September 20 BlockDemo integrated from committed sources

Commit ea28ff65 integrates the complete internal BlockDemo, local demo assets, actual schema editor/form preview dependencies and four-pack wishlist studies (276 files). Frozen Website dependency installation and both demo HTML builds pass in the exact source snapshot; scoped TypeScript,15 tests/171 assertions,238-module lint, whitespace and redacted secret scan pass. Nine browser cases pass. Visual review found offscreen Depot mobile wishlist actions despite an outer-overflow check; scoped responsive rows repair the product surface, and both four-pack wishlist browser cases pass with stronger control-bounds assertions. Mobile/desktop images inspected. Corrected prior renderer count to30 owned renderers/two primitive overrides. Main clean/unchanged; no push/deploy. Owned preview stopped, original processes preserved.810 tracked changes/2296 untracked files remain. Evidence: output/block-demo-integration-20260920/acceptance-review.md. Demo fixtures, large bundles and scoped checks do not establish all-block/live/native/motion or production acceptance. Next: editor/backend source integration and Claude-main reconciliation. A05/B08 remain the only accepted original audit rows.


## September20 canonical editor source integration

Commit c8554770 integrates676 files: canonical workspace/editor/custom-definition/recovery/preview source and548 thumbnail assets. Exact source snapshot passes71 tests/465 assertions plus14 preview transport tests/103 assertions, scoped TypeScript,124-module lint, whitespace and staged-source secret scan. Snapshot packages resolve their local workspace dependencies inside the snapshot. Added missing controller framework bindings/local registry generator and only the editor-required definition/synced storage tables; broader working backend changes preserved. Scope limitation: frontend compile still uses the existing site api:any boundary; typed site API and actual backend handler/route integration remain open. No new native/live/full-block or original-audit acceptance claimed. Main unchanged/no push/deploy.803 tracked changes/1630 untracked files remain. Evidence: output/editor-integration-20260920/acceptance-review.md. Next: registered document/recovery/definition handlers, typed contracts and route integration, then Claude-main reconciliation. A05/B08 remain the only fully accepted original audit rows.


## September20 site backend and typed API source integration

Commit8874270d integrates the full site backend dependency boundary and required native deployment gate support (1067 files). Both snapshot workspaces install with frozen locks; actual backend TypeScript passes. Expanded snapshot suite had3429 passes/one missing native gate integration failure; after including its21-file native dependency closure, both affected gate cases pass.48 native support tests and main-process bundle pass. Renamed two test helpers excluded by Convex discovery, fixed duplicate transport-source imports, verified96 deployed foundation files/22 exact validator shapes/1478 media-writer classifications. Terminal frontend contracts cover2282 functions/3032 DTOs;33 compiler cases pass in each consumer and api:any is removed.375 unknown boundaries and390 lint warnings remain; no lint errors, whitespace or final secret findings. No live deployment/full frontend/native release claim. Main clean/no push;442 tracked changes/925 untracked files remain. Evidence: output/backend-integration-20260920/acceptance-review.md. Next: remaining admin/control-plane routes and Website integration, then Claude-main reconciliation and live acceptance. A05/B08 remain the only fully accepted original audit rows.

## September20 admin/native source integration

Commitec8dabf4 integrates467 source/configuration files. Isolated frozen install, full Admin/controller types, Admin production build and native bundles pass. Admin468, controller378, native/runtime119 and tooling15 tests pass. Initial Electron-install and missing Events/template-generator dependencies were repaired without weakening checks. Lint0errors/60warnings; redacted secret scan and source identity pass. Report: output/admin-integration-20260920/acceptance-review.md. Website integration, main reconciliation and full release acceptance remain open. No original audit newly closed.

## September20 Website runtime/hosting source integration

Commit41f9e749 integrates public routes, customer dashboards, live block rendering, Customizer and hosting builders. Isolated frozen Website install,640 tests, full types, client/SSR builds and four-pack/90-surface template checks pass. Actual Cloudflare bundle passes workerd with all network intercepted; Vercel638-file output builds. Generated-extension screenshot IDs repaired with failing-before/passing-after regression; focused3cases pass after full suite. Final lint0errors/1warning; redacted secret scan and exact source identity pass. Report: output/website-integration-20260920/acceptance-review.md. Local artifacts do not establish live provider/domain, full visual/native or clean-machine release acceptance. A05/B08 remain the only fully accepted original audit rows.

## September20 SDK/CI and main integration

Application source and SDK/tooling are now integrated into main after preserving the current progress notes and reconciling Claude's nine document/history commits. Full Admin4439 tests and root block/SDK135 tests pass; generated contracts,77 distributed skill files and548 thumbnail integrity checks pass. Historical inventory inputs were moved out of ignored output into tracked fixtures. Independent dependency isolation exposed and repaired Website CI's missing Admin dependency install. Six workflows are wired; remote runs remain unverified. Main was fast-forwarded after preserving11 ignored collision files; existing app processes were left running. See [sdk-ci-and-source-integration-outcome.md](sdk-ci-and-source-integration-outcome.md). Only A05/B08 have full original-audit acceptance; release/native/provider/installer and block visual gates remain open.


## September20 packaged macOS acceptance

The actual unsigned macOS app now builds, runs outside the checkout, completes fresh onboarding with automatic operator sign-in, clears temporary credentials, and recovers from rejected sign-in. Fixed missing packaged safety-gate scripts and an external stock-policy import; embedded CLI/codegen/safety/compiler/bundler checks pass with PATH empty. The packaged library displays137 blocks; real mouse scroll/navigation and sandbox/context-isolation checks pass.472 Admin frontend tests and18 focused setup/auth tests pass; source types/builds/lint pass. All disposable sessions signed out and owned processes exited. See [packaged-native-onboarding-outcome.md](packaged-native-onboarding-outcome.md). C02 remains open for signed/notarized distribution, Windows and clean-machine provisioning; no new original audit row is closed.


## September20 content access acceptance closed

A01/A02/A03 now pass their original live acceptance requirements:318 API checks,36 SSR checks,48 password/membership combinations,12 grant/revoke checks,36 homepage/stale-index checks, actual RSS/Atom and rendered password/homepage flows. Fixed unsupported dynamic imports in both password endpoints. Corrected the disposable staging worker pool from8 to32 after reproducing queue starvation; four open member pages revoke in833ms. Original44 non-trash documents and setting values preserved; fixtures trashed, customer removed/deactivated, sessions signed out and owned processes stopped. See [content-access-live-acceptance.md](content-access-live-acceptance.md). **Five original rows are accepted: A01, A02, A03, A05 and B08; nineteen remain open.** Canonical visibility editing, incremental reindex authorization and unrelated empty membership-rule deletion are recorded follow-ups, not silently included in this closure.


## September 21 block review and browser failure closure

Two product fixes are verified: purchase-download responses cannot outlive their mount/authority generation, and Depot embedded-form headings/fields adapt to available container width. Seven download behavior cases and focused form checks pass. The broad browser sweep recorded142 pass/eight skip/three fail; all three failures have passing targeted reruns after repairing gallery example selection and Wishlist demo stylesheet loading. The gallery rerun captures137 blocks × four packs × two viewports (1096 selected specimens), not all285 examples. Production demo form/Wishlist checks pass; source types/builds, contract freshness, kit tests and focused lint pass. Selected screenshots reviewed. SDK docs now distinguish integrated custom-block APIs/static promotion from remaining data/media/child-slot acceptance. See `ConvexPress-Admin/audits/2026-09-04/block-review-20260921.md`. Three MagicTables Notes updates retain full-block completion flags. No live backend mutation. Original audit remains five accepted/nineteen open; full native/live/visual/motion/template acceptance remains open.


## September 21 hardware motion and viewport entrances

Current headed hardware matrix passes32 cases for SDK text/image marquees across four packs,1440/390,DPR1/2 on Apple M5 Metal:3840 frames, worst8.8ms, no long tasks or steady animated-layer paints. Four card entrances (UGC, social feed, search results, downloads) previously ran below the viewport; they now use per-card one-shot reveal refs with cleanup, focus settling and reduced-motion/static fallback. Five new browser cases pass in development/production; nine existing interaction cases and283 renderer tests pass. Four additional Core desktop production entrance samples have accelerated transform/opacity layers, no long tasks and worst7.9ms. Types/builds/freshness/lint pass. See `ConvexPress-Admin/audits/2026-09-04/motion-review-20260921.md`. Five MagicTables Notes updates preserve complete-block flags. This is scoped hardware/behavior evidence, not every block/device motion or release acceptance; original audit remains five accepted/nineteen open.

## September 21 revision recovery and listener repair

Actual Electron restored a complete nested canonical page's text/image/layout and its safety version; exact original rich-text/article authoring and canonical safety undo also passed. Missing canonical update events repaired; Promotion Lab staging's empty listener registry repaired through the missing-only bootstrap (155 defaults). Live title save/restore now refreshes public search without manual reindex. Final backend suite3443pass/0fail and types pass; existing lint debt recorded. B07 remains open for permission-aware canonical body search and the recovered structured-article editor's fallback-only display. Three fixtures trashed;42 original pages/two posts and template/identity preserved; reused image attachment restored with legitimate timestamp change. See [revision acceptance](revision-acceptance-20260921.md). Five original audit rows remain accepted, nineteen open.

## September 21 recovered article editing repair

Original structured posts now expose their hero/topics/summary/media fields after recovery and preserve article mode. Native edit/save/reload, image selection, five-topic limits, explicit22-block conversion, exact17-field original recovery, and complete-section clearing passed.473 Admin web tests, types and build pass; broader changed-file lint retains seven confirmed pre-existing errors. Owned fixture/session/process cleanup and original data preservation verified. See [original-article-editor-20260921.md](original-article-editor-20260921.md). B07 remains open for canonical body search and broader legacy/revision acceptance; five original rows accepted, nineteen open.

## September 21 current-source search association repair

Public search, suggestions and the canonical Search Results block now verify that current visible title/body still matches an index-selected query. Three regressions failed before and pass after;3447 backend tests, explicit Convex types and strict staging deployment pass. Live browser/API proof used the exact same stale index row before/after: one false association became zero, with current-title prefix search preserved. Temporary internal fixture function removed and verified absent; original data/listeners/processes preserved, one MagicTables Notes update verified. See [search-source-match-20260921.md](search-source-match-20260921.md). Canonical body indexing remains the next implementation task; no additional original audit row is accepted.
