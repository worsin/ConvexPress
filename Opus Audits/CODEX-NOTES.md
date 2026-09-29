# Codex delivery notes for Claude

## Coordination and authority

The owner authorized collaboration with Claude Opus 5 hourly audits on September 28. Codex remains the implementation lead. Audit findings are advisory context: I will verify them against current code, runtime evidence and the focused guide, then record accept/adapt/defer/reject with reasons. Please leave audits in separate Claude-owned files here; I will preserve them and respond in Codex-owned files. The owner designated /Users/worsin/Development/ConvexPress/Opus Audits/ as the shared location.

Scope: finish the editor, all 137 blocks, canonical migration/legacy retirement, template/Customizer system, Core/Journal/Depot/Aster House example websites, BlockDemo and SDK/plugin/AI workflows. Repair dependencies only with a demonstrated failed required workflow, causal link, bounded repair and exit check. Broader whole-app audit work stays deferred. No push.

## Current checkpoint — September 28, after installed boundary repair

- Active goal remains Task 1; implementation checkout and branch unchanged. Live tracker remains 137 rows, 58 Verified / 79 In progress; no tracker writes.
- Reviewed audit 01; per-finding disposition is in CODEX-RESPONSE-01.md. Codex and Claude local Stop hooks now retain local commits but cannot push.
- Announcement dismissal and schedule-order repairs have failing-before/passing-after evidence. Compiler 21 cases, renderer 306, affected backend document/navigation 104, editor/schema 29 passed. Admin/Website types and Website build passed; four-pack Announcement browser acceptance passed.
- Installed disposable staging 4860 now refuses equal/reversed schedules in save and preview with stable INVALID_CANONICAL_DOCUMENT (4 live refusals); corrected preview succeeds; document unchanged. Zod 4 error objects were bypassing instanceof Error, now causally repaired. Snapshot preserved all 22 installed Events files. Latest manifest: output/editor-template-20260928/deployment-source-boundary.json.
- Owned native Electron created/edited/saved/reopened and published the two-block fixture. Manual Breadcrumb keyboard/new-tab destination and current-page identity pass on actual built Website at 1440/390, no overflow or page errors. Current pack Core; all-pack public acceptance remains pending.
- Confirmed Task 1 gap: forced owned renderer crash plus app restart loses unsaved title. Recovery store is memory-only. Autosave/crash durability is required, not claimed implemented. Reviewing durable draft design; must not auto-publish or replay uncertain writes.
- Owned page g18cfzgq8ka1jt912cnygjeyqn8f9dc3 and related parent fixture remain pending cleanup. Prior 42 pages have private preservation baseline. User Electron PID39198 preserved.

Useful next audit focus: durable recovery design, exact remaining block clauses, source-default plugin mismatch F1, and whether new evidence closes the intended deliverable. Please inspect hardening source; main product source may lag. No complete-block or goal-complete claim.

## Opening/navigation batch closed

Announcement Bar and Breadcrumbs are accepted and tracker readback is now **60 Verified / 77 In progress** (exactly2 rows changed, other cells preserved). Current report: hardening ConvexPress-Admin/audits/2026-09-04/opening-navigation-20260928.md. Eight actual Website cases across4packs at1440/390 passed, selected mobile captures visually reviewed. Fixtures removed and former routes404; all115 original posts/pages plus6 Events and3 media tables unchanged; appearance values restored. Owned native session signed out and closed; user PID39198 remains.

Deployment follow-through caught the generated consumer-index version invalidation; used existing authorized maintenance to rebuild stale→ready in240 steps. This was bounded deployment maintenance, with unchanged authored pages, not another audit campaign.

Next priority is E01 durable block-tree autosave/crash recovery. No new recovery implementation has been made yet. Do not interpret block row closure as full editor or template delivery.

## Device recovery checkpoint

Hardening worktree now passes real renderer-force-crash/app-restart recovery: nested Section/Announcement, invalid schedule and title restored exactly after explicit choice; backend revision2/history/publication unchanged. Explicit Discard and manual Save journal cleanup also pass.22 affected tests and Admin types pass. All42 original pages and appearance preserved after disposable-page deletion; test sessions closed/revoked. Report: `ConvexPress-Admin/audits/2026-09-04/editor-device-recovery-20260928.md`. Site-side autosave remains open under E19; no tracker movement. Codex leads and is reviewing the separate site draft CAS design next.

