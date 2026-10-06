# Legacy creation callers — October 5, 2026

Removed the unused `createPost` and `createPage` wrappers from the native mutation hooks. The native New post/page routes already use `canonicalDocuments.create`. A source-wide caller search found no users of either wrapper; TypeScript confirms the remaining hook consumers compile. Existing lifecycle and metadata operations remain available.

Validation: Admin `bun run check-types` passed. Existing canonical route test passed (one top-level wrapper). `git diff --check` passed. No backend or installed-site mutation, new runtime acceptance, or full E07 closure is claimed for this deletion.

## HTTP authoring boundary — accepted in follow-up

1. **Required workflow:** External API creates a post/page, reads its authored body and subsequently updates it; the result opens in native canonical editing and renders on the actual Website.
2. **Evidence:** `convex/http/posts.ts` and `convex/http/pages.ts` call their domain `httpInternals.createInternal` functions. Both insert raw `content` without canonical blocks/version. Their GET DTOs still read `content`; UPDATE still builds legacy content patches. Native hooks are no longer callers of the generic public creation mutations.
3. **Dependency:** Canonical-only native/public dispatch cannot make a newly inserted legacy body usable without deliberate import. Changing creation alone would also leave the HTTP read/update contract incomplete.
4. **Repair boundary:** Coordinate the existing HTTP create/read/update contracts, body conversion/validation, expected-revision handling and API-key authority. Preserve page hierarchy, publication rules and deliberate legacy import. Do not impersonate a native authenticated session or remove functioning HTTP endpoints to pass retirement checks.
5. **Exit check:** API-created post and nested page retain body/metadata through read, edit and stale-write refusal, then open in native canonical editing and render on the actual Website; failed conversion/authority checks leave no partial writes.

Generic public create APIs, deliberate WordPress import, demo seeding and remaining stored legacy schema fields still require separate caller-aware retirement. No schema deletion is justified by this hook cleanup.

The coordinated HTTP boundary above is accepted in [http-canonical-20261005.md](http-canonical-20261005.md), including its native/Website exit check on both sites. The generic create/import/demo/schema follow-up remains open.

## Generic creation retirement follow-up

1. Required workflow: every supported new post/page opens as canonical; normal page moves and deletion retain correct descendant paths and references.
2. Evidence: the generic public create endpoints still insert unversioned/v1 bodies, but repository-wide searches find no current application callers; only route tests and old authoring guidance reference them.
3. Dependency: leaving these registered endpoints active permits new legacy content after native/HTTP migration. Moving route coverage to canonical HTTP creation exposed reserved-route suffix bypass and older target page lifecycle differences.
4. Repair boundary: remove the two unused public create exports/validators, retain canonical/native/HTTP creation, update caller guidance and use supported creation in route tests. Repair the reserved route check. Backport only the four source depth corrections, page relationship deletion cascade and orphan/default-category handling demonstrated by target test failures; preserve all other target code/catalogs/extensions.
5. Exit check: generated and installed function inventories omit exactly the two retired exports; native/HTTP endpoints remain. Canonical post/page create/read plus page reparent/reorder/deletion paths pass on both sites with cleanup and exact original-data preservation.
