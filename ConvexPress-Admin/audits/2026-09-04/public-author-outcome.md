# Public authors and controller identities

Verified September 6, 2026 UTC in the isolated hardening worktree. Renderer count remains 90/136; the original production objective remains active.

## Implemented and tested

Management principals provide controller authorization and editorial ownership. They are no longer projected as public authors. A shared helper permits active site users, including ordinary internal editors, while excluding management-authenticated or legacy management-role principals and inactive/banned users. Public post/article/card/HTTP reads, Latest Posts, feed enrichment, author feeds, and both public profile lookup paths apply this rule. Controller identities, post ownership, audit information and privileged profile reads remain intact.

An editor can assign an existing active site user through post update. Deleted/inactive/management targets now fail validation before changing the post; the existing editor-level permission remains. Quick Edit queries active users, labels its author control, and explicitly retains an unlisted current author until a different author is selected.

Registered endpoint tests exercise exclusion across posts, HTTP reads, feeds and profile/archive lookup, as well as an eligible ordinary editor. Canonical reader tests cover management/legacy management/ordinary editor transitions. Registered mutation tests reject invalid author targets and verify a valid assignment does not modify the target user's authority. A fixture missing required active status was corrected; an author-update fixture now includes the actual revision module it invokes.

Full backend: 2192 tests, 9108 assertions, 152 files. Backend Convex types, both frontend types and both 19-case generated consumer API fixtures pass. The first generic backend tsc invocation accidentally selected the parent monorepo project and exhausted its default 4GB Node heap; the explicit convex/tsconfig.json check passed. No type check was suppressed. Website production hosting build also passes the existing workerd public/private SSR fixtures.

## Staging acceptance

Captured 1064 files across backend, block catalog, config and site contract. Dry run passed with no index deletions; deployment to careful-cormorant-268 succeeded. Aster House staging identity, auth/storage health and the established media epoch were preserved. Immutable deployment checkpoint: ConvexPress-Admin/output/production-checkpoints/public-author-20260906.

The anonymous Navigation field guide initially displayed all three existing posts without internal management bylines. In real Electron PID45019, Quick Edit assigned Aster Editor to Objects with a place. The card and article now show that author; the other two cards remain visible without a byline. Anonymous RSS and Atom parse successfully, include Aster Editor, and exclude the internal management label. The article's author link reaches the actual Aster Editor archive and displays the assigned article.

MagicTables updated only the Latest Posts Notes field. Read-back proves all136 IDs and all other fields unchanged. Evidence: root output/public-author-20260906, including tracker-verification.json, native/browser snapshots, raw HTML/XML, compiler/test logs and deployment receipt. Screenshots are under root output/playwright/latest-posts90.

## Archive count follow-through and remaining work

The live author archive exposed a stale user-profile count: it displayed zero above one returned published article. Its header now uses the same query total as the listing/pagination and waits for the result before displaying a count. Normal native staging publication succeeded: release nx770j436p9k2m19y8ncqc6hv58dw6am, artifact ba3addad31035c43d439872936f0b91d4f393eeabb6c61c98435a71822fe0d10. Independent HTTP headers identify the expected staging instance. Real anonymous browser now renders Aster Editor, exactly one assigned article, and the matching “1 post” count. Website types and hosting SSR smoke passed.

The administrator's denormalized user postCount is a separate remaining issue: author reassignment does not queue recounts for both authors, and existing posts/profiles recount functions use full collections. A bounded, concurrency-safe count strategy is still needed; this checkpoint does not claim those stored counts are repaired. Existing public listing limits, sparse taxonomy scalability, full SSR author-route acceptance, and full block/migration/production acceptance remain open. No production or Vercel rollout occurred.