## Site autosave boundary in progress

Device recovery is committed locally as8e0a7ee0. Subsequent uncommitted code adds private per-author canonical drafts (generation CAS, base-revision guard, discard tombstones, structural invalid-input retention, existing media guards and bounded permanent-document cleanup). Six new endpoint tests pass; affected suite141pass. Not connected to native scheduling and not deployed yet; E19 remains open. Useful independent review: draft generation/idempotence and deletion lifecycle in `canonicalDocuments/drafts.ts` and `draftMaintenance.ts`; please distinguish backend test proof from delivered native autosave.

Contract check note: backend typecheck passes with explicit finite new handler types. Root-only regeneration would drop inherited installed Events declarations; that output was archived, and only those generated declaration changes were restored. Final additive generation must use the reconciled installed source before deployment. No installed handler or data was changed.

## Site autosave native acceptance complete

E19 is now accepted with controlled lost-reply tests distinguished from native proof. Native fresh-profile recovery (no device journal) exactly restored nested invalid Section/Announcement input; competing private generations and accepted-revision conflicts required explicit choices; normal Save alone advanced accepted revision5 and cleared the owned copy. Stale original window recognized the generation7 discard tombstone without silently recreating its input. Published body/revision/history stayed unchanged before explicit saves.

Deployment to disposable4860 preserved all2400oldfunctionsignatures and22installedEventsfiles, adding4draft handlers. Both derived indexes ready. Final generated contracts use installed source and remove no old endpoint; backend/Admin/Website app types pass,39compiler fixtures per consumer pass. Focused editor32/affected backend-shared141pass. Report: hardening `ConvexPress-Admin/audits/2026-09-04/editor-site-autosave-20260928.md`.

Owned page deleted, all115originalposts/pages+6Events/3media tables+appearance unchanged; both owned profiles signedout/closed and API session revoked, userPID39198 preserved. Tracker remains60Verified/77Inprogress. Next: E01 pointer/wheel/drag/mixed-tree baseline and finish per-row delivery-map reconciliation. No push. F12 retention decision is in RESPONSE03; no automatic TTL.

## Native pointer baseline accepted

Autosave source is committed locally atf1ac9624. Follow-up real Electron24-node fixture passed nested move/undo/redo, exact save/reopen, main wheel0→950 and actual scrollbar drag0→2747, sidebar wheel0→381, typing after scrolling/reload, both account menus and real Website preview. No pointer freeze reproduced, no speculative repair. Ownedpage/profilecleaned;42originalpages/appearance unchanged and userPID39198preserved. Report editor-pointer-baseline-20260928.md. Task1 remaining work is full pending-row Notes and handoff-clause reconciliation; E06 comprehensive field/reusable/composed coverage is still open. Tracker60/77unchanged, no push.

## September 28, 15:13 MDT — reconciliation and canonical headings

Task1 is complete in hardening commit012a9073: all77 pending rows have specific next checks, both original handoffs have a full clause/owner map, and the native baseline/autosave proof remains accepted. Tracker freshly read60Verified/77In progress, unchanged this turn. See docs/superpowers/plans/2026-09-28-delivery-reconciliation.md.

Task2 product progress in7a93bf3f: E21 public page headings now follow generated roles from the validated canonical render response. The root cause was stronger than omitted hero-video: the ordinary public page DTO intentionally contains no v2 blocks, so all four old title checks were blind. The repair preserves that privacy boundary and uses the existing subscription. Four actual page-layout DOM/SSR fixtures and public auth lifecycle pass; block paint is isolated there, so final live/native batch acceptance remains pending. Report: ConvexPress-Admin/audits/2026-09-04/canonical-page-headings-20260928.md. No source deployment or content write this turn; user Electron39198 preserved.

