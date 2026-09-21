# Complete pagination pages with inert split cursors

Live staging acceptance found that ordinary media deletion refused with `MEDIA_REFERENCE_BUDGET`. Nothing was deleted: both disposable media records stayed active, retained their shared storage ID, and the draft retained its featured image. The same incorrect completeness condition existed in membership policy reads.

Read-only administration diagnostics identified `completeReferencePage`, not a true size limit, as the failure. Actual cloud pagination returned:

| Table | Rows | Approximate JSON size | isDone | pageStatus | splitCursor present |
| --- | ---: | ---: | --- | --- | --- |
| commerce_products | 3 | 3,497 characters | true | null | yes |
| posts | 9 | 14,044 characters | true | null | yes |
| settings | 8 | 7,555 characters | true | null | yes |
| lms_courses | 1 | 1,473 characters | true | null | no |

The checks incorrectly rejected any non-null `splitCursor`. Convex documents that cursor as a possible split boundary; `pageStatus` indicates whether a split is requested or required. Source: https://docs.convex.dev/api/interfaces/server.PaginationResult. The repaired helpers accept a complete bounded page with an inert cursor and null/absent status. They continue to refuse both split statuses, unfinished scans, excess rows and excess measured document bytes. The root diagnostic JSON sizes above are only observational; runtime byte checks still use `getDocumentSize`.

Two regressions reproducing the actual cloud metadata failed against the old conditions, then passed. Combined media/index/membership/duplication coverage: 116 tests / 395 assertions across 10 files. Backend TypeScript and `git diff --check` pass. Deployment status: `output/aster-house/media-deletion/pagination-fix-deployment.json`. Native/live deletion acceptance remains independently recorded in `output/aster-house/media-deletion/acceptance.json`.

Diagnostic reads used the existing internal scan function and the CLI's read-only inline query, authenticated with the deployment administration key held privately. They do not constitute normal-user acceptance and introduced no public diagnostic endpoint. Normal-user deletion and role checks use the existing operator's brokered session. No budget was raised, no incomplete result was treated as complete, and no seeded Aster media was changed.

## Root acceptance update

Root live retest PASSED after both site deployments. The same fixture that previously hit the false budget refusal now correctly reports MEDIA_IN_USE. Force clearing, shared storage retention, stale writer refusal and final cleanup passed through the ordinary operator session. The temporary2 media records,1 blob and1 draft are removed; original3 seeded images still render in Electron.
