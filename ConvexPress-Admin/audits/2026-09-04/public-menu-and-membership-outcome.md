# Public menu discovery and membership validity — September 5

Public navigation now verifies the current referenced content before returning a link. Draft, private, password-protected, inaccessible membership content, missing records and mismatched content types are omitted. URLs follow the current content or taxonomy route; an old saved URL cannot revive an inaccessible target. Custom destinations reject unsafe schemes, protocol-relative links, browser control characters and backslashes. Dashboard destinations require a real registry entry, enabled plugin and applicable capability.

The tree preserves ancestor visibility: hidden, orphaned, missing, foreign-menu or cyclic parents hide their descendants. Depth is computed from the actual tree, independently of row order or cached depth. A regression test first reproduced incorrect ancestor hiding when deepest descendants sorted first; the repaired traversal preserves valid levels zero through five. Source traversal is bounded and refuses oversized menus instead of silently returning a partial result. Explicit finite return validation exposes display fields only, excluding editor policy, source references and author metadata. New-window links include both opener protections. Admin menu reads retain their editing data.

Menu review also exposed shared membership authorization gaps. The authority projection now includes start and revocation timestamps. Role elevation, capability augmentation and content restriction checks share current-grant filtering: a future start, revocation marker, expired active grant or expired/unbounded grace period cannot authorize access. Start is inclusive and expiry exclusive; authorization does not depend on the expiry scheduler having run. Referenced plans must still be active, and inactive customers cannot use content membership grants. The public menu no longer truncates membership grants at twenty rows; it uses the existing bounded authority reader.

## Evidence

- Ten menu/security tests cover ordering, malformed ancestry, current content discovery, unsafe destinations and projection, oversized hidden rows, grant timing, archived plans, disabled users, taxonomy/dashboard gates and the former twenty-row cutoff.
- Full site backend suite: **2,176 tests passed, 9,010 assertions, zero failures**, across 151 files.
- Backend, Website and Admin TypeScript checks passed.
- Generated site API declarations refreshed: 2,045 functions / 2,377 DTO types; public menu has no unknown boundary. Both consumers' 19 contract compiler fixtures passed. This is not a claim that all other API boundaries are fully typed.
- Existing deployed canonical foundation generation check: 28 files, zero drift. `git diff --check` passed.
- Durable logs and source hashes: `ConvexPress-Admin/output/menu-security/2026-09-05/receipt.json` and neighboring log files.

Three older mock fixtures were corrected to model schema-valid current grants and an existing active plan; rejection behavior was not weakened. The LMS fixture now additionally verifies denial after plan archival.

## Remaining integration

These source changes have not been deployed to the staging site or exercised through a newly published native artifact. Existing live staging receipts refer to their earlier source checkpoints. The canonical `core/menu` renderer/resolver still needs to reuse this verified public projection, support both authored menu references and locations, and pass normal editor/publishing plus four-pack browser acceptance. The membership overview's separate display query still needs a bounded-read review. Renderer count remains **88/136**; no MagicTables completion flag or renderer acceptance count was advanced for this backend repair. Full production readiness, Claude's remaining handoff and fleet/packaged acceptance remain active.