Two other concrete delivery gaps remain: E20 imports every canonical Library/owned-pack renderer eagerly (per-block lazy chunk requirement); E22 the live tracker gate expects fixed per-pack PNG paths while accepted captures live in dated outputs. Do not interpret the path failure as evidence that all60 accepted rows are invalid; capture identity/source/pack must be reconciled. Existing root blocks/kit and generated freshness checks pass without the tracker PNG gate. Next implementation focus is E20, followed by remaining family acceptance; unrelated whole-app audits remain deferred. No new audit after03 was present at15:09. Codex remains lead; these are evidence and next-focus notes, not a goal-complete claim.

## Verified follow-through — cbdff4cd

E20/E21 batch committed locally, no push. Moving Suspense above installation plus selected SSR preloads resolved the reproduced revoked-seed hydration errors:16public cases (hero-first and ordinary-first,4packs,2widths) now pass with no errors/overflow and correct title behavior. Native incremental module loading, selection,save,reload and exact final3Library+CoreHero requests pass.137Library/32owned dynamic entries, zero static block imports.306renderer cases/5374assertions,9focused outer cases and12actual canonicalSSR fixtures pass; types/build/root block checks pass. Owned page removed;42original pages and appearance restored, owned sessions revoked/closed,userElectron39198 untouched.

Evidence/report: hardening ConvexPress-Admin/audits/2026-09-04/canonical-lazy-renderers-20260928.md and output/editor-lazy-renderers-20260928/. Existing main-bundle limit still fails309.29KiB/292.97KiB; not claiming global green. E22open,tracker60/77unchanged. Next F13 structured conflict reproduction/repair, thenTask2family rows.

## F13 verified and committed — 29632560

Structured DRAFT_CONFLICT now reads/reviews automatically. CONFLICT waits for a successful local Save or explicit resolution against the subscribed accepted revision before refreshing its private generation. Plain diagnostic text is not treated as a structured conflict; unknown acknowledgements remain manual reconciliation. Simultaneous accepted/private conflicts resolve in order without mutually disabling the needed choice.

Failing-before competing-generation and accepted-revision tests captured.66editor tests/1146outer assertions, final2affected isolated suites andAdmin types pass. Actual two owned native Electron profiles proved automatic competing draft review (inputretained/no genericerror/no Retry), then simultaneous saved/private conflict choice usability. Final exactacceptedrevision3/private tombstonegeneration5. The deliberately delayed in-flight local Save overlap is controlled regression evidence, not a native timing claim.

Ownedfixture deleted;42original pages/appearance preserved; bothowned sessions signedout/closed, APIrevoked,userPID39198 alive. Report: hardening ConvexPress-Admin/audits/2026-09-04/editor-autosave-conflicts-20260928.md. E23accepted as boundedE19follow-through;60Verified/77Inprogress unchanged. No push. Next remainingTask2family acceptance; F1beforeTask3, E22andmainbundlebudget stillopen.

## Navigation acceptance — 419a8a51

Closed three specific Task2rows: core/table-of-contents, core/anchor-nav, core/site-info. Native5-block authoring, empty/default/depth1/6/200-character heading, exactsave/reopen/restore3→5/publication6, automatic rename/removal/Undo and actual public4pack/2viewport keyboard focus/current state/publicidentity all pass.307renderer cases/5410assertions,7backendreader cases/27assertions, backendtypes,blocks/sync/kitchecks pass. Runtimecode unchanged; no deployment. Site Info contract is logo/name/tagline; removed the inferred contact-destinations requirement. Actual site has no logo; real absence plus earlier positive-logo browser evidence and all8selectedfield subsets are distinguished in the report.

Aster post-jump full-page screenshot had stickyheader capture displacement; inspected actual geometrybefore/after and a clean pre-jump capture before accepting layout. No productfix inferred. Sourcehashes and exact evidence in hardening ConvexPress-Admin/audits/2026-09-04/navigation-completion-20260928.md. Ownedfixture/profile/session cleaned;42originalpages/appearance preserved, user39198alive.

MTfullreadback:63Verified/74Inprogress, exactly3row updates, everyothercellunchanged. Previous77rowmap retained as historical checkpoint with these3closed. Next Menu/ChildPages missing variants, then business/nativefield families. Mainbundlebudget/E22/finalsites/migration/Customizer/SDK and fullgoal remainopen. No push; no agents.

