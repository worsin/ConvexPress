# Content access repair — A01, A02, A03

Implemented in `codex/convexpress-hardening`, September 4, 2026. No deployment, provider calls, browser interaction, commits or pushes.

## Revalidation

All three audit findings remained in Claude's handoff. Actual registered-handler regression tests initially produced 27 failures / 2 passes for public post/page DTOs, subscriber draft/password access, membership bypass, feeds, search and page trees. Additional preview/admin-list probes reproduced two more bypasses. The REST internal read-method suite subsequently reproduced 7 failures / 1 pass. No finding was classified as a false positive.

## Repair

- `helpers/publicContent.ts` explicitly lists public SDK fields. Passwords, autosaves, editor prompts and import identifiers never enter the public DTO. Legacy article content, composition blocks, page sections, hero/topics/summary, sources and table of contents share the same password and membership decision. Allowed members and password-verifying readers retain the complete published template data.
- Full editorial reads require active users, the correct post/page capability, ownership or editor-level authority. Capability and role checks honor management-session limits. Ordinary customer sessions cannot read drafts through page getters, page/admin lists or post preview. Public metadata endpoints allow only explicitly public keys.
- Feeds and comment feeds exclude protected sources. Public search and suggestions check the current source instead of trusting stale index status; admin search additionally requires editorial authorization to reveal protected content. Public autocomplete no longer republishes user-supplied search-history strings, which can include private/member-only terms or personal information.
- Page trees, children, parent breadcrumbs, the configured homepage, and REST post/page read methods use the same content policy. REST reads have no editorial user identity, so unpublished data is withheld; REST write methods are untouched.
- Website homepage now uses the SDK's password and membership gate surfaces. Blog content after password verification uses the verified block DTO. Embedded backend membership decisions take precedence over the secondary resource-only access query so route denials cannot be overwritten by a looser decision.

## Verification

- `bun test convex/helpers/__tests__/publicContent.test.ts convex/membership/__tests__/access.test.ts convex/helpers/__tests__/feedContent.test.ts convex/helpers/__tests__/feedUrls.test.ts convex/helpers/__tests__/feedXml.test.ts`: **172 pass, 0 fail, 630 assertions** across five files. Includes 43 real-handler content tests using synthetic in-memory database contexts, positive public/member/editor cases and negative access paths.
- Website `bunx tsc --noEmit --pretty false`: **pass**.
- Website `bun run check:templates`: **pass**, 3 packs / 86 catalog surfaces.
- Site backend `bunx tsc --noEmit --pretty false -p convex/tsconfig.json`: **pass** after revision and appearance integration.
- Scoped `git diff --check`: **pass**.

## Related handoff repair

Website's existing `*.log*` ignore pattern accidentally excluded `auth.login.tsx` and `auth.logout.tsx` in Core, Journal and Depot. Restored all six exact surface files from the original checkout and added narrow ignore exceptions. A file-specific `.gitattributes` whitespace rule preserves the original `.gitignore` CRLF lines without treating their carriage returns as whitespace errors. This fixes fresh-checkout type/pack failures rather than changing login behavior.

## Integration notes

No production data or rendered acceptance was exercised. Root should deploy and verify anonymous/customer/member/editor views, correct/wrong password handling, homepage gates, and membership revocation in the designated isolated test fleet. The source-query checks intentionally deny old search entries after source protection changes; index rebuilding is not a prerequisite for confidentiality. Existing bounded listing/search limits are unchanged.

Final alias regression: both a restriction on `/` and a restriction on the canonical homepage path now apply across homepage, canonical page and password-verification endpoints. Two actual-handler tests reproduced the bypasses before the shared helper enforced both aliases.
