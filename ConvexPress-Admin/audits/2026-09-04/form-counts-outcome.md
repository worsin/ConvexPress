# Form quota scalability and concurrency — September 6, 2026

Public form quota reads and submission validation now use an exact transactionally maintained count instead of scanning completed submissions. This closes the count-scan blocker identified during the Form embed acceptance. Renderer/browser acceptance remains **96/136**; it is not a new renderer milestone.

## Counter and recovery

New forms initialize their count in the same transaction. Partial/completed/spam/deleted transitions and form reassignment update the count with the source write; shared dynamic import/patch/delete adapters do the same. Metadata-only payment/notification/analytics writes do not change the contribution. Admin bulk operations use the counted path.

Existing and restored forms rebuild automatically in pages of at most32rows, stopping after512KiB of measured source data (one final row may cross that byte threshold, bounded by Convex's row limit). The scan takes a fixed final index key; writes to already-scanned rows or after that horizon apply deltas to the running count. This avoids restarting on each new submission and prevents an endlessly extending scan. Generation/frontier checks reject duplicate or stale jobs. Recovery resumes interrupted scans. Quota-limited forms temporarily show a preparing notice until their count is authoritative; unlimited forms remain available.

The implementation uses the installed convex-helpers index stream, whose keys include creation time and document ID; [Convex index ordering](https://docs.convex.dev/database/reading-data/indexes/) supplies the indexed traversal. Tests exercise deletion of the frontier row, writes before/after it, writes after the fixed horizon, imports, reassignment, byte limits and stale jobs.

The control-plane streaming restore removes the count table's records and the readiness marker from forms while preserving authored form settings. Target-local recovery rebuilds from restored submissions. The actual stream transformation is tested; a new full native restore was not run for this increment.

## Verification and deployment

- Full backend:2335tests/14442assertions passed. A scheduled author-count module omission surfaced in old publishing/duplication harnesses; those harnesses were corrected and26targetedtests/90assertions passed without that error.
- Quota coverage includes a420-entry form exceeding the canonical read budget of the old scan, bounded recovery during writes, and the actual public submit endpoint accepting exactly one of two attempts at a final slot.
- Restore streaming:6tests/43assertions passed. Backend/control-plane scoped types and exact captured CLI deployment checks passed; Admin/Website types and19API compiler fixtures per consumer passed. Contracts now expose2067functions/2428terminalDTOs; existing unknown boundaries are not claimed resolved.
- Captured checkpoints `form-counts-20260906` deployed to staging Convex and the test control-plane. Staging health, instance/website binding and media epoch remained correct. Website artifact remains `db7cf4080b9f`; no Website rebuild was needed for the backend count change.
- The existing staging form automatically rebuilt to ready/count2. Native settings quota2 closed the embedded public form. Quota3 then allowed exactly one of two prepared browser submissions; the other displayed Entry limit reached. Database now has3completed entries matching count3, plus1partial autosave excluded from the quota. Emails remain0;6notification rules remain disabled and there are no actions. Browser errors0, URLs unchanged, page content/revision unchanged.
- The temporary quota was cleared through native settings and the public form reopened. Synthetic entries are retained. MagicTables `core/form` Notes were updated and read back; other cells and full-lifecycle flags were preserved.

Evidence: `output/form-counts-20260906/runtime-receipt.json`, before/after data, native/public interaction logs, and `output/playwright/form-counts-20260906`.

Advanced field types, embedded payment/CAPTCHA/resume workflows, full fleet/packaged restore and the rest of the original audit/handoff remain open. No commits/pushes; original checkout and production site database untouched.