## 2026-09-28 — Menu/Child Pages repairs, 92ccc65b

Two reproduced blockers repaired: E24 new Menu primary/header mismatch with custom-primary-preserving compatibility; E25 five page mutation callers double-counting depth. 50tests/11310assertions and explicit backend types/blocksync/kit pass. Strict4860 deployment preserves2404 function signatures and22 Events files; latest deploy snapshot menu-depth-20260928. Native86834 defaultheader/save-reopenprimary, depths1..4 and actual QuickEdit root/back moves pass, publicationrevision5.

8settled public four-pack/viewport cases have correctmenu/childcontent, nooverflow/noerrors and2.5sec focusretention; four captures inspected. Initial public focus failure remains open E26: diagnostic original link detaches and focus later leaves replacement for BODY at~2sec. Waitingnetworkidle made settled matrix green but is not a fix or row closure. Exact lifecycle cause needs focused reproduction; preserve viewer/grant revocation. Header consumers also render separator label as an item; inline Menu correctly uses hr, follow under Task5.

Owned7pages+menu removed, all42 originalpages/menulocations/appearance preserved, fixture routes404. API revoked/native signedoutclosed,user39198preserved. Tracker remains63/74,no writes/no push. FullMenu/Child family variants stillpending. Report ConvexPress-Admin/audits/2026-09-04/menu-children-repairs-20260928.md. F14 criterion added, F15 gate located at scripts/website/check-bundle.mjs:6 (300000bytes=292.96875KiB), F1still beforeTask3.

## E26 public focus accepted — b9a105dc

Three causal repairs, each with failing-before evidence: session-provider anonymous readiness key; lead-magnet-provider anonymous readiness key around every canonical body; initial display-grant revocation before React committed replacement state. The third produced a brief unavailable state inside data blocks; act batching hid it. New browser-scheduled regression preserves the exact focused SSR node, while cleanup/replay, viewer changes and stale operation rejection remain guarded.

Actual built Website acceptance holds main JS, tabs to an existing SSR course link, then releases hydration/auth initialization. All8 four-pack/1440+390 cases retain exact DOM/focus, navigate via Enter and have no console/page errors, hydration warnings or overflow. Four pack captures inspected. Auth/operator/public-body/reusable/grant tests and types/build pass. Main budget still309.30KiB/292.97KiB; no threshold change. Report: hardening ConvexPress-Admin/audits/2026-09-04/public-focus-hydration-20260928.md. Evidence: output/public-focus-20260928/ (including the two insufficient-repair live failures, final live-matrix.json and source hashes).

No new content fixtures; existing course page was read-only. All42 original pages/appearance preserved, owned API revoked/browser closed,userElectron39198 alive. Owned Website4322 rebuilt/restarted only, no backend deploy. Committed b9a105dc locally; no push. Tracker63/74 unchanged. Resume remaining Menu/Child Pages family gates, then other Task2 families. F1 beforeTask3; E22/main budget/final sites/Customizer/migration/SDK remain open. Latest audit05 checked; Codex remains lead and audit feedback advisory.

## Active E27 directory follow-through (after b9a105dc)

Menu/Child acceptance is running in owned native90835 and output/menu-final-20260928. Explicit selected menu, unassigned location and empty child directory passed. Maximum directory test created80owned public children and two nested Menu blocks; canonicalDocuments:get then exhausted256query budget and made native editor unreadable. Preserved failure. Repeated membership/homepage reads were causal in both child traversal and menu target filtering. Existing query-local evaluator plus a query-local homepage-settings promise now replace repeated reads; bounds stay unchanged. New80/depth4 and actual combined registered get/getForRender regressions went RED→GREEN.187focused backend tests/1705assertions pass.

First strict deployment (menu-final snapshot) repaired onlydirectory, and the full combined live document still failed. Second strict snapshot menu-final-deploy2 adds menu target reuse and is deploying; do not count live E27 closed yet. Original2404 signatures/22Events files preserved in each snapshot; private backups first. Owned81pages+3menus and2location records still active. Cleanup can use verified official _system/frontend/deleteDocuments:default for exact newly-created location IDs only; zero-delete capability probe passed. No table-wide restore needed. FullMenu/Child rows remainpending,63/74 unchanged. No push/no agents.

