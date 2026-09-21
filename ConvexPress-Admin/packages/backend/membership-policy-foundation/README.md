# Membership policy regression fixtures

Production handlers live in `../convex/membership/policyReads.ts`. This directory is outside the deployable Convex module tree and contains only local regression callers/tests; its compatibility export exists to keep the original staged test imports stable.

Run from the repository root:

`bun test ConvexPress-Admin/packages/backend/membership-policy-foundation/policyReads.test.ts`

The tests use actual registered internal handlers and a minimal schema reusing the production membership tables. Test-only `nested` starts with its own paginated query, then reads rules and both grant statuses through separate internal calls. Test-only `pending` creates a restriction and grant, proves the real shared evaluator allows it within the same transaction, revokes it, proves denial without a cache, and removes the rule.

The framework validates endpoint args/returns and nested transaction visibility. It does not substitute for actual Cloudflare/Convex runtime acceptance or prove server byte accounting. Split/row/byte-budget options are separately asserted through exact handler DB boundaries. Root owns subsequent cloud verification; do not deploy these fixture functions as production API.
