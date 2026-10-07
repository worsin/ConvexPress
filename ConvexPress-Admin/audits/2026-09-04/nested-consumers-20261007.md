# Installed nested-list consumer compatibility

Source candidate `cd587c50` is compatible with nested canonical list children in all six delivery environments. Each check used the sealed production Website artifact from `output/preview-history-fixed-20261006/website-dist` and its environment's already-installed route-policy candidate. No new backend deployment or product change was needed.

The known converted legacy fixture contains a list with a Group child containing an italic paragraph and a deeper list, plus a code block. Through normal operator APIs, each owned page was created, saved, reopened, given a unique slug and published. Exact canonical block trees survived authenticated and anonymous readback. Actual public HTTP responses returned 200; parsed server HTML contained semantic `ul > li ... ul > li`, the expected deeper text, italic mark and code, with no `CHILDREN_FORBIDDEN` rejection.

| Environment | Website port | Original active pages preserved | Consumer result |
| --- | --- | --- | --- |
| source | 4322 | 43 | Pass |
| target | 4323 | 28 | Pass |
| core | 4335 | 4 | Pass |
| journal | 4336 | 3 | Pass |
| depot | 4337 | 4 | Pass |
| aster-house | 4338 | 4 | Pass |

All 86 original active pages, appearance values and identity, general/reading/plugin settings and menu locations remain deeply equal to their private baselines. Only the six owned pages were recoverably trashed; anonymous canonical reads then returned null. All six temporary operator sessions were revoked and refresh returned 401. All seven protected runtimes remained alive. The two owned temporary source/target Website runners were stopped; four candidate example runners remain available. No user runtime was restarted, no existing document was migrated, no permanent deletion and no push occurred.

This closes Task8's installed nested-list consumer compatibility check. The current Website artifact was present before these fixtures were published. Earlier native migration, prose-flow and responsive visual reports remain separate evidence; this run proves current server rendering and content preservation, not a fresh browser interaction matrix. Future installations must retain the same consumer-before-publication ordering.

Evidence: `output/nested-consumers-20261007/check.mjs`, `check.log`, `receipt.json`, six `*-published.html` responses and owned runtime receipts. Private content/settings baselines remain in the existing acceptance-secrets directory. The receipt records candidate source, ports, owned page IDs, exact-tree checks and cleanup results.