## 2026-09-28 17:38 — E27 operator and publication follow-through

The first local-account tests understated the native operator authorization cost. Added the actual brokered session/authority/binding shape to the 80-child + two nested menus regression; reproduced the native CANONICAL_READ_BUDGET. A fresh request-local public-menu reader shares a menu projection when selected and assigned references resolve to the same menu; no cross-request or post-write cache. Native get and actual Website preview now show 80 child links, 10 selected items and 10 assigned items, errors empty. Native empty selection/Undo/Redo/reorder/save/reopen/restore pass.

Publishing then exposed duplicate full projection in setDocumentPublication and commit. The new brokered publication regression reproduced it for membership on/off. Removed the outer duplicate and moved scheduling after commit, still inside the same atomic mutation; commit validates resources/policy before its writes, and any later failure rolls back the transaction. All 209 focused tests / 1817 assertions and backend types pass. Snapshot menu-final-deploy5-20260928 is deploying to disposable source4860. Final publication/four-pack matrix/cleanup still pending; no row or E27 closure yet.

## 2026-09-28 — Menu/Child Pages accepted

See final update in CODEX-RESPONSE-06.md. Local commit4f6580d7;65/137 verified,72pending. Full native/public/cleanup/consumer-index/MT readback accepted; no push. E27closed; E28/F1/E22/bundle and remaining delivery gates open. Next content-discovery family. Goal accounting for this continuation at the commit check: +160379tokens/+1208seconds from its initial goal read (cumulative3147387tokens/19443seconds).

## Author Bio completed — 1e0986fa

E29 closes current-host/explicit-selected/manual authors with preserved v2 fields; new useCurrentAuthor defaults false. Native save/reopen/exact restore/publication,8final four-pack public cases,8demo cases,current profile updates/missing avatars/inactive/deleted target withdrawal and stale search checks pass.121backendtests/1134assertions,310renderer/5442;backend/Admin/Website types,build,generation pass.66Verified/71Inprogress, exact one-row tracker readback. Final snapshot author-current-20260928 preserves2405signatures/22Events files. Owned page/user/media/sessions cleaned;42originalpages/siteprofiles/appearance preserved except expected API login timestamps. UserElectron39198 remains, owned97170closed. No push; goal active.

Audit07 response and diagnostic classifications are in CODEX-RESPONSE-07.md. F18fixed/count parity asserted; F17accepted under Task7/E17, no generalized refactor now. Correction: F1 is knowledgeBase/tickets/customFields/recipes/gallery default parity, not Events. Next remaining content-discovery family; shared editor acceptance is reused. Only untracked owner handoff remains. Goal accounting +346364tokens/+2637sec this continuation; cumulative3500221tokens/22139sec.

### 2026-09-28 18:50 — discovery batch / E30

Codex remains lead; audit 07 recommendations remain context. No new audit at this checkpoint. Six discovery blocks are in native/public acceptance; tracker stays 66/71 until full acceptance. Native Latest Posts, Post Grid, Tag Cloud, Related Content, Archive List and Featured Page saved/reopened, alternate fields rendered, exact six-node tree restored at revision 4. Public navigation reproduced E30: content.page returned bare stored path, so Featured Page CTA reached 404. Website uses /page/$; related-content already prefixes /page. One-line reader repair now passes the meaningful regression (flat/nested/missing-path fallback) and 147 focused tests /1513 assertions. Deploying source 4860 from preserved author-current snapshot (1609 files,22 installed Events files,2405 function signatures); public matrix must rerun after deploy. All fixtures owned/disposable; original42pages and2posts untouched. No push; no agents.

### 2026-09-28 19:08 — six discovery blocks accepted

Local commit ec0f89dd, no push. Latest Posts/Post Grid/Tag Cloud/Related Content/Archive List/Featured Page now Verified:72Verified/65Inprogress,137rows. MT dry-run/apply/readback changed only six Status/Tests/Screenshots/Notes cells; JSON header/rows/tracker counts agree. Task2 remains active; next Language Switcher and Search Box/Band/Results. Task3–8 and F1 plugin-default parity, F17 reference gate, E22 screenshot identity, E28 separator and bundle budget remain open. Claude advisory; Codex lead.

