# Original fleet rollout — October 7

The original four-site migration and physical schema contraction are installed and verified. All 11 original records and 120 original files are preserved. E109 remains open for matching native/Website and configured AI acceptance.

## Candidate and preflight

The recovered historical application inventory matches the originals. AST comparison maps 1,737 module pairs, 1,725 equal after removing comments and normalizing relative dependency paths with checked bidirectional bindings. Twelve differences remain in canonical block generated/runtime modules; this is not an exact historical rollback source. Further historical hash matching was deferred in favor of the tested current-source upgrade.

The isolated transition candidate starts from 647abd9a and temporarily retains optional posts.content/contentMode/pageSections. Only its media reference inventory and writer version change for those fields. Root production schema remains contracted. All 1,488 media writes/30 owner tables and 9 canonical permits/25 versioned boundaries pass. Full original exports are retained privately. Fresh paginated preflight matches 11 posts, 0 revisions and 120 storage records. Export-only storage internalId is excluded from the API comparison; IDs,creation times,content types,sizes andSHA256 remain exact.

Fresh deployment codegen exposed a test fixture under a deployable basename. Its generated API import pulled an excluded test helper into strict production checking, where the private TableDefinition.export method is not declared. Renamed it legacyPostSchema.test-support.ts and updated three test imports; Convex's documented-in-source multiple-dot entrypoint exclusion now applies.196 focused tests/1,837 assertions pass. The initial test run from the repository root hit a file-descriptor limit while resolving the workspace; the bounded backend-directory rerun passed. The first rejected install left all 1,739 original alpha module hashes unchanged. Retry with fresh codegen and strict type checking installed successfully. No typecheck bypass.

## Alpha preservation

Normal controller exchange authorized all reviews and writes. A session opened before deployment still resolved the same user afterward. Controller sessions were signed out; short-lived management tokens were cleared locally and their expiry recorded. No operator-wide revocation or auth-key rotation was performed.

Six original rows first passed review. The published contact page was correctly refused because Forms was disabled by default and the original settings had no explicit formsEnabled value. Enabled only Forms through normal settings update; other effective plugin settings match. All seven then passed review. Four writes succeeded before a catalog page refused CATALOG_EPOCH_UNCONFIGURED. Initialized the missing epoch through the existing deployment coordinator's prepare/dispatch/readback protocol. An authoritative resume skipped the four already converted rows and converted only the remaining three.

Final read-only verification accepts all 7 posts, 7 immutable source archives and 50 unchanged storage records. Every original lifecycle,ownership,route and timestamp field remains exact. Saved blocks match reviewed blocks. Retired live fields are absent. All 4 published documents return ready public bodies; 3 auto-drafts return null publicly. The first public-body comparison correctly exposed recipientEmail redaction in the contact block; verification was corrected to the existing public-tree contract, including exact empty recipient and omitted private authoring fields. No privacy rule was weakened. Native visual/Website acceptance is still separate.

## Final four-site result

| Site | Original posts | Exact source archives | Original stored files |
| --- | ---: | ---: | ---: |
| Alpha | 7 | 7 | 50 |
| Beta | 0 | 0 | 20 |
| Gamma | 4 | 4 | 50 |
| Delta | 0 | 0 | 0 |

Gamma's four published originals passed normal migration after enabling its same existing contact dependency. All sites now run the contracted candidate: 2,020 checked source files exactly match commit `8da561ea`, excluding generated API bindings. Captured installed sets contain 1,780 modules each and are byte-identical across all four sites. Fresh strict codegen/deployment passed. The test fixture is absent from deployed modules.

Active schema readback confirms validation enabled, retired content/contentMode/pageSections absent from live posts, and all three retained in immutable revisions. Full final exports confirm exact original file bytes, source archives, lifecycle, ownership, routes and timestamps. No preexisting row was deleted. AI settings remain exactly unchanged on each site. Other preexisting changes are limited to the two reviewed Forms settings rows and derived LMS maintenance generation, sitemap cache, product collection/sale index versions and user post-count fields; exact changed-table/field receipts are retained.

Media and reusable consumer backfills reached ready through their bounded APIs on every site. No readiness flags were forced. Operator sessions opened before each final deployment retained the same authorized users afterward. Owned controller sessions signed out; management tokens were cleared locally, with expiry recorded. All 11 protected local runtimes remain alive. No push.

Final anonymous reads match the public-tree contract on all eight published originals; the three auto-drafts return null. Contact recipient redaction is exact. This is backend/public-contract evidence, not a native window or visual Website acceptance claim. The next gate is matching current native/Website artifacts and real configured AI generation, review/save and Assistant workflows.

## Receipts

Under output/original-fleet-20261007/: preflight.json; baseline-graph-comparison.json; transition-candidate.json; alpha-transition-dry-run-final.log; alpha-failed-push-readback.json; fixture-packaging-tests-2.log; alpha-transition-install-fixture-fixed.log; alpha-transition-session-fixture-fixed.json; alpha-contact-dependency.json; alpha-epoch.json; alpha-migration-apply.json; alpha-migration-resume.json; alpha-public-diff.json; alpha-migration-verify.json. Earlier refusal receipts remain preserved. Original bodies,plans,exports and compiled captures are private, not copied into this report.

Final receipts in the same output directory: `*-contraction-install.log`, `*-contraction-session.json`, `*-final-export.json`, `*-schema.json`, `*-final-indexes.json`, `*-final-source-receipt.json`, `contraction-source-parity.json`, `final-preservation.json`, `final-public-readback.json` and `rollout-protected-runtimes.json`.
