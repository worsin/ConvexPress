# Block API content access

Root found that `blocks.getForDocument` trusted published status without enforcing private visibility, passwords or membership rules. The six block mutation handlers and AI editorial query checked update capabilities without checking document ownership. An author could therefore alter another author's blocks through these handlers.

The block APIs now reuse `canEditContent` and `readPublicContent`, the shared page/post policies. Owners with update permission and editors retain editorial access. Public body reads enforce resource/route membership and visibility; this block endpoint has no password exchange and returns null for locked bodies. AI reads and every block mutation reject unauthorized authors before revisions, provider work or content writes.

Actual-handler regressions cover both pages/posts, all six mutation paths, ownership, editor level, inactive users, missing capability, private status/visibility, password, resource membership and route membership. Before the fix: 4 failures / 2 passes. After: 60 tests / 643 assertions pass across block contracts, block access and shared public content tests. Backend TypeScript passes.

Deployed successfully to careful-cormorant-268 and successful-seahorse-672. Live staging checks confirm anonymous protected-page block reads return null, the public homepage returns three blocks, and the authorized operator can read the protected document (which currently uses article content and has zero blocks). This is not a claim of live cross-author mutation testing; that boundary is covered by registered-handler regressions.

Evidence: `output/aster-house/block-access-acceptance.json`; `/tmp/convexpress-block-access-red.log`, `/tmp/convexpress-block-access-green.log`, `/tmp/convexpress-block-access-types.log`; staging/production block-access deploy logs. The separate block usage scalability repair is now deployed; see block-usage-pagination-outcome.md for bounded pagination and exact-versus-partial counts.