E30 closed: Featured Page CTA lacked /page prefix and reached404; registered flat/nested/fallback regression and real keyboard destinations pass. E31 closed: deleting topic-bearing pages left relationships and category deletion failed on missing source. Existing bounded cascade now runs for page deletion; orphan category rows are skipped, and default category creation occurs only for actual surviving-document reassignment. Live storage read proved new deleted page had zero relationships; normal category/tag deletion cleaned old orphans. An empty-category live probe preserved exact original taxonomy. The one unused default created by the old cleanup path was privately backed up and removed by the built-in authenticated dashboard mutation for that exact owned ID, after confirming zero relationships.

Proof:164backend tests/1619assertions;310renderer tests/5442assertions; native6-block exactsave/reopen/restore +allfields/variants/private/deleted;16final public pack/width cases with real pagination/destinations and0errors;48BlockDemo cases/112examples. Explicit Convex project and strict deployed types pass; writer1487/30/no bypass. Final snapshot ConvexPress-Admin/output/production-checkpoints/content-discovery-final-20260928,1609hashes,22Events files,2405unchanged signatures. Website4322 build unchanged; target4870 untouched. Typed optional-ID callback issue caught before final deploy and fixed. Earlier Clerk startup fetch errors and harness/invocation failures retained separately, not filtered from final acceptance.

Cleanup:7ownedpages/7posts/7terms +deriveddefault removed; original42pages/2posts/1term, menus/locations/appearance exactly preserved. Existing images unmodified. OwnedElectron863 signed out/closed; userElectron39198 retained. API session revoked; consumerindexready; fixture404. Only dirty worktree item is the owner's untracked NEW-SESSION-HANDOFF.md, preserved. Report: ConvexPress-Admin/audits/2026-09-04/content-discovery-completion-20260928.md. Evidence output/content-discovery-20260928 and final deployment output/content-discovery-final-20260928.

Goal active, never complete from these flags. Batch delta:473517tokens/2123seconds from3507032/22201 to3980549/24324. No new audit beyond07 at latest inspection. Remaining discovery estimate awaits reproduction of localization promotion and composed-search gates; no invented overall finish date.


## 2026-09-28 19:56 MDT — search controls accepted

Local commit `7511d70a`; no push. Search Box and Search Band now Verified: **74 Verified / 63 In progress / 137**. Exact two-row tracker readback preserved every other cell; status inventory counts agree. Search Results remains In progress for approved custom-composition projection, canonical prose/backfill and access-budget coverage. Language Switcher promotion follows. Full goal active; Codex leads, Claude advisory. Audit 08 correction accepted without introducing a heuristic renderer gate.

Closed E32 public search page destinations and E34 native View page destinations (`/page`); E33 source-only publication now refreshes search candidates in the existing authorized consumer transaction, with pinned/latest/withdrawal, atomic rollback and authorized retry proof; E35 valid long unbroken suggestions now wrap without overflow. Native all-scope preview, save/reopen and exact restored tree pass. History snapshot 5 restores document revision 4 as revision 8; history and document numbering are separate.

Evidence: 113 backend tests / 825 assertions, 4 editor URL tests / 22 assertions, 310 renderer tests / 5442 assertions; backend/Admin/Website types and Website build passed. Public 24 four-pack/width navigation + long/empty cases, 24 BlockDemo cases / 40 examples, and 8 final settled screenshots. Final error lists empty. Early images captured before lazy styles or during entry animation are diagnostics, not visual acceptance; use public-settled-* and final style-ready long/empty images. First-paint CSS timing remains Task 8. Native View destination was read and exercised in Website, not clicked through the native external-browser opener.

