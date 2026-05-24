# Production Human Intervention Log

Last updated: 2026-05-23

## Convex Generated-API TS2589 Cascade (tracked framework limitation)

- System name: All admin Convex backend domains (commerce, commerceSubscriptions, shipping, gallery, membership, profiles, routing, themes, editor, etc.)
- Exact blocker: The Convex generated API + schema-derived union types exceed TypeScript's instantiation depth (TS2589) in strict mode once the API surface passes a moderate size. Affected files carry per-file `@ts-nocheck` or per-line `@ts-expect-error TS2589 …` comments. Convex itself still typechecks at deploy time and the admin web app's `bun run check-types` passes.
- Why human input is required: The fix lives upstream in Convex (smaller generated API types, better union inlining, or a TypeScript depth lift). Locally rewriting every consumer to launder the type through an `as` boundary would be invasive, would not improve runtime correctness, and would re-break on every new mutation.
- What decision/configuration/access is needed: Track the upstream Convex issue, upgrade when Convex publishes a fix, and re-attempt removal of the per-file suppressions then. No code action is required today — `convex deploy`, `bunx tsc --noEmit -p convex/tsconfig.json` and the admin `bun run check-types` all pass; the suppressions exist only to keep editor/IDE strict mode quiet.
- Current risk level: Low (functional code works, suppressions are documented and allowlisted in `ConvexPress-Admin/type-honesty-allowlist.txt`).
- Recommended next action: Monitor `convex` minor releases; on each upgrade run `bun scripts/admin/check-type-honesty.mjs` with a relaxed allowlist to see if the cascade has shrunk, then trim suppressions and allowlist accordingly.

## External Provider Credential QA

- System name: Payments, checkout, tax, shipping providers, subscriptions, AI content generation, email notifications, analytics, GA4, WordPress sync, Airtable sync
- Exact blocker: Full live/sandbox verification requires provider credentials and configured vendor accounts that are not available from the repository alone.
- Why human input is required: Payment, tax, shipping, email, analytics, AI, WordPress, and Airtable integrations depend on real external accounts, secrets, webhook endpoints, sandbox/live mode choices, and sometimes business/legal policy.
- What decision/configuration/access is needed: Confirm sandbox/live credentials, webhook URLs, tax/shipping policy, payment capture/refund rules, AI provider model/key policy, and analytics destinations.
- Current risk level: High
- Recommended next action: Configure sandbox credentials first, run provider-specific end-to-end smoke, then repeat with production credentials before public launch.

## Manual Production Acceptance QA

- System name: All Airtable-listed systems
- Exact blocker: Automated checks cannot fully validate business workflows, content correctness, visual acceptance, real account lifecycle behavior, or vendor-side dashboard state.
- Why human input is required: Production acceptance requires human review of UX, content, compliance, fulfillment/tax/payment behavior, and real-world edge cases.
- What decision/configuration/access is needed: A tester checklist, launch acceptance criteria, test accounts, sample products/orders/content, and approval from the business owner.
- Current risk level: Medium
- Recommended next action: Run a structured human QA pass over the Airtable system list after automated checks pass and after provider credentials are configured.
