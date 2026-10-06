# Legacy creation callers — October 5, 2026

Removed the unused `createPost` and `createPage` wrappers from the native mutation hooks. The native New post/page routes already use `canonicalDocuments.create`. A source-wide caller search found no users of either wrapper; TypeScript confirms the remaining hook consumers compile. Existing lifecycle and metadata operations remain available.

Validation: Admin `bun run check-types` passed. Existing canonical route test passed (one top-level wrapper). `git diff --check` passed. No backend or installed-site mutation, new runtime acceptance, or full E07 closure is claimed for this deletion.

## Remaining HTTP authoring boundary

1. **Required workflow:** External API creates a post/page, reads its authored body and subsequently updates it; the result opens in native canonical editing and renders on the actual Website.
2. **Evidence:** `convex/http/posts.ts` and `convex/http/pages.ts` call their domain `httpInternals.createInternal` functions. Both insert raw `content` without canonical blocks/version. Their GET DTOs still read `content`; UPDATE still builds legacy content patches. Native hooks are no longer callers of the generic public creation mutations.
3. **Dependency:** Canonical-only native/public dispatch cannot make a newly inserted legacy body usable without deliberate import. Changing creation alone would also leave the HTTP read/update contract incomplete.
4. **Repair boundary:** Coordinate the existing HTTP create/read/update contracts, body conversion/validation, expected-revision handling and API-key authority. Preserve page hierarchy, publication rules and deliberate legacy import. Do not impersonate a native authenticated session or remove functioning HTTP endpoints to pass retirement checks.
5. **Exit check:** API-created post and nested page retain body/metadata through read, edit and stale-write refusal, then open in native canonical editing and render on the actual Website; failed conversion/authority checks leave no partial writes.

Generic public create APIs, deliberate WordPress import, demo seeding and remaining stored legacy schema fields still require separate caller-aware retirement. No schema deletion is justified by this hook cleanup.