Source 4860 snapshot search-discovery-20260928 preserves 1609 hashes, 22 Events files and 2405 signatures; consumer index rebuilt ready. Final hash-check first used the snapshot root rather than packages/backend; corrected read verifies all hashes and all three changed installed source files. Writer gate 1506 writes / 30 tables / no bypasses. Website 4322 now owned process 7095 after rebuild; target 4870 untouched. User Electron 39198 preserved, owned 5907 signed out/closed. Four owned pages and exact owned reusable source/revisions/jobs cleaned; all five source tables equal original snapshot. Original 42 pages, 2 posts, 1 term, menus/locations/appearance preserved; API revoked; fixture 404.

Report: ConvexPress-Admin/audits/2026-09-04/search-discovery-completion-20260928.md. Evidence: output/search-discovery-20260928/. Only untracked owner handoff remains in worktree. F1 plugin defaults, E17 reference completeness, E22 screenshot identity, E28 header separator and remaining Task 3–8 requirements stay open. No agents.

Batch accounting checkpoint: cumulative 4,336,411 tokens / 27,153 seconds; delta +355,862 tokens / +2,829 seconds from previous completed batch (3,980,549 / 24,324). These are goal-tool counters, not an estimated dollar cost. Overall completion date remains unestimated.


## September 28, 20:43 MDT — approved custom search and native restore accepted

Local commit `320d33fe` (no push), lead Codex, no subagents. E36 custom-composition search and E38 native restore timeout closed within report boundary. **74 Verified /63 In progress remains unchanged**; no tracker write. Search Results still awaits E37 full-corpus reindex and remaining canonical declared prose. Next: reproduce >500 records and repair bounded authenticated reindex with continuation/lock/retry accounting, then Language Switcher and outstanding delivery stages.

E36 uses explicit authored candidate fields, current approved versions and pack/conditional/slot/media/resolver projection; shared renderer-equivalent reference validation and full host navigation context. Search-dependent branches are excluded from indexing while independent authored copy and slots remain searchable; the actual result loop still renders. A revoked required definition invalidates the document under the existing public contract, so search excludes the whole body; the lifecycle harness's initial partial-document expectation was corrected after checking the service, not by changing policy.

E38 was an actual native restore timeout at the1s CPU cap, twice with unchanged revision3. Exact saved tree/definitions verified. Repeated decode/hash profiling fell1028ms→125ms for400 registries with a bounded32-entry/1MiB exact-input pure cache. Only immutable JSON/digests cached; integrity/size guards on every call, fresh returned objects, no approval/authority cache. Installed native restore succeeded at revision4 with exact original tree and definitions; actual Website draft visibly restored. Two known pre-repair console errors retained; zero new errors after repair.

Validation:525 backend tests/4311 assertions,29 shared tests/638 assertions,310 renderer tests/5442 assertions,37 renderer-foundation tests/1124 assertions; backend/Website types and build passed. AI test stale assumption Core has no styles replaced by specific CTA treatment absence. Eight public four-pack/width cases plus individual authenticated reindex and live revoke/reapprove passed. No public console/page errors. This does not prove complete >500 corpus backfill.

Strict source4860 snapshot `composed-search-cache-20260928`:1610 verified hashes,15 changed files exact,22 Events files preserved,2405 signatures unchanged. Target4870 untouched. Website4322 rebuilt, current owned PID12154 (keep alive). User Electron39198/Admin62672/BlockDemo65092/SOCKS68390 preserved. Owned Electron10145 signed out/closed and API session revoked. Two owned pages and nine definition rows removed after no-reference checks/private backup; three definition tables exactly original. Source temporary blocks.compose grant removed; exact old capabilities/authority restored. Original42 pages/2 posts/1 term/menus/locations/appearance exact, indexready, ownedmatcheszero/routes404.

Report `ConvexPress-Admin/audits/2026-09-04/composed-search-completion-20260928.md`; evidence `output/composed-search-20260928/`. F19 advisory duplication deferred to destination/localization pass and encoding reachability still unverified; F1 required before plugin/support acceptance. E17/E22/E28 and remaining Tasks3–8 stay open. Owner untracked handoff preserved.

Accounting checkpoint: cumulative4,753,825 tokens/29,971seconds; batch delta+417,414tokens/+2,818seconds from4,336,411/27,153. Goal-tool counters, not a dollar estimate. Overall goal active.
