# Current delivery candidate — October 7

The accepted Assistant and AI authoring changes are now installed on the six delivery environments: Source, Target, Core, Journal, Depot and Aster House. Candidate source is `3a3f58a30f7ae9a3cd87428f8fa3cf4c994134b4` (the final implementation is `6e23d609`; the later commit records its acceptance). This is a completed candidate-refresh checkpoint, not full-goal acceptance. The tracker remains **135 Verified / 2 In progress**.

## Source, deployment and preservation

- Captured 6,345 tracked source hashes. Six candidates began from their own previous installed snapshots and applied the current base-source delta, retaining environment-specific extension wiring. Source's 22 Community Events files remain byte-identical.
- Strict source and target deployment preflights passed. Each of the four examples proved identical non-codegen source to the strictly checked target and reused that typecheck. All six dry runs and installations passed; no indexes were deleted.
- Private full data/file exports before and after installation preserve **69,012 original non-maintenance rows and 81 stored files**. Existing maintenance scheduling changes are individually recorded; no customer data was reset. Full exports remain in the private acceptance directory.
- All six installed function inventories share **2,375 identical contracts**. Source retains its additional **20 unchanged Events contracts**. Local sealed installed snapshots were rehashed: Source 1,708 files, each other environment 1,691 files.
- Source, Target and Aster House synced-content indexes were stale after the current source version changed. Normal authorized bounded rebuilds returned them to ready without changing their original pages/revisions. Core, Journal and Depot retain their existing unconfigured index state; no artificial epoch was invented.
- Each environment passed actual operator create/save/reopen/publish and anonymous readback of a nested section/paragraph. All six owned pages were recoverably trashed, public reads returned null and owned sessions were revoked. Original 206 posts, 936 revisions and 30 settings records remained exact through these checks.

## Candidate verification

| Gate | Result |
| --- | --- |
| Backend Convex tests | 3,564 pass, 20,690 assertions |
| Backend foundation tests | 183 pass, 5,939 assertions |
| Backend scripts/membership tests | 18 pass, 81 assertions |
| Root block/tooling tests | 191 pass, 18,226 assertions |
| Website tests | 698 pass, 2,375 assertions |
| Admin renderer tests | 524 pass, 2,911 assertions |
| Actual block-renderer fixture | 326 pass, 5,896 assertions |
| Installed Events tests with one test-import adaptation | 39 pass, 345 assertions |
| Backend, Admin, Website and BlockDemo strict types | Pass |
| Generated contracts, block/kit checks, templates and template SSR | Pass |
| Tracker per-row/header reconciliation | 135/2/137, pass |

The installed Events test suite originally failed to load its old `publishedFixture` import. In a disposable copy only, that import was pointed to the existing renamed `publishedFixture.test-support`; all production files and test assertions remained unchanged. The 39-test result is explicitly this adapted test harness, not an unmodified installed-suite claim. The original installed extension and its contracts remain exact. Failed import-mapping attempts are retained as harness evidence, not product failures or passing tests.

The first candidate preflight also exposed an assembly mistake: Git's rename-aware file listing copied a renamed legacy test fixture without removing its old name. The assembler now uses `--no-renames`, removes the obsolete fixture and passes strict preflight. No validator or typecheck was weakened.

## Website and native artifacts

The current Website client/server build is sealed at `output/final-candidate-20261007/website-dist` with **1,656 file hashes**. Its external SSR imports use the existing pinned Website dependencies through the same local dependency link as the prior acceptance artifact. An initial missing-link failure is recorded and was corrected before acceptance.

The accepted Admin renderer has **2,458 files rehashed** and no source delta in Admin web, desktop, runtime clients or site contracts since its prior acceptance. Its native acceptance is reused with that dependency evidence; this checkpoint does not claim a new native session. Actual final-source AI native acceptance on original Alpha remains in [AI resources](ai-resources-20261007.md).

The rebuilt Website rendered original Alpha Home/catalog and the mobile Assistant drawer: 20 catalog products, loaded images, no horizontal overflow at desktop/390px and no captured browser console errors. No provider request or cart action was submitted in this artifact smoke.

Four current previews now serve the sealed artifact while the 14 previously protected processes remain running:

| Pack | URL | Process |
| --- | --- | --- |
| Core | http://127.0.0.1:4340 | 18207 |
| Journal | http://127.0.0.1:4341 | 18241 |
| Depot | http://127.0.0.1:4342 | 18257 |
| Aster House | http://127.0.0.1:4343 | 18275 |

All four homepages were visually reviewed in the actual browser at desktop and390px; all eight cases have their expected title/heading and no horizontal overflow. Screenshots were reviewed in the browser-tool transcript. All **27 HTTP routes**, covering 21 published documents, four root aliases and two authored CTA aliases, return200 with the expected environment identity. Existing detailed all-block/four-pack screenshots retain their original scope; these eight cases do not replace them.

Depot's first navigation overlapped its backend deployment and returned an SSR InternalServerError. A normal reload after deployment succeeded. This is recorded as a transient failure, not a zero-downtime claim. All owned browser tabs are closed and the viewport restored; the temporary Alpha artifact process is stopped. The four current example previews intentionally remain running.

## Remaining prerequisites and next boundary

Read-only checks of ten local environments found no stored or environment-configured authorized Instagram account. The first readiness harness checked an incorrect environment-variable name; its result is retained but excluded. The corrected query uses the actual reader's `CONVEXPRESS_INSTAGRAM_ACCOUNTS` name.

The controller does have an existing HTTPS staging site, `https://aster-house-staging.h5s.workers.dev`, with an active stored connection. Its current backend explicitly responds: “You have exceeded the free plan limits, so your deployments have been disabled.” The Website returns500 and normal operator exchange fails. This supersedes older no-host observations. Restoring that deployment or selecting another authorized HTTPS environment is necessary for E05; no paid upgrade or cloud mutation was attempted.

Instagram authorization and real human Turnstile verification remain open. Original-fleet deployment deltas beyond Alpha still need the final scope check; the six-site installation above must not be relabeled as all original environments. Requirement-by-requirement final reconciliation remains Task8. Claude audit67's E116 classification correction is accepted; its review is advisory and does not block independent progress.

Raw evidence: `output/final-candidate-20261007/`, including candidate/installed manifests, preflight/deployment logs, contract parity, live/index journals, artifact hashes, browser/HTTP summaries and provider prerequisite receipts. No push.
